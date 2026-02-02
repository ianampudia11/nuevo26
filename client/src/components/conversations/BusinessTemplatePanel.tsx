import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  MessageSquare,
  Search,
  ChevronDown,
  X,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import type { WhatsAppTemplate } from '@/types/whatsapp-template';

interface BusinessTemplatePanelProps {
  conversationId: number;
  conversation: any;
  contact: any;
  className?: string;
}

export default function BusinessTemplatePanel({
  conversationId,
  conversation,
  contact,
  className = ''
}: BusinessTemplatePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [isVariableModalOpen, setIsVariableModalOpen] = useState(false);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();


  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['/api/whatsapp-templates'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/whatsapp-templates');
      if (!response.ok) throw new Error('Failed to fetch templates');
      const data = await response.json();
      return data.data || data || [];
    },
    staleTime: 30000,
  });


  const filteredTemplates = templates.filter((template: WhatsAppTemplate) => {
    const matchesStatus = template.whatsappTemplateStatus === 'approved';
    const matchesConnection = template.connectionId === conversation?.channelId;
    const matchesChannelType = template.whatsappChannelType === 'official';
    return matchesStatus && matchesConnection && matchesChannelType;
  });


  const searchFilteredTemplates = filteredTemplates.filter((template: WhatsAppTemplate) => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         template.content.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });


  const groupedTemplates = searchFilteredTemplates.reduce((acc: Record<string, WhatsAppTemplate[]>, template: WhatsAppTemplate) => {
    const category = template.whatsappTemplateCategory || 'other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(template);
    return acc;
  }, {});

  const sendTemplateMutation = useMutation({
    mutationFn: async (payload: {
      templateId: number;
      templateName: string;
      languageCode: string;
      variables: Record<string, string>;
    }) => {
      const response = await apiRequest(
        'POST',
        `/api/conversations/${conversationId}/send-template`,
        payload
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || 'Failed to send template');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', conversationId, 'messages'] });
      setIsVariableModalOpen(false);
      setSelectedTemplate(null);
      setVariableValues({});
      setIsOpen(false);
      setSearchTerm('');
      toast({
        title: t('templates.sent', 'Template Sent'),
        description: t('templates.sent_success', 'WhatsApp template message has been sent successfully.'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('templates.send_error', 'Error'),
        description: error.message || t('templates.send_error_desc', 'Failed to send template. Please try again.'),
        variant: 'destructive',
      });
    },
  });

  const handleSelectTemplate = (template: WhatsAppTemplate) => {
    setSelectedTemplate(template);
    

    if (template.variables && template.variables.length > 0) {

      const initialValues: Record<string, string> = {};
      template.variables.forEach((varIndex) => {
        initialValues[varIndex] = '';
      });
      setVariableValues(initialValues);
      setIsVariableModalOpen(true);
    } else {

      handleSendTemplate(template, {});
    }
  };

  const handleSendTemplate = (template: WhatsAppTemplate, vars: Record<string, string>) => {
    sendTemplateMutation.mutate({
      templateId: template.id,
      templateName: template.whatsappTemplateName || template.name,
      languageCode: template.whatsappTemplateLanguage || 'en',
      variables: vars,
    });
  };

  const handleVariableChange = (varIndex: string, value: string) => {
    setVariableValues(prev => ({
      ...prev,
      [varIndex]: value
    }));
  };

  const getTemplatePreview = (template: WhatsAppTemplate) => {
    let preview = template.content;
    if (template.variables && template.variables.length > 0) {
      template.variables.forEach((varIndex) => {
        preview = preview.replace(new RegExp(`\\{\\{${varIndex}\\}\\}`, 'g'), `[Variable ${varIndex}]`);
      });
    }
    return preview;
  };

  const getVariablePreview = () => {
    if (!selectedTemplate) return '';
    let preview = selectedTemplate.content;
    Object.keys(variableValues).sort((a, b) => parseInt(a) - parseInt(b)).forEach((varIndex) => {
      const value = variableValues[varIndex] || `{{${varIndex}}}`;
      preview = preview.replace(new RegExp(`\\{\\{${varIndex}\\}\\}`, 'g'), value);
    });
    return preview;
  };

  const allVariablesFilled = selectedTemplate?.variables?.every(varIndex => {
    return variableValues[varIndex] && variableValues[varIndex].trim() !== '';
  }) ?? true;

  const getStatusBadge = (status?: string) => {
    if (status === 'approved') {
      return (
        <Badge className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          {t('templates.status.approved', 'Approved')}
        </Badge>
      );
    }
    return null;
  };

  const getCategoryBadge = (category?: string) => {
    switch (category) {
      case 'marketing':
        return <Badge variant="secondary">{t('templates.category.marketing', 'Marketing')}</Badge>;
      case 'utility':
        return <Badge variant="default">{t('templates.category.utility', 'Utility')}</Badge>;
      case 'authentication':
        return <Badge variant="outline">{t('templates.category.authentication', 'Authentication')}</Badge>;
      default:
        return null;
    }
  };

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-accent ${className}`}
            title={t('templates.use_business_template', 'Use WhatsApp Business Template')}
          >
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">{t('templates.template', 'Template')}</span>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start" side="top">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-sm text-foreground">
                {t('templates.select_template', 'Select Template')}
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder={t('templates.search', 'Search templates...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-9"
              />
            </div>

            <div className="space-y-1 max-h-64 overflow-y-auto">
              {isLoading ? (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  {t('templates.loading', 'Loading templates...')}
                </div>
              ) : searchFilteredTemplates.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  {searchTerm
                    ? t('templates.no_results', 'No templates found')
                    : t('templates.no_templates_available', 'No approved templates available for this connection')
                  }
                </div>
              ) : (
                (Object.entries(groupedTemplates) as [string, WhatsAppTemplate[]][]).map(([category, categoryTemplates]) => (
                  <div key={category} className="mb-2">
                    <div className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">
                      {t(`templates.category.${category}`, category)}
                    </div>
                    {categoryTemplates.map((template: WhatsAppTemplate) => (
                      <div
                        key={template.id}
                        className="p-3 rounded-lg hover:bg-accent cursor-pointer border border-transparent hover:border-border transition-colors"
                        onClick={() => handleSelectTemplate(template)}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <h5 className="font-medium text-sm text-foreground truncate pr-2">
                            {template.name}
                          </h5>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {getStatusBadge(template.whatsappTemplateStatus)}
                            {getCategoryBadge(template.whatsappTemplateCategory)}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {getTemplatePreview(template)}
                        </p>
                        {template.variables && template.variables.length > 0 && (
                          <div className="flex items-center mt-1">
                            <span className="text-xs text-primary">
                              {t('templates.variables_count', '{{count}} variables', { count: template.variables.length })}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Variable Input Dialog */}
      <Dialog open={isVariableModalOpen} onOpenChange={setIsVariableModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('templates.fill_variables', 'Fill Template Variables')}</DialogTitle>
            <DialogDescription>
              {t('templates.fill_variables_desc', 'Enter values for the template variables')}
            </DialogDescription>
          </DialogHeader>

          {selectedTemplate && (
            <div className="space-y-4">
              {/* Template Preview */}
              <div className="border rounded-lg p-3 bg-muted">
                <div className="text-xs text-muted-foreground mb-1">{t('templates.preview', 'Preview')}</div>
                <div className="text-sm text-foreground whitespace-pre-wrap">
                  {getVariablePreview()}
                </div>
              </div>

              {/* Variable Inputs */}
              <div className="space-y-3">
                {selectedTemplate.variables && selectedTemplate.variables
                  .sort((a, b) => parseInt(a) - parseInt(b))
                  .map((varIndex) => (
                    <div key={varIndex}>
                      <label className="text-sm font-medium text-foreground mb-1 block">
                        {t('templates.variable_label', 'Variable {{index}}', { index: varIndex })}
                      </label>
                      <Input
                        placeholder={t('templates.variable_placeholder', 'Enter value for variable {{index}}', { index: varIndex })}
                        value={variableValues[varIndex] || ''}
                        onChange={(e) => handleVariableChange(varIndex, e.target.value)}
                      />
                    </div>
                  ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsVariableModalOpen(false);
                setVariableValues({});
              }}
              disabled={sendTemplateMutation.isPending}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={() => handleSendTemplate(selectedTemplate!, variableValues)}
              disabled={!allVariablesFilled || sendTemplateMutation.isPending}
            >
              {sendTemplateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('common.sending', 'Sending...')}
                </>
              ) : (
                t('common.send', 'Send')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

