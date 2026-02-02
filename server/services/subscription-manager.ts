import { storage } from '../storage';
import { db } from '../db';
import {
  paymentTransactions,
  subscriptionEvents, dunningManagement, subscriptionNotifications,
  InsertSubscriptionEvent,
  InsertPaymentTransaction,
  InsertDunningManagement, InsertSubscriptionNotification
} from '@shared/schema';
import Stripe from 'stripe';
import { EventEmitter } from 'events';

export interface SubscriptionConfig {
  stripeSecretKey?: string;
  webhookSecret?: string;
  defaultGracePeriodDays?: number;
  defaultDunningAttempts?: number;
}

export interface SubscriptionStatus {
  isActive: boolean;
  status: string;
  daysUntilExpiry?: number;
  gracePeriodActive?: boolean;
  gracePeriodDaysRemaining?: number;
  nextBillingDate?: Date;
  canRenew: boolean;
  canPause: boolean;
  canUpgrade: boolean;
  canDowngrade: boolean;
}

export interface PlanChangeOptions {
  effectiveDate?: Date;
  prorationMode?: 'immediate' | 'next_cycle';
  reason?: string;
  triggeredBy?: string;
}

export interface RenewalResult {
  success: boolean;
  transactionId?: number;
  subscriptionId?: string;
  nextBillingDate?: Date;
  error?: string;
}

/**
 * Enhanced Subscription Manager
 * Handles automatic renewals, plan changes, usage tracking, and subscription lifecycle
 */
export class SubscriptionManager extends EventEmitter {
  private stripe?: Stripe;
  private config: SubscriptionConfig;

  constructor(config: SubscriptionConfig = {}) {
    super();
    this.config = {
      defaultGracePeriodDays: 3,
      defaultDunningAttempts: 3,
      ...config
    };

    if (config.stripeSecretKey) {
      this.stripe = new Stripe(config.stripeSecretKey, {
        apiVersion: '2025-09-30.clover' as any
      });
    }
  }

  /**
   * Initialize Stripe customer and subscription for automatic renewals
   */
  async enableAutomaticRenewal(companyId: number, paymentMethodId?: string): Promise<RenewalResult> {
    try {

      const generalSettings = await storage.getAppSetting('general_settings');
      if (generalSettings?.value) {
        const settings = generalSettings.value as any;
        if (settings.planRenewalEnabled === false) {
          return {
            success: false,
            error: 'Plan renewal is currently disabled by the administrator'
          };
        }
      }

      if (!this.stripe) {
        throw new Error('Stripe not configured');
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        throw new Error('Company not found');
      }

      const plan = await storage.getPlan(company.planId!);
      if (!plan) {
        throw new Error('Company plan not found');
      }

      let stripeCustomerId = company.stripeCustomerId;


      if (!stripeCustomerId) {
        const customer = await this.stripe.customers.create({
          metadata: {
            companyId: companyId.toString(),
            companyName: company.name
          }
        });
        stripeCustomerId = customer.id;

        await storage.updateCompany(companyId, {
          stripeCustomerId: stripeCustomerId
        });
      }


      if (paymentMethodId) {
        await this.stripe.paymentMethods.attach(paymentMethodId, {
          customer: stripeCustomerId
        });

        await this.stripe.customers.update(stripeCustomerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId
          }
        });
      }


