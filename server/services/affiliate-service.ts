import { db } from "../db";
import { 
  affiliates, 
  affiliateReferrals, 
  affiliatePayouts,
  affiliateAnalytics,
  companies,
  users,
  paymentTransactions,
  affiliateEarningsTransactions,
  affiliateEarningsBalance
} from "../../shared/schema";
import { eq, and, gte, lte, desc, sql, isNull } from "drizzle-orm";
import { convertAffiliateReferral } from "../middleware/affiliate-tracking";

export class AffiliateService {
  
  /**
   * Process affiliate commission when a payment is completed
   */
  async processPaymentCommission(paymentTransactionId: number) {
    try {

      const [payment] = await db
        .select()
        .from(paymentTransactions)
        .where(eq(paymentTransactions.id, paymentTransactionId))
        .limit(1);

      if (!payment || payment.status !== 'completed') {
        return null;
      }


      let referralId: number | null = null;
      

      if (payment.metadata && typeof payment.metadata === 'object' && 'referralId' in payment.metadata) {
        referralId = typeof payment.metadata.referralId === 'number' ? payment.metadata.referralId : 
                     typeof payment.metadata.referralId === 'string' ? parseInt(payment.metadata.referralId) : null;
      }
      

      if (!referralId && payment.companyId) {
        const [activeReferral] = await db
          .select()
          .from(affiliateReferrals)
          .where(and(
            eq(affiliateReferrals.referredCompanyId, payment.companyId),
            eq(affiliateReferrals.status, 'pending')
          ))
          .orderBy(desc(affiliateReferrals.createdAt))
          .limit(1);
        
        if (activeReferral) {
          referralId = activeReferral.id;
        }
      }
      

      if (!referralId) {

        return [];
      }


      const [existingTransaction] = await db
        .select()
        .from(affiliateEarningsTransactions)
        .where(and(
          eq(affiliateEarningsTransactions.referralId, referralId),
          eq(affiliateEarningsTransactions.paymentTransactionId, paymentTransactionId),
          eq(affiliateEarningsTransactions.transactionType, 'earned')
        ))
        .limit(1);

      if (existingTransaction) {

        return [];
      }


      const [referral] = await db
        .select()
        .from(affiliateReferrals)
        .where(and(
          eq(affiliateReferrals.id, referralId),
          eq(affiliateReferrals.status, 'pending')
        ))
        .limit(1);

      if (!referral) {

        return [];
      }


      try {
        const result = await convertAffiliateReferral(
          referral.id,
          Number(payment.amount),
          undefined,
          paymentTransactionId
        );


        const affiliateId = referral.affiliateId;
        if (affiliateId) {
          await this.updateAffiliateAnalytics(affiliateId, {
            conversions: 1,
            revenue: Number(payment.amount),
            commissionEarned: result.commissionAmount
          });
        }

        return [result];
      } catch (error) {
        console.error(`Error processing referral ${referral.id}:`, error);
        throw error;
      }
    } catch (error) {
      console.error('Error processing payment commission:', error);
      throw error;
    }
  }

  /**
   * Update affiliate analytics for a specific date
   */
  async updateAffiliateAnalytics(
    affiliateId: number, 
    metrics: {
      clicks?: number;
      uniqueClicks?: number;
      impressions?: number;
      referrals?: number;
      conversions?: number;
      revenue?: number;
      commissionEarned?: number;
    }
  ) {
    try {
      const today = new Date().toISOString().split('T')[0];


      const [existing] = await db
        .select()
        .from(affiliateAnalytics)
        .where(and(
          eq(affiliateAnalytics.affiliateId, affiliateId),
          eq(affiliateAnalytics.date, today),
          eq(affiliateAnalytics.periodType, 'daily')
        ))
        .limit(1);

      if (existing) {

        const currentClicks = existing.clicks ?? 0;
        const currentUniqueClicks = existing.uniqueClicks ?? 0;
        const currentImpressions = existing.impressions ?? 0;
        const currentReferrals = existing.referrals ?? 0;
        const currentConversions = existing.conversions ?? 0;
        const currentRevenue = Number(existing.revenue) || 0;
        const currentCommissionEarned = Number(existing.commissionEarned) || 0;

        const newReferrals = currentReferrals + (metrics.referrals || 0);
        const newConversions = currentConversions + (metrics.conversions || 0);
        const newRevenue = currentRevenue + (metrics.revenue || 0);

        await db
          .update(affiliateAnalytics)
          .set({
            clicks: currentClicks + (metrics.clicks || 0),
            uniqueClicks: currentUniqueClicks + (metrics.uniqueClicks || 0),
            impressions: currentImpressions + (metrics.impressions || 0),
            referrals: newReferrals,
            conversions: newConversions,
            revenue: newRevenue.toString(),
            commissionEarned: (currentCommissionEarned + (metrics.commissionEarned || 0)).toString(),
            conversionRate: (newReferrals > 0 ? (newConversions / newReferrals) * 100 : 0).toString(),
            averageOrderValue: (newConversions > 0 ? newRevenue / newConversions : 0).toString(),
            updatedAt: new Date()
          })
          .where(eq(affiliateAnalytics.id, existing.id));
      } else {

        await db
          .insert(affiliateAnalytics)
          .values({
            affiliateId,
            date: today,
            periodType: 'daily',
            clicks: metrics.clicks || 0,
            uniqueClicks: metrics.uniqueClicks || 0,
            impressions: metrics.impressions || 0,
            referrals: metrics.referrals || 0,
            conversions: metrics.conversions || 0,
            revenue: (metrics.revenue || 0).toString(),
            commissionEarned: (metrics.commissionEarned || 0).toString(),
            conversionRate: (metrics.referrals && metrics.conversions ?
              (metrics.conversions / metrics.referrals) * 100 : 0).toString(),
            averageOrderValue: (metrics.conversions && metrics.revenue ?
              metrics.revenue / metrics.conversions : 0).toString(),
            topCountries: [],
            topSources: [],
            createdAt: new Date(),
            updatedAt: new Date()
          });
      }
    } catch (error) {
      console.error('Error updating affiliate analytics:', error);
      throw error;
    }
  }

