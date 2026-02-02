import React, { useState, useCallback, useEffect } from 'react';
import { Handle, Position } from 'reactflow';
import { useReactFlow } from 'reactflow';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useOpenRouterModels, type ProcessedModel } from '@/services/openrouter';
import { Trash2, Copy, Info, Settings, RefreshCw, Plus, ChevronDown, ChevronRight, GripVertical, Eye, EyeOff, Clock, Calendar as CalendarIcon, CheckCircle, AlertCircle, AlertTriangle, LogOut, ExternalLink, FileText, Upload, Folder, Key, Building, Shield, BookOpen, Search, Target, HelpCircle } from 'lucide-react';
import { OpenAIIcon } from '@/components/ui/openai-icon';
import { useFlowContext } from '../../pages/flow-builder';
import { useTranslation } from '@/hooks/use-translation';

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { TimezoneSelector, getBrowserTimezone } from "@/components/ui/TimezoneSelector";
import { standardHandleStyle } from './StyledHandle';
import { useGoogleCalendarAuth } from '@/hooks/useGoogleCalendarAuth';
import { useZohoCalendarAuth } from '@/hooks/useZohoCalendarAuth';
import { DocumentList } from "@/components/knowledge-base/DocumentList";
import { RAGConfiguration } from "@/components/knowledge-base/RAGConfiguration";
import { MCPServerConfig } from '@shared/types/mcp-types';
import { WeeklyScheduleEditor } from './WeeklyScheduleEditor';
import type { DaySchedule, CalendarAdvancedSettings } from '@shared/types/calendar-types';
import { DEFAULT_WEEKLY_SCHEDULE, createDefaultScheduleFromHours } from '@shared/types/calendar-types';

interface MCPServerCardProps {
  server: MCPServerConfig;
  onUpdate: (updates: Partial<MCPServerConfig>) => void;
  onRemove: () => void;
  parseServerJson: (name: string, jsonString: string) => { config: Partial<MCPServerConfig>; error: string | null };
  getServerJson: (server: MCPServerConfig) => string;
}

