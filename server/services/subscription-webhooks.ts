import Stripe from 'stripe';
import { storage } from '../storage';
import { db } from '../db';
import { 
  companies, 
  paymentTransactions,
  InsertPaymentTransaction
} from '@shared/schema';
import { eq } from 'drizzle-orm';
import { subscriptionManager } from './subscription-manager';
import { logger } from '../utils/logger';

export interface WebhookConfig {
  stripeSecretKey: string;
  webhookSecret: string;
}

/**
 * Subscription Webhook Handler
 * Processes Stripe webhook events for subscription management
 */
export class SubscriptionWebhookHandler {
  private stripe: Stripe;
  private webhookSecret: string;

  constructor(config: WebhookConfig) {
    this.stripe = new Stripe(config.stripeSecretKey, {
      apiVersion: '2025-09-30.clover' as any
    });
    this.webhookSecret = config.webhookSecret;
  }

  /**
   * Verify and process Stripe webhook
   */
  async processWebhook(body: string | Buffer, signature: string): Promise<{ success: boolean; error?: string }> {
    try {

      const event = this.stripe.webhooks.constructEvent(body, signature, this.webhookSecret);
      
      logger.info('subscription-webhooks', `Processing webhook event: ${event.type}`);


      await this.handleWebhookEvent(event);

      return { success: true };

    } catch (error) {
      logger.error('subscription-webhooks', 'Webhook processing error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Handle different types of webhook events
   */
  private async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.created':
        await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.upcoming':
        await this.handleUpcomingInvoice(event.data.object as Stripe.Invoice);
        break;

      default:
        logger.info('subscription-webhooks', `Unhandled webhook event type: ${event.type}`);
    }
  }

  /**
   * Handle successful invoice payment
   */
  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    try {
      if (!(invoice as any).subscription) {
        logger.info('subscription-webhooks', 'Invoice not associated with subscription, skipping');
        return;
      }

      const subscription = await this.stripe.subscriptions.retrieve((invoice as any).subscription as string);
      const companyId = parseInt(subscription.metadata.companyId || '0');

      if (!companyId) {
        logger.error('subscription-webhooks', 'No company ID found in subscription metadata');
        return;
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        logger.error('subscription-webhooks', `Company not found: ${companyId}`);
        return;
      }

      const plan = await storage.getPlan(company.planId!);
      if (!plan) {
        logger.error('subscription-webhooks', `Plan not found for company: ${companyId}`);
        return;
      }


      const transactionData: InsertPaymentTransaction = {
        companyId,
        planId: company.planId!,
        amount: (invoice.amount_paid / 100).toString(), // Convert from cents
        currency: invoice.currency.toUpperCase(),
        status: 'completed',
        paymentMethod: 'stripe',
        paymentIntentId: (invoice as any).payment_intent as string,
        externalTransactionId: invoice.id,
        receiptUrl: invoice.hosted_invoice_url,
        isRecurring: true,
        subscriptionPeriodStart: new Date((subscription as any).current_period_start * 1000),
        subscriptionPeriodEnd: new Date((subscription as any).current_period_end * 1000),
        metadata: {
          stripeInvoiceId: invoice.id,
          stripeSubscriptionId: subscription.id
        }
      };

      const [transaction] = await db.insert(paymentTransactions).values(transactionData).returning();


      await storage.updateCompany(companyId, {
        subscriptionStatus: 'active',
        subscriptionStartDate: new Date((subscription as any).current_period_start * 1000),
        subscriptionEndDate: new Date((subscription as any).current_period_end * 1000),
        dunningAttempts: 0,
        lastDunningAttempt: null,
        gracePeriodEnd: null,

        isInTrial: false,
        trialStartDate: null,
        trialEndDate: null
      });


      await subscriptionManager.logSubscriptionEvent(
        companyId,
        'payment_succeeded',
        {
          transactionId: transaction.id,
          invoiceId: invoice.id,
          amount: invoice.amount_paid / 100,
          subscriptionId: subscription.id
        },
        company.subscriptionStatus || 'inactive',
        'active',
        'stripe_webhook'
      );

      logger.info('subscription-webhooks', `Payment succeeded for company ${companyId}, transaction ${transaction.id}`);

    } catch (error) {
      logger.error('subscription-webhooks', 'Error handling payment succeeded:', error);
      throw error;
    }
  }

