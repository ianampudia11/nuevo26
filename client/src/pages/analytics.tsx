import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useState, useMemo } from 'react';
import { Loader2, Calendar as CalendarIcon, Users, MessageSquare, AlertCircle, HelpCircle, ArrowUpRight, ArrowDownRight, Zap, Target } from 'lucide-react';
import { RiWhatsappFill, RiMessengerFill, RiInstagramFill, RiMailFill } from 'react-icons/ri';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useTranslation } from '@/hooks/use-translation';
import { format, subDays, startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, isAfter, isBefore, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from 'next-themes';


interface AnalyticsOverview {
  conversationsCount: number;
  contactsCount: number;
  messagesCount: number;
  responseRate: number;
  avgResponseTime?: number;
  activeUsers?: number;
  conversationsGrowth?: number;
  contactsGrowth?: number;
  messagesGrowth?: number;
  responseRateGrowth?: number;
}

interface ConversationsByDay {
  name: string;
  whatsapp_official: number;
  whatsapp_unofficial: number;
  messenger: number;
  instagram: number;
  total: number;
}

interface ChannelDistribution {
  name: string;
  value: number;
  percentage: number;
}







interface AnalyticsData {
  overview: AnalyticsOverview;
  conversationsByDay: ConversationsByDay[];
  channelDistribution: ChannelDistribution[];
  messagesByChannel: any[];
  conversionFunnel?: any[];
  userActivity?: any[];
}


const DATE_RANGE_PRESETS = {
  today: { label: 'Today', key: 'today' },
  yesterday: { label: 'Yesterday', key: 'yesterday' },
  thisWeek: { label: 'This Week', key: 'thisWeek' },
  lastWeek: { label: 'Last Week', key: 'lastWeek' },
  last7days: { label: 'Last 7 Days', key: 'last7days' },
  thisMonth: { label: 'This Month', key: 'thisMonth' },
  lastMonth: { label: 'Last Month', key: 'lastMonth' },
  last30days: { label: 'Last 30 Days', key: 'last30days' },
  thisQuarter: { label: 'This Quarter', key: 'thisQuarter' },
  lastQuarter: { label: 'Last Quarter', key: 'lastQuarter' },
  last90days: { label: 'Last 90 Days', key: 'last90days' },
  thisYear: { label: 'This Year', key: 'thisYear' },
  lastYear: { label: 'Last Year', key: 'lastYear' },
  custom: { label: 'Custom Range', key: 'custom' }
} as const;

type DateRangePreset = keyof typeof DATE_RANGE_PRESETS;


const MetricCardSkeleton = () => (
  <Card className="animate-pulse">
    <CardContent className="pt-6">
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-8 w-16 mb-3" />
        </div>
        <Skeleton className="h-9 w-9 rounded-md" />
      </div>
      <div className="flex items-center mt-3">
        <Skeleton className="h-4 w-12 mr-2" />
        <Skeleton className="h-4 w-20" />
      </div>
    </CardContent>
  </Card>
);

const ChartCardSkeleton = ({ height = 300 }: { height?: number }) => (
  <Card className="animate-pulse">
    <CardHeader className="pb-3">
      <Skeleton className="h-6 w-48" />
    </CardHeader>
    <CardContent>
      <Skeleton className={`w-full h-[${height}px]`} />
    </CardContent>
  </Card>
);


const calculateDateRange = (preset: DateRangePreset): { from: Date; to: Date } => {
  const now = new Date();

  switch (preset) {
    case 'today':
      return {
        from: startOfDay(now),
        to: new Date()
      };
    case 'yesterday':
      const yesterday = subDays(now, 1);
      return {
        from: startOfDay(yesterday),
        to: new Date(startOfDay(yesterday).getTime() + 24 * 60 * 60 * 1000 - 1)
      };
    case 'thisWeek':
      return {
        from: startOfWeek(now, { weekStartsOn: 1 }), // Monday start
        to: now
      };
    case 'lastWeek':
      const lastWeekStart = startOfWeek(subDays(now, 7), { weekStartsOn: 1 });
      return {
        from: lastWeekStart,
        to: endOfWeek(lastWeekStart, { weekStartsOn: 1 })
      };
    case 'last7days':
      return {
        from: subDays(now, 7),
        to: now
      };
    case 'thisMonth':
      return {
        from: startOfMonth(now),
        to: now
      };
    case 'lastMonth':
      const lastMonth = subDays(startOfMonth(now), 1);
      return {
        from: startOfMonth(lastMonth),
        to: endOfMonth(lastMonth)
      };
    case 'last30days':
      return {
        from: subDays(now, 30),
        to: now
      };
    case 'thisQuarter':
      return {
        from: startOfQuarter(now),
        to: now
      };
    case 'lastQuarter':
      const lastQuarter = subDays(startOfQuarter(now), 1);
      return {
        from: startOfQuarter(lastQuarter),
        to: endOfQuarter(lastQuarter)
      };
    case 'last90days':
      return {
        from: subDays(now, 90),
        to: now
      };
    case 'thisYear':
      return {
        from: startOfYear(now),
        to: now
      };
    case 'lastYear':
      const lastYear = subDays(startOfYear(now), 1);
      return {
        from: startOfYear(lastYear),
        to: endOfYear(lastYear)
      };
    default:
      return {
        from: subDays(now, 7),
        to: now
      };
  }
};


const validateDateRange = (from: Date, to: Date): { isValid: boolean; error?: string } => {
  if (isAfter(from, to)) {
    return { isValid: false, error: 'Start date must be before end date' };
  }

  if (isAfter(from, new Date())) {
    return { isValid: false, error: 'Start date cannot be in the future' };
  }

  const daysDiff = differenceInDays(to, from);
  if (daysDiff > 365) {
    return { isValid: false, error: 'Date range cannot exceed 365 days' };
  }

  return { isValid: true };
};


const formatDateRangeDisplay = (from: Date, to: Date): string => {
  const now = new Date();
  const isToday = format(to, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd');
  const isSameMonth = format(from, 'yyyy-MM') === format(to, 'yyyy-MM');
  const isSameYear = format(from, 'yyyy') === format(to, 'yyyy');

  if (format(from, 'yyyy-MM-dd') === format(to, 'yyyy-MM-dd')) {

    return format(from, 'LLL dd, y');
  } else if (isSameMonth) {

    return `${format(from, 'LLL dd')} - ${format(to, 'dd, y')}`;
  } else if (isSameYear) {

    return `${format(from, 'LLL dd')} - ${format(to, 'LLL dd, y')}`;
  } else {

    return `${format(from, 'LLL dd, y')} - ${format(to, 'LLL dd, y')}`;
  }
};

export default function Analytics() {
  const [timePeriod, setTimePeriod] = useState<DateRangePreset>('last7days');
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>(() =>
    calculateDateRange('last7days')
  );
  const [dateRangeError, setDateRangeError] = useState<string | null>(null);

  const { t } = useTranslation();
  const { toast } = useToast();
  const { theme } = useTheme();


  const getCssVariable = (variableName: string): string => {
    if (typeof window === 'undefined') return '';
    try {
      const root = document.documentElement;
      const value = getComputedStyle(root).getPropertyValue(variableName).trim();
      return value ? `hsl(${value})` : '';
    } catch {
      return '';
    }
  };


  const chartColors = useMemo(() => {
    return {
      background: getCssVariable('--background') || 'hsl(0 0% 100%)',
      foreground: getCssVariable('--foreground') || 'hsl(222.2 84% 4.9%)',
      border: getCssVariable('--border') || 'hsl(214.3 31.8% 91.4%)',
      mutedForeground: getCssVariable('--muted-foreground') || 'hsl(215.4 16.3% 46.9%)',
      card: getCssVariable('--card') || 'hsl(0 0% 100%)',
    };
  }, [theme]);


  const getChannelIcon = (channelType: string) => {
    const normalizedType = channelType.toLowerCase();


    if (normalizedType.includes('whatsapp') && normalizedType.includes('official')) {
      return <RiWhatsappFill className="w-4 h-4 text-green-500 dark:text-green-400" />;
    }
    if (normalizedType.includes('whatsapp') && normalizedType.includes('unofficial')) {
      return <RiWhatsappFill className="w-4 h-4 text-orange-500 dark:text-orange-400" />;
    }
    if (normalizedType.includes('whatsapp')) {
      return <RiWhatsappFill className="w-4 h-4 text-green-500 dark:text-green-400" />;
    }


    if (normalizedType.includes('messenger')) {
      return <RiMessengerFill className="w-4 h-4 text-blue-500 dark:text-blue-400" />;
    }
    if (normalizedType.includes('instagram')) {
      return <RiInstagramFill className="w-4 h-4 text-pink-500 dark:text-pink-400" />;
    }
    if (normalizedType.includes('email') || normalizedType.includes('mail')) {
      return <RiMailFill className="w-4 h-4 text-muted-foreground" />;
    }


    return <div className="w-4 h-4 rounded-full bg-muted-foreground" />;
  };


  const CustomLegend = ({ payload }: any) => {
    return (
      <div className="flex flex-wrap justify-center gap-4 mt-4">
        {payload?.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2">
            {getChannelIcon(entry.value)}
            <span className="text-sm text-muted-foreground">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  };


  const { data: analyticsData, isLoading: loading, error } = useQuery<AnalyticsData>({
    queryKey: ['/api/analytics/overview', timePeriod, dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();


      if (dateRange.from && dateRange.to) {
        params.append('from', dateRange.from.toISOString());
        params.append('to', dateRange.to.toISOString());
      }


      params.append('period', timePeriod);

      const response = await apiRequest('GET', `/api/analytics/overview?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch analytics data');
      }

      return response.json();
    },
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });


  const handleTimePeriodChange = (period: string) => {
    const preset = period as DateRangePreset;
    setTimePeriod(preset);
    setDateRangeError(null);

    if (preset !== 'custom') {
      const newRange = calculateDateRange(preset);


      const validation = validateDateRange(newRange.from, newRange.to);
      if (!validation.isValid) {
        setDateRangeError(validation.error || 'Invalid date range');
        toast({
          title: "Invalid Date Range",
          description: validation.error,
          variant: "destructive",
        });
        return;
      }

      setDateRange(newRange);
    }
  };

  const handleCustomDateRangeChange = (range: any) => {
    if (range?.from && range?.to) {
      const validation = validateDateRange(range.from, range.to);
      if (!validation.isValid) {
        setDateRangeError(validation.error || 'Invalid date range');
        toast({
          title: "Invalid Date Range",
          description: validation.error,
          variant: "destructive",
        });
        return;
      }

      setDateRangeError(null);
      setDateRange({ from: range.from, to: range.to });
      setTimePeriod('custom');
    }
  };

 

  const conversationData = analyticsData?.conversationsByDay || [
    { name: 'Mon', whatsapp_official: 0, whatsapp_unofficial: 0, messenger: 0, instagram: 0 },
    { name: 'Tue', whatsapp_official: 0, whatsapp_unofficial: 0, messenger: 0, instagram: 0 },
    { name: 'Wed', whatsapp_official: 0, whatsapp_unofficial: 0, messenger: 0, instagram: 0 },
    { name: 'Thu', whatsapp_official: 0, whatsapp_unofficial: 0, messenger: 0, instagram: 0 },
    { name: 'Fri', whatsapp_official: 0, whatsapp_unofficial: 0, messenger: 0, instagram: 0 },
    { name: 'Sat', whatsapp_official: 0, whatsapp_unofficial: 0, messenger: 0, instagram: 0 },
    { name: 'Sun', whatsapp_official: 0, whatsapp_unofficial: 0, messenger: 0, instagram: 0 },
  ];
  
  const formattedConversationData = conversationData.map((item: any) => {
    if (item.name && item.name.includes('-')) {
      const date = new Date(item.name);
      return {
        ...item,
        name: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      };
    }
    return item;
  });
  
  const channelDistributionData = analyticsData?.channelDistribution || [
    { name: 'WhatsApp Official', value: 0 },
    { name: 'WhatsApp Unofficial', value: 0 },
    { name: 'Messenger', value: 0 },
    { name: 'Instagram', value: 0 },
  ];

  const COLORS = ['#25D366', '#F59E0B', '#1877F2', '#E4405F'];
  
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
    const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);
  
    return (
      <text 
        x={x} 
        y={y} 
        fill={theme === 'dark' ? 'hsl(var(--foreground))' : 'white'} 
        textAnchor="middle" 
        dominantBaseline="central"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };
  
  return (
    <div className="h-screen flex flex-col overflow-hidden font-sans text-foreground">
      <Header />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        
        <div className="flex-1 overflow-y-auto p-3 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">
                {t('analytics.title', 'Analytics')}
              </h1>
              <p className="text-muted-foreground text-sm">
                Track your communication performance and engagement metrics
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">{/* Date controls section */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
              <Select value={timePeriod} onValueChange={handleTimePeriodChange}>
                <SelectTrigger className="w-full sm:w-[200px] lg:w-[220px] h-10">
                  <SelectValue placeholder={t('analytics.select_period', 'Select time period')} />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="today">{t('analytics.period.today', DATE_RANGE_PRESETS.today.label)}</SelectItem>
                  <SelectItem value="yesterday">{t('analytics.period.yesterday', DATE_RANGE_PRESETS.yesterday.label)}</SelectItem>
                  <SelectItem value="thisWeek">{t('analytics.period.thisWeek', DATE_RANGE_PRESETS.thisWeek.label)}</SelectItem>
                  <SelectItem value="lastWeek">{t('analytics.period.lastWeek', DATE_RANGE_PRESETS.lastWeek.label)}</SelectItem>
                  <SelectItem value="last7days">{t('analytics.period.last7days', DATE_RANGE_PRESETS.last7days.label)}</SelectItem>
                  <SelectItem value="thisMonth">{t('analytics.period.thisMonth', DATE_RANGE_PRESETS.thisMonth.label)}</SelectItem>
                  <SelectItem value="lastMonth">{t('analytics.period.lastMonth', DATE_RANGE_PRESETS.lastMonth.label)}</SelectItem>
                  <SelectItem value="last30days">{t('analytics.period.last30days', DATE_RANGE_PRESETS.last30days.label)}</SelectItem>
                  <SelectItem value="thisQuarter">{t('analytics.period.thisQuarter', DATE_RANGE_PRESETS.thisQuarter.label)}</SelectItem>
                  <SelectItem value="lastQuarter">{t('analytics.period.lastQuarter', DATE_RANGE_PRESETS.lastQuarter.label)}</SelectItem>
                  <SelectItem value="last90days">{t('analytics.period.last90days', DATE_RANGE_PRESETS.last90days.label)}</SelectItem>
                  <SelectItem value="thisYear">{t('analytics.period.thisYear', DATE_RANGE_PRESETS.thisYear.label)}</SelectItem>
                  <SelectItem value="lastYear">{t('analytics.period.lastYear', DATE_RANGE_PRESETS.lastYear.label)}</SelectItem>
                  <SelectItem value="custom">{t('analytics.period.custom', DATE_RANGE_PRESETS.custom.label)}</SelectItem>
                </SelectContent>
              </Select>

              {/* Always show date range display */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full sm:w-[280px] lg:w-[320px] justify-start text-left font-normal h-10",
                      dateRangeError && "border-destructive text-destructive",
                      !dateRange && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from && dateRange?.to ? (
                      formatDateRangeDisplay(dateRange.from, dateRange.to)
                    ) : (
                      <span>{t('analytics.pick_date', 'Pick a date')}</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto max-w-[95vw] p-0" align="start">
                  <div className="p-3 border-b max-w-md">
                    <h4 className="font-medium text-sm mb-3">Quick Presets</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {Object.entries(DATE_RANGE_PRESETS).slice(0, -1).map(([key, preset]) => (
                        <Button
                          key={key}
                          variant={timePeriod === key ? "default" : "ghost"}
                          size="sm"
                          className="justify-start text-xs h-8 w-full whitespace-nowrap"
                          onClick={() => handleTimePeriodChange(key)}
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="p-3">
                    <h4 className="font-medium text-sm mb-2">Custom Range</h4>
                    <div className="overflow-x-auto">
                      <div className="hidden md:block">
                        <Calendar
                          initialFocus
                          mode="range"
                          defaultMonth={dateRange?.from}
                          selected={dateRange}
                          onSelect={handleCustomDateRangeChange}
                          numberOfMonths={2}
                          disabled={(date) => isAfter(date, new Date())}
                          className="min-w-fit"
                        />
                      </div>
                      <div className="block md:hidden">
                        <Calendar
                          initialFocus
                          mode="range"
                          defaultMonth={dateRange?.from}
                          selected={dateRange}
                          onSelect={handleCustomDateRangeChange}
                          numberOfMonths={1}
                          disabled={(date) => isAfter(date, new Date())}
                          className="min-w-fit"
                        />
                      </div>
                    </div>
                    {dateRangeError && (
                      <p className="text-sm text-destructive mt-2">{dateRangeError}</p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading analytics data...</span>
            </div>
          ) : loading ? (
            <TooltipProvider>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <MetricCardSkeleton key={i} />
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6 mb-6">
                <ChartCardSkeleton />
                <ChartCardSkeleton />
              </div>
            </TooltipProvider>
          ) : error ? (
            <div className="flex flex-col justify-center items-center h-64 text-destructive space-y-2">
              <AlertCircle className="h-8 w-8" />
              <p className="text-center">{error instanceof Error ? error.message : 'Failed to load analytics data'}</p>
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
                className="mt-4"
              >
                {t('common.retry', 'Retry')}
              </Button>
            </div>
          ) : (
            <TooltipProvider>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6">
                <Card className="group hover:shadow-lg hover:shadow-green-100/50 dark:hover:shadow-green-900/20 transition-all duration-300 border-0 shadow-md bg-gradient-to-br from-card via-card to-primary/5">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-sm font-medium text-muted-foreground truncate">
                            {t('analytics.cards.total_conversations', 'Total Conversations')}
                          </p>
                          <UITooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3 w-3 text-muted-foreground/70 hover:text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Total number of conversations in the selected period</p>
                            </TooltipContent>
                          </UITooltip>
                        </div>
                        <p className="text-2xl sm:text-3xl font-bold mt-1 text-foreground group-hover:text-green-700 dark:group-hover:text-green-400 transition-colors">
                          {analyticsData?.overview?.conversationsCount?.toLocaleString() || 0}
                        </p>
                      </div>
                      <div className="p-3 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-xl flex-shrink-0 group-hover:bg-green-200 dark:group-hover:bg-green-900/30 group-hover:scale-110 transition-all duration-300">
                        <MessageSquare className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="flex items-center mt-4 text-sm">
                      <Badge variant={(analyticsData?.overview?.conversationsGrowth || 0) >= 0 ? "default" : "destructive"} className={`flex items-center gap-1 px-2 py-1 ${(analyticsData?.overview?.conversationsGrowth || 0) >= 0 ? '!bg-green-100 dark:!bg-green-900/20 !text-green-800 dark:!text-green-400' : ''}`}>
                        {(analyticsData?.overview?.conversationsGrowth || 0) >= 0 ? (
                          <ArrowUpRight className="h-3 w-3" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3" />
                        )}
                        {Math.abs(analyticsData?.overview?.conversationsGrowth || 0).toFixed(1)}%
                      </Badge>
                      <span className="text-muted-foreground ml-2 text-xs">
                        {t('analytics.vs_last_period', 'vs last period')}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="group hover:shadow-lg hover:shadow-blue-100/50 dark:hover:shadow-blue-900/20 transition-all duration-300 border-0 shadow-md bg-gradient-to-br from-card via-card to-primary/5">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-sm font-medium text-muted-foreground truncate">
                            {t('analytics.cards.total_contacts', 'Total Contacts')}
                          </p>
                          <UITooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3 w-3 text-muted-foreground/70 hover:text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Total number of contacts created in the selected period</p>
                            </TooltipContent>
                          </UITooltip>
                        </div>
                        <p className="text-2xl sm:text-3xl font-bold mt-1 text-foreground group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">
                          {analyticsData?.overview?.contactsCount?.toLocaleString() || 0}
                        </p>
                      </div>
                      <div className="p-3 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-xl flex-shrink-0 group-hover:bg-blue-200 dark:group-hover:bg-blue-900/30 group-hover:scale-110 transition-all duration-300">
                        <Users className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="flex items-center mt-4 text-sm">
                      <Badge variant={(analyticsData?.overview?.contactsGrowth || 0) >= 0 ? "default" : "destructive"} className={`flex items-center gap-1 px-2 py-1 ${(analyticsData?.overview?.contactsGrowth || 0) >= 0 ? '!bg-green-100 dark:!bg-green-900/20 !text-green-800 dark:!text-green-400' : ''}`}>
                        {(analyticsData?.overview?.contactsGrowth || 0) >= 0 ? (
                          <ArrowUpRight className="h-3 w-3" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3" />
                        )}
                        {Math.abs(analyticsData?.overview?.contactsGrowth || 0).toFixed(1)}%
                      </Badge>
                      <span className="text-muted-foreground ml-2 text-xs">
                        {t('analytics.vs_last_period', 'vs last period')}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="group hover:shadow-lg hover:shadow-purple-100/50 dark:hover:shadow-purple-900/20 transition-all duration-300 border-0 shadow-md bg-gradient-to-br from-card via-card to-primary/5">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-sm font-medium text-muted-foreground truncate">
                            {t('analytics.cards.total_messages', 'Total Messages')}
                          </p>
                          <UITooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3 w-3 text-muted-foreground/70 hover:text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Total number of messages sent and received in the selected period</p>
                            </TooltipContent>
                          </UITooltip>
                        </div>
                        <p className="text-2xl sm:text-3xl font-bold mt-1 text-foreground group-hover:text-purple-700 dark:group-hover:text-purple-400 transition-colors">
                          {analyticsData?.overview?.messagesCount?.toLocaleString() || 0}
                        </p>
                      </div>
                      <div className="p-3 bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 rounded-xl flex-shrink-0 group-hover:bg-purple-200 dark:group-hover:bg-purple-900/30 group-hover:scale-110 transition-all duration-300">
                        <Zap className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="flex items-center mt-4 text-sm">
                      <Badge variant={(analyticsData?.overview?.messagesGrowth || 0) >= 0 ? "default" : "destructive"} className={`flex items-center gap-1 px-2 py-1 ${(analyticsData?.overview?.messagesGrowth || 0) >= 0 ? '!bg-green-100 dark:!bg-green-900/20 !text-green-800 dark:!text-green-400' : ''}`}>
                        {(analyticsData?.overview?.messagesGrowth || 0) >= 0 ? (
                          <ArrowUpRight className="h-3 w-3" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3" />
                        )}
                        {Math.abs(analyticsData?.overview?.messagesGrowth || 0).toFixed(1)}%
                      </Badge>
                      <span className="text-muted-foreground ml-2 text-xs">
                        {t('analytics.vs_last_period', 'vs last period')}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="group hover:shadow-lg hover:shadow-emerald-100/50 dark:hover:shadow-emerald-900/20 transition-all duration-300 border-0 shadow-md bg-gradient-to-br from-card via-card to-primary/5">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-sm font-medium text-muted-foreground truncate">
                            {t('analytics.cards.response_rate', 'Response Rate')}
                          </p>
                          <UITooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3 w-3 text-muted-foreground/70 hover:text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Percentage of messages that received a response in the selected period</p>
                            </TooltipContent>
                          </UITooltip>
                        </div>
                        <p className="text-2xl sm:text-3xl font-bold mt-1 text-foreground group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                          {(analyticsData?.overview?.responseRate || 0).toFixed(1)}%
                        </p>
                      </div>
                      <div className="p-3 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-xl flex-shrink-0 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-900/30 group-hover:scale-110 transition-all duration-300">
                        <Target className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="flex items-center mt-4 text-sm">
                      <Badge variant={(analyticsData?.overview?.responseRateGrowth || 0) >= 0 ? "default" : "destructive"} className={`flex items-center gap-1 px-2 py-1 ${(analyticsData?.overview?.responseRateGrowth || 0) >= 0 ? '!bg-green-100 dark:!bg-green-900/20 !text-green-800 dark:!text-green-400' : ''}`}>
                        {(analyticsData?.overview?.responseRateGrowth || 0) >= 0 ? (
                          <ArrowUpRight className="h-3 w-3" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3" />
                        )}
                        {Math.abs(analyticsData?.overview?.responseRateGrowth || 0).toFixed(1)}%
                      </Badge>
                      <span className="text-muted-foreground ml-2 text-xs">
                        {t('analytics.vs_last_period', 'vs last period')}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6 mb-6">
                <Card className="group hover:shadow-xl hover:shadow-blue-100/20 dark:hover:shadow-blue-900/10 transition-all duration-300 border-0 shadow-lg bg-gradient-to-br from-card via-card to-primary/5">
                  <CardHeader className="pb-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg sm:text-xl font-semibold text-foreground group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">
                        {t('analytics.charts.conversations_by_channel', 'Conversations by Channel')}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <UITooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <HelpCircle className="h-4 w-4 text-muted-foreground/70 hover:text-muted-foreground" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Daily conversation trends across different channels</p>
                          </TooltipContent>
                        </UITooltip>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="w-full overflow-x-auto">
                      <ResponsiveContainer width="100%" height={320} minWidth={300}>
                        <LineChart data={formattedConversationData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="2 2" stroke={chartColors.border} opacity={0.8} />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 11, fill: chartColors.mutedForeground }}
                            tickLine={{ stroke: chartColors.border }}
                            axisLine={{ stroke: chartColors.border }}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: chartColors.mutedForeground }}
                            tickLine={{ stroke: chartColors.border }}
                            axisLine={{ stroke: chartColors.border }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: chartColors.background,
                              border: `1px solid ${chartColors.border}`,
                              borderRadius: '12px',
                              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                              fontSize: '12px',
                              color: chartColors.foreground
                            }}
                            cursor={{ stroke: chartColors.border, strokeWidth: 1 }}
                          />
                          <Legend
                            content={<CustomLegend />}
                            wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }}
                          />
                          <Line
                            type="monotone"
                            dataKey="whatsapp_official"
                            name={t('analytics.channels.whatsapp_official', 'WhatsApp Official')}
                            stroke="#25D366"
                            strokeWidth={3}
                            dot={{ fill: '#25D366', strokeWidth: 0, r: 3 }}
                            activeDot={{ r: 6, stroke: '#25D366', strokeWidth: 2, fill: '#fff' }}
                            connectNulls={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="whatsapp_unofficial"
                            name={t('analytics.channels.whatsapp_unofficial', 'WhatsApp Unofficial')}
                            stroke="#F59E0B"
                            strokeWidth={3}
                            dot={{ fill: '#F59E0B', strokeWidth: 0, r: 3 }}
                            activeDot={{ r: 6, stroke: '#F59E0B', strokeWidth: 2, fill: '#fff' }}
                            connectNulls={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="messenger"
                            name={t('analytics.channels.messenger', 'Messenger')}
                            stroke="#1877F2"
                            strokeWidth={3}
                            dot={{ fill: '#1877F2', strokeWidth: 0, r: 3 }}
                            activeDot={{ r: 6, stroke: '#1877F2', strokeWidth: 2, fill: '#fff' }}
                            connectNulls={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="instagram"
                            name={t('analytics.channels.instagram', 'Instagram')}
                            stroke="#E4405F"
                            strokeWidth={3}
                            dot={{ fill: '#E4405F', strokeWidth: 0, r: 3 }}
                            activeDot={{ r: 6, stroke: '#E4405F', strokeWidth: 2, fill: '#fff' }}
                            connectNulls={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card className="group hover:shadow-xl hover:shadow-purple-100/20 dark:hover:shadow-purple-900/10 transition-all duration-300 border-0 shadow-lg bg-gradient-to-br from-card via-card to-primary/5">
                  <CardHeader className="pb-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg sm:text-xl font-semibold text-foreground group-hover:text-purple-700 dark:group-hover:text-purple-400 transition-colors">
                        {t('analytics.charts.channel_distribution', 'Channel Distribution')}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <UITooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <HelpCircle className="h-4 w-4 text-muted-foreground/70 hover:text-muted-foreground" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Distribution of conversations across different channels</p>
                          </TooltipContent>
                        </UITooltip>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="w-full overflow-x-auto">
                      <ResponsiveContainer width="100%" height={320} minWidth={300}>
                        <PieChart>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: chartColors.background,
                              border: `1px solid ${chartColors.border}`,
                              borderRadius: '12px',
                              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                              fontSize: '12px',
                              color: chartColors.foreground
                            }}
                          />
                          <Legend
                            content={<CustomLegend />}
                            wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }}
                          />
                          <Pie
                            data={channelDistributionData}
                            cx="50%"
                            cy="45%"
                            labelLine={false}
                            label={renderCustomizedLabel}
                            outerRadius={90}
                            innerRadius={30}
                            fill="#8884d8"
                            dataKey="value"
                            stroke="#fff"
                            strokeWidth={2}
                          >
                            {channelDistributionData.map((_: { name: string, value: number }, index: number) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TooltipProvider>
          )}
        </div>
      </div>
    </div>
  );
}
