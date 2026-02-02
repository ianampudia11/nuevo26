import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, BarChart, PieChart, LineChart, Users, Building, MessageSquare, Calendar } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { apiRequest } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AnalyticsData {
  totalUsers: number;
  totalCompanies: number;
  activeCompanies: number;
  totalConversations: number;
  totalMessages: number;
  totalContacts: number;
  userGrowth: {
    date: string;
    count: number;
  }[];
  messagesByChannel: {
    channel: string;
    count: number;
  }[];
  conversationsByCompany: {
    company: string;
    count: number;
  }[];
  activeUsersByDay: {
    date: string;
    count: number;
  }[];
}

export default function AnalyticsPage() {
  const { user, isLoading } = useAuth();
  const [_, navigate] = useLocation();
  const [timeRange, setTimeRange] = useState("30days");
  const { t } = useTranslation();


  useEffect(() => {
    if (!isLoading && user && !user.isSuperAdmin) {
      navigate("/");
    }
  }, [user, isLoading, navigate]);


  const {
    data: analyticsData,
    isLoading: isLoadingAnalytics,
    error: analyticsError
  } = useQuery<AnalyticsData>({
    queryKey: ['/api/admin/analytics', timeRange],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/admin/analytics?timeRange=${timeRange}`);

        if (!res.ok) {
          console.error(`Analytics API error: ${res.status} ${res.statusText}`);
          throw new Error(`Failed to fetch analytics data: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        return data;
      } catch (error) {
        console.error("Error fetching analytics data:", error);
        throw error;
      }
    },
    enabled: !!user?.isSuperAdmin,
    retry: 2
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user?.isSuperAdmin) {
    return null; // Will redirect in useEffect
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl">{t('admin.analytics.dashboard_title', 'Analytics Dashboard')}</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('admin.analytics.time_range', 'Time Range:')}</span>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t('admin.analytics.select_time_range', 'Select time range')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7days">{t('admin.analytics.last_7_days', 'Last 7 Days')}</SelectItem>
                <SelectItem value="30days">{t('admin.analytics.last_30_days', 'Last 30 Days')}</SelectItem>
                <SelectItem value="90days">{t('admin.analytics.last_90_days', 'Last 90 Days')}</SelectItem>
                <SelectItem value="year">{t('admin.analytics.last_year', 'Last Year')}</SelectItem>
                <SelectItem value="all">{t('admin.analytics.all_time', 'All Time')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoadingAnalytics ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : analyticsError ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="text-red-500 dark:text-red-400 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-2">{t('admin.analytics.error_loading', 'Error Loading Analytics')}</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4 text-center max-w-md">
              {analyticsError instanceof Error ? analyticsError.message : t('admin.analytics.failed_load_data', 'Failed to load analytics data')}
            </p>
            <Button onClick={() => window.location.reload()}>
              {t('admin.analytics.retry', 'Retry')}
            </Button>
          </div>
        ) : (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t('admin.analytics.total_users', 'Total Users')}</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl">{analyticsData?.totalUsers || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {t('admin.analytics.users_last_period', '+{{count}} in the last period', { count: analyticsData?.userGrowth?.[analyticsData.userGrowth.length - 1]?.count || 0 })}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t('admin.analytics.companies', 'Companies')}</CardTitle>
                  <Building className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl">{analyticsData?.totalCompanies || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {t('admin.analytics.active_companies', '{{count}} active companies', { count: analyticsData?.activeCompanies || 0 })}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t('admin.analytics.messages', 'Messages')}</CardTitle>
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl">{analyticsData?.totalMessages?.toLocaleString() || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {t('admin.analytics.across_conversations', 'Across {{count}} conversations', { count: analyticsData?.totalConversations || 0 })}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t('admin.analytics.contacts', 'Contacts')}</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl">{analyticsData?.totalContacts?.toLocaleString() || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {t('admin.analytics.in_contact_database', 'In contact database')}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('admin.analytics.user_growth', 'User Growth')}</CardTitle>
                  <CardDescription>New user registrations over time</CardDescription>
                </CardHeader>
                <CardContent className="h-80">
                  <div className="flex items-center justify-center h-full">
                    <LineChart className="h-16 w-16 text-muted-foreground" />
                    <p className="ml-4 text-muted-foreground">{t('admin.analytics.user_growth_chart', 'User growth chart visualization')}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('admin.analytics.channel_distribution', 'Channel Distribution')}</CardTitle>
                  <CardDescription>Distribution of messages across channels</CardDescription>
                </CardHeader>
                <CardContent className="h-80">
                  <div className="flex items-center justify-center h-full">
                    <PieChart className="h-16 w-16 text-muted-foreground" />
                    <p className="ml-4 text-muted-foreground">{t('admin.analytics.channel_distribution_chart', 'Channel distribution chart visualization')}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Conversations by Company</CardTitle>
                  <CardDescription>Top companies by conversation volume</CardDescription>
                </CardHeader>
                <CardContent className="h-80">
                  <div className="flex items-center justify-center h-full">
                    <BarChart className="h-16 w-16 text-muted-foreground" />
                    <p className="ml-4 text-muted-foreground">Company conversation chart visualization</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Active Users</CardTitle>
                  <CardDescription>Daily active users over time</CardDescription>
                </CardHeader>
                <CardContent className="h-80">
                  <div className="flex items-center justify-center h-full">
                    <LineChart className="h-16 w-16 text-muted-foreground" />
                    <p className="ml-4 text-muted-foreground">Active users chart visualization</p>
                  </div>
                </CardContent>
              </Card>
            </div>

          </>
        )}
      </div>
    </AdminLayout>
  );
}
