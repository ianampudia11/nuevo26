import { Router } from 'express';
import { z } from 'zod';
import Stripe from 'stripe';
import paypal from '@paypal/checkout-server-sdk';
import { storage } from '../storage';
import { db } from '../db';
import {
  companies,
  subscriptionEvents
} from '@shared/schema';
import { eq, desc, count } from 'drizzle-orm';
import { subscriptionManager } from '../services/subscription-manager';
import { subscriptionScheduler } from '../services/subscription-scheduler';
import { SubscriptionWebhookHandler } from '../services/subscription-webhooks';
import { prorationService } from '../services/proration-service';
import { gracePeriodService } from '../services/grace-period-service';
import { usageTrackingService } from '../services/usage-tracking-service';
import { dunningService } from '../services/dunning-service';
import { subscriptionPausingService } from '../services/subscription-pausing-service';
import { planDowngradeService } from '../services/plan-downgrade-service';

/**
 * Validates that the originUrl is safe to use
 * Ensures it's a valid URL with http/https protocol and prevents open redirects
 */
function validateOriginUrl(originUrl: string): string | null {
  try {
    const url = new URL(originUrl);
    

    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }
    

    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}
import { ensureAuthenticated, ensureSuperAdmin } from '../middleware';
import { logger } from '../utils/logger';

const router = Router();

const PAYSTACK_SUPPORTED_CURRENCIES = ['NGN', 'GHS', 'ZAR', 'USD'];


const enableRenewalSchema = z.object({
  paymentMethodId: z.string().optional()
});

const planChangeSchema = z.object({
  planId: z.number().int().positive(),
  effectiveDate: z.string().datetime().optional(),
  prorationMode: z.enum(['immediate', 'next_cycle']).default('immediate'),
  reason: z.string().optional()
});

const pauseSubscriptionSchema = z.object({
  pauseUntil: z.string().datetime().optional(),
  reason: z.string().optional()
});

/**
 * Get comprehensive subscription status
 */
router.get('/status', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const status = await subscriptionManager.getSubscriptionStatus(companyId);
    res.json(status);

  } catch (error) {
    logger.error('enhanced-subscription', 'Error getting subscription status:', error);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

/**
 * Enable automatic renewal
 */
router.post('/enable-renewal', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const validation = enableRenewalSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validation.error.errors
      });
    }

    const { paymentMethodId } = validation.data;


    const stripeSettings = await storage.getAppSetting('payment_stripe');
    if (!stripeSettings?.value) {
      return res.status(400).json({ error: 'Stripe not configured' });
    }

    const stripeConfig = stripeSettings.value as any;
    subscriptionManager['stripe'] = require('stripe')(stripeConfig.secretKey);

    const result = await subscriptionManager.enableAutomaticRenewal(companyId, paymentMethodId);

    if (result.success) {
      res.json({
        success: true,
        message: 'Automatic renewal enabled successfully',
        subscriptionId: result.subscriptionId,
        nextBillingDate: result.nextBillingDate
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    logger.error('enhanced-subscription', 'Error enabling automatic renewal:', error);
    res.status(500).json({ error: 'Failed to enable automatic renewal' });
  }
});

/**
 * Disable automatic renewal
 */
router.post('/disable-renewal', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const result = await subscriptionManager.disableAutomaticRenewal(companyId);

    if (result.success) {
      res.json({
        success: true,
        message: 'Automatic renewal disabled successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    logger.error('enhanced-subscription', 'Error disabling automatic renewal:', error);
    res.status(500).json({ error: 'Failed to disable automatic renewal' });
  }
});

/**
 * Manual subscription renewal
 */
const renewalSchema = z.object({
  paymentMethod: z.string().min(1, 'Payment method is required'),
  enableAutoRenewal: z.boolean().default(false),
  planId: z.number().int().positive().optional(),
  originUrl: z.string().optional()
});

/**
 * SECURITY CRITICAL: Initiate subscription renewal with payment verification
 * This endpoint creates a payment session instead of directly renewing
 * Now supports multiple payment methods with proper validation
 */
router.post('/initiate-renewal', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }


    const validation = renewalSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validation.error.errors
      });
    }

    const { paymentMethod, enableAutoRenewal, planId, originUrl } = validation.data;


    const generalSettings = await storage.getAppSetting('general_settings');
    if (generalSettings?.value) {
      const settings = generalSettings.value as any;
      if (settings.planRenewalEnabled === false) {
        return res.status(403).json({ 
          error: 'Plan renewal is currently disabled by the administrator',
          message: 'Please contact support for assistance with your subscription'
        });
      }
    }

    const company = await storage.getCompany(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }


    let targetPlanId = planId || company.planId;
    if (!targetPlanId) {
      return res.status(400).json({ error: 'No plan specified for renewal' });
    }


    const plan = await storage.getPlan(targetPlanId);
    if (!plan) {
      return res.status(404).json({ error: 'Target plan not found' });
    }


    if (!plan.isActive) {
      return res.status(400).json({ error: 'Selected plan is not available' });
    }


    const outstandingBalance = await checkOutstandingBalance(companyId);
    if (outstandingBalance > 0) {
      return res.status(402).json({ 
        error: 'OUTSTANDING_BALANCE',
        message: `You have an outstanding balance of $${outstandingBalance.toFixed(2)}. Please pay all outstanding amounts before renewing.`,
        outstandingBalance 
      });
    }


    const paymentMethodKey = paymentMethod.replace('-', '_');
    const paymentMethodConfig = await storage.getAppSetting(`payment_${paymentMethodKey}`);
    if (!paymentMethodConfig?.value || !(paymentMethodConfig.value as any).enabled) {
      return res.status(400).json({ 
        error: 'PAYMENT_METHOD_NOT_AVAILABLE',
        message: `${paymentMethod} is not currently available. Please select a different payment method.`
      });
    }

    let paymentSession: { id: string; url: string } | null = null;


    switch (paymentMethod) {
      case 'stripe':
        paymentSession = await createStripePaymentSession(company, plan, enableAutoRenewal);
        break;
      case 'moyasar':
        paymentSession = await createMoyasarPaymentSession(company, plan, enableAutoRenewal);
        break;
      case 'paypal':
        paymentSession = await createPayPalPaymentSession(company, plan, enableAutoRenewal, originUrl);
        break;
      case 'mercadopago':
        paymentSession = await createMercadoPagoPaymentSession(req, company, plan, enableAutoRenewal, originUrl);
        break;
      case 'paystack':
        paymentSession = await createPaystackPaymentSession(company, plan, enableAutoRenewal, originUrl);
        break;
      case 'bank-transfer':

        const bankTransferResult = await handleBankTransferRenewal(company, plan, req.user.email);
        return res.json({
          success: true,
          message: 'Please complete the bank transfer to renew your subscription.',
          paymentMethod: 'bank-transfer',
          bankDetails: bankTransferResult.bankDetails,
          transactionId: bankTransferResult.transactionId
        });
      default:
        return res.status(400).json({ 
          error: 'UNSUPPORTED_PAYMENT_METHOD',
          message: `Payment method '${paymentMethod}' is not supported.`
        });
    }

    if (!paymentSession) {
      return res.status(500).json({ 
        error: 'PAYMENT_SESSION_FAILED',
        message: 'Failed to create payment session. Please try again.' 
      });
    }


    await logSubscriptionEvent(companyId, 'payment_initiated', {
      planId: plan.id,
      originalPlanId: company.planId,
      amount: plan.price,
      paymentMethod,
      enableAutoRenewal,
      sessionId: paymentSession.id,
      isPlanChange: planId && planId !== company.planId
    });

    res.json({
      success: true,
      paymentUrl: paymentSession.url,
      sessionId: paymentSession.id,
      amount: plan.price,
      paymentMethod,
      message: 'Payment verification required. You will be redirected to complete payment.'
    });

  } catch (error: any) {
    logger.error('enhanced-subscription', 'Failed to initiate subscription renewal:', error);
    res.status(500).json({ 
      error: 'RENEWAL_INITIATION_FAILED',
      message: 'Failed to initiate subscription renewal. Please try again.' 
    });
  }
});