  /**
   * Handle failed invoice payment
   */
  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    try {
      if (!(invoice as any).subscription) {
        logger.info('subscription-webhooks', 'Invoice not associated with subscription, skipping');
        return;
      }

      const subscription = await this.stripe.subscriptions.retrieve((invoice as any).subscription as string);
      const companyId = parseInt(subscription.metadata.companyId || '0');

      if (!companyId) {
        logger.error('subscription-webhooks', 'No company ID found in subscription metadata');
        return;
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        logger.error('subscription-webhooks', `Company not found: ${companyId}`);
        return;
      }


      const transactionData: InsertPaymentTransaction = {
        companyId,
        planId: company.planId!,
        amount: (invoice.amount_due / 100).toString(),
        currency: invoice.currency.toUpperCase(),
        status: 'failed',
        paymentMethod: 'stripe',
        externalTransactionId: invoice.id,
        isRecurring: true,
        subscriptionPeriodStart: new Date((subscription as any).current_period_start * 1000),
        subscriptionPeriodEnd: new Date((subscription as any).current_period_end * 1000),
        dunningAttempt: invoice.attempt_count || 1,
        metadata: {
          stripeInvoiceId: invoice.id,
          stripeSubscriptionId: subscription.id,
          failureReason: invoice.last_finalization_error?.message
        }
      };

      await db.insert(paymentTransactions).values(transactionData);


      const newDunningAttempts = (company.dunningAttempts || 0) + 1;
      await storage.updateCompany(companyId, {
        subscriptionStatus: 'past_due',
        dunningAttempts: newDunningAttempts,
        lastDunningAttempt: new Date()
      });


      await subscriptionManager.logSubscriptionEvent(
        companyId,
        'payment_failed',
        {
          invoiceId: invoice.id,
          amount: invoice.amount_due / 100,
          subscriptionId: subscription.id,
          attemptCount: invoice.attempt_count,
          failureReason: invoice.last_finalization_error?.message
        },
        company.subscriptionStatus || 'inactive',
        'past_due',
        'stripe_webhook'
      );


      await subscriptionManager.scheduleNotification(
        companyId,
        'payment_failed',
        new Date(), // Send immediately
        {
          invoiceId: invoice.id,
          amount: invoice.amount_due / 100,
          attemptCount: invoice.attempt_count
        }
      );

      logger.info('subscription-webhooks', `Payment failed for company ${companyId}, attempt ${invoice.attempt_count}`);

    } catch (error) {
      logger.error('subscription-webhooks', 'Error handling payment failed:', error);
      throw error;
    }
  }

  /**
   * Handle subscription updates
   */
  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    try {
      const companyId = parseInt(subscription.metadata.companyId || '0');

      if (!companyId) {
        logger.error('subscription-webhooks', 'No company ID found in subscription metadata');
        return;
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        logger.error('subscription-webhooks', `Company not found: ${companyId}`);
        return;
      }


      let newStatus = company.subscriptionStatus || 'inactive';
      
      switch (subscription.status) {
        case 'active':
          newStatus = 'active';
          break;
        case 'past_due':
          newStatus = 'past_due';
          break;
        case 'canceled':
          newStatus = 'cancelled';
          break;
        case 'unpaid':
          newStatus = 'overdue';
          break;
      }

      await storage.updateCompany(companyId, {
        subscriptionStatus: newStatus,
        subscriptionEndDate: new Date((subscription as any).current_period_end * 1000),
        stripeSubscriptionId: subscription.id
      });


      await subscriptionManager.logSubscriptionEvent(
        companyId,
        'subscription_updated',
        {
          subscriptionId: subscription.id,
          status: subscription.status,
          currentPeriodEnd: (subscription as any).current_period_end
        },
        company.subscriptionStatus || 'inactive',
        newStatus,
        'stripe_webhook'
      );

      logger.info('subscription-webhooks', `Subscription updated for company ${companyId}, status: ${subscription.status}`);

    } catch (error) {
      logger.error('subscription-webhooks', 'Error handling subscription updated:', error);
      throw error;
    }
  }

  /**
   * Handle subscription deletion
   */
  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    try {
      const companyId = parseInt(subscription.metadata.companyId || '0');

      if (!companyId) {
        logger.error('subscription-webhooks', 'No company ID found in subscription metadata');
        return;
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        logger.error('subscription-webhooks', `Company not found: ${companyId}`);
        return;
      }


      await storage.updateCompany(companyId, {
        subscriptionStatus: 'cancelled',
        stripeSubscriptionId: null,
        autoRenewal: false
      });


      await subscriptionManager.logSubscriptionEvent(
        companyId,
        'subscription_cancelled',
        {
          subscriptionId: subscription.id,
          canceledAt: subscription.canceled_at
        },
        company.subscriptionStatus || 'inactive',
        'cancelled',
        'stripe_webhook'
      );

      logger.info('subscription-webhooks', `Subscription cancelled for company ${companyId}`);

    } catch (error) {
      logger.error('subscription-webhooks', 'Error handling subscription deleted:', error);
      throw error;
    }
  }

  /**
   * Handle subscription creation
   */
  private async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
    try {
      const companyId = parseInt(subscription.metadata.companyId || '0');

      if (!companyId) {
        logger.error('subscription-webhooks', 'No company ID found in subscription metadata');
        return;
      }


      await storage.updateCompany(companyId, {
        stripeSubscriptionId: subscription.id,
        subscriptionEndDate: new Date((subscription as any).current_period_end * 1000),
        autoRenewal: true
      });


      await subscriptionManager.logSubscriptionEvent(
        companyId,
        'subscription_created',
        {
          subscriptionId: subscription.id,
          status: subscription.status
        },
        undefined,
        'active',
        'stripe_webhook'
      );

      logger.info('subscription-webhooks', `Subscription created for company ${companyId}: ${subscription.id}`);

    } catch (error) {
      logger.error('subscription-webhooks', 'Error handling subscription created:', error);
      throw error;
    }
  }

  /**
   * Handle upcoming invoice (for notifications)
   */
  private async handleUpcomingInvoice(invoice: Stripe.Invoice): Promise<void> {
    try {
      if (!(invoice as any).subscription) {
        return;
      }

      const subscription = await this.stripe.subscriptions.retrieve((invoice as any).subscription as string);
      const companyId = parseInt(subscription.metadata.companyId || '0');

      if (!companyId) {
        return;
      }


      const notificationDate = new Date(invoice.period_end * 1000 - 3 * 24 * 60 * 60 * 1000);

      await subscriptionManager.scheduleNotification(
        companyId,
        'subscription_renewal_upcoming',
        notificationDate,
        {
          invoiceId: invoice.id,
          amount: invoice.amount_due / 100,
          renewalDate: new Date(invoice.period_end * 1000)
        }
      );

      logger.info('subscription-webhooks', `Scheduled renewal notification for company ${companyId}`);

    } catch (error) {
      logger.error('subscription-webhooks', 'Error handling upcoming invoice:', error);
      throw error;
    }
  }
}
