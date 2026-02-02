import React from 'react';
import { Button } from '@/components/ui/button';
import { usePipeline } from '@/contexts/PipelineContext';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { User, Flag, Calendar, UserX } from 'lucide-react';
import { cn } from '@/lib/utils';

export function QuickFilters() {
  const { t } = useTranslation();
  const { filters, setFilters } = usePipeline();
  const { user } = useAuth();

  const quickFilters = [
    {
      id: 'myDeals',
      label: t('pipeline.my_deals', 'My Deals'),
      icon: User,
    getActive: (filters: any, userId: number | null) => {
      return filters.assignedUserIds?.includes(userId || 0);
    },
    toggle: (filters: any, userId: number | null, setFilters: any) => {
      const currentIds = filters.assignedUserIds || [];
      const isActive = currentIds.includes(userId || 0);
      if (isActive) {
        setFilters({
          ...filters,
          assignedUserIds: currentIds.filter((id: number) => id !== userId),
        });
      } else {
        setFilters({
          ...filters,
          assignedUserIds: [...currentIds, userId || 0],
        });
      }
    },
  },
    {
      id: 'highPriority',
      label: t('pipeline.high_priority', 'High Priority'),
      icon: Flag,
    getActive: (filters: any) => {
      return filters.priorities?.includes('high');
    },
    toggle: (filters: any, _userId: number | null, setFilters: any) => {
      const currentPriorities = filters.priorities || [];
      const isActive = currentPriorities.includes('high');
      if (isActive) {
        setFilters({
          ...filters,
          priorities: currentPriorities.filter((p: string) => p !== 'high'),
        });
      } else {
        setFilters({
          ...filters,
          priorities: [...currentPriorities, 'high'],
        });
      }
    },
  },
    {
      id: 'overdue',
      label: t('pipeline.overdue', 'Overdue'),
      icon: Calendar,
    getActive: (filters: any) => {
      if (!filters.dueDateTo) return false;
      const dueDateTo = new Date(filters.dueDateTo);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return dueDateTo <= today;
    },
    toggle: (filters: any, _userId: number | null, setFilters: any) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isActive = filters.dueDateTo && new Date(filters.dueDateTo) <= today;
      if (isActive) {
        setFilters({
          ...filters,
          dueDateTo: undefined,
        });
      } else {
        const endOfToday = new Date(today);
        endOfToday.setHours(23, 59, 59, 999);
        setFilters({
          ...filters,
          dueDateTo: endOfToday.toISOString(),
        });
      }
    },
  },
    {
      id: 'unassigned',
      label: t('pipeline.unassigned', 'Unassigned'),
      icon: UserX,
    getActive: (filters: any) => {
      return filters.includeUnassigned === true;
    },
    toggle: (filters: any, _userId: number | null, setFilters: any) => {
      setFilters({
        ...filters,
        includeUnassigned: !filters.includeUnassigned,
      });
    },
  }];

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {quickFilters.map((filter) => {
        const Icon = filter.icon;
        const isActive = filter.getActive(filters, user?.id || null);
        return (
          <Button
            key={filter.id}
            variant={isActive ? 'default' : 'outline'}
            size="sm"
            onClick={() => filter.toggle(filters, user?.id || null, setFilters)}
            className={cn(
              'h-8 text-xs',
              isActive && 'bg-primary text-primary-foreground'
            )}
          >
            <Icon className="h-3 w-3 mr-1.5" />
            {filter.label}
          </Button>
        );
      })}
    </div>
  );
}