/**
 * DEPRECATED - SECURITY RISK: Direct renewal without payment
 * This endpoint is now disabled for security reasons
 */
router.post('/renew', ensureAuthenticated, async (req: any, res) => {

  return res.status(403).json({ 
    error: 'DIRECT_RENEWAL_BLOCKED',
    message: 'Direct subscription renewal is not allowed. Payment verification is required.',
    action: 'Use /initiate-renewal endpoint instead'
  });
});

/**
 * Calculate proration for plan change
 */
router.post('/calculate-proration', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const { planId, effectiveDate } = req.body;

    if (!planId) {
      return res.status(400).json({ error: 'Plan ID required' });
    }


    const targetPlan = await storage.getPlan(planId);
    if (!targetPlan) {
      return res.status(404).json({ error: 'Target plan not found' });
    }


    const prorationCalculation = await prorationService.calculateProration(
      companyId,
      planId,
      effectiveDate ? new Date(effectiveDate) : new Date()
    );

    res.json({
      success: true,
      proration: prorationCalculation,
      targetPlan: {
        id: targetPlan.id,
        name: targetPlan.name,
        price: targetPlan.price
      }
    });

  } catch (error) {
    logger.error('enhanced-subscription', 'Error calculating proration:', error);
    res.status(500).json({ error: 'Failed to calculate proration' });
  }
});

/**
 * Change subscription plan
 */
router.post('/change-plan', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const validation = planChangeSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: validation.error.errors
      });
    }

    const { planId, effectiveDate, prorationMode, reason } = validation.data;


    const targetPlan = await storage.getPlan(planId);
    if (!targetPlan) {
      return res.status(404).json({ error: 'Target plan not found' });
    }


    const company = await storage.getCompany(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    if (company.planId === planId) {
      return res.status(400).json({ error: 'Company is already on this plan' });
    }


    if (!targetPlan.isActive) {
      return res.status(400).json({ error: 'Target plan is not available' });
    }


    if (company.subscriptionStatus === 'cancelled') {
      return res.status(400).json({
        error: 'Cannot change plan for cancelled subscription. Please reactivate first.'
      });
    }


    const result = await prorationService.changePlan(companyId, planId, {
      effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
      prorationMode,
      reason,
      triggeredBy: 'customer'
    });

    if (result.success) {

      if (prorationMode === 'immediate') {
        try {

          const updatedCompany = await storage.getCompany(companyId);
          if (updatedCompany && (global as any).broadcastToCompany) {

            (global as any).broadcastToCompany({
              type: 'plan_updated',
              data: {
                companyId,
                newPlan: updatedCompany.plan,
                planId: updatedCompany.planId,
                timestamp: new Date().toISOString(),
                changeType: 'immediate'
              }
            }, companyId);
          }
        } catch (broadcastError) {
          console.error('Error broadcasting plan update:', broadcastError);

        }
      }

      res.json({
        success: true,
        message: prorationMode === 'immediate' ?
          'Plan changed successfully' :
          'Plan change scheduled successfully',
        changeId: result.changeId,
        newPlan: targetPlan.name,
        prorationCalculation: result.prorationCalculation,
        transactionId: result.transactionId
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    logger.error('enhanced-subscription', 'Error changing plan:', error);


    let errorMessage = 'Failed to change plan';
    let statusCode = 500;

    if (error instanceof Error) {
      if (error.message.includes('Company not found')) {
        errorMessage = 'Company not found';
        statusCode = 404;
      } else if (error.message.includes('Plan not found')) {
        errorMessage = 'Target plan not found';
        statusCode = 404;
      } else if (error.message.includes('already on this plan')) {
        errorMessage = 'Company is already on this plan';
        statusCode = 400;
      } else if (error.message.includes('insufficient funds') || error.message.includes('payment')) {
        errorMessage = 'Payment processing failed';
        statusCode = 402;
      } else {
        errorMessage = error.message;
      }
    }

    res.status(statusCode).json({
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
});

/**
 * Pause subscription
 */
router.post('/pause', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const validation = pauseSubscriptionSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: validation.error.errors
      });
    }

    const { pauseUntil, reason } = validation.data;

    const result = await subscriptionPausingService.pauseSubscription(companyId, {
      pauseUntil: pauseUntil ? new Date(pauseUntil) : undefined,
      reason,
      preserveData: true,
      notifyOnResume: true
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Subscription paused successfully',
        pauseEndDate: result.pauseEndDate
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    logger.error('enhanced-subscription', 'Error pausing subscription:', error);
    res.status(500).json({ error: 'Failed to pause subscription' });
  }
});

/**
 * Resume paused subscription
 */
router.post('/resume', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const result = await subscriptionPausingService.resumeSubscription(companyId, 'customer_request');

    if (result.success) {
      res.json({
        success: true,
        message: 'Subscription resumed successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    logger.error('enhanced-subscription', 'Error resuming subscription:', error);
    res.status(500).json({ error: 'Failed to resume subscription' });
  }
});

/**
 * Get pause status
 */
router.get('/pause/status', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const pauseStatus = await subscriptionPausingService.getPauseStatus(companyId);
    res.json(pauseStatus);

  } catch (error) {
    logger.error('enhanced-subscription', 'Error getting pause status:', error);
    res.status(500).json({ error: 'Failed to get pause status' });
  }
});

