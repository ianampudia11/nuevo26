import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';
import { useCurrency } from '@/contexts/currency-context';
import { 
  DollarSign, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  History,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AffiliateEarningsBalance {
  affiliateId: number;
  affiliateCode: string;
  totalEarned: number;
  availableBalance: number;
  appliedToPlans: number;
  pendingPayout: number;
  paidOut: number;
  lastUpdated: string;
}

interface AffiliateTransaction {
  id: number;
  transactionType: 'earned' | 'applied_to_plan' | 'payout' | 'adjustment';
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
  metadata: any;
}

export function AffiliateEarningsCard() {
  const { t, currentLanguage } = useTranslation();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();
  const [showTransactions, setShowTransactions] = useState(false);


  const { 
    data: balance, 
    isLoading: isLoadingBalance, 
    error: balanceError,
    refetch: refetchBalance 
  } = useQuery<{ success: boolean; data: AffiliateEarningsBalance }>({
    queryKey: ['/api/affiliate/earnings/balance'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/affiliate/earnings/balance');
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to fetch affiliate earnings');
      }
      return res.json();
    },
    retry: false
  });


  const { 
    data: transactions, 
    isLoading: isLoadingTransactions 
  } = useQuery<{ success: boolean; data: AffiliateTransaction[] }>({
    queryKey: ['/api/affiliate/earnings/transactions'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/affiliate/earnings/transactions?limit=20');
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to fetch affiliate transactions');
      }
      return res.json();
    },
    enabled: showTransactions,
    retry: false
  });


  const formatDate = (dateString: string) => {
    const languageCode = currentLanguage?.code || 'en';
    return new Date(dateString).toLocaleDateString(languageCode, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTransactionTypeLabel = (type: string) => {
    switch (type) {
      case 'earned':
        return { label: t('settings.affiliate_earnings.transaction_types.earned', 'Earned'), color: 'bg-primary/10 text-primary border border-primary/20' };
      case 'applied_to_plan':
        return { label: t('settings.affiliate_earnings.transaction_types.applied_to_plan', 'Applied to Plan'), color: 'bg-primary/10 text-primary border border-primary/20' };
      case 'payout':
        return { label: t('settings.affiliate_earnings.transaction_types.payout', 'Payout'), color: 'bg-accent/10 text-accent border border-accent/20' };
      case 'adjustment':
        return { label: t('settings.affiliate_earnings.transaction_types.adjustment', 'Adjustment'), color: 'bg-secondary/10 text-secondary border border-secondary/20' };
      default:
        return { label: type, color: 'bg-muted text-muted-foreground border border-border' };
    }
  };


  if (balanceError || (balance && !balance.success)) {
    return null;
  }

  if (isLoadingBalance) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-foreground" />
            {t('settings.affiliate_earnings.title', 'Affiliate Earnings')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!balance?.data) {
    return null;
  }

  const earningsData = balance.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-foreground" />
          {t('settings.affiliate_earnings.title', 'Affiliate Earnings')}
        </CardTitle>
        <CardDescription>
          {t('settings.affiliate_earnings.description', 'Your affiliate earnings and available credits')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Affiliate Code */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            {t('settings.affiliate_earnings.affiliate_code', 'Affiliate Code')}
          </span>
          <Badge variant="outline" className="font-mono">
            {earningsData.affiliateCode}
          </Badge>
        </div>

        <Separator />

        {/* Earnings Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              {t('settings.affiliate_earnings.total_earned', 'Total Earned')}
            </div>
            <div className="text-2xl font-bold text-primary">
              {formatCurrency(earningsData.totalEarned)}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              {t('settings.affiliate_earnings.available_balance', 'Available Balance')}
            </div>
            <div className="text-2xl font-bold text-primary">
              {formatCurrency(earningsData.availableBalance)}
            </div>
          </div>
        </div>

        {/* Additional Stats */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
          <div className="text-center">
            <div className="text-sm text-muted-foreground">
              {t('settings.affiliate_earnings.applied_to_plans', 'Applied to Plans')}
            </div>
            <div className="font-semibold text-primary">
              {formatCurrency(earningsData.appliedToPlans)}
            </div>
          </div>

          <div className="text-center">
            <div className="text-sm text-muted-foreground">
              {t('settings.affiliate_earnings.pending_payout', 'Pending Payout')}
            </div>
            <div className="font-semibold text-secondary">
              {formatCurrency(earningsData.pendingPayout)}
            </div>
          </div>

          <div className="text-center">
            <div className="text-sm text-muted-foreground">
              {t('settings.affiliate_earnings.paid_out', 'Paid Out')}
            </div>
            <div className="font-semibold text-primary">
              {formatCurrency(earningsData.paidOut)}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4">
          <div className="text-xs text-muted-foreground">
            {t('settings.affiliate_earnings.last_updated', 'Last updated')}: {formatDate(earningsData.lastUpdated)}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchBalance()}
              disabled={isLoadingBalance}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingBalance ? 'animate-spin' : ''}`} />
              {t('common.refresh', 'Refresh')}
            </Button>

            <Dialog open={showTransactions} onOpenChange={setShowTransactions}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <History className="h-4 w-4 mr-2" />
                  {t('settings.affiliate_earnings.view_history', 'View History')}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>
                    {t('settings.affiliate_earnings.transaction_history', 'Transaction History')}
                  </DialogTitle>
                  <DialogDescription>
                    {t('settings.affiliate_earnings.transaction_history_desc', 'Your recent affiliate earnings transactions')}
                  </DialogDescription>
                </DialogHeader>
                
                <ScrollArea className="h-[400px] pr-4">
                  {isLoadingTransactions ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : transactions?.data?.length ? (
                    <div className="space-y-4">
                      {transactions.data.map((transaction) => {
                        const typeInfo = getTransactionTypeLabel(transaction.transactionType);
                        return (
                          <div key={transaction.id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <Badge className={typeInfo.color}>
                                  {typeInfo.label}
                                </Badge>
                                <span className="text-sm font-medium">
                                  {formatCurrency(transaction.amount)}
                                </span>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {transaction.description}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatDate(transaction.createdAt)}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm text-muted-foreground">{t('settings.affiliate_earnings.balance_after', 'Balance After')}</div>
                              <div className="font-medium">
                                {formatCurrency(transaction.balanceAfter)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                      {t('settings.affiliate_earnings.no_transactions', 'No transactions found')}
                    </div>
                  )}
                </ScrollArea>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Info Note */}
        {earningsData.availableBalance > 0 && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-primary mt-0.5" />
              <div className="text-sm text-primary">
                {t('settings.affiliate_earnings.credit_info', 'You can apply your available balance as credits toward plan purchases during checkout.')}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
