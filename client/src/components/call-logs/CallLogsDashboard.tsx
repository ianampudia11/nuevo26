import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  DollarSign,
  RefreshCw,
  Download,
  Search,
  Filter,
  Star,
  StarOff,
  MoreVertical,
  Play,
  FileText,
  Trash2,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Bot,
  TrendingUp
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import useSocket from '@/hooks/useSocket';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CallDetailsModal } from './CallDetailsModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useDebounce } from '@/hooks/use-debounce';
import { PermissionGate, usePermissions } from '@/hooks/usePermissions';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface CallLog {
  id: number;
  status: string;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string;
  durationSec: number | null;
  startedAt: string | null;
  cost: string | null;
  costCurrency: string | null;
  contact?: {
    id: number;
    name: string;
    phone: string;
  };
  flow?: {
    id: number;
    name: string;
  };
  isStarred: boolean;
  notes: string | null;
}

interface CallLogStats {
  totalCalls: number;
  inboundCalls: number;
  outboundCalls: number;
  avgDuration: number;
  successRate: number;
  totalCost: number;
  aiPoweredCalls: number;
  directCalls: number;
  avgAIResponseTime?: number;
  aiSuccessRate?: number;
}

export function CallLogsDashboard() {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [stats, setStats] = useState<CallLogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDirection, setFilterDirection] = useState<string>('all');
  const [filterCallType, setFilterCallType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedFlowId, setSelectedFlowId] = useState<string>('all');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);
  const [pagination, setPagination] = useState<{ page: number; limit: number; total: number; totalPages: number } | null>(null);
  const [selectedCall, setSelectedCall] = useState<CallLog | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [wsConnected, setWsConnected] = useState(true);
  const [selectedCallIds, setSelectedCallIds] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const { t } = useTranslation();
  const { onMessage } = useSocket('/ws');
  const queryClient = useQueryClient();
  const debouncedSearch = useDebounce(searchTerm, 500);
  const debouncedPhone = useDebounce(phoneNumber, 500);
  const { PERMISSIONS } = usePermissions();


  const { data: flowsData } = useQuery({
    queryKey: ['/api/flows'],
    queryFn: async () => {
      const res = await fetch('/api/flows');
      if (!res.ok) throw new Error('Failed to load flows');
      return res.json();
    }
  });


  const { data: callsData, refetch: refetchCalls } = useQuery({
    queryKey: ['/api/call-logs', filterStatus, filterDirection, filterCallType, debouncedSearch, debouncedPhone, selectedFlowId, startDate, endDate, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.append('status', filterStatus);
      if (filterDirection !== 'all') params.append('direction', filterDirection);
      if (filterCallType !== 'all') params.append('callType', filterCallType);
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (debouncedPhone) params.append('phoneNumber', debouncedPhone);
      if (selectedFlowId !== 'all') params.append('flowId', selectedFlowId);
      if (startDate) params.append('startDate', startDate.toISOString());
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        params.append('endDate', endOfDay.toISOString());
      }
      params.append('page', currentPage.toString());
      params.append('limit', pageSize.toString());

      const response = await fetch(`/api/call-logs?${params}`);
      const data = await response.json();
      if (data.success) {
        return data;
      }
      throw new Error(data.error);
    },
    refetchInterval: wsConnected ? false : 5000
  });


  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ['/api/call-logs/stats'],
    queryFn: async () => {
      const response = await fetch('/api/call-logs/stats');
      const data = await response.json();
      if (data.success) {
        return data.data;
      }
      throw new Error(data.error);
    }
  });

  useEffect(() => {
    if (callsData?.data) {
      setCalls(callsData.data);
      setPagination(callsData.pagination);
      setLoading(false);

      setSelectedCallIds(new Set());
    }
  }, [callsData]);


  useEffect(() => {
    setSelectedCallIds(new Set());
  }, [filterStatus, filterDirection, filterCallType, debouncedSearch, debouncedPhone, selectedFlowId, startDate, endDate, currentPage]);

  useEffect(() => {
    if (statsData) {
      setStats(statsData);
    }
  }, [statsData]);


  useEffect(() => {
    const unsubscribeCallStatus = onMessage('callStatusUpdate', (data) => {
      setWsConnected(true);
      if (data.data?.callId) {
        queryClient.invalidateQueries({ queryKey: ['/api/call-logs'] });
      }
    });

    const unsubscribeCallCompleted = onMessage('callCompleted', (data) => {
      setWsConnected(true);
      if (data.data?.callId) {
        queryClient.invalidateQueries({ queryKey: ['/api/call-logs'] });
        queryClient.invalidateQueries({ queryKey: ['/api/call-logs/stats'] });
        toast({
          title: t('call_logs.call_completed', 'Call Completed'),
          description: t('call_logs.call_finished', 'Call has finished processing.'),
        });
      }
    });

    const unsubscribeCallFailed = onMessage('callFailed', (data) => {
      setWsConnected(true);
      if (data.data?.callId) {
        queryClient.invalidateQueries({ queryKey: ['/api/call-logs'] });
        toast({
          title: t('call_logs.call_failed', 'Call Failed'),
          description: data.data?.error || t('call_logs.call_failed_message', 'Call failed to complete.'),
          variant: 'destructive'
        });
      }
    });

    return () => {
      unsubscribeCallStatus();
      unsubscribeCallCompleted();
      unsubscribeCallFailed();
    };
  }, [onMessage, queryClient, toast, t]);


  const updateCallMutation = useMutation({
    mutationFn: async ({ callId, updates }: { callId: number; updates: { notes?: string; isStarred?: boolean } }) => {
      const response = await fetch(`/api/call-logs/${callId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/call-logs'] });
    }
  });


  const deleteCallMutation = useMutation({
    mutationFn: async (callId: number) => {
      const response = await fetch(`/api/call-logs/${callId}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/call-logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/call-logs/stats'] });
      toast({
        title: t('call_logs.deleted', 'Call Deleted'),
        description: t('call_logs.deleted_successfully', 'Call log deleted successfully.'),
      });
    }
  });


  const bulkDeleteMutation = useMutation({
    mutationFn: async (callIds: number[]) => {
      const response = await fetch('/api/call-logs/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callIds })
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/call-logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/call-logs/stats'] });
      setSelectedCallIds(new Set());
      toast({
        title: t('call_logs.bulk_deleted', 'Calls Deleted'),
        description: t('call_logs.bulk_deleted_successfully', `${data.deletedCount} call log(s) deleted successfully.`),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message || t('call_logs.bulk_delete_failed', 'Failed to delete call logs.'),
        variant: 'destructive'
      });
    }
  });


  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const filters: any = {};
      if (filterStatus !== 'all') filters.status = filterStatus;
      if (filterDirection !== 'all') filters.direction = filterDirection;
      if (startDate) filters.startDate = startDate.toISOString();
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        filters.endDate = endOfDay.toISOString();
      }

      const response = await fetch('/api/call-logs/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters)
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/call-logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/call-logs/stats'] });
      setSelectedCallIds(new Set());
      toast({
        title: t('call_logs.cleared', 'Calls Cleared'),
        description: t('call_logs.cleared_successfully', `${data.deletedCount} call log(s) cleared successfully.`),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message || t('call_logs.clear_failed', 'Failed to clear call logs.'),
        variant: 'destructive'
      });
    }
  });

  const handleStarToggle = (call: CallLog) => {
    updateCallMutation.mutate({
      callId: call.id,
      updates: { isStarred: !call.isStarred }
    });
  };

  const handleDelete = (call: CallLog) => {
    if (confirm(t('call_logs.confirm_delete', 'Are you sure you want to delete this call log?'))) {
      deleteCallMutation.mutate(call.id);
    }
  };

  const handleBulkDelete = () => {
    if (selectedCallIds.size === 0) return;
    if (confirm(t('call_logs.confirm_bulk_delete', `Are you sure you want to delete ${selectedCallIds.size} call log(s)?`))) {
      bulkDeleteMutation.mutate(Array.from(selectedCallIds));
    }
  };

  const handleClearAll = () => {
    const filterText = [
      filterStatus !== 'all' ? `status: ${filterStatus}` : null,
      filterDirection !== 'all' ? `direction: ${filterDirection}` : null,
      startDate ? `from ${startDate.toLocaleDateString()}` : null,
      endDate ? `to ${endDate.toLocaleDateString()}` : null
    ].filter(Boolean).join(', ');

    const message = filterText
      ? t('call_logs.confirm_clear_filtered', `Are you sure you want to clear all call logs${filterText ? ` matching: ${filterText}` : ''}?`)
      : t('call_logs.confirm_clear_all', 'Are you sure you want to clear ALL call logs? This cannot be undone.');

    if (confirm(message)) {
      clearAllMutation.mutate();
    }
  };

  const handleSelectCall = (callId: number, checked: boolean) => {
    setSelectedCallIds(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(callId);
      } else {
        newSet.delete(callId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {

      setSelectedCallIds(new Set(calls.map(call => call.id)));
    } else {
      setSelectedCallIds(new Set());
    }
  };

  const isAllSelected = calls.length > 0 && calls.every(call => selectedCallIds.has(call.id));
  const isSomeSelected = calls.some(call => selectedCallIds.has(call.id));

  const handleExport = async (format: 'csv' | 'excel') => {
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.append('status', filterStatus);
      if (filterDirection !== 'all') params.append('direction', filterDirection);
      if (debouncedSearch) params.append('search', debouncedSearch);
      params.append('format', format);

      const response = await fetch(`/api/call-logs/export?${params}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `call-logs-${Date.now()}.${format === 'csv' ? 'csv' : 'xlsx'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: t('call_logs.exported', 'Export Successful'),
        description: t('call_logs.exported_message', 'Call logs exported successfully.'),
      });
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('call_logs.export_failed', 'Failed to export call logs.'),
        variant: 'destructive'
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; label: string }> = {
      'completed': { color: 'default', label: t('call_logs.status.completed', 'Completed') },
      'failed': { color: 'destructive', label: t('call_logs.status.failed', 'Failed') },
      'in-progress': { color: 'default', label: t('call_logs.status.in_progress', 'In Progress') },
      'ringing': { color: 'secondary', label: t('call_logs.status.ringing', 'Ringing') },
      'no-answer': { color: 'secondary', label: t('call_logs.status.no_answer', 'No Answer') },
      'busy': { color: 'secondary', label: t('call_logs.status.busy', 'Busy') }
    };

    const config = statusConfig[status] || { color: 'secondary', label: status };
    return (
      <Badge variant={config.color as any}>
        {config.label}
      </Badge>
    );
  };

  const formatDuration = (seconds: number | null | undefined) => {
    if (seconds === null || seconds === undefined) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{t('call_logs.title', 'Call Logs')}</h1>
          <div className="flex items-center gap-3">
            <p className="text-muted-foreground">
              {t('call_logs.description', 'View and manage all calls made through CallAgent')}
            </p>
            <div className="flex items-center gap-2 text-xs">
              <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-muted-foreground">
                {wsConnected ? t('call_logs.live_updates', 'Live updates') : t('call_logs.polling_mode', 'Polling mode')}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PermissionGate permission={PERMISSIONS.DELETE_CALL_LOGS}>
            {selectedCallIds.size > 0 && (
              <Button
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={bulkDeleteMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t('call_logs.delete_selected', `Delete Selected (${selectedCallIds.size})`)}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleClearAll}
              disabled={clearAllMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t('call_logs.clear_all', 'Clear All')}
            </Button>
          </PermissionGate>
          <Button
            variant="outline"
            onClick={() => {
              refetchCalls();
              refetchStats();
            }}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('common.refresh', 'Refresh')}
          </Button>
          <PermissionGate permission={PERMISSIONS.EXPORT_CALL_LOGS}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  {t('call_logs.export', 'Export')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleExport('csv')}>
                  {t('call_logs.export_csv', 'Export as CSV')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('excel')}>
                  {t('call_logs.export_excel', 'Export as Excel')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </PermissionGate>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('call_logs.total_calls', 'Total Calls')}</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? stats.totalCalls : <div className="animate-pulse bg-muted h-8 w-8 rounded"></div>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('call_logs.ai_powered', 'AI-Powered')}</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? stats.aiPoweredCalls : <div className="animate-pulse bg-muted h-8 w-8 rounded"></div>}
            </div>
            {stats && stats.totalCalls > 0 && (
              <p className="text-xs text-muted-foreground">
                {Math.round((stats.aiPoweredCalls / stats.totalCalls) * 100)}% of total
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('call_logs.direct_calls', 'Direct Calls')}</CardTitle>
            <PhoneOutgoing className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? stats.directCalls : <div className="animate-pulse bg-muted h-8 w-8 rounded"></div>}
            </div>
            {stats && stats.totalCalls > 0 && (
              <p className="text-xs text-muted-foreground">
                {Math.round((stats.directCalls / stats.totalCalls) * 100)}% of total
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('call_logs.avg_ai_response', 'Avg AI Response')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.avgAIResponseTime !== undefined ? (
                `${(stats.avgAIResponseTime / 1000).toFixed(1)}s`
              ) : (
                <div className="animate-pulse bg-muted h-8 w-12 rounded"></div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('call_logs.ai_success_rate', 'AI Success Rate')}</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.aiSuccessRate !== undefined ? (
                `${stats.aiSuccessRate}%`
              ) : (
                <div className="animate-pulse bg-muted h-8 w-12 rounded"></div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('call_logs.search_placeholder', 'Search by contact name...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <div className="w-[180px]">
          <Input
            placeholder={t('call_logs.phone_search', 'Phone number...')}
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-[240px] justify-start text-left font-normal",
                !startDate && !endDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {startDate && endDate ? (
                `${format(startDate, "MMM dd")} - ${format(endDate, "MMM dd")}`
              ) : startDate ? (
                format(startDate, "MMM dd, yyyy")
              ) : (
                <span>{t('call_logs.date_range', 'Date range')}</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={{ from: startDate, to: endDate }}
              onSelect={(range) => {
                setStartDate(range?.from);
                setEndDate(range?.to);
                setCurrentPage(1);
              }}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
        <Select value={selectedFlowId} onValueChange={(value) => {
          setSelectedFlowId(value);
          setCurrentPage(1);
        }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('call_logs.filter.flow', 'Flow')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('call_logs.filter.all', 'All')}</SelectItem>
            {flowsData?.map((flow: any) => (
              <SelectItem key={flow.id} value={flow.id.toString()}>
                {flow.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(value) => {
          setFilterStatus(value);
          setCurrentPage(1);
        }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('call_logs.filter.status', 'Status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('call_logs.filter.all', 'All')}</SelectItem>
            <SelectItem value="completed">{t('call_logs.filter.completed', 'Completed')}</SelectItem>
            <SelectItem value="failed">{t('call_logs.filter.failed', 'Failed')}</SelectItem>
            <SelectItem value="in-progress">{t('call_logs.filter.in_progress', 'In Progress')}</SelectItem>
            <SelectItem value="no-answer">{t('call_logs.filter.no_answer', 'No Answer')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterDirection} onValueChange={(value) => {
          setFilterDirection(value);
          setCurrentPage(1);
        }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('call_logs.filter.direction', 'Direction')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('call_logs.filter.all', 'All')}</SelectItem>
            <SelectItem value="inbound">{t('call_logs.direction.inbound', 'Inbound')}</SelectItem>
            <SelectItem value="outbound">{t('call_logs.direction.outbound', 'Outbound')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCallType} onValueChange={(value) => {
          setFilterCallType(value);
          setCurrentPage(1);
        }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('call_logs.filter.call_type', 'Call Type')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('call_logs.filter.all', 'All')}</SelectItem>
            <SelectItem value="ai-powered">
              <div className="flex items-center gap-2">
                <Bot className="h-3 w-3" />
                {t('call_logs.ai_powered', 'AI-Powered')}
              </div>
            </SelectItem>
            <SelectItem value="direct">{t('call_logs.direct_calls', 'Direct')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Call Logs Table */}
      <Card>
        <CardContent className="p-0">
          {calls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Phone className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('call_logs.no_calls_found', 'No calls found')}</h3>
              <p className="text-muted-foreground text-center">
                {t('call_logs.no_calls_message', 'No call logs match your filters.')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 w-12">
                      <PermissionGate permission={PERMISSIONS.DELETE_CALL_LOGS}>
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          ref={(input) => {
                            if (input) input.indeterminate = isSomeSelected && !isAllSelected;
                          }}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          onClick={(e) => e.stopPropagation()}
                          className="cursor-pointer"
                        />
                      </PermissionGate>
                    </th>
                    <th className="text-left p-4">{t('call_logs.table.status', 'Status')}</th>
                    <th className="text-left p-4">{t('call_logs.table.contact', 'Contact/Phone')}</th>
                    <th className="text-left p-4">{t('call_logs.table.direction', 'Direction')}</th>
                    <th className="text-left p-4">{t('call_logs.table.duration', 'Duration')}</th>
                    <th className="text-left p-4">{t('call_logs.table.flow', 'Flow')}</th>
                    <th className="text-left p-4">{t('call_logs.table.cost', 'Cost')}</th>
                    <th className="text-left p-4">{t('call_logs.table.started_at', 'Started At')}</th>
                    <th className="text-left p-4">{t('call_logs.table.actions', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((call) => (
                    <tr key={call.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => {
                      setSelectedCall(call);
                      setIsDetailsModalOpen(true);
                    }}>
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        <PermissionGate permission={PERMISSIONS.DELETE_CALL_LOGS}>
                          <input
                            type="checkbox"
                            checked={selectedCallIds.has(call.id)}
                            onChange={(e) => handleSelectCall(call.id, e.target.checked)}
                            onClick={(e) => e.stopPropagation()}
                            className="cursor-pointer"
                          />
                        </PermissionGate>
                      </td>
                      <td className="p-4">{getStatusBadge(call.status)}</td>
                      <td className="p-4">
                        {call.contact ? (
                          <div>
                            <div className="font-medium">{call.contact.name}</div>
                            <div className="text-sm text-muted-foreground">{call.to || call.from}</div>
                          </div>
                        ) : (
                          <div>{call.to || call.from}</div>
                        )}
                      </td>
                      <td className="p-4">
                        <Badge variant={call.direction === 'inbound' ? 'default' : 'secondary'}>
                          {call.direction === 'inbound' ? t('call_logs.direction.inbound', 'Inbound') : t('call_logs.direction.outbound', 'Outbound')}
                        </Badge>
                      </td>
                      <td className="p-4">{formatDuration(call.durationSec)}</td>
                      <td className="p-4">{call.flow?.name || '-'}</td>
                      <td className="p-4">
                        {call.cost ? `$${parseFloat(call.cost).toFixed(4)} ${call.costCurrency || 'USD'}` : '-'}
                      </td>
                      <td className="p-4">
                        {call.startedAt ? new Date(call.startedAt).toLocaleString() : '-'}
                      </td>
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => {
                              setSelectedCall(call);
                              setIsDetailsModalOpen(true);
                            }}>
                              <FileText className="h-4 w-4 mr-2" />
                              {t('call_logs.view_details', 'View Details')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStarToggle(call)}>
                              {call.isStarred ? (
                                <>
                                  <StarOff className="h-4 w-4 mr-2" />
                                  {t('call_logs.unstar', 'Unstar')}
                                </>
                              ) : (
                                <>
                                  <Star className="h-4 w-4 mr-2" />
                                  {t('call_logs.star', 'Star')}
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(call)} className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />
                              {t('call_logs.delete', 'Delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {t('call_logs.showing', 'Showing')} {(pagination.page - 1) * pagination.limit + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} {t('call_logs.of', 'of')} {pagination.total}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm">
              {t('call_logs.page', 'Page')} {pagination.page} {t('call_logs.of', 'of')} {pagination.totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={currentPage === pagination.totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Call Details Modal */}
      {selectedCall && (
        <CallDetailsModal
          isOpen={isDetailsModalOpen}
          onClose={() => {
            setIsDetailsModalOpen(false);
            setSelectedCall(null);
          }}
          callId={selectedCall.id}
        />
      )}
    </div>
  );
}