function MCPServerCard({ server, onUpdate, onRemove, parseServerJson, getServerJson }: MCPServerCardProps) {

  const defaultExampleJson = `{
  "mcpServers": {
    "mercadopago-mcp-server": {
      "url": "https://mcp.mercadopago.com/mcp",
      "headers": {
        "Authorization": "BEARER <ACCESS_TOKEN>"
      }
    }
  }
}`;


  const isNewServer = server.transport === 'stdio' && 
    server.command === 'npx' && 
    JSON.stringify(server.args) === JSON.stringify(['-y', '@modelcontextprotocol/server-example']);

  const [serverJson, setServerJson] = useState(() => {

    if (isNewServer) {
      return defaultExampleJson;
    }
    return getServerJson(server);
  });
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const isSavingRef = React.useRef(false);


  const serverConfigKey = `${server.transport}-${server.command}-${JSON.stringify(server.args)}-${JSON.stringify(server.env)}-${server.url}`;
  useEffect(() => {

    if (isSavingRef.current) {
      return;
    }
    

    if (isNewServer && serverJson === defaultExampleJson) {
      return;
    }
    

    if (!isFocused) {
      const newJson = getServerJson(server);
      const currentTrimmed = serverJson.trim();
      const newTrimmed = newJson.trim();
      

      if (currentTrimmed !== newTrimmed) {


        try {
          const currentParsed = parseServerJson(server.name, serverJson);
          

          if (!currentParsed.error) {
            const currentConfig = currentParsed.config;
            

            let serverConfigMatches = false;
            
            if (server.transport === 'stdio') {

              const commandMatches = !currentConfig.command || currentConfig.command === server.command;
              const argsMatches = !currentConfig.args || JSON.stringify(currentConfig.args) === JSON.stringify(server.args || []);
              const envMatches = !currentConfig.env || JSON.stringify(currentConfig.env) === JSON.stringify(server.env || {});
              serverConfigMatches = commandMatches && argsMatches && envMatches && (!currentConfig.url);
            } else if (server.transport === 'http') {

              const urlMatches = !currentConfig.url || currentConfig.url === server.url;
              serverConfigMatches = urlMatches && (!currentConfig.command);
            }
            

            if (serverConfigMatches) {
              return;
            }
          }
          

          setServerJson(newJson);
          setJsonError(null);
        } catch {

          setServerJson(newJson);
          setJsonError(null);
        }
      }
    }
  }, [serverConfigKey, getServerJson, server, isFocused, serverJson, parseServerJson, isNewServer, defaultExampleJson]);

  const handleBlur = () => {
    setIsFocused(false);

    const { config, error } = parseServerJson(server.name, serverJson);
    if (error) {
      setJsonError(error);
      isSavingRef.current = false;
    } else {
      setJsonError(null);

      isSavingRef.current = true;
      onUpdate(config);

      setTimeout(() => {
        isSavingRef.current = false;
      }, 300);
    }
  };

  return (
    <div className="border rounded-lg p-3 bg-card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex-1 mr-2">
          <Label className="text-[10px] font-medium text-foreground">Server Name</Label>
          <Input
            value={server.name || ''}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className="text-xs h-7 mt-1"
            placeholder="e.g., Bright Data"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={server.enabled}
            onCheckedChange={(enabled) => onUpdate({ enabled })}
            className="scale-75"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div>
        <Label className="text-[10px] font-medium text-foreground mb-1 block">
          Server Configuration (JSON)
        </Label>
        <Textarea
          value={serverJson}
          onChange={(e) => {
            const value = e.target.value;
            setServerJson(value);

            const { error } = parseServerJson(server.name, value);
            if (error) {
              setJsonError(error);
            } else {
              setJsonError(null);
            }
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          className={`text-xs font-mono min-h-[120px] resize-y ${jsonError ? 'border-destructive' : ''}`}
          placeholder={`{\n  "command": "npx",\n  "args": ["@brightdata/mcp"],\n  "env": {\n    "API_TOKEN": "your-token-here"\n  }\n}`}
        />
        {jsonError && (
          <div className="flex items-start gap-2 mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded text-[10px] text-red-800 dark:text-red-400">
            <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <span>{jsonError}</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface Provider {
  id: string;
  name: string;
  models: { id: string; name: string; supportsTools?: boolean }[];
}


/** OpenAI chat models with function calling support (from OpenAI API docs) */
const OPENAI_MODELS = [
  { id: 'gpt-5.2', name: 'GPT-5.2', supportsTools: true },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini', supportsTools: true },
  { id: 'gpt-5-nano', name: 'GPT-5 Nano', supportsTools: true },
  { id: 'gpt-5.2-pro', name: 'GPT-5.2 Pro', supportsTools: true },
  { id: 'gpt-5', name: 'GPT-5', supportsTools: true },
  { id: 'gpt-4.1', name: 'GPT-4.1', supportsTools: true },
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', supportsTools: true },
  { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', supportsTools: true },
  { id: 'gpt-4o', name: 'GPT-4o', supportsTools: true },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', supportsTools: true },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', supportsTools: true },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', supportsTools: true }
];

/** OpenRouter fallback when /api/openrouter/models is unavailable; tool-capable models from OpenRouter docs */
const FALLBACK_OPENROUTER_MODELS = [
  { id: 'openai/gpt-5.2', name: 'GPT-5.2 (via OpenRouter)', supportsTools: true },
  { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini (via OpenRouter)', supportsTools: true },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (via OpenRouter)', supportsTools: true },
  { id: 'openai/gpt-4o', name: 'GPT-4o (via OpenRouter)', supportsTools: true },
  { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo (via OpenRouter)', supportsTools: true },
  { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B (OpenAI)', supportsTools: true },
  { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', supportsTools: true },
  { id: 'anthropic/claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', supportsTools: true },
  { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', supportsTools: true },
  { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', supportsTools: true },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', supportsTools: true },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', supportsTools: true },
  { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', supportsTools: true },
  { id: 'thudm/glm-4-32b', name: 'GLM-4 32B', supportsTools: true },
  { id: '01-ai/yi-large-fc', name: 'Yi Large FC', supportsTools: true },
  { id: 'mistralai/mistral-nemo', name: 'Mistral Nemo 12B', supportsTools: true },
  { id: 'cognitivecomputations/dolphin-llama-3-70b', name: 'Dolphin Llama 3 70B', supportsTools: true },
  { id: 'cohere/command-r-plus', name: 'Command R+', supportsTools: true },
  { id: 'xai/grok-4', name: 'Grok 4 (xAI)', supportsTools: true },
  { id: 'xai/grok-3', name: 'Grok 3 (xAI)', supportsTools: true },
  { id: 'xai/grok-2', name: 'Grok 2 (xAI)', supportsTools: true },
  { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', supportsTools: true },
  { id: 'meta-llama/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', supportsTools: false }
];

/**
 * Hook to get AI providers with dynamic OpenRouter models
 */
function useAIProviders(): { providers: Provider[]; isLoading: boolean; error: Error | null } {
  const openRouterQuery = useQuery(useOpenRouterModels());

  const providers: Provider[] = [
    {
      id: 'openai',
      name: 'OpenAI',
      models: OPENAI_MODELS
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      models: openRouterQuery.data
        ? openRouterQuery.data.map(model => ({
            id: model.id,
            name: model.name,
            supportsTools: model.supportsTools
          }))
        : FALLBACK_OPENROUTER_MODELS
    }
  ];

  return {
    providers,
    isLoading: openRouterQuery.isLoading,
    error: openRouterQuery.error as Error | null
  };
}


interface TaskConfigurationCardProps {
  task: TaskDefinition;
  index: number;
  onUpdate: (updates: Partial<TaskDefinition>) => void;
  onRemove: () => void;
  t: (key: string, fallback?: string) => string;
}

function TaskConfigurationCard({ task, index, onUpdate, onRemove, t }: TaskConfigurationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={`group border rounded-lg p-3 transition-all duration-200 ${
      task.enabled
        ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-900/10 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
        : 'border-border bg-muted/50 hover:bg-muted'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="h-3 w-3 text-muted-foreground cursor-grab" />
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <span className="text-xs font-medium leading-tight break-words">
                {task.name || `Task ${index + 1}`}
              </span>
              <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${
                task.enabled
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {task.enabled ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
                {task.enabled ? t('flow_builder.ai_task_active', 'Active') : t('flow_builder.ai_task_inactive', 'Inactive')}
              </div>
            </div>
            {task.description && (
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight break-words">
                {task.description.split(' ').slice(0, 12).join(' ')}
                {task.description.split(' ').length > 12 ? '...' : ''}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <Switch
            checked={task.enabled}
            onCheckedChange={(enabled) => onUpdate({ enabled })}
            className="scale-75"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-6 w-6 p-0 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 space-y-3 pl-4 border-l-2 border-emerald-200">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.ai_task_name_label', 'Task Name')}</Label>
              <Input
                value={task.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                className="text-xs h-7 mt-1"
                placeholder={t('flow_builder.ai_task_name_placeholder', 'e.g., Share Product Brochure')}
              />
            </div>
            <div>
              <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.ai_function_name_label', 'Function Name')}</Label>
              <Input
                value={task.functionDefinition.name}
                onChange={(e) => {
                  const value = e.target.value;

                  onUpdate({
                    functionDefinition: {
                      ...task.functionDefinition,
                      name: value
                    }
                  });
                }}
                className={`text-xs h-7 mt-1 ${
                  task.functionDefinition.name && !/^[a-z_]+$/.test(task.functionDefinition.name)
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    : ''
                }`}
                placeholder={t('flow_builder.ai_function_name_placeholder', 'e.g., share_document')}
              />
              {task.functionDefinition.name && !/^[a-z_]+$/.test(task.functionDefinition.name) && (
                <p className="text-[9px] text-red-600 mt-1">
                  {t('flow_builder.ai_function_name_validation', 'Function name must only contain lowercase letters and underscores (e.g., function_one, share_document)')}
                </p>
              )}
              <p className="text-[9px] text-muted-foreground mt-1">
              </p>
            </div>
          </div>

          <div>
            <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.ai_task_description_label', 'Task Description')}</Label>
            <Textarea
              value={task.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              className="text-xs min-h-[63px] resize-none mt-1"
              placeholder={t('flow_builder.ai_task_description_placeholder', 'Describe what this task does and when it should be triggered')}
            />
          </div>

          <div>
            <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.ai_function_description_label', 'AI Function Description')}</Label>
            <Textarea
              value={task.functionDefinition.description}
              onChange={(e) => onUpdate({
                functionDefinition: {
                  ...task.functionDefinition,
                  description: e.target.value
                }
              })}
              className="text-xs min-h-[120px] resize-none mt-1"
              placeholder={t('flow_builder.ai_function_description_placeholder', 'Detailed instructions for the AI model about when to call this function. Be specific about user intent requirements.')}
            />
            <p className="text-[9px] text-muted-foreground mt-1">
              {t('flow_builder.ai_function_description_tip', '💡 Tip: Use phrases like "ONLY call when user explicitly requests..." to prevent false triggers')}
            </p>
          </div>

          <div>
            <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.ai_output_handle_label', 'Output Handle ID')}</Label>
            <Input
              value={task.outputHandle}
              onChange={(e) => onUpdate({ outputHandle: e.target.value })}
              className="text-xs h-7 mt-1"
              placeholder={t('flow_builder.ai_output_handle_placeholder', 'e.g., task_brochure')}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface TaskDefinition {
  id: string;
  name: string;
  description: string;
  functionDefinition: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, any>;
      required: string[];
    };
  };
  outputHandle: string;
  enabled: boolean;
}

interface AIAssistantNodeProps {
  id: string;
  data: {
    label: string;
    provider?: string;
    model?: string;
    apiKey?: string;
    credentialSource?: 'manual' | 'company' | 'system' | 'auto';
    prompt?: string;
    language?: string;
    enableHistory?: boolean;
    historyLimit?: number;
    enableTextToSpeech?: boolean;
    ttsProvider?: string;
    ttsVoice?: string;
    voiceResponseMode?: string;
    maxAudioDuration?: number;
    enableSessionTakeover?: boolean;
    stopKeyword?: string;
    exitOutputHandle?: string;
    enableTaskExecution?: boolean;
    tasks?: TaskDefinition[];


    timezone?: string;


    knowledgeBaseEnabled?: boolean;
    knowledgeBaseConfig?: {
      maxRetrievedChunks?: number;
      similarityThreshold?: number;
      contextPosition?: 'before_system' | 'after_system' | 'before_user';
      contextTemplate?: string;
    };

    enableMCPServers?: boolean;
    mcpServers?: MCPServerConfig[];

    pineconeApiKey?: string;
    pineconeEnvironment?: string;
    pineconeIndexName?: string;

    elevenLabsApiKey?: string;
    elevenLabsVoiceId?: string;
    elevenLabsCustomVoiceId?: string;
    elevenLabsModel?: string;
    elevenLabsStability?: number;
    elevenLabsSimilarityBoost?: number;
    elevenLabsStyle?: number;
    elevenLabsUseSpeakerBoost?: boolean;
    onDeleteNode?: (id: string) => void;
    onDuplicateNode?: (id: string) => void;
  };
  isConnectable: boolean;
}

export function AIAssistantNode({ id, data, isConnectable }: AIAssistantNodeProps) {
  const { t } = useTranslation();
  const { providers: AI_PROVIDERS, isLoading: isLoadingModels, error: modelsError } = useAIProviders();
  const [isEditing, setIsEditing] = useState(false);
  const [provider, setProvider] = useState(data.provider || 'openai');
  const [model, setModel] = useState(data.model || 'gpt-4o-mini');
  const [apiKey, setApiKey] = useState(data.apiKey || '');
  const [credentialSource, setCredentialSource] = useState(data.credentialSource || 'auto');
  const [language, setLanguage] = useState(data.language || 'en');
  const [prompt, setPrompt] = useState(data.prompt || t('flow_builder.ai_default_system_prompt', 'You are a helpful assistant. Answer user questions concisely and accurately. Only perform specific actions when the user explicitly requests them.'));
  const [enableHistory, setEnableHistory] = useState(data.enableHistory !== undefined ? data.enableHistory : true);
  const [historyLimit, setHistoryLimit] = useState(data.historyLimit || 5);


  const [enableTextToSpeech, setEnableTextToSpeech] = useState(data.enableTextToSpeech || false);
  const [ttsProvider, setTtsProvider] = useState(data.ttsProvider || 'openai');
  const [ttsVoice, setTtsVoice] = useState(data.ttsVoice || 'alloy');
  const [voiceResponseMode, setVoiceResponseMode] = useState(data.voiceResponseMode || 'always');
  const [maxAudioDuration, setMaxAudioDuration] = useState(data.maxAudioDuration || 30);


  const [elevenLabsApiKey, setElevenLabsApiKey] = useState(data.elevenLabsApiKey || '');
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState(data.elevenLabsVoiceId || 'pNInz6obpgDQGcFmaJgB');
  const [elevenLabsCustomVoiceId, setElevenLabsCustomVoiceId] = useState(data.elevenLabsCustomVoiceId || '');
  const [elevenLabsModel, setElevenLabsModel] = useState(data.elevenLabsModel || 'eleven_monolingual_v1');
  const [elevenLabsStability, setElevenLabsStability] = useState(data.elevenLabsStability ?? 0.5);
  const [elevenLabsSimilarityBoost, setElevenLabsSimilarityBoost] = useState(data.elevenLabsSimilarityBoost ?? 0.75);
  const [elevenLabsStyle, setElevenLabsStyle] = useState(data.elevenLabsStyle ?? 0.0);
  const [elevenLabsUseSpeakerBoost, setElevenLabsUseSpeakerBoost] = useState(data.elevenLabsUseSpeakerBoost ?? true);

  const [enableSessionTakeover, setEnableSessionTakeover] = useState(data.enableSessionTakeover !== undefined ? data.enableSessionTakeover : true);
  const [stopKeyword, setStopKeyword] = useState(data.stopKeyword || 'stop');
  const [exitOutputHandle, setExitOutputHandle] = useState(data.exitOutputHandle || 'ai-stopped');
  const [enableTaskExecution, setEnableTaskExecution] = useState(data.enableTaskExecution || false);
  const [tasks, setTasks] = useState<TaskDefinition[]>(data.tasks || []);
  const [handleKey, setHandleKey] = useState(0); // Force re-render of handles
  const [isAddingTask, setIsAddingTask] = useState(false); // Prevent rapid clicking


  const [knowledgeBaseEnabled, setKnowledgeBaseEnabled] = useState(data.knowledgeBaseEnabled === true); // Default disabled
  const [knowledgeBaseConfig, setKnowledgeBaseConfig] = useState({
    maxRetrievedChunks: data.knowledgeBaseConfig?.maxRetrievedChunks || 3,
    similarityThreshold: data.knowledgeBaseConfig?.similarityThreshold || 0.7,
    contextPosition: data.knowledgeBaseConfig?.contextPosition || 'before_system' as const,
    contextTemplate: data.knowledgeBaseConfig?.contextTemplate || 'Based on the following knowledge base information:\n\n{context}\n\nPlease answer the user\'s question using this information when relevant.'
  });


  const [pineconeApiKey, setPineconeApiKey] = useState((data as any).pineconeApiKey || '');
  const [pineconeEnvironment, setPineconeEnvironment] = useState((data as any).pineconeEnvironment || 'us-east-1');
  const [pineconeIndexName, setPineconeIndexName] = useState((data as any).pineconeIndexName || '');
  const [showPineconeApiKey, setShowPineconeApiKey] = useState(false);

  const [enableMCPServers, setEnableMCPServers] = useState((data as any).enableMCPServers || false);
  const [mcpServers, setMcpServers] = useState<MCPServerConfig[]>(() => {
    const servers = (data as any).mcpServers || [];

    return servers.map((server: MCPServerConfig) => ({
      ...server,
      id: server.id || `mcp_${Date.now()}_${Math.floor(Math.random() * 10000)}`
    }));
  });


  const [enableGoogleCalendar, setEnableGoogleCalendar] = useState((data as any).enableGoogleCalendar || false);
  const [calendarBusinessHours, setCalendarBusinessHours] = useState((data as any).calendarBusinessHours || { start: '09:00', end: '17:00' });
  const [calendarDefaultDuration, setCalendarDefaultDuration] = useState((data as any).calendarDefaultDuration || 60);
  const [calendarBufferMinutes, setCalendarBufferMinutes] = useState((data as any).calendarBufferMinutes || 0);
  const [calendarTimeZone, setCalendarTimeZone] = useState((data as any).calendarTimeZone || getBrowserTimezone());
  

  const [calendarAdvancedMode, setCalendarAdvancedMode] = useState((data as any).calendarAdvancedMode !== undefined ? (data as any).calendarAdvancedMode : true);
  const [calendarWeeklySchedule, setCalendarWeeklySchedule] = useState<DaySchedule[]>(() => {
    if ((data as any).calendarAdvancedSettings?.weeklySchedule) {
      const loadedSchedule = (data as any).calendarAdvancedSettings.weeklySchedule;
      const loadedOffDays = (data as any).calendarAdvancedSettings?.offDays || [];

      return loadedSchedule.map((day: DaySchedule) => ({
        ...day,
        enabled: loadedOffDays.includes(day.dayIndex) ? false : day.enabled
      }));
    }
    return createDefaultScheduleFromHours(calendarBusinessHours.start, calendarBusinessHours.end);
  });
  const [calendarOffDays, setCalendarOffDays] = useState<number[]>(() => {
    if ((data as any).calendarAdvancedSettings?.offDays) {
      return (data as any).calendarAdvancedSettings.offDays;
    }
    return [0, 6]; // Default: Sunday and Saturday off
  });


  const [enableZohoCalendar, setEnableZohoCalendar] = useState((data as any).enableZohoCalendar || false);
  const [zohoCalendarBusinessHours, setZohoCalendarBusinessHours] = useState((data as any).zohoCalendarBusinessHours || { start: '09:00', end: '17:00' });
  const [zohoCalendarDefaultDuration, setZohoCalendarDefaultDuration] = useState((data as any).zohoCalendarDefaultDuration || 60);
  const [zohoCalendarTimeZone, setZohoCalendarTimeZone] = useState((data as any).zohoCalendarTimeZone || getBrowserTimezone());
  

  const [zohoCalendarAdvancedMode, setZohoCalendarAdvancedMode] = useState((data as any).zohoCalendarAdvancedMode !== undefined ? (data as any).zohoCalendarAdvancedMode : true);
  const [zohoCalendarWeeklySchedule, setZohoCalendarWeeklySchedule] = useState<DaySchedule[]>(() => {
    if ((data as any).zohoCalendarAdvancedSettings?.weeklySchedule) {
      const loadedSchedule = (data as any).zohoCalendarAdvancedSettings.weeklySchedule;
      const loadedOffDays = (data as any).zohoCalendarAdvancedSettings?.offDays || [];

      return loadedSchedule.map((day: DaySchedule) => ({
        ...day,
        enabled: loadedOffDays.includes(day.dayIndex) ? false : day.enabled
      }));
    }
    return createDefaultScheduleFromHours(zohoCalendarBusinessHours.start, zohoCalendarBusinessHours.end);
  });
  const [zohoCalendarOffDays, setZohoCalendarOffDays] = useState<number[]>(() => {
    if ((data as any).zohoCalendarAdvancedSettings?.offDays) {
      return (data as any).zohoCalendarAdvancedSettings.offDays;
    }
    return [0, 6]; // Default: Sunday and Saturday off
  });



  const { setNodes } = useReactFlow();
  const { onDeleteNode } = useFlowContext();


  const {
    isConnected: isGoogleCalendarConnected,
    isLoadingStatus: isLoadingGoogleCalendarStatus,
    isAuthenticating: isGoogleCalendarAuthenticating,
    authenticate: authenticateGoogleCalendar,
    disconnect: disconnectGoogleCalendar,
    refetchStatus: refetchGoogleCalendarStatus
  } = useGoogleCalendarAuth();


  const {
    isConnected: isZohoCalendarConnected,
    isLoadingStatus: isLoadingZohoCalendarStatus,
    isAuthenticating: isZohoCalendarAuthenticating,
    authenticate: authenticateZohoCalendar,
    disconnect: disconnectZohoCalendar,
    refetchStatus: refetchZohoCalendarStatus
  } = useZohoCalendarAuth();


  const { data: companyCredentials } = useQuery({
    queryKey: ['company-ai-credentials'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/company/ai-credentials');
        const result = await response.json();
        return result.data || [];
      } catch (error) {
        console.error('Failed to fetch company AI credentials:', error);
        return [];
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: aiPreferences } = useQuery({
    queryKey: ['company-ai-preferences'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/company/ai-credentials/preferences');
        const result = await response.json();
        return result.data || { credentialPreference: 'auto', fallbackEnabled: true };
      } catch (error) {
        console.error('Failed to fetch AI preferences:', error);
        return { credentialPreference: 'auto', fallbackEnabled: true };
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: availableLanguages } = useQuery({
    queryKey: ['available-languages'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/languages');
        const result = await response.json();
        return result || [];
      } catch (error) {
        console.error('Failed to fetch languages:', error);
        return [];
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });



  const isUpdatingRef = React.useRef(false);

  useEffect(() => {

    if (isUpdatingRef.current) return;

    if (data.provider !== undefined && data.provider !== provider) setProvider(data.provider);
    if (data.model !== undefined && data.model !== model) setModel(data.model);
    if (data.apiKey !== undefined && data.apiKey !== apiKey) setApiKey(data.apiKey);
    if (data.credentialSource !== undefined && data.credentialSource !== credentialSource) setCredentialSource(data.credentialSource);
    if (data.language !== undefined && data.language !== language) setLanguage(data.language);
    if (data.prompt !== undefined && data.prompt !== prompt) setPrompt(data.prompt);
    if (data.enableHistory !== undefined) setEnableHistory(data.enableHistory);
    if (data.historyLimit !== undefined) setHistoryLimit(data.historyLimit);
    if (data.enableTextToSpeech !== undefined) setEnableTextToSpeech(data.enableTextToSpeech);
    if (data.ttsProvider !== undefined) setTtsProvider(data.ttsProvider);
    if (data.ttsVoice !== undefined) setTtsVoice(data.ttsVoice);
    if (data.voiceResponseMode !== undefined) setVoiceResponseMode(data.voiceResponseMode);
    if (data.maxAudioDuration !== undefined) setMaxAudioDuration(data.maxAudioDuration);
    if (data.enableSessionTakeover !== undefined) setEnableSessionTakeover(data.enableSessionTakeover);
    if (data.stopKeyword !== undefined) setStopKeyword(data.stopKeyword);
    if (data.exitOutputHandle !== undefined) setExitOutputHandle(data.exitOutputHandle);
    if (data.enableTaskExecution !== undefined) setEnableTaskExecution(data.enableTaskExecution);
    if (data.tasks !== undefined) setTasks(data.tasks);
    if ((data as any).enableGoogleCalendar !== undefined) setEnableGoogleCalendar((data as any).enableGoogleCalendar);
    if ((data as any).calendarBusinessHours !== undefined) setCalendarBusinessHours((data as any).calendarBusinessHours);
    if ((data as any).calendarDefaultDuration !== undefined) setCalendarDefaultDuration((data as any).calendarDefaultDuration);
    if ((data as any).calendarBufferMinutes !== undefined) setCalendarBufferMinutes((data as any).calendarBufferMinutes);
    if ((data as any).calendarTimeZone !== undefined) setCalendarTimeZone((data as any).calendarTimeZone);
    if ((data as any).calendarAdvancedMode !== undefined) {
      setCalendarAdvancedMode((data as any).calendarAdvancedMode);
    } else {

      setCalendarAdvancedMode(true);
    }
    if ((data as any).calendarAdvancedSettings?.weeklySchedule) {
      setCalendarWeeklySchedule((data as any).calendarAdvancedSettings.weeklySchedule);
    }
    if ((data as any).calendarAdvancedSettings?.offDays) {
      setCalendarOffDays((data as any).calendarAdvancedSettings.offDays);
    }


    if ((data as any).enableZohoCalendar !== undefined) setEnableZohoCalendar((data as any).enableZohoCalendar);
    if ((data as any).zohoCalendarBusinessHours !== undefined) setZohoCalendarBusinessHours((data as any).zohoCalendarBusinessHours);
    if ((data as any).zohoCalendarDefaultDuration !== undefined) setZohoCalendarDefaultDuration((data as any).zohoCalendarDefaultDuration);
    if ((data as any).zohoCalendarTimeZone !== undefined) setZohoCalendarTimeZone((data as any).zohoCalendarTimeZone);
    if ((data as any).zohoCalendarAdvancedMode !== undefined) {
      setZohoCalendarAdvancedMode((data as any).zohoCalendarAdvancedMode);
    } else {

      setZohoCalendarAdvancedMode(true);
    }
    if ((data as any).zohoCalendarAdvancedSettings?.weeklySchedule) {
      setZohoCalendarWeeklySchedule((data as any).zohoCalendarAdvancedSettings.weeklySchedule);
    }
    if ((data as any).zohoCalendarAdvancedSettings?.offDays) {
      setZohoCalendarOffDays((data as any).zohoCalendarAdvancedSettings.offDays);
    }
    if (data.elevenLabsApiKey !== undefined) setElevenLabsApiKey(data.elevenLabsApiKey);
    if (data.elevenLabsVoiceId !== undefined) setElevenLabsVoiceId(data.elevenLabsVoiceId);
    if (data.elevenLabsCustomVoiceId !== undefined) setElevenLabsCustomVoiceId(data.elevenLabsCustomVoiceId);
    if (data.elevenLabsModel !== undefined) setElevenLabsModel(data.elevenLabsModel);
    if (data.elevenLabsStability !== undefined) setElevenLabsStability(data.elevenLabsStability);
    if (data.elevenLabsSimilarityBoost !== undefined) setElevenLabsSimilarityBoost(data.elevenLabsSimilarityBoost);
    if (data.elevenLabsStyle !== undefined) setElevenLabsStyle(data.elevenLabsStyle);
    if (data.elevenLabsUseSpeakerBoost !== undefined) setElevenLabsUseSpeakerBoost(data.elevenLabsUseSpeakerBoost);
    if ((data as any).pineconeApiKey !== undefined) setPineconeApiKey((data as any).pineconeApiKey);
    if ((data as any).pineconeEnvironment !== undefined) setPineconeEnvironment((data as any).pineconeEnvironment);
    if ((data as any).pineconeIndexName !== undefined) setPineconeIndexName((data as any).pineconeIndexName);
    if ((data as any).enableMCPServers !== undefined) setEnableMCPServers((data as any).enableMCPServers);
    if ((data as any).mcpServers !== undefined) {
      const servers = (data as any).mcpServers || [];

      const serversWithIds = servers.map((server: MCPServerConfig) => ({
        ...server,
        id: server.id || `mcp_${Date.now()}_${Math.floor(Math.random() * 10000)}`
      }));
      setMcpServers(serversWithIds);
    }
  }, [data]);


  useEffect(() => {
    const currentDefaultPrompt = t('flow_builder.ai_default_system_prompt', 'You are a helpful assistant. Answer user questions concisely and accurately. Only perform specific actions when the user explicitly requests them.');

    const enDefault = 'You are a helpful assistant. Answer user questions concisely and accurately. Only perform specific actions when the user explicitly requests them.';
    const esDefault = 'Eres un asistente útil. Responde las preguntas de los usuarios de manera concisa y precisa. Solo realiza acciones específicas cuando el usuario las solicite explícitamente.';
    const arDefault = 'أنت مساعد مفيد. أجب على أسئلة المستخدمين بإيجاز ودقة. قم فقط بإجراءات محددة عندما يطلبها المستخدم صراحة.';
    
    if (prompt === enDefault || prompt === esDefault || prompt === arDefault || prompt === currentDefaultPrompt) {
      const newDefaultPrompt = t('flow_builder.ai_default_system_prompt', 'You are a helpful assistant. Answer user questions concisely and accurately. Only perform specific actions when the user explicitly requests them.');
      if (newDefaultPrompt !== prompt) {
        setPrompt(newDefaultPrompt);
      }
    }
  }, [language, t]);

  const TTS_PROVIDERS = [
    { id: 'openai', name: t('flow_builder.ai_tts_openai_name', 'OpenAI'), description: t('flow_builder.ai_tts_openai_description', 'OpenAI TTS with Whisper STT') },
    { id: 'elevenlabs', name: t('flow_builder.ai_tts_elevenlabs_name', 'ElevenLabs'), description: t('flow_builder.ai_tts_elevenlabs_description', 'ElevenLabs TTS with OpenAI Whisper STT') }
  ];


  const OPENAI_TTS_VOICES = [
    { id: 'alloy', name: 'Alloy (Neutral)' },
    { id: 'echo', name: 'Echo (Male)' },
    { id: 'fable', name: 'Fable (British Male)' },
    { id: 'onyx', name: 'Onyx (Deep Male)' },
    { id: 'nova', name: 'Nova (Female)' },
    { id: 'shimmer', name: 'Shimmer (Soft Female)' }
  ];


  const ELEVENLABS_VOICES = [
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Deep Male)' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (Warm Female)' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold (Strong Male)' },
    { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli (Young Female)' },
    { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh (Casual Male)' },
    { id: 'jsCqWAovK2LkecY7zXl4', name: 'Freya (Professional Female)' },
    { id: 'custom', name: '🎯 Custom Voice ID' }
  ];


  const ELEVENLABS_MODELS = [
    { id: 'eleven_monolingual_v1', name: 'Monolingual v1 (English)' },
    { id: 'eleven_multilingual_v1', name: 'Multilingual v1' },
    { id: 'eleven_multilingual_v2', name: 'Multilingual v2 (Latest)' }
  ];


  const VOICE_RESPONSE_MODES = [
    {
      id: 'always',
      name: t('flow_builder.ai_voice_mode_always', 'Always'),
      description: t('flow_builder.ai_voice_mode_always_description', 'Generate voice responses for all messages (text and voice)')
    },
    {
      id: 'voice_only',
      name: t('flow_builder.ai_voice_mode_voice_only', 'Voice-to-Voice Only'),
      description: t('flow_builder.ai_voice_only_description', 'Only generate voice responses when user sends a voice message')
    },
    {
      id: 'never',
      name: t('flow_builder.ai_voice_mode_never', 'Never'),
      description: t('flow_builder.ai_voice_mode_never_description', 'Disable voice responses (text only)')
    }
  ];


  const addTask = useCallback(() => {
    if (isAddingTask) {
      return;
    }

    setIsAddingTask(true);


    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 10000);
    const taskId = `task_${timestamp}_${randomSuffix}`;

    const newTask: TaskDefinition = {
      id: taskId,
      name: 'Share Document',
      description: t('flow_builder.ai_share_document_task_description', 'When user requests a document, brochure, or file to be shared'),
      functionDefinition: {
        name: 'share_document',
        description: t('flow_builder.ai_share_document_desc', 'Share a document or file with the user when they request it'),
        parameters: {
          type: 'object',
          properties: {
            document_type: {
              type: 'string',
              description: t('flow_builder.ai_function_param_document_type', 'Type of document requested (brochure, manual, catalog, etc.)')
            },
            user_request: {
              type: 'string',
              description: t('flow_builder.ai_function_param_user_request', 'The user\'s original request for the document')
            }
          },
          required: ['document_type', 'user_request']
        }
      },
      outputHandle: taskId,
      enabled: true
    };


    setTasks(prevTasks => [...prevTasks, newTask]);


    setTimeout(() => {
      setHandleKey(prev => prev + 1);
      setIsAddingTask(false);
    }, 100);
  }, [isAddingTask]);

  const updateTask = useCallback((taskId: string, updates: Partial<TaskDefinition>) => {
    setTasks(prevTasks => {
      const updatedTasks = prevTasks.map(task =>
        task.id === taskId ? { ...task, ...updates } : task
      );


      if (updates.enabled !== undefined || updates.outputHandle !== undefined) {
        setTimeout(() => {
          setHandleKey(prev => prev + 1);
        }, 100);
      }

      return updatedTasks;
    });
  }, []);

  const removeTask = useCallback((taskId: string) => {
    setTasks(prevTasks => {
      const updatedTasks = prevTasks.filter(task => task.id !== taskId);



      setTimeout(() => {
        setHandleKey(prev => prev + 1);
      }, 100);
      return updatedTasks;
    });
  }, []);

  const parseServerJson = useCallback((name: string, jsonString: string): { config: Partial<MCPServerConfig>; error: string | null } => {
    try {
      const parsed = JSON.parse(jsonString);
      
      if (typeof parsed !== 'object' || parsed === null) {
        return { config: {}, error: 'JSON must be an object' };
      }

      let configObj = parsed;
      let extractedName: string | undefined = undefined;

      if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {

        const serverNames = Object.keys(parsed.mcpServers);
        if (serverNames.length > 0) {
          const firstServerName = serverNames[0];
          configObj = parsed.mcpServers[firstServerName];
          extractedName = firstServerName;
        }
      }

      const config: Partial<MCPServerConfig> = {};


      if (extractedName && extractedName !== name) {
        config.name = extractedName;
      }


      if (configObj.url) {
        config.transport = 'http';
        config.url = configObj.url;
      } else if (configObj.command) {
        config.transport = 'stdio';
        config.command = configObj.command;
        if (configObj.args) {
          config.args = Array.isArray(configObj.args) ? configObj.args : [];
        }
        if (configObj.env) {
          config.env = configObj.env;
        }
      } else {
        return { config: {}, error: 'Must have either "command" (stdio) or "url" (http)' };
      }

      return { config, error: null };
    } catch (error: any) {
      return { config: {}, error: `Invalid JSON: ${error.message}` };
    }
  }, []);

  const addMCPServer = useCallback(() => {
    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 10000);
    const serverId = `mcp_${timestamp}_${randomSuffix}`;

    const newServer: MCPServerConfig = {
      id: serverId,
      name: `MCP Server ${mcpServers.length + 1}`,
      enabled: true,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-example'],
      env: {},
      timeout: 30000
    };

    setMcpServers(prevServers => [...prevServers, newServer]);
  }, [mcpServers.length]);

  const updateMCPServer = useCallback((serverId: string, updates: Partial<MCPServerConfig>) => {
    setMcpServers(prevServers => {
      return prevServers.map(server =>
        server.id === serverId ? { ...server, ...updates } : server
      );
    });
  }, []);

  const updateServerJson = useCallback((serverId: string, jsonString: string) => {
    const server = mcpServers.find(s => s.id === serverId);
    if (!server) return;

    const { config, error } = parseServerJson(server.name, jsonString);
    if (error) {

      return;
    }

    updateMCPServer(serverId, config);
  }, [mcpServers, parseServerJson, updateMCPServer]);

  const getServerJson = useCallback((server: MCPServerConfig): string => {
    const config: any = {};
    if (server.transport === 'stdio') {
      if (server.command) config.command = server.command;
      if (server.args && server.args.length > 0) config.args = server.args;
      if (server.env && Object.keys(server.env).length > 0) config.env = server.env;
    } else if (server.transport === 'http') {
      if (server.url) config.url = server.url;
    }
    return JSON.stringify(config, null, 2);
  }, []);

  const removeMCPServer = useCallback((serverId: string) => {
    setMcpServers(prevServers => prevServers.filter(server => server.id !== serverId));
  }, []);


  const getCalendarFunctions = useCallback(() => {
    if (!enableGoogleCalendar || !isGoogleCalendarConnected) return [];

    return [
      {
        id: `calendar_book_appointment_${Date.now()}`,
        name: t('flow_builder.ai_book_appointment_name', 'Book Appointment'),
        description: t('flow_builder.ai_book_appointment_desc', 'Book a new appointment in Google Calendar'),
        functionDefinition: {
          name: 'book_appointment',
          description: t('flow_builder.ai_function_book_appointment', 'Create a new calendar event/appointment in Google Calendar. Use this when the user wants to schedule a meeting or appointment. The system automatically prevents double bookings by checking for conflicts against confirmed bookings (with buffer time) and Google Calendar busy times. If a slot becomes unavailable, the system will return a user-friendly error message. Buffer time is automatically applied to prevent back-to-back bookings. Times must be provided in ISO format (YYYY-MM-DDTHH:MM:SS) or clearly specify timezone. If timezone is not specified, the node\'s configured timezone will be used.'),
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: t('flow_builder.ai_function_param_title', 'Title/summary of the appointment')
              },
              description: {
                type: 'string',
                description: t('flow_builder.ai_function_param_description', 'Detailed description of the appointment')
              },
              start_datetime: {
                type: 'string',
                description: t('flow_builder.ai_function_param_start_datetime', 'Start date and time in ISO format (YYYY-MM-DDTHH:MM:SS)')
              },
              end_datetime: {
                type: 'string',
                description: t('flow_builder.ai_function_param_end_datetime', 'End date and time in ISO format (YYYY-MM-DDTHH:MM:SS)')
              },
              time_zone: {
                type: 'string',
                description: 'Timezone for the event (e.g., America/New_York, UTC, Asia/Karachi). If not specified, the node\'s configured timezone will be used. Common aliases like PST, EST, PKT are supported.'
              },
              attendees: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    email: { type: 'string', description: 'Attendee email address' },
                    displayName: { type: 'string', description: 'Attendee display name (optional)' }
                  },
                  required: ['email']
                },
                description: 'Array of attendee objects with email and optional displayName (optional)'
              },
              attendee_emails: {
                type: 'array',
                items: { type: 'string' },
                description: t('flow_builder.ai_function_param_attendee_emails', 'Email addresses of attendees (optional, legacy format)')
              },
              location: {
                type: 'string',
                description: t('flow_builder.ai_function_param_location', 'Location of the appointment (optional)')
              },
              send_updates: {
                type: 'boolean',
                description: 'Whether to send email notifications to attendees. Defaults to true.',
                default: true
              },
              organizer_email: {
                type: 'string',
                description: 'Email of the event organizer (optional, defaults to calendar owner)'
              }
            },
            required: ['title', 'start_datetime', 'end_datetime']
          }
        },
        outputHandle: `calendar_book_${Date.now()}`,
        enabled: true
      },
      {
        id: `calendar_check_availability_${Date.now()}`,
        name: 'Check Availability',
        description: 'Check available time slots in Google Calendar',
        functionDefinition: {
          name: 'check_availability',
          description: 'Check available time slots in Google Calendar for scheduling appointments. Use this to find free time slots before booking. Slots are shown in the configured timezone (or node\'s timezone if not specified) and are checked against existing bookings in real-time. Availability is checked in real-time and may change before booking, so users should book immediately after receiving available slots.',
          parameters: {
            type: 'object',
            properties: {
              date: {
                type: 'string',
                description: 'Date to check availability for (YYYY-MM-DD format)'
              },
              duration_minutes: {
                type: 'number',
                description: 'Duration of the appointment in minutes',
                default: calendarDefaultDuration
              },
              start_time: {
                type: 'string',
                description: 'Earliest time to consider (HH:MM format, optional)',
                default: calendarBusinessHours.start
              },
              end_time: {
                type: 'string',
                description: 'Latest time to consider (HH:MM format, optional)',
                default: calendarBusinessHours.end
              }
            },
            required: ['date']
          }
        },
        outputHandle: `calendar_availability_${Date.now()}`,
        enabled: true
      },
      {
        id: `calendar_list_events_${Date.now()}`,
        name: 'List Events',
        description: 'List existing events from Google Calendar',
        functionDefinition: {
          name: 'list_calendar_events',
          description: 'Retrieve existing calendar events from Google Calendar for a specific date range. Use this to check what appointments are already scheduled.',
          parameters: {
            type: 'object',
            properties: {
              start_date: {
                type: 'string',
                description: 'Start date for the range (YYYY-MM-DD format)'
              },
              end_date: {
                type: 'string',
                description: 'End date for the range (YYYY-MM-DD format)'
              },
              max_results: {
                type: 'number',
                description: 'Maximum number of events to return',
                default: 10
              }
            },
            required: ['start_date', 'end_date']
          }
        },
        outputHandle: `calendar_list_${Date.now()}`,
        enabled: true
      },
      {
        id: `calendar_update_event_${Date.now()}`,
        name: 'Update Event',
        description: 'Update an existing event in Google Calendar',
        functionDefinition: {
          name: 'update_calendar_event',
          description: 'Modify an existing calendar event in Google Calendar. Use this to change appointment details like time, title, or attendees.',
          parameters: {
            type: 'object',
            properties: {
              event_id: {
                type: 'string',
                description: 'ID of the event to update'
              },
              title: {
                type: 'string',
                description: 'New title/summary of the appointment (optional)'
              },
              description: {
                type: 'string',
                description: 'New description of the appointment (optional)'
              },
              start_datetime: {
                type: 'string',
                description: 'New start date and time in ISO format (optional)'
              },
              end_datetime: {
                type: 'string',
                description: 'New end date and time in ISO format (optional)'
              },
              time_zone: {
                type: 'string',
                description: 'Timezone for the event (e.g., America/New_York, UTC, Asia/Karachi). If not specified, the node\'s configured timezone will be used. Common aliases like PST, EST, PKT are supported.'
              },
              location: {
                type: 'string',
                description: 'New location of the appointment (optional)'
              },
              attendees: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    email: { type: 'string', description: 'Attendee email address' },
                    displayName: { type: 'string', description: 'Attendee display name (optional)' }
                  },
                  required: ['email']
                },
                description: 'Array of attendee objects with email and optional displayName (optional)'
              },
              send_updates: {
                type: 'boolean',
                description: 'Whether to send email notifications to attendees about the update. Defaults to true.',
                default: true
              }
            },
            required: ['event_id']
          }
        },
        outputHandle: `calendar_update_${Date.now()}`,
        enabled: true
      },
      {
        id: `calendar_cancel_event_${Date.now()}`,
        name: 'Cancel Event',
        description: 'Cancel/delete an event from Google Calendar',
        functionDefinition: {
          name: 'cancel_calendar_event',
          description: 'Cancel or delete a calendar event from Google Calendar. Use this to remove appointments that are no longer needed. You can provide either the event_link (preferred), event_id, OR the date/time/email to find and cancel the event. IMPORTANT: The event_link is the primary identifier - it is the link provided to the user when the appointment was booked. The handler can derive the event ID from the provided link.',
          parameters: {
            type: 'object',
            properties: {
              event_link: {
                type: 'string',
                description: 'The Google Calendar event link provided when the appointment was booked. This is the preferred method for cancellation as it is the most reliable. Example: https://www.google.com/calendar/event?eid=abc123'
              },
              event_id: {
                type: 'string',
                description: 'ID of the event to cancel/delete. If not provided, event_link or date and time must be provided to find the event.'
              },
              date: {
                type: 'string',
                description: 'Date of the appointment to cancel. MUST be in YYYY-MM-DD format (e.g., "2025-11-10"). Convert user input like "10/11/2025", "November 10", or "tomorrow" to this format before calling. Required if event_id or event_link is not provided.'
              },
              time: {
                type: 'string',
                description: 'Time of the appointment to cancel. MUST be in HH:MM format using 24-hour notation (e.g., "16:15" for 4:15 PM). Convert user input like "4:15 PM", "4:15 pm", or "16:15" to this format before calling. Required if event_id or event_link is not provided.'
              },
              attendee_email: {
                type: 'string',
                description: 'Email address of the attendee to help identify the correct event when using date/time lookup'
              },
              send_updates: {
                type: 'boolean',
                description: 'Whether to send cancellation notifications to attendees',
                default: true
              }
            },
            required: []
          }
        },
        outputHandle: `calendar_cancel_${Date.now()}`,
        enabled: true
      }
    ];
  }, [enableGoogleCalendar, isGoogleCalendarConnected, calendarDefaultDuration, calendarBusinessHours]);


  const getZohoCalendarFunctions = useCallback(() => {
    if (!enableZohoCalendar || !isZohoCalendarConnected) {
      return [];
    }

    return [
      {
        id: `zoho_calendar_book_appointment_${Date.now()}`,
        name: t('flow_builder.ai_zoho_book_appointment_name', 'Book Zoho Appointment'),
        description: t('flow_builder.ai_zoho_book_appointment_desc', 'Book a new appointment in Zoho Calendar'),
        functionDefinition: {
          name: 'zoho_book_appointment',
          description: t('flow_builder.ai_function_zoho_book_appointment', 'Create a new calendar event/appointment in Zoho Calendar. Use this when the user wants to schedule a meeting or appointment.'),
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: t('flow_builder.ai_function_param_title', 'Title/summary of the appointment')
              },
              description: {
                type: 'string',
                description: t('flow_builder.ai_function_param_description', 'Detailed description of the appointment')
              },
              start_datetime: {
                type: 'string',
                description: t('flow_builder.ai_function_param_start_datetime', 'Start date and time in ISO format (YYYY-MM-DDTHH:MM:SS)')
              },
              end_datetime: {
                type: 'string',
                description: t('flow_builder.ai_function_param_end_datetime', 'End date and time in ISO format (YYYY-MM-DDTHH:MM:SS)')
              },
              attendee_emails: {
                type: 'array',
                items: { type: 'string' },
                description: t('flow_builder.ai_function_param_attendee_emails', 'Email addresses of attendees (optional)')
              },
              location: {
                type: 'string',
                description: t('flow_builder.ai_function_param_location', 'Location of the appointment (optional)')
              }
            },
            required: ['title', 'start_datetime', 'end_datetime']
          }
        },
        outputHandle: `zoho_calendar_book_${Date.now()}`,
        enabled: true
      },
      {
        id: `zoho_calendar_check_availability_${Date.now()}`,
        name: 'Check Zoho Availability',
        description: 'Check available time slots in Zoho Calendar',
        functionDefinition: {
          name: 'zoho_check_availability',
          description: 'Check available time slots in Zoho Calendar for scheduling appointments. Use this to find free time slots before booking.',
          parameters: {
            type: 'object',
            properties: {
              date: {
                type: 'string',
                description: 'Date to check availability for (YYYY-MM-DD format)'
              },
              duration_minutes: {
                type: 'number',
                description: 'Duration of the appointment in minutes',
                default: zohoCalendarDefaultDuration
              },
              start_time: {
                type: 'string',
                description: 'Earliest time to consider (HH:MM format, optional)',
                default: zohoCalendarBusinessHours.start
              },
              end_time: {
                type: 'string',
                description: 'Latest time to consider (HH:MM format, optional)',
                default: zohoCalendarBusinessHours.end
              }
            },
            required: ['date']
          }
        },
        outputHandle: `zoho_calendar_availability_${Date.now()}`,
        enabled: true
      },
      {
        id: `zoho_calendar_list_events_${Date.now()}`,
        name: 'List Zoho Events',
        description: 'List existing events from Zoho Calendar',
        functionDefinition: {
          name: 'zoho_list_calendar_events',
          description: 'Retrieve existing calendar events from Zoho Calendar for a specific date range. Use this to check what appointments are already scheduled.',
          parameters: {
            type: 'object',
            properties: {
              start_date: {
                type: 'string',
                description: 'Start date for the range (YYYY-MM-DD format)'
              },
              end_date: {
                type: 'string',
                description: 'End date for the range (YYYY-MM-DD format)'
              },
              max_results: {
                type: 'number',
                description: 'Maximum number of events to return',
                default: 10
              }
            },
            required: ['start_date', 'end_date']
          }
        },
        outputHandle: `zoho_calendar_list_${Date.now()}`,
        enabled: true
      },
      {
        id: `zoho_calendar_update_event_${Date.now()}`,
        name: 'Update Zoho Event',
        description: 'Update an existing event in Zoho Calendar',
        functionDefinition: {
          name: 'zoho_update_calendar_event',
          description: 'Modify an existing calendar event in Zoho Calendar. Use this to change appointment details like time, title, or attendees.',
          parameters: {
            type: 'object',
            properties: {
              event_id: {
                type: 'string',
                description: 'ID of the event to update'
              },
              title: {
                type: 'string',
                description: 'New title/summary of the appointment (optional)'
              },
              description: {
                type: 'string',
                description: 'New description of the appointment (optional)'
              },
              start_datetime: {
                type: 'string',
                description: 'New start date and time in ISO format (optional)'
              },
              end_datetime: {
                type: 'string',
                description: 'New end date and time in ISO format (optional)'
              },
              attendee_emails: {
                type: 'array',
                items: { type: 'string' },
                description: 'New attendee email addresses (optional)'
              },
              location: {
                type: 'string',
                description: 'New location of the appointment (optional)'
              }
            },
            required: ['event_id']
          }
        },
        outputHandle: `zoho_calendar_update_${Date.now()}`,
        enabled: true
      },
      {
        id: `zoho_calendar_cancel_event_${Date.now()}`,
        name: 'Cancel Zoho Event',
        description: 'Cancel/delete an event from Zoho Calendar',
        functionDefinition: {
          name: 'zoho_cancel_calendar_event',
          description: 'Cancel or delete a calendar event from Zoho Calendar. Use this to remove appointments that are no longer needed.',
          parameters: {
            type: 'object',
            properties: {
              event_id: {
                type: 'string',
                description: 'ID of the event to cancel/delete'
              },
              send_updates: {
                type: 'boolean',
                description: 'Whether to send cancellation notifications to attendees',
                default: true
              }
            },
            required: ['event_id']
          }
        },
        outputHandle: `zoho_calendar_cancel_${Date.now()}`,
        enabled: true
      }
    ];
  }, [enableZohoCalendar, isZohoCalendarConnected, zohoCalendarDefaultDuration, zohoCalendarBusinessHours]);















  const addTaskFromTemplate = useCallback((template: any) => {
    if (isAddingTask) {
      return;
    }

    setIsAddingTask(true);


    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 10000);
    const taskId = `task_${timestamp}_${randomSuffix}`;

    const newTask: TaskDefinition = {
      id: taskId,
      name: template.name,
      description: template.description,
      functionDefinition: template.functionDefinition,
      outputHandle: taskId,
      enabled: true
    };


    setTasks(prevTasks => [...prevTasks, newTask]);


    setTimeout(() => {
      setHandleKey(prev => prev + 1);
      setIsAddingTask(false);
    }, 100);
  }, [isAddingTask]);

  const currentProvider = AI_PROVIDERS.find(p => p.id === provider);
  const availableModels = currentProvider?.models || [];

  const updateNodeData = useCallback((updates: any) => {

    isUpdatingRef.current = true;
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              ...updates
            }
          };
        }
        return node;
      })
    );

    setTimeout(() => {
      isUpdatingRef.current = false;
    }, 100);
  }, [id, setNodes]);


  useEffect(() => {
    const timeoutId = setTimeout(() => {
      updateNodeData({ tasks });
    }, 50); // Small debounce to batch rapid task changes

    return () => clearTimeout(timeoutId);
  }, [updateNodeData, tasks]);


  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const calendarFunctions = getCalendarFunctions();
      updateNodeData({ calendarFunctions });
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [updateNodeData, getCalendarFunctions]);


  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const zohoCalendarFunctions = getZohoCalendarFunctions();
      updateNodeData({ zohoCalendarFunctions });
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [updateNodeData, getZohoCalendarFunctions]);


  useEffect(() => {
    const timeoutId = setTimeout(() => {
      updateNodeData({ mcpServers });
    }, 50); // Small debounce to batch rapid changes

    return () => clearTimeout(timeoutId);
  }, [updateNodeData, mcpServers]);



  useEffect(() => {

      if (isUpdatingRef.current) return;
      
      updateNodeData({
        provider,
        model,
        apiKey,
        credentialSource,

        language: language,
        prompt,
        enableHistory,
        historyLimit,
        enableTextToSpeech,
        ttsProvider,
        ttsVoice,
        voiceResponseMode,
        maxAudioDuration,
        enableSessionTakeover,
        stopKeyword,
        exitOutputHandle,
        enableTaskExecution,
        enableGoogleCalendar,
        calendarBusinessHours,
        calendarDefaultDuration,
        calendarBufferMinutes,
        calendarTimeZone,
        calendarAdvancedMode,
        calendarAdvancedSettings: {
          weeklySchedule: calendarWeeklySchedule,
          offDays: calendarOffDays
        },
        calendarFunctions: getCalendarFunctions(),


        enableZohoCalendar,
        zohoCalendarBusinessHours,
        zohoCalendarDefaultDuration,
        zohoCalendarTimeZone,
        zohoCalendarAdvancedMode,
        zohoCalendarAdvancedSettings: {
          weeklySchedule: zohoCalendarWeeklySchedule,
          offDays: zohoCalendarOffDays
        },
      zohoCalendarFunctions: getZohoCalendarFunctions(),

      knowledgeBaseEnabled,
      knowledgeBaseConfig,

      enableMCPServers,

      pineconeApiKey,
      pineconeEnvironment,
      pineconeIndexName,

      elevenLabsApiKey,
      elevenLabsVoiceId,
      elevenLabsCustomVoiceId,
      elevenLabsModel,
      elevenLabsStability,
      elevenLabsSimilarityBoost,
      elevenLabsStyle,
      elevenLabsUseSpeakerBoost
    });
  }, [
    updateNodeData,
    provider,
    model,
    apiKey,
    credentialSource,

    prompt,
    enableHistory,
    historyLimit,
    enableTextToSpeech,
    ttsProvider,
    ttsVoice,
    voiceResponseMode,
    maxAudioDuration,
    enableSessionTakeover,
    stopKeyword,
    exitOutputHandle,
    enableTaskExecution,
    enableGoogleCalendar,
    calendarBusinessHours,
    calendarDefaultDuration,
    calendarBufferMinutes,
    calendarTimeZone,
    calendarAdvancedMode,
    calendarWeeklySchedule,
    calendarOffDays,
    getCalendarFunctions,
    enableZohoCalendar,
    zohoCalendarBusinessHours,
    zohoCalendarDefaultDuration,
    zohoCalendarTimeZone,
    zohoCalendarAdvancedMode,
    zohoCalendarWeeklySchedule,
    zohoCalendarOffDays,
    getZohoCalendarFunctions,
    knowledgeBaseEnabled,
    knowledgeBaseConfig,
    enableMCPServers,
    pineconeApiKey,
    pineconeEnvironment,
    pineconeIndexName,
    elevenLabsApiKey,
    elevenLabsVoiceId,
    elevenLabsCustomVoiceId,
    elevenLabsModel,
    elevenLabsStability,
    elevenLabsSimilarityBoost,
    elevenLabsStyle,
    elevenLabsUseSpeakerBoost
  ]);


  useEffect(() => {
    if (handleKey > 0) {

      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id === id) {
            return {
              ...node,
              data: {
                ...node.data,
                _handleKey: handleKey // Internal key to trigger re-render
              }
            };
          }
          return node;
        })
      );
    }
  }, [handleKey, id, setNodes]);

  const handleProviderChange = (value: string) => {
    setProvider(value);
    const newProvider = AI_PROVIDERS.find(p => p.id === value);
    if (newProvider && newProvider.models.length > 0) {
      setModel(newProvider.models[0].id);
    }
  };

  const handleModelChange = (value: string) => {
    setModel(value);
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(e.target.value);
  };

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
  };

  const getApiDocUrl = (): string => {
    switch (provider) {
      case 'openai':
        return 'https://platform.openai.com/api-keys';
      case 'openrouter':
        return 'https://openrouter.ai/keys';
      default:
        return '#';
    }
  };

  const getProviderDisplayName = (): string => {
    return AI_PROVIDERS.find(p => p.id === provider)?.name || 'AI Provider';
  };

  const getProviderIcon = () => {
    switch (provider) {
      case 'openai':
        return <OpenAIIcon size={16} className="text-emerald-600" />;
      case 'openrouter':
        return <img src="https://cdn-icons-png.flaticon.com/512/14958/14958196.png" alt="AI Assistant" className="h-4 w-4" />;
      default:
        return <img src="https://cdn-icons-png.flaticon.com/512/14958/14958196.png" alt="AI Assistant" className="h-4 w-4" />;
    }
  };

  return (
    <div className="node-ai-assistant rounded-lg bg-card border border-emerald-200 dark:border-emerald-900 shadow-sm min-w-[420px] max-w-[550px] group relative">
      <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => onDeleteNode(id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{t('flow_builder.delete_node', 'Delete node')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Fixed Header */}
      <div className="p-3 border-b border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/30 dark:bg-emerald-900/10">
        <div className="font-medium flex items-center gap-2">
          {getProviderIcon()}
          <span>{t('flow_builder.ai_assistant', 'AI Assistant')}</span>
         <button
                className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? (
                  <>
                    <EyeOff className="h-3 w-3" />
                    Hide
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3" />
                    Edit
                  </>
                )}
              </button>
        </div>
      </div>

      {/* Content without scrollbar interference */}
      <div>
        <div className="p-3 space-y-3">

          {/* Configuration Summary */}
          <div className="text-sm p-3  rounded border border-border">
            <div className="flex items-center gap-1 mb-2">
              <Settings className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium">{getProviderDisplayName()}</span>
              <span className="text-xs text-muted-foreground">
                {availableModels.find(m => m.id === model)?.name || model}
              </span>
            </div>

            <div className="text-xs text-muted-foreground mb-2">
              {prompt.length > 80 ? prompt.substring(0, 80) + '...' : prompt}
            </div>

            <div className="flex flex-wrap gap-1">
              {enableHistory && (
                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">
                  {t('flow_builder.ai_summary_history', 'History:')} {historyLimit}
                </span>
              )}
              {enableTaskExecution && tasks.filter(task => task.enabled).length > 0 && (
                <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-400 px-1.5 py-0.5 rounded-full">
                  {t('flow_builder.ai_summary_tasks', 'Tasks:')} {tasks.filter(task => task.enabled).length}
                </span>
              )}
              {enableTextToSpeech && provider === 'openai' && (
                <span className="text-[10px] bg-pink-100 dark:bg-pink-900/20 text-pink-800 dark:text-pink-400 px-1.5 py-0.5 rounded-full">
                  {t('flow_builder.ai_summary_tts', 'TTS:')} {VOICE_RESPONSE_MODES.find(m => m.id === voiceResponseMode)?.name || t('flow_builder.ai_voice_mode_always', 'Always')}
                </span>
              )}
              {enableTextToSpeech && provider === 'openai' && maxAudioDuration && maxAudioDuration < 30 && (
                <span className="text-[10px] bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-400 px-1.5 py-0.5 rounded-full">
                  {t('flow_builder.ai_summary_audio', 'Audio:')} {t('flow_builder.ai_summary_audio_max', '{{duration}}s max', { duration: maxAudioDuration })}
                </span>
              )}

            </div>
          </div>

          {isEditing && (
            <>
              {/* AI Configuration Section */}
              <div className="border rounded-lg p-3 ">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  AI Configuration
                </h3>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.ai_provider', 'AI Provider')}</Label>
                      <Select value={provider} onValueChange={handleProviderChange}>
                        <SelectTrigger className="text-xs h-7 mt-1">
                          <SelectValue placeholder={t('flow_builder.ai_select_provider', 'Select provider')} />
                        </SelectTrigger>
                        <SelectContent>
                          {AI_PROVIDERS.map((provider) => (
                            <SelectItem key={provider.id} value={provider.id}>
                              {provider.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-[10px] font-medium text-foreground flex items-center gap-1">
                        {t('flow_builder.ai_model', 'Model')}
                        {provider === 'openrouter' && isLoadingModels && (
                          <RefreshCw className="w-3 h-3 animate-spin text-blue-500 dark:text-blue-400" />
                        )}
                      </Label>
                      <Select value={model} onValueChange={handleModelChange} disabled={provider === 'openrouter' && isLoadingModels}>
                        <SelectTrigger className="text-xs h-7 mt-1">
                          <SelectValue placeholder={
                            provider === 'openrouter' && isLoadingModels
                              ? t('flow_builder.ai_loading_models', 'Loading models...')
                              : t('flow_builder.ai_select_model', 'Select model')
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {availableModels.length === 0 ? (
                            <SelectItem value="no-models" disabled>
                              {provider === 'openrouter' && isLoadingModels
                                ? t('flow_builder.ai_loading_models', 'Loading models...')
                                : t('flow_builder.ai_no_models', 'No models available')
                              }
                            </SelectItem>
                          ) : (
                            availableModels.map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                <div className="flex items-center justify-between w-full">
                                  <span>{model.name}</span>
                                </div>
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      {provider === 'openrouter' && modelsError && (
                        <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {t('flow_builder.ai_models_fallback', 'Using fallback models due to API error')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label className="text-[10px] font-medium text-foreground flex items-center gap-1">
                      <Key className="w-3 h-3" />
                      {t('flow_builder.ai_credential_source', 'Credential Source')}
                    </Label>
                    <Select value={credentialSource} onValueChange={(value: string) => setCredentialSource(value as 'manual' | 'company' | 'system' | 'auto')}>
                      <SelectTrigger className="text-xs h-7 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">
                          <div className="flex items-center gap-2">
                            <Shield className="w-3 h-3" />
                            <span>{t('flow_builder.ai_credential_auto', 'Auto (Company → System → Manual)')}</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="company">
                          <div className="flex items-center gap-2">
                            <Building className="w-3 h-3" />
                            <span>{t('flow_builder.ai_credential_company', 'Company Credentials')}</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="system">
                          <div className="flex items-center gap-2">
                            <Shield className="w-3 h-3" />
                            <span>{t('flow_builder.ai_credential_system', 'System Credentials')}</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="manual">
                          <div className="flex items-center gap-2">
                            <Key className="w-3 h-3" />
                            <span>{t('flow_builder.ai_credential_manual', 'Manual API Key')}</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Show credential status */}
                    {credentialSource !== 'manual' && (
                      <div className="mt-1 text-[9px] text-muted-foreground">
                        {credentialSource === 'auto' && (
                          <span className="flex items-center gap-1">
                            <CheckCircle className="w-2.5 h-2.5 text-green-500" />
                            {companyCredentials?.find((c: any) => c.provider === provider && c.isActive)
                              ? t('flow_builder.ai_credential_company_available', 'Company credential available')
                              : t('flow_builder.ai_credential_fallback', 'Will use system/environment fallback')
                            }
                          </span>
                        )}
                        {credentialSource === 'company' && (
                          <span className="flex items-center gap-1">
                            {companyCredentials?.find((c: any) => c.provider === provider && c.isActive) ? (
                              <>
                                <CheckCircle className="w-2.5 h-2.5 text-green-500" />
                                {t('flow_builder.ai_credential_company_configured', 'Company credential configured')}
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="w-2.5 h-2.5 text-yellow-500" />
                                {t('flow_builder.ai_credential_company_missing', 'No company credential for this provider')}
                              </>
                            )}
                          </span>
                        )}
                        {credentialSource === 'system' && (
                          <span className="flex items-center gap-1">
                            <Shield className="w-2.5 h-2.5 text-blue-500" />
                            {t('flow_builder.ai_credential_system_configured', 'Using system credentials')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {credentialSource === 'manual' && (
                    <div>
                      <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.ai_api_key', 'API Key')}</Label>
                      <Input
                        type="password"
                        placeholder={t('flow_builder.ai_api_key_placeholder', 'Enter your {{provider}} API key', { provider: getProviderDisplayName() })}
                        value={apiKey}
                        onChange={handleApiKeyChange}
                        className="text-xs h-7 mt-1"
                      />
                      <div className="mt-1">
                        <a
                          href={getApiDocUrl()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-blue-600 hover:underline"
                        >
                          {t('flow_builder.ai_get_api_key', 'Get your API key here')}
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Language Selection */}
                  <div>
                    <Label className="text-[10px] font-medium text-foreground">
                      {t('flow_builder.ai_language_label', 'Response Language')}
                    </Label>
                    <Select 
                      value={language} 
                      onValueChange={(value) => {
                        isUpdatingRef.current = true;
                        setLanguage(value);

                        updateNodeData({ language: value });
                      }}
                    >
                      <SelectTrigger className="text-xs h-7 mt-1">
                        <SelectValue placeholder={t('flow_builder.ai_language_placeholder', 'Select language...')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto Detect (use contact language)</SelectItem>
                        {availableLanguages && availableLanguages.length > 0 ? (
                          availableLanguages
                            .filter((lang: any) => lang.isActive !== false)
                            .map((lang: any) => (
                              <SelectItem key={lang.code} value={lang.code}>
                                <div className="flex items-center gap-2">
                                  {lang.flagIcon && <span>{lang.flagIcon}</span>}
                                  <span>{lang.name}</span>
                                  {lang.nativeName !== lang.name && (
                                    <span className="text-muted-foreground">({lang.nativeName})</span>
                                  )}
                                </div>
                              </SelectItem>
                            ))
                        ) : (
                          <SelectItem value="en">English</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-[9px] text-muted-foreground mt-1">
                      {t('flow_builder.ai_language_description', 'Select the language the AI assistant should use for responses')}
                    </p>
                  </div>

                  <div>
                    <Label className="text-[10px] font-medium text-foreground">{t('flow_builder.ai_system_prompt', 'System Prompt')}</Label>
                    <Textarea
                      placeholder={t('flow_builder.ai_prompt_placeholder', 'Enter instructions for the AI')}
                      value={prompt}
                      onChange={handlePromptChange}
                      className="text-xs min-h-[200px] resize-none mt-1"
                    />
                  </div>
                </div>
              </div>

              {/* Conversation Section */}
              <div className="border rounded-lg p-3">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Conversation
                </h3>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium cursor-pointer">
                      {t('flow_builder.ai_enable_history', 'Conversation History')}
                    </Label>
                    <Switch
                      checked={enableHistory}
                      onCheckedChange={setEnableHistory}
                    />
                  </div>

                  {enableHistory && (
                    <div className="pl-4 border-l-2 border-blue-200">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-medium text-foreground">
                          {t('flow_builder.ai_history_limit', 'Message Limit')}
                        </Label>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 w-6 p-0 text-xs"
                            onClick={() => setHistoryLimit(Math.max(1, historyLimit - 1))}
                            disabled={historyLimit <= 1}
                          >-</Button>
                          <span className="text-xs w-6 text-center font-medium">{historyLimit}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 w-6 p-0 text-xs"
                            onClick={() => setHistoryLimit(Math.min(200, historyLimit + 1))}
                            disabled={historyLimit >= 200}
                          >+</Button>
                        </div>
                      </div>
                      <p className="text-[9px] text-muted-foreground mt-1">
                        {t('flow_builder.ai_history_help', 'Previous messages to include for context')}
                      </p>
                    </div>
                  )}


                </div>
              </div>



                {/* Session Takeover Section */}
              <div className="border rounded-lg p-3 ">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <LogOut className="h-4 w-4" />
                    {t('flow_builder.ai_session_takeover', 'Session Takeover')}
                  </h3>
                  <Switch
                    checked={enableSessionTakeover}
                    onCheckedChange={setEnableSessionTakeover}
                  />
                </div>

                {enableSessionTakeover && (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs font-medium text-foreground">
                        {t('flow_builder.ai_stop_keyword', 'Stop Keyword')}
                      </Label>
                      <Input
                        placeholder={t('flow_builder.ai_stop_keyword_placeholder', 'e.g., stop, end, agent')}
                        value={stopKeyword}
                        onChange={(e) => setStopKeyword(e.target.value)}
                        className="text-xs h-7 mt-1"
                      />
                      <p className="text-[9px] text-muted-foreground mt-1">
                        {t('flow_builder.ai_stop_keyword_help', 'User can type this keyword to end the AI session')}
                      </p>
                    </div>



                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 rounded-md p-2">
                      <p className="text-[10px] text-blue-700 dark:text-blue-400">
                        {t('flow_builder.ai_session_takeover_tip', '💡 Tip: When enabled, the AI will handle all subsequent messages until the stop keyword is received or the session is manually ended.')}
                      </p>
                    </div>
                  </div>
                )}

                {!enableSessionTakeover && (
                  <p className="text-[10px] text-muted-foreground">
                    {t('flow_builder.ai_session_takeover_disabled_help', 'Enable session takeover to allow AI to handle continuous conversation without restarting the flow')}
                  </p>
                )}
              </div>

              {/* Voice Processing Section - Available for OpenAI and other providers */}
              {provider === 'openai' && (
                <div className="border rounded-lg p-3 ">
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    Voice Processing
                  </h3>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-xs font-medium cursor-pointer">
                          {t('flow_builder.ai_enable_tts', 'Text-to-Speech')}
                        </Label>
                        <p className="text-[10px] text-muted-foreground">
                          {t('flow_builder.ai_tts_help', 'Convert AI responses to voice messages')}
                        </p>
                      </div>
                      <Switch
                        checked={enableTextToSpeech}
                        onCheckedChange={setEnableTextToSpeech}
                      />
                    </div>

                    {enableTextToSpeech && (
                      <div className="pl-4 border-l-2 border-pink-200 space-y-3">
                        <div>
                          <Label className="text-[10px] font-medium text-foreground">
                            {t('flow_builder.ai_tts_provider', 'TTS Provider')}
                          </Label>
                          <Select value={ttsProvider} onValueChange={setTtsProvider}>
                            <SelectTrigger className="text-xs h-7 mt-1">
                              <SelectValue placeholder={t('flow_builder.ai_tts_provider_placeholder', 'Select TTS provider...')} />
                            </SelectTrigger>
                            <SelectContent>
                              {TTS_PROVIDERS.map((provider) => (
                                <SelectItem key={provider.id} value={provider.id}>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{provider.name}</span>
                                    <span className="text-[10px] text-muted-foreground">{provider.description}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-[9px] text-muted-foreground mt-1">
                            {t('flow_builder.ai_tts_provider_help', 'Choose your text-to-speech provider')}
                          </p>
                        </div>

                        {/* Voice Selection - Provider Specific */}
                        <div>
                          <Label className="text-[10px] font-medium text-foreground">
                            {t('flow_builder.ai_voice_selection', 'Voice Selection')}
                          </Label>
                          <Select
                            value={ttsProvider === 'elevenlabs' ? (elevenLabsCustomVoiceId ? 'custom' : elevenLabsVoiceId) : ttsVoice}
                            onValueChange={(value) => {
                              if (ttsProvider === 'elevenlabs') {
                                if (value === 'custom') {
                                  setElevenLabsVoiceId('custom');
                                } else {
                                  setElevenLabsVoiceId(value);
                                  setElevenLabsCustomVoiceId(''); 
                                }
                              } else {
                                setTtsVoice(value);
                              }
                            }}
                          >
                            <SelectTrigger className="text-xs h-7 mt-1">
                              <SelectValue placeholder={t('flow_builder.ai_voice_selection_placeholder', 'Select voice...')} />
                            </SelectTrigger>
                            <SelectContent>
                              {(ttsProvider === 'elevenlabs' ? ELEVENLABS_VOICES : OPENAI_TTS_VOICES).map((voice) => (
                                <SelectItem key={voice.id} value={voice.id}>
                                  {voice.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-[9px] text-muted-foreground mt-1">
                            {t('flow_builder.ai_voice_selection_help', 'Choose the voice for AI audio responses')}
                          </p>
                        </div>

                        {/* Custom Voice ID Input - Only for ElevenLabs */}
                        {ttsProvider === 'elevenlabs' && (elevenLabsVoiceId === 'custom' || elevenLabsCustomVoiceId) && (
                          <div className="pl-4 border-l-2 border-purple-300 bg-purple-25">
                            <Label className="text-[10px] font-medium text-foreground">
                              {t('flow_builder.ai_custom_voice_id', 'Custom Voice ID')}
                            </Label>
                            <Input
                              type="text"
                              value={elevenLabsCustomVoiceId}
                              onChange={(e) => {
                                const value = e.target.value.trim();
                                setElevenLabsCustomVoiceId(value);
                                if (value) {
                                  setElevenLabsVoiceId('custom');
                                } else if (elevenLabsVoiceId === 'custom') {

                                  setElevenLabsVoiceId('pNInz6obpgDQGcFmaJgB');
                                }
                              }}
                              placeholder={t('flow_builder.ai_custom_voice_id_placeholder', 'Paste your ElevenLabs voice ID here...')}
                              className="text-xs h-7 mt-1 font-mono"
                            />
                            <p className="text-[9px] text-muted-foreground mt-1">
                              {t('flow_builder.ai_custom_voice_id_help', 'Enter a custom voice ID from your ElevenLabs account (e.g., "pNInz6obpgDQGcFmaJgB")')}
                            </p>
                            {elevenLabsCustomVoiceId && elevenLabsCustomVoiceId.length > 0 && elevenLabsCustomVoiceId.length < 20 && (
                              <p className="text-[9px] text-amber-600 mt-1">
                                {t('flow_builder.ai_voice_id_warning', '⚠️ Voice ID seems short. ElevenLabs voice IDs are typically 20+ characters long.')}
                              </p>
                            )}
                            <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                              <p className="text-[9px] text-blue-700">
                                {t('flow_builder.ai_voice_id_tip', '💡 Tip: You can find voice IDs in your ElevenLabs dashboard under "Voices" → Click on a voice → Copy the Voice ID')}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* ElevenLabs Specific Configuration */}
                        {ttsProvider === 'elevenlabs' && (
                          <div className="space-y-3 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-900 rounded-md">
                            <div>
                              <Label className="text-[10px] font-medium text-foreground">
                                {t('flow_builder.ai_elevenlabs_api_key', 'ElevenLabs API Key')}
                              </Label>
                              <Input
                                type="password"
                                value={elevenLabsApiKey}
                                onChange={(e) => setElevenLabsApiKey(e.target.value)}
                                placeholder={t('flow_builder.ai_elevenlabs_api_key_placeholder', 'Enter ElevenLabs API key...')}
                                className="text-xs h-7 mt-1"
                              />
                              <p className="text-[9px] text-muted-foreground mt-1">
                                {t('flow_builder.ai_elevenlabs_required', 'Required for ElevenLabs TTS')}
                              </p>
                            </div>

                            <div>
                              <Label className="text-[10px] font-medium text-foreground">
                                {t('flow_builder.ai_elevenlabs_model', 'Model')}
                              </Label>
                              <Select value={elevenLabsModel} onValueChange={setElevenLabsModel}>
                                <SelectTrigger className="text-xs h-7 mt-1">
                                  <SelectValue placeholder={t('flow_builder.ai_elevenlabs_select_model', 'Select model...')} />
                                </SelectTrigger>
                                <SelectContent>
                                  {ELEVENLABS_MODELS.map((model) => (
                                    <SelectItem key={model.id} value={model.id}>
                                      {model.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-[10px] font-medium text-foreground">
                                  {t('flow_builder.ai_elevenlabs_stability', 'Stability ({{value}})', { value: elevenLabsStability })}
                                </Label>
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.1"
                                  value={elevenLabsStability}
                                  onChange={(e) => setElevenLabsStability(parseFloat(e.target.value))}
                                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer mt-1"
                                />
                              </div>
                              <div>
                                <Label className="text-[10px] font-medium text-foreground">
                                  {t('flow_builder.ai_elevenlabs_similarity', 'Similarity ({{value}})', { value: elevenLabsSimilarityBoost })}
                                </Label>
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.1"
                                  value={elevenLabsSimilarityBoost}
                                  onChange={(e) => setElevenLabsSimilarityBoost(parseFloat(e.target.value))}
                                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer mt-1"
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-between">
                              <Label className="text-[10px] font-medium text-foreground">
                                {t('flow_builder.ai_elevenlabs_speaker_boost', 'Speaker Boost')}
                              </Label>
                              <Switch
                                checked={elevenLabsUseSpeakerBoost}
                                onCheckedChange={setElevenLabsUseSpeakerBoost}
                              />
                            </div>
                          </div>
                        )}

                        <div>
                          <Label className="text-[10px] font-medium text-foreground">
                            {t('flow_builder.ai_voice_response_mode', 'Voice Response Mode')}
                          </Label>
                          <Select value={voiceResponseMode} onValueChange={setVoiceResponseMode}>
                            <SelectTrigger className="text-xs h-7 mt-1">
                              <SelectValue placeholder={t('flow_builder.ai_voice_response_mode_placeholder', 'Select mode...')} />
                            </SelectTrigger>
                            <SelectContent>
                              {VOICE_RESPONSE_MODES.map((mode) => (
                                <SelectItem key={mode.id} value={mode.id}>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{mode.name}</span>
                                    <span className="text-[10px] text-muted-foreground">{mode.description}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-[9px] text-muted-foreground mt-1">
                            {VOICE_RESPONSE_MODES.find(m => m.id === voiceResponseMode)?.description}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 rounded-md p-2">
                      <p className="text-[10px] text-blue-700 dark:text-blue-400">
                        <strong>{t('flow_builder.ai_voice_processing_label', 'Voice Processing:')}</strong>
                        {ttsProvider === 'elevenlabs' ? (
                          <span> {t('flow_builder.ai_voice_processing_elevenlabs', 'Speech-to-Text uses OpenAI Whisper, Text-to-Speech uses ElevenLabs API')}</span>
                        ) : (
                          <span> {t('flow_builder.ai_voice_processing_openai', 'Speech-to-Text and Text-to-Speech both use OpenAI APIs')}</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}





              {/* Audio Processing Limits Section */}
              {provider === 'openai' && enableTextToSpeech && (
              <div className="border rounded-lg p-3 ">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {t('flow_builder.ai_audio_limits', 'Audio Processing Limits')}
                  </h3>

                  <div className="space-y-3">
                    <div>
                      <Label className="text-[10px] font-medium text-foreground">
                        {t('flow_builder.ai_max_audio_duration', 'Maximum Audio Duration (seconds)')}
                      </Label>
                      <NumberInput
                        min={1}
                        max={30}
                        value={maxAudioDuration}
                        onChange={setMaxAudioDuration}
                        fallbackValue={10}
                        className="text-xs h-7 mt-1"
                        placeholder="30"
                      />
                      <p className="text-[9px] text-muted-foreground mt-1">
                        {t('flow_builder.ai_max_audio_duration_help', 'Audio messages longer than this limit will not be transcribed or generate TTS responses to save API costs')}
                      </p>
                      {maxAudioDuration > 30 && (
                        <p className="text-[9px] text-red-600 mt-1">
                          {t('flow_builder.ai_max_duration_exceeded', 'Maximum allowed duration is 30 seconds')}
                        </p>
                      )}
                      {maxAudioDuration < 1 && (
                        <p className="text-[9px] text-red-600 mt-1">
                          {t('flow_builder.ai_min_duration_error', 'Minimum duration is 1 second')}
                        </p>
                      )}
                    </div>

                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900 rounded-md p-2">
                      <p className="text-[10px] text-yellow-700 dark:text-yellow-400">
                        {t('flow_builder.ai_cost_optimization_tip', '💰 Cost Optimization: Limiting audio duration prevents expensive API calls for long voice messages. Users will receive a text response asking them to send shorter messages.')}
                      </p>
                    </div>
                  </div>
                </div>
              )}

            

              {/* Task Execution Section */}
              <div className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    {t('flow_builder.ai_task_execution', 'Task Execution')}
                  </h3>
                  <Switch
                    checked={enableTaskExecution}
                    onCheckedChange={setEnableTaskExecution}
                  />
                </div>

                {enableTaskExecution && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium text-foreground">
                        {t('flow_builder.ai_tasks', 'Configured Tasks')} ({tasks.length})
                      </Label>
                      <div className="flex items-center gap-1">
                        
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addTask}
                          disabled={isAddingTask}
                          className="h-7 px-2 text-xs"
                        >
                          {isAddingTask ? (
                            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Plus className="h-3 w-3 mr-1" />
                          )}
                          {t('flow_builder.ai_add_task', 'Add New Task')}
                        </Button>
                      </div>
                    </div>

                    {tasks.length === 0 ? (
                      <div className="text-center py-4 border-2 border-dashed border-border rounded-lg">
                        <div className="text-xs text-muted-foreground mb-2">
                          {t('flow_builder.ai_no_tasks_configured', 'No tasks configured')}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {t('flow_builder.ai_no_tasks_help', 'Add tasks to enable AI function calling and flow routing')}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {tasks.map((task, index) => (
                          <TaskConfigurationCard
                            key={task.id}
                            task={task}
                            index={index}
                            onUpdate={(updates) => updateTask(task.id, updates)}
                            onRemove={() => removeTask(task.id)}
                            t={t}
                          />
                        ))}
                      </div>
                    )}

                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900 rounded-md p-2">
                      <p className="text-[10px] text-blue-700 dark:text-blue-400">
                        {t('flow_builder.ai_tasks_tip', '💡 Tip: Each active task creates an output handle for flow routing. Use specific descriptions to prevent false triggers.')}
                      </p>
                    </div>
                  </div>
                )}

                {!enableTaskExecution && (
                  <p className="text-[10px] text-muted-foreground">
                    {t('flow_builder.ai_task_execution_disabled_help', 'Enable task execution to allow AI function calling and advanced flow routing')}
                  </p>
                )}
              </div>

              {/* Google Calendar Integration Section */}
              <div className="border rounded-lg p-3 ">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    {t('flow_builder.ai_google_calendar_integration', 'Google Calendar')}
                  </h3>
                  <Switch
                    checked={enableGoogleCalendar}
                    onCheckedChange={setEnableGoogleCalendar}
                  />
                </div>

                {enableGoogleCalendar && (
                  <div className="space-y-4">
                    {/* Authentication Status */}
                    <div className="bg-card rounded-md p-3 border">
                      {isLoadingGoogleCalendarStatus ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          {t('flow_builder.ai_checking_connection', 'Checking connection...')}
                        </div>
                      ) : isGoogleCalendarConnected ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                            <CheckCircle className="h-4 w-4" />
                            {t('flow_builder.ai_google_calendar_connected', 'Google Calendar connected')}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={authenticateGoogleCalendar}
                              disabled={isGoogleCalendarAuthenticating}
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                            >
                              {isGoogleCalendarAuthenticating ? (
                                <>
                                  <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                                  {t('flow_builder.ai_switching', 'Switching...')}
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="mr-1 h-3 w-3" />
                                  {t('flow_builder.ai_switch_account', 'Switch Account')}
                                </>
                              )}
                            </Button>
                            <Button
                              onClick={disconnectGoogleCalendar}
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                              <LogOut className="mr-1 h-3 w-3" />
                              {t('flow_builder.ai_disconnect', 'Disconnect')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                            <AlertCircle className="h-4 w-4" />
                            {t('flow_builder.ai_google_calendar_not_connected', 'Authentication required')}
                          </div>
                          <Button
                            onClick={authenticateGoogleCalendar}
                            disabled={isGoogleCalendarAuthenticating}
                            size="sm"
                            className="text-xs h-7 bg-green-600 dark:bg-green-500 hover:bg-green-700 dark:hover:bg-green-600"
                          >
                            {isGoogleCalendarAuthenticating ? (
                              <>
                                <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                                {t('flow_builder.ai_connecting', 'Connecting...')}
                              </>
                            ) : (
                              <>
                                <ExternalLink className="mr-1 h-3 w-3" />
                                {t('flow_builder.ai_connect_google_calendar', 'Connect Google Calendar')}
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Calendar Functions Status */}
                    {isGoogleCalendarConnected && (
                      <div className="bg-card rounded-md p-3 border mb-3">
                        <div className="flex items-center gap-2 text-sm text-green-600 mb-2">
                          <CheckCircle className="h-4 w-4" />
                          Calendar Functions Available
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t('flow_builder.ai_calendar_features_available', 'The AI can now: book appointments, check availability, list events, update events, and cancel events.')}
                          <br />
                          <span className="text-blue-600 dark:text-blue-400 font-medium">{t('flow_builder.ai_calendar_system_prompt_note', 'Core calendar behavior is enforced when enabled. The prompt customizes tone and extra guidance.')}</span>
                        </div>
                      </div>
                    )}

                    {/* Calendar Configuration */}
                    {isGoogleCalendarConnected && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs font-medium">{t('flow_builder.ai_business_hours_start', 'Business Hours Start')}</Label>
                            <Input
                              type="time"
                              value={calendarBusinessHours.start}
                              onChange={(e) => setCalendarBusinessHours((prev: any) => ({ ...prev, start: e.target.value }))}
                              className="text-xs h-7"
                            />
                          </div>
                          <div>
                            <Label className="text-xs font-medium">{t('flow_builder.ai_business_hours_end', 'Business Hours End')}</Label>
                            <Input
                              type="time"
                              value={calendarBusinessHours.end}
                              onChange={(e) => setCalendarBusinessHours((prev: any) => ({ ...prev, end: e.target.value }))}
                              className="text-xs h-7"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs font-medium">{t('flow_builder.ai_appointment_duration', 'Appointment Duration (minutes)')}</Label>
                            <Input
                              type="number"
                              min="15"
                              max="480"
                              step="15"
                              value={calendarDefaultDuration}
                              onChange={(e) => setCalendarDefaultDuration(parseInt(e.target.value) || 60)}
                              className="text-xs h-7"
                            />
                          </div>
                          <div>
                            <Label className="text-xs font-medium flex items-center gap-1">
                              {t('flow_builder.ai_buffer_minutes', 'Buffer between meetings (minutes)')}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-xs">
                                    <p className="text-xs">
                                      Buffer time prevents back-to-back bookings by adding spacing before and after each appointment.
                                      This allows for overrun/setup time between meetings. Recommended: 0 for no buffer, 15-30 minutes for typical use cases.
                                      Buffer time is automatically applied when checking availability and creating bookings.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </Label>
                            <Input
                              type="number"
                              min="0"
                              max="120"
                              step="5"
                              value={calendarBufferMinutes}
                              onChange={(e) => setCalendarBufferMinutes(parseInt(e.target.value) || 0)}
                              className="text-xs h-7"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                          <div>
                            <Label className="text-xs font-medium flex items-center gap-1">
                              {t('flow_builder.ai_timezone', 'Timezone')}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-xs">
                                    <p className="text-xs">
                                      The timezone used for all calendar operations. This determines when appointments are scheduled and how availability is displayed.
                                      If not specified in booking requests, this timezone will be used. Defaults to your browser's timezone.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </Label>
                            <TimezoneSelector
                              value={calendarTimeZone}
                              onChange={setCalendarTimeZone}
                              className="text-xs h-7"
                            />
                          </div>
                        </div>

                        {/* Advanced Settings Section */}
                        <div className="border-t pt-3 mt-3">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-xs font-semibold text-foreground">Advanced Settings</h4>
                            <Switch
                              checked={calendarAdvancedMode}
                              onCheckedChange={setCalendarAdvancedMode}
                            />
                          </div>
                          
                          {calendarAdvancedMode ? (
                            <div className="space-y-3">
                              <p className="text-[10px] text-muted-foreground">
                                Configure day-specific working hours and mark off-days. Off-days won't show any available slots.
                              </p>
                              <WeeklyScheduleEditor
                                schedule={calendarWeeklySchedule}
                                offDays={calendarOffDays}
                                onScheduleChange={setCalendarWeeklySchedule}
                                onOffDaysChange={setCalendarOffDays}
                                disabled={!isGoogleCalendarConnected}
                              />
                            </div>
                          ) : (
                            <div className="text-[10px] text-muted-foreground">
                              Using simple hours: {calendarBusinessHours.start} - {calendarBusinessHours.end} for all days
                            </div>
                          )}
                        </div>

                      </div>
                    )}
                  </div>
                )}

                {!enableGoogleCalendar && (
                  <p className="text-[10px] text-muted-foreground">
                    {t('flow_builder.ai_google_calendar_disabled_help', 'Core calendar behavior is enforced when enabled. The prompt customizes tone and extra guidance.')}
                  </p>
                )}
              </div>

              {/* Zoho Calendar Integration Section */}
              <div className="border rounded-lg p-3 ">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    {t('flow_builder.ai_zoho_calendar_integration', 'Zoho Calendar')}
                  </h3>
                  <Switch
                    checked={enableZohoCalendar}
                    onCheckedChange={setEnableZohoCalendar}
                  />
                </div>

                {enableZohoCalendar && (
                  <div className="space-y-4">
                    {/* Authentication Status */}
                    <div className="bg-card rounded-md p-3 border">
                      {isLoadingZohoCalendarStatus ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          {t('flow_builder.ai_checking_connection', 'Checking connection...')}
                        </div>
                      ) : isZohoCalendarConnected ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                            <CheckCircle className="h-4 w-4" />
                            {t('flow_builder.ai_zoho_calendar_connected', 'Zoho Calendar connected')}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={authenticateZohoCalendar}
                              disabled={isZohoCalendarAuthenticating}
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700"
                              title={t('flow_builder.ai_switch_account', 'Connect a different Zoho account')}
                            >
                              {isZohoCalendarAuthenticating ? (
                                <>
                                  <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                                  {t('flow_builder.ai_switching', 'Switching...')}
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="mr-1 h-3 w-3" />
                                  {t('flow_builder.ai_switch_account', 'Switch Account')}
                                </>
                              )}
                            </Button>
                            <Button
                              onClick={disconnectZohoCalendar}
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                              <LogOut className="mr-1 h-3 w-3" />
                              {t('flow_builder.ai_disconnect', 'Disconnect')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                            <AlertCircle className="h-4 w-4" />
                            {t('flow_builder.ai_zoho_calendar_not_connected', 'Authentication required')}
                          </div>
                          <Button
                            onClick={authenticateZohoCalendar}
                            disabled={isZohoCalendarAuthenticating}
                            size="sm"
                            className="text-xs h-7 bg-orange-600 dark:bg-orange-500 hover:bg-orange-700 dark:hover:bg-orange-600"
                          >
                            {isZohoCalendarAuthenticating ? (
                              <>
                                <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                                {t('flow_builder.ai_connecting', 'Connecting...')}
                              </>
                            ) : (
                              <>
                                <ExternalLink className="mr-1 h-3 w-3" />
                                {t('flow_builder.ai_connect_zoho_calendar', 'Connect Zoho Calendar')}
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Calendar Functions Status */}
                    {isZohoCalendarConnected && (
                      <div className="bg-card rounded-md p-3 border mb-3">
                        <div className="flex items-center gap-2 text-sm text-green-600 mb-2">
                          <CheckCircle className="h-4 w-4" />
                          Zoho Calendar Functions Available
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t('flow_builder.ai_zoho_calendar_features_available', 'The AI can now: book appointments, check availability, list events, update events, and cancel events in Zoho Calendar.')}
                          <br />
                          <span className="text-blue-600 dark:text-blue-400 font-medium">{t('flow_builder.ai_calendar_system_prompt_note', 'Core calendar behavior is enforced when enabled. The prompt customizes tone and extra guidance.')}</span>
                        </div>
                      </div>
                    )}

                    {/* Calendar Configuration */}
                    {isZohoCalendarConnected && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs font-medium">{t('flow_builder.ai_business_hours_start', 'Business Hours Start')}</Label>
                            <Input
                              type="time"
                              value={zohoCalendarBusinessHours.start}
                              onChange={(e) => setZohoCalendarBusinessHours((prev: any) => ({ ...prev, start: e.target.value }))}
                              className="text-xs h-7"
                            />
                          </div>
                          <div>
                            <Label className="text-xs font-medium">{t('flow_builder.ai_business_hours_end', 'Business Hours End')}</Label>
                            <Input
                              type="time"
                              value={zohoCalendarBusinessHours.end}
                              onChange={(e) => setZohoCalendarBusinessHours((prev: any) => ({ ...prev, end: e.target.value }))}
                              className="text-xs h-7"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs font-medium">{t('flow_builder.ai_appointment_duration', 'Appointment Duration (minutes)')}</Label>
                            <NumberInput
                              min={15}
                              max={480}
                              step={15}
                              value={zohoCalendarDefaultDuration}
                              onChange={setZohoCalendarDefaultDuration}
                              fallbackValue={60}
                              className="text-xs h-7"
                            />
                          </div>
                          <div>
                            <Label className="text-xs font-medium">{t('flow_builder.ai_timezone', 'Timezone')}</Label>
                            <TimezoneSelector
                              value={zohoCalendarTimeZone}
                              onChange={setZohoCalendarTimeZone}
                              className="text-xs h-7"
                            />
                          </div>
                        </div>

                        {/* Advanced Settings Section */}
                        <div className="border-t pt-3 mt-3">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-xs font-semibold text-foreground">Advanced Settings</h4>
                            <Switch
                              checked={zohoCalendarAdvancedMode}
                              onCheckedChange={setZohoCalendarAdvancedMode}
                            />
                          </div>
                          
                          {zohoCalendarAdvancedMode ? (
                            <div className="space-y-3">
                              <p className="text-[10px] text-muted-foreground">
                                Configure day-specific working hours and mark off-days. Off-days won't show any available slots.
                              </p>
                              <WeeklyScheduleEditor
                                schedule={zohoCalendarWeeklySchedule}
                                offDays={zohoCalendarOffDays}
                                onScheduleChange={setZohoCalendarWeeklySchedule}
                                onOffDaysChange={setZohoCalendarOffDays}
                                disabled={!isZohoCalendarConnected}
                              />
                            </div>
                          ) : (
                            <div className="text-[10px] text-muted-foreground">
                              Using simple hours: {zohoCalendarBusinessHours.start} - {zohoCalendarBusinessHours.end} for all days
                            </div>
                          )}
                        </div>

                      </div>
                    )}
                  </div>
                )}

                {!enableZohoCalendar && (
                  <p className="text-[10px] text-muted-foreground">
                    {t('flow_builder.ai_zoho_calendar_disabled_help', 'Core calendar behavior is enforced when enabled. The prompt customizes tone and extra guidance.')}
                  </p>
                )}
              </div>

              {/* Knowledge Base Configuration */}
              <div className="border rounded-lg p-3 ">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    {t('flow_builder.ai_knowledge_base', 'Knowledge Base')}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{t('flow_builder.ai_rag_enhancement', 'RAG Enhancement')}</span>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={knowledgeBaseEnabled}
                        onCheckedChange={setKnowledgeBaseEnabled}
                        className="scale-75"
                      />
                    </div>
                  </div>
                </div>

                {knowledgeBaseEnabled ? (
                  <div className="space-y-4">
                    {/* Pinecone Credentials */}
                    <div className="space-y-3 p-3 bg-card rounded-lg border border-blue-200 dark:border-blue-900">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <h4 className="text-xs font-semibold text-foreground">Pinecone Configuration</h4>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="pinecone-api-key" className="text-xs">
                          Pinecone API Key <span className="text-red-500 dark:text-red-400">*</span>
                        </Label>
                        <div className="relative">
                          <Input
                            id="pinecone-api-key"
                            type={showPineconeApiKey ? "text" : "password"}
                            value={pineconeApiKey}
                            onChange={(e) => setPineconeApiKey(e.target.value)}
                            placeholder="pc-xxxxxxxxxxxxxxxxxxxxxxxx"
                            className="text-xs pr-8"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPineconeApiKey(!showPineconeApiKey)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showPineconeApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </button>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          Get your API key from <a href="https://app.pinecone.io" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Pinecone Console</a>
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="pinecone-environment" className="text-xs">
                          Environment/Region
                        </Label>
                        <Select value={pineconeEnvironment} onValueChange={setPineconeEnvironment}>
                          <SelectTrigger id="pinecone-environment" className="text-xs">
                            <SelectValue placeholder="Select region" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="us-east-1">US East (N. Virginia)</SelectItem>
                            <SelectItem value="us-west-2">US West (Oregon)</SelectItem>
                            <SelectItem value="eu-west-1">EU West (Ireland)</SelectItem>
                            <SelectItem value="ap-southeast-1">Asia Pacific (Singapore)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="pinecone-index-name" className="text-xs">
                          Index Name
                        </Label>
                        <Input
                          id="pinecone-index-name"
                          type="text"
                          value={pineconeIndexName}
                          onChange={(e) => setPineconeIndexName(e.target.value)}
                          placeholder="my-knowledge-base (optional)"
                          className="text-xs"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Optional. If not provided, a default index name will be generated. The index will be created automatically if it doesn't exist.
                        </p>
                      </div>

                      {!pineconeApiKey && (
                        <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-800">
                          <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          <span>Pinecone API Key is required for Knowledge Base to work</span>
                        </div>
                      )}
                    </div>

                    {/* Document List with Upload Button */}
                    <div className="space-y-2">
                      <DocumentList
                        nodeId={id}
                        showNodeFilter={false}
                      />
                    </div>

                    {/* RAG Configuration */}
                    <div className="space-y-2">
                      <RAGConfiguration
                        nodeId={id}
                        onConfigChange={(config) => {
                          setKnowledgeBaseConfig({
                            maxRetrievedChunks: config.maxRetrievedChunks,
                            similarityThreshold: config.similarityThreshold,
                            contextPosition: config.contextPosition,
                            contextTemplate: config.contextTemplate
                          });
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[10px] text-muted-foreground">
                      {t('flow_builder.ai_knowledge_base_disabled_help', 'Enable knowledge base to enhance AI responses with document-based context using RAG (Retrieval-Augmented Generation)')}
                    </p>
                    <p className="text-[10px] text-blue-600">
                      💡 {t('flow_builder.ai_knowledge_base_setup_hint', 'To get started: Enable the toggle above, then configure your Pinecone credentials')}
                    </p>
                  </div>
                )}
              </div>

              {/* MCP Servers Configuration */}
              <div className="border rounded-lg p-3 ">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    {t('flow_builder.ai_mcp_servers', 'MCP Servers')}
                  </h3>
                  <div className="flex items-center gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="max-w-xs">
                            <p className="text-xs">
                              MCP (Model Context Protocol) servers provide additional tools and capabilities to the AI assistant.
                              <br />
                              <a href="https://mcpservers.org" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
                                Learn more
                              </a>
                            </p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={enableMCPServers}
                        onCheckedChange={setEnableMCPServers}
                        className="scale-75"
                      />
                    </div>
                  </div>
                </div>

                {enableMCPServers ? (
                  <div className="space-y-3">
                    <div className="space-y-3">
                      {mcpServers.map((server) => (
                        <MCPServerCard
                          key={server.id}
                          server={server}
                          onUpdate={(updates) => updateMCPServer(server.id, updates)}
                          onRemove={() => removeMCPServer(server.id)}
                          parseServerJson={parseServerJson}
                          getServerJson={getServerJson}
                        />
                      ))}
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addMCPServer}
                      className="w-full text-xs h-7"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add another MCP Server
                    </Button>

                    {mcpServers.length === 0 && (
                      <div className="text-center p-4 bg-card rounded-lg border border-purple-200 dark:border-purple-900">
                        <p className="text-[10px] text-muted-foreground mb-2">
                          No MCP servers configured. Click "Add another MCP Server" to get started.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[10px] text-muted-foreground">
                      {t('flow_builder.ai_mcp_servers_disabled_help', 'Enable MCP servers to extend AI capabilities with external tools and integrations')}
                    </p>
                    <p className="text-[10px] text-purple-600">
                      💡 {t('flow_builder.ai_mcp_servers_setup_hint', 'Paste your MCP server configuration JSON to get started')}
                    </p>
                  </div>
                )}
              </div>

            </>
          )}
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />



      {/* Enhanced Task Output Handles */}
      {enableTaskExecution && tasks.filter(task => task.enabled).map((task, index) => {
        const totalHandles = tasks.filter(t => t.enabled).length + (enableSessionTakeover ? 1 : 0);
        const spacing = Math.min(15, 60 / Math.max(totalHandles, 1));
        const startPosition = 30;

        return (
          <div
            key={`${task.id}-${handleKey}`} // Include handleKey to force re-render
            className="absolute right-0 flex items-center pointer-events-none"
            style={{ top: `${startPosition + (index * spacing)}%` }}
          >

            {/* Handle with Tooltip - Restored Radix UI implementation */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="pointer-events-auto">
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={task.outputHandle}
                      style={standardHandleStyle}
                      isConnectable={isConnectable}
                      key={`handle-${task.outputHandle}-${handleKey}`} // Force handle re-registration
                      onMouseDown={(e) => {

                        e.stopPropagation();
                      }}
                      onMouseMove={(e) => {

                        e.stopPropagation();
                      }}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <div className="max-w-[250px]">
                    <p className="text-xs font-medium text-blue-600">{task.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 italic">
                      {t('flow_builder.ai_function_label', 'Function:')} {task.functionDefinition.name}
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      })}

      {/* Session Takeover Exit Handle */}
      {enableSessionTakeover && (
        <div
          className="absolute right-0 flex items-center pointer-events-none"
          style={{
            top: enableTaskExecution && tasks.filter(t => t.enabled).length > 0
              ? `${30 + (tasks.filter(t => t.enabled).length * Math.min(15, 60 / Math.max(tasks.filter(t => t.enabled).length + 1, 1)))}%`
              : '70%'
          }}
        >
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="pointer-events-auto">
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={exitOutputHandle}
                    style={{...standardHandleStyle, backgroundColor: '#f97316'}}
                    isConnectable={isConnectable}
                    key={`handle-${exitOutputHandle}-${handleKey}`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    onMouseMove={(e) => {
                      e.stopPropagation();
                    }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="left">
                <div className="max-w-[250px]">
                  <p className="text-xs font-medium text-orange-600">Session Exit</p>
                  <p className="text-xs text-muted-foreground mt-1">Triggered when AI session ends</p>
                  <p className="text-[10px] text-muted-foreground mt-1 italic">
                    Stop keyword: "{stopKeyword || 'stop'}"
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
}