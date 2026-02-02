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
  Download
} from 'lucide-react';
import { useCallback, useState, useEffect } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { useFlowContext } from '../../pages/flow-builder';
import { useTranslation } from '@/hooks/use-translation';





const SUPPORTED_MEDIA_TYPES = [
  { id: 'image', name: 'Images', icon: Image, description: 'JPEG, PNG, WebP images' },
  { id: 'video', name: 'Videos', icon: Video, description: 'MP4, 3GPP videos' },
  { id: 'audio', name: 'Audio', icon: FileAudio, description: 'MP3, AAC, OGG audio files' },
  { id: 'document', name: 'Documents', icon: FileText, description: 'PDF, DOC, DOCX files' }
];


interface ConfigValue {
  [key: string]: string | boolean | number | object;
}


interface N8nNodeProps {
  id: string;
  data: {
    label: string;
    instanceUrl?: string;
    apiKey?: string;
    webhookUrl?: string;
    chatWebhookUrl?: string; // New field for direct chat webhook URL
    workflowId?: string;
    workflowName?: string;
    operation?: string;
    config?: ConfigValue;
    timeout?: number;

    enableMediaSupport?: boolean;
    supportedMediaTypes?: string[];
    maxFileSize?: number;
    includeFileMetadata?: boolean;
    mediaProcessingMode?: string;
  };
  isConnectable: boolean;
}

