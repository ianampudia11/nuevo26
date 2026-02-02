import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FilterSection } from '@/components/segments/FilterSection';
import { MultiSelectFilter } from '@/components/pipeline/filters/MultiSelectFilter';
import { DateRangeFilter } from '@/components/pipeline/filters/DateRangeFilter';
import { ValueRangeFilter } from '@/components/pipeline/filters/ValueRangeFilter';
import { useTranslation } from '@/hooks/use-translation';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { PipelineFilters } from '@shared/types/pipeline-filters';
import { usePipeline } from '@/contexts/PipelineContext';
import {
  Target,
  Layers,
  Flag,
  DollarSign,
  Calendar,
  User,
  Tag,
  Filter,
  FileText,
} from 'lucide-react';

interface FilterBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FilterBuilderModal({ isOpen, onClose }: FilterBuilderModalProps) {
  const { t } = useTranslation();
  const { filters, setFilters, pipelines, activePipelineId } = usePipeline();
  const [localFilters, setLocalFilters] = useState<PipelineFilters>(filters);
  const prevIsOpenRef = useRef(isOpen);


  useEffect(() => {
    const wasClosed = !prevIsOpenRef.current;
    const isNowOpen = isOpen;
    
    if (wasClosed && isNowOpen) {

      setLocalFilters(filters);
    }
    
    prevIsOpenRef.current = isOpen;
  }, [isOpen, filters]);



  const pipelineIdsForStages = useMemo(() => {
    if (localFilters.pipelineIds && localFilters.pipelineIds.length > 0) {
      return localFilters.pipelineIds;
    }
    return activePipelineId ? [activePipelineId] : [];
  }, [localFilters.pipelineIds, activePipelineId]);


  const { data: pipelineStages = [] } = useQuery({
    queryKey: ['/api/pipeline/stages', pipelineIdsForStages],
    queryFn: async () => {
      if (pipelineIdsForStages.length === 0) {

        const res = await apiRequest('GET', '/api/pipeline/stages');
        return res.json();
      }
      

      const stagePromises = pipelineIdsForStages.map(async (pipelineId) => {
        const res = await apiRequest('GET', `/api/pipeline/stages?pipelineId=${pipelineId}`);
        return res.json();
      });
      
      const stageArrays = await Promise.all(stagePromises);
      return stageArrays.flat();
    },
    enabled: pipelineIdsForStages.length > 0 || activePipelineId !== null,
  });


  const { data: users = [] } = useQuery({
    queryKey: ['/api/team-members'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/team-members');
      return res.json();
    },
  });


  const { data: tags = [] } = useQuery({
    queryKey: ['/api/deals/tags'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/deals/tags');
      return res.json();
    },
  });


  const { data: customFieldsSchema = [] } = useQuery({
    queryKey: ['/api/company/custom-fields', 'deal'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company/custom-fields?entity=deal');
      return res.json();
    },
  });


  const availableStages = useMemo(() => {
    if (!localFilters.pipelineIds || localFilters.pipelineIds.length === 0) {
      return pipelineStages.filter((stage: any) => stage.pipelineId === activePipelineId);
    }
    return pipelineStages.filter((stage: any) =>
      localFilters.pipelineIds?.includes(stage.pipelineId)
    );
  }, [pipelineStages, localFilters.pipelineIds, activePipelineId]);

  const handleApply = () => {
    setFilters(localFilters);
    onClose();
  };

  const handleClearAll = () => {
    setLocalFilters({});
  };

  const priorityOptions = [
    { value: 'low' as const, label: t('pipeline.low', 'Low') },
    { value: 'medium' as const, label: t('pipeline.medium', 'Medium') },
    { value: 'high' as const, label: t('pipeline.high', 'High') },
  ];

  const statusOptions = [
    { value: 'active', label: t('pipeline.active', 'Active') },
    { value: 'won', label: t('pipeline.won', 'Won') },
    { value: 'lost', label: t('pipeline.lost', 'Lost') },
  ];

  const pipelineOptions = pipelines.map((p) => ({
    value: p.id,
    label: p.name,
  }));

  const stageOptions = availableStages.map((stage: any) => ({
    value: stage.id,
    label: stage.name,
  }));

  const userOptions = users.map((user: any) => ({
    value: user.id,
    label: user.fullName || user.username || user.email,
  }));

  const tagOptions = tags.map((tag: string) => ({
    value: tag,
    label: tag,
  }));