/**
 * Check if subscription can be paused
 */
router.get('/pause/can-pause', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const canPause = await subscriptionPausingService.canPauseSubscription(companyId);
    res.json(canPause);

  } catch (error) {
    logger.error('enhanced-subscription', 'Error checking pause eligibility:', error);
    res.status(500).json({ error: 'Failed to check pause eligibility' });
  }
});

/**
 * Extend pause duration
 */
router.post('/pause/extend', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const { additionalDays, reason } = req.body;

    if (!additionalDays || additionalDays <= 0) {
      return res.status(400).json({ error: 'Additional days must be a positive number' });
    }

    const result = await subscriptionPausingService.extendPause(companyId, additionalDays, reason);

    if (result.success) {
      res.json({
        success: true,
        message: 'Pause extended successfully',
        newPauseEndDate: result.pauseEndDate
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    logger.error('enhanced-subscription', 'Error extending pause:', error);
    res.status(500).json({ error: 'Failed to extend pause' });
  }
});

/**
 * Preview plan downgrade impact
 */
router.post('/downgrade/preview', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const { targetPlanId } = req.body;

    if (!targetPlanId) {
      return res.status(400).json({ error: 'Target plan ID required' });
    }

    const preview = await planDowngradeService.previewDowngrade(companyId, targetPlanId);
    res.json(preview);

  } catch (error) {
    logger.error('enhanced-subscription', 'Error previewing downgrade:', error);
    res.status(500).json({ error: 'Failed to preview downgrade' });
  }
});

/**
 * Execute plan downgrade
 */
router.post('/downgrade/execute', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const {
      targetPlanId,
      preserveData = true,
      notifyUsers = true,
      gracePeriodDays = 7,
      reason = 'customer_request'
    } = req.body;

    if (!targetPlanId) {
      return res.status(400).json({ error: 'Target plan ID required' });
    }

    const result = await planDowngradeService.executeDowngrade(companyId, targetPlanId, {
      preserveData,
      notifyUsers,
      gracePeriodDays,
      reason
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Plan downgraded successfully',
        restrictedFeatures: result.restrictedFeatures,
        dataActions: result.dataActions
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    logger.error('enhanced-subscription', 'Error executing downgrade:', error);
    res.status(500).json({ error: 'Failed to execute downgrade' });
  }
});

/**
 * Get grace period status
 */
router.get('/grace-period/status', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const status = await gracePeriodService.getGracePeriodStatus(companyId);
    res.json(status);

  } catch (error) {
    logger.error('enhanced-subscription', 'Error getting grace period status:', error);
    res.status(500).json({ error: 'Failed to get grace period status' });
  }
});

/**
 * Check if feature is allowed during grace period
 */
router.get('/grace-period/feature/:feature', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const { feature } = req.params;
    if (!feature) {
      return res.status(400).json({ error: 'Feature name required' });
    }

    const isAllowed = await gracePeriodService.isFeatureAllowed(companyId, feature);

    res.json({
      feature,
      allowed: isAllowed
    });

  } catch (error) {
    logger.error('enhanced-subscription', 'Error checking feature access:', error);
    res.status(500).json({ error: 'Failed to check feature access' });
  }
});

/**
 * Recover from grace period (manual payment)
 */
router.post('/grace-period/recover', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const { transactionId } = req.body;


    const status = await gracePeriodService.getGracePeriodStatus(companyId);
    if (!status.isInGracePeriod) {
      return res.status(400).json({ error: 'Company is not in grace period' });
    }

    await gracePeriodService.recoverFromGracePeriod(companyId, transactionId);

    res.json({
      success: true,
      message: 'Successfully recovered from grace period'
    });

  } catch (error) {
    logger.error('enhanced-subscription', 'Error recovering from grace period:', error);
    res.status(500).json({ error: 'Failed to recover from grace period' });
  }
});

/**
 * Get usage status
 */
router.get('/usage/status', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const usageStatus = await usageTrackingService.getUsageStatus(companyId);
    res.json(usageStatus);

  } catch (error) {
    logger.error('enhanced-subscription', 'Error getting usage status:', error);
    res.status(500).json({ error: 'Failed to get usage status' });
  }
});

/**
 * Check if usage is allowed for a metric
 */
router.get('/usage/check/:metric', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const { metric } = req.params;
    const requestedAmount = parseInt(req.query.amount as string) || 1;

    if (!metric) {
      return res.status(400).json({ error: 'Metric name required' });
    }

    const isAllowed = await usageTrackingService.isUsageAllowed(companyId, metric, requestedAmount);

    res.json({
      metric,
      requestedAmount,
      allowed: isAllowed
    });

  } catch (error) {
    logger.error('enhanced-subscription', 'Error checking usage allowance:', error);
    res.status(500).json({ error: 'Failed to check usage allowance' });
  }
});

/**
 * Update usage for a metric
 */
router.post('/usage/update', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const { metric, increment = 1 } = req.body;

    if (!metric) {
      return res.status(400).json({ error: 'Metric name required' });
    }

    const result = await usageTrackingService.updateUsage(companyId, metric, increment);

    if (result.success) {
      res.json({
        success: true,
        metric,
        newUsage: result.newUsage,
        limitReached: result.limitReached,
        warningTriggered: result.warningTriggered,
        blocked: result.blocked
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    logger.error('enhanced-subscription', 'Error updating usage:', error);
    res.status(500).json({ error: 'Failed to update usage' });
  }
});

/**
 * Get dunning status
 */
router.get('/dunning/status', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const dunningStatus = await dunningService.getDunningStatus(companyId);
    res.json(dunningStatus);

  } catch (error) {
    logger.error('enhanced-subscription', 'Error getting dunning status:', error);
    res.status(500).json({ error: 'Failed to get dunning status' });
  }
});

