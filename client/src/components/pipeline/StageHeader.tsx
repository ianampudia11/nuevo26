import { useMemo } from 'react';
import { MoreHorizontal, Edit2, Trash2, TrendingUp, DollarSign, Clock } from 'lucide-react';
import { PipelineStage, Deal } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from '@/hooks/use-translation';
import { useCurrency } from '@/contexts/currency-context';

interface StageHeaderProps {
  stage: PipelineStage;
  deals: Deal[];
  onEditStage: (stage: PipelineStage) => void;
  onDeleteStage: (stage: PipelineStage) => void;
}

export default function StageHeader({ stage, deals, onEditStage, onDeleteStage }: StageHeaderProps) {
  const { t } = useTranslation();
  const { currency, formatCurrency } = useCurrency();

  const stageStats = useMemo(() => {
    const totalValue = deals.reduce((sum, deal) => sum + (deal.value || 0), 0);
    const avgValue = deals.length > 0 ? totalValue / deals.length : 0;
    

    const now = new Date();
    const avgDaysInStage = deals.length > 0 
      ? deals.reduce((sum, deal) => {
          const lastActivity = deal.lastActivityAt ? new Date(deal.lastActivityAt) : deal.createdAt ? new Date(deal.createdAt) : now;
          const days = Math.max(0, Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)));
          return sum + days;
        }, 0) / deals.length
      : 0;


    const priorities = deals.reduce((acc, deal) => {
      const priority = deal.priority || 'low';
      acc[priority] = (acc[priority] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      count: deals.length,
      totalValue,
      avgValue,
      avgDaysInStage: Math.round(avgDaysInStage),
      highPriority: priorities.high || 0,
      mediumPriority: priorities.medium || 0,
      lowPriority: priorities.low || 0,
    };
  }, [deals]);

  const formatValue = (value: number) => {


    const sampleFormatted = formatCurrency(1);
    const currencySymbol = sampleFormatted.replace(/[\d.,\s]/g, '').trim();
    
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M ${currencySymbol}`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K ${currencySymbol}`;
    }
    return formatCurrency(value);
  };

  return (
    <div 
      className="p-3 mb-3 rounded-lg shadow-sm border-l-4 bg-card"
      style={{
        borderLeftColor: stage.color,
        backgroundColor: `${stage.color}08`,
      }}
    >
      {/* Stage Title and Actions */}
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm text-foreground">{stage.name}</h3>
          <div className="flex items-center gap-1">
            <span 
              className="text-xs font-medium px-2 py-1 rounded-full"
              style={{
                backgroundColor: `${stage.color}20`,
                color: stage.color,
              }}
            >
              {stageStats.count}
            </span>
          </div>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-accent">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEditStage(stage)}>
              <Edit2 className="mr-2 h-4 w-4" />
              {t('common.edit', 'Edit')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDeleteStage(stage)}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t('common.delete', 'Delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Health Indicators */}
      {stageStats.count > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {/* Total Value */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3 text-green-600" />
                  <span className="font-medium text-green-600">
                    {formatValue(stageStats.totalValue)}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <div className="text-xs">
                  <p>Total Value: {formatValue(stageStats.totalValue)}</p>
                  <p>Average Value: {formatValue(stageStats.avgValue)}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Average Days */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-blue-600" />
                  <span className="text-blue-600">{stageStats.avgDaysInStage}d</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Average days since last activity</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Priority Indicators */}
          {stageStats.highPriority > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full bg-red-500" />
                    <span className="text-red-600">{stageStats.highPriority}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>{stageStats.highPriority} high priority deals</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Trend Indicator (simplified based on priority distribution) */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <TrendingUp 
                  className={`h-3 w-3 ${
                    stageStats.highPriority > stageStats.count / 2 
                      ? 'text-red-500' 
                      : stageStats.mediumPriority > stageStats.count / 2 
                        ? 'text-yellow-500' 
                        : 'text-green-500'
                  }`}
                />
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <div className="text-xs">
                  <p>Priority Distribution:</p>
                  <p>High: {stageStats.highPriority} | Med: {stageStats.mediumPriority} | Low: {stageStats.lowPriority}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
}
