import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { usePipeline } from '@/hooks/use-pipeline';
import { useTranslation } from '@/hooks/use-translation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { PIPELINE_TEMPLATES, PipelineTemplate, formatCategoryLabel } from '@/config/pipeline-templates';
import { Sparkles, Palette, FileText } from 'lucide-react';

interface CreatePipelineModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STAGE_COLORS = [
  '#4361ee', '#3a86ff', '#7209b7', '#f72585', '#4cc9f0',
  '#4895ef', '#560bad', '#f3722c', '#f8961e', '#90be6d',
  '#43aa8b', '#577590',
];

const PIPELINE_COLORS = [
  '#3a86ff', '#10b981', '#8b5cf6', '#06b6d4', '#f59e0b',
  '#ef4444', '#ec4899', '#14b8a6', '#6366f1', '#a855f7',
];

export default function CreatePipelineModal({
  isOpen,
  onClose,
}: CreatePipelineModalProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { pipelines, setActivePipelineId } = usePipeline();
  const [step, setStep] = useState<'method' | 'config'>('method');
  const [creationMethod, setCreationMethod] = useState<'template' | 'scratch'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<PipelineTemplate | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState('#3a86ff');

  const { data: templates = [] } = useQuery({
    queryKey: ['/api/pipeline-templates'],
    queryFn: async () => {
      try {
        const res = await apiRequest('GET', '/api/pipeline-templates');
        return res.json();
      } catch {

        return PIPELINE_TEMPLATES;
      }
    },
  });

  const mutationConfig = {
    onSuccess: async (data: any) => {
      toast({
        title: t('common.success', 'Success'),
        description: t('pipeline.pipeline_created_success', 'Pipeline created successfully'),
      });
      

      await queryClient.invalidateQueries({ queryKey: ['/api/pipelines'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/pipeline/stages'] });
      

      await new Promise(resolve => setTimeout(resolve, 100));
      

      setActivePipelineId(data.pipeline?.id || data.id);
      resetForm();
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.pipeline_create_failed', 'Failed to create pipeline: {{error}}', { error: error.message }),
        variant: 'destructive',
      });
    },
  };

  const createPipelineMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/pipelines', data);
      return response.json();
    },
    ...mutationConfig,
  });

  const createFromTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const response = await apiRequest('POST', `/api/pipelines/from-template/${templateId}`, {
        customName: name,
        description,
        icon,
        color,
      });
      return response.json();
    },
    ...mutationConfig,
  });

  const resetForm = () => {
    setStep('method');
    setCreationMethod('template');
    setSelectedTemplate(null);
    setName('');
    setDescription('');
    setIcon('');
    setColor('#3a86ff');
  };

  const handleMethodSelect = (method: 'template' | 'scratch') => {
    setCreationMethod(method);
    if (method === 'scratch') {
      setStep('config');
    }
  };

  const handleTemplateSelect = (template: PipelineTemplate) => {
    setSelectedTemplate(template);
    setName(template.name);
    setDescription(template.description);
    setIcon(template.icon);
    setColor(template.color);
    setStep('config');
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.pipeline_name_required', 'Pipeline name is required'),
        variant: 'destructive',
      });
      return;
    }

    if (creationMethod === 'template' && selectedTemplate) {
      createFromTemplateMutation.mutate(selectedTemplate.id);
    } else {
      const orderNum = pipelines.length > 0
        ? Math.max(...pipelines.map(p => p.orderNum)) + 1
        : 1;
      createPipelineMutation.mutate({
        name,
        description,
        icon,
        color,
        orderNum,
      });
    }
  };

  const availableTemplates = templates.length > 0 ? templates : PIPELINE_TEMPLATES;
  const categories: string[] = Array.from(new Set(availableTemplates.map((t: PipelineTemplate) => t.category)));

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          resetForm();
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-[700px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{t('pipeline.create_new_pipeline', 'Create New Pipeline')}</DialogTitle>
          <DialogDescription>
            {step === 'method'
              ? t('pipeline.choose_creation_method', 'Choose how you want to create your pipeline')
              : t('pipeline.configure_pipeline_details', 'Configure your pipeline details')}
          </DialogDescription>
        </DialogHeader>

        {step === 'method' ? (
          <div className="space-y-3 sm:space-y-4 py-2 sm:py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <button
                type="button"
                onClick={() => handleMethodSelect('template')}
                className={`p-4 border-2 rounded-lg text-left transition-colors ${
                  creationMethod === 'template'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <Sparkles className="h-6 w-6 mb-2 text-primary" />
                <h3 className="font-semibold">{t('pipeline.from_template', 'From Template')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('pipeline.start_with_template', 'Start with a pre-configured template')}
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleMethodSelect('scratch')}
                className={`p-4 border-2 rounded-lg text-left transition-colors ${
                  creationMethod === 'scratch'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <FileText className="h-6 w-6 mb-2 text-primary" />
                <h3 className="font-semibold">{t('pipeline.from_scratch', 'From Scratch')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('pipeline.create_custom_pipeline', 'Create a custom pipeline')}
                </p>
              </button>
            </div>

            {creationMethod === 'template' && (
              <div className="mt-3 sm:mt-4">
                <div className="space-y-3 sm:space-y-4">
                  {categories.map((category: string) => (
                    <div key={category}>
                      <h4 className="font-medium mb-2 text-sm text-muted-foreground">
                        {formatCategoryLabel(category)}
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2">
                        {availableTemplates
                          .filter((t: PipelineTemplate) => t.category === category)
                          .map((template: PipelineTemplate) => (
                            <button
                              key={template.id}
                              type="button"
                              onClick={() => handleTemplateSelect(template)}
                              className="p-3 border rounded-lg text-left hover:bg-accent transition-colors"
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <div
                                  className="w-4 h-4 rounded-full"
                                  style={{ backgroundColor: template.color }}
                                />
                                <span className="font-medium text-sm">{template.name}</span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {template.description}
                              </p>
                              <div className="mt-2 flex gap-1">
                                {template.stages.slice(0, 3).map((stage, idx) => (
                                  <div
                                    key={idx}
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: stage.color }}
                                  />
                                ))}
                                {template.stages.length > 3 && (
                                  <span className="text-xs text-muted-foreground">
                                    +{template.stages.length - 3}
                                  </span>
                                )}
                              </div>
                            </button>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('pipeline.pipeline_name', 'Pipeline Name')} *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('pipeline.pipeline_name_placeholder', 'e.g., Sales Pipeline')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('pipeline.pipeline_description', 'Description')}</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('pipeline.describe_pipeline', 'Describe what this pipeline is for...')}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="icon">{t('pipeline.icon', 'Icon')}</Label>
              <Input
                id="icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder={t('pipeline.icon_placeholder', 'e.g., TrendingUp, Users')}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('pipeline.color', 'Color')}</Label>
              <div className="flex flex-wrap gap-2">
                {PIPELINE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-full border-2 ${
                      color === c ? 'border-foreground' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div
                  className="w-6 h-6 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-sm">{color}</span>
              </div>
            </div>

            {selectedTemplate && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-2">{t('pipeline.template_preview', 'Template Preview')}</p>
                <div className="flex gap-1">
                  {selectedTemplate.stages.map((stage, idx) => (
                    <div
                      key={idx}
                      className="flex-1 h-2 rounded"
                      style={{ backgroundColor: stage.color }}
                      title={stage.name}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'config' && (
            <Button variant="outline" onClick={() => setStep('method')}>
              {t('common.back', 'Back')}
            </Button>
          )}
          <Button variant="outline" onClick={() => {
            resetForm();
            onClose();
          }}>
            {t('common.cancel', 'Cancel')}
          </Button>
          {step === 'config' && (
            <Button
              onClick={handleSubmit}
              disabled={createPipelineMutation.isPending || createFromTemplateMutation.isPending}
            >
              {createPipelineMutation.isPending || createFromTemplateMutation.isPending
                ? t('pipeline.creating_pipeline', 'Creating...')
                : t('pipeline.create_pipeline', 'Create Pipeline')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
