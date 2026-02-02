import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { formatPlanDurationForDisplay } from '@/utils/plan-duration';
import { useCurrency } from '@/contexts/currency-context';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Pause,
  Play,
  Calendar,
  TrendingDown,
  Users,
  MessageSquare,
  Database,
  Zap,
  Clock,
  Shield
} from "lucide-react";

interface SubscriptionStatus {
  status: string;
  endDate?: string;
  autoRenewal: boolean;
  daysRemaining?: number;
  isInGracePeriod: boolean;
  gracePeriodEndDate?: string;
}

interface UsageStatus {
  companyId: number;
  metrics: UsageMetric[];
  overallStatus: 'normal' | 'warning' | 'critical' | 'blocked';
  blockedFeatures: string[];
}

interface UsageMetric {
  name: string;
  currentUsage: number;
  limit: number;
  softLimit: number;
  percentage: number;
  softLimitReached: boolean;
  hardLimitReached: boolean;
  lastWarning?: string;
}

interface PauseStatus {
  isPaused: boolean;
  pauseStartDate?: string;
  pauseEndDate?: string;
  daysRemaining?: number;
  canResume: boolean;
  autoResumeScheduled: boolean;
}

interface DunningStatus {
  companyId: number;
  totalAttempts: number;
  lastAttemptDate?: string;
  nextAttemptDate?: string;
  status: 'active' | 'completed' | 'failed' | 'grace_period';
  remainingAttempts: number;
}