/**
 * Cancel dunning process (admin only)
 */
router.post('/admin/dunning/:companyId/cancel', ensureSuperAdmin, async (req: any, res) => {
  try {
    const { companyId } = req.params;
    const { reason = 'admin_cancellation' } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    await dunningService.cancelDunningProcess(parseInt(companyId), reason);

    res.json({
      success: true,
      message: 'Dunning process cancelled successfully'
    });

  } catch (error) {
    logger.error('enhanced-subscription', 'Error cancelling dunning process:', error);
    res.status(500).json({ error: 'Failed to cancel dunning process' });
  }
});

/**
 * Start dunning process manually (admin only)
 */
router.post('/admin/dunning/:companyId/start', ensureSuperAdmin, async (req: any, res) => {
  try {
    const { companyId } = req.params;
    const { paymentTransactionId, reason = 'manual_start' } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    await dunningService.startDunningProcess(parseInt(companyId), paymentTransactionId, reason);

    res.json({
      success: true,
      message: 'Dunning process started successfully'
    });

  } catch (error) {
    logger.error('enhanced-subscription', 'Error starting dunning process:', error);
    res.status(500).json({ error: 'Failed to start dunning process' });
  }
});

/**
 * Get subscription events (audit trail)
 */
router.get('/events', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;


    
    res.json({
      events: [],
      total: 0,
      limit,
      offset
    });

  } catch (error) {
    logger.error('enhanced-subscription', 'Error getting subscription events:', error);
    res.status(500).json({ error: 'Failed to get subscription events' });
  }
});

/**
 * Stripe webhook endpoint
 */
router.post('/webhooks/stripe', async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'] as string;
    if (!signature) {
      return res.status(400).json({ error: 'Missing Stripe signature' });
    }


    const stripeSettings = await storage.getAppSetting('payment_stripe');
    if (!stripeSettings?.value) {
      return res.status(400).json({ error: 'Stripe not configured' });
    }

    const stripeConfig = stripeSettings.value as any;
    const webhookHandler = new SubscriptionWebhookHandler({
      stripeSecretKey: stripeConfig.secretKey,
      webhookSecret: stripeConfig.webhookSecret || 'whsec_test'
    });

    const result = await webhookHandler.processWebhook(req.body, signature);

    if (result.success) {
      res.json({ received: true });
    } else {
      res.status(400).json({ error: result.error });
    }

  } catch (error) {
    logger.error('enhanced-subscription', 'Error processing Stripe webhook:', error);
    res.status(400).json({ error: 'Webhook processing failed' });
  }
});


/**
 * Get comprehensive subscription overview (admin only)
 */
router.get('/admin/overview', ensureSuperAdmin, async (_req, res) => {
  try {

    const [totalCompanies] = await db
      .select({ count: count() })
      .from(companies);

    const [activeSubscriptions] = await db
      .select({ count: count() })
      .from(companies)
      .where(eq(companies.subscriptionStatus, 'active'));

    const [trialSubscriptions] = await db
      .select({ count: count() })
      .from(companies)
      .where(eq(companies.subscriptionStatus, 'trial'));

    const [pausedSubscriptions] = await db
      .select({ count: count() })
      .from(companies)
      .where(eq(companies.subscriptionStatus, 'paused'));

    const [gracePeriodSubscriptions] = await db
      .select({ count: count() })
      .from(companies)
      .where(eq(companies.subscriptionStatus, 'grace_period'));


    const recentEvents = await db
      .select()
      .from(subscriptionEvents)
      .orderBy(desc(subscriptionEvents.createdAt))
      .limit(10);


    const schedulerStatus = subscriptionScheduler.getStatus();

    res.json({
      statistics: {
        totalCompanies: totalCompanies.count,
        activeSubscriptions: activeSubscriptions.count,
        trialSubscriptions: trialSubscriptions.count,
        pausedSubscriptions: pausedSubscriptions.count,
        gracePeriodSubscriptions: gracePeriodSubscriptions.count
      },
      recentEvents,
      schedulerStatus
    });

  } catch (error) {
    logger.error('enhanced-subscription', 'Error getting admin overview:', error);
    res.status(500).json({ error: 'Failed to get admin overview' });
  }
});

/**
 * Get company subscription details (admin only)
 */
router.get('/admin/company/:companyId', ensureSuperAdmin, async (req, res) => {
  try {
    const { companyId } = req.params;

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const company = await storage.getCompany(parseInt(companyId));
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const plan = await storage.getPlan(company.planId!);


    const subscriptionStatus = await subscriptionManager.getSubscriptionStatus(parseInt(companyId));


    const usageStatus = await usageTrackingService.getUsageStatus(parseInt(companyId));


    const dunningStatus = await dunningService.getDunningStatus(parseInt(companyId));


    const pauseStatus = await subscriptionPausingService.getPauseStatus(parseInt(companyId));


    const gracePeriodStatus = await gracePeriodService.getGracePeriodStatus(parseInt(companyId));


    const recentEvents = await db
      .select()
      .from(subscriptionEvents)
      .where(eq(subscriptionEvents.companyId, parseInt(companyId)))
      .orderBy(desc(subscriptionEvents.createdAt))
      .limit(20);

    res.json({
      company,
      plan,
      subscriptionStatus,
      usageStatus,
      dunningStatus,
      pauseStatus,
      gracePeriodStatus,
      recentEvents
    });

  } catch (error) {
    logger.error('enhanced-subscription', 'Error getting company details:', error);
    res.status(500).json({ error: 'Failed to get company details' });
  }
});

/**
 * Update company subscription (admin only)
 */