  /**
   * Generate affiliate payout for a specific period
   */
  async generateAffiliatePayout(
    affiliateId: number,
    periodStart: Date,
    periodEnd: Date,
    paymentMethod: string = 'bank_transfer'
  ) {
    try {

      const referrals = await db
        .select()
        .from(affiliateReferrals)
        .where(and(
          eq(affiliateReferrals.affiliateId, affiliateId),
          eq(affiliateReferrals.status, 'converted'),
          gte(affiliateReferrals.convertedAt, periodStart),
          lte(affiliateReferrals.convertedAt, periodEnd)
        ));

      if (referrals.length === 0) {
        throw new Error('No eligible referrals found for payout');
      }


      const totalAmount = referrals.reduce((sum, referral) => 
        sum + Number(referral.commissionAmount), 0);


      const [affiliate] = await db
        .select()
        .from(affiliates)
        .where(eq(affiliates.id, affiliateId))
        .limit(1);

      if (!affiliate) {
        throw new Error('Affiliate not found');
      }

      const companyId = affiliate.companyId;


      const [payout] = await db
        .insert(affiliatePayouts)
        .values({
          affiliateId,
          companyId: companyId || null,
          amount: totalAmount.toString(),
          currency: 'USD',
          status: 'pending',
          paymentMethod,
          periodStart,
          periodEnd,
          referralIds: referrals.map(r => r.id),
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();


      const currentPendingEarnings = Number(affiliate.pendingEarnings) || 0;
      await db
        .update(affiliates)
        .set({
          pendingEarnings: Math.max(0, currentPendingEarnings - totalAmount).toString(),
          updatedAt: new Date()
        })
        .where(eq(affiliates.id, affiliateId));


      const [existingBalance] = await db
        .select()
        .from(affiliateEarningsBalance)
        .where(and(
          eq(affiliateEarningsBalance.affiliateId, affiliateId),
          companyId ? eq(affiliateEarningsBalance.companyId, companyId) : isNull(affiliateEarningsBalance.companyId)
        ))
        .limit(1);

      if (existingBalance) {
        const currentAvailable = Number(existingBalance.availableBalance) || 0;
        const currentPendingPayout = Number(existingBalance.pendingPayout) || 0;
        

        const newAvailableBalance = Math.max(0, currentAvailable - totalAmount);
        const newPendingPayout = currentPendingPayout + totalAmount;
        
        await db
          .update(affiliateEarningsBalance)
          .set({
            availableBalance: newAvailableBalance.toString(),
            pendingPayout: newPendingPayout.toString(),
            lastUpdated: new Date()
          })
          .where(eq(affiliateEarningsBalance.id, existingBalance.id));


        await db
          .insert(affiliateEarningsTransactions)
          .values({
            companyId: companyId || null,
            affiliateId: affiliateId,
            transactionType: 'payout',
            amount: totalAmount.toString(),
            balanceAfter: newAvailableBalance.toString(), // Available balance after transfer
            referralId: null,
            paymentTransactionId: null,
            payoutId: payout.id,
            description: `Payout generated for period ${periodStart.toISOString()} to ${periodEnd.toISOString()}. Transferred from available to pending payout.`,
            metadata: { 
              periodStart, 
              periodEnd, 
              referralIds: referrals.map(r => r.id),
              transferType: 'available_to_pending',
              availableBefore: currentAvailable,
              availableAfter: newAvailableBalance,
              pendingBefore: currentPendingPayout,
              pendingAfter: newPendingPayout
            },
            createdAt: new Date()
          });
      }

      return payout;
    } catch (error) {
      console.error('Error generating affiliate payout:', error);
      throw error;
    }
  }

  /**
   * Process payout completion
   */
  async completeAffiliatePayout(
    payoutId: number,
    paymentReference: string,
    processedBy: number
  ) {
    try {

      const [payout] = await db
        .update(affiliatePayouts)
        .set({
          status: 'completed',
          paymentReference,
          processedBy,
          processedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(affiliatePayouts.id, payoutId))
        .returning();

      if (!payout) {
        throw new Error('Payout not found');
      }

      const affiliateId = payout.affiliateId;
      const companyId = payout.companyId;
      const payoutAmount = Number(payout.amount);

      if (affiliateId) {

        const [affiliate] = await db
          .select()
          .from(affiliates)
          .where(eq(affiliates.id, affiliateId))
          .limit(1);

        if (affiliate) {
          const currentPaidEarnings = Number(affiliate.paidEarnings) || 0;
          await db
            .update(affiliates)
            .set({
              paidEarnings: (currentPaidEarnings + payoutAmount).toString(),
              updatedAt: new Date()
            })
            .where(eq(affiliates.id, affiliate.id));
        }


        const [existingBalance] = await db
          .select()
          .from(affiliateEarningsBalance)
          .where(and(
            eq(affiliateEarningsBalance.affiliateId, affiliateId),
            companyId ? eq(affiliateEarningsBalance.companyId, companyId) : isNull(affiliateEarningsBalance.companyId)
          ))
          .limit(1);

        if (existingBalance) {
          const currentPendingPayout = Number(existingBalance.pendingPayout) || 0;
          const currentPaidOut = Number(existingBalance.paidOut) || 0;
          
          await db
            .update(affiliateEarningsBalance)
            .set({
              pendingPayout: Math.max(0, currentPendingPayout - payoutAmount).toString(),
              paidOut: (currentPaidOut + payoutAmount).toString(),
              lastUpdated: new Date()
            })
            .where(eq(affiliateEarningsBalance.id, existingBalance.id));


          await db
            .insert(affiliateEarningsTransactions)
            .values({
              companyId: companyId || null,
              affiliateId: affiliateId,
              transactionType: 'payout',
              amount: payoutAmount.toString(),
              balanceAfter: Math.max(0, currentPendingPayout - payoutAmount).toString(),
              referralId: null,
              paymentTransactionId: null,
              payoutId: payout.id,
              description: `Payout completed. Payment reference: ${paymentReference}`,
              metadata: { paymentReference, processedBy },
              createdAt: new Date()
            });
        }
      }

      return payout;
    } catch (error) {
      console.error('Error completing affiliate payout:', error);
      throw error;
    }
  }

  /**
   * Get affiliate performance report
   */
  async getAffiliatePerformanceReport(
    startDate?: Date,
    endDate?: Date,
    topN: number = 10
  ) {
    try {
      const conditions = [];
      
      if (startDate) {
        conditions.push(gte(affiliateReferrals.createdAt, startDate));
      }
      
      if (endDate) {
        conditions.push(lte(affiliateReferrals.createdAt, endDate));
      }


      const allConditions = [eq(affiliates.status, 'active')];
      if (conditions.length > 0) {
        allConditions.push(...conditions);
      }

      const query = db
        .select({
          affiliateId: affiliates.id,
          affiliateName: affiliates.name,
          affiliateCode: affiliates.affiliateCode,
          totalReferrals: sql`COUNT(${affiliateReferrals.id})`,
          convertedReferrals: sql`COUNT(CASE WHEN ${affiliateReferrals.status} = 'converted' THEN 1 END)`,
          totalRevenue: sql`SUM(CASE WHEN ${affiliateReferrals.status} = 'converted' THEN ${affiliateReferrals.conversionValue} ELSE 0 END)`,
          totalCommission: sql`SUM(CASE WHEN ${affiliateReferrals.status} = 'converted' THEN ${affiliateReferrals.commissionAmount} ELSE 0 END)`,
          conversionRate: sql`CASE WHEN COUNT(${affiliateReferrals.id}) > 0 THEN (COUNT(CASE WHEN ${affiliateReferrals.status} = 'converted' THEN 1 END) * 100.0 / COUNT(${affiliateReferrals.id})) ELSE 0 END`
        })
        .from(affiliates)
        .leftJoin(affiliateReferrals, eq(affiliates.id, affiliateReferrals.affiliateId))
        .where(and(...allConditions))
        .groupBy(affiliates.id, affiliates.name, affiliates.affiliateCode)
        .orderBy(desc(sql`SUM(CASE WHEN ${affiliateReferrals.status} = 'converted' THEN ${affiliateReferrals.commissionAmount} ELSE 0 END)`))
        .limit(topN);

      return await query;
    } catch (error) {
      console.error('Error getting affiliate performance report:', error);
      throw error;
    }
  }

  /**
   * Expire old pending referrals
   */
  async expirePendingReferrals() {
    try {
      const expiredDate = new Date();
      
      const expiredReferrals = await db
        .update(affiliateReferrals)
        .set({
          status: 'expired',
          updatedAt: new Date()
        })
        .where(and(
          eq(affiliateReferrals.status, 'pending'),
          lte(affiliateReferrals.expiresAt, expiredDate)
        ))
        .returning();


      return expiredReferrals;
    } catch (error) {
      console.error('Error expiring pending referrals:', error);
      throw error;
    }
  }
}

export const affiliateService = new AffiliateService();
