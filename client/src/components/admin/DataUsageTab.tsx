import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useCompanyUsage, useOverrideCompanyUsage, useResetBandwidthUsage, useRecalculateCompanyUsage } from '@/hooks/use-company-usage';
import { 
  formatStorageSize, 
  getUsageStatusColor, 
  getUsageProgressColor, 
  getUsageStatusText,
  getStorageRecommendations,
  formatUsageChartData
} from '@/utils/storage';
import { 
  HardDrive, 
  Wifi, 
  FileText, 
  AlertTriangle, 
  CheckCircle, 
  Settings, 
  RefreshCw,
  TrendingUp,
  Calendar
} from 'lucide-react';

interface DataUsageTabProps {
  companyId: number;
}

export function DataUsageTab({ companyId }: DataUsageTabProps) {
  const { toast } = useToast();
  const { data: usage, isLoading, error, refetch } = useCompanyUsage(companyId);
  const overrideUsageMutation = useOverrideCompanyUsage(companyId);
  const resetBandwidthMutation = useResetBandwidthUsage(companyId);
  const recalculateUsageMutation = useRecalculateCompanyUsage(companyId);

  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideValues, setOverrideValues] = useState({
    currentStorageUsed: '',
    currentBandwidthUsed: '',
    filesCount: '',
    reason: ''
  });

  const handleOverrideUsage = async () => {
    try {
      const data: any = {
        reason: overrideValues.reason || 'Admin manual override'
      };

      if (overrideValues.currentStorageUsed) {
        data.currentStorageUsed = parseInt(overrideValues.currentStorageUsed);
      }
      if (overrideValues.currentBandwidthUsed) {
        data.currentBandwidthUsed = parseInt(overrideValues.currentBandwidthUsed);
      }
      if (overrideValues.filesCount) {
        data.filesCount = parseInt(overrideValues.filesCount);
      }

      await overrideUsageMutation.mutateAsync(data);
      
      toast({
        title: "Usage Updated",
        description: "Company usage has been manually overridden successfully.",
      });
      
      setOverrideDialogOpen(false);
      setOverrideValues({
        currentStorageUsed: '',
        currentBandwidthUsed: '',
        filesCount: '',
        reason: ''
      });
    } catch (error: any) {
      toast({
        title: "Override Failed",
        description: error.message || "Failed to override usage",
        variant: "destructive",
      });
    }
  };

  const handleResetBandwidth = async () => {
    try {
      await resetBandwidthMutation.mutateAsync();
      toast({
        title: "Bandwidth Reset",
        description: "Monthly bandwidth usage has been reset to zero.",
      });
    } catch (error: any) {
      toast({
        title: "Reset Failed",
        description: error.message || "Failed to reset bandwidth usage",
        variant: "destructive",
      });
    }
  };

  const handleRecalculateUsage = async () => {
    try {
      await recalculateUsageMutation.mutateAsync();
      toast({
        title: "Usage Recalculated",
        description: "Company usage has been recalculated from actual files.",
      });
    } catch (error: any) {
      toast({
        title: "Recalculation Failed",
        description: error.message || "Failed to recalculate usage",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2 mb-4"></div>
                  <div className="h-2 bg-gray-200 rounded w-full"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center py-8">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-red-600 mb-2">Failed to Load Usage Data</h3>
            <p className="text-muted-foreground mb-4">
              {error instanceof Error ? error.message : 'An error occurred while loading usage data'}
            </p>
            <Button onClick={() => refetch()} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!usage) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center py-8 text-muted-foreground">
            No usage data available for this company.
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = formatUsageChartData(usage);
  const recommendations = getStorageRecommendations(usage);

  return (
    <div className="space-y-6">
      {/* Usage Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Storage Usage */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage Usage</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatStorageSize(usage.currentUsage.storage ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              of {usage.limits.storage > 0 ? formatStorageSize(usage.limits.storage) : 'Unlimited'} limit
            </p>
            <div className="mt-4">
              <Progress 
                value={Math.min(100, Math.max(0, usage.percentages.storage ?? 0))} 
                className="w-full h-2"
              />
              <div className="flex justify-between items-center mt-2">
                <span className={`text-sm font-medium ${getUsageStatusColor(usage.percentages.storage ?? 0)}`}>
                  {(usage.percentages.storage ?? 0).toFixed(1)}%
                </span>
                <Badge variant={usage.status.storageExceeded ? "destructive" : usage.status.storageNearLimit ? "secondary" : "success"}>
                  {getUsageStatusText(usage.percentages.storage ?? 0)}
                </Badge>
              </div>
              {usage.limits.storage === 0 && usage.currentUsage.storage > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  No plan limit configured
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Bandwidth Usage */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bandwidth Usage</CardTitle>
            <Wifi className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatStorageSize(usage.currentUsage.bandwidth ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              of {usage.limits.bandwidth > 0 ? formatStorageSize(usage.limits.bandwidth) : 'Unlimited'} monthly limit
            </p>
            <div className="mt-4">
              <Progress 
                value={Math.min(100, Math.max(0, usage.percentages.bandwidth ?? 0))} 
                className="w-full h-2"
              />
              <div className="flex justify-between items-center mt-2">
                <span className={`text-sm font-medium ${getUsageStatusColor(usage.percentages.bandwidth ?? 0)}`}>
                  {(usage.percentages.bandwidth ?? 0).toFixed(1)}%
                </span>
                <Badge variant={usage.status.bandwidthExceeded ? "destructive" : usage.status.bandwidthNearLimit ? "secondary" : "success"}>
                  {getUsageStatusText(usage.percentages.bandwidth ?? 0)}
                </Badge>
              </div>
              {usage.limits.bandwidth === 0 && usage.currentUsage.bandwidth > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  No plan limit configured
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Files Count */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Files Count</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(usage.currentUsage.files ?? 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              of {usage.limits.totalFiles > 0 ? usage.limits.totalFiles.toLocaleString() : 'Unlimited'} limit
            </p>
            <div className="mt-4">
              <Progress 
                value={Math.min(100, Math.max(0, usage.percentages.files ?? 0))} 
                className="w-full h-2"
              />
              <div className="flex justify-between items-center mt-2">
                <span className={`text-sm font-medium ${getUsageStatusColor(usage.percentages.files ?? 0)}`}>
                  {(usage.percentages.files ?? 0).toFixed(1)}%
                </span>
                <Badge variant={usage.status.filesExceeded ? "destructive" : usage.status.filesNearLimit ? "secondary" : "success"}>
                  {getUsageStatusText(usage.percentages.files ?? 0)}
                </Badge>
              </div>
              {usage.limits.totalFiles === 0 && usage.currentUsage.files > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  No plan limit configured
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Plan Information */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Limits</CardTitle>
          <CardDescription>Current plan: {usage.planName}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-sm font-medium">Storage Limit</Label>
              <p className="text-lg font-semibold">{formatStorageSize(usage.limits.storage)}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Bandwidth Limit</Label>
              <p className="text-lg font-semibold">{formatStorageSize(usage.limits.bandwidth)}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">File Upload Limit</Label>
              <p className="text-lg font-semibold">{formatStorageSize(usage.limits.fileUpload)}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Total Files Limit</Label>
              <p className="text-lg font-semibold">{usage.limits.totalFiles.toLocaleString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {recommendations.map((recommendation, index) => (
                <li key={index} className="flex items-start">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{recommendation}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Admin Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Settings className="h-5 w-5 mr-2" />
            Admin Actions
          </CardTitle>
          <CardDescription>
            Administrative tools for managing company usage
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Settings className="h-4 w-4 mr-2" />
                  Override Usage
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Override Company Usage</DialogTitle>
                  <DialogDescription>
                    Manually set usage values for this company. Leave fields empty to keep current values.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="storage">Storage Used (MB)</Label>
                    <Input
                      id="storage"
                      type="number"
                      placeholder={`Current: ${usage.currentUsage.storage} MB`}
                      value={overrideValues.currentStorageUsed}
                      onChange={(e) => setOverrideValues(prev => ({ ...prev, currentStorageUsed: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="bandwidth">Bandwidth Used (MB)</Label>
                    <Input
                      id="bandwidth"
                      type="number"
                      placeholder={`Current: ${usage.currentUsage.bandwidth} MB`}
                      value={overrideValues.currentBandwidthUsed}
                      onChange={(e) => setOverrideValues(prev => ({ ...prev, currentBandwidthUsed: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="files">Files Count</Label>
                    <Input
                      id="files"
                      type="number"
                      placeholder={`Current: ${usage.currentUsage.files}`}
                      value={overrideValues.filesCount}
                      onChange={(e) => setOverrideValues(prev => ({ ...prev, filesCount: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="reason">Reason (Optional)</Label>
                    <Textarea
                      id="reason"
                      placeholder="Reason for manual override..."
                      value={overrideValues.reason}
                      onChange={(e) => setOverrideValues(prev => ({ ...prev, reason: e.target.value }))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOverrideDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleOverrideUsage}
                    disabled={overrideUsageMutation.isPending}
                  >
                    {overrideUsageMutation.isPending ? "Updating..." : "Update Usage"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button 
              variant="outline" 
              onClick={handleResetBandwidth}
              disabled={resetBandwidthMutation.isPending}
            >
              <Calendar className="h-4 w-4 mr-2" />
              {resetBandwidthMutation.isPending ? "Resetting..." : "Reset Monthly Bandwidth"}
            </Button>

            <Button 
              variant="outline" 
              onClick={handleRecalculateUsage}
              disabled={recalculateUsageMutation.isPending}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {recalculateUsageMutation.isPending ? "Recalculating..." : "Recalculate Usage"}
            </Button>

            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Data
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Last Updated */}
      {usage.lastUpdated && (
        <div className="text-sm text-muted-foreground text-center">
          Last updated: {new Date(usage.lastUpdated).toLocaleString()}
        </div>
      )}
    </div>
  );
}
