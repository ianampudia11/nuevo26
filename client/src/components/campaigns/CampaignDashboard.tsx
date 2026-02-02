import React, { useState, useEffect } from 'react';
import { Link } from 'wouter';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus,
  Play,
  Pause,
  Users,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Trash2,
  Edit,
  FileText
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import useSocket from '@/hooks/useSocket';
import { CampaignDetailsModal } from './CampaignDetailsModal';
import { WhatsAppCampaign, WhatsAppCampaignStats } from '@/types/whatsapp-campaign';
import { WHATSAPP_CHANNEL_TYPES } from '@/lib/whatsapp-constants';




export function CampaignDashboard() {
  const [campaigns, setCampaigns] = useState<WhatsAppCampaign[]>([]);
  const [stats, setStats] = useState<WhatsAppCampaignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    campaign: WhatsAppCampaign | null;
  }>({ isOpen: false, campaign: null });

  const [campaignDetailsModal, setCampaignDetailsModal] = useState<{
    isOpen: boolean;
    campaignId: number | null;
    campaignName: string;
  }>({ isOpen: false, campaignId: null, campaignName: '' });

  const [debuggingStates, setDebuggingStates] = useState<{
    [campaignId: number]: {
      recalculating: boolean;
    }
  }>({});
  const [wsConnected, setWsConnected] = useState(true);
  const { toast } = useToast();
  const { t } = useTranslation();
  const { onMessage } = useSocket('/ws');

  const updateQueue = React.useRef<Map<number, any>>(new Map());
  const lastUpdateTime = React.useRef<Map<number, number>>(new Map());
  const updateTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const applyQueuedUpdates = React.useCallback(() => {
    if (updateQueue.current.size === 0) return;

    setCampaigns(prev => prev.map(campaign => {
      const update = updateQueue.current.get(campaign.id);
      if (update) {
        return { ...campaign, ...update };
      }
      return campaign;
    }));

    updateQueue.current.clear();
  }, []);

  const throttledUpdateCampaign = React.useCallback((campaignId: number, updateData: any) => {
    const now = Date.now();

    updateQueue.current.set(campaignId, updateData);

    applyQueuedUpdates();
    lastUpdateTime.current.set(campaignId, now);

  }, [applyQueuedUpdates]);

  useEffect(() => {
    fetchCampaigns();
    fetchStats();
  }, [filter]);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;

    const runningCampaigns = campaigns.filter(c => c.status === 'running');
    if (runningCampaigns.length > 0) {
      pollInterval = setInterval(() => {
        fetchCampaigns();
      }, 2000);
    } else if (!wsConnected) {
      pollInterval = setInterval(() => {
        fetchCampaigns();
      }, 5000);
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [wsConnected, campaigns]);

  useEffect(() => {
    const unsubscribeCampaignUpdate = onMessage('campaignStatusUpdate', (data) => {
      setWsConnected(true);

      if (data.data?.eventType === 'campaign_completed') {
        setCampaigns(prev => prev.map(campaign =>
          campaign.id === data.data.campaignId
            ? {
                ...campaign,
                status: 'completed' as const,
                ...(data.data.totalRecipients !== undefined && {
                  totalRecipients: data.data.totalRecipients,
                  processedRecipients: (data.data.successfulSends || 0) + (data.data.failedSends || 0),
                  successfulSends: data.data.successfulSends || 0,
                  failedSends: data.data.failedSends || 0
                })
              }
            : campaign
        ));

        toast({
          title: t('campaigns.completed', 'Campaign Completed'),
          description: t('campaigns.finished_processing', 'Campaign "{{name}}" has finished processing.', { name: data.data.campaignName }),
        });

        fetchStats();
        fetchCampaigns();
      } else if (data.data?.eventType === 'message_sent' && data.data?.progress) {
        throttledUpdateCampaign(data.data.campaignId, {
          processedRecipients: data.data.progress.processedRecipients,
          successfulSends: data.data.progress.successfulSends,
          failedSends: data.data.progress.failedSends,
          totalRecipients: data.data.progress.totalRecipients
        });

        if (stats) {
          setStats(prev => prev ? {
            ...prev,
            messagesDelivered: prev.messagesDelivered + 1
          } : null);
        }
      } else if (data.data?.eventType === 'message_failed' && data.data?.progress) {
        throttledUpdateCampaign(data.data.campaignId, {
          processedRecipients: data.data.progress.processedRecipients,
          successfulSends: data.data.progress.successfulSends,
          failedSends: data.data.progress.failedSends,
          totalRecipients: data.data.progress.totalRecipients
        });
      }
    });

    const connectionHealthCheck = setInterval(() => {
      const lastMessageTime = lastUpdateTime.current.get(-1) || Date.now();
      if (Date.now() - lastMessageTime > 30000) {
        setWsConnected(false);
      }
    }, 10000);

    return () => {
      unsubscribeCampaignUpdate();
      clearInterval(connectionHealthCheck);
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [onMessage, toast, stats, throttledUpdateCampaign]);

  const fetchCampaigns = async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') {
        params.append('status', filter);
      }

      const response = await fetch(`/api/campaigns?${params}`);
      const data = await response.json();

      if (data.success) {
        const campaignsWithDefaults = data.data.map((campaign: WhatsAppCampaign) => ({
          ...campaign,
          processedRecipients: campaign.processedRecipients || 0,
          successfulSends: campaign.successfulSends || 0,
          failedSends: campaign.failedSends || 0,
          totalRecipients: campaign.totalRecipients || 0,

          deliveryReceipts: campaign.deliveryReceipts || 0,
          readReceipts: campaign.readReceipts || 0
        }));
        setCampaigns(campaignsWithDefaults);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('campaigns.fetch_failed', 'Failed to fetch campaigns'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/campaigns/stats');
      const data = await response.json();

      if (data.success) {
        setStats(data.data);
      } else {
        toast({
          title: t('common.error', 'Error'),
          description: t('campaigns.stats_fetch_failed', 'Failed to fetch campaign statistics'),
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('campaigns.stats_fetch_failed', 'Failed to fetch campaign statistics'),
        variant: 'destructive'
      });
    }
  };

  const handleCampaignAction = async (campaignId: number, action: 'start' | 'pause' | 'resume') => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/${action}`, {
        method: 'POST'
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: t('common.success', 'Success'),
          description: data.data.message
        });
        fetchCampaigns();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('campaigns.action_failed', 'Failed to {{action}} campaign', { action }),
        variant: 'destructive'
      });
    }
  };

  const handleDeleteCampaign = async (campaign: WhatsAppCampaign) => {
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: t('common.success', 'Success'),
          description: t('campaigns.deleted_successfully', 'Campaign "{{name}}" deleted successfully', { name: campaign.name })
        });
        fetchCampaigns();
        fetchStats();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('campaigns.delete_failed', 'Failed to delete campaign'),
        variant: 'destructive'
      });
    } finally {
      setDeleteConfirmation({ isOpen: false, campaign: null });
    }
  };

  const openDeleteConfirmation = (campaign: WhatsAppCampaign) => {
    setDeleteConfirmation({ isOpen: true, campaign });
  };

  const getStatusBadge = (status: WhatsAppCampaign['status']) => {
    const statusConfig = {
      draft: { color: 'secondary', icon: Clock },
      scheduled: { color: 'default', icon: Clock },
      running: { color: 'default', icon: Play },
      paused: { color: 'secondary', icon: Pause },
      completed: { color: 'default', icon: CheckCircle },
      cancelled: { color: 'secondary', icon: XCircle },
      failed: { color: 'destructive', icon: AlertCircle }
    };

    const config = statusConfig[status];
    const Icon = config.icon;

    return (
      <Badge variant={config.color as any} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {t(`campaigns.status.${status}`, status.charAt(0).toUpperCase() + status.slice(1))}
      </Badge>
    );
  };

  const getActionButtons = (campaign: WhatsAppCampaign) => {
    const canEdit = !['running', 'processing'].includes(campaign.status);
    const canDelete = !['running', 'processing'].includes(campaign.status);

    const actionButton = (() => {
      switch (campaign.status) {
        case 'draft':
        case 'scheduled':
          return (
            <Button
              size="sm"
              onClick={() => handleCampaignAction(campaign.id, 'start')}
              className="flex items-center gap-1"
            >
              <Play className="w-3 h-3" />
              {t('campaigns.start', 'Start')}
            </Button>
          );
        case 'running':
          return (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleCampaignAction(campaign.id, 'pause')}
              className="flex items-center gap-1"
            >
              <Pause className="w-3 h-3" />
              {t('campaigns.pause', 'Pause')}
            </Button>
          );
        case 'paused':
          return (
            <Button
              size="sm"
              onClick={() => handleCampaignAction(campaign.id, 'resume')}
              className="flex items-center gap-1"
            >
              <Play className="w-3 h-3" />
              {t('campaigns.resume', 'Resume')}
            </Button>
          );
        default:
          return null;
      }
    })();

    return (
      <div className="flex items-center gap-2">
        {actionButton}
        {canEdit && (
          <Link href={`/campaigns/${campaign.id}/edit`}>
            <Button
              size="sm"
              variant="outline"
              className="flex items-center gap-1"
            >
              <Edit className="w-3 h-3" />
              {t('common.edit', 'Edit')}
            </Button>
          </Link>
        )}
        {canDelete && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => openDeleteConfirmation(campaign)}
            className="flex items-center gap-1 text-destructive hover:text-destructive"
          >
            <Trash2 className="w-3 h-3" />
            {t('common.delete', 'Delete')}
          </Button>
        )}
      </div>
    );
  };

  const calculateProgress = (campaign: WhatsAppCampaign) => {
    if (campaign.totalRecipients === 0) return 0;
    const progress = Math.round((campaign.processedRecipients / campaign.totalRecipients) * 100);
    return progress;
  };


  const recalculateCampaignStats = async (campaign: WhatsAppCampaign) => {
    setDebuggingStates(prev => ({
      ...prev,
      [campaign.id]: { recalculating: true }
    }));

    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/recalculate-stats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        toast({
          title: t('campaigns.stats_recalculated', 'Stats Recalculated'),
          description: t('campaigns.stats_updated', 'Campaign statistics have been updated.'),
        });
        await fetchCampaigns();
      } else {
        toast({
          title: t('common.error', 'Error'),
          description: t('campaigns.stats_recalc_failed', 'Failed to recalculate stats: {{error}}', { error: data.error }),
          variant: 'destructive'
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('campaigns.unknown_error', 'Unknown error occurred');
      toast({
        title: t('common.error', 'Error'),
        description: t('campaigns.network_error', 'Network error: {{error}}', { error: errorMessage }),
        variant: 'destructive'
      });
    } finally {
      setDebuggingStates(prev => ({
        ...prev,
        [campaign.id]: { recalculating: false }
      }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl">{t('nav.campaigns', 'Campaign Dashboard')}</h1>
          <div className="flex items-center gap-3">
            <p className="text-muted-foreground">
              {t('campaigns.dashboard_description', 'Manage and monitor your mass messaging campaigns')}
            </p>
            <div className="flex items-center gap-2 text-xs">
              <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500 dark:bg-green-600' : 'bg-red-500 dark:bg-red-600'}`}></div>
              <span className="text-muted-foreground">
                {wsConnected ? t('campaigns.live_updates', 'Live updates') : t('campaigns.polling_mode', 'Polling mode')}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              await fetchCampaigns();
              await fetchStats();
            }}
            className="flex items-center gap-2"
          >
            <Users className="w-4 h-4" />
            {t('campaigns.refresh', 'Refresh')}
          </Button>
          <Link href="/campaigns/new">
            <Button className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              {t('campaigns.create_campaign', 'Create Campaign')}
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('campaigns.total_campaigns', 'Total Campaigns')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? stats.totalCampaigns : (
                <div className="animate-pulse bg-muted h-8 w-8 rounded"></div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('campaigns.active_campaigns', 'Active Campaigns')}</CardTitle>
            <Play className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? stats.activeCampaigns : (
                <div className="animate-pulse bg-muted h-8 w-8 rounded"></div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('campaigns.total_recipients', 'Total Recipients')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? stats.totalRecipients.toLocaleString() : (
                <div className="animate-pulse bg-muted h-8 w-16 rounded"></div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('campaigns.messages_delivered', 'Messages Delivered')}</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? stats.messagesDelivered.toLocaleString() : (
                <div className="animate-pulse bg-muted h-8 w-16 rounded"></div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('campaigns.delivery_rate', 'Delivery Rate')}</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? `${stats.deliveryRate.toFixed(1)}%` : (
                <div className="animate-pulse bg-muted h-8 w-12 rounded"></div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex space-x-2">
        {['all', 'draft', 'scheduled', 'running', 'paused', 'completed'].map((status) => (
          <Button
            key={status}
            variant={filter === status ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(status)}
          >
            {t(`campaigns.filter.${status}`, status.charAt(0).toUpperCase() + status.slice(1))}
          </Button>
        ))}
      </div>

      <div className="grid gap-4">
        {campaigns.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('campaigns.no_campaigns_found', 'No campaigns found')}</h3>
              <p className="text-muted-foreground text-center mb-4">
                {t('campaigns.get_started_message', 'Get started by creating your first mass messaging campaign')}
              </p>
              <Link href="/campaigns/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  {t('campaigns.create_campaign', 'Create Campaign')}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          campaigns.map((campaign) => (
            <Card key={campaign.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      {campaign.name}
                      {getStatusBadge(campaign.status)}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {campaign.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getActionButtons(campaign)}
                    {campaign.status === 'completed' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setCampaignDetailsModal({
                            isOpen: true,
                            campaignId: campaign.id,
                            campaignName: campaign.name
                          })}
                          title="View detailed campaign results and export data"
                        >
                          <FileText className="w-3 h-3 mr-1" />
                          {t('campaigns.details', 'Details')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => recalculateCampaignStats(campaign)}
                          disabled={debuggingStates[campaign.id]?.recalculating}
                          title="Recalculate Campaign Statistics - Force update from database"
                        >
                          {debuggingStates[campaign.id]?.recalculating ? (
                            <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            '🔄'
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">{t('campaigns.recipients', 'Recipients')}</p>
                    <p className="font-medium">{campaign.totalRecipients.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('campaigns.progress', 'Progress')}</p>
                    <p className="font-medium">{calculateProgress(campaign)}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('campaigns.delivered', 'Delivered')}</p>
                    <p className="font-medium">{campaign.successfulSends.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('campaigns.failed', 'Failed')}</p>
                    <p className="font-medium">{campaign.failedSends.toLocaleString()}</p>
                  </div>
                </div>

                {campaign.status === 'running' && (
                  <div className="mt-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="flex items-center gap-2">
                        {t('campaigns.progress', 'Progress')}
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      </span>
                      <span className="font-medium">{calculateProgress(campaign)}%</span>
                    </div>
                    <div className="w-full  rounded-full h-3 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-primary to-primary/80 h-3 rounded-full transition-all duration-500 ease-out relative"
                        style={{ width: `${calculateProgress(campaign)}%` }}
                      >
                        <div className="absolute inset-0 bg-foreground/20 animate-pulse rounded-full"></div>
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>{campaign.processedRecipients.toLocaleString()} {t('campaigns.processed', 'processed')}</span>
                      <span>{campaign.totalRecipients.toLocaleString()} {t('campaigns.total', 'total')}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <AlertDialog
        open={deleteConfirmation.isOpen}
        onOpenChange={(open) => !open && setDeleteConfirmation({ isOpen: false, campaign: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('campaigns.delete_campaign', 'Delete Campaign')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('campaigns.delete_confirmation', 'Are you sure you want to delete the campaign "{{name}}"? This action cannot be undone and all campaign data will be permanently removed.', { name: deleteConfirmation.campaign?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmation.campaign && handleDeleteCampaign(deleteConfirmation.campaign)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('campaigns.delete_campaign', 'Delete Campaign')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CampaignDetailsModal
        isOpen={campaignDetailsModal.isOpen}
        onClose={() => setCampaignDetailsModal({ isOpen: false, campaignId: null, campaignName: '' })}
        campaignId={campaignDetailsModal.campaignId || 0}
        campaignName={campaignDetailsModal.campaignName}
      />
    </div>
  );
}
