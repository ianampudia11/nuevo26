import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Users,
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertCircle,
  Download,
  Mail,
  CheckCircle,
  Eye,
  Edit,
  Plus,
  UserPlus,
  Target,
  CreditCard,
  BarChart3,
  ArrowUpIcon,
  ArrowDownIcon,
  Calendar,
  Filter,
  SortAsc,
  SortDesc,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Copy,
  ExternalLink
} from "lucide-react";
import { formatDate, cn } from "@/lib/utils";
import { useCurrency } from "@/contexts/currency-context";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Bar,
  BarChart,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  FunnelChart,
  Funnel,
  LabelList
} from 'recharts';

interface AffiliateMetrics {
  totalAffiliates: number;
  activeAffiliates: number;
  pendingAffiliates: number;
  inactiveAffiliates: number;
  totalReferrals: number;
  convertedReferrals: number;
  conversionRate: number;
  totalCommissionEarned: number;
  averageCommissionPerAffiliate: number;
  lifetimeValue: number;
  pendingPayouts: {
    count: number;
    amount: number;
  };

  previousPeriod: {
    totalAffiliates: number;
    totalReferrals: number;
    conversionRate: number;
    totalCommissionEarned: number;
  };

  performanceTrends: Array<{
    date: string;
    revenue: number;
    conversions: number;
    signups: number;
    affiliates: number;
  }>;

  statusDistribution: Array<{
    status: string;
    count: number;
    percentage: number;
  }>;

  topPerformers: Array<{
    id: number;
    name: string;
    revenue: number;
    conversions: number;
    conversionRate: number;
  }>;

  conversionFunnel: Array<{
    stage: string;
    count: number;
    percentage: number;
  }>;
}

interface Affiliate {
  id: number;
  affiliateCode: string;
  name: string;
  email: string;
  phone?: string;
  website?: string;
  status: 'pending' | 'active' | 'suspended' | 'rejected';
  businessName?: string;
  defaultCommissionRate: number;
  commissionType: 'percentage' | 'fixed' | 'tiered';
  totalReferrals: number;
  successfulReferrals: number;
  totalEarnings: number;
  pendingEarnings: number;
  paidEarnings: number;
  createdAt: string;
  updatedAt: string;
}

