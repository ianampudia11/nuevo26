import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Plus, X } from 'lucide-react';
import { Deal } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { usePipeline } from '@/hooks/use-pipeline';
import { useTranslation } from '@/hooks/use-translation';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

const createEditDealSchema = (t: (key: string, fallback?: string) => string) => z.object({
  title: z.string().min(2, t('pipeline.validation.title_min', 'Title must be at least 2 characters')),
  stageId: z.string().min(1, t('pipeline.validation.stage_required', 'Please select a pipeline stage')),
  value: z.number().min(0).optional().nullable(),
  contactId: z.number().min(1, t('pipeline.validation.contact_required', 'Please select a contact')),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  dueDate: z.date().optional().nullable(),
  assignedToUserId: z.number().optional().nullable(),
  description: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
});

type EditDealFormValues = z.infer<ReturnType<typeof createEditDealSchema>>;

interface EditDealModalProps {
  deal: Deal | null;
  isOpen: boolean;
  onClose: () => void;
  activePipelineId?: number | null;
}

export default function EditDealModal({ deal, isOpen, onClose, activePipelineId }: EditDealModalProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { pipelines } = usePipeline();
  const dealPipelineId = deal?.pipelineId || activePipelineId;
  const currentPipeline = pipelines.find(p => p.id === dealPipelineId);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState<string>('');

  const { data: contactsData } = useQuery({
    queryKey: ['/api/contacts'],
    queryFn: () => apiRequest('GET', '/api/contacts')
      .then(res => res.json()),
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['/api/team-members'],
    queryFn: () => apiRequest('GET', '/api/team-members')
      .then(res => res.json()),
  });

  const { data: pipelineStages = [] } = useQuery({
    queryKey: ['/api/pipeline/stages', dealPipelineId],
    queryFn: () => {
      const queryParams = new URLSearchParams();
      if (dealPipelineId) {
        queryParams.append('pipelineId', dealPipelineId.toString());
      }
      const url = `/api/pipeline/stages${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      return apiRequest('GET', url)
        .then(res => res.json());
    },
    enabled: !!dealPipelineId,
  });

  const editDealSchema = createEditDealSchema(t);
  const form = useForm<EditDealFormValues>({
    resolver: zodResolver(editDealSchema),
    defaultValues: {
      title: '',
      stageId: '',
      value: null,
      contactId: undefined,
      priority: 'medium',
      dueDate: null,
      assignedToUserId: null,
      description: '',
      tags: [],
    },
  });

  useEffect(() => {
    if (deal && isOpen) {
      form.reset({
        title: deal.title || '',
        stageId: deal.stageId?.toString() || '',
        value: deal.value || null,
        contactId: deal.contactId || undefined,
        priority: deal.priority || 'medium',
        dueDate: deal.dueDate ? new Date(deal.dueDate) : null,
        assignedToUserId: deal.assignedToUserId || null,
        description: deal.description || '',
        tags: deal.tags || [],
      });
      setSelectedTags(deal.tags || []);
    }
  }, [deal, isOpen, form]);

  const resetForm = () => {
    form.reset();
    setSelectedTags([]);
    setTagInput('');
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !selectedTags.includes(tagInput.trim())) {
      const newTags = [...selectedTags, tagInput.trim()];
      setSelectedTags(newTags);
      form.setValue('tags', newTags);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    const newTags = selectedTags.filter(t => t !== tag);
    setSelectedTags(newTags);
    form.setValue('tags', newTags);
  };

  const updateDealMutation = useMutation({
    mutationFn: async (data: EditDealFormValues) => {
      if (!deal) throw new Error('No deal to update');
      const response = await apiRequest('PATCH', `/api/deals/${deal.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('common.success', 'Success'),
        description: t('pipeline.deal_updated', 'Deal has been updated'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });

      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      resetForm();
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.deal_update_failed_edit', 'Failed to update deal: {{error}}', { error: error.message }),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: EditDealFormValues) => {
    const submitData = {
      ...values,
      tags: selectedTags,
    };
    updateDealMutation.mutate(submitData);
  };

  const contacts = contactsData?.contacts || [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
      if (open) {
        resetForm();
      }
    }}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] md:max-h-[80vh] p-0 flex flex-col">
        <DialogHeader className="px-8 pt-6 pb-4">
          <DialogTitle>{t('pipeline.edit_deal', 'Edit Deal')}</DialogTitle>
          <DialogDescription>
            {currentPipeline ? (
              <div className="flex items-center gap-2 mt-1">
                <span>{t('pipeline.deal_in', 'Deal in')}</span>
                {currentPipeline.color && (
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: currentPipeline.color }}
                  />
                )}
                <Badge variant="secondary">{currentPipeline.name}</Badge>
              </div>
            ) : (
              t('pipeline.update_deal_information', 'Update the deal information')
            )}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 px-4 py-6 overflow-auto">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 m-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>{t('pipeline.deal_title', 'Deal Title')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t('pipeline.enter_deal_title', 'Enter deal title')} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

                <FormField
                  control={form.control}
                  name="contactId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('pipeline.contact', 'Contact')}</FormLabel>
                      <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString() || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('pipeline.select_contact', 'Select a contact')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {contacts.map((contact: any) => (
                            <SelectItem key={contact.id} value={contact.id.toString()}>
                              {contact.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="stageId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('pipeline.pipeline_stage_label', 'Pipeline Stage')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('pipeline.select_stage', 'Select a stage')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {pipelineStages.map((stage: any) => (
                            <SelectItem key={stage.id} value={stage.id.toString()}>
                              <div className="flex items-center">
                                <div
                                  className="w-3 h-3 rounded-full mr-2"
                                  style={{ backgroundColor: stage.color }}
                                />
                                {stage.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('pipeline.deal_value_dollar', 'Deal Value ($)')}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="0"
                          {...field}
                          value={field.value || ''}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('pipeline.priority', 'Priority')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('pipeline.select_priority', 'Select priority')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">{t('pipeline.low', 'Low')}</SelectItem>
                          <SelectItem value="medium">{t('pipeline.medium', 'Medium')}</SelectItem>
                          <SelectItem value="high">{t('pipeline.high', 'High')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="assignedToUserId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('pipeline.assigned_to', 'Assigned To')}</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value === 'unassigned' ? null : parseInt(value))}
                        value={field.value?.toString() || 'unassigned'}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('pipeline.select_assignee', 'Select assignee')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="unassigned">{t('pipeline.unassigned', 'Unassigned')}</SelectItem>
                          {teamMembers.map((member: any) => (
                            <SelectItem key={member.id} value={member.id.toString()}>
                              {member.fullName || member.username}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('pipeline.due_date', 'Due Date')}</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                          onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pipeline.description', 'Description')}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t('pipeline.enter_deal_description_placeholder', 'Enter deal description...')}
                        className="resize-none"
                        rows={3}
                        {...field}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <FormLabel>{t('pipeline.tags', 'Tags')}</FormLabel>
                <div className="flex gap-2">
                  <Input
                    placeholder={t('pipeline.add_tag_placeholder', 'Add a tag...')}
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                  />
                  <Button type="button" onClick={handleAddTag} size="sm">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {selectedTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedTags.map((tag, index) => (
                      <Badge key={index} variant="secondary" className="flex items-center gap-1 !bg-muted !text-muted-foreground">
                        {tag}
                        <X
                          className="h-3 w-3 cursor-pointer text-muted-foreground hover:text-muted-foreground/80"
                          onClick={() => handleRemoveTag(tag)}
                        />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </form>
          </Form>
        </ScrollArea>
        <DialogFooter className="px-8 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            type="submit"
            onClick={form.handleSubmit(onSubmit)}
            disabled={updateDealMutation.isPending}
          >
            {updateDealMutation.isPending ? t('pipeline.updating_deal', 'Updating...') : t('pipeline.update_deal', 'Update Deal')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

