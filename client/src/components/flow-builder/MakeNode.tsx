import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Loader2,
  Play,
  Trash2,
  X,
  HelpCircle,
  Copy,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Settings,
  Eye,
  EyeOff,
  List,
  Image,
  Video,
  FileAudio,
  FileText,
  Upload,
  Download,
  Plus
} from 'lucide-react';
import { useCallback, useState, useEffect } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { useFlowContext } from '../../pages/flow-builder';
import { useTranslation } from '@/hooks/use-translation';





interface ConfigValue {
  [key: string]: string | boolean | number | object;
}

interface MakeNodeProps {
  id: string;
  data: {
    label: string;
    apiToken?: string;
    teamId?: string;
    organizationId?: string;
    webhookUrl?: string;
    scenarioId?: string;
    scenarioName?: string;
    operation?: string;
    config?: ConfigValue;
    timeout?: number;
    region?: string;
    enableMediaSupport?: boolean;
    supportedMediaTypes?: string[];
    maxFileSize?: number;
    includeFileMetadata?: boolean;
    mediaProcessingMode?: string;
  };
  isConnectable: boolean;
}

export function MakeNode({ id, data, isConnectable }: MakeNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);

  const MAKE_OPERATIONS = [
    {
      id: 'execute_scenario',
      name: t('flow_builder.make_name', 'Make.com'),
      description: t('flow_builder.make_description', 'Execute Make.com scenario with multimedia support'),
      tooltip: t('flow_builder.make_tooltip', 'Execute a Make.com scenario with AI chat capabilities. Supports text, images, videos, audio, and documents. Perfect for AI agents, chatbots, and conversational workflows.'),
      icon: '⚡',
      color: 'text-primary'
    }
  ];

  const SUPPORTED_MEDIA_TYPES = [
    { id: 'image', name: t('flow_builder.media_images', 'Images'), icon: Image, description: t('flow_builder.media_images_desc', 'JPEG, PNG, WebP images') },
    { id: 'video', name: t('flow_builder.media_videos', 'Videos'), icon: Video, description: t('flow_builder.media_videos_desc', 'MP4, 3GPP videos') },
    { id: 'audio', name: t('flow_builder.media_audio', 'Audio'), icon: FileAudio, description: t('flow_builder.media_audio_desc', 'MP3, AAC, OGG audio files') },
    { id: 'document', name: t('flow_builder.media_documents', 'Documents'), icon: FileText, description: t('flow_builder.media_documents_desc', 'PDF, DOC, DOCX files') }
  ];
  const [apiToken, setApiToken] = useState(data.apiToken || '');
  const [teamId, setTeamId] = useState(data.teamId || '');
  const [organizationId, setOrganizationId] = useState(data.organizationId || '');
  const [webhookUrl, setWebhookUrl] = useState(data.webhookUrl || '');
  const [scenarioId, setScenarioId] = useState(data.scenarioId || '');
  const [scenarioName, setScenarioName] = useState(data.scenarioName || '');
  const [operation] = useState('execute_scenario');
  const [timeout, setTimeoutState] = useState(data.timeout || 30);
  const [region, setRegion] = useState(data.region || 'eu2');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [showTestResult, setShowTestResult] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [fieldValidation, setFieldValidation] = useState<Record<string, { isValid: boolean; message?: string }>>({});
  const [configurationProgress, setConfigurationProgress] = useState(0);
  const [isListingScenarios, setIsListingScenarios] = useState(false);
  const [scenariosList, setScenariosList] = useState<any[]>([]);
  const [showScenarioSelector, setShowScenarioSelector] = useState(false);
  const [selectedScenarioIndex, setSelectedScenarioIndex] = useState<number | null>(null);

  const [enableMediaSupport, setEnableMediaSupport] = useState(data.enableMediaSupport || false);
  const [supportedMediaTypes, setSupportedMediaTypes] = useState<string[]>(data.supportedMediaTypes || ['image', 'video', 'audio', 'document']);
  const [maxFileSize, setMaxFileSize] = useState(data.maxFileSize || 10);
  const [includeFileMetadata, setIncludeFileMetadata] = useState(data.includeFileMetadata !== false);
  const [mediaProcessingMode, setMediaProcessingMode] = useState(data.mediaProcessingMode || 'url');
  const [showMediaConfig, setShowMediaConfig] = useState(false);


  const [emptyPayload, setEmptyPayload] = useState((data as any).emptyPayload || false);
  const [customParameters, setCustomParameters] = useState((data as any).customParameters || {});
  const [showParametersConfig, setShowParametersConfig] = useState(false);

  const { setNodes } = useReactFlow();



  const { onDeleteNode } = useFlowContext();

  const updateNodeData = useCallback((updates: any) => {
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
  }, [id, setNodes]);

  const getOperationColor = (op: string) => {
    const operationData = MAKE_OPERATIONS.find(operation => operation.id === op);
    return operationData?.color || 'text-muted-foreground';
  };

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error(t('flow_builder.make_copy_failed', 'Failed to copy text: '), err);
    }
  };

  const validateField = (fieldName: string, value: string, required: boolean = false) => {
    let isValid = true;
    let message = '';

    if (required && !value.trim()) {
      isValid = false;
      message = t('flow_builder.make_field_required', 'This field is required');
    } else if (fieldName === 'webhookUrl' && value) {
      const urlPattern = /^https?:\/\/.+/;
      if (!urlPattern.test(value)) {
        isValid = false;
        message = t('flow_builder.make_invalid_url', 'Please enter a valid URL (e.g., https://hook.make.com/...)');
      }
    } else if (fieldName === 'timeout' && value) {
      const timeoutNum = parseInt(value);
      if (isNaN(timeoutNum) || timeoutNum < 1 || timeoutNum > 300) {
        isValid = false;
        message = t('flow_builder.make_timeout_range', 'Timeout must be between 1 and 300 seconds');
      }
    } else if (fieldName === 'scenarioName' && required && !value.trim()) {
      isValid = false;
      message = t('flow_builder.make_scenario_name_required', 'Scenario name is required');
    } else if (fieldName === 'apiToken' && required && !value.trim()) {
      isValid = false;
      message = t('flow_builder.make_api_token_required', 'API token is required');
    }

    setFieldValidation(prev => ({
      ...prev,
      [fieldName]: { isValid, message }
    }));

    return isValid;
  };

  const calculateProgress = () => {
    const requiredFields = [apiToken, scenarioName, operation];
    const filledRequired = requiredFields.filter(field => field && typeof field === 'string' && field.trim()).length;
    const optionalFields = [webhookUrl, teamId, organizationId, scenarioId];
    const filledOptional = optionalFields.filter(field => field && typeof field === 'string' && field.trim()).length;

    const progress = ((filledRequired / requiredFields.length) * 70) + ((filledOptional / optionalFields.length) * 30);
    setConfigurationProgress(Math.round(progress));
  };

  useEffect(() => {
    calculateProgress();
  }, [apiToken, scenarioName, operation, webhookUrl, teamId, organizationId, scenarioId, region]);

  useEffect(() => {
    updateNodeData({
      apiToken,
      teamId,
      organizationId,
      webhookUrl,
      scenarioId,
      scenarioName,
      operation,
      timeout,
      region,
      enableMediaSupport,
      supportedMediaTypes,
      maxFileSize,
      includeFileMetadata,
      mediaProcessingMode,
      emptyPayload,
      customParameters
    });
  }, [apiToken, teamId, organizationId, webhookUrl, scenarioId, scenarioName, operation, timeout, region, enableMediaSupport, supportedMediaTypes, maxFileSize, includeFileMetadata, mediaProcessingMode, emptyPayload, customParameters, updateNodeData]);

  const testConnection = async () => {
    if (!apiToken.trim()) {
      setTestResult({ success: false, message: t('flow_builder.make_api_token_required_test', 'API token is required for testing') });
      setShowTestResult(true);
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/make/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiToken,
          teamId: teamId || undefined,
          organizationId: organizationId || undefined,
          webhookUrl: webhookUrl || undefined,
          region: region || 'eu2'
        }),
      });

      const result = await response.json();
      setTestResult(result);
      setShowTestResult(true);
    } catch (error) {
      setTestResult({
        success: false,
        message: t('flow_builder.make_test_connection_failed', 'Failed to test connection. Please check your network and try again.')
      });
      setShowTestResult(true);
    } finally {
      setIsTesting(false);
    }
  };

  const listScenarios = async () => {
    if (!apiToken.trim()) {
      setTestResult({ success: false, message: t('flow_builder.make_api_token_required_list', 'API token is required for listing scenarios') });
      setShowTestResult(true);
      return;
    }

    setIsListingScenarios(true);
    setScenariosList([]);

    try {
      const response = await fetch('/api/make/list-scenarios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiToken,
          teamId: teamId || undefined,
          organizationId: organizationId || undefined,
          region: region || 'eu2'
        }),
      });

      const result = await response.json();
      if (result.success && result.scenarios) {
        setScenariosList(result.scenarios);
        setShowScenarioSelector(true);
      } else {
        setTestResult({
          success: false,
          message: result.message || t('flow_builder.make_list_scenarios_failed', 'Failed to fetch scenarios')
        });
        setShowTestResult(true);
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: t('flow_builder.make_list_scenarios_network_error', 'Failed to fetch scenarios. Please check your network and try again.')
      });
      setShowTestResult(true);
    } finally {
      setIsListingScenarios(false);
    }
  };

  const selectScenario = (scenario: any, index: number) => {
    setScenarioId(scenario.id);
    setScenarioName(scenario.name);
    setSelectedScenarioIndex(index);
    setShowScenarioSelector(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setShowTestResult(false);
    setShowScenarioSelector(false);
    setShowMediaConfig(false);
  };

  const toggleMediaType = (mediaType: string) => {
    setSupportedMediaTypes(prev => {
      if (prev.includes(mediaType)) {
        return prev.filter(type => type !== mediaType);
      } else {
        return [...prev, mediaType];
      }
    });
  };


  return (
    <div className="node-make p-3 rounded-lg bg-card border border-border shadow-sm min-w-[380px] max-w-[480px] group">
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
              <p className="text-xs">{t('flow_builder.make_delete_node', 'Delete node')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="w-3 h-3 bg-primary border-2 border-background"
      />

      <div className="font-medium flex items-center gap-2 mb-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <img 
                src="https://registry.npmmirror.com/@lobehub/icons-static-png/1.75.0/files/dark/make-color.png" 
                alt="Make.com" 
                className="h-4 w-4"
              />
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{t('flow_builder.make_integration', 'Make.com Workflow Automation Integration')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span>Make.com Integration</span>

        {/* Configuration Progress Badge */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant={configurationProgress >= 70 ? "default" : "secondary"}
                className={cn(
                  "text-[10px] px-1.5 py-0.5",
                  configurationProgress >= 70 ? "bg-primary/10 text-primary border border-primary/20" : "bg-secondary/10 text-secondary border border-secondary/20"
                )}
              >
                {configurationProgress}% configured
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{t('flow_builder.make_configuration_completeness', 'Configuration completeness: {{progress}}%', { progress: configurationProgress })}</p>
              <p className="text-xs text-muted-foreground">
                {configurationProgress < 70 ? t('flow_builder.make_complete_required_fields', 'Complete required fields to reach 70%') : t('flow_builder.make_configuration_ready', 'Configuration ready!')}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {isEditing ? t('flow_builder.make_hide', 'Hide') : t('flow_builder.make_edit', 'Edit')}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{isEditing ? t('flow_builder.make_hide_configuration_panel', 'Hide configuration panel') : t('flow_builder.make_show_configuration_panel', 'Show configuration panel')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="text-sm p-2  rounded border border-border">
        <div className="flex items-center gap-1 mb-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <span className="text-lg">{MAKE_OPERATIONS.find(op => op.id === operation)?.icon || '⚡'}</span>
                  <span className={cn("font-medium", getOperationColor(operation))}>
                    {MAKE_OPERATIONS.find(op => op.id === operation)?.name || operation}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs font-medium">{MAKE_OPERATIONS.find(op => op.id === operation)?.name}</p>
                <p className="text-xs text-muted-foreground">{MAKE_OPERATIONS.find(op => op.id === operation)?.tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <span className="text-muted-foreground">•</span>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  {scenarioName || webhookUrl ? (
                    <CheckCircle className="h-3 w-3 text-primary" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-secondary" />
                  )}
                  <span className="text-xs text-muted-foreground truncate">
                    {scenarioName || webhookUrl ? t('flow_builder.make_configured', 'Configured') : t('flow_builder.make_not_configured', 'Not configured')}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">
                  {scenarioName || webhookUrl
                    ? t('flow_builder.make_connection_configured', 'Make.com connection is properly configured')
                    : t('flow_builder.make_configure_connection', 'Please configure Make.com API token and scenario details')
                  }
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="mt-1 flex flex-wrap gap-1">
          {scenarioName && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded cursor-help">
                    {t('flow_builder.make_scenario_label', 'Scenario:')} {scenarioName.length > 12 ? scenarioName.slice(0, 12) + '...' : scenarioName}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{t('flow_builder.make_target_scenario', 'Target scenario: {{name}}', { name: scenarioName })}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {webhookUrl && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded cursor-help">
                    {t('flow_builder.make_webhook_connected', 'Webhook Connected')}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{t('flow_builder.make_webhook_url_configured', 'Webhook URL configured')}</p>
                  <p className="text-xs text-muted-foreground">{webhookUrl}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge className="text-[10px] bg-muted text-muted-foreground border border-border px-1 py-0.5 rounded cursor-help">
                  {t('flow_builder.make_timeout_label', 'Timeout: {{timeout}}s', { timeout })}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">{t('flow_builder.make_request_timeout', 'Request timeout: {{timeout}} seconds', { timeout })}</p>
                <p className="text-xs text-muted-foreground">{t('flow_builder.make_max_wait_time', 'Maximum time to wait for Make.com response')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {enableMediaSupport && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded cursor-help">
                    {t('flow_builder.make_multimedia_support', '📎 Media Support')}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{t('flow_builder.make_multimedia_enabled', 'Multimedia support enabled')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('flow_builder.make_supports_types', 'Supports: {{types}}', { types: supportedMediaTypes.join(', ') })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('flow_builder.make_max_size', 'Max size: {{size}}MB', { size: maxFileSize })}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="mt-3 text-xs space-y-3 border rounded p-2 ">
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="h-3.5 w-3.5 text-primary" />
              <Label className="font-medium">{t('flow_builder.make_api_configuration', 'Make.com API Configuration')}</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">{t('flow_builder.make_configure_connection_help', 'Configure connection to your Make.com account')}</p>
                    <p className="text-xs text-muted-foreground">{t('flow_builder.make_required_fields_marked', 'Required fields are marked with *')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* API Token */}
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Label className="text-xs font-medium">{t('flow_builder.make_api_token_label', 'API Token *')}</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs font-medium">{t('flow_builder.make_api_token_help_title', 'Your Make.com API token')}</p>
                      <p className="text-xs text-muted-foreground">{t('flow_builder.make_api_token_help_description', 'Get this from your Make.com account settings')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="relative">
                <Input
                  placeholder={t('flow_builder.make_api_token_placeholder', 'Enter your Make.com API token')}
                  value={apiToken}
                  onChange={(e) => {
                    setApiToken(e.target.value);
                    validateField('apiToken', e.target.value, true);
                  }}
                  className={cn(
                    "text-xs h-7 pr-8",
                    fieldValidation.apiToken?.isValid === false ? "border-destructive" :
                    fieldValidation.apiToken?.isValid === true ? "border-primary" : ""
                  )}
                />
                {apiToken && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-0.5 h-6 w-6 p-0"
                          onClick={() => copyToClipboard(apiToken, 'apiToken')}
                        >
                          {copiedField === 'apiToken' ? (
                            <CheckCircle className="h-3 w-3 text-primary" />
                          ) : (
                            <Copy className="h-3 w-3 text-muted-foreground" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs">
                          {copiedField === 'apiToken' ? t('flow_builder.make_copied', 'Copied!') : t('flow_builder.make_copy_token_clipboard', 'Copy token to clipboard')}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              {fieldValidation.apiToken?.message && (
                <p className="text-[10px] text-destructive mt-1">{fieldValidation.apiToken.message}</p>
              )}
            </div>

            {/* Region */}
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Label className="text-xs font-medium">{t('flow_builder.make_region_label', 'Region')}</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">{t('flow_builder.make_region_help', 'Select your Make.com region (e.g., us1, eu1)')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full text-xs h-7 border border-input rounded px-2 bg-background"
              >
                <option value="us1">US1 (United States) - Recommended</option>
                <option value="us2">US2 (United States)</option>
                <option value="eu1">EU1 (Europe)</option>
                <option value="eu2">EU2 (Europe)</option>
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">
                {t('flow_builder.make_region_help_text', 'Select the region where your Make.com account is hosted')}
              </p>
            </div>

            {/* Team ID */}
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Label className="text-xs font-medium">{t('flow_builder.make_team_id_label', 'Team ID')}</Label>
                <Badge variant="secondary" className="text-[9px] px-1 py-0">{t('common.optional', 'Optional')}</Badge>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">{t('flow_builder.make_team_id_help', 'Your Make.com team ID for team-scoped scenarios')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                placeholder={t('flow_builder.make_team_id_placeholder', 'Enter team ID (optional)')}
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="text-xs h-7"
              />
            </div>

            {/* Organization ID */}
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Label className="text-xs font-medium">{t('flow_builder.make_organization_id_label', 'Organization ID')}</Label>
                <Badge variant="secondary" className="text-[9px] px-1 py-0">{t('common.optional', 'Optional')}</Badge>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">{t('flow_builder.make_organization_id_help', 'Your Make.com organization ID for org-scoped scenarios')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                placeholder={t('flow_builder.make_organization_id_placeholder', 'Enter organization ID (optional)')}
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                className="text-xs h-7"
              />
            </div>

            {/* Test Connection Button */}
            <div className="flex gap-2 pt-2">
              <Button
                onClick={testConnection}
                disabled={isTesting || !apiToken.trim()}
                size="sm"
                className="h-7 text-xs flex-1"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    {t('flow_builder.make_testing', 'Testing...')}
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3 mr-1" />
                    {t('flow_builder.make_test_connection', 'Test Connection')}
                  </>
                )}
              </Button>

              <Button
                onClick={listScenarios}
                disabled={isListingScenarios || !apiToken.trim()}
                size="sm"
                variant="outline"
                className="h-7 text-xs flex-1"
              >
                {isListingScenarios ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    {t('flow_builder.make_loading', 'Loading...')}
                  </>
                ) : (
                  <>
                    <List className="h-3 w-3 mr-1" />
                    {t('flow_builder.make_list_scenarios', 'List Scenarios')}
                  </>
                )}
              </Button>
            </div>

            {/* Test Results Display - Right after buttons */}
            {showTestResult && testResult && (
              <div className="mt-2">
                <div className={cn(
                  "p-3 rounded-md text-xs border",
                  testResult.success
                    ? "bg-primary/10 border-primary/20 text-primary"
                    : "bg-destructive/10 border-destructive/20 text-destructive"
                )}>
                  <div className="flex items-start gap-2">
                    {testResult.success ? (
                      <CheckCircle className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <div className="font-medium mb-1">
                        {testResult.success
                          ? t('flow_builder.make_test_success', 'Connection Test Successful')
                          : t('flow_builder.make_test_failed', 'Connection Test Failed')
                        }
                      </div>
                      {testResult.message && (
                        <div className="text-xs">
                          {testResult.message}
                        </div>
                      )}
                      {testResult.error && (
                        <div className="text-xs">
                          {testResult.error}
                        </div>
                      )}
                      {testResult.helpText && (
                        <div className="text-xs mt-1 opacity-80">
                          {testResult.helpText}
                        </div>
                      )}
                      {testResult.details && (
                        <div className="mt-2 space-y-1 text-xs opacity-75">
                          {Object.entries(testResult.details).map(([key, value]) => (
                            <div key={key} className="flex justify-between">
                              <span className="font-medium capitalize">{key}:</span>
                              <span>{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 flex-shrink-0"
                      onClick={() => setShowTestResult(false)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Scenario Configuration Section */}
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-2 mb-2">
              <List className="h-3.5 w-3.5 text-primary" />
              <Label className="font-medium">{t('flow_builder.make_scenario_configuration', 'Scenario Configuration')}</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">{t('flow_builder.make_configure_scenario_help', 'Configure which Make.com scenario to execute')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Scenario Name */}
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Label className="text-xs font-medium">{t('flow_builder.make_scenario_name_label', 'Scenario Name *')}</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">{t('flow_builder.make_scenario_name_help', 'Name of the Make.com scenario to execute')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                placeholder={t('flow_builder.make_scenario_name_placeholder', 'Enter scenario name')}
                value={scenarioName}
                onChange={(e) => {
                  setScenarioName(e.target.value);
                  validateField('scenarioName', e.target.value, true);
                }}
                className={cn(
                  "text-xs h-7",
                  fieldValidation.scenarioName?.isValid === false ? "border-destructive" :
                  fieldValidation.scenarioName?.isValid === true ? "border-primary" : ""
                )}
              />
              {fieldValidation.scenarioName?.message && (
                <p className="text-[10px] text-destructive mt-1">{fieldValidation.scenarioName.message}</p>
              )}
            </div>

            {/* Scenario ID */}
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Label className="text-xs font-medium">{t('flow_builder.make_scenario_id_label', 'Scenario ID')}</Label>
                <Badge variant="secondary" className="text-[9px] px-1 py-0">{t('common.optional', 'Optional')}</Badge>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">{t('flow_builder.make_scenario_id_help', 'Specific scenario ID (auto-filled when selecting from list)')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                placeholder={t('flow_builder.make_scenario_id_placeholder', 'Enter scenario ID (optional)')}
                value={scenarioId}
                onChange={(e) => setScenarioId(e.target.value)}
                className="text-xs h-7"
              />
            </div>
          </div>

          {/* Webhook URL Configuration Section */}
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-2 mb-2">
              <ExternalLink className="h-3.5 w-3.5 text-primary" />
              <Label className="font-medium">{t('flow_builder.make_webhook_configuration', 'Webhook Configuration')}</Label>
              <Badge variant="secondary" className="text-[9px] px-1 py-0">{t('common.optional', 'Optional')}</Badge>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">{t('flow_builder.make_webhook_configuration_help', 'Alternative method using webhook URL')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Webhook URL */}
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Label className="text-xs font-medium">{t('flow_builder.make_webhook_url_label', 'Webhook URL')}</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">{t('flow_builder.make_webhook_url_help', 'Make.com webhook URL for direct execution')}</p>
                      <p className="text-xs text-muted-foreground">{t('flow_builder.make_webhook_url_example', 'e.g., https://hook.make.com/...')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="relative">
                <Input
                  placeholder={t('flow_builder.make_webhook_url_placeholder', 'Enter Make.com webhook URL')}
                  value={webhookUrl}
                  onChange={(e) => {
                    setWebhookUrl(e.target.value);
                    validateField('webhookUrl', e.target.value);
                  }}
                  className={cn(
                    "text-xs h-7 pr-8",
                    fieldValidation.webhookUrl?.isValid === false ? "border-destructive" :
                    fieldValidation.webhookUrl?.isValid === true ? "border-primary" : ""
                  )}
                />
                {webhookUrl && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-0.5 h-6 w-6 p-0"
                          onClick={() => copyToClipboard(webhookUrl, 'webhookUrl')}
                        >
                          {copiedField === 'webhookUrl' ? (
                            <CheckCircle className="h-3 w-3 text-primary" />
                          ) : (
                            <Copy className="h-3 w-3 text-muted-foreground" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs">
                          {copiedField === 'webhookUrl' ? t('flow_builder.make_copied', 'Copied!') : t('flow_builder.make_copy_webhook_clipboard', 'Copy webhook URL to clipboard')}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              {fieldValidation.webhookUrl?.message && (
                <p className="text-[10px] text-destructive mt-1">{fieldValidation.webhookUrl.message}</p>
              )}
            </div>
          </div>

          {/* Timeout Configuration Section */}
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="h-3.5 w-3.5 text-primary" />
              <Label className="font-medium">{t('flow_builder.make_timeout_configuration', 'Timeout Configuration')}</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">{t('flow_builder.make_timeout_configuration_help', 'Configure request timeout settings')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Timeout */}
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Label className="text-xs font-medium">{t('flow_builder.make_timeout_seconds_label', 'Timeout (seconds)')}</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">{t('flow_builder.make_timeout_seconds_help', 'Maximum time to wait for Make.com response (1-300 seconds)')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <NumberInput
                min={1}
                max={300}
                value={timeout}
                onChange={(value) => {
                  setTimeoutState(value);
                  validateField('timeout', String(value));
                }}
                fallbackValue={30}
                className={cn(
                  "text-xs h-7",
                  fieldValidation.timeout?.isValid === false ? "border-destructive" :
                  fieldValidation.timeout?.isValid === true ? "border-primary" : ""
                )}
              />
              {fieldValidation.timeout?.message && (
                <p className="text-[10px] text-destructive mt-1">{fieldValidation.timeout.message}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">
                {t('flow_builder.make_timeout_range_help', 'Range: 1-300 seconds (default: 30)')}
              </p>
            </div>
          </div>

          {/* Media Configuration Section */}
          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex items-center gap-2 mb-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setShowMediaConfig(!showMediaConfig)}
              >
                {showMediaConfig ? (
                  <EyeOff className="h-3 w-3 mr-1" />
                ) : (
                  <Eye className="h-3 w-3 mr-1" />
                )}
                {t('flow_builder.make_media_configuration', 'Media Support')}
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-sm">
                    <p className="text-xs font-medium">{t('flow_builder.make_multimedia_support_help_title', 'Multimedia Message Support')}</p>
                    <p className="text-xs text-muted-foreground mb-2">
                      {t('flow_builder.make_multimedia_support_help_description', 'Configure how your Make.com scenario handles images, videos, audio, and documents from WhatsApp users.')}
                    </p>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        <strong>{t('flow_builder.make_url_mode', 'URL Mode')}:</strong> {t('flow_builder.make_url_mode_description', 'Sends media as downloadable URLs')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <strong>{t('flow_builder.make_base64_mode', 'Base64 Mode')}:</strong> {t('flow_builder.make_base64_mode_description', 'Sends media as base64 encoded data')}
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Badge
                variant={enableMediaSupport ? "default" : "secondary"}
                className="text-[9px] px-1.5 py-0.5"
              >
                {enableMediaSupport ? t('flow_builder.make_enabled', 'Enabled') : t('flow_builder.make_disabled', 'Disabled')}
              </Badge>
            </div>

            {showMediaConfig && (
              <div className="space-y-3 p-3 bg-primary/10 border border-primary/20 rounded">
                {/* Enable Media Support Toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs font-medium">{t('flow_builder.make_enable_media_support', 'Enable Media Support')}</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="text-xs">{t('flow_builder.make_enable_media_support_help', 'Allow Make.com scenario to receive and process multimedia messages')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableMediaSupport}
                    onChange={(e) => setEnableMediaSupport(e.target.checked)}
                    className="h-4 w-4 text-primary rounded border-input focus:ring-primary"
                  />
                </div>

                {enableMediaSupport && (
                  <>
                    {/* Supported Media Types */}
                    <div>
                      <Label className="text-xs font-medium mb-2 block">{t('flow_builder.make_supported_media_types', 'Supported Media Types')}</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {SUPPORTED_MEDIA_TYPES.map((mediaType) => (
                          <div key={mediaType.id} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={supportedMediaTypes.includes(mediaType.id)}
                              onChange={() => toggleMediaType(mediaType.id)}
                              className="h-3 w-3"
                            />
                            <mediaType.icon className="h-3 w-3 text-primary" />
                            <span className="text-xs">{mediaType.name}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {t('flow_builder.make_select_media_types_help', 'Select which media types your Make.com scenario can handle')}
                      </p>
                    </div>

                    {/* Max File Size */}
                    <div>
                      <Label className="text-xs font-medium mb-1 block">{t('flow_builder.make_max_file_size', 'Max File Size (MB)')}</Label>
                      <NumberInput
                        min={1}
                        max={100}
                        value={maxFileSize}
                        onChange={setMaxFileSize}
                        fallbackValue={10}
                        className="text-xs h-7"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {t('flow_builder.make_max_file_size_help', 'Maximum file size for media uploads (1-100 MB)')}
                      </p>
                    </div>

                    {/* Include File Metadata */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs font-medium">{t('flow_builder.make_include_file_metadata', 'Include File Metadata')}</Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p className="text-xs">{t('flow_builder.make_include_file_metadata_help', 'Include file size, type, and name in the payload')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <input
                        type="checkbox"
                        checked={includeFileMetadata}
                        onChange={(e) => setIncludeFileMetadata(e.target.checked)}
                        className="h-4 w-4 text-primary rounded border-input focus:ring-primary"
                      />
                    </div>

                    {/* Media Processing Mode */}
                    <div>
                      <Label className="text-xs font-medium mb-1 block">{t('flow_builder.make_media_processing_mode', 'Media Processing Mode')}</Label>
                      <select
                        value={mediaProcessingMode}
                        onChange={(e) => setMediaProcessingMode(e.target.value)}
                        className="w-full text-xs h-7 border border-input rounded px-2 bg-background"
                      >
                        <option value="url">{t('flow_builder.make_url_mode', 'URL Mode')}</option>
                        <option value="base64">{t('flow_builder.make_base64_mode', 'Base64 Mode')}</option>
                      </select>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {mediaProcessingMode === 'url'
                          ? t('flow_builder.make_url_mode_description', 'Sends media as downloadable URLs')
                          : t('flow_builder.make_base64_mode_description', 'Sends media as base64 encoded data')
                        }
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Parameters Configuration Section */}
          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex items-center gap-2 mb-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setShowParametersConfig(!showParametersConfig)}
              >
                {showParametersConfig ? (
                  <EyeOff className="h-3 w-3 mr-1" />
                ) : (
                  <Eye className="h-3 w-3 mr-1" />
                )}
                {t('flow_builder.make_parameters_configuration', 'Parameters Configuration')}
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-sm">
                    <p className="text-xs font-medium">{t('flow_builder.make_parameters_help_title', 'Custom Parameters')}</p>
                    <p className="text-xs text-muted-foreground mb-2">
                      {t('flow_builder.make_parameters_help_description', 'Configure the exact parameters your Make.com scenario expects. Use {{variable}} syntax for dynamic values.')}
                    </p>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        <strong>{t('flow_builder.make_empty_payload', 'Empty Payload')}:</strong> {t('flow_builder.make_empty_payload_description', 'Send no parameters (for scenarios that don\'t expect input)')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <strong>{t('flow_builder.make_custom_params', 'Custom Parameters')}:</strong> {t('flow_builder.make_custom_params_description', 'Define specific parameters your scenario needs')}
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Badge
                variant={emptyPayload || Object.keys(customParameters).length > 0 ? "default" : "secondary"}
                className="text-[9px] px-1.5 py-0.5"
              >
                {emptyPayload ? 'Empty' : Object.keys(customParameters).length > 0 ? 'Custom' : 'Default'}
              </Badge>
            </div>

            {showParametersConfig && (
              <div className="space-y-3 p-3 bg-muted border border-border rounded">
                {/* Empty Payload Option */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="emptyPayload"
                    checked={emptyPayload}
                    onChange={(e) => setEmptyPayload(e.target.checked)}
                    className="h-3 w-3"
                  />
                  <Label htmlFor="emptyPayload" className="text-xs">
                    {t('flow_builder.make_send_empty_payload', 'Send empty payload (no parameters)')}
                  </Label>
                </div>

                {!emptyPayload && (
                  <>
                    <div className="text-xs font-medium text-foreground">
                      {t('flow_builder.make_custom_parameters', 'Custom Parameters')}
                    </div>
                    <div className="space-y-2">
                      {Object.entries(customParameters).map(([key, value], index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            placeholder="Parameter name"
                            value={key}
                            onChange={(e) => {
                              const newParams = { ...customParameters };
                              delete newParams[key];
                              newParams[e.target.value] = value;
                              setCustomParameters(newParams);
                            }}
                            className="text-xs h-7 flex-1"
                          />
                          <Input
                            placeholder="Value (use {{variable}} for dynamic)"
                            value={value as string}
                            onChange={(e) => {
                              setCustomParameters({
                                ...customParameters,
                                [key]: e.target.value
                              });
                            }}
                            className="text-xs h-7 flex-1"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              const newParams = { ...customParameters };
                              delete newParams[key];
                              setCustomParameters(newParams);
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setCustomParameters({
                            ...customParameters,
                            [`param${Object.keys(customParameters).length + 1}`]: '{{message}}'
                          });
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        {t('flow_builder.make_add_parameter', 'Add Parameter')}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Scenario Selector Modal */}
          {showScenarioSelector && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="flex items-center gap-2 mb-2">
                <List className="h-4 w-4 text-primary" />
                <Label className="font-medium">{t('flow_builder.make_select_scenario', 'Select Scenario')}</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 w-6 p-0"
                  onClick={() => setShowScenarioSelector(false)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-2 p-2 bg-muted border border-border rounded">
                {scenariosList.length > 0 ? (
                  scenariosList.map((scenario, index) => (
                    <div
                      key={scenario.id}
                      className={cn(
                        "p-2 rounded cursor-pointer border text-xs transition-colors",
                        selectedScenarioIndex === index
                          ? "bg-primary/10 border-primary/20"
                          : "bg-card border-border hover:bg-muted"
                      )}
                      onClick={() => selectScenario(scenario, index)}
                    >
                      <div className="font-medium">{scenario.name}</div>
                      <div className="text-muted-foreground text-[10px]">ID: {scenario.id}</div>
                      {scenario.description && (
                        <div className="text-muted-foreground text-[10px] mt-1">{scenario.description}</div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground text-xs py-4">
                    {t('flow_builder.make_no_scenarios_found', 'No scenarios found')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Cancel/Close Button */}
          <div className="mt-3 pt-3 border-t border-border flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleCancel}
            >
              <X className="h-3 w-3 mr-1" />
              {t('flow_builder.make_close', 'Close')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}