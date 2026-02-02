import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { affiliates, affiliateReferrals, affiliateClicks, affiliateEarningsBalance, affiliateEarningsTransactions } from "../../shared/schema";
import { eq, and, isNull } from "drizzle-orm";

interface AffiliateTrackingData {
  affiliateCode?: string;
  referralCode?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrerUrl?: string;
}


declare global {
  namespace Express {
    interface Request {
      affiliateTracking?: AffiliateTrackingData;
    }
  }
}

/**
 * Middleware to track affiliate referrals from URL parameters and headers
 */
export const affiliateTrackingMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {

    const {
      ref,           // Affiliate code
      aff,           // Alternative affiliate code
      affiliate,     // Another alternative
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term
    } = req.query;


    const referrerUrl = req.get('Referer') || req.get('Referrer');
    

    const affiliateCode = (ref || aff || affiliate) as string;
    
    if (affiliateCode) {

      const [affiliate] = await db
        .select()
        .from(affiliates)
        .where(and(
          eq(affiliates.affiliateCode, affiliateCode.toUpperCase()),
          eq(affiliates.status, 'active')
        ))
        .limit(1);

      if (affiliate) {

        const referralCode = generateReferralCode();
        

        req.affiliateTracking = {
          affiliateCode: affiliate.affiliateCode,
          referralCode,
          utmSource: utm_source as string,
          utmMedium: utm_medium as string,
          utmCampaign: utm_campaign as string,
          utmContent: utm_content as string,
          utmTerm: utm_term as string,
          referrerUrl
        };


        await trackAffiliateClick(req, affiliate.id);


        if (req.session) {
          (req.session as any).affiliateTracking = req.affiliateTracking;
        }


        res.cookie('affiliate_ref', JSON.stringify({
          affiliateCode: affiliate.affiliateCode,
          referralCode,
          timestamp: Date.now()
        }), {
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          httpOnly: false, // Allow client-side access
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax'
        });
      }
    } else {

      const sessionTracking = req.session && (req.session as any).affiliateTracking;
      const cookieTracking = req.cookies && req.cookies.affiliate_ref;
      
      if (sessionTracking) {
        req.affiliateTracking = sessionTracking;
      } else if (cookieTracking) {
        try {

          let parsed;
          if (typeof cookieTracking === 'string') {
            parsed = JSON.parse(cookieTracking);
          } else {
            parsed = cookieTracking;
          }


          if (parsed && typeof parsed === 'object' && parsed.affiliateCode && parsed.timestamp) {

            if (Date.now() - parsed.timestamp < 30 * 24 * 60 * 60 * 1000) {
              req.affiliateTracking = {
                affiliateCode: parsed.affiliateCode,
                referralCode: parsed.referralCode
              };
            }
          }
        } catch (error) {

          console.warn('Invalid affiliate_ref cookie, clearing:', error instanceof Error ? error.message : 'Unknown error');
          res.clearCookie('affiliate_ref');
        }
      }
    }

    next();
  } catch (error) {
    console.error('Error in affiliate tracking middleware:', error);

    next();
  }
};

/**
 * Track affiliate click in the database
 */
async function trackAffiliateClick(req: Request, affiliateId: number) {
  try {
    const userAgent = req.get('User-Agent') || '';
    const ipAddress = getClientIP(req);
    const deviceType = getDeviceType(userAgent);
    const browser = getBrowser(userAgent);
    const os = getOS(userAgent);
    
    await db.insert(affiliateClicks).values({
      affiliateId,
      clickedUrl: req.originalUrl,
      landingPage: req.path,
      sessionId: req.sessionID,
      userAgent,
      ipAddress,
      countryCode: await getCountryFromIP(ipAddress),
      utmSource: req.affiliateTracking?.utmSource,
      utmMedium: req.affiliateTracking?.utmMedium,
      utmCampaign: req.affiliateTracking?.utmCampaign,
      utmContent: req.affiliateTracking?.utmContent,
      utmTerm: req.affiliateTracking?.utmTerm,
      referrerUrl: req.affiliateTracking?.referrerUrl,
      deviceType,
      browser,
      os,
      converted: false,
      createdAt: new Date()
    });
  } catch (error) {
    console.error('Error tracking affiliate click:', error);
  }
}

/**
 * Create a referral record when a user signs up
 */
