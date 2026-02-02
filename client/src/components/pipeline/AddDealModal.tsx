import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { CalendarIcon, Plus, X, Upload, AlertCircle, CheckCircle, Loader2, User } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { usePipeline } from '@/hooks/use-pipeline';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
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
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/use-translation';

const createAddDealSchema = (t: (key: string, fallback?: string) => string) => z.object({
  title: z.string().min(2, t('pipeline.validation.title_min', 'Title must be at least 2 characters')),
  stage: z.string().min(1, t('pipeline.validation.stage_required', 'Please select a pipeline stage')),
  value: z.number().min(0).optional().nullable(),
  contactId: z.number().min(1, t('pipeline.validation.contact_required', 'Please select a contact')),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  dueDate: z.date().optional().nullable(),
  assignedToUserId: z.number().optional().nullable(),
  description: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
});

type AddDealFormValues = z.infer<ReturnType<typeof createAddDealSchema>>;

interface AddDealModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePipelineId: number | null;
}

function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  let normalized = phone.replace(/[^\d+]/g, '');
  if (normalized && !normalized.startsWith('+')) {
    normalized = normalized.replace(/^0+/, '');
    if (normalized.length > 10) {
      normalized = '+' + normalized;
    }
  }
  return normalized;
}

function validatePhoneNumber(phone: string): { isValid: boolean; error?: string } {
  if (!phone) return { isValid: true };
  const numericOnly = phone.replace(/[^0-9]/g, '');
  if (numericOnly.length < 7 || numericOnly.length > 15) {
    return { isValid: false, error: 'Phone number must be between 7 and 15 digits' };
  }
  return { isValid: true };
}

