import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Settings,
  Save,
  RefreshCw,
  Info,
  AlertCircle,
  CheckCircle,
  Loader2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface RAGConfig {
  id?: number;
  enabled: boolean;
  maxRetrievedChunks: number;
  similarityThreshold: number;
  embeddingModel: string;
  contextPosition: 'before_system' | 'after_system' | 'before_user';
  contextTemplate: string;
}

interface RAGConfigurationProps {
  nodeId: string;
  companyId?: number;
  onConfigChange?: (config: RAGConfig) => void;
}

const DEFAULT_CONFIG: RAGConfig = {
  enabled: true,
  maxRetrievedChunks: 3,
  similarityThreshold: 0.7,
  embeddingModel: 'text-embedding-3-small', // Fixed for Pinecone compatibility
  contextPosition: 'before_system',
  contextTemplate: 'Based on the following knowledge base information:\n\n{context}\n\nPlease answer the user\'s question using this information when relevant.'
};

const CONTEXT_POSITIONS = [
  { 
    id: 'before_system', 
    name: 'Before System Prompt', 
    description: 'Context appears before the system prompt (recommended)' 
  },
  { 
    id: 'after_system', 
    name: 'After System Prompt', 
    description: 'Context appears after the system prompt' 
  },
  { 
    id: 'before_user', 
    name: 'Before User Message', 
    description: 'Context is injected before each user message' 
  }
];

export function RAGConfiguration({
  nodeId,
  companyId,
  onConfigChange
}: RAGConfigurationProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<RAGConfig>(DEFAULT_CONFIG);
  const [hasChanges, setHasChanges] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false); // Collapsed by default


  const { data: currentConfig, isLoading, error } = useQuery({
    queryKey: ['knowledge-base-config', nodeId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/knowledge-base/config/${nodeId}`);
      const result = await response.json();
      return result.data as RAGConfig | null;
    }
  });


  useEffect(() => {
    if (currentConfig) {
      setConfig(currentConfig);
    } else {
      setConfig(DEFAULT_CONFIG);
    }
    setHasChanges(false);
  }, [currentConfig]);


  const saveMutation = useMutation({
    mutationFn: async (configData: RAGConfig) => {
      const response = await apiRequest('PUT', `/api/knowledge-base/config/${nodeId}`, configData);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Save failed');
      }
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: t('knowledge_base.config.save_success', 'Configuration saved'),
        description: t('knowledge_base.config.save_success_desc', 'RAG settings have been updated successfully')
      });
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['knowledge-base-config', nodeId] });
      
      if (onConfigChange) {
        onConfigChange(result.data);
      }
    },
    onError: (error: Error) => {
      toast({
        title: t('knowledge_base.config.save_error', 'Save failed'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const handleConfigChange = (updates: Partial<RAGConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    await saveMutation.mutateAsync(config);
  };

  const handleReset = () => {
    if (currentConfig) {
      setConfig(currentConfig);
    } else {
      setConfig(DEFAULT_CONFIG);
    }
    setHasChanges(false);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          {t('common.loading', 'Loading...')}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              {t('knowledge_base.config.title', 'RAG Configuration')}
            </CardTitle>
            <CardDescription>
              {t('knowledge_base.config.description', 'Configure how the knowledge base retrieves and injects context into AI responses')}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-6">
          {/* Enable/Disable RAG */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">
                {t('knowledge_base.config.enabled', 'Enable Knowledge Base')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('knowledge_base.config.enabled_desc', 'Use knowledge base for context-aware responses')}
              </p>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(enabled) => handleConfigChange({ enabled })}
            />
          </div>

          {config.enabled && (
          <>
            {/* Retrieval Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">
                {t('knowledge_base.config.retrieval_title', 'Retrieval Settings')}
              </h3>

              {/* Max Retrieved Chunks */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>
                    {t('knowledge_base.config.max_chunks', 'Maximum Retrieved Chunks')}
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-4 h-4 text-gray-400" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          {t('knowledge_base.config.max_chunks_tooltip', 
                            'Number of most relevant document chunks to retrieve for each query. More chunks provide more context but increase token usage.'
                          )}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[config.maxRetrievedChunks]}
                    onValueChange={([value]) => handleConfigChange({ maxRetrievedChunks: value })}
                    max={10}
                    min={1}
                    step={1}
                    className="flex-1"
                  />
                  <span className="w-8 text-sm font-medium">{config.maxRetrievedChunks}</span>
                </div>
              </div>

              {/* Similarity Threshold */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>
                    {t('knowledge_base.config.similarity_threshold', 'Similarity Threshold')}
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-4 h-4 text-gray-400" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          {t('knowledge_base.config.similarity_threshold_tooltip',
                            'Minimum similarity score (0-1) for chunks to be included. Higher values return more relevant but fewer results.'
                          )}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[config.similarityThreshold]}
                    onValueChange={([value]) => handleConfigChange({ similarityThreshold: value })}
                    max={1}
                    min={0}
                    step={0.05}
                    className="flex-1"
                  />
                  <span className="w-12 text-sm font-medium">{config.similarityThreshold.toFixed(2)}</span>
                </div>
              </div>

              {/* Embedding Model - Read-only (Pinecone uses text-embedding-3-small) */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>
                    {t('knowledge_base.config.embedding_model', 'Embedding Model')}
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-4 h-4 text-gray-400" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          {t('knowledge_base.config.embedding_model_tooltip',
                            'Embedding model is fixed to ensure compatibility with Pinecone vector database (1536 dimensions).'
                          )}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-center gap-2 px-3 py-2  border border-gray-200 rounded-md">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium">OpenAI Embedding 3 Small (Fast)</span>
                  <span className="text-xs text-gray-500 ml-auto">1536 dimensions</span>
                </div>
              </div>
            </div>

            {/* Context Injection Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">
                {t('knowledge_base.config.context_title', 'Context Injection')}
              </h3>

              {/* Context Position */}
              <div className="space-y-2">
                <Label>
                  {t('knowledge_base.config.context_position', 'Context Position')}
                </Label>
                <Select
                  value={config.contextPosition}
                  onValueChange={(value: any) => handleConfigChange({ contextPosition: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTEXT_POSITIONS.map((position) => (
                      <SelectItem key={position.id} value={position.id}>
                        <div>
                          <div className="font-medium">{position.name}</div>
                          <div className="text-xs text-gray-500">{position.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Context Template */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>
                    {t('knowledge_base.config.context_template', 'Context Template')}
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-4 h-4 text-gray-400" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          {t('knowledge_base.config.context_template_tooltip', 
                            'Template for injecting retrieved context. Use {context} placeholder where the retrieved chunks should be inserted.'
                          )}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Textarea
                  value={config.contextTemplate}
                  onChange={(e) => handleConfigChange({ contextTemplate: e.target.value })}
                  placeholder="Based on the following knowledge base information:\n\n{context}\n\nPlease answer the user's question using this information when relevant."
                  rows={4}
                  className="text-sm"
                />
                {!config.contextTemplate.includes('{context}') && (
                  <div className="flex items-center gap-2 text-sm text-amber-600">
                    <AlertCircle className="w-4 h-4" />
                    {t('knowledge_base.config.context_placeholder_warning', 
                      'Template should include {context} placeholder'
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              {hasChanges && (
                <>
                  <AlertCircle className="w-4 h-4" />
                  {t('knowledge_base.config.unsaved_changes', 'You have unsaved changes')}
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={!hasChanges || saveMutation.isPending}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                {t('common.reset', 'Reset')}
              </Button>

              <Button
                onClick={handleSave}
                disabled={!hasChanges || saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                {t('common.save', 'Save')}
              </Button>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