export function N8nNode({ id, data, isConnectable }: N8nNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);

  const N8N_OPERATIONS = [
    {
      id: 'execute_workflow',
      name: t('flow_builder.n8n_name', 'n8n'),
      description: t('flow_builder.n8n_description', 'Execute n8n chat AI workflow with multimedia support'),
      tooltip: t('flow_builder.n8n_tooltip', 'Execute an n8n workflow with AI chat capabilities. Supports text, images, videos, audio, and documents. Perfect for AI agents, chatbots, and conversational workflows.'),
      icon: '🤖',
      color: 'text-primary'
    }
  ];
  const [instanceUrl, setInstanceUrl] = useState(data.instanceUrl || '');
  const [apiKey, setApiKey] = useState(data.apiKey || '');
  const [webhookUrl, setWebhookUrl] = useState(data.webhookUrl || '');
  const [chatWebhookUrl, setChatWebhookUrl] = useState(data.chatWebhookUrl || ''); // New state for direct chat webhook URL
  const [workflowId, setWorkflowId] = useState(data.workflowId || '');
  const [workflowName, setWorkflowName] = useState(data.workflowName || '');
  const [operation] = useState('execute_workflow'); 
  const [timeout, setTimeoutState] = useState(data.timeout || 30);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [showTestResult, setShowTestResult] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [fieldValidation, setFieldValidation] = useState<Record<string, { isValid: boolean; message?: string }>>({});
  const [configurationProgress, setConfigurationProgress] = useState(0);
  const [isListingWorkflows, setIsListingWorkflows] = useState(false);
  const [workflowsList, setWorkflowsList] = useState<any[]>([]);
  const [showWorkflowSelector, setShowWorkflowSelector] = useState(false);
  const [selectedWorkflowIndex, setSelectedWorkflowIndex] = useState<number | null>(null);


  const [enableMediaSupport, setEnableMediaSupport] = useState(data.enableMediaSupport || false);
  const [supportedMediaTypes, setSupportedMediaTypes] = useState<string[]>(data.supportedMediaTypes || ['image', 'video', 'audio', 'document']);
  const [maxFileSize, setMaxFileSize] = useState(data.maxFileSize || 10);
  const [includeFileMetadata, setIncludeFileMetadata] = useState(data.includeFileMetadata !== false);
  const [mediaProcessingMode, setMediaProcessingMode] = useState(data.mediaProcessingMode || 'url');
  const [showMediaConfig, setShowMediaConfig] = useState(false);

  const { setNodes } = useReactFlow();

  const standardHandleStyle = {
    width: 12,
    height: 12,
    backgroundColor: '#f97316',
    border: '2px solid white',
  };

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
    const operationData = N8N_OPERATIONS.find(operation => operation.id === op);
    return operationData?.color || 'text-muted-foreground';
  };

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error(t('flow_builder.n8n_copy_failed', 'Failed to copy text: '), err);
    }
  };

  const validateField = (fieldName: string, value: string, required: boolean = false) => {
    let isValid = true;
    let message = '';

    if (required && !value.trim()) {
      isValid = false;
      message = t('flow_builder.n8n_field_required', 'This field is required');
    } else if (fieldName === 'instanceUrl' && value) {
      const urlPattern = /^https?:\/\/.+/;
      if (!urlPattern.test(value)) {
        isValid = false;
        message = t('flow_builder.n8n_invalid_url', 'Please enter a valid URL (e.g., https://your-n8n-instance.com)');
      }
    } else if (fieldName === 'timeout' && value) {
      const timeoutNum = parseInt(value);
      if (isNaN(timeoutNum) || timeoutNum < 1 || timeoutNum > 300) {
        isValid = false;
        message = t('flow_builder.n8n_timeout_range', 'Timeout must be between 1 and 300 seconds');
      }
    }

    setFieldValidation(prev => ({
      ...prev,
      [fieldName]: { isValid, message }
    }));

    return isValid;
  };

  const calculateProgress = () => {
    const requiredFields = [instanceUrl, workflowName, operation];
    const filledRequired = requiredFields.filter(field => field && field.trim()).length;
    const optionalFields = [apiKey, webhookUrl];
    const filledOptional = optionalFields.filter(field => field && field.trim()).length;

    const progress = ((filledRequired / requiredFields.length) * 70) + ((filledOptional / optionalFields.length) * 30);
    setConfigurationProgress(Math.round(progress));
  };

  useEffect(() => {
    calculateProgress();
  }, [instanceUrl, workflowName, operation, apiKey, webhookUrl]);

  useEffect(() => {
    updateNodeData({
      instanceUrl,
      apiKey,
      webhookUrl,
      chatWebhookUrl,
      workflowId,
      workflowName,
      operation,
      timeout,
      enableMediaSupport,
      supportedMediaTypes,
      maxFileSize,
      includeFileMetadata,
      mediaProcessingMode
    });
  }, [
    updateNodeData,
    instanceUrl,
    apiKey,
    webhookUrl,
    chatWebhookUrl,
    workflowId,
    workflowName,
    operation,
    timeout,
    enableMediaSupport,
    supportedMediaTypes,
    maxFileSize,
    includeFileMetadata,
    mediaProcessingMode
  ]);

  const testConnection = async () => {
    if (!instanceUrl.trim()) {
      setTestResult({
        success: false,
        error: t('flow_builder.n8n_instance_url_required', 'Please enter your n8n instance URL')
      });
      setShowTestResult(true);
      return;
    }

    try {
      new URL(instanceUrl);
    } catch {
      setTestResult({
        success: false,
        error: t('flow_builder.n8n_invalid_url_format', 'Invalid URL format. Please enter a valid URL (e.g., https://your-instance.app.n8n.cloud)')
      });
      setShowTestResult(true);
      return;
    }


    if (!webhookUrl.trim() && !(workflowName.trim() && apiKey.trim())) {
      setTestResult({
        success: false,
        error: t('flow_builder.n8n_webhook_or_workflow_required', 'Either webhook URL or (workflow name + API key) is required to execute the workflow')
      });
      setShowTestResult(true);
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setShowTestResult(true);

    try {

      const response = await fetch('/api/n8n/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instanceUrl: instanceUrl.trim(),
          apiKey: apiKey.trim(),
          webhookUrl: webhookUrl.trim(),
          chatWebhookUrl: chatWebhookUrl.trim(),
          workflowName: workflowName.trim(),
          operation: operation,
          enableMediaSupport,
          supportedMediaTypes,
          maxFileSize,
          includeFileMetadata,
          mediaProcessingMode
        })
      });

      const result = await response.json();

      if (result.success) {
        setTestResult({
          success: true,
          data: result.data,
          message: result.message
        });
      } else {
        setTestResult({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error('Error testing n8n connection:', error);
      setTestResult({
        success: false,
        error: t('flow_builder.n8n_test_connection_failed', 'Failed to test connection. Please check your configuration and try again.')
      });
    } finally {
      setIsTesting(false);
    }
  };

  const listWorkflows = async () => {
    if (!instanceUrl.trim() || !apiKey.trim()) {
      setTestResult({
        success: false,
        error: t('flow_builder.n8n_list_workflows_required', 'Please enter instance URL and API key to list workflows')
      });
      setShowTestResult(true);
      return;
    }

    setIsListingWorkflows(true);
    setTestResult(null);
    setShowTestResult(true);

    try {
      const response = await fetch('/api/n8n/list-workflows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instanceUrl: instanceUrl.trim(),
          apiKey: apiKey.trim()
        })
      });

      const result = await response.json();

      if (result.success) {
        setWorkflowsList(result.workflows);
        if (result.workflows && result.workflows.length > 0) {
          setShowWorkflowSelector(true);
          setTestResult({
            success: true,
            message: result.message
          });
        } else {
          setTestResult({
            success: false,
            error: t('flow_builder.n8n_no_workflows_found', 'No workflows found in your n8n instance')
          });
          setShowTestResult(true);
        }
      } else {
        setTestResult({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error('Error listing n8n workflows:', error);
      setTestResult({
        success: false,
        error: t('flow_builder.n8n_list_workflows_failed', 'Failed to list workflows. Please check your configuration and try again.')
      });
    } finally {
      setIsListingWorkflows(false);
    }
  };

  const selectWorkflow = (workflow: any, index: number) => {
    setWorkflowName(workflow.id.toString());
    setSelectedWorkflowIndex(index);
    setShowWorkflowSelector(false);
    setTestResult({
      success: true,
      message: t('flow_builder.n8n_workflow_selected', '✓ Selected workflow: "{{name}}" (ID: {{id}})', { name: workflow.name, id: workflow.id })
    });
    setShowTestResult(true);

    setTimeout(() => {
      setShowTestResult(false);
    }, 3000);
  };

  const closeWorkflowSelector = () => {
    setShowWorkflowSelector(false);
    setSelectedWorkflowIndex(null);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (showWorkflowSelector && event.key === 'Escape') {
        closeWorkflowSelector();
      }
    };

    if (showWorkflowSelector) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [showWorkflowSelector]);



  return (
    <div className="node-n8n p-3 rounded-lg bg-card border border-border shadow-sm min-w-[380px] max-w-[480px] group">
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
              <p className="text-xs">{t('flow_builder.n8n_delete_node', 'Delete node')}</p>
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
                src="https://registry.npmmirror.com/@lobehub/icons-static-png/1.75.0/files/dark/n8n-color.png" 
                alt="n8n" 
                className="h-4 w-4"
              />
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{t('flow_builder.n8n_workflow_integration', 'n8n Workflow Automation Integration')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span>n8n Integration</span>

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
              <p className="text-xs">{t('flow_builder.n8n_configuration_completeness', 'Configuration completeness: {{progress}}%', { progress: configurationProgress })}</p>
              <p className="text-xs text-muted-foreground">
                {configurationProgress < 70 ? t('flow_builder.n8n_complete_required_fields', 'Complete required fields to reach 70%') : t('flow_builder.n8n_configuration_ready', 'Configuration ready!')}
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
                {isEditing ? t('flow_builder.n8n_hide', 'Hide') : t('flow_builder.n8n_edit', 'Edit')}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{isEditing ? t('flow_builder.n8n_hide_configuration_panel', 'Hide configuration panel') : t('flow_builder.n8n_show_configuration_panel', 'Show configuration panel')}</p>
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
                  <span className="text-lg">{N8N_OPERATIONS.find(op => op.id === operation)?.icon || '⚙️'}</span>
                  <span className={cn("font-medium", getOperationColor(operation))}>
                    {N8N_OPERATIONS.find(op => op.id === operation)?.name || operation}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs font-medium">{N8N_OPERATIONS.find(op => op.id === operation)?.name}</p>
                <p className="text-xs text-muted-foreground">{N8N_OPERATIONS.find(op => op.id === operation)?.tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <span className="text-muted-foreground">•</span>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  {workflowName || webhookUrl ? (
                    <CheckCircle className="h-3 w-3 text-primary" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-secondary" />
                  )}
                  <span className="text-xs text-muted-foreground truncate">
                    {workflowName || webhookUrl ? t('flow_builder.n8n_configured', 'Configured') : t('flow_builder.n8n_not_configured', 'Not configured')}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">
                  {workflowName || webhookUrl
                    ? t('flow_builder.n8n_connection_configured', 'n8n connection is properly configured')
                    : t('flow_builder.n8n_configure_connection', 'Please configure n8n instance URL and workflow details')
                  }
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="mt-1 flex flex-wrap gap-1">
          {workflowName && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded cursor-help">
                    {t('flow_builder.n8n_workflow_label', 'Workflow:')} {workflowName.length > 12 ? workflowName.slice(0, 12) + '...' : workflowName}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{t('flow_builder.n8n_target_workflow', 'Target workflow: {{name}}', { name: workflowName })}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {webhookUrl && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded cursor-help">
                    Webhook Connected
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Webhook URL configured</p>
                  <p className="text-xs text-muted-foreground">{webhookUrl}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Removed config badge - not needed for simplified chat AI workflows */}

          {/* Removed variable mappings badge - not needed for simplified chat AI workflows */}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge className="text-[10px] bg-muted text-muted-foreground border border-border px-1 py-0.5 rounded cursor-help">
                  Timeout: {timeout}s
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">Request timeout: {timeout} seconds</p>
                <p className="text-xs text-muted-foreground">Maximum time to wait for n8n response</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {enableMediaSupport && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded cursor-help">
                    📎 {t('flow_builder.n8n_media_configuration', 'Media Support')}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{t('flow_builder.n8n_multimedia_support', 'Multimedia support enabled')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('flow_builder.n8n_supports', 'Supports: {{types}}', { types: supportedMediaTypes.join(', ') })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('flow_builder.n8n_max_size', 'Max size: {{size}}MB', { size: maxFileSize })}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="mt-3 text-xs space-y-3 border rounded p-2 ">
          {/* Removed Quick Templates section - not needed for simplified chat AI workflows */}

          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="h-3.5 w-3.5 text-primary" />
              <Label className="font-medium">{t('flow_builder.n8n_api_configuration', 'n8n API Configuration')}</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">{t('flow_builder.n8n_configure_connection_help', 'Configure connection to your n8n instance')}</p>
                    <p className="text-xs text-muted-foreground">{t('flow_builder.n8n_required_fields_marked', 'Required fields are marked with *')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Instance URL */}
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Label className="text-xs font-medium">{t('flow_builder.n8n_instance_url_label', 'Instance URL *')}</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs font-medium">{t('flow_builder.n8n_instance_url_help_title', 'Your n8n instance URL')}</p>
                      <p className="text-xs text-muted-foreground">{t('flow_builder.n8n_instance_url_examples', 'Examples:')}</p>
                      <p className="text-xs text-muted-foreground">{t('flow_builder.n8n_instance_url_example1', '• https://your-n8n.example.com')}</p>
                      <p className="text-xs text-muted-foreground">{t('flow_builder.n8n_instance_url_example2', '• https://n8n.yourcompany.com')}</p>
                      <p className="text-xs text-muted-foreground">{t('flow_builder.n8n_instance_url_example3', '• http://localhost:5678 (for local)')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="relative">
                <Input
                  placeholder={t('flow_builder.n8n_instance_url_placeholder', 'https://your-n8n-instance.com')}
                  value={instanceUrl}
                  onChange={(e) => {
                    setInstanceUrl(e.target.value);
                    validateField('instanceUrl', e.target.value, true);
                  }}
                  className={cn(
                    "text-xs h-7 pr-8",
                    fieldValidation.instanceUrl?.isValid === false ? "border-destructive" :
                    fieldValidation.instanceUrl?.isValid === true ? "border-primary" : ""
                  )}
                />
                {instanceUrl && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-0.5 h-6 w-6 p-0"
                          onClick={() => copyToClipboard(instanceUrl, 'instanceUrl')}
                        >
                          {copiedField === 'instanceUrl' ? (
                            <CheckCircle className="h-3 w-3 text-primary" />
                          ) : (
                            <Copy className="h-3 w-3 text-muted-foreground" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs">
                          {copiedField === 'instanceUrl' ? t('flow_builder.n8n_copied', 'Copied!') : t('flow_builder.n8n_copy_url_clipboard', 'Copy URL to clipboard')}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              {fieldValidation.instanceUrl?.message && (
                <p className="text-[10px] text-destructive mt-1">{fieldValidation.instanceUrl.message}</p>
              )}
            </div>

            {/* API Key */}
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Label className="text-xs font-medium">{t('flow_builder.n8n_api_key_label', 'API Key')}</Label>
                <Badge variant="secondary" className="text-[9px] px-1 py-0">{t('flow_builder.n8n_optional', 'Optional')}</Badge>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs font-medium">{t('flow_builder.n8n_api_key_help_title', 'n8n API Key (optional)')}</p>
                      <p className="text-xs text-muted-foreground">{t('flow_builder.n8n_api_key_help_find', 'How to find your API key:')}</p>
                      <p className="text-xs text-muted-foreground">{t('flow_builder.n8n_api_key_step1', '1. Go to n8n Settings → API')}</p>
                      <p className="text-xs text-muted-foreground">{t('flow_builder.n8n_api_key_step2', '2. Create a new API key')}</p>
                      <p className="text-xs text-muted-foreground">{t('flow_builder.n8n_api_key_step3', '3. Copy and paste it here')}</p>
                      <p className="text-xs text-secondary">{t('flow_builder.n8n_api_key_required_private', 'Required for private instances')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                type="password"
                placeholder={t('flow_builder.n8n_api_key_placeholder', 'n8n_api_key_...')}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="text-xs h-7"
              />
            </div>

            {/* Workflow ID/Name */}
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Label className="text-xs font-medium">{t('flow_builder.n8n_workflow_id_name_label', 'Workflow ID/Name *')}</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs font-medium">{t('flow_builder.n8n_workflow_identifier_help_title', 'Target workflow identifier')}</p>
                      <p className="text-xs text-muted-foreground">{t('flow_builder.n8n_workflow_identifier_help_use', 'You can use either:')}</p>
                      <p className="text-xs text-muted-foreground">{t('flow_builder.n8n_workflow_identifier_id', '• Workflow ID (numeric)')}</p>
                      <p className="text-xs text-muted-foreground">{t('flow_builder.n8n_workflow_identifier_name', '• Workflow name (text)')}</p>
                      <p className="text-xs text-muted-foreground">{t('flow_builder.n8n_workflow_identifier_find', 'Find this in your n8n workflows list')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                placeholder={t('flow_builder.n8n_workflow_placeholder', 'my-workflow or 123')}
                value={workflowName}
                onChange={(e) => {
                  setWorkflowName(e.target.value);
                  setSelectedWorkflowIndex(null); // Clear selection when manually typing
                  validateField('workflowName', e.target.value, true);
                }}
                className={cn(
                  "text-xs h-7",
                  selectedWorkflowIndex !== null ? "border-primary bg-primary/10" :
                  fieldValidation.workflowName?.isValid === false ? "border-destructive" :
                  fieldValidation.workflowName?.isValid === true ? "border-primary" : ""
                )}
              />
              {fieldValidation.workflowName?.message && (
                <p className="text-[10px] text-destructive mt-1">{fieldValidation.workflowName.message}</p>
              )}
            </div>

            {/* Chat Webhook URL */}
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Label className="text-xs font-medium">{t('flow_builder.n8n_chat_webhook_url_label', 'Chat Webhook URL')}</Label>
                <Badge variant="secondary" className="text-[8px] px-1 py-0">{t('flow_builder.n8n_optional', 'Optional')}</Badge>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs font-medium">{t('flow_builder.n8n_webhook_help_title', 'Direct URL to your n8n chat trigger webhook')}</p>
                      <p className="text-xs text-muted-foreground">{t('flow_builder.n8n_webhook_help_use', 'Use this if automatic webhook detection fails')}</p>
                      <p className="text-xs text-muted-foreground">{t('flow_builder.n8n_webhook_help_example', 'Example: https://n8n.com/webhook/your-webhook-id/chat')}</p>
                      <p className="text-xs text-primary">{t('flow_builder.n8n_webhook_help_priority', 'Takes priority over automatic detection')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                placeholder={t('flow_builder.n8n_webhook_placeholder', 'https://n8n.com/webhook/your-webhook-id/chat')}
                value={chatWebhookUrl}
                onChange={(e) => setChatWebhookUrl(e.target.value)}
                className="text-xs h-7"
              />
              {chatWebhookUrl && (
                <p className="text-[10px] text-primary mt-1">{t('flow_builder.n8n_webhook_direct_url', '✓ Direct webhook URL will be used')}</p>
              )}
            </div>

            {/* Timeout */}
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Label className="text-xs font-medium">{t('flow_builder.n8n_timeout_label', 'Timeout (seconds)')}</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs font-medium">{t('flow_builder.n8n_timeout_help_title', 'Request timeout')}</p>
                      <p className="text-xs text-muted-foreground">{t('flow_builder.n8n_timeout_help_description', 'Maximum time to wait for n8n response')}</p>
                      <p className="text-xs text-muted-foreground">{t('flow_builder.n8n_timeout_help_range', 'Range: 1-300 seconds')}</p>
                      <p className="text-xs text-muted-foreground">{t('flow_builder.n8n_timeout_help_default', 'Default: 30 seconds')}</p>
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
            </div>

            {/* Test Connection */}
            <div className="flex gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 flex-1"
                      onClick={testConnection}
                      disabled={isTesting || !instanceUrl.trim() ||
                        !(webhookUrl.trim() || (workflowName.trim() && apiKey.trim()))}
                    >
                      {isTesting ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Play className="h-3 w-3 mr-1" />
                      )}
                      {isTesting ? t('flow_builder.n8n_executing', 'Executing...') : t('flow_builder.n8n_execute_workflow', 'Execute Workflow')}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">{t('flow_builder.n8n_execute_workflow_help', 'Execute your n8n workflow')}</p>
                    <p className="text-xs text-muted-foreground">
                      {!instanceUrl.trim()
                        ? t('flow_builder.n8n_enter_url_to_enable', 'Enter your n8n instance URL to enable execution')
                        : operation === 'webhook_trigger' && webhookUrl.trim()
                          ? t('flow_builder.n8n_execute_via_webhook', 'Execute workflow via webhook URL')
                          : workflowName.trim() && apiKey.trim()
                            ? t('flow_builder.n8n_execute_via_api', 'Execute workflow via n8n API')
                            : t('flow_builder.n8n_enter_workflow_api_key', 'Enter workflow name and API key to execute via API')
                      }
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={listWorkflows}
                      disabled={isListingWorkflows || !instanceUrl.trim() || !apiKey.trim()}
                    >
                      {isListingWorkflows ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <List className="h-3 w-3" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">{t('flow_builder.n8n_list_workflows_help', 'List workflows to find correct ID/name')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => window.open('https://docs.n8n.io/api/', '_blank')}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">{t('flow_builder.n8n_open_api_docs', 'Open n8n API documentation')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
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
                  {t('flow_builder.n8n_media_configuration', 'Media Support')}
                </Button>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-sm">
                      <p className="text-xs font-medium">{t('flow_builder.n8n_multimedia_support_help_title', 'Multimedia Message Support')}</p>
                      <p className="text-xs text-muted-foreground mb-2">
                        {t('flow_builder.n8n_multimedia_support_help_description', 'Configure how your n8n workflow handles images, videos, audio, and documents from WhatsApp users.')}
                      </p>
                      <div className="text-xs space-y-1">
                        <p className="font-medium text-primary">{t('flow_builder.n8n_input_support_title', '📥 Input Support:')}</p>
                        <p>{t('flow_builder.n8n_input_support_receive', '• Receive media files with URLs and metadata')}</p>
                        <p>{t('flow_builder.n8n_input_support_validation', '• File type validation and size limits')}</p>
                        <p>{t('flow_builder.n8n_input_support_enhanced', '• Enhanced message payload with media info')}</p>
                        <p className="font-medium text-primary mt-2">{t('flow_builder.n8n_output_support_title', '📤 Output Support:')}</p>
                        <p>{t('flow_builder.n8n_output_support_return', '• Return media URLs in n8n response')}</p>
                        <p>{t('flow_builder.n8n_output_support_multiple', '• Support for multiple media attachments')}</p>
                        <p>{t('flow_builder.n8n_output_support_delivery', '• Automatic WhatsApp media delivery')}</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {showMediaConfig && (
                <div className="space-y-3 p-3 bg-primary/10 border border-primary/20 rounded">
                  {/* Enable Media Support Toggle */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs font-medium">{t('flow_builder.n8n_enable_media_support', 'Enable Media Support')}</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p className="text-xs">{t('flow_builder.n8n_enable_media_support_help', 'Allow n8n workflow to receive and process multimedia messages')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <input
                      type="checkbox"
                      checked={enableMediaSupport}
                      onChange={(e) => setEnableMediaSupport(e.target.checked)}
                      className="h-4 w-4"
                    />
                  </div>

                  {enableMediaSupport && (
                    <>
                      {/* Supported Media Types */}
                      <div>
                        <Label className="text-xs font-medium mb-2 block">{t('flow_builder.n8n_supported_media_types', 'Supported Media Types')}</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {SUPPORTED_MEDIA_TYPES.map((mediaType) => (
                            <div key={mediaType.id} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={supportedMediaTypes.includes(mediaType.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSupportedMediaTypes([...supportedMediaTypes, mediaType.id]);
                                  } else {
                                    setSupportedMediaTypes(supportedMediaTypes.filter(type => type !== mediaType.id));
                                  }
                                }}
                                className="h-3 w-3"
                              />
                              <mediaType.icon className="h-3 w-3 text-primary" />
                              <span className="text-xs">{mediaType.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Max File Size */}
                      <div>
                        <Label className="text-xs font-medium mb-1 block">{t('flow_builder.n8n_max_file_size_label', 'Max File Size (MB)')}</Label>
                        <NumberInput
                          min={1}
                          max={50}
                          value={maxFileSize}
                          onChange={setMaxFileSize}
                          fallbackValue={10}
                          className="text-xs h-7"
                        />
                      </div>

                      {/* Media Processing Mode */}
                      <div>
                        <Label className="text-xs font-medium mb-1 block">{t('flow_builder.n8n_media_processing_mode_label', 'Media Processing Mode')}</Label>
                        <Select value={mediaProcessingMode} onValueChange={setMediaProcessingMode}>
                          <SelectTrigger className="text-xs h-7">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="url">
                              <div>
                                <div className="font-medium">{t('flow_builder.n8n_url_only', 'URL Only')}</div>
                                <div className="text-xs text-muted-foreground">{t('flow_builder.n8n_url_only_description', 'Send media URL to n8n workflow')}</div>
                              </div>
                            </SelectItem>
                            <SelectItem value="metadata">
                              <div>
                                <div className="font-medium">{t('flow_builder.n8n_url_metadata', 'URL + Metadata')}</div>
                                <div className="text-xs text-muted-foreground">{t('flow_builder.n8n_url_metadata_description', 'Include file size, type, and metadata')}</div>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Include File Metadata */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs font-medium">{t('flow_builder.n8n_include_file_metadata', 'Include File Metadata')}</Label>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p className="text-xs">{t('flow_builder.n8n_include_file_metadata_help', 'Include MIME type, file size, and original filename')}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <input
                          type="checkbox"
                          checked={includeFileMetadata}
                          onChange={(e) => setIncludeFileMetadata(e.target.checked)}
                          className="h-4 w-4"
                        />
                      </div>
                    </>
                  )}

                  {/* Media Support Examples */}
                  {enableMediaSupport && (
                    <div className="mt-3 p-2 bg-primary/10 border border-primary/20 rounded text-xs">
                      <div className="font-medium text-primary mb-2">{t('flow_builder.n8n_integration_examples', '📋 Integration Examples')}</div>
                      <div className="space-y-2 text-primary">
                        <div>
                          <div className="font-medium">{t('flow_builder.n8n_input_payload_structure', 'Input Payload Structure:')}</div>
                          <code className="text-xs bg-card p-1 rounded block mt-1">
                            {`{
  "chatInput": "User message",
  "messageType": "image",
  "isMediaMessage": true,
  "media": {
    "url": "https://...",
    "type": "image",
    "metadata": { ... }
  }
}`}
                          </code>
                        </div>
                        <div>
                          <div className="font-medium">{t('flow_builder.n8n_response_format', 'Response Format:')}</div>
                          <code className="text-xs bg-card p-1 rounded block mt-1">
                            {`{
  "text": "AI response text",
  "media": [{
    "type": "image",
    "url": "https://...",
    "caption": "Image caption"
  }]
}`}
                          </code>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Workflow Selector */}
            {showWorkflowSelector && (
              <div className="mt-2 p-3 bg-muted border border-border rounded">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-medium text-foreground">{t('flow_builder.n8n_select_workflow', 'Select Workflow')}</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={closeWorkflowSelector}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {workflowsList.length > 0 ? (
                    workflowsList.map((workflow: any, index: number) => (
                      <div
                        key={index}
                        className={cn(
                          "p-2 rounded cursor-pointer border transition-colors text-xs",
                          selectedWorkflowIndex === index
                            ? "bg-primary/10 border-primary/20"
                            : "bg-card border-border hover:bg-muted"
                        )}
                        onClick={() => selectWorkflow(workflow, index)}
                      >
                        <div className="font-medium text-foreground">
                          {t('flow_builder.n8n_workflow_id_name', 'ID: {{id}} - Name: {{name}}', { id: workflow.id, name: workflow.name })}
                        </div>
                        <div className="text-muted-foreground mt-1">
                          {t('flow_builder.n8n_workflow_active', 'Active: {{status}}', { status: workflow.active ? t('flow_builder.n8n_yes', 'Yes') : t('flow_builder.n8n_no', 'No') })}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-muted-foreground text-xs">
                      <img 
                        src="https://registry.npmmirror.com/@lobehub/icons-static-png/1.75.0/files/dark/n8n-color.png" 
                        alt="n8n" 
                        className="h-8 w-8 mx-auto mb-2 opacity-50"
                      />
                      <p>{t('flow_builder.n8n_no_workflows_found_title', 'No workflows found')}</p>
                      <p className="text-muted-foreground opacity-50 mt-1">{t('flow_builder.n8n_create_workflows_first', 'Create workflows in your n8n instance first')}</p>
                    </div>
                  )}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {workflowsList.length > 0
                    ? t('flow_builder.n8n_click_workflow_select', 'Click on a workflow to select it and populate the Workflow ID/Name field.')
                    : t('flow_builder.n8n_ensure_instance_running', 'Make sure your n8n instance is running and contains workflows.')
                  }
                </div>
              </div>
            )}

            {/* Test Result Display */}
            {showTestResult && testResult && (
              <div className={cn(
                "p-2 rounded text-xs",
                testResult.success ? "bg-primary/10 border border-primary/20" : "bg-destructive/10 border border-destructive/20"
              )}>
                <div className="flex items-center gap-1 mb-1">
                  {testResult.success ? (
                    <CheckCircle className="h-3 w-3 text-primary" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-destructive" />
                  )}
                  <span className={testResult.success ? "text-primary" : "text-destructive"}>
                    {testResult.success ? t('flow_builder.n8n_connection_successful', 'Connection Successful') : t('flow_builder.n8n_connection_failed', 'Connection Failed')}
                  </span>
                </div>
                {testResult.message && (
                  <p className="text-muted-foreground">{testResult.message}</p>
                )}
                {testResult.error && (
                  <p className="text-destructive">{testResult.error}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
    </div>
  );
}