router.put('/admin/company/:companyId/subscription', ensureSuperAdmin, async (req, res) => {
  try {
    const { companyId } = req.params;
    const {
      subscriptionStatus,
      subscriptionEndDate,
      planId,
      autoRenewal,
      reason = 'admin_update'
    } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }

    const company = await storage.getCompany(parseInt(companyId));
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const updateData: any = {};

    if (subscriptionStatus) updateData.subscriptionStatus = subscriptionStatus;
    if (subscriptionEndDate) updateData.subscriptionEndDate = new Date(subscriptionEndDate);
    if (planId) updateData.planId = planId;
    if (typeof autoRenewal === 'boolean') updateData.autoRenewal = autoRenewal;


    if (planId && planId !== company.planId) {
      const newPlan = await storage.getPlan(planId);
      if (newPlan && !newPlan.isFree && !newPlan.hasTrialPeriod) {

        updateData.isInTrial = false;
        updateData.trialStartDate = null;
        updateData.trialEndDate = null;
        updateData.subscriptionStatus = 'active';
        updateData.subscriptionStartDate = new Date();


      }
    }

    await storage.updateCompany(parseInt(companyId), updateData);


    if (updateData.isInTrial === false) {
      try {
        if ((global as any).broadcastToCompany) {
          (global as any).broadcastToCompany({
            type: 'subscription_status_changed',
            data: {
              companyId: parseInt(companyId),
              isInTrial: false,
              trialCleared: true,
              adminUpdate: true,
              timestamp: new Date().toISOString()
            }
          }, parseInt(companyId));
        }
      } catch (broadcastError) {
        console.error('Error broadcasting admin subscription update:', broadcastError);
      }
    }

    await subscriptionManager.logSubscriptionEvent(
      parseInt(companyId),
      'admin_subscription_update',
      {
        updates: updateData,
        reason
      },
      company.subscriptionStatus || 'inactive',
      subscriptionStatus || company.subscriptionStatus || 'inactive',
      'admin'
    );

    res.json({
      success: true,
      message: 'Subscription updated successfully'
    });

  } catch (error) {
    logger.error('enhanced-subscription', 'Error updating company subscription:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

/**
 * Adjust usage manually (admin only)
 */
router.post('/admin/company/:companyId/usage/adjust', ensureSuperAdmin, async (req, res) => {
  try {
    const { companyId } = req.params;
    const { metric, newUsage, reason = 'admin_adjustment' } = req.body;

    if (!companyId || !metric || typeof newUsage !== 'number') {
      return res.status(400).json({ error: 'Company ID, metric, and newUsage are required' });
    }

    const result = await usageTrackingService.adjustUsage(
      parseInt(companyId),
      metric,
      newUsage,
      reason
    );

    if (result.success) {
      res.json({
        success: true,
        message: 'Usage adjusted successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    logger.error('enhanced-subscription', 'Error adjusting usage:', error);
    res.status(500).json({ error: 'Failed to adjust usage' });
  }
});

/**
 * Get scheduler status (admin only)
 */
router.get('/admin/scheduler/status', ensureSuperAdmin, async (_req, res) => {
  try {
    const status = subscriptionScheduler.getStatus();
    res.json(status);
  } catch (error) {
    logger.error('enhanced-subscription', 'Error getting scheduler status:', error);
    res.status(500).json({ error: 'Failed to get scheduler status' });
  }
});

/**
 * Start scheduler (admin only)
 */
router.post('/admin/scheduler/start', ensureSuperAdmin, async (_req, res) => {
  try {
    subscriptionScheduler.start();
    res.json({ success: true, message: 'Scheduler started' });
  } catch (error) {
    logger.error('enhanced-subscription', 'Error starting scheduler:', error);
    res.status(500).json({ error: 'Failed to start scheduler' });
  }
});

/**
 * Stop scheduler (admin only)
 */
router.post('/admin/scheduler/stop', ensureSuperAdmin, async (_req, res) => {
  try {
    subscriptionScheduler.stop();
    res.json({ success: true, message: 'Scheduler stopped' });
  } catch (error) {
    logger.error('enhanced-subscription', 'Error stopping scheduler:', error);
    res.status(500).json({ error: 'Failed to stop scheduler' });
  }
});





/**
 * Check for outstanding balances that must be paid before renewal
 */
async function checkOutstandingBalance(companyId: number): Promise<number> {
  try {

    const company = await storage.getCompany(companyId);
    






    
    return 0; // TODO: Implement actual balance calculation
  } catch (error: any) {
    logger.error('enhanced-subscription', 'Error checking outstanding balance:', error);
    return 0;
  }
}

/**
 * Get the configured payment gateway for a company
 */
async function getCompanyPaymentGateway(companyId: number): Promise<string> {
  try {


    const paymentSettings = await storage.getAppSetting('payment_gateway');
    return paymentSettings?.value as string || 'stripe';
  } catch (error: any) {
    logger.error('enhanced-subscription', 'Error getting payment gateway:', error);
    return 'stripe'; // Default fallback
  }
}

/**
 * Create Stripe payment session for subscription renewal
 */

async function getDefaultCurrency(): Promise<string> {
  try {
    const generalSettings = await storage.getAppSetting('general_settings');
    if (generalSettings?.value && typeof generalSettings.value === 'object') {
      const settings = generalSettings.value as any;
      return settings.defaultCurrency || 'USD';
    }
    return 'USD';
  } catch (error) {
    return 'USD';
  }
}

async function createStripePaymentSession(company: any, plan: any, enableAutoRenewal: boolean = false): Promise<{ id: string; url: string }> {
  const stripeSettings = await storage.getAppSetting('payment_stripe');
  if (!stripeSettings?.value) {
    throw new Error('Stripe not configured');
  }

  const stripeConfig = stripeSettings.value as any;
  const stripe = new Stripe(stripeConfig.secretKey);

  const defaultCurrency = await getDefaultCurrency();
  const currencyLower = defaultCurrency.toLowerCase();
  

  const supportedCurrencies = ['usd', 'eur', 'gbp', 'cad', 'aud', 'jpy', 'chf', 'nzd', 'sek', 'nok', 'dkk', 'pln', 'czk', 'huf', 'ron', 'bgn', 'hrk', 'rub', 'try', 'brl', 'mxn', 'ars', 'clp', 'cop', 'pen', 'inr', 'sgd', 'hkd', 'krw', 'twd', 'thb', 'myr', 'php', 'idr', 'vnd', 'aed', 'sar', 'ils', 'zar', 'ngn', 'egp', 'kes'];
  if (!supportedCurrencies.includes(currencyLower)) {
    throw new Error(`Currency ${defaultCurrency} is not supported by Stripe`);
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: currencyLower,
        product_data: {
          name: `${plan.name} Subscription Renewal`,
          description: `Renewal for ${company.name}`,
        },
        unit_amount: Math.round(plan.price * 100), // Convert to cents
      },
      quantity: 1,
    }],
    mode: 'payment',
    customer_email: company.companyEmail,
    success_url: `${process.env.BASE_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}&renewal=true`,
    cancel_url: `${process.env.BASE_URL}/payment/cancelled`,
    metadata: {
      companyId: company.id.toString(),
      planId: plan.id.toString(),
      originalPlanId: company.planId?.toString() || '',
      renewalType: 'subscription_renewal',
      enableAutoRenewal: enableAutoRenewal.toString(),
      isPlanChange: (plan.id !== company.planId).toString()
    }
  });

  return {
    id: session.id,
    url: session.url || ''
  };
}

/**
 * Create Moyasar payment session for subscription renewal
 */
async function createMoyasarPaymentSession(company: any, plan: any, enableAutoRenewal: boolean = false): Promise<{ id: string; url: string }> {
  const moyasarSettings = await storage.getAppSetting('payment_moyasar');
  if (!moyasarSettings?.value) {
    throw new Error('Moyasar not configured');
  }

  const defaultCurrency = await getDefaultCurrency();
  

  if (defaultCurrency.toUpperCase() !== 'SAR') {
    throw new Error(`Moyasar only supports SAR (Saudi Riyal). Current configured currency is ${defaultCurrency}`);
  }

  const moyasarConfig = moyasarSettings.value as any;
  
  if (!moyasarConfig.publishableKey) {
    throw new Error('Moyasar publishable key is missing');
  }


  const transaction = await storage.createPaymentTransaction({
    companyId: company.id,
    planId: plan.id,
    amount: plan.price,
    currency: 'SAR',
    status: 'pending',
    paymentMethod: 'moyasar',
    metadata: {
      renewalType: 'subscription_renewal',
      enableAutoRenewal: enableAutoRenewal.toString(),
      isPlanChange: (plan.id !== company.planId).toString()
    }
  });



  const callbackUrl = `${process.env.BASE_URL || 'http://localhost:5000'}/payment/success?source=moyasar&transaction_id=${transaction.id}&renewal=true`;
  
  return {
    id: transaction.id.toString(),
    url: callbackUrl // Return callback URL for client-side handling
  };
}

/**
 * Create PayPal payment session for subscription renewal
 */
async function createPayPalPaymentSession(company: any, plan: any, enableAutoRenewal: boolean = false, originUrl?: string): Promise<{ id: string; url: string }> {
  const paypalSettings = await storage.getAppSetting('payment_paypal');
  if (!paypalSettings?.value) {
    throw new Error('PayPal not configured');
  }

  const defaultCurrency = await getDefaultCurrency();
  

  const supportedCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'HRK', 'RUB', 'TRY', 'BRL', 'MXN', 'ARS', 'CLP', 'COP', 'PEN', 'INR', 'SGD', 'HKD', 'KRW', 'TWD', 'THB', 'MYR', 'PHP', 'IDR', 'VND', 'AED', 'SAR', 'ILS', 'ZAR', 'NGN', 'EGP', 'KES'];
  if (!supportedCurrencies.includes(defaultCurrency.toUpperCase())) {
    throw new Error(`Currency ${defaultCurrency} may not be supported by PayPal`);
  }

  const paypalConfig = paypalSettings.value as any;
  

  const clientId = (paypalConfig.clientId || '').trim();
  const clientSecret = (paypalConfig.clientSecret || '').trim();


  if (!clientId || !clientSecret) {
    console.error('PayPal credentials validation failed in subscription renewal:', {
      hasClientId: !!paypalConfig.clientId,
      hasClientSecret: !!paypalConfig.clientSecret,
      clientIdLength: clientId?.length || 0,
      clientSecretLength: clientSecret?.length || 0,
      testMode: paypalConfig.testMode
    });
    throw new Error('Invalid PayPal credentials. Please check your PayPal settings.');
  }

  let environment;
  if (paypalConfig.testMode) {
    environment = new paypal.core.SandboxEnvironment(
      clientId,
      clientSecret
    );
  } else {
    environment = new paypal.core.LiveEnvironment(
      clientId,
      clientSecret
    );
  }

  const client = new paypal.core.PayPalHttpClient(environment);


  const transaction = await storage.createPaymentTransaction({
    companyId: company.id,
    planId: plan.id,
    amount: plan.price,
    currency: defaultCurrency,
    status: 'pending',
    paymentMethod: 'paypal',
    metadata: {
      renewalType: 'subscription_renewal',
      enableAutoRenewal: enableAutoRenewal.toString(),
      isPlanChange: (plan.id !== company.planId).toString()
    }
  });

  const request = new paypal.orders.OrdersCreateRequest();
  request.prefer("return=representation");
  request.requestBody({
    intent: 'CAPTURE',
    purchase_units: [{
      amount: {
        currency_code: defaultCurrency.toUpperCase(),
        value: plan.price.toString()
      },
      description: `${plan.name} Subscription Renewal`,
      custom_id: transaction.id.toString()
    }] as any,
    application_context: {
      brand_name: 'PowerChatPlus',
      landing_page: 'BILLING',
      user_action: 'PAY_NOW',
      return_url: `${(() => {
        let baseUrl = process.env.BASE_URL || 'http://localhost:5000';
        if (originUrl) {
          const validatedUrl = validateOriginUrl(originUrl);
          if (validatedUrl) {
            baseUrl = validatedUrl;
          }
        }
        return baseUrl;
      })()}/payment/success?source=paypal&transaction_id=${transaction.id}&renewal=true`,
      cancel_url: `${(() => {
        let baseUrl = process.env.BASE_URL || 'http://localhost:5000';
        if (originUrl) {
          const validatedUrl = validateOriginUrl(originUrl);
          if (validatedUrl) {
            baseUrl = validatedUrl;
          }
        }
        return baseUrl;
      })()}/payment/cancelled`
    }
  });

  const response = await client.execute(request);

  const approvalLink = response.result.links.find((link: any) => link.rel === 'approve');
  if (!approvalLink) {
    throw new Error('PayPal approval URL not found');
  }

  return {
    id: transaction.id.toString(),
    url: approvalLink.href
  };
}

/**
 * Create Mercado Pago payment session for subscription renewal
 */
async function createMercadoPagoPaymentSession(req: any, company: any, plan: any, enableAutoRenewal: boolean = false, originUrl?: string): Promise<{ id: string; url: string }> {
  const mercadoPagoSettings = await storage.getAppSetting('payment_mercadopago');
  if (!mercadoPagoSettings?.value) {
    throw new Error('Mercado Pago not configured');
  }

  const defaultCurrency = await getDefaultCurrency();
  

  const supportedCurrencies = ['USD', 'ARS', 'BRL', 'CLP', 'COP', 'MXN', 'PEN', 'UYU', 'VEF'];
  if (!supportedCurrencies.includes(defaultCurrency.toUpperCase())) {
    throw new Error(`Currency ${defaultCurrency} may not be supported by Mercado Pago. Supported currencies: ${supportedCurrencies.join(', ')}`);
  }

  const mercadoPagoConfig = mercadoPagoSettings.value as any;
  
  if (!mercadoPagoConfig.clientId || !mercadoPagoConfig.clientSecret || !mercadoPagoConfig.accessToken) {
    throw new Error('Mercado Pago settings are incomplete');
  }


  const transaction = await storage.createPaymentTransaction({
    companyId: company.id,
    planId: plan.id,
    amount: plan.price,
    currency: defaultCurrency,
    status: 'pending',
    paymentMethod: 'mercadopago',
    metadata: {
      renewalType: 'subscription_renewal',
      enableAutoRenewal: enableAutoRenewal.toString(),
      isPlanChange: (plan.id !== company.planId).toString()
    }
  });


  let baseUrl = `${req.protocol}://${req.get('host')}`;
  if (originUrl) {
    const validatedUrl = validateOriginUrl(originUrl);
    if (validatedUrl) {
      baseUrl = validatedUrl;
    } else {
      console.warn('Invalid originUrl provided for Mercado Pago renewal, falling back to request URL');
    }
  }
  


  
  const preferenceData = {
    items: [
      {
        title: `${plan.name} Subscription Renewal`,
        description: `Renewal for ${company.name}`,
        quantity: 1,
        currency_id: defaultCurrency.toUpperCase(),
        unit_price: Number(plan.price)
      }
    ],
    back_urls: {
      success: `${baseUrl}/payment/success?source=mercadopago&transaction_id=${transaction.id}&renewal=true`,
      failure: `${baseUrl}/payment/cancel?source=mercadopago&transaction_id=${transaction.id}`,
      pending: `${baseUrl}/payment/pending?source=mercadopago&transaction_id=${transaction.id}`
    },
    auto_return: 'all',
    external_reference: transaction.id.toString(),
    notification_url: `${baseUrl}/api/webhooks/mercadopago`
  };
  



  const apiUrl = 'https://api.mercadopago.com/checkout/preferences';
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${mercadoPagoConfig.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(preferenceData)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Failed to create Mercado Pago preference: ${errorData.message || response.statusText}`);
  }

  const responseData = await response.json();

  if (!responseData || !responseData.init_point) {
    throw new Error('Invalid response from Mercado Pago API');
  }

  return {
    id: transaction.id.toString(),
    url: responseData.init_point
  };
}

/**
 * Create Paystack payment session for subscription renewal
 */
async function createPaystackPaymentSession(company: any, plan: any, enableAutoRenewal: boolean = false, originUrl?: string): Promise<{ id: string; url: string }> {
  const paystackSettings = await storage.getAppSetting('payment_paystack');
  if (!paystackSettings?.value || !(paystackSettings.value as any).enabled) {
    throw new Error('Paystack not configured');
  }

  const paystackConfig = paystackSettings.value as any;
  const defaultCurrency = (await getDefaultCurrency()).toUpperCase();

  if (!PAYSTACK_SUPPORTED_CURRENCIES.includes(defaultCurrency)) {
    throw new Error(`Currency ${defaultCurrency} is not supported by Paystack. Supported: ${PAYSTACK_SUPPORTED_CURRENCIES.join(', ')}`);
  }

  const transaction = await storage.createPaymentTransaction({
    companyId: company.id,
    planId: plan.id,
    amount: plan.price,
    currency: defaultCurrency,
    status: 'pending',
    paymentMethod: 'paystack',
    metadata: {
      renewalType: 'subscription_renewal',
      enableAutoRenewal: enableAutoRenewal.toString(),
      isPlanChange: (plan.id !== company.planId).toString()
    }
  });

  const reference = `PC-REN-${transaction.id}-${Date.now()}`;
  

  let baseUrl = process.env.BASE_URL || 'http://localhost:5000';
  if (originUrl) {
    const validatedUrl = validateOriginUrl(originUrl);
    if (validatedUrl) {
      baseUrl = validatedUrl;
    } else {
      console.warn('Invalid originUrl provided for Paystack renewal, falling back to default URL');
    }
  }
  const callbackUrl = `${baseUrl}/payment/success?source=paystack&transaction_id=${transaction.id}&renewed=true&from_renewal=true`;

  const initResponse = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${paystackConfig.secretKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: company.companyEmail || company.email || 'no-email@powerchatplus.local',
      amount: Math.round(Number(plan.price) * 100),
      currency: defaultCurrency,
      reference,
      callback_url: callbackUrl,
      metadata: {
        transactionId: transaction.id,
        planId: plan.id,
        companyId: company.id,
        renewal: true
      }
    })
  });

  const initData = await initResponse.json().catch(() => ({}));
  if (!initResponse.ok || !initData?.data?.authorization_url) {
    const apiMessage = initData?.message || initResponse.statusText;
    throw new Error(`Failed to initialize Paystack payment: ${apiMessage}`);
  }

  await storage.updatePaymentTransaction(transaction.id, {
    paymentIntentId: reference,
    externalTransactionId: initData.data.reference
  });

  return {
    id: transaction.id.toString(),
    url: initData.data.authorization_url
  };
}

/**
 * Handle bank transfer renewal
 */
async function handleBankTransferRenewal(company: any, plan: any, userEmail: string): Promise<{
  bankDetails: any;
  transactionId: number;
}> {
  const bankTransferSettings = await storage.getAppSetting('payment_bank_transfer');
  if (!bankTransferSettings?.value) {
    throw new Error('Bank transfer not configured');
  }

  const bankConfig = bankTransferSettings.value as any;
  

  const defaultCurrency = await getDefaultCurrency();
  
  const transaction = await storage.createPaymentTransaction({
    companyId: company.id,
    planId: plan.id,
    amount: plan.price,
    currency: defaultCurrency,
    status: 'pending',
    paymentMethod: 'bank_transfer',
    metadata: {
      instructions: bankConfig.instructions,
      reference: `RENEWAL-${plan.id}-COMPANY-${company.id}-TRANS-${Date.now()}`
    }
  });

  const bankDetails = {
    accountName: bankConfig.accountName,
    accountNumber: bankConfig.accountNumber,
    bankName: bankConfig.bankName,
    routingNumber: bankConfig.routingNumber,
    swiftCode: bankConfig.swiftCode,
    instructions: bankConfig.instructions,
    reference: transaction.metadata?.reference
  };

  await logSubscriptionEvent(company.id, 'bank_transfer_initiated', {
    planId: plan.id,
    amount: plan.price,
    transactionId: transaction.id,
    userEmail,
    bankDetails
  });

  logger.info('enhanced-subscription', `Bank transfer renewal initiated for company ${company.id}, transaction ${transaction.id}`);

  return {
    bankDetails,
    transactionId: transaction.id
  };
}

/**
 * Log subscription events for audit trail
 */
async function logSubscriptionEvent(companyId: number, eventType: string, data: any) {
  try {
    await db.insert(subscriptionEvents).values({
      companyId,
      eventType,
      eventData: data,
      createdAt: new Date()
    });
  } catch (error: any) {
    logger.error('enhanced-subscription', 'Error logging subscription event:', error);
  }
}

/**
 * SECURITY: Process confirmed payment and activate subscription
 * This should only be called after payment verification via webhook
 */
export async function activateSubscriptionAfterPayment(
  companyId: number, 
  planId: number, 
  paymentId: string,
  amount: number
) {
  try {
    const company = await storage.getCompany(companyId);
    if (!company) {
      throw new Error('Company not found');
    }

    const plan = await storage.getPlan(planId);
    if (!plan) {
      throw new Error('Plan not found');
    }


    const now = new Date();
    let newEndDate: Date;


    if (company.subscriptionEndDate && now <= company.subscriptionEndDate) {
      newEndDate = new Date(company.subscriptionEndDate);
    } else {

      newEndDate = new Date(now);
    }


    const billingInterval = (plan as any).billingInterval || 'monthly';
    const customDurationDays = (plan as any).customDurationDays;
    
    switch (billingInterval) {
      case 'lifetime':

        newEndDate = new Date('2099-12-31');
        break;
      case 'daily':
        newEndDate.setDate(newEndDate.getDate() + 1);
        break;
      case 'weekly':
        newEndDate.setDate(newEndDate.getDate() + 7);
        break;
      case 'biweekly':
        newEndDate.setDate(newEndDate.getDate() + 14);
        break;
      case 'monthly':
        newEndDate.setMonth(newEndDate.getMonth() + 1);
        break;
      case 'quarterly':
        newEndDate.setMonth(newEndDate.getMonth() + 3);
        break;
      case 'semi_annual':
        newEndDate.setMonth(newEndDate.getMonth() + 6);
        break;
      case 'annual':
        newEndDate.setFullYear(newEndDate.getFullYear() + 1);
        break;
      case 'biennial':
        newEndDate.setFullYear(newEndDate.getFullYear() + 2);
        break;
      case 'custom':
        if (customDurationDays && customDurationDays > 0) {
          newEndDate.setDate(newEndDate.getDate() + customDurationDays);
        } else {

          newEndDate.setMonth(newEndDate.getMonth() + 1);
        }
        break;

      case 'year':
        newEndDate.setFullYear(newEndDate.getFullYear() + 1);
        break;
      case 'quarter':
        newEndDate.setMonth(newEndDate.getMonth() + 3);
        break;
      case 'month':
      default:
        newEndDate.setMonth(newEndDate.getMonth() + 1);
        break;
    }


    await storage.updateCompany(companyId, {
      subscriptionStatus: 'active',
      subscriptionEndDate: newEndDate,
      subscriptionStartDate: company.subscriptionStartDate || now,
      dunningAttempts: 0,
      lastDunningAttempt: null,
      gracePeriodEnd: null
    });


    await logSubscriptionEvent(companyId, 'subscription_renewed', {
      planId,
      paymentId,
      amount,
      newEndDate: newEndDate.toISOString(),
      previousEndDate: company.subscriptionEndDate?.toISOString()
    });

    logger.info('enhanced-subscription', `Subscription activated after payment verification for company ${companyId}, plan ${planId}, payment ${paymentId}, amount ${amount}`);

    return { success: true, newEndDate };
  } catch (error: any) {
    logger.error('enhanced-subscription', 'Error activating subscription after payment:', error);
    throw error;
  }
}

/**
 * Manual bank transfer verification for renewals (admin use)
 */
router.post('/verify-bank-transfer-renewal', ensureAuthenticated, async (req: any, res) => {
  try {
    const { transactionId, verified } = req.body;
    
    if (!transactionId) {
      return res.status(400).json({ error: 'Transaction ID required' });
    }



    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID required' });
    }


    const transaction = await storage.getPaymentTransaction(transactionId);
    if (!transaction || transaction.companyId !== companyId) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (transaction.paymentMethod !== 'bank_transfer') {
      return res.status(400).json({ error: 'This endpoint is only for bank transfer transactions' });
    }

    if (verified) {

      await storage.updatePaymentTransactionStatus(transactionId, 'completed');
      

      const company = await storage.getCompany(companyId);
      if (company && transaction.planId) {
        const plan = await storage.getPlan(transaction.planId);
        if (plan) {

          const currentDate = new Date();
          const expirationDate = company.subscriptionEndDate 
            ? new Date(company.subscriptionEndDate) 
            : currentDate;
          

          const startDate = expirationDate > currentDate ? expirationDate : currentDate;
          const newExpiration = new Date(startDate);
          newExpiration.setMonth(newExpiration.getMonth() + 1);
          

          await storage.updateCompany(companyId, {
            subscriptionEndDate: newExpiration
          });
        }
      }

      await logSubscriptionEvent(companyId, 'renewal_completed_bank_transfer', {
        transactionId,
        planId: transaction.planId,
        amount: transaction.amount
      });

      res.json({
        success: true,
        message: 'Bank transfer verified and subscription renewed successfully'
      });
    } else {

      await logSubscriptionEvent(companyId, 'bank_transfer_marked_complete', {
        transactionId,
        planId: transaction.planId,
        amount: transaction.amount,
        note: 'User marked transfer as complete, pending verification'
      });

      res.json({
        success: true,
        message: 'Transfer marked as complete. Please wait for admin verification.'
      });
    }

  } catch (error: any) {
    logger.error('enhanced-subscription', 'Error verifying bank transfer renewal:', error);
    res.status(500).json({ 
      error: 'VERIFICATION_FAILED',
      message: 'Failed to verify bank transfer. Please try again.' 
    });
  }
});

export default router;