export default function AddDealModal({ isOpen, onClose, activePipelineId }: AddDealModalProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { activePipeline } = usePipeline();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState<string>('');
  const [isAddContactDialogOpen, setIsAddContactDialogOpen] = useState(false);
  const [addContactForm, setAddContactForm] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    identifierType: '',
    identifier: '',
    notes: '',
    tags: '',
    avatarFile: null as File | null,
    avatarPreview: '' as string
  });
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);

  const { data: contactsData, isLoading: isLoadingContacts } = useQuery({
    queryKey: ['/api/contacts'],
    queryFn: () => apiRequest('GET', '/api/contacts')
      .then(res => res.json()),
  });

  const { data: dealsData } = useQuery({
    queryKey: ['/api/deals', activePipelineId],
    queryFn: () => {
      const queryParams = new URLSearchParams();
      if (activePipelineId) {
        queryParams.append('pipelineId', activePipelineId.toString());
      }
      const url = `/api/deals${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      return apiRequest('GET', url)
        .then(res => res.json());
    },
  });

  const { data: teamMembers = [], isLoading: isLoadingTeam } = useQuery({
    queryKey: ['/api/team-members'],
    queryFn: () => apiRequest('GET', '/api/team-members')
      .then(res => res.json()),
  });

  const { data: pipelineStages = [], isLoading: isLoadingStages } = useQuery({
    queryKey: ['/api/pipeline/stages', activePipelineId],
    queryFn: () => {
      const queryParams = new URLSearchParams();
      if (activePipelineId) {
        queryParams.append('pipelineId', activePipelineId.toString());
      }
      const url = `/api/pipeline/stages${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      return apiRequest('GET', url)
        .then(res => res.json())
        .then(data => {
          return data;
        });
    },
    enabled: !!activePipelineId,
  });

  const addDealSchema = createAddDealSchema(t);
  const form = useForm<AddDealFormValues>({
    resolver: zodResolver(addDealSchema),
    defaultValues: {
      title: '',
      stage: '',
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
    if (Array.isArray(pipelineStages) && pipelineStages.length > 0) {
      const currentStage = form.getValues('stage');
      if (!currentStage) {
        form.setValue('stage', pipelineStages[0].id.toString());
      }
    }
  }, [pipelineStages]);

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

  const createDealMutation = useMutation({
    mutationFn: async (data: AddDealFormValues) => {
      if (!activePipelineId) {
        throw new Error('No active pipeline selected');
      }
      const response = await apiRequest('POST', '/api/deals', {
        ...data,
        pipelineId: activePipelineId,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('common.success', 'Success'),
        description: t('pipeline.deal_created', 'Deal has been created'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });

      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      resetForm();
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.deal_create_failed', 'Failed to create deal: {{error}}', { error: error.message }),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: AddDealFormValues) => {
    values.tags = selectedTags;
    createDealMutation.mutate(values);
  };

  const resetAddContactForm = () => {
    setAddContactForm({
      name: '',
      email: '',
      phone: '',
      company: '',
      identifierType: '',
      identifier: '',
      notes: '',
      tags: '',
      avatarFile: null,
      avatarPreview: ''
    });
  };

  const handleAvatarUpload = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t('pipeline.file_too_large', 'File too large'),
        description: t('pipeline.avatar_must_be_less_than_5mb', 'Avatar must be less than 5MB'),
        variant: "destructive",
      });
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast({
        title: t('pipeline.invalid_file_type', 'Invalid file type'),
        description: t('pipeline.please_select_image_file', 'Please select an image file (JPG, PNG)'),
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setAddContactForm(prev => ({
        ...prev,
        avatarFile: file,
        avatarPreview: e.target?.result as string
      }));
    };
    reader.readAsDataURL(file);
  };

  const addContactMutation = useMutation({
    mutationFn: async (contactData: any) => {
      const response = await apiRequest('POST', '/api/contacts', contactData);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create contact');
      }

      const newContact = await response.json();

      if (addContactForm.avatarFile) {
        const formData = new FormData();
        formData.append('avatar', addContactForm.avatarFile);

        const avatarResponse = await apiRequest('POST', `/api/contacts/${newContact.id}/avatar`, formData);

        if (avatarResponse.ok) {
          const avatarData = await avatarResponse.json();
          newContact.avatarUrl = avatarData.avatarUrl;
        }
      }

      return newContact;
    },
    onMutate: () => {
      setIsSubmittingContact(true);
    },
    onSuccess: (newContact) => {
      toast({
        title: t('pipeline.contact_created', 'Contact created'),
        description: t('pipeline.contact_created_success', 'The contact has been successfully created.'),
      });

      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
      setIsAddContactDialogOpen(false);
      resetAddContactForm();
      

      form.setValue('contactId', newContact.id);
    },
    onError: (error: Error) => {
      toast({
        title: t('pipeline.creation_failed', 'Creation failed'),
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSubmittingContact(false);
    }
  });

  const handleAddContactSubmit = () => {
    if (!addContactForm.name.trim()) {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.contact_name_required', 'Contact name is required'),
        variant: 'destructive'
      });
      return;
    }

    if (addContactForm.phone) {
      const phoneValidation = validatePhoneNumber(addContactForm.phone);
      if (!phoneValidation.isValid) {
        toast({
          title: t('common.error', 'Error'),
          description: phoneValidation.error,
          variant: 'destructive'
        });
        return;
      }
    }

    const tagsArray = addContactForm.tags
      ? addContactForm.tags.split(',').map(tag => tag.trim()).filter(Boolean)
      : [];

    const normalizedPhone = addContactForm.phone ? normalizePhoneNumber(addContactForm.phone) : '';

    addContactMutation.mutate({
      ...addContactForm,
      phone: normalizedPhone,
      tags: tagsArray
    });
  };


  const availableContacts = contactsData?.contacts?.filter((contact: any) => {
    if (!dealsData || !Array.isArray(dealsData)) return true;

    if (!activePipelineId) {
      const hasDeal = dealsData.some((deal: any) => 
        deal.contactId === contact.id && deal.status === 'active'
      );
      return !hasDeal;
    }

    const hasDealInPipeline = dealsData.some((deal: any) => 
      deal.contactId === contact.id && 
      deal.status === 'active' && 
      deal.pipelineId === activePipelineId
    );
    return !hasDealInPipeline;
  }) || [];

  const isLoadingData = isLoadingStages || isLoadingContacts || isLoadingTeam;

  return (
    <>
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
          <DialogTitle>{t('pipeline.add_new_deal', 'Add New Deal')}</DialogTitle>
          <DialogDescription>
            {activePipeline ? (
              <div className="flex items-center gap-2 mt-1">
                <span>{t('pipeline.adding_deal_to', 'Adding deal to')}</span>
                {activePipeline.color && (
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: activePipeline.color }}
                  />
                )}
                <Badge variant="secondary">{activePipeline.name}</Badge>
              </div>
            ) : (
              t('pipeline.create_new_deal', 'Create a new deal in your pipeline')
            )}
          </DialogDescription>
        </DialogHeader>
        {isLoadingData && (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">{t('pipeline.loading_form_data', 'Loading form data...')}</span>
          </div>
        )}
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
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pipeline.deal_value', 'Deal Value')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="0.00"
                        onChange={(e) => {
                          const value = e.target.value === '' ? null : parseFloat(e.target.value);
                          field.onChange(value);
                        }}
                        value={field.value === null ? '' : field.value}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="stage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pipeline.stage', 'Stage')}</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={isLoadingStages}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('pipeline.select_stage', 'Select stage')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {pipelineStages.map((stage: any) => (
                          <SelectItem key={stage.id} value={stage.id.toString()}>
                            {stage.name}
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
                name="contactId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pipeline.contact', 'Contact')}</FormLabel>
                    <div className="flex gap-2">
                      <Select
                        onValueChange={(value) => field.onChange(value === 'none' ? null : parseInt(value))}
                        value={field.value?.toString() || 'none'}
                      >
                        <FormControl>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder={t('pipeline.select_contact', 'Select contact')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableContacts.length > 0 ? (
                            <>
                              <SelectItem value="none">{t('pipeline.none', 'None')}</SelectItem>
                              {availableContacts.map((contact: any) => (
                                <SelectItem key={contact.id} value={contact.id.toString()}>
                                  {contact.name || contact.fullName || contact.phone || contact.phoneNumber}
                                </SelectItem>
                              ))}
                            </>
                          ) : (
                            <SelectItem value="no-contacts" disabled>
                              {t('pipeline.no_contacts_available', 'No contacts available')}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setIsAddContactDialogOpen(true)}
                        className="flex-shrink-0"
                        title={t('pipeline.add_new_contact', 'Add new contact')}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
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
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
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
                name="dueDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>{t('pipeline.due_date', 'Due Date')}</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>{t('pipeline.pick_date', 'Pick a date')}</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date < new Date(new Date().setHours(0, 0, 0, 0))
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
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
                          <SelectValue placeholder={t('pipeline.assign_to', 'Assign to')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="unassigned">{t('pipeline.unassigned', 'Unassigned')}</SelectItem>
                        {teamMembers.map((user: any) => (
                          <SelectItem key={user.id} value={user.id.toString()}>
                            {user.fullName || user.username}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormItem className="md:col-span-2">
                <FormLabel>{t('pipeline.tags', 'Tags')}</FormLabel>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder={t('pipeline.add_tags', 'Add tags')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                  />
                  <Button type="button" size="sm" onClick={handleAddTag}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedTags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="flex items-center !bg-muted !text-muted-foreground">
                      {tag}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 ml-1 hover:bg-transparent"
                        onClick={() => handleRemoveTag(tag)}
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </Badge>
                  ))}
                </div>
                <FormDescription>{t('pipeline.press_enter_to_add_tag', 'Press Enter or click Add to add a tag')}</FormDescription>
              </FormItem>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>{t('pipeline.description', 'Description')}</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder={t('pipeline.enter_deal_description', 'Enter deal description')}
                        className="min-h-[100px]"
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
        </ScrollArea>

        <div className="border-t border-border mt-2">
          <DialogFooter className="px-8 py-6 flex flex-row justify-end gap-3 sm:gap-2">
            <Button type="button" variant="outline"  onClick={onClose}>
              {t('pipeline.cancel', 'Cancel')}
            </Button>
            <Button  variant="outline" className="btn-brand-primary"
              type="submit"
              disabled={createDealMutation.isPending || isLoadingData}
              onClick={form.handleSubmit(onSubmit)}
            >
              {createDealMutation.isPending ? t('pipeline.creating', 'Creating...') : t('pipeline.create_deal', 'Create Deal')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>

      {/* Add Contact Dialog */}
      <Dialog open={isAddContactDialogOpen} onOpenChange={setIsAddContactDialogOpen}>
        <DialogContent className="w-[95vw] max-w-[500px] max-h-[90vh] p-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle>{t('pipeline.add_new_contact_title', 'Add New Contact')}</DialogTitle>
            <DialogDescription>
              {t('pipeline.create_new_contact_desc', 'Create a new contact with the information below.')}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6">
            <div className="space-y-6 pb-4">
            {/* Contact Avatar Upload Section */}
              <div className="flex flex-col items-center space-y-3 p-4 border-2 border-dashed border-border rounded-lg hover:border-border/80 transition-colors">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                  {addContactForm.avatarPreview ? (
                    <img
                      src={addContactForm.avatarPreview}
                      alt="Avatar preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                <div className="text-center">
                  <p className="text-sm text-foreground">{t('pipeline.upload_contact_photo', 'Upload contact photo')}</p>
                  <p className="text-xs text-muted-foreground">{t('pipeline.optional_jpg_png', 'Optional - JPG, PNG up to 5MB')}</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSubmittingContact}
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) handleAvatarUpload(file);
                      };
                      input.click();
                    }}
                    className="w-full sm:w-auto"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {t('pipeline.choose_photo', 'Choose Photo')}
                  </Button>
                  {addContactForm.avatarPreview && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isSubmittingContact}
                      onClick={() => setAddContactForm(prev => ({ ...prev, avatarFile: null, avatarPreview: '' }))}
                      className="w-full sm:w-auto"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="add-name">{t('pipeline.name_required', 'Name *')}</Label>
                  <Input
                    id="add-name"
                    value={addContactForm.name}
                    onChange={(e) => setAddContactForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder={t('pipeline.enter_contact_name', 'Enter contact name')}
                    disabled={isSubmittingContact}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="add-email">{t('pipeline.email', 'Email')}</Label>
                  <Input
                    id="add-email"
                    type="email"
                    value={addContactForm.email}
                    onChange={(e) => setAddContactForm(prev => ({ ...prev, email: e.target.value }))}
                    placeholder={t('pipeline.enter_email_address', 'Enter email address')}
                    disabled={isSubmittingContact}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="add-phone">{t('pipeline.phone', 'Phone')}</Label>
                  <Input
                    id="add-phone"
                    type="tel"
                    value={addContactForm.phone}
                    onChange={(e) => setAddContactForm(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="+1234567890"
                    disabled={isSubmittingContact}
                  />
                  {addContactForm.phone && (
                    <div className="text-xs">
                      {validatePhoneNumber(addContactForm.phone).isValid ? (
                        <div className="flex items-center text-green-600">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          {t('pipeline.valid_phone_number', 'Valid phone number')}
                        </div>
                      ) : (
                        <div className="flex items-center text-red-600">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          {validatePhoneNumber(addContactForm.phone).error}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="add-company">{t('pipeline.company', 'Company')}</Label>
                  <Input
                    id="add-company"
                    value={addContactForm.company}
                    onChange={(e) => setAddContactForm(prev => ({ ...prev, company: e.target.value }))}
                    placeholder={t('pipeline.enter_company_name', 'Enter company name')}
                    disabled={isSubmittingContact}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="add-channel">{t('pipeline.channel', 'Channel')}</Label>
                  <Select
                    value={addContactForm.identifierType}
                    onValueChange={(value) => setAddContactForm(prev => ({ ...prev, identifierType: value }))}
                    disabled={isSubmittingContact}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t('pipeline.select_channel', 'Select channel')} />
                    </SelectTrigger>
                    <SelectContent className="z-[100]">
                      <SelectItem value="whatsapp_official">{t('pipeline.whatsapp_official', 'WhatsApp Official')}</SelectItem>
                      <SelectItem value="whatsapp_unofficial">{t('pipeline.whatsapp_unofficial', 'WhatsApp Unofficial')}</SelectItem>
                      <SelectItem value="messenger">{t('pipeline.facebook_messenger', 'Facebook Messenger')}</SelectItem>
                      <SelectItem value="instagram">{t('pipeline.instagram', 'Instagram')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="add-identifier">{t('pipeline.channel_identifier', 'Channel Identifier')}</Label>
                  <Input
                    id="add-identifier"
                    value={addContactForm.identifier}
                    onChange={(e) => setAddContactForm(prev => ({ ...prev, identifier: e.target.value }))}
                    placeholder={t('pipeline.phone_number_or_id', 'Phone number or ID')}
                    disabled={isSubmittingContact}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-tags">{t('pipeline.tags', 'Tags')}</Label>
                <Input
                  id="add-tags"
                  value={addContactForm.tags}
                  onChange={(e) => setAddContactForm(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder={t('pipeline.type_tags_separated', 'Type tags separated by commas...')}
                  disabled={isSubmittingContact}
                />
                <div className="flex flex-wrap gap-1 mt-2">
                  {['lead', 'customer', 'prospect', 'vip', 'partner'].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        const currentTags = addContactForm.tags ? addContactForm.tags.split(',').map(t => t.trim()) : [];
                        if (!currentTags.includes(tag)) {
                          const newTags = [...currentTags, tag].join(', ');
                          setAddContactForm(prev => ({ ...prev, tags: newTags }));
                        }
                      }}
                      className="px-2 py-1 text-xs bg-muted hover:bg-accent text-foreground rounded-full transition-colors"
                      disabled={isSubmittingContact}
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-notes">{t('pipeline.notes', 'Notes')}</Label>
                <Textarea
                  id="add-notes"
                  value={addContactForm.notes}
                  onChange={(e) => setAddContactForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder={t('pipeline.additional_notes_contact', 'Additional notes about this contact...')}
                  rows={3}
                  disabled={isSubmittingContact}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 pb-6 pt-4 border-t flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsAddContactDialogOpen(false);
                resetAddContactForm();
              }}
              disabled={isSubmittingContact}
              className="w-full sm:w-auto"
            >
              {t('pipeline.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleAddContactSubmit}
              disabled={isSubmittingContact}
              className="w-full sm:w-auto"
            >
              {isSubmittingContact ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('pipeline.creating', 'Creating...')}
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('pipeline.create_contact', 'Create Contact')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}