export async function createAffiliateReferral(
  affiliateCode: string,
  referralCode: string,
  referredEmail: string,
  referredUserId?: number,
  referredCompanyId?: number
) {
  try {

    const [affiliate] = await db
      .select()
      .from(affiliates)
      .where(eq(affiliates.affiliateCode, affiliateCode))
      .limit(1);

    if (!affiliate) {
      throw new Error('Affiliate not found');
    }


    const [referral] = await db
      .insert(affiliateReferrals)
      .values({
        companyId: referredCompanyId,
        affiliateId: affiliate.id,
        referralCode,
        referredCompanyId,
        referredUserId,
        referredEmail,
        status: 'pending',
        conversionValue: "0.00",
        commissionAmount: "0.00",
        commissionRate: affiliate.defaultCommissionRate?.toString() || "0.00",
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();


    await db
      .update(affiliates)
      .set({
        totalReferrals: (affiliate.totalReferrals ?? 0) + 1,
        updatedAt: new Date()
      })
      .where(eq(affiliates.id, affiliate.id));

    return referral;
  } catch (error) {
    console.error('Error creating affiliate referral:', error);
    throw error;
  }
}

/**
 * Convert a referral when payment is made
 */
export async function convertAffiliateReferral(
  referralId: number,
  conversionValue: number,
  commissionAmount?: number,
  paymentTransactionId?: number
) {
  try {
    const [referral] = await db
      .select()
      .from(affiliateReferrals)
      .where(eq(affiliateReferrals.id, referralId))
      .limit(1);

    if (!referral) {
      throw new Error('Referral not found');
    }


    if (referral.status === 'converted') {

      return { referral, commissionAmount: Number(referral.commissionAmount) || 0 };
    }

    const commissionRate = Number(referral.commissionRate) || 0;
    const finalCommissionAmount = commissionAmount ||
      (conversionValue * (commissionRate / 100));


    await db
      .update(affiliateReferrals)
      .set({
        status: 'converted',
        convertedAt: new Date(),
        conversionValue: conversionValue.toString(),
        commissionAmount: finalCommissionAmount.toString(),
        updatedAt: new Date()
      })
      .where(eq(affiliateReferrals.id, referralId));

    const affiliateId = referral.affiliateId;
    const companyId = referral.companyId;
    
    if (affiliateId) {

      const [affiliate] = await db
        .select()
        .from(affiliates)
        .where(eq(affiliates.id, affiliateId))
        .limit(1);

      if (affiliate) {
        await db
          .update(affiliates)
          .set({
            successfulReferrals: (affiliate.successfulReferrals ?? 0) + 1,
            totalEarnings: ((Number(affiliate.totalEarnings) || 0) + finalCommissionAmount).toString(),
            pendingEarnings: ((Number(affiliate.pendingEarnings) || 0) + finalCommissionAmount).toString(),
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

      const newTotalEarned = (Number(existingBalance?.totalEarned) || 0) + finalCommissionAmount;
      const newAvailableBalance = (Number(existingBalance?.availableBalance) || 0) + finalCommissionAmount;

      const currentPendingPayout = Number(existingBalance?.pendingPayout) || 0;

      if (existingBalance) {
        await db
          .update(affiliateEarningsBalance)
          .set({
            totalEarned: newTotalEarned.toString(),
            availableBalance: newAvailableBalance.toString(),

            lastUpdated: new Date()
          })
          .where(eq(affiliateEarningsBalance.id, existingBalance.id));
      } else {
        await db
          .insert(affiliateEarningsBalance)
          .values({
            companyId: companyId || null,
            affiliateId: affiliateId,
            totalEarned: newTotalEarned.toString(),
            availableBalance: newAvailableBalance.toString(),
            pendingPayout: "0.00", // Start at zero, only set when generating payouts
            appliedToPlans: "0.00",
            paidOut: "0.00",
            lastUpdated: new Date(),
            createdAt: new Date()
          });
      }


      await db
        .insert(affiliateEarningsTransactions)
        .values({
          companyId: companyId || null,
          affiliateId: affiliateId,
          transactionType: 'earned',
          amount: finalCommissionAmount.toString(),
          balanceAfter: newAvailableBalance.toString(),
          referralId: referralId,
          paymentTransactionId: paymentTransactionId || null,
          payoutId: null,
          description: `Commission earned from referral conversion. Conversion value: ${conversionValue}`,
          metadata: {},
          createdAt: new Date()
        });
    }

    return { referral, commissionAmount: finalCommissionAmount };
  } catch (error) {
    console.error('Error converting affiliate referral:', error);
    throw error;
  }
}


function generateReferralCode(): string {
  return 'REF_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
}

function getClientIP(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
         req.socket.remoteAddress ||
         '127.0.0.1';
}

function getDeviceType(userAgent: string): string {
  if (/Mobile|Android|iPhone|iPad/.test(userAgent)) {
    return /iPad/.test(userAgent) ? 'tablet' : 'mobile';
  }
  return 'desktop';
}

function getBrowser(userAgent: string): string {
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Edge')) return 'Edge';
  return 'Unknown';
}

function getOS(userAgent: string): string {
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iOS')) return 'iOS';
  return 'Unknown';
}

async function getCountryFromIP(_ipAddress: string): Promise<string> {


  return 'US';
}
