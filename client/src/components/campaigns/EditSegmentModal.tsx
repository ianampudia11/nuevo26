import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FilterSection } from '@/components/segments/FilterSection';
import { ContactPreviewTable } from '@/components/segments/ContactPreviewTable';
import { SegmentSummary } from '@/components/segments/SegmentSummary';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  Users,
  Tag,
  X,
  Plus,
  Loader2,
  AlertTriangle,
  Phone,
  Mail,
  Calendar,
  Activity,
  Trash2,
  Undo2,
  Target,
  Settings,
  Download,
  Upload
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { ToastAction } from '@/components/ui/toast';
import type { SegmentFilterCriteria } from '../../../../shared/schema';

interface EditSegmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  segmentId: number;
  onSegmentUpdated: (segment: any) => void;
}

type SegmentCriteria = SegmentFilterCriteria;

interface ContactSegment {
  id: number;
  name: string;
  description: string;
  criteria: SegmentCriteria;
  contactCount: number;
  createdById: number;
}

export function EditSegmentModal({ isOpen, onClose, segmentId, onSegmentUpdated }: EditSegmentModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });
  const [criteria, setCriteria] = useState<SegmentCriteria>({
    tags: [],
    created_after: '',
    created_before: ''
  });
  const [newTag, setNewTag] = useState('');
  const [contactCount, setContactCount] = useState<number | null>(null);
  const [contactPreview, setContactPreview] = useState<any[]>([]);
  const [hasMoreContacts, setHasMoreContacts] = useState(false);
  const [excludedContactIds, setExcludedContactIds] = useState<number[]>([]);
  const [excludedContactDetails, setExcludedContactDetails] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSegment, setIsLoadingSegment] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [originalSegment, setOriginalSegment] = useState<ContactSegment | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [hasContactIds, setHasContactIds] = useState(false);
  const [pipelineStages, setPipelineStages] = useState<Array<{ id: number; name: string; color: string }>>([]);
  const [selectedPipelineStageIds, setSelectedPipelineStageIds] = useState<number[]>([]);
  const [dateRangeExpanded, setDateRangeExpanded] = useState(false);
  const [tagFiltersExpanded, setTagFiltersExpanded] = useState(false);
  const [pipelineFiltersExpanded, setPipelineFiltersExpanded] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);


  useEffect(() => {
    if (isOpen && segmentId) {
      loadSegment();
      fetchPipelineStages();
    }
  }, [isOpen, segmentId]);

  const fetchPipelineStages = async () => {
    try {
      const response = await fetch('/api/pipeline/stages');
      if (response.ok) {
        const stages = await response.json();
        setPipelineStages(stages || []);
      }
    } catch (error) {
      console.error('Failed to fetch pipeline stages:', error);
    }
  };

  const loadSegment = async () => {
    setIsLoadingSegment(true);
    try {
      const response = await fetch(`/api/campaigns/segments/${segmentId}`);
      const data = await response.json();

      if (data.success) {
        const segment = data.data;
        setOriginalSegment(segment);
        setFormData({
          name: segment.name,
          description: segment.description || '',
        });
        const segmentCriteria = {
          tags: [],
          created_after: '',
          created_before: '',
          ...segment.criteria
        };
        setCriteria(segmentCriteria);


        if (segmentCriteria.pipelineStageIds && Array.isArray(segmentCriteria.pipelineStageIds)) {
          setSelectedPipelineStageIds(segmentCriteria.pipelineStageIds);
        } else {
          setSelectedPipelineStageIds([]);
        }

        const hasContactIdsInCriteria = segmentCriteria.contactIds && Array.isArray(segmentCriteria.contactIds) && segmentCriteria.contactIds.length > 0;
        setHasContactIds(hasContactIdsInCriteria || false);

        if (segmentCriteria.excludedContactIds && segmentCriteria.excludedContactIds.length > 0) {
          setExcludedContactIds(segmentCriteria.excludedContactIds);

        }

        setContactCount(segment.contactCount);


        const criteriaWithPipelineStages = {
          ...segmentCriteria,
          pipelineStageIds: segmentCriteria.pipelineStageIds && segmentCriteria.pipelineStageIds.length > 0 ? segmentCriteria.pipelineStageIds : undefined
        };
        debouncedPreview(criteriaWithPipelineStages);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('segments.edit.load_failed', 'Failed to load segment'),
        variant: 'destructive'
      });
      onClose();
    } finally {
      setIsLoadingSegment(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
    });
    setCriteria({
      tags: [],
      created_after: '',
      created_before: ''
    });
    setNewTag('');
    setContactCount(null);
    setContactPreview([]);
    setHasMoreContacts(false);
    setExcludedContactIds([]);
    setExcludedContactDetails([]);
    setOriginalSegment(null);
    setRetryCount(0);
    setHasContactIds(false);
    setSelectedPipelineStageIds([]);
  };

  const retryUpdate = () => {
    setRetryCount(prev => prev + 1);

    const syntheticEvent = {
      preventDefault: () => {}
    } as React.FormEvent;
    handleSubmit(syntheticEvent);
  };


  const debouncedPreview = useCallback((criteria: SegmentCriteria) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(async () => {
      setIsPreviewLoading(true);
      try {
        const response = await fetch('/api/campaigns/segments/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            criteria,
            includeDetails: true,
            limit: 50
          })
        });

        const data = await response.json();
        if (data.success) {
          setContactCount(data.data.count);
          setContactPreview(data.data.contacts || []);
          setHasMoreContacts(data.data.hasMore || false);


          if (excludedContactIds.length > 0 && excludedContactDetails.length === 0) {
            const excludedDetails = data.data.contacts.filter((contact: any) =>
              excludedContactIds.includes(contact.id)
            );
            setExcludedContactDetails(excludedDetails);
          }
        }
      } catch (error) {
        console.error('Failed to preview contacts:', error);
        setContactCount(null);
        setContactPreview([]);
        setHasMoreContacts(false);
      } finally {
        setIsPreviewLoading(false);
      }
    }, 500);
  }, [excludedContactIds.length, excludedContactDetails.length]);


  useEffect(() => {
    if (isOpen) {
      const criteriaWithPipelineStages = {
        ...criteria,
        pipelineStageIds: selectedPipelineStageIds.length > 0 ? selectedPipelineStageIds : undefined
      };
      debouncedPreview(criteriaWithPipelineStages);
    }
  }, [criteria, selectedPipelineStageIds, isOpen, debouncedPreview]);


  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);


  const handleExcludeContact = (contactId: number) => {

    const contactToExclude = contactPreview.find(c => c.id === contactId);

    setExcludedContactIds(prev => [...prev, contactId]);

    if (contactToExclude) {
      setExcludedContactDetails(prev => [...prev, contactToExclude]);
    }

    toast({
      title: t('segments.edit.contact_excluded_title', 'Contact excluded'),
      description: t('segments.edit.contact_excluded_desc', 'Contact has been removed from this segment preview'),
    });
  };


  const handleUndoExclusion = (contactId: number) => {
    setExcludedContactIds(prev => prev.filter(id => id !== contactId));
    setExcludedContactDetails(prev => prev.filter(contact => contact.id !== contactId));
    toast({
      title: t('segments.edit.contact_restored_title', 'Contact restored'),
      description: t('segments.edit.contact_restored_desc', 'Contact has been added back to the segment preview'),
    });
  };


  const isValidPhoneLength = (phone: string): boolean => {
    if (!phone) return false;
    const digitsOnly = phone.replace(/[^0-9]/g, '');
    return digitsOnly.length <= 14;
  };



  const filteredContacts = contactPreview.filter(contact =>
    !excludedContactIds.includes(contact.id) && isValidPhoneLength(contact.phone)
  );


  const invalidPhoneContacts = contactPreview.filter(contact => !isValidPhoneLength(contact.phone));
  const effectiveContactCount = contactCount !== null ?
    Math.max(0, contactCount - excludedContactIds.length - invalidPhoneContacts.length) : null;

  const addTag = () => {
    if (newTag.trim() && !(criteria.tags ?? []).includes(newTag.trim())) {
      setCriteria(prev => ({
        ...prev,
        tags: [...(prev.tags ?? []), newTag.trim()]
      }));
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setCriteria(prev => ({
      ...prev,
      tags: (prev.tags ?? []).filter(tag => tag !== tagToRemove)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: t('segments.edit.validation_error', 'Validation Error'),
        description: t('segments.edit.name_required', 'Segment name is required'),
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/campaigns/segments/${segmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim(),
          criteria: {
            ...criteria,
            excludedContactIds,
            pipelineStageIds: selectedPipelineStageIds.length > 0 ? selectedPipelineStageIds : undefined
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.success && data.data) {

        const updatedSegment = {
          ...data.data,
          contactCount: data.data.contactCount || 0
        };

        toast({
          title: t('common.success', 'Success'),
          description: t('segments.edit.update_success', 'Segment updated successfully')
        });


        await new Promise(resolve => setTimeout(resolve, 100));


        onSegmentUpdated(updatedSegment);


        onClose();
        resetForm();
      } else {
        throw new Error(data.error || 'Invalid response from server');
      }
    } catch (error) {
      console.error('Error updating segment:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';


      if (retryCount < 2) {
        toast({
          title: t('common.error', 'Error'),
          description: t('segments.edit.update_failed', 'Failed to update segment') + ': ' + errorMessage,
          variant: 'destructive',
          action: (
            <ToastAction altText={t('common.retry', 'Retry')} onClick={retryUpdate}>
              {t('common.retry', 'Retry')}
            </ToastAction>
          )
        });
      } else {
        toast({
          title: t('common.error', 'Error'),
          description: t('segments.edit.update_failed_final', 'Failed to update segment after multiple attempts') + ': ' + errorMessage,
          variant: 'destructive'
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/campaigns/segments/${segmentId}`, {
        method: 'DELETE'
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: t('common.success', 'Success'),
          description: t('segments.edit.delete_success', 'Segment deleted successfully')
        });
        onSegmentUpdated(null); // Signal deletion
        onClose();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: (error instanceof Error ? error.message : null) || t('segments.edit.delete_failed', 'Failed to delete segment'),
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  if (isLoadingSegment) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[600px]">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">{t('segments.edit.loading_segment', 'Loading segment...')}</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const hasDateFilters = !!(criteria.created_after || criteria.created_before);
  const hasTagFilters = (criteria.tags?.length ?? 0) > 0;
  const hasPipelineFilters = selectedPipelineStageIds.length > 0;

  const getDateSummary = () => {
    if (criteria.created_after && criteria.created_before) {
      return `${new Date(criteria.created_after).toLocaleDateString()} - ${new Date(criteria.created_before).toLocaleDateString()}`;
    } else if (criteria.created_after) {
      return `After ${new Date(criteria.created_after).toLocaleDateString()}`;
    } else if (criteria.created_before) {
      return `Before ${new Date(criteria.created_before).toLocaleDateString()}`;
    }
    return 'No date filter';
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => {

        if (!open && (isLoading || isLoadingSegment)) {
          return;
        }
        if (!open) {
          onClose();
        }
      }}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {t('segments.edit.title', 'Edit Contact Segment')}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">{t('segments.edit.name_label', 'Segment Name')}</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={t('segments.edit.name_placeholder', 'e.g., VIP Customers, New Leads')}
                  required
                  maxLength={100}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.name.length}/100 characters
                </p>
              </div>

              <div>
                <Label htmlFor="description">{t('segments.edit.description_label', 'Description (Optional)')}</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder={t('segments.edit.description_placeholder', 'Describe this segment...')}
                  rows={2}
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.description.length}/500 characters
                </p>
              </div>
            </div>

            <Separator />

            {/* Filter Criteria */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">{t('segments.edit.filter_criteria_title', 'Filter Criteria')}</h3>

              {/* Date Range Filters */}
              <FilterSection
                title={t('segments.edit.date_range_filters', 'Date Range Filters')}
                icon={<Calendar className="w-4 h-4" />}
                summary={getDateSummary()}
                isActive={hasDateFilters}
                defaultExpanded={false}
                color="blue"
              >
                <div className="space-y-3">
                  <div className="flex gap-2 mb-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const date = new Date();
                        date.setDate(date.getDate() - 30);
                        setCriteria(prev => ({ ...prev, created_after: date.toISOString().split('T')[0] }));
                      }}
                    >
                      Last 30 days
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const date = new Date();
                        date.setDate(date.getDate() - 90);
                        setCriteria(prev => ({ ...prev, created_after: date.toISOString().split('T')[0] }));
                      }}
                    >
                      Last 90 days
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const date = new Date();
                        date.setMonth(0, 1);
                        setCriteria(prev => ({ ...prev, created_after: date.toISOString().split('T')[0] }));
                      }}
                    >
                      This year
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="created_after" className="text-sm">{t('segments.edit.created_after_label', 'Created After')}</Label>
                      <Input
                        id="created_after"
                        type="date"
                        value={criteria.created_after}
                        onChange={(e) => setCriteria(prev => ({ ...prev, created_after: e.target.value }))}
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="created_before" className="text-sm">{t('segments.edit.created_before_label', 'Created Before')}</Label>
                      <Input
                        id="created_before"
                        type="date"
                        value={criteria.created_before}
                        onChange={(e) => setCriteria(prev => ({ ...prev, created_before: e.target.value }))}
                        className="mt-1.5"
                      />
                    </div>
                  </div>
                </div>
              </FilterSection>

              {/* Tag Filters */}
              <FilterSection
                title={t('segments.edit.tag_filters', 'Tag Filters')}
                icon={<Tag className="w-4 h-4" />}
                summary={hasTagFilters ? `${criteria.tags?.length} tags selected` : 'No tags'}
                isActive={hasTagFilters}
                defaultExpanded={false}
                color="purple"
              >
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      placeholder={t('segments.edit.tag_placeholder', 'Add a tag...')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTag();
                        }
                      }}
                      className="flex-1"
                    />
                    <Button type="button" onClick={addTag} size="sm">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>

                  {(criteria.tags?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {(criteria.tags ?? []).map((tag) => (
                        <Badge key={tag} variant="secondary" className="flex items-center gap-1.5 bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-900">
                          <Tag className="w-3 h-3" />
                          {tag}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              removeTag(tag);
                            }}
                            className="ml-1 hover:text-destructive transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    💡 {t('segments.edit.tags_description', 'Contacts must have ALL selected tags')}
                  </p>
                </div>
              </FilterSection>

              {/* Pipeline Stage Filters */}
              <FilterSection
                title={t('segments.edit.pipeline_stage_filters', 'Pipeline Stage Filters')}
                icon={<Target className="w-4 h-4" />}
                summary={hasPipelineFilters ? `${selectedPipelineStageIds.length} stages selected` : 'No pipeline filter'}
                isActive={hasPipelineFilters}
                defaultExpanded={false}
                color="green"
              >
                <div className="space-y-3">
                  <Select
                    value={undefined}
                    onValueChange={(value) => {
                      if (value && !selectedPipelineStageIds.includes(parseInt(value))) {
                        setSelectedPipelineStageIds([...selectedPipelineStageIds, parseInt(value)]);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('segments.edit.pipeline_stage_placeholder', 'Select pipeline stages')} />
                    </SelectTrigger>
                    <SelectContent>
                      {pipelineStages
                        .filter(stage => !selectedPipelineStageIds.includes(stage.id))
                        .map((stage) => (
                          <SelectItem key={stage.id} value={stage.id.toString()}>
                            <div className="flex items-center gap-2">
                              <div style={{ backgroundColor: stage.color }} className="w-3 h-3 rounded-full" />
                              <span>{stage.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {selectedPipelineStageIds.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedPipelineStageIds.map((stageId) => {
                        const stage = pipelineStages.find(s => s.id === stageId);
                        return stage ? (
                          <Badge key={stageId} variant="secondary" className="flex items-center gap-1.5 bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-900">
                            <div style={{ backgroundColor: stage.color }} className="w-3 h-3 rounded-full" />
                            {stage.name}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedPipelineStageIds(selectedPipelineStageIds.filter(id => id !== stageId));
                              }}
                              className="ml-1 hover:text-destructive transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    💡 {t('segments.edit.pipeline_stage_description', 'Contacts with deals in any of the selected stages will be included')}
                  </p>
                </div>
              </FilterSection>

              {/* Warning when contactIds are combined with other criteria */}
              {hasContactIds && ((criteria.tags?.length ?? 0) > 0 || criteria.created_after || criteria.created_before) && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h5 className="text-sm font-medium text-amber-800 mb-1">
                        {t('segments.edit.and_logic_warning_title', 'Filter Combination Notice')}
                      </h5>
                      <p className="text-sm text-amber-700">
                        {t('segments.edit.and_logic_warning_message', 'This segment includes specific contacts (contactIds) that are combined with tags and date filters using AND logic. Only contacts that match ALL specified conditions will be included in the segment.')}
                      </p>
                    </div>
                  </div>
                </div>
              )}

            </div>

            <Separator />

            {/* Contact Preview */}
            <div className="space-y-4">
              <h4 className="font-semibold flex items-center gap-2">
                <Users className="w-5 h-5" />
                {t('segments.edit.contact_preview_title', 'Contact Preview')}
              </h4>

              {effectiveContactCount !== null && effectiveContactCount > 0 && (
                <SegmentSummary
                  totalContacts={effectiveContactCount}
                  excludedCount={excludedContactIds.length}
                  invalidCount={invalidPhoneContacts.length}
                />
              )}

              {effectiveContactCount !== null && (
                <div className="text-sm text-muted-foreground">
                  {hasMoreContacts ? (
                    <p>📊 {t('segments.edit.showing_first_50', 'Showing first 50 of')} <strong>{effectiveContactCount}</strong> {t('segments.edit.unique_contacts', 'unique contacts')}</p>
                  ) : (
                    <p>📊 <strong>{effectiveContactCount}</strong> {t('segments.edit.unique_contacts_match_criteria', 'unique contacts match these criteria')}</p>
                  )}
                  <p className="text-xs mt-1">
                    💡 {t('segments.edit.deduplication_note', 'Note: Duplicates by phone number are automatically removed. Counts reflect unique phone numbers.')}
                  </p>
                </div>
              )}

              {isPreviewLoading ? (
                <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
                  <p className="text-sm text-muted-foreground">{t('segments.edit.loading_preview', 'Loading contact preview...')}</p>
                </div>
              ) : filteredContacts.length > 0 ? (
                <div className="max-h-96 overflow-y-auto">
                  <ContactPreviewTable
                    contacts={filteredContacts}
                    onExclude={handleExcludeContact}
                  />
                </div>
              ) : contactPreview.length > 0 && filteredContacts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>{t('segments.edit.all_contacts_excluded', 'All contacts have been excluded from this segment')}</p>
                  <p className="text-sm">
                    {excludedContactIds.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setExcludedContactIds([]);
                          setExcludedContactDetails([]);
                        }}
                        className="mt-2"
                      >
                        <Undo2 className="w-4 h-4 mr-2" />
                        {t('segments.edit.restore_all_contacts', 'Restore all contacts')}
                      </Button>
                    )}
                  </p>
                </div>
              ) : effectiveContactCount === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>{t('segments.edit.no_contacts_match', 'No contacts match the current criteria')}</p>
                  <p className="text-sm">{t('segments.edit.try_adjusting_filters', 'Try adjusting your filters')}</p>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>{t('segments.edit.add_filter_criteria', 'Add filter criteria to preview contacts')}</p>
                  <p className="text-sm">{t('segments.edit.select_tags_or_dates', 'Select tags or date ranges to see matching contacts')}</p>
                </div>
              )}

              {/* Excluded Contacts Section */}
              {excludedContactIds.length > 0 && (
                <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-900 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm font-medium text-orange-800 dark:text-orange-400">
                      {t('segments.edit.excluded_contacts_title', 'Excluded Contacts')} ({excludedContactIds.length})
                    </h5>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setExcludedContactIds([]);
                        setExcludedContactDetails([]);
                      }}
                      className="text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-900 hover:bg-orange-100 dark:hover:bg-orange-900/30"
                    >
                      <Undo2 className="w-4 h-4 mr-1" />
                      {t('segments.edit.restore_all', 'Restore All')}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {excludedContactDetails.map((excludedContact) => (
                      <div
                        key={excludedContact.id}
                        className="flex items-center gap-2 bg-card px-2 py-1 rounded border border-orange-200"
                      >
                        <span className="text-sm text-orange-800 dark:text-orange-400">
                          {excludedContact.name || excludedContact.phone || `Contact ${excludedContact.id}`}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleUndoExclusion(excludedContact.id);
                          }}
                          className="h-5 w-5 p-0 text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300"
                          title={t('segments.edit.restore_contact_tooltip', 'Restore contact')}
                        >
                          <Undo2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="flex justify-between">
              <Button
                type="button"
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isLoading}
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                {t('segments.edit.delete_button', 'Delete Segment')}
              </Button>

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t('segments.edit.updating', 'Updating...')}
                    </>
                  ) : (
                    t('segments.edit.update_button', 'Update Segment')
                  )}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('segments.edit.delete_confirm_title', 'Delete Segment')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('segments.edit.delete_confirm_message', 'Are you sure you want to delete this segment? This action cannot be undone.')}
              {originalSegment && (
                <div className="mt-2 p-2 bg-muted rounded text-sm">
                  <strong>{originalSegment.name}</strong> ({originalSegment.contactCount} {t('segments.edit.contacts', 'contacts')})
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('segments.edit.delete_confirm_button', 'Delete Segment')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
