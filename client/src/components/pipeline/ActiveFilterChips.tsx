import React from 'react';
import { Badge } from '@/components/ui/badge';
import { X, Target, Layers, Flag, DollarSign, Calendar, User, Tag, FileText } from 'lucide-react';
import { PipelineFilters } from '@shared/types/pipeline-filters';
import { usePipeline } from '@/contexts/PipelineContext';
import { useTranslation } from '@/hooks/use-translation';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface FilterChip {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  onRemove: () => void;
}

export function ActiveFilterChips() {
  const { t } = useTranslation();
  const { filters, setFilters, pipelines, activePipelineId } = usePipeline();


  const { data: pipelineStages = [] } = useQuery({
    queryKey: ['/api/pipeline/stages', activePipelineId],
    queryFn: async () => {
      if (!activePipelineId) {
        return [];
      }
      const res = await apiRequest('GET', `/api/pipeline/stages?pipelineId=${activePipelineId}`);
      return res.json();
    },
    enabled: !!activePipelineId,
  });


  const { data: customFieldsSchema = [] } = useQuery({
    queryKey: ['/api/company/custom-fields', 'deal'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company/custom-fields?entity=deal');
      return res.json();
    },
  });

  if (!pipelines || pipelines.length === 0) {
    return null;
  }

  const chips: FilterChip[] = [];


  if (filters.pipelineIds && filters.pipelineIds.length > 0 && pipelines && pipelines.length > 0) {
    const pipelineNames = filters.pipelineIds
      .map((id) => pipelines.find((p) => p.id === id)?.name)
      .filter(Boolean);
    if (pipelineNames.length > 0) {
      chips.push({
        id: 'pipelines',
        label: t('pipeline.pipeline_label', 'Pipeline: {{names}}', { names: pipelineNames.join(', ') }),
        icon: Target,
        color: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-900',
        onRemove: () => setFilters({ ...filters, pipelineIds: undefined }),
      });
    }
  }


  if (filters.stageIds && filters.stageIds.length > 0) {
    const stageNames = filters.stageIds
      .map((id) => pipelineStages.find((s: any) => s.id === id)?.name)
      .filter(Boolean);
    const label = stageNames.length <= 2
      ? t('pipeline.stage_label', 'Stage: {{names}}', { names: stageNames.join(', ') })
      : t('pipeline.stage_label_more', 'Stage: {{names}} +{{count}} more', { names: stageNames.slice(0, 2).join(', '), count: stageNames.length - 2 });
    chips.push({
      id: 'stages',
      label: stageNames.length > 0 ? label : t('pipeline.stage_selected', 'Stage: {{count}} selected', { count: filters.stageIds.length }),
      icon: Layers,
      color: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-900',
      onRemove: () => setFilters({ ...filters, stageIds: undefined }),
    });
  }


  if (filters.priorities && filters.priorities.length > 0) {
    chips.push({
      id: 'priorities',
      label: t('pipeline.priority_label', 'Priority: {{priorities}}', { priorities: filters.priorities.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(', ') }),
      icon: Flag,
      color: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-900',
      onRemove: () => setFilters({ ...filters, priorities: undefined }),
    });
  }


  if (filters.minValue !== undefined || filters.maxValue !== undefined) {
    const min = filters.minValue !== undefined ? `$${filters.minValue}` : '';
    const max = filters.maxValue !== undefined ? `$${filters.maxValue}` : '';
    const range = [min, max].filter(Boolean).join(' - ') || (min || max);
    chips.push({
      id: 'value',
      label: t('pipeline.value_label', 'Value: {{range}}', { range }),
      icon: DollarSign,
      color: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-900',
      onRemove: () => setFilters({ ...filters, minValue: undefined, maxValue: undefined }),
    });
  }


  if (filters.status) {
    chips.push({
      id: 'status',
      label: t('pipeline.status_label', 'Status: {{status}}', { status: filters.status.charAt(0).toUpperCase() + filters.status.slice(1) }),
      icon: Flag,
      color: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-900',
      onRemove: () => setFilters({ ...filters, status: undefined }),
    });
  }


  if (filters.dueDateFrom || filters.dueDateTo) {
    const from = filters.dueDateFrom ? new Date(filters.dueDateFrom).toLocaleDateString() : '';
    const to = filters.dueDateTo ? new Date(filters.dueDateTo).toLocaleDateString() : '';
    const range = [from, to].filter(Boolean).join(' - ') || (from || to);
    chips.push({
      id: 'dueDate',
      label: t('pipeline.due_label', 'Due: {{range}}', { range }),
      icon: Calendar,
      color: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-900',
      onRemove: () => setFilters({ ...filters, dueDateFrom: undefined, dueDateTo: undefined }),
    });
  }


  if (filters.createdFrom || filters.createdTo) {
    const from = filters.createdFrom ? new Date(filters.createdFrom).toLocaleDateString() : '';
    const to = filters.createdTo ? new Date(filters.createdTo).toLocaleDateString() : '';
    const range = [from, to].filter(Boolean).join(' - ') || (from || to);
    chips.push({
      id: 'createdDate',
      label: t('pipeline.created_label', 'Created: {{range}}', { range }),
      icon: Calendar,
      color: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-900',
      onRemove: () => setFilters({ ...filters, createdFrom: undefined, createdTo: undefined }),
    });
  }


  if (filters.assignedUserIds && filters.assignedUserIds.length > 0) {
    chips.push({
      id: 'assignedUsers',
      label: t('pipeline.assigned_label', 'Assigned: {{count}} user(s)', { count: filters.assignedUserIds.length }),
      icon: User,
      color: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-400 dark:border-orange-900',
      onRemove: () => setFilters({ ...filters, assignedUserIds: undefined }),
    });
  }


  if (filters.includeUnassigned) {
    chips.push({
      id: 'unassigned',
      label: t('pipeline.unassigned', 'Unassigned'),
      icon: User,
      color: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-400 dark:border-orange-900',
      onRemove: () => setFilters({ ...filters, includeUnassigned: false }),
    });
  }


  if (filters.tags && filters.tags.length > 0) {
    chips.push({
      id: 'tags',
      label: t('pipeline.tags_label', 'Tags: {{tags}}', { tags: filters.tags.join(', ') }),
      icon: Tag,
      color: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-400 dark:border-orange-900',
      onRemove: () => setFilters({ ...filters, tags: undefined }),
    });
  }


  if (filters.customFields && Object.keys(filters.customFields).length > 0) {
    Object.entries(filters.customFields).forEach(([fieldName, filterConfig]) => {
      const fieldSchema = customFieldsSchema.find((f: any) => f.fieldName === fieldName);
      const fieldLabel = fieldSchema?.fieldLabel || fieldName;
      const { operator, value } = filterConfig;

      let displayValue = '';
      if (operator === 'equals') {
        displayValue = String(value);
      } else if (operator === 'contains') {
        displayValue = t('pipeline.contains', 'Contains') + ` "${value}"`;
      } else if (operator === 'gt') {
        displayValue = `> ${value}`;
      } else if (operator === 'lt') {
        displayValue = `< ${value}`;
      } else if (operator === 'inArray' && Array.isArray(value)) {
        displayValue = value.length <= 2 ? value.join(', ') : `${value.slice(0, 2).join(', ')} +${value.length - 2} ${t('pipeline.more_errors', 'more', { count: value.length - 2 }).replace('+{{count}} ', '')}`;
      }

      chips.push({
        id: `custom-${fieldName}`,
        label: `${fieldLabel}: ${displayValue}`,
        icon: FileText,
        color: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-400 dark:border-orange-900',
        onRemove: () => {
          const { [fieldName]: _, ...rest } = filters.customFields || {};
          setFilters({
            ...filters,
            customFields: Object.keys(rest).length > 0 ? rest : undefined,
          });
        },
      });
    });
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {chips.map((chip) => {
        const Icon = chip.icon;
        return (
          <Badge
            key={chip.id}
            variant="outline"
            className={cn(
              'flex items-center gap-1.5 pr-1 transition-all hover:shadow-sm',
              chip.color
            )}
          >
            <Icon className="w-3 h-3" />
            <span className="text-xs font-medium">{chip.label}</span>
            <button
              type="button"
              onClick={chip.onRemove}
              className="ml-1 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        );
      })}
    </div>
  );
}