interface PaginatedAffiliates {
  data: Affiliate[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface AffiliateReferral {
  id: number;
  affiliateId: number;
  affiliateName: string;
  affiliateCode: string;
  referralCode: string;
  referredEmail: string;
  status: 'pending' | 'converted' | 'expired' | 'cancelled';
  conversionValue: number;
  commissionAmount: number;
  commissionRate: number;
  convertedAt?: string;
  createdAt: string;
}

interface PaginatedReferrals {
  data: AffiliateReferral[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface AffiliatePayout {
  id: number;
  affiliateId: number;
  affiliateName: string;
  affiliateCode: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  paymentMethod?: string;
  paymentReference?: string;
  periodStart: string;
  periodEnd: string;
  processedAt?: string;
  createdAt: string;
}

interface PaginatedPayouts {
  data: AffiliatePayout[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function AffiliateManagementPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();


  const generateReferralUrl = (affiliateCode: string) => {
    return `${window.location.origin}/signup?ref=${affiliateCode}`;
  };


  const brandColors = {
    primary: '#333235',
    secondary: '#4F46E5',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#3b82f6',
    chart: ['#333235', '#4F46E5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
  };
  const [activeTab, setActiveTab] = useState("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [referralsPage, setReferralsPage] = useState(1);
  const [payoutsPage, setPayoutsPage] = useState(1);


  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedAffiliates, setSelectedAffiliates] = useState<number[]>([]);
  const [dateRange, setDateRange] = useState<{from: Date; to: Date}>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    to: new Date()
  });
  const [chartTimeRange, setChartTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');


  const [createAffiliateDialogOpen, setCreateAffiliateDialogOpen] = useState(false);
  const [editAffiliateDialogOpen, setEditAffiliateDialogOpen] = useState(false);
  const [viewAffiliateDialogOpen, setViewAffiliateDialogOpen] = useState(false);
  const [selectedAffiliate, setSelectedAffiliate] = useState<Affiliate | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [viewApplicationDialogOpen, setViewApplicationDialogOpen] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<any>(null);


  const [affiliateForm, setAffiliateForm] = useState({
    name: "",
    email: "",
    phone: "",
    website: "",
    businessName: "",
    defaultCommissionRate: 5,
    commissionType: "percentage" as "percentage" | "fixed" | "tiered",
    notes: ""
  });


  const { data: metrics, isLoading: metricsLoading } = useQuery<AffiliateMetrics>({
    queryKey: ['admin', 'affiliate', 'metrics'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/affiliate/metrics');
      if (!res.ok) throw new Error('Failed to fetch affiliate metrics');
      return res.json();
    },
    enabled: !!user?.isSuperAdmin,
  });


  const { data: affiliates, isLoading: affiliatesLoading } = useQuery<PaginatedAffiliates>({
    queryKey: ['admin', 'affiliate', 'affiliates', currentPage, statusFilter, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', '20');
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      if (searchTerm) params.append('search', searchTerm);

      const res = await apiRequest('GET', `/api/admin/affiliate/affiliates?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch affiliates');
      return res.json();
    },
    enabled: !!user?.isSuperAdmin && activeTab === 'affiliates',
  });


  const { data: applications, isLoading: applicationsLoading } = useQuery<any[]>({
    queryKey: ['admin', 'affiliate', 'applications'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/affiliate/applications');
      if (!res.ok) throw new Error('Failed to fetch applications');
      return res.json();
    },
    enabled: !!user?.isSuperAdmin && activeTab === 'applications',
  });


  const { data: referrals, isLoading: referralsLoading } = useQuery<PaginatedReferrals>({
    queryKey: ['admin', 'affiliate', 'referrals', referralsPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', referralsPage.toString());
      params.append('limit', '20');

      const res = await apiRequest('GET', `/api/admin/affiliate/referrals?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch referrals');
      return res.json();
    },
    enabled: !!user?.isSuperAdmin && activeTab === 'referrals',
  });


  const { data: payouts, isLoading: payoutsLoading } = useQuery<PaginatedPayouts>({
    queryKey: ['admin', 'affiliate', 'payouts', payoutsPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', payoutsPage.toString());
      params.append('limit', '20');

      const res = await apiRequest('GET', `/api/admin/affiliate/payouts?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch payouts');
      return res.json();
    },
    enabled: !!user?.isSuperAdmin && activeTab === 'payouts',
  });


  const createAffiliateMutation = useMutation({
    mutationFn: async (affiliateData: typeof affiliateForm) => {
      const res = await apiRequest('POST', '/api/admin/affiliate/affiliates', affiliateData);
      if (!res.ok) throw new Error('Failed to create affiliate');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'affiliate'] });
      setCreateAffiliateDialogOpen(false);
      resetAffiliateForm();
      toast({
        title: t('admin.affiliate.create.success', 'Affiliate created successfully'),
        description: t('admin.affiliate.create.success_description', 'The new affiliate has been added to the system.'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });


  const updateAffiliateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<Affiliate> }) => {
      const res = await apiRequest('PUT', `/api/admin/affiliate/affiliates/${id}`, updates);
      if (!res.ok) throw new Error('Failed to update affiliate');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'affiliate'] });
      setEditAffiliateDialogOpen(false);
      setSelectedAffiliate(null);
      toast({
        title: t('admin.affiliate.update.success', 'Affiliate updated successfully'),
        description: t('admin.affiliate.update.success_description', 'The affiliate information has been updated.'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });


  const deleteAffiliateMutation = useMutation({
    mutationFn: async (affiliateId: number) => {
      const res = await apiRequest('DELETE', `/api/admin/affiliate/affiliates/${affiliateId}`);
      if (!res.ok) throw new Error('Failed to delete affiliate');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'affiliate'] });
      setConfirmDialogOpen(false);
      toast({
        title: t('admin.affiliate.delete.success', 'Affiliate deleted successfully'),
        description: t('admin.affiliate.delete.success_description', 'The affiliate has been removed from the system.'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });


  const approveAffiliateMutation = useMutation({
    mutationFn: async (affiliateId: number) => {
      const res = await apiRequest('PUT', `/api/admin/affiliate/affiliates/${affiliateId}`, { status: 'active' });
      if (!res.ok) throw new Error('Failed to approve affiliate');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'affiliate'] });
      toast({
        title: t('admin.affiliate.approve.success', 'Affiliate approved successfully'),
        description: t('admin.affiliate.approve.success_description', 'The affiliate has been activated and can now start earning commissions.'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });


  const suspendAffiliateMutation = useMutation({
    mutationFn: async (affiliateId: number) => {
      const res = await apiRequest('PUT', `/api/admin/affiliate/affiliates/${affiliateId}`, { status: 'suspended' });
      if (!res.ok) throw new Error('Failed to suspend affiliate');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'affiliate'] });
      toast({
        title: t('admin.affiliate.suspend.success', 'Affiliate suspended successfully'),
        description: t('admin.affiliate.suspend.success_description', 'The affiliate has been suspended and cannot earn new commissions.'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });


  const approveApplicationMutation = useMutation({
    mutationFn: async (applicationId: number) => {
      const res = await apiRequest('POST', `/api/admin/affiliate/applications/${applicationId}/approve`);
      if (!res.ok) throw new Error('Failed to approve application');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'affiliate'] });
      toast({
        title: t('admin.affiliate.applications.approve.success_title', 'Success'),
        description: t('admin.affiliate.applications.approve.success_description', 'Application approved successfully'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });


  const rejectApplicationMutation = useMutation({
    mutationFn: async ({ applicationId, rejectionReason }: { applicationId: number; rejectionReason: string }) => {
      const res = await apiRequest('POST', `/api/admin/affiliate/applications/${applicationId}/reject`, { rejectionReason });
      if (!res.ok) throw new Error('Failed to reject application');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'affiliate'] });
      toast({
        title: t('admin.affiliate.applications.reject.success_title', 'Success'),
        description: t('admin.affiliate.applications.reject.success_description', 'Application rejected successfully'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const resetAffiliateForm = () => {
    setAffiliateForm({
      name: "",
      email: "",
      phone: "",
      website: "",
      businessName: "",
      defaultCommissionRate: 5,
      commissionType: "percentage" as "percentage" | "fixed" | "tiered",
      notes: ""
    });
  };

  const openCreateDialog = () => {
    resetAffiliateForm();
    setCreateAffiliateDialogOpen(true);
  };

  const openEditDialog = (affiliate: Affiliate) => {
    setSelectedAffiliate(affiliate);
    setAffiliateForm({
      name: affiliate.name,
      email: affiliate.email,
      phone: affiliate.phone || "",
      website: affiliate.website || "",
      businessName: affiliate.businessName || "",
      defaultCommissionRate: affiliate.defaultCommissionRate,
      commissionType: affiliate.commissionType,
      notes: ""
    });
    setEditAffiliateDialogOpen(true);
  };

  const openViewDialog = (affiliate: Affiliate) => {
    setSelectedAffiliate(affiliate);
    setViewAffiliateDialogOpen(true);
  };

  const openDeleteDialog = (affiliate: Affiliate) => {
    setSelectedAffiliate(affiliate);
    setConfirmMessage(t('admin.affiliate.delete.confirm_message', 'Are you sure you want to delete the affiliate "{{name}}"? This action cannot be undone and will remove all associated data.', { name: affiliate.name }));
    setConfirmAction(() => () => deleteAffiliateMutation.mutate(affiliate.id));
    setConfirmDialogOpen(true);
  };

  const openBulkDeleteDialog = () => {
    const count = selectedAffiliates.length;
    setConfirmMessage(t('admin.affiliate.delete.bulk_confirm_message', 'Are you sure you want to delete {{count}} selected affiliate{{plural}}? This action cannot be undone and will remove all associated data.', { count, plural: count > 1 ? 's' : '' }));
    setConfirmAction(() => () => {

      selectedAffiliates.forEach(affiliateId => {
        deleteAffiliateMutation.mutate(affiliateId);
      });
      setSelectedAffiliates([]);
    });
    setConfirmDialogOpen(true);
  };

  const approveAffiliate = (affiliate: Affiliate) => {
    approveAffiliateMutation.mutate(affiliate.id);
  };

  const approveBulkAffiliates = () => {
    selectedAffiliates.forEach(affiliateId => {
      approveAffiliateMutation.mutate(affiliateId);
    });
    setSelectedAffiliates([]);
  };

  const suspendAffiliate = (affiliate: Affiliate) => {
    suspendAffiliateMutation.mutate(affiliate.id);
  };


  const canBulkApprove = () => {
    if (selectedAffiliates.length === 0) return false;
    return affiliates?.data.some(affiliate =>
      selectedAffiliates.includes(affiliate.id) &&
      (affiliate.status === 'pending' || affiliate.status === 'suspended')
    );
  };

  const handleCreateSubmit = () => {
    createAffiliateMutation.mutate(affiliateForm);
  };

  const handleEditSubmit = () => {
    if (!selectedAffiliate) return;
    updateAffiliateMutation.mutate({
      id: selectedAffiliate.id,
      updates: affiliateForm
    });
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      active: "default",
      pending: "secondary",
      suspended: "destructive",
      rejected: "outline"
    } as const;
    
    return (
      <Badge variant={variants[status as keyof typeof variants] || "outline"}>
        {t(`admin.affiliate.status.${status}`, status)}
      </Badge>
    );
  };

  if (!user?.isSuperAdmin) {
    return null;
  }


  const calculatePercentageChange = (current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };


  const TrendIndicator = ({ current, previous, suffix = "" }: { current: number; previous: number; suffix?: string }) => {
    if (current === undefined || previous === undefined) {
      return <div className="text-xs text-muted-foreground">{t('admin.affiliate.metrics.no_data', '-')}</div>;
    }

    const change = calculatePercentageChange(current, previous);
    const isPositive = change >= 0;

    return (
      <div className={cn("flex items-center text-xs", isPositive ? "text-green-600" : "text-red-600")}>
        {isPositive ? <ArrowUpIcon className="h-3 w-3 mr-1" /> : <ArrowDownIcon className="h-3 w-3 mr-1" />}
        {Math.abs(change).toFixed(1)}%{suffix}
      </div>
    );
  };


  const defaultMetrics: AffiliateMetrics = {
    totalAffiliates: 0,
    activeAffiliates: 0,
    pendingAffiliates: 0,
    inactiveAffiliates: 0,
    totalReferrals: 0,
    convertedReferrals: 0,
    conversionRate: 0,
    totalCommissionEarned: 0,
    averageCommissionPerAffiliate: 0,
    lifetimeValue: 0,
    pendingPayouts: { count: 0, amount: 0 },
    previousPeriod: {
      totalAffiliates: 0,
      totalReferrals: 0,
      conversionRate: 0,
      totalCommissionEarned: 0,
    },
    performanceTrends: [],
    statusDistribution: [],
    topPerformers: [],
    conversionFunnel: [],
  };

  const MetricsCards = () => {
    if (metricsLoading) {
      return (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  <div className="h-4 bg-gray-200 rounded"></div>
                </CardTitle>
                <div className="h-4 w-4 bg-gray-200 rounded"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-2/3"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      );
    }

    if (!metrics) return null;


    const safeMetrics = { ...defaultMetrics, ...metrics };

    return (
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('admin.affiliate.metrics.total_affiliates', 'Total Affiliates')}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{safeMetrics.totalAffiliates}</div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {t('admin.affiliate.metrics.active', 'Active')}: {safeMetrics.activeAffiliates}
              </p>
              <TrendIndicator
                current={safeMetrics.totalAffiliates}
                previous={safeMetrics.previousPeriod.totalAffiliates}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('admin.affiliate.metrics.total_referrals', 'Total Referrals')}
            </CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{safeMetrics.totalReferrals}</div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {safeMetrics.conversionRate.toFixed(1)}% {t('admin.affiliate.metrics.conversion_rate', 'conversion rate')}
              </p>
              <TrendIndicator
                current={safeMetrics.totalReferrals}
                previous={safeMetrics.previousPeriod.totalReferrals}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('admin.affiliate.metrics.total_commission', 'Total Commission')}
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(safeMetrics.totalCommissionEarned)}</div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {t('admin.affiliate.metrics.from_conversions', 'From {{count}} conversions', { count: safeMetrics.convertedReferrals })}
              </p>
              <TrendIndicator
                current={safeMetrics.totalCommissionEarned}
                previous={safeMetrics.previousPeriod.totalCommissionEarned}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('admin.affiliate.metrics.conversion_rate', 'Conversion Rate')}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{safeMetrics.conversionRate.toFixed(1)}%</div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {safeMetrics.convertedReferrals} / {safeMetrics.totalReferrals} {t('admin.affiliate.metrics.conversions', 'conversions')}
              </p>
              <TrendIndicator
                current={safeMetrics.conversionRate}
                previous={safeMetrics.previousPeriod.conversionRate}
                suffix={t('admin.affiliate.metrics.points_suffix', ' pts')}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('admin.affiliate.metrics.avg_commission', 'Avg Commission')}
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(safeMetrics.averageCommissionPerAffiliate)}</div>
            <p className="text-xs text-muted-foreground">
              {t('admin.affiliate.metrics.per_affiliate', 'per affiliate')}
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('admin.affiliate.metrics.pending_payouts', 'Pending Payouts')}
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(safeMetrics.pendingPayouts.amount)}</div>
            <p className="text-xs text-muted-foreground">
              {safeMetrics.pendingPayouts.count} {t('admin.affiliate.metrics.pending_requests', 'pending requests')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
          <div>
            <h1 className="sm:text-2xl">{t('admin.affiliate.title', 'Affiliate Management')}</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              {t('admin.affiliate.description', 'Manage affiliate partners, track referrals, and process payouts')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="w-full sm:w-auto">
              <Download className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">{t('admin.affiliate.export.button', 'Export Data')}</span>
              <span className="sm:hidden">{t('admin.affiliate.export.short', 'Export')}</span>
            </Button>
            <Button onClick={openCreateDialog} className="w-full sm:w-auto">
              <UserPlus className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">{t('admin.affiliate.create.button', 'Add Affiliate')}</span>
              <span className="sm:hidden">{t('admin.affiliate.create.short', 'Add')}</span>
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="overflow-x-auto">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 gap-1">
              <TabsTrigger value="dashboard" className="text-xs sm:text-sm">
                <span className="hidden sm:inline">{t('admin.affiliate.dashboard.title', 'Dashboard')}</span>
                <span className="sm:hidden">{t('admin.affiliate.dashboard.short', 'Dashboard')}</span>
              </TabsTrigger>
              <TabsTrigger value="applications" className="text-xs sm:text-sm">
                <span className="hidden sm:inline">{t('admin.affiliate.applications.title', 'Applications')}</span>
                <span className="sm:hidden">{t('admin.affiliate.applications.short', 'Apps')}</span>
              </TabsTrigger>
              <TabsTrigger value="affiliates" className="text-xs sm:text-sm">
                <span className="hidden sm:inline">{t('admin.affiliate.affiliates.title', 'Affiliates')}</span>
                <span className="sm:hidden">{t('admin.affiliate.affiliates.short', 'Affiliates')}</span>
              </TabsTrigger>
              <TabsTrigger value="referrals" className="text-xs sm:text-sm">
                <span className="hidden sm:inline">{t('admin.affiliate.referrals.title', 'Referrals')}</span>
                <span className="sm:hidden">{t('admin.affiliate.referrals.short', 'Referrals')}</span>
              </TabsTrigger>
              <TabsTrigger value="payouts" className="text-xs sm:text-sm">
                <span className="hidden sm:inline">{t('admin.affiliate.payouts.title', 'Payouts')}</span>
                <span className="sm:hidden">{t('admin.affiliate.payouts.short', 'Payouts')}</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="dashboard" className="space-y-4">
            <MetricsCards />

            {/* Time Range Selector */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <h2 className="text-lg font-semibold">{t('admin.affiliate.analytics.title', 'Performance Analytics')}</h2>
              <div className="flex gap-2">
                <Select value={chartTimeRange} onValueChange={(value: '7d' | '30d' | '90d' | '1y') => setChartTimeRange(value)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d">{t('admin.affiliate.time_range.last_7_days', 'Last 7 days')}</SelectItem>
                    <SelectItem value="30d">{t('admin.affiliate.time_range.last_30_days', 'Last 30 days')}</SelectItem>
                    <SelectItem value="90d">{t('admin.affiliate.time_range.last_90_days', 'Last 90 days')}</SelectItem>
                    <SelectItem value="1y">{t('admin.affiliate.time_range.last_year', 'Last year')}</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t('admin.affiliate.refresh', 'Refresh')}
                </Button>
              </div>
            </div>

            {/* Performance Trends Chart */}
            <Card className="hover:shadow-lg transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  {t('admin.affiliate.charts.performance_trends', 'Performance Trends')}
                </CardTitle>
                <CardDescription>
                  {t('admin.affiliate.charts.performance_trends_description', 'Track revenue, conversions, and sign-ups over time')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[400px] w-full relative">
                  {metricsLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">{t('admin.affiliate.charts.loading', 'Loading chart data...')}</p>
                      </div>
                    </div>
                  ) : null}
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={metrics?.performanceTrends || []}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => new Date(value).toLocaleDateString()}
                      />
                      <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                      <Tooltip
                        labelFormatter={(value) => new Date(value).toLocaleDateString()}
                        formatter={(value: any, name: string) => [
                          name === 'revenue' ? formatCurrency(value) : value,
                          name.charAt(0).toUpperCase() + name.slice(1)
                        ]}
                        contentStyle={{
                          backgroundColor: 'rgba(255, 255, 255, 0.95)',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                      />
                      <Legend />
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="revenue"
                        fill={brandColors.primary}
                        fillOpacity={0.1}
                        stroke={brandColors.primary}
                        strokeWidth={2}
                        name={t('admin.affiliate.charts.series.revenue', 'Revenue')}
                      />
                      <Bar yAxisId="right" dataKey="conversions" fill={brandColors.success} name={t('admin.affiliate.charts.series.conversions', 'Conversions')} />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="signups"
                        stroke={brandColors.warning}
                        strokeWidth={2}
                        dot={{ fill: brandColors.warning, strokeWidth: 2, r: 4 }}
                        name={t('admin.affiliate.charts.series.sign_ups', 'Sign-ups')}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Charts Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Status Distribution Pie Chart */}
              <Card className="hover:shadow-lg transition-shadow duration-300">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    {t('admin.affiliate.charts.status_distribution', 'Affiliate Status')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px] w-full relative">
                    {metricsLoading ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    ) : null}
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={metrics?.statusDistribution || []}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="count"
                        >
                          {(metrics?.statusDistribution || []).map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={
                                entry.status === 'active' ? brandColors.success :
                                entry.status === 'pending' ? brandColors.warning :
                                entry.status === 'inactive' ? brandColors.danger :
                                brandColors.chart[index % brandColors.chart.length]
                              }
                            />
                          ))}
                          <LabelList dataKey="percentage" position="center" formatter={(value: number) => `${value}%`} />
                        </Pie>
                        <Tooltip formatter={(value: any, name: string) => [value, name.charAt(0).toUpperCase() + name.slice(1)]} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Top Performers Bar Chart */}
              <Card className="hover:shadow-lg transition-shadow duration-300">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    {t('admin.affiliate.charts.top_performers', 'Top Performers')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px] w-full relative">
                    {metricsLoading ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    ) : null}
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={metrics?.topPerformers || []}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10 }}
                          angle={-45}
                          textAnchor="end"
                          height={60}
                        />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                          formatter={(value: any, name: string) => [
                            name === 'revenue' ? formatCurrency(value) : value,
                            name.charAt(0).toUpperCase() + name.slice(1)
                          ]}
                          contentStyle={{
                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px'
                          }}
                        />
                        <Bar dataKey="revenue" fill={brandColors.secondary} name={t('admin.affiliate.charts.series.revenue', 'Revenue')} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Conversion Funnel */}
              <Card className="hover:shadow-lg transition-shadow duration-300">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    {t('admin.affiliate.charts.conversion_funnel', 'Conversion Funnel')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px] w-full relative">
                    {metricsLoading ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    ) : null}
                    <ResponsiveContainer width="100%" height="100%">
                      <FunnelChart>
                        <Tooltip
                          formatter={(value: any, name: string) => [value, name]}
                          contentStyle={{
                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px'
                          }}
                        />
                        <Funnel
                          dataKey="count"
                          data={metrics?.conversionFunnel || []}
                          isAnimationActive
                        >
                          <LabelList position="center" fill="#fff" stroke="none" />
                        </Funnel>
                      </FunnelChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Export and Actions */}
            <Card className="hover:shadow-lg transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5 text-primary" />
                  {t('admin.affiliate.export.title', 'Export Data')}
                </CardTitle>
                <CardDescription>
                  {t('admin.affiliate.export.description', 'Download affiliate performance data and reports')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="hover:bg-primary hover:text-primary-foreground transition-colors">
                    <Download className="h-4 w-4 mr-2" />
                    {t('admin.affiliate.export.csv', 'Export CSV')}
                  </Button>
                  <Button variant="outline" size="sm" className="hover:bg-primary hover:text-primary-foreground transition-colors">
                    <Download className="h-4 w-4 mr-2" />
                    {t('admin.affiliate.export.pdf', 'Export PDF Report')}
                  </Button>
                  <Button variant="outline" size="sm" className="hover:bg-primary hover:text-primary-foreground transition-colors">
                    <Download className="h-4 w-4 mr-2" />
                    {t('admin.affiliate.export.chart_data', 'Export Chart Data')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="applications" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('admin.affiliate.applications.title', 'Affiliate Applications')}</CardTitle>
                <CardDescription>
                  {t('admin.affiliate.applications.description', 'Review and manage affiliate partner applications')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {applicationsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : !applications || applications.length === 0 ? (
                  <div className="text-center py-8">
                    <UserPlus className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      {t('admin.affiliate.applications.empty.title', 'No Applications Yet')}
                    </h3>
                    <p className="text-gray-500 mb-4">
                      {t('admin.affiliate.applications.empty.description', 'Affiliate applications will appear here when people apply to become partners.')}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => window.open('/become-partner', '_blank')}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      {t('admin.affiliate.applications.preview_form', 'Preview Application Form')}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <div className="text-sm text-gray-500">
                        {t('admin.affiliate.applications.count', '{{count}} application{{plural}} found', { count: applications.length, plural: applications.length !== 1 ? 's' : '' })}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open('/become-partner', '_blank')}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        {t('admin.affiliate.applications.preview_form', 'Preview Application Form')}
                      </Button>
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('admin.affiliate.applications.table.applicant', 'Applicant')}</TableHead>
                          <TableHead>{t('admin.affiliate.applications.table.email', 'Email')}</TableHead>
                          <TableHead>{t('admin.affiliate.applications.table.status', 'Status')}</TableHead>
                          <TableHead>{t('admin.affiliate.applications.table.marketing_channels', 'Marketing Channels')}</TableHead>
                          <TableHead>{t('admin.affiliate.applications.table.expected_referrals', 'Expected Referrals')}</TableHead>
                          <TableHead>{t('admin.affiliate.applications.table.submitted', 'Submitted')}</TableHead>
                          <TableHead className="text-right">{t('admin.affiliate.applications.table.actions', 'Actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {applications.map((application: any) => (
                          <TableRow key={application.id}>
                            <TableCell>
                              <div>
                                <div className="font-medium">
                                  {application.firstName} {application.lastName}
                                </div>
                                {application.company && (
                                  <div className="text-sm text-gray-500">{application.company}</div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{application.email}</TableCell>
                            <TableCell>
                              <Badge variant={
                                application.status === 'approved' ? 'default' :
                                application.status === 'rejected' ? 'destructive' :
                                application.status === 'under_review' ? 'secondary' :
                                'outline'
                              }>
                                {t(`admin.affiliate.applications.status.${application.status}`, application.status)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {Array.isArray(application.marketingChannels)
                                  ? application.marketingChannels.slice(0, 2).map((channel: string) =>
                                      channel.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
                                    ).join(', ')
                                  : application.marketingChannels}
                                {Array.isArray(application.marketingChannels) && application.marketingChannels.length > 2 &&
                                  t('admin.affiliate.applications.more_channels', ' +{{count}} more', { count: application.marketingChannels.length - 2 })}
                              </div>
                            </TableCell>
                            <TableCell>{application.expectedMonthlyReferrals}</TableCell>
                            <TableCell>
                              {new Date(application.submittedAt || application.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" className="h-8 w-8 p-0">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => {
                                    setSelectedApplication(application);
                                    setViewApplicationDialogOpen(true);
                                  }}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    {t('admin.affiliate.applications.actions.view_details', 'View Details')}
                                  </DropdownMenuItem>
                                  {application.status === 'pending' && (
                                    <>
                                      <DropdownMenuItem onClick={() => {
                                        approveApplicationMutation.mutate(application.id);
                                      }}>
                                        <CheckCircle className="mr-2 h-4 w-4" />
                                        {t('admin.affiliate.applications.actions.approve', 'Approve')}
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem onClick={() => {
                                        const rejectionReason = prompt(t('admin.affiliate.applications.reject.prompt', 'Please provide a reason for rejection:'));
                                        if (rejectionReason) {
                                          rejectApplicationMutation.mutate({
                                            applicationId: application.id,
                                            rejectionReason
                                          });
                                        }
                                      }}>
                                        <AlertCircle className="mr-2 h-4 w-4" />
                                        {t('admin.affiliate.applications.actions.reject', 'Reject')}
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="affiliates" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('admin.affiliate.affiliates.title', 'Affiliate Partners')}</CardTitle>
                <CardDescription>
                  {t('admin.affiliate.affiliates.description', 'Manage affiliate partners and their commission structures')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Enhanced Filters and Actions */}
                <div className="flex flex-col gap-4 mb-6">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <Input
                        placeholder={t('admin.affiliate.affiliates.search_placeholder', 'Search affiliates...')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full sm:max-w-sm"
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-full sm:w-[180px]">
                          <SelectValue placeholder={t('admin.affiliate.affiliates.filter.all_statuses', 'All Statuses')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('admin.affiliate.affiliates.filter.all_statuses', 'All Statuses')}</SelectItem>
                          <SelectItem value="active">{t('admin.affiliate.status.active', 'Active')}</SelectItem>
                          <SelectItem value="pending">{t('admin.affiliate.status.pending', 'Pending')}</SelectItem>
                          <SelectItem value="suspended">{t('admin.affiliate.status.suspended', 'Suspended')}</SelectItem>
                          <SelectItem value="rejected">{t('admin.affiliate.status.rejected', 'Rejected')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm">
                        <Filter className="h-4 w-4 mr-2" />
                        {t('admin.affiliate.affiliates.more_filters', 'More Filters')}
                      </Button>
                    </div>
                  </div>

                  {/* Bulk Actions */}
                  {selectedAffiliates.length > 0 && (
                    <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <span className="text-sm font-medium text-blue-900">
                        {t('admin.affiliate.affiliates.selected_count', '{{count}} affiliate{{plural}} selected', { count: selectedAffiliates.length, plural: selectedAffiliates.length !== 1 ? 's' : '' })}
                      </span>
                      <div className="flex gap-2 ml-auto">
                        {canBulkApprove() && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => approveBulkAffiliates()}
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            disabled={approveAffiliateMutation.isPending}
                          >
                            {approveAffiliateMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <CheckCircle className="h-4 w-4 mr-2" />
                            )}
                            {t('admin.affiliate.affiliates.bulk_actions.approve', 'Approve Selected')}
                          </Button>
                        )}
                        <Button variant="outline" size="sm">
                          <Mail className="h-4 w-4 mr-2" />
                          {t('admin.affiliate.affiliates.bulk_actions.send_email', 'Send Email')}
                        </Button>
                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4 mr-2" />
                          {t('admin.affiliate.affiliates.bulk_actions.export', 'Export Selected')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openBulkDeleteDialog()}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          disabled={deleteAffiliateMutation.isPending}
                        >
                          {deleteAffiliateMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 mr-2" />
                          )}
                          {t('admin.affiliate.affiliates.bulk_actions.delete', 'Delete Selected')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {affiliatesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox
                              checked={selectedAffiliates.length === affiliates?.data.length && affiliates?.data.length > 0}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedAffiliates(affiliates?.data.map(a => a.id) || []);
                                } else {
                                  setSelectedAffiliates([]);
                                }
                              }}
                            />
                          </TableHead>
                          <TableHead className="min-w-[120px]">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto p-0 font-semibold"
                              onClick={() => {
                                setSortField('affiliateCode');
                                setSortDirection(sortField === 'affiliateCode' && sortDirection === 'asc' ? 'desc' : 'asc');
                              }}
                            >
                              {t('admin.affiliate.affiliates.table.code', 'Code')}
                              {sortField === 'affiliateCode' && (
                                sortDirection === 'asc' ? <SortAsc className="ml-1 h-3 w-3" /> : <SortDesc className="ml-1 h-3 w-3" />
                              )}
                            </Button>
                          </TableHead>
                          <TableHead className="min-w-[150px]">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto p-0 font-semibold"
                              onClick={() => {
                                setSortField('name');
                                setSortDirection(sortField === 'name' && sortDirection === 'asc' ? 'desc' : 'asc');
                              }}
                            >
                              {t('admin.affiliate.affiliates.table.name', 'Name')}
                              {sortField === 'name' && (
                                sortDirection === 'asc' ? <SortAsc className="ml-1 h-3 w-3" /> : <SortDesc className="ml-1 h-3 w-3" />
                              )}
                            </Button>
                          </TableHead>
                          <TableHead className="min-w-[180px]">{t('admin.affiliate.affiliates.table.email', 'Email')}</TableHead>
                          <TableHead className="min-w-[100px]">{t('admin.affiliate.affiliates.table.status', 'Status')}</TableHead>
                          <TableHead className="min-w-[120px]">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto p-0 font-semibold"
                              onClick={() => {
                                setSortField('totalReferrals');
                                setSortDirection(sortField === 'totalReferrals' && sortDirection === 'asc' ? 'desc' : 'asc');
                              }}
                            >
                              {t('admin.affiliate.affiliates.table.referrals', 'Referrals')}
                              {sortField === 'totalReferrals' && (
                                sortDirection === 'asc' ? <SortAsc className="ml-1 h-3 w-3" /> : <SortDesc className="ml-1 h-3 w-3" />
                              )}
                            </Button>
                          </TableHead>
                          <TableHead className="min-w-[120px]">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto p-0 font-semibold"
                              onClick={() => {
                                setSortField('totalEarnings');
                                setSortDirection(sortField === 'totalEarnings' && sortDirection === 'asc' ? 'desc' : 'asc');
                              }}
                            >
                              {t('admin.affiliate.affiliates.table.earnings', 'Earnings')}
                              {sortField === 'totalEarnings' && (
                                sortDirection === 'asc' ? <SortAsc className="ml-1 h-3 w-3" /> : <SortDesc className="ml-1 h-3 w-3" />
                              )}
                            </Button>
                          </TableHead>
                          <TableHead className="min-w-[120px]">{t('admin.affiliate.affiliates.table.commission', 'Commission')}</TableHead>
                          <TableHead className="min-w-[200px]">{t('admin.affiliate.affiliates.table.referral_url', 'Referral URL')}</TableHead>
                          <TableHead className="min-w-[120px]">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto p-0 font-semibold"
                              onClick={() => {
                                setSortField('createdAt');
                                setSortDirection(sortField === 'createdAt' && sortDirection === 'asc' ? 'desc' : 'asc');
                              }}
                            >
                              {t('admin.affiliate.affiliates.table.joined', 'Joined')}
                              {sortField === 'createdAt' && (
                                sortDirection === 'asc' ? <SortAsc className="ml-1 h-3 w-3" /> : <SortDesc className="ml-1 h-3 w-3" />
                              )}
                            </Button>
                          </TableHead>
                          <TableHead className="min-w-[200px]">{t('admin.affiliate.affiliates.table.actions', 'Actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {affiliates?.data.map((affiliate) => (
                          <TableRow
                            key={affiliate.id}
                            className={cn(
                              "hover:bg-muted/50 transition-colors",
                              selectedAffiliates.includes(affiliate.id) && "bg-blue-50"
                            )}
                          >
                            <TableCell>
                              <Checkbox
                                checked={selectedAffiliates.includes(affiliate.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedAffiliates([...selectedAffiliates, affiliate.id]);
                                  } else {
                                    setSelectedAffiliates(selectedAffiliates.filter(id => id !== affiliate.id));
                                  }
                                }}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-sm">{affiliate.affiliateCode}</TableCell>
                            <TableCell className="font-medium">
                              <div>
                                <div className="font-semibold">{affiliate.name}</div>
                                {affiliate.businessName && (
                                  <div className="text-xs text-muted-foreground">{affiliate.businessName}</div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{affiliate.email}</TableCell>
                            <TableCell>{getStatusBadge(affiliate.status)}</TableCell>
                            <TableCell>
                              <div className="text-sm">
                                <div className="font-medium">{affiliate.totalReferrals}</div>
                                <div className="text-xs text-muted-foreground">
                                  {t('admin.affiliate.affiliates.converted_count', '{{count}} converted', { count: affiliate.successfulReferrals })}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">
                              <div className="text-sm">
                                <div className="font-medium">{formatCurrency(affiliate.totalEarnings)}</div>
                                <div className="text-xs text-muted-foreground">
                                  {t('admin.affiliate.affiliates.pending_earnings', '{{amount}} pending', { amount: formatCurrency(affiliate.pendingEarnings) })}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {affiliate.defaultCommissionRate}%
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-mono text-blue-600 truncate">
                                    {generateReferralUrl(affiliate.affiliateCode)}
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => {
                                      const url = generateReferralUrl(affiliate.affiliateCode);
                                      navigator.clipboard.writeText(url);
                                      toast({
                                        title: t('admin.affiliate.copied_title', 'Copied!'),
                                        description: t('admin.affiliate.copied_description', 'Referral URL copied to clipboard'),
                                      });
                                    }}
                                    title={t('admin.affiliate.copy_url_tooltip', 'Copy referral URL')}
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => {
                                      const url = generateReferralUrl(affiliate.affiliateCode);
                                      window.open(url, '_blank');
                                    }}
                                    title={t('admin.affiliate.open_url_tooltip', 'Open referral URL')}
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{formatDate(affiliate.createdAt)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openViewDialog(affiliate)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditDialog(affiliate)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => openViewDialog(affiliate)}>
                                      <Eye className="mr-2 h-4 w-4" />
                                      {t('admin.affiliate.actions.view_details', 'View Details')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openEditDialog(affiliate)}>
                                      <Edit className="mr-2 h-4 w-4" />
                                      {t('admin.affiliate.actions.edit', 'Edit Affiliate')}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem>
                                      <Mail className="mr-2 h-4 w-4" />
                                      {t('admin.affiliate.actions.send_email', 'Send Email')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                      <Download className="mr-2 h-4 w-4" />
                                      {t('admin.affiliate.actions.export_data', 'Export Data')}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    {affiliate.status === 'pending' && (
                                      <DropdownMenuItem
                                        onClick={() => approveAffiliate(affiliate)}
                                        className="text-green-600 focus:text-green-600 focus:bg-green-50"
                                        disabled={approveAffiliateMutation.isPending}
                                      >
                                        {approveAffiliateMutation.isPending ? (
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                          <CheckCircle className="mr-2 h-4 w-4" />
                                        )}
                                        {t('admin.affiliate.actions.approve', 'Approve')}
                                      </DropdownMenuItem>
                                    )}
                                    {affiliate.status === 'active' && (
                                      <DropdownMenuItem
                                        onClick={() => suspendAffiliate(affiliate)}
                                        className="text-orange-600 focus:text-orange-600 focus:bg-orange-50"
                                        disabled={suspendAffiliateMutation.isPending}
                                      >
                                        {suspendAffiliateMutation.isPending ? (
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                          <AlertCircle className="mr-2 h-4 w-4" />
                                        )}
                                        {t('admin.affiliate.actions.suspend', 'Suspend')}
                                      </DropdownMenuItem>
                                    )}
                                    {affiliate.status === 'suspended' && (
                                      <DropdownMenuItem
                                        onClick={() => approveAffiliate(affiliate)}
                                        className="text-green-600 focus:text-green-600 focus:bg-green-50"
                                        disabled={approveAffiliateMutation.isPending}
                                      >
                                        {approveAffiliateMutation.isPending ? (
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                          <CheckCircle className="mr-2 h-4 w-4" />
                                        )}
                                        {t('admin.affiliate.actions.reactivate', 'Reactivate')}
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => openDeleteDialog(affiliate)}
                                      className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                      disabled={deleteAffiliateMutation.isPending}
                                    >
                                      {deleteAffiliateMutation.isPending ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="mr-2 h-4 w-4" />
                                      )}
                                      {t('admin.affiliate.actions.delete', 'Delete Affiliate')}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Pagination for affiliates */}
                {affiliates && affiliates.totalPages > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-4">
                    <div className="text-sm text-muted-foreground">
                      {t('admin.affiliate.pagination.showing', 'Showing')} {((currentPage - 1) * 20) + 1} {t('admin.affiliate.pagination.to', 'to')} {Math.min(currentPage * 20, affiliates.total)} {t('admin.affiliate.pagination.of', 'of')} {affiliates.total} {t('admin.affiliate.pagination.records', 'records')}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="min-w-[80px]"
                      >
                        {t('admin.affiliate.pagination.previous', 'Previous')}
                      </Button>
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-muted-foreground">
                          {t('admin.affiliate.pagination.page', 'Page')} {currentPage} {t('admin.affiliate.pagination.of', 'of')} {affiliates.totalPages}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.min(affiliates.totalPages, currentPage + 1))}
                        disabled={currentPage === affiliates.totalPages}
                        className="min-w-[80px]"
                      >
                        {t('admin.affiliate.pagination.next', 'Next')}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="referrals" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('admin.affiliate.referrals.title', 'Affiliate Referrals')}</CardTitle>
                <CardDescription>
                  {t('admin.affiliate.referrals.description', 'Track and manage all affiliate referrals and conversions')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {referralsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : referrals?.data && referrals.data.length > 0 ? (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[120px]">{t('admin.affiliate.referrals.table.code', 'Referral Code')}</TableHead>
                            <TableHead className="min-w-[150px]">{t('admin.affiliate.referrals.table.affiliate', 'Affiliate')}</TableHead>
                            <TableHead className="min-w-[180px]">{t('admin.affiliate.referrals.table.referred_email', 'Referred Email')}</TableHead>
                            <TableHead className="min-w-[100px]">{t('admin.affiliate.referrals.table.status', 'Status')}</TableHead>
                            <TableHead className="min-w-[120px]">{t('admin.affiliate.referrals.table.value', 'Value')}</TableHead>
                            <TableHead className="min-w-[120px]">{t('admin.affiliate.referrals.table.commission', 'Commission')}</TableHead>
                            <TableHead className="min-w-[120px]">{t('admin.affiliate.referrals.table.date', 'Date')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {referrals.data.map((referral) => (
                            <TableRow key={referral.id}>
                              <TableCell className="font-mono text-sm">{referral.referralCode}</TableCell>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{referral.affiliateName}</div>
                                  <div className="text-xs text-muted-foreground">{referral.affiliateCode}</div>
                                </div>
                              </TableCell>
                              <TableCell>{referral.referredEmail}</TableCell>
                              <TableCell>
                                <Badge variant={
                                  referral.status === 'converted' ? 'default' :
                                  referral.status === 'pending' ? 'secondary' :
                                  referral.status === 'expired' ? 'destructive' : 'outline'
                                }>
                                  {t(`admin.affiliate.referrals.status.${referral.status}`, referral.status)}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-medium">
                                {referral.conversionValue > 0 ? formatCurrency(referral.conversionValue) : '-'}
                              </TableCell>
                              <TableCell className="font-medium">
                                {referral.commissionAmount > 0 ? formatCurrency(referral.commissionAmount) : '-'}
                              </TableCell>
                              <TableCell className="text-sm">
                                {referral.convertedAt ? formatDate(referral.convertedAt) : formatDate(referral.createdAt)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {referrals.totalPages > 1 && (
                      <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-4">
                        <div className="text-sm text-muted-foreground">
                          {t('admin.affiliate.pagination.showing', 'Showing')} {((referralsPage - 1) * 20) + 1} {t('admin.affiliate.pagination.to', 'to')} {Math.min(referralsPage * 20, referrals.total)} {t('admin.affiliate.pagination.of', 'of')} {referrals.total} {t('admin.affiliate.pagination.records', 'records')}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setReferralsPage(Math.max(1, referralsPage - 1))}
                            disabled={referralsPage === 1}
                            className="min-w-[80px]"
                          >
                            {t('admin.affiliate.pagination.previous', 'Previous')}
                          </Button>
                          <div className="flex items-center gap-1">
                            <span className="text-sm text-muted-foreground">
                              {t('admin.affiliate.pagination.page', 'Page')} {referralsPage} {t('admin.affiliate.pagination.of', 'of')} {referrals.totalPages}
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setReferralsPage(Math.min(referrals.totalPages, referralsPage + 1))}
                            disabled={referralsPage === referrals.totalPages}
                            className="min-w-[80px]"
                          >
                            {t('admin.affiliate.pagination.next', 'Next')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    {t('admin.affiliate.referrals.empty', 'No referrals found')}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payouts" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('admin.affiliate.payouts.title', 'Affiliate Payouts')}</CardTitle>
                <CardDescription>
                  {t('admin.affiliate.payouts.description', 'Manage affiliate commission payouts and payment processing')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {payoutsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : payouts?.data && payouts.data.length > 0 ? (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[150px]">{t('admin.affiliate.payouts.table.affiliate', 'Affiliate')}</TableHead>
                            <TableHead className="min-w-[120px]">{t('admin.affiliate.payouts.table.amount', 'Amount')}</TableHead>
                            <TableHead className="min-w-[100px]">{t('admin.affiliate.payouts.table.status', 'Status')}</TableHead>
                            <TableHead className="min-w-[120px]">{t('admin.affiliate.payouts.table.method', 'Method')}</TableHead>
                            <TableHead className="min-w-[140px]">{t('admin.affiliate.payouts.table.period', 'Period')}</TableHead>
                            <TableHead className="min-w-[120px]">{t('admin.affiliate.payouts.table.processed', 'Processed')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payouts.data.map((payout) => (
                            <TableRow key={payout.id}>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{payout.affiliateName}</div>
                                  <div className="text-xs text-muted-foreground">{payout.affiliateCode}</div>
                                </div>
                              </TableCell>
                              <TableCell className="font-medium">
                                {formatCurrency(payout.amount)} {payout.currency}
                              </TableCell>
                              <TableCell>
                                <Badge variant={
                                  payout.status === 'completed' ? 'default' :
                                  payout.status === 'processing' ? 'secondary' :
                                  payout.status === 'failed' ? 'destructive' : 'outline'
                                }>
                                  {t(`admin.affiliate.payouts.status.${payout.status}`, payout.status)}
                                </Badge>
                              </TableCell>
                              <TableCell className="capitalize">
                                {payout.paymentMethod || t('admin.affiliate.payouts.not_specified', 'Not specified')}
                              </TableCell>
                              <TableCell className="text-sm">
                                <div>
                                  <div>{formatDate(payout.periodStart)}</div>
                                  <div className="text-xs text-muted-foreground">{t('admin.affiliate.payouts.to', 'to')} {formatDate(payout.periodEnd)}</div>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">
                                {payout.processedAt ? formatDate(payout.processedAt) : '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {payouts.totalPages > 1 && (
                      <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-4">
                        <div className="text-sm text-muted-foreground">
                          {t('admin.affiliate.pagination.showing', 'Showing')} {((payoutsPage - 1) * 20) + 1} {t('admin.affiliate.pagination.to', 'to')} {Math.min(payoutsPage * 20, payouts.total)} {t('admin.affiliate.pagination.of', 'of')} {payouts.total} {t('admin.affiliate.pagination.records', 'records')}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPayoutsPage(Math.max(1, payoutsPage - 1))}
                            disabled={payoutsPage === 1}
                            className="min-w-[80px]"
                          >
                            {t('admin.affiliate.pagination.previous', 'Previous')}
                          </Button>
                          <div className="flex items-center gap-1">
                            <span className="text-sm text-muted-foreground">
                              {t('admin.affiliate.pagination.page', 'Page')} {payoutsPage} {t('admin.affiliate.pagination.of', 'of')} {payouts.totalPages}
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPayoutsPage(Math.min(payouts.totalPages, payoutsPage + 1))}
                            disabled={payoutsPage === payouts.totalPages}
                            className="min-w-[80px]"
                          >
                            {t('admin.affiliate.pagination.next', 'Next')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    {t('admin.affiliate.payouts.empty', 'No payouts found')}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Create Affiliate Dialog */}
        <Dialog open={createAffiliateDialogOpen} onOpenChange={setCreateAffiliateDialogOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{t('admin.affiliate.create.title', 'Add New Affiliate')}</DialogTitle>
              <DialogDescription>
                {t('admin.affiliate.create.description', 'Create a new affiliate partner account')}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('admin.affiliate.form.name', 'Full Name')} *</Label>
                  <Input
                    id="name"
                    value={affiliateForm.name}
                    onChange={(e) => setAffiliateForm({ ...affiliateForm, name: e.target.value })}
                    placeholder={t('admin.affiliate.form.placeholders.name', 'Enter full name')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t('admin.affiliate.form.email', 'Email Address')} *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={affiliateForm.email}
                    onChange={(e) => setAffiliateForm({ ...affiliateForm, email: e.target.value })}
                    placeholder={t('admin.affiliate.form.placeholders.email', 'Enter email address')}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">{t('admin.affiliate.form.phone', 'Phone Number')}</Label>
                  <Input
                    id="phone"
                    value={affiliateForm.phone}
                    onChange={(e) => setAffiliateForm({ ...affiliateForm, phone: e.target.value })}
                    placeholder={t('admin.affiliate.form.placeholders.phone', 'Enter phone number')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">{t('admin.affiliate.form.website', 'Website')}</Label>
                  <Input
                    id="website"
                    value={affiliateForm.website}
                    onChange={(e) => setAffiliateForm({ ...affiliateForm, website: e.target.value })}
                    placeholder="https://example.com"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="businessName">{t('admin.affiliate.form.business_name', 'Business Name')}</Label>
                <Input
                  id="businessName"
                  value={affiliateForm.businessName}
                  onChange={(e) => setAffiliateForm({ ...affiliateForm, businessName: e.target.value })}
                    placeholder={t('admin.affiliate.form.placeholders.business_name', 'Enter business name')}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="commissionRate">{t('admin.affiliate.form.commission_rate', 'Commission Rate')} (%)</Label>
                  <Input
                    id="commissionRate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={affiliateForm.defaultCommissionRate}
                    onChange={(e) => setAffiliateForm({ ...affiliateForm, defaultCommissionRate: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commissionType">{t('admin.affiliate.form.commission_type', 'Commission Type')}</Label>
                  <Select
                    value={affiliateForm.commissionType}
                    onValueChange={(value: 'percentage' | 'fixed' | 'tiered') =>
                      setAffiliateForm({ ...affiliateForm, commissionType: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">{t('admin.affiliate.commission_type.percentage', 'Percentage')}</SelectItem>
                      <SelectItem value="fixed">{t('admin.affiliate.commission_type.fixed', 'Fixed Amount')}</SelectItem>
                      <SelectItem value="tiered">{t('admin.affiliate.commission_type.tiered', 'Tiered')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">{t('admin.affiliate.form.notes', 'Notes')}</Label>
                <Textarea
                  id="notes"
                  value={affiliateForm.notes}
                  onChange={(e) => setAffiliateForm({ ...affiliateForm, notes: e.target.value })}
                  placeholder={t('admin.affiliate.form.placeholders.notes', 'Additional notes about this affiliate')}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateAffiliateDialogOpen(false)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                onClick={handleCreateSubmit}
                disabled={createAffiliateMutation.isPending || !affiliateForm.name || !affiliateForm.email}
              >
                {createAffiliateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('admin.affiliate.create.submit', 'Create Affiliate')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Affiliate Dialog */}
        <Dialog open={editAffiliateDialogOpen} onOpenChange={setEditAffiliateDialogOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{t('admin.affiliate.edit.title', 'Edit Affiliate')}</DialogTitle>
              <DialogDescription>
                {t('admin.affiliate.edit.description', 'Update affiliate partner information')}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">{t('admin.affiliate.form.name', 'Full Name')} *</Label>
                  <Input
                    id="edit-name"
                    value={affiliateForm.name}
                    onChange={(e) => setAffiliateForm({ ...affiliateForm, name: e.target.value })}
                    placeholder={t('admin.affiliate.form.placeholders.name', 'Enter full name')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-email">{t('admin.affiliate.form.email', 'Email Address')} *</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={affiliateForm.email}
                    onChange={(e) => setAffiliateForm({ ...affiliateForm, email: e.target.value })}
                    placeholder={t('admin.affiliate.form.placeholders.email', 'Enter email address')}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">{t('admin.affiliate.form.phone', 'Phone Number')}</Label>
                  <Input
                    id="edit-phone"
                    value={affiliateForm.phone}
                    onChange={(e) => setAffiliateForm({ ...affiliateForm, phone: e.target.value })}
                    placeholder={t('admin.affiliate.form.placeholders.phone', 'Enter phone number')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-website">{t('admin.affiliate.form.website', 'Website')}</Label>
                  <Input
                    id="edit-website"
                    value={affiliateForm.website}
                    onChange={(e) => setAffiliateForm({ ...affiliateForm, website: e.target.value })}
                    placeholder="https://example.com"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-businessName">{t('admin.affiliate.form.business_name', 'Business Name')}</Label>
                <Input
                  id="edit-businessName"
                  value={affiliateForm.businessName}
                  onChange={(e) => setAffiliateForm({ ...affiliateForm, businessName: e.target.value })}
                    placeholder={t('admin.affiliate.form.placeholders.business_name', 'Enter business name')}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-commissionRate">{t('admin.affiliate.form.commission_rate', 'Commission Rate')} (%)</Label>
                  <Input
                    id="edit-commissionRate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={affiliateForm.defaultCommissionRate}
                    onChange={(e) => setAffiliateForm({ ...affiliateForm, defaultCommissionRate: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-commissionType">{t('admin.affiliate.form.commission_type', 'Commission Type')}</Label>
                  <Select
                    value={affiliateForm.commissionType}
                    onValueChange={(value: 'percentage' | 'fixed' | 'tiered') =>
                      setAffiliateForm({ ...affiliateForm, commissionType: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">{t('admin.affiliate.commission_type.percentage', 'Percentage')}</SelectItem>
                      <SelectItem value="fixed">{t('admin.affiliate.commission_type.fixed', 'Fixed Amount')}</SelectItem>
                      <SelectItem value="tiered">{t('admin.affiliate.commission_type.tiered', 'Tiered')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditAffiliateDialogOpen(false)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                onClick={handleEditSubmit}
                disabled={updateAffiliateMutation.isPending || !affiliateForm.name || !affiliateForm.email}
              >
                {updateAffiliateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('admin.affiliate.edit.submit', 'Update Affiliate')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Affiliate Dialog */}
        <Dialog open={viewAffiliateDialogOpen} onOpenChange={setViewAffiliateDialogOpen}>
          <DialogContent className="sm:max-w-[700px]">
            <DialogHeader>
              <DialogTitle>{t('admin.affiliate.view.title', 'Affiliate Details')}</DialogTitle>
              <DialogDescription>
                {selectedAffiliate?.name} - {selectedAffiliate?.affiliateCode}
              </DialogDescription>
            </DialogHeader>
            {selectedAffiliate && (
              <div className="grid gap-6 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">
                      {t('admin.affiliate.view.basic_info', 'Basic Information')}
                    </Label>
                    <div className="mt-2 space-y-2">
                      <div><strong>{t('admin.affiliate.view.name', 'Name')}:</strong> {selectedAffiliate.name}</div>
                      <div><strong>{t('admin.affiliate.view.email', 'Email')}:</strong> {selectedAffiliate.email}</div>
                      {selectedAffiliate.phone && <div><strong>{t('admin.affiliate.view.phone', 'Phone')}:</strong> {selectedAffiliate.phone}</div>}
                      {selectedAffiliate.website && <div><strong>{t('admin.affiliate.view.website', 'Website')}:</strong> {selectedAffiliate.website}</div>}
                      {selectedAffiliate.businessName && <div><strong>{t('admin.affiliate.view.business', 'Business')}:</strong> {selectedAffiliate.businessName}</div>}
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">
                      {t('admin.affiliate.view.performance', 'Performance')}
                    </Label>
                    <div className="mt-2 space-y-2">
                      <div><strong>{t('admin.affiliate.view.total_referrals', 'Total Referrals')}:</strong> {selectedAffiliate.totalReferrals}</div>
                      <div><strong>{t('admin.affiliate.view.successful', 'Successful')}:</strong> {selectedAffiliate.successfulReferrals}</div>
                      <div><strong>{t('admin.affiliate.view.total_earnings', 'Total Earnings')}:</strong> {formatCurrency(selectedAffiliate.totalEarnings)}</div>
                      <div><strong>{t('admin.affiliate.view.pending', 'Pending')}:</strong> {formatCurrency(selectedAffiliate.pendingEarnings)}</div>
                      <div><strong>{t('admin.affiliate.view.paid', 'Paid')}:</strong> {formatCurrency(selectedAffiliate.paidEarnings)}</div>
                    </div>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">
                    {t('admin.affiliate.view.commission_settings', 'Commission Settings')}
                  </Label>
                  <div className="mt-2 space-y-2">
                    <div><strong>{t('admin.affiliate.view.commission_rate', 'Commission Rate')}:</strong> {selectedAffiliate.defaultCommissionRate}%</div>
                    <div><strong>{t('admin.affiliate.view.commission_type', 'Commission Type')}:</strong> {selectedAffiliate.commissionType}</div>
                    <div><strong>{t('admin.affiliate.view.status', 'Status')}:</strong> {getStatusBadge(selectedAffiliate.status)}</div>
                    <div><strong>{t('admin.affiliate.view.joined', 'Joined')}:</strong> {formatDate(selectedAffiliate.createdAt)}</div>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">
                    {t('admin.affiliate.view.referral_url', 'Referral URL')}
                  </Label>
                  <div className="mt-2">
                    <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-md border">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-mono text-blue-600 break-all">
                          {generateReferralUrl(selectedAffiliate.affiliateCode)}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => {
                            const url = generateReferralUrl(selectedAffiliate.affiliateCode);
                            navigator.clipboard.writeText(url);
                            toast({
                              title: 'Copied!',
                              description: 'Referral URL copied to clipboard',
                            });
                          }}
                          title="Copy referral URL"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => {
                            const url = generateReferralUrl(selectedAffiliate.affiliateCode);
                            window.open(url, '_blank');
                          }}
                          title="Open referral URL"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {t('admin.affiliate.view.referral_url_description', 'Share this URL with potential customers. When they sign up using this link, the affiliate will receive commission for successful conversions.')}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewAffiliateDialogOpen(false)}>
                {t('common.close', 'Close')}
              </Button>
              {selectedAffiliate && (
                <Button onClick={() => {
                  setViewAffiliateDialogOpen(false);
                  openEditDialog(selectedAffiliate);
                }}>
                  <Edit className="mr-2 h-4 w-4" />
                  {t('admin.affiliate.actions.edit', 'Edit')}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirmation Dialog */}
        <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                {confirmMessage.includes('delete') && <Trash2 className="h-5 w-5 text-red-600" />}
                {confirmMessage.includes('delete') ?
                  t('admin.affiliate.delete.confirm_title', 'Delete Affiliate') :
                  t('common.confirm', 'Confirm Action')
                }
              </AlertDialogTitle>
              <AlertDialogDescription className={confirmMessage.includes('delete') ? 'text-red-700' : ''}>
                {confirmMessage}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (confirmAction) {
                    confirmAction();
                  }
                  setConfirmDialogOpen(false);
                }}
                className={confirmMessage.includes('delete') ?
                  'bg-red-600 hover:bg-red-700 focus:ring-red-600' :
                  ''
                }
              >
                {confirmMessage.includes('delete') ?
                  t('admin.affiliate.delete.confirm_button', 'Delete') :
                  t('common.confirm', 'Confirm')
                }
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* View Application Details Dialog */}
        <Dialog open={viewApplicationDialogOpen} onOpenChange={setViewApplicationDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('admin.affiliate.applications.details.title', 'Application Details')}</DialogTitle>
              <DialogDescription>
                {t('admin.affiliate.applications.details.description', 'Complete information for this affiliate application')}
              </DialogDescription>
            </DialogHeader>

            {selectedApplication && (
              <div className="space-y-6">
                {/* Personal Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold border-b pb-2">{t('admin.affiliate.applications.details.personal_info', 'Personal Information')}</h3>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm font-medium text-gray-600">{t('admin.affiliate.applications.details.full_name', 'Full Name')}</Label>
                        <p className="text-sm">{selectedApplication.firstName} {selectedApplication.lastName}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-gray-600">{t('admin.affiliate.applications.details.email', 'Email')}</Label>
                        <p className="text-sm">{selectedApplication.email}</p>
                      </div>
                      {selectedApplication.phone && (
                        <div>
                          <Label className="text-sm font-medium text-gray-600">{t('admin.affiliate.applications.details.phone', 'Phone')}</Label>
                          <p className="text-sm">{selectedApplication.phone}</p>
                        </div>
                      )}
                      <div>
                        <Label className="text-sm font-medium text-gray-600">{t('admin.affiliate.applications.details.country', 'Country')}</Label>
                        <p className="text-sm">{selectedApplication.country}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold border-b pb-2">{t('admin.affiliate.applications.details.business_info', 'Business Information')}</h3>
                    <div className="space-y-3">
                      {selectedApplication.company && (
                        <div>
                          <Label className="text-sm font-medium text-gray-600">{t('admin.affiliate.applications.details.company', 'Company')}</Label>
                          <p className="text-sm">{selectedApplication.company}</p>
                        </div>
                      )}
                      {selectedApplication.website && (
                        <div>
                          <Label className="text-sm font-medium text-gray-600">{t('admin.affiliate.applications.details.website', 'Website')}</Label>
                          <p className="text-sm">
                            <a
                              href={selectedApplication.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {selectedApplication.website}
                            </a>
                          </p>
                        </div>
                      )}
                      <div>
                        <Label className="text-sm font-medium text-gray-600">{t('admin.affiliate.applications.details.status', 'Status')}</Label>
                        <div className="mt-1">
                          <Badge variant={
                            selectedApplication.status === 'approved' ? 'default' :
                            selectedApplication.status === 'rejected' ? 'destructive' :
                            selectedApplication.status === 'under_review' ? 'secondary' :
                            'outline'
                          }>
                            {t(`admin.affiliate.applications.status.${selectedApplication.status}`, selectedApplication.status)}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-gray-600">{t('admin.affiliate.applications.details.submitted', 'Submitted')}</Label>
                        <p className="text-sm">
                          {new Date(selectedApplication.submittedAt || selectedApplication.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Marketing Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold border-b pb-2">{t('admin.affiliate.applications.details.marketing_info', 'Marketing Information')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-gray-600">{t('admin.affiliate.applications.details.marketing_channels', 'Marketing Channels')}</Label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {Array.isArray(selectedApplication.marketingChannels) ?
                          selectedApplication.marketingChannels.map((channel: string, index: number) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {channel.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </Badge>
                          )) : (
                            <Badge variant="outline" className="text-xs">
                              {selectedApplication.marketingChannels}
                            </Badge>
                          )
                        }
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-600">{t('admin.affiliate.applications.details.expected_referrals', 'Expected Monthly Referrals')}</Label>
                      <p className="text-sm">{selectedApplication.expectedMonthlyReferrals}</p>
                    </div>
                  </div>
                </div>

                {/* Experience */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold border-b pb-2">{t('admin.affiliate.applications.details.experience_motivation', 'Experience & Motivation')}</h3>
                  <div>
                    <Label className="text-sm font-medium text-gray-600">{t('admin.affiliate.applications.details.experience', 'Experience')}</Label>
                    <div className="mt-2 p-3 bg-gray-50 rounded-md">
                      <p className="text-sm whitespace-pre-wrap">{selectedApplication.experience}</p>
                    </div>
                  </div>
                  {selectedApplication.motivation && (
                    <div>
                      <Label className="text-sm font-medium text-gray-600">{t('admin.affiliate.applications.details.motivation', 'Motivation')}</Label>
                      <div className="mt-2 p-3 bg-gray-50 rounded-md">
                        <p className="text-sm whitespace-pre-wrap">{selectedApplication.motivation}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Terms Agreement */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold border-b pb-2">{t('admin.affiliate.applications.details.agreement', 'Agreement')}</h3>
                  <div className="flex items-center space-x-2">
                    <Checkbox checked={selectedApplication.agreeToTerms} disabled />
                    <Label className="text-sm">{t('admin.affiliate.applications.details.agreed_to_terms', 'Agreed to Terms and Conditions')}</Label>
                  </div>
                </div>

                {/* Rejection Reason (if rejected) */}
                {selectedApplication.status === 'rejected' && selectedApplication.rejectionReason && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold border-b pb-2 text-red-600">{t('admin.affiliate.applications.details.rejection_reason', 'Rejection Reason')}</h3>
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-sm text-red-800">{selectedApplication.rejectionReason}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="flex justify-between">
              <div className="flex space-x-2">
                {selectedApplication?.status === 'pending' && (
                  <>
                    <Button
                      onClick={() => {
                        approveApplicationMutation.mutate(selectedApplication.id);
                        setViewApplicationDialogOpen(false);
                      }}
                      className="bg-green-600 hover:bg-green-700"
                      disabled={approveApplicationMutation.isPending}
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      {t('admin.affiliate.applications.actions.approve', 'Approve')}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        const rejectionReason = prompt(t('admin.affiliate.applications.reject.prompt', 'Please provide a reason for rejection:'));
                        if (rejectionReason) {
                          rejectApplicationMutation.mutate({
                            applicationId: selectedApplication.id,
                            rejectionReason
                          });
                          setViewApplicationDialogOpen(false);
                        }
                      }}
                      disabled={rejectApplicationMutation.isPending}
                    >
                      <AlertCircle className="mr-2 h-4 w-4" />
                      {t('admin.affiliate.applications.actions.reject', 'Reject')}
                    </Button>
                  </>
                )}
              </div>
              <Button variant="outline" onClick={() => setViewApplicationDialogOpen(false)}>
                {t('common.close', 'Close')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