      const subscription = await this.stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: plan.name,
              description: plan.description || ''
            },
            unit_amount: Math.round(Number(plan.price) * 100),
            recurring: {
              interval: this.getStripeInterval((plan as any).billingInterval),
              interval_count: this.getStripeIntervalCount((plan as any).billingInterval)
            }
          } as any
        }],
        billing_cycle_anchor: company.billingCycleAnchor ? 
          Math.floor(company.billingCycleAnchor.getTime() / 1000) : undefined,
        metadata: {
          companyId: companyId.toString(),
          planId: plan.id.toString()
        }
      });


      await storage.updateCompany(companyId, {
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: 'active',
        autoRenewal: true,
        subscriptionEndDate: new Date((subscription as any).current_period_end * 1000),
        billingCycleAnchor: new Date((subscription as any).current_period_end * 1000)
      });


      await this.logSubscriptionEvent(companyId, 'automatic_renewal_enabled', {
        subscriptionId: subscription.id,
        customerId: stripeCustomerId
      }, company.subscriptionStatus || 'inactive', 'active', 'system');

      this.emit('subscription:renewal_enabled', { companyId, subscriptionId: subscription.id });

      return {
        success: true,
        subscriptionId: subscription.id,
        nextBillingDate: new Date((subscription as any).current_period_end * 1000)
      };

    } catch (error) {
      console.error('Error enabling automatic renewal:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get Stripe interval for billing interval
   */
  private getStripeInterval(billingInterval: string): 'day' | 'week' | 'month' | 'year' {
    switch (billingInterval) {
      case 'daily':
        return 'day';
      case 'weekly':
      case 'biweekly':
        return 'week';
      case 'monthly':
      case 'quarterly':
      case 'semi_annual':
        return 'month';
      case 'annual':
      case 'biennial':
        return 'year';
      case 'lifetime':
      case 'custom':

        return 'month';

      case 'year':
        return 'year';
      case 'quarter':
        return 'month';
      case 'month':
      default:
        return 'month';
    }
  }

  /**
   * Get Stripe interval count for billing interval
   */
  private getStripeIntervalCount(billingInterval: string): number {
    switch (billingInterval) {
      case 'daily':
        return 1;
      case 'weekly':
        return 1;
      case 'biweekly':
        return 2;
      case 'monthly':
        return 1;
      case 'quarterly':
        return 3;
      case 'semi_annual':
        return 6;
      case 'annual':
        return 1;
      case 'biennial':
        return 2;
      case 'lifetime':
      case 'custom':

        return 1;

      case 'year':
        return 1;
      case 'quarter':
        return 3;
      case 'month':
      default:
        return 1;
    }
  }

  /**
   * Disable automatic renewal
   */
  async disableAutomaticRenewal(companyId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const company = await storage.getCompany(companyId);
      if (!company || !company.stripeSubscriptionId) {
        throw new Error('No active subscription found');
      }

      if (this.stripe) {

        await this.stripe.subscriptions.update(company.stripeSubscriptionId, {
          cancel_at_period_end: true
        });
      }

      await storage.updateCompany(companyId, {
        autoRenewal: false
      });

      await this.logSubscriptionEvent(companyId, 'automatic_renewal_disabled', {
        subscriptionId: company.stripeSubscriptionId
      }, company.subscriptionStatus || 'inactive', company.subscriptionStatus || 'inactive', 'customer');

      this.emit('subscription:renewal_disabled', { companyId });

      return { success: true };

    } catch (error) {
      console.error('Error disabling automatic renewal:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Process automatic renewal for a subscription
   */
  async processAutomaticRenewal(companyId: number): Promise<RenewalResult> {
    try {
      const company = await storage.getCompany(companyId);
      if (!company) {
        throw new Error('Company not found');
      }

      if (!company.autoRenewal || !company.stripeSubscriptionId) {
        return { success: false, error: 'Automatic renewal not enabled' };
      }

      const plan = await storage.getPlan(company.planId!);
      if (!plan) {
        throw new Error('Company plan not found');
      }

      if (!this.stripe) {
        throw new Error('Stripe not configured');
      }


      const subscription = await this.stripe.subscriptions.retrieve(company.stripeSubscriptionId);

      if (subscription.status !== 'active') {

        await this.handleFailedRenewal(companyId, subscription);
        return { success: false, error: 'Subscription not active' };
      }


      const transactionData: InsertPaymentTransaction = {
        companyId,
        planId: company.planId!,
        amount: plan.price,
        currency: 'USD',
        status: 'completed',
        paymentMethod: 'stripe',
        paymentIntentId: subscription.latest_invoice as string,
        isRecurring: true,
        subscriptionPeriodStart: new Date((subscription as any).current_period_start * 1000),
        subscriptionPeriodEnd: new Date((subscription as any).current_period_end * 1000)
      };

      const [transaction] = await db.insert(paymentTransactions).values(transactionData).returning();


      await storage.updateCompany(companyId, {
        subscriptionStatus: 'active',
        subscriptionStartDate: new Date((subscription as any).current_period_start * 1000),
        subscriptionEndDate: new Date((subscription as any).current_period_end * 1000),
        dunningAttempts: 0,
        lastDunningAttempt: null,

        isInTrial: false,
        trialStartDate: null,
        trialEndDate: null
      });


      await this.logSubscriptionEvent(companyId, 'subscription_renewed', {
        transactionId: transaction.id,
        subscriptionId: subscription.id,
        amount: plan.price,
        nextBillingDate: new Date((subscription as any).current_period_end * 1000)
      }, company.subscriptionStatus || 'inactive', 'active', 'system');

      this.emit('subscription:renewed', { 
        companyId, 
        transactionId: transaction.id,
        nextBillingDate: new Date((subscription as any).current_period_end * 1000)
      });

      return {
        success: true,
        transactionId: transaction.id,
        subscriptionId: subscription.id,
        nextBillingDate: new Date((subscription as any).current_period_end * 1000)
      };

    } catch (error) {
      console.error('Error processing automatic renewal:', error);
      await this.handleFailedRenewal(companyId);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Handle failed renewal attempt
   */
  private async handleFailedRenewal(companyId: number, subscription?: Stripe.Subscription): Promise<void> {
    try {
      const company = await storage.getCompany(companyId);
      if (!company) return;

      const plan = await storage.getPlan(company.planId!);
      const maxAttempts = (plan as any)?.maxDunningAttempts || this.config.defaultDunningAttempts || 3;

      const newAttemptCount = (company.dunningAttempts || 0) + 1;
      const gracePeriodDays = (plan as any)?.gracePeriodDays || this.config.defaultGracePeriodDays || 3;

      let newStatus = company.subscriptionStatus;
      let gracePeriodEnd: Date | null = null;

      if (newAttemptCount >= maxAttempts) {

        if (gracePeriodDays > 0) {
          newStatus = 'grace_period';
          gracePeriodEnd = new Date(Date.now() + gracePeriodDays * 24 * 60 * 60 * 1000);
        } else {
          newStatus = 'cancelled';
        }
      } else {
        newStatus = 'past_due';
      }

      await storage.updateCompany(companyId, {
        subscriptionStatus: newStatus,
        dunningAttempts: newAttemptCount,
        lastDunningAttempt: new Date(),
        gracePeriodEnd
      });


      await this.logSubscriptionEvent(companyId, 'renewal_failed', {
        attemptNumber: newAttemptCount,
        maxAttempts,
        subscriptionId: subscription?.id,
        gracePeriodEnd
      }, company.subscriptionStatus || 'inactive', newStatus, 'system');


      if (newAttemptCount < maxAttempts) {
        await this.scheduleDunningAttempt(companyId, newAttemptCount + 1);
      }

      this.emit('subscription:renewal_failed', { 
        companyId, 
        attemptNumber: newAttemptCount,
        status: newStatus
      });

    } catch (error) {
      console.error('Error handling failed renewal:', error);
    }
  }

  /**
   * Schedule a dunning attempt
   */
  private async scheduleDunningAttempt(companyId: number, attemptNumber: number): Promise<void> {
    try {

      const daysToWait = attemptNumber === 1 ? 1 : attemptNumber === 2 ? 3 : 7;
      const nextAttemptDate = new Date(Date.now() + daysToWait * 24 * 60 * 60 * 1000);

      const dunningData: InsertDunningManagement = {
        companyId,
        attemptNumber,
        attemptType: 'email',
        status: 'pending',
        nextAttemptDate
      };

      await db.insert(dunningManagement).values(dunningData);


      await this.scheduleNotification(companyId, 'payment_failed', nextAttemptDate, {
        attemptNumber,
        nextAttemptDate
      });

    } catch (error) {
      console.error('Error scheduling dunning attempt:', error);
    }
  }

  /**
   * Log subscription event for audit trail
   */
  async logSubscriptionEvent(
    companyId: number,
    eventType: string,
    eventData: any,
    previousStatus?: string,
    newStatus?: string,
    triggeredBy?: string
  ): Promise<void> {
    try {
      const eventRecord: InsertSubscriptionEvent = {
        companyId,
        eventType,
        eventData,
        previousStatus,
        newStatus,
        triggeredBy
      };

      await db.insert(subscriptionEvents).values(eventRecord);
    } catch (error) {
      console.error('Error logging subscription event:', error);
    }
  }

  /**
   * Schedule a notification
   */
  async scheduleNotification(
    companyId: number,
    notificationType: string,
    scheduledFor: Date,
    notificationData: any
  ): Promise<void> {
    try {
      const notificationRecord: InsertSubscriptionNotification = {
        companyId,
        notificationType,
        scheduledFor,
        notificationData,
        status: 'pending'
      };

      await db.insert(subscriptionNotifications).values(notificationRecord);
    } catch (error) {
      console.error('Error scheduling notification:', error);
    }
  }

  /**
   * Get comprehensive subscription status
   */
  async getSubscriptionStatus(companyId: number): Promise<SubscriptionStatus> {
    try {
      const company = await storage.getCompany(companyId);
      if (!company) {
        throw new Error('Company not found');
      }

      const plan = await storage.getPlan(company.planId!);
      const now = new Date();

      let daysUntilExpiry: number | undefined;
      let gracePeriodDaysRemaining: number | undefined;
      let nextBillingDate: Date | undefined;

      if (company.subscriptionEndDate) {
        daysUntilExpiry = Math.ceil((company.subscriptionEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }

      if (company.gracePeriodEnd) {
        gracePeriodDaysRemaining = Math.ceil((company.gracePeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }

      if (company.stripeSubscriptionId && this.stripe) {
        try {
          const subscription = await this.stripe.subscriptions.retrieve(company.stripeSubscriptionId);
          nextBillingDate = new Date((subscription as any).current_period_end * 1000);
        } catch (error) {
          console.error('Error fetching Stripe subscription:', error);
        }
      }


      const isActive = ['active', 'trial'].includes(company.subscriptionStatus || '');
      const gracePeriodActive = company.subscriptionStatus === 'grace_period';

      return {
        isActive,
        status: company.subscriptionStatus || 'inactive',
        daysUntilExpiry,
        gracePeriodActive,
        gracePeriodDaysRemaining,
        nextBillingDate,
        canRenew: !isActive || company.subscriptionStatus === 'grace_period',
        canPause: (plan as any)?.allowPausing && isActive && company.subscriptionStatus !== 'paused',
        canUpgrade: isActive,
        canDowngrade: isActive
      };

    } catch (error) {
      console.error('Error getting subscription status:', error);
      return {
        isActive: false,
        status: 'error',
        canRenew: false,
        canPause: false,
        canUpgrade: false,
        canDowngrade: false
      };
    }
  }
}

export const subscriptionManager = new SubscriptionManager();