  const hasActiveFilters = useMemo(() => {
    return Object.keys(localFilters).some((key) => {
      const value = localFilters[key as keyof PipelineFilters];
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      if (key === 'customFields' && value) {
        return Object.keys(value as Record<string, any>).length > 0;
      }
      return value !== undefined && value !== null && value !== '';
    });
  }, [localFilters]);


  const handleCustomFieldChange = (fieldName: string, operator: 'equals' | 'contains' | 'gt' | 'lt' | 'inArray', value: string | number | string[]) => {
    const currentCustomFields = localFilters.customFields || {};
    if (value === '' || value === null || (Array.isArray(value) && value.length === 0)) {

      const { [fieldName]: _, ...rest } = currentCustomFields;
      setLocalFilters({
        ...localFilters,
        customFields: Object.keys(rest).length > 0 ? rest : undefined,
      });
    } else {
      setLocalFilters({
        ...localFilters,
        customFields: {
          ...currentCustomFields,
          [fieldName]: { operator, value },
        },
      });
    }
  };

  const removeCustomFieldFilter = (fieldName: string) => {
    const currentCustomFields = localFilters.customFields || {};
    const { [fieldName]: _, ...rest } = currentCustomFields;
    setLocalFilters({
      ...localFilters,
      customFields: Object.keys(rest).length > 0 ? rest : undefined,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            {t('pipeline.filter_deals', 'Filter Deals')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Section 1: Pipeline & Stage */}
          <FilterSection
            title={t('pipeline.pipeline_stage', 'Pipeline & Stage')}
            icon={<Target className="h-4 w-4" />}
            color="blue"
            isActive={
              (localFilters.pipelineIds && localFilters.pipelineIds.length > 0) ||
              (localFilters.stageIds && localFilters.stageIds.length > 0)
            }
            summary={
              localFilters.pipelineIds?.length || localFilters.stageIds?.length
                ? `${localFilters.pipelineIds?.length || 0} pipeline(s), ${localFilters.stageIds?.length || 0} stage(s)`
                : undefined
            }
          >
            <div className="space-y-3">
              <MultiSelectFilter
                label={t('pipeline.pipelines', 'Pipelines')}
                icon={Target}
                options={pipelineOptions}
                selected={localFilters.pipelineIds || []}
                onChange={(selected) =>
                  setLocalFilters({ ...localFilters, pipelineIds: selected })
                }
                placeholder={t('pipeline.all_pipelines', 'All pipelines')}
              />
              <MultiSelectFilter
                label={t('pipeline.stages', 'Stages')}
                icon={Layers}
                options={stageOptions}
                selected={localFilters.stageIds || []}
                onChange={(selected) =>
                  setLocalFilters({ ...localFilters, stageIds: selected })
                }
                placeholder={t('pipeline.all_stages', 'All stages')}
              />
            </div>
          </FilterSection>

          {/* Section 2: Deal Properties */}
          <FilterSection
            title={t('pipeline.deal_properties', 'Deal Properties')}
            icon={<Flag className="h-4 w-4" />}
            color="purple"
            isActive={
              (localFilters.priorities && localFilters.priorities.length > 0) ||
              localFilters.minValue !== undefined ||
              localFilters.maxValue !== undefined ||
              !!localFilters.status
            }
            summary={
              [
                localFilters.priorities?.length && t('pipeline.priority_label', 'Priority: {{priorities}}', { priorities: localFilters.priorities.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(', ') }),
                (localFilters.minValue !== undefined || localFilters.maxValue !== undefined) && t('pipeline.value_range_summary', 'Value range'),
                localFilters.status && t('pipeline.status_label', 'Status: {{status}}', { status: localFilters.status.charAt(0).toUpperCase() + localFilters.status.slice(1) }),
              ]
                .filter(Boolean)
                .join(', ') || undefined
            }
          >
            <div className="space-y-3">
              <MultiSelectFilter
                label={t('pipeline.priority', 'Priority')}
                icon={Flag}
                options={priorityOptions}
                selected={localFilters.priorities || []}
                onChange={(selected) =>
                  setLocalFilters({ ...localFilters, priorities: selected })
                }
                placeholder={t('pipeline.all_priorities', 'All priorities')}
              />
              <ValueRangeFilter
                label={t('pipeline.deal_value', 'Deal Value')}
                icon={DollarSign}
                minValue={localFilters.minValue}
                maxValue={localFilters.maxValue}
                onChange={(min, max) =>
                  setLocalFilters({ ...localFilters, minValue: min, maxValue: max })
                }
              />
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t('pipeline.status', 'Status')}</Label>
                <Select
                  value={localFilters.status || 'all'}
                  onValueChange={(value) =>
                    setLocalFilters({ ...localFilters, status: value === 'all' ? undefined : value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('pipeline.all_statuses', 'All statuses')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('pipeline.all_statuses', 'All statuses')}</SelectItem>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </FilterSection>

          {/* Section 3: Dates */}
          <FilterSection
            title={t('pipeline.dates', 'Dates')}
            icon={<Calendar className="h-4 w-4" />}
            color="green"
            isActive={
              !!localFilters.dueDateFrom ||
              !!localFilters.dueDateTo ||
              !!localFilters.createdFrom ||
              !!localFilters.createdTo
            }
            summary={
              [
                (localFilters.dueDateFrom || localFilters.dueDateTo) && 'Due date',
                (localFilters.createdFrom || localFilters.createdTo) && 'Created date',
              ]
                .filter(Boolean)
                .join(', ') || undefined
            }
          >
            <div className="space-y-3">
              <DateRangeFilter
                label={t('pipeline.due_date_filter', 'Due Date')}
                icon={Calendar}
                dateRange={
                  localFilters.dueDateFrom || localFilters.dueDateTo
                    ? {
                        from: localFilters.dueDateFrom ? new Date(localFilters.dueDateFrom) : undefined,
                        to: localFilters.dueDateTo ? new Date(localFilters.dueDateTo) : undefined,
                      }
                    : undefined
                }
                onChange={(range) =>
                  setLocalFilters({
                    ...localFilters,
                    dueDateFrom: range?.from?.toISOString(),
                    dueDateTo: range?.to?.toISOString(),
                  })
                }
              />
              <DateRangeFilter
                label={t('pipeline.created_date', 'Created Date')}
                icon={Calendar}
                dateRange={
                  localFilters.createdFrom || localFilters.createdTo
                    ? {
                        from: localFilters.createdFrom ? new Date(localFilters.createdFrom) : undefined,
                        to: localFilters.createdTo ? new Date(localFilters.createdTo) : undefined,
                      }
                    : undefined
                }
                onChange={(range) =>
                  setLocalFilters({
                    ...localFilters,
                    createdFrom: range?.from?.toISOString(),
                    createdTo: range?.to?.toISOString(),
                  })
                }
              />
            </div>
          </FilterSection>

          {/* Section 4: Assignment & Tags */}
          <FilterSection
            title={t('pipeline.assignment_tags', 'Assignment & Tags')}
            icon={<User className="h-4 w-4" />}
            color="orange"
            isActive={
              (localFilters.assignedUserIds && localFilters.assignedUserIds.length > 0) ||
              localFilters.includeUnassigned ||
              (localFilters.tags && localFilters.tags.length > 0)
            }
            summary={
              [
                localFilters.assignedUserIds?.length && `${localFilters.assignedUserIds.length} user(s)`,
                localFilters.includeUnassigned && 'Unassigned',
                localFilters.tags?.length && `${localFilters.tags.length} tag(s)`,
              ]
                .filter(Boolean)
                .join(', ') || undefined
            }
          >
            <div className="space-y-3">
              <MultiSelectFilter
                label={t('pipeline.assigned_users', 'Assigned Users')}
                icon={User}
                options={userOptions}
                selected={localFilters.assignedUserIds || []}
                onChange={(selected) =>
                  setLocalFilters({ ...localFilters, assignedUserIds: selected })
                }
                placeholder={t('pipeline.all_users', 'All users')}
              />
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-unassigned"
                  checked={localFilters.includeUnassigned || false}
                  onCheckedChange={(checked) =>
                    setLocalFilters({ ...localFilters, includeUnassigned: checked as boolean })
                  }
                />
                <Label htmlFor="include-unassigned" className="text-sm cursor-pointer">
                  {t('pipeline.include_unassigned_deals', 'Include unassigned deals')}
                </Label>
              </div>
              <MultiSelectFilter
                label={t('pipeline.tags', 'Tags')}
                icon={Tag}
                options={tagOptions}
                selected={localFilters.tags || []}
                onChange={(selected) =>
                  setLocalFilters({ ...localFilters, tags: selected })
                }
                placeholder={t('pipeline.all_tags', 'All tags')}
              />
            </div>
          </FilterSection>

          {/* Section 5: Custom Fields */}
          {customFieldsSchema.length > 0 && (
            <FilterSection
              title={t('pipeline.custom_fields', 'Custom Fields')}
              icon={<FileText className="h-4 w-4" />}
              color="orange"
              isActive={
                localFilters.customFields && Object.keys(localFilters.customFields).length > 0
              }
              summary={
                localFilters.customFields && Object.keys(localFilters.customFields).length > 0
                  ? `${Object.keys(localFilters.customFields).length} field(s)`
                  : undefined
              }
            >
              <div className="space-y-4">
                {customFieldsSchema.map((field: any) => {
                  const fieldFilter = localFilters.customFields?.[field.fieldName];
                  const hasFilter = !!fieldFilter;

                  return (
                    <div key={field.id} className="space-y-2 p-3 border rounded-lg bg-background">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">{field.fieldLabel}</Label>
                        {hasFilter && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeCustomFieldFilter(field.fieldName)}
                            className="h-6 text-xs"
                          >
                            {t('common.clear', 'Clear')}
                          </Button>
                        )}
                      </div>

                      {field.fieldType === 'text' && (
                        <div className="space-y-2">
                          <Select
                            value={fieldFilter?.operator || ''}
                            onValueChange={(op) => {
                              if (op && fieldFilter?.value) {
                                handleCustomFieldChange(field.fieldName, op as any, fieldFilter.value);
                              }
                            }}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder={t('pipeline.operator', 'Operator')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="equals">{t('pipeline.equals', 'Equals')}</SelectItem>
                              <SelectItem value="contains">{t('pipeline.contains', 'Contains')}</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder={t('pipeline.enter_value', 'Enter value...')}
                            value={fieldFilter?.value as string || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              const op = fieldFilter?.operator || 'equals';
                              handleCustomFieldChange(field.fieldName, op as any, e.target.value);
                            }}
                          />
                        </div>
                      )}

                      {field.fieldType === 'number' && (
                        <div className="space-y-2">
                          <Select
                            value={fieldFilter?.operator || ''}
                            onValueChange={(op) => {
                              if (op && fieldFilter?.value) {
                                handleCustomFieldChange(field.fieldName, op as any, fieldFilter.value);
                              }
                            }}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder={t('pipeline.operator', 'Operator')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="equals">{t('pipeline.equals', 'Equals')}</SelectItem>
                              <SelectItem value="gt">{t('pipeline.greater_than', 'Greater than')}</SelectItem>
                              <SelectItem value="lt">{t('pipeline.less_than', 'Less than')}</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            placeholder={t('pipeline.enter_value', 'Enter value...')}
                            value={fieldFilter?.value as number || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              const op = fieldFilter?.operator || 'equals';
                              const numValue = e.target.value === '' ? '' : parseFloat(e.target.value);
                              if (numValue !== '' && !isNaN(numValue)) {
                                handleCustomFieldChange(field.fieldName, op as any, numValue);
                              } else if (e.target.value === '') {
                                handleCustomFieldChange(field.fieldName, op as any, '');
                              }
                            }}
                          />
                        </div>
                      )}

                      {(field.fieldType === 'select' || field.fieldType === 'multi_select') && (
                        <div className="space-y-2">
                          {field.options && Array.isArray(field.options) ? (
                            <MultiSelectFilter
                              label=""
                              options={field.options.map((opt: any) => ({
                                value: typeof opt === 'string' ? opt : opt.value || opt.label,
                                label: typeof opt === 'string' ? opt : opt.label || opt.value,
                              }))}
                              selected={
                                fieldFilter?.value
                                  ? (Array.isArray(fieldFilter.value)
                                      ? fieldFilter.value
                                      : [fieldFilter.value])
                                  : []
                              }
                              onChange={(selected) => {
                                handleCustomFieldChange(
                                  field.fieldName,
                                  'inArray',
                                  selected.map(v => String(v))
                                );
                              }}
                              placeholder={`Select ${field.fieldLabel.toLowerCase()}...`}
                            />
                          ) : (
                            <Input
                              placeholder="Enter value..."
                              value={fieldFilter?.value as string || ''}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                handleCustomFieldChange(field.fieldName, 'equals', e.target.value);
                              }}
                            />
                          )}
                        </div>
                      )}

                      {!hasFilter && (
                        <p className="text-xs text-muted-foreground">
                          {t('pipeline.no_filter_applied', 'No filter applied')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </FilterSection>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClearAll} disabled={!hasActiveFilters}>
            {t('pipeline.clear_all_filters', 'Clear All Filters')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleApply}>{t('pipeline.apply_filters', 'Apply Filters')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