export function SubscriptionManagement() {
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [showDowngradeDialog, setShowDowngradeDialog] = useState(false);
  const [pauseDays, setPauseDays] = useState(30);
  const [selectedDowngradePlan, setSelectedDowngradePlan] = useState<number | null>(null);


  const { data: planInfo, isLoading: isLoadingPlanInfo } = useQuery({
    queryKey: ['/api/user/plan-info'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/user/plan-info');
      if (!res.ok) throw new Error('Failed to fetch plan info');
      return res.json();
    }
  });


  const { data: subscriptionStatus, isLoading: isLoadingStatus } = useQuery<SubscriptionStatus>({
    queryKey: ['/api/enhanced-subscription/status'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/enhanced-subscription/status');
      if (!res.ok) throw new Error('Failed to fetch subscription status');
      return res.json();
    }
  });


  const { data: usageStatus, isLoading: isLoadingUsage } = useQuery<UsageStatus>({
    queryKey: ['/api/enhanced-subscription/usage/status'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/enhanced-subscription/usage/status');
      if (!res.ok) throw new Error('Failed to fetch usage status');
      return res.json();
    }
  });


  const { data: pauseStatus, isLoading: isLoadingPause } = useQuery<PauseStatus>({
    queryKey: ['/api/enhanced-subscription/pause/status'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/enhanced-subscription/pause/status');
      if (!res.ok) throw new Error('Failed to fetch pause status');
      return res.json();
    }
  });


  const { data: dunningStatus, isLoading: isLoadingDunning } = useQuery<DunningStatus>({
    queryKey: ['/api/enhanced-subscription/dunning/status'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/enhanced-subscription/dunning/status');
      if (!res.ok) throw new Error('Failed to fetch dunning status');
      return res.json();
    }
  });


  const pauseSubscriptionMutation = useMutation({
    mutationFn: async (days: number) => {
      const pauseUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const res = await apiRequest('POST', '/api/enhanced-subscription/pause', {
        pauseUntil: pauseUntil.toISOString(),
        reason: 'customer_request'
      });
      if (!res.ok) throw new Error('Failed to pause subscription');
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Subscription Paused",
        description: "Your subscription has been paused successfully.",
      });
      setShowPauseDialog(false);
      queryClient.invalidateQueries({ queryKey: ['/api/enhanced-subscription/pause/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/enhanced-subscription/status'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to pause subscription: ${error.message}`,
        variant: "destructive",
      });
    },
  });


  const resumeSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/enhanced-subscription/resume');
      if (!res.ok) throw new Error('Failed to resume subscription');
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Subscription Resumed",
        description: "Your subscription has been resumed successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/enhanced-subscription/pause/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/enhanced-subscription/status'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to resume subscription: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-primary/10 text-primary border border-primary/20"><CheckCircle2 className="w-3 h-3 mr-1" />Active</Badge>;
      case 'paused':
        return <Badge className="bg-secondary/10 text-secondary border border-secondary/20"><Pause className="w-3 h-3 mr-1" />Paused</Badge>;
      case 'grace_period':
        return <Badge className="bg-secondary/10 text-secondary border border-secondary/20"><Clock className="w-3 h-3 mr-1" />Grace Period</Badge>;
      case 'past_due':
        return <Badge className="bg-destructive/10 text-destructive border border-destructive/20"><AlertTriangle className="w-3 h-3 mr-1" />Past Due</Badge>;
      case 'trial':
        return <Badge className="bg-accent/10 text-accent border border-accent/20"><Zap className="w-3 h-3 mr-1" />Trial</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getUsageIcon = (metricName: string) => {
    switch (metricName) {
      case 'users':
        return <Users className="w-4 h-4" />;
      case 'contacts':
        return <Users className="w-4 h-4" />;
      case 'messages':
        return <MessageSquare className="w-4 h-4" />;
      case 'storage_mb':
        return <Database className="w-4 h-4" />;
      default:
        return <Zap className="w-4 h-4" />;
    }
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 95) return 'text-destructive';
    if (percentage >= 80) return 'text-secondary';
    return 'text-primary';
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 95) return 'bg-destructive';
    if (percentage >= 80) return 'bg-secondary';
    return 'bg-primary';
  };

  if (isLoadingPlanInfo || isLoadingStatus || isLoadingUsage || isLoadingPause || isLoadingDunning) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Subscription */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-foreground" />
            Current Subscription
          </CardTitle>
          <CardDescription>
            Your active plan and subscription details
          </CardDescription>
        </CardHeader>
        <CardContent>
          {planInfo && planInfo.plan ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{planInfo.plan.name}</h3>
                  <p className="text-sm text-muted-foreground">{planInfo.plan.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(planInfo.plan.price)}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatPlanDurationForDisplay(planInfo.plan)}
                  </p>
                </div>
              </div>

            </div>
          ) : (
            <div className="text-center py-8">
              <div className="bg-secondary/10 border border-secondary/20 rounded-lg p-4">
                <AlertTriangle className="h-8 w-8 text-secondary mx-auto mb-2" />
                <h3 className="text-lg font-medium text-secondary mb-1">No Active Subscription</h3>
                <p className="text-sm text-secondary">Select a plan below to subscribe</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subscription Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-foreground" />
            Subscription Status
          </CardTitle>
          <CardDescription>
            Current status and management options for your subscription
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Current Status</p>
                <div className="mt-1">
                  {subscriptionStatus && getStatusBadge(subscriptionStatus.status)}
                </div>
              </div>
              {subscriptionStatus?.endDate && (
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">
                    {subscriptionStatus.status === 'active' ? 'Renews on' : 'Expires on'}
                  </p>
                  <p className="font-medium text-foreground">
                    {new Date(subscriptionStatus.endDate).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>

            {/* Grace Period Warning */}
            {subscriptionStatus?.isInGracePeriod && (
              <Alert className="border-secondary/20 bg-secondary/10">
                <AlertTriangle className="h-4 w-4 text-secondary" />
                <AlertTitle>Grace Period Active</AlertTitle>
                <AlertDescription>
                  Your subscription is in a grace period until{' '}
                  {subscriptionStatus.gracePeriodEndDate && 
                    new Date(subscriptionStatus.gracePeriodEndDate).toLocaleDateString()
                  }. Please update your payment method to avoid service interruption.
                </AlertDescription>
              </Alert>
            )}

            {/* Dunning Status */}
            {dunningStatus?.status === 'active' && (
              <Alert className="border-destructive/20 bg-destructive/10">
                <XCircle className="h-4 w-4 text-destructive" />
                <AlertTitle>Payment Retry in Progress</AlertTitle>
                <AlertDescription>
                  We're attempting to process your payment. Attempt {dunningStatus.totalAttempts} of {dunningStatus.totalAttempts + dunningStatus.remainingAttempts}.
                  {dunningStatus.nextAttemptDate && (
                    <> Next attempt: {new Date(dunningStatus.nextAttemptDate).toLocaleDateString()}</>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Pause Status */}
            {pauseStatus?.isPaused && (
              <Alert className="border-primary/20 bg-primary/10">
                <Pause className="h-4 w-4 text-primary" />
                <AlertTitle>Subscription Paused</AlertTitle>
                <AlertDescription>
                  Your subscription is paused until{' '}
                  {pauseStatus.pauseEndDate && 
                    new Date(pauseStatus.pauseEndDate).toLocaleDateString()
                  }. 
                  {pauseStatus.daysRemaining && (
                    <> {pauseStatus.daysRemaining} days remaining.</>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-4">
              {pauseStatus?.isPaused ? (
                <Button
                  onClick={() => resumeSubscriptionMutation.mutate()}
                  disabled={resumeSubscriptionMutation.isPending}
                  className="flex items-center gap-2"
                >
                  {resumeSubscriptionMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Resume Subscription
                </Button>
              ) : (
                subscriptionStatus?.status === 'active' && (
                  <Button
                    variant="outline"
                    onClick={() => setShowPauseDialog(true)}
                    className="flex items-center gap-2"
                  >
                    <Pause className="w-4 h-4" />
                    Pause Subscription
                  </Button>
                )
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Monitoring */}
      {/* <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="w-5 h-5" />
            Usage Monitoring
          </CardTitle>
          <CardDescription>
            Track your current usage against plan limits
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usageStatus?.overallStatus === 'blocked' && (
            <Alert className="border-red-200 bg-red-50 mb-4">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Usage Limits Exceeded</AlertTitle>
              <AlertDescription>
                Some features are currently blocked due to usage limits. 
                Blocked features: {usageStatus.blockedFeatures.join(', ')}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            {usageStatus?.metrics.map((metric) => (
              <div key={metric.name} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getUsageIcon(metric.name)}
                    <span className="font-medium capitalize">
                      {metric.name.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className={`font-medium ${getUsageColor(metric.percentage)}`}>
                      {metric.currentUsage} / {metric.limit}
                    </span>
                    <span className="text-sm text-gray-500 ml-2">
                      ({metric.percentage}%)
                    </span>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(metric.percentage)}`}
                    style={{ width: `${Math.min(metric.percentage, 100)}%` }}
                  />
                </div>
                {metric.softLimitReached && (
                  <p className="text-xs text-yellow-600">
                    Soft limit reached - consider upgrading your plan
                  </p>
                )}
                {metric.hardLimitReached && (
                  <p className="text-xs text-red-600">
                    Hard limit reached - some features may be restricted
                  </p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card> */}

      {/* Pause Dialog */}
      <Dialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pause Subscription</DialogTitle>
            <DialogDescription>
              Temporarily pause your subscription. Your data will be preserved and you can resume anytime.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Pause Duration</label>
              <select
                value={pauseDays}
                onChange={(e) => setPauseDays(Number(e.target.value))}
                className="w-full mt-1 p-2 border rounded-md"
              >
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </select>
            </div>
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                During the pause, you won't be charged, but access to premium features will be limited.
                Your subscription will automatically resume after the selected period.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPauseDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => pauseSubscriptionMutation.mutate(pauseDays)}
              disabled={pauseSubscriptionMutation.isPending}
            >
              {pauseSubscriptionMutation.isPending && (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              )}
              Pause Subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
