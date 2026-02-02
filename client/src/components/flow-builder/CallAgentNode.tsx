import { useState, useCallback, useEffect } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { Trash2, Copy, Phone, PhoneCall, Play, Loader2, CheckCircle, XCircle, Eye, EyeOff, ChevronDown, ChevronUp, Plus, X, Shield } from 'lucide-react';
import { useFlowContext } from '../../pages/flow-builder';
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
import { Badge } from "@/components/ui/badge";
import { cn } from '@/lib/utils';
import { standardHandleStyle } from './StyledHandle';
import { useTranslation } from '@/hooks/use-translation';

interface VoiceSettings {
  stability?: number;
  similarity_boost?: number;
}

interface HeaderPair {
  key: string;
  value: string;
}

interface CallAgentNodeProps {
  id: string;
  data: {
    label: string;
    twilioAccountSid?: string;
    twilioAuthToken?: string;
    twilioFromNumber?: string;
    elevenLabsApiKey?: string;
    elevenLabsAgentId?: string;
    customAgentPrompt?: string;
    voiceId?: string;
    voiceSettings?: VoiceSettings;
    toPhoneNumber?: string;
    timeout?: number;
    maxCallDuration?: number;
    retryAttempts?: number;
    retryDelay?: number;
    executionMode?: 'blocking' | 'async';
    waitForCompletion?: boolean;
    enableInbound?: boolean;
    webhookUrl?: string;
    autoGenerateWebhook?: boolean;
    recordCall?: boolean;
    transcribeCall?: boolean;
    detectVoicemail?: boolean;
    customHeaders?: HeaderPair[];
    onDeleteNode?: (id: string) => void;
    onDuplicateNode?: (id: string) => void;
  };
  isConnectable: boolean;
}

export function CallAgentNode({ id, data, isConnectable }: CallAgentNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  

  const [twilioAccountSid, setTwilioAccountSid] = useState(data.twilioAccountSid || '');
  const [twilioAuthToken, setTwilioAuthToken] = useState(data.twilioAuthToken || '');
  const [twilioFromNumber, setTwilioFromNumber] = useState(data.twilioFromNumber || '');
  

  const [elevenLabsApiKey, setElevenLabsApiKey] = useState(data.elevenLabsApiKey || '');
  const [elevenLabsAgentId, setElevenLabsAgentId] = useState(data.elevenLabsAgentId || '');
  const [customAgentPrompt, setCustomAgentPrompt] = useState(data.customAgentPrompt || '');
  const [voiceId, setVoiceId] = useState(data.voiceId || '');
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(data.voiceSettings || { stability: 0.5, similarity_boost: 0.75 });
  

  const [toPhoneNumber, setToPhoneNumber] = useState(data.toPhoneNumber || '{{contact.phone}}');
  const [timeout, setTimeoutValue] = useState(data.timeout || 300);
  const [maxCallDuration, setMaxCallDuration] = useState(data.maxCallDuration || 600);
  const [retryAttempts, setRetryAttempts] = useState(data.retryAttempts || 0);
  const [retryDelay, setRetryDelay] = useState(data.retryDelay || 60);
  

  const [executionMode, setExecutionMode] = useState<'blocking' | 'async'>(data.executionMode || 'blocking');
  const [waitForCompletion, setWaitForCompletion] = useState(data.waitForCompletion !== undefined ? data.waitForCompletion : false);
  

  const [enableInbound, setEnableInbound] = useState(data.enableInbound || false);
  const [webhookUrl, setWebhookUrl] = useState(data.webhookUrl || '');
  const [autoGenerateWebhook, setAutoGenerateWebhook] = useState(data.autoGenerateWebhook !== undefined ? data.autoGenerateWebhook : true);
  

  const [recordCall, setRecordCall] = useState(data.recordCall || false);
  const [transcribeCall, setTranscribeCall] = useState(data.transcribeCall || false);
  const [detectVoicemail, setDetectVoicemail] = useState(data.detectVoicemail || false);
  const [customHeaders, setCustomHeaders] = useState<HeaderPair[]>(data.customHeaders || []);
  

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    callSid?: string;
    duration?: number;
    error?: string;
    transcript?: string;
  } | null>(null);
  const [showTestResult, setShowTestResult] = useState(false);
  

  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    success: boolean;
    valid: boolean;
    accountInfo?: {
      friendlyName: string;
      status: string;
      type: string;
    };
    formatIssues?: string[];
    error?: string;
    errorCode?: number;
    suggestions?: string[];
    documentation?: string;
  } | null>(null);
  const [showValidationResult, setShowValidationResult] = useState(false);
  
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showWebhookConfig, setShowWebhookConfig] = useState(false);
  const [agentConfigMode, setAgentConfigMode] = useState<'agentId' | 'customPrompt'>(data.elevenLabsAgentId ? 'agentId' : 'customPrompt');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [configProgress, setConfigProgress] = useState(0);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showVariablePreview, setShowVariablePreview] = useState(false);
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [problematicCharsWarning, setProblematicCharsWarning] = useState<string | null>(null);

  const { setNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode } = useFlowContext();

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

  useEffect(() => {
    updateNodeData({
      label: data.label,
      twilioAccountSid,
      twilioAuthToken,
      twilioFromNumber,
      elevenLabsApiKey,
      elevenLabsAgentId,
      customAgentPrompt,
      voiceId,
      voiceSettings,
      toPhoneNumber,
      timeout,
      maxCallDuration,
      retryAttempts,
      retryDelay,
      executionMode,
      waitForCompletion,
      enableInbound,
      webhookUrl,
      autoGenerateWebhook,
      recordCall,
      transcribeCall,
      detectVoicemail,
      customHeaders
    });
  }, [
    updateNodeData,
    twilioAccountSid,
    twilioAuthToken,
    twilioFromNumber,
    elevenLabsApiKey,
    elevenLabsAgentId,
    customAgentPrompt,
    voiceId,
    voiceSettings,
    toPhoneNumber,
    timeout,
    maxCallDuration,
    retryAttempts,
    retryDelay,
    executionMode,
    waitForCompletion,
    enableInbound,
    webhookUrl,
    autoGenerateWebhook,
    recordCall,
    transcribeCall,
    detectVoicemail,
    customHeaders
  ]);


  const validatePhoneNumber = (phone: string): boolean => {
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phone);
  };

  const validateTwilioCredentials = (): boolean => {
    const errors: Record<string, string> = {};
    

    if (!twilioAccountSid) {
      errors.twilioAccountSid = t('flow_builder.call_agent.invalid_account_sid', 'Account SID is required');
    } else if (!twilioAccountSid.startsWith('AC')) {
      errors.twilioAccountSid = t('flow_builder.call_agent.invalid_account_sid', 'Account SID must start with AC');
    } else if (twilioAccountSid.length !== 34) {
      errors.twilioAccountSid = t('flow_builder.call_agent.exact_length_required', 'Exact length required') + ': ' + 
        t('flow_builder.call_agent.account_sid_length', 'Account SID must be exactly 34 characters (currently: {length})').replace('{length}', twilioAccountSid.length.toString());
    } else if (hasProblematicCharacters(twilioAccountSid)) {
      errors.twilioAccountSid = t('flow_builder.call_agent.credential_contains_hidden_chars', 'Credential contains hidden whitespace or special characters - please re-enter');
    }
    

    if (!twilioAuthToken) {
      errors.twilioAuthToken = t('flow_builder.call_agent.invalid_auth_token', 'Auth token is required');
    } else if (twilioAuthToken.length !== 32) {
      errors.twilioAuthToken = t('flow_builder.call_agent.exact_length_required', 'Exact length required') + ': ' + 
        t('flow_builder.call_agent.auth_token_length', 'Auth Token must be exactly 32 characters (currently: {length})').replace('{length}', twilioAuthToken.length.toString());
    } else if (hasProblematicCharacters(twilioAuthToken)) {
      errors.twilioAuthToken = t('flow_builder.call_agent.credential_contains_hidden_chars', 'Credential contains hidden whitespace or special characters - please re-enter');
    }
    

    if (!twilioFromNumber || !validatePhoneNumber(twilioFromNumber)) {
      errors.twilioFromNumber = t('flow_builder.call_agent.invalid_from_number', 'From number must be in E.164 format');
    }
    
    setValidationErrors(prev => {
      const newErrors = { ...prev };

      if (!errors.twilioAccountSid) delete newErrors.twilioAccountSid;
      if (!errors.twilioAuthToken) delete newErrors.twilioAuthToken;
      if (!errors.twilioFromNumber) delete newErrors.twilioFromNumber;

      return { ...newErrors, ...errors };
    });
    return Object.keys(errors).length === 0;
  };

  const validateElevenLabsCredentials = (): boolean => {
    const errors: Record<string, string> = {};
    if (!elevenLabsApiKey) {
      errors.elevenLabsApiKey = t('flow_builder.call_agent.api_key_required', 'ElevenLabs API key is required');
    }
    if (agentConfigMode === 'agentId' && !elevenLabsAgentId) {
      errors.elevenLabsAgentId = t('flow_builder.call_agent.agent_id_required', 'Agent ID is required');
    }
    if (agentConfigMode === 'customPrompt' && !customAgentPrompt) {
      errors.customAgentPrompt = t('flow_builder.call_agent.prompt_required', 'Custom prompt is required');
    }
    setValidationErrors(prev => {
      const newErrors = { ...prev };

      if (!errors.elevenLabsApiKey) delete newErrors.elevenLabsApiKey;
      if (!errors.elevenLabsAgentId) delete newErrors.elevenLabsAgentId;
      if (!errors.customAgentPrompt) delete newErrors.customAgentPrompt;

      return { ...newErrors, ...errors };
    });
    return Object.keys(errors).length === 0;
  };

  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const calculateProgress = (): number => {
    let completed = 0;
    let total = 0;


    total += 3;
    if (twilioAccountSid && twilioAccountSid.startsWith('AC') && twilioAccountSid.length === 34 && !hasProblematicCharacters(twilioAccountSid)) completed++;
    if (twilioAuthToken && twilioAuthToken.length === 32 && !hasProblematicCharacters(twilioAuthToken)) completed++;
    if (twilioFromNumber && validatePhoneNumber(twilioFromNumber)) completed++;


    total += 2;
    if (elevenLabsApiKey) completed++;
    if (agentConfigMode === 'agentId' ? elevenLabsAgentId : customAgentPrompt) completed++;


    total += 1;
    if (toPhoneNumber) {
      const hasVariables = toPhoneNumber.includes('{{') && toPhoneNumber.includes('}}');
      if (hasVariables || validatePhoneNumber(toPhoneNumber)) {
        completed++;
      }
    }

    return Math.round((completed / total) * 100);
  };

  useEffect(() => {
    setConfigProgress(calculateProgress());
  }, [twilioAccountSid, twilioAuthToken, twilioFromNumber, elevenLabsApiKey, elevenLabsAgentId, customAgentPrompt, toPhoneNumber, agentConfigMode]);


  const replaceVariables = (text: string): string => {
    const testData: Record<string, string> = {
      'contact.name': 'Test Contact',
      'contact.phone': '+1234567890',
      'contact.email': 'test@example.com',
      'message.content': 'This is a test message',
      'date.today': new Date().toISOString().split('T')[0],
      'time.now': new Date().toLocaleTimeString(),
    };

    let result = text;
    Object.entries(testData).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, value);
    });

    return result;
  };

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const generateWebhookUrl = (): string => {
    const flowId = window.location.pathname.split('/').pop() || 'flow';
    return `${window.location.origin}/api/webhooks/call-agent/${flowId}/${id}`;
  };

  useEffect(() => {
    if (autoGenerateWebhook && enableInbound) {
      setWebhookUrl(generateWebhookUrl());
    }
  }, [autoGenerateWebhook, enableInbound, id]);

  const normalizePhoneNumber = (phone: string): string => {
    let n = phone.trim();
    n = n.replace(/[^\d+]/g, '');
    if (!n.startsWith('+')) n = `+${n}`;
    return n;
  };

  const getExecutionModeColor = (mode: string): string => {
    return mode === 'blocking' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-secondary/10 text-secondary border-secondary/20';
  };

  /**
   * Sanitize credential by removing problematic characters
   * Matches backend sanitization logic in call-agent-service.ts
   */
  const sanitizeCredential = (credential: string): string => {
    if (!credential) return credential;

    return credential.replace(/[\u200B-\u200D\uFEFF\u180E\u0000-\u001F\u007F-\u009F\s]/g, '');
  };

  /**
   * Detect if credential contains problematic characters
   */
  const hasProblematicCharacters = (credential: string): boolean => {
    if (!credential) return false;
    return /[\u200B-\u200D\uFEFF\u180E\u0000-\u001F\u007F-\u009F\s]/.test(credential);
  };

  /**
   * Get character count badge styling based on current vs expected length
   */
  const getCharCountBadgeClass = (current: number, expected: number): string => {
    if (current === expected) return 'bg-green-100 text-green-800 border-green-300';
    if (Math.abs(current - expected) <= 4) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-red-100 text-red-800 border-red-300';
  };


  const testCall = async () => {
    if (!validateTwilioCredentials() || !validateElevenLabsCredentials()) {
      setTestResult({
        success: false,
        error: t('flow_builder.call_agent.validation_failed', 'Please fix validation errors before testing')
      });
      setShowTestResult(true);
      return;
    }

    if (!toPhoneNumber || !validatePhoneNumber(toPhoneNumber)) {
      setTestResult({
        success: false,
        error: t('flow_builder.call_agent.invalid_phone', 'Invalid phone number format')
      });
      setShowTestResult(true);
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setShowTestResult(true);

    try {
      const response = await fetch('/api/call-agent/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          twilioAccountSid,
          twilioAuthToken,
          twilioFromNumber,
          elevenLabsApiKey,
          elevenLabsAgentId: agentConfigMode === 'agentId' ? elevenLabsAgentId : undefined,
          customAgentPrompt: agentConfigMode === 'customPrompt' ? customAgentPrompt : undefined,
          voiceId,
          voiceSettings,
          toPhoneNumber: normalizePhoneNumber(toPhoneNumber),
          timeout,
          maxCallDuration,
          retryAttempts,
          retryDelay,
          executionMode,
          recordCall,
          transcribeCall
        })
      });


      if (!response.ok) {

        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          }
        } catch (e) {

        }
        
        setTestResult({
          success: false,
          error: errorMessage
        });
        return;
      }


      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        setTestResult({
          success: false,
          error: t('flow_builder.call_agent.invalid_response', 'Server returned non-JSON response. The endpoint may not exist.')
        });
        return;
      }

      const result = await response.json();

      if (result.success) {
        setTestResult({
          success: true,
          callSid: result.callSid,
          duration: result.duration,
          transcript: result.transcript
        });
      } else {
        setTestResult({
          success: false,
          error: result.error || t('flow_builder.call_agent.test_failed', 'Test call failed')
        });
      }
    } catch (error: any) {

      setTestResult({
        success: false,
        error: error.message || t('flow_builder.call_agent.test_error', 'Error testing call')
      });
    } finally {
      setIsTesting(false);
    }
  };


  const validateCredentials = async () => {

    if (!twilioAccountSid || !twilioAuthToken) {
      setValidationResult({
        success: true,
        valid: false,
        error: 'Both Account SID and Auth Token are required',
        formatIssues: !twilioAccountSid ? ['Account SID is required'] : ['Auth Token is required']
      });
      setShowValidationResult(true);
      return;
    }


    const isValidFormat = validateTwilioCredentials();
    if (!isValidFormat) {

      const formatErrors = Object.values(validationErrors).filter(error => error);
      setValidationResult({
        success: true,
        valid: false,
        formatIssues: formatErrors,
        error: 'Invalid credential format',
        suggestions: [
          'Account SID must be 34 characters starting with "AC"',
          'Auth Token must be 32 alphanumeric characters',
          'Check for extra spaces or characters when copying'
        ]
      });
      setShowValidationResult(true);
      return;
    }

    setIsValidating(true);
    setValidationResult(null);
    setShowValidationResult(true);

    try {
      const response = await fetch('/api/call-agent/validate-credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          twilioAccountSid,
          twilioAuthToken
        })
      });


      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          }
        } catch (e) {

        }
        
        setValidationResult({
          success: false,
          valid: false,
          error: errorMessage
        });
        return;
      }


      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        setValidationResult({
          success: false,
          valid: false,
          error: 'Server returned non-JSON response. The endpoint may not exist.'
        });
        return;
      }

      const result = await response.json();
      setValidationResult(result);

    } catch (error: any) {

      setValidationResult({
        success: false,
        valid: false,
        error: error.message || 'Error validating credentials'
      });
    } finally {
      setIsValidating(false);
    }
  };

  const addHeader = () => {
    setCustomHeaders([...customHeaders, { key: '', value: '' }]);
  };

  const removeHeader = (index: number) => {
    setCustomHeaders(customHeaders.filter((_, i) => i !== index));
  };

  const updateHeader = (index: number, field: 'key' | 'value', value: string) => {
    const newHeaders = [...customHeaders];
    newHeaders[index][field] = value;
    setCustomHeaders(newHeaders);
  };

  return (
    <div className="node-call-agent rounded-lg bg-card border border-border shadow-sm max-w-[420px] group relative">
      <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onDuplicateNode(id)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{t('flow_builder.duplicate_node', 'Duplicate node')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

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

      {/* Header Section */}
      <div className="p-3 border-b border-primary/20 bg-primary/10">
        <div className="font-medium flex items-center gap-2">
          <img 
            src="https://cdn-icons-png.flaticon.com/128/8898/8898892.png" 
            alt="Call Agent" 
            className="h-4 w-4"
          />
          <span>{t('flow_builder.call_agent', 'Call Agent')}</span>
          <Badge
            variant={configProgress >= 70 ? "default" : "secondary"}
            className={cn(
              "text-[10px] px-1.5 py-0.5 ml-auto",
              configProgress >= 70 ? "bg-primary/10 text-primary border border-primary/20" : "bg-secondary/10 text-secondary border border-secondary/20"
            )}
          >
            {configProgress}%
          </Badge>
          <button
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
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

      {/* Summary Card */}
      <div className="text-sm p-3 rounded border border-border">
        <div className="flex items-center gap-1 mb-2">
          <span className={cn("text-[10px] px-1 py-0.5 rounded", getExecutionModeColor(executionMode))}>
            {executionMode === 'blocking' ? t('flow_builder.call_agent.blocking', 'Blocking') : t('flow_builder.call_agent.async', 'Async')}
          </span>
          <span className="text-xs text-muted-foreground">
            {toPhoneNumber ? (toPhoneNumber.length > 15 ? `${toPhoneNumber.substring(0, 15)}...` : toPhoneNumber) : t('flow_builder.call_agent.not_configured', 'Not configured')}
          </span>
        </div>

        <div className="flex flex-wrap gap-1">
          {twilioAccountSid && twilioAuthToken && twilioFromNumber && (
            <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded">
              {t('flow_builder.call_agent.twilio_configured', 'Twilio')}
            </span>
          )}
          {elevenLabsApiKey && (elevenLabsAgentId || customAgentPrompt) && (
            <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded">
              {t('flow_builder.call_agent.elevenlabs_configured', 'ElevenLabs')}
            </span>
          )}
          {enableInbound && (
            <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded">
              {t('flow_builder.call_agent.inbound_enabled', 'Inbound')}
            </span>
          )}
          {recordCall && (
            <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded">
              {t('flow_builder.call_agent.recording_enabled', 'Recording')}
            </span>
          )}
        </div>
      </div>

      {isEditing && (
        <div className={`max-h-[500px] overflow-y-auto custom-scrollbar`}>
          <div className="p-3 space-y-3">
            {/* Section A: Twilio Configuration */}
            <div className="text-xs space-y-2 border rounded p-2">
              <div className="flex items-center gap-2 mb-2">
                <Phone className="h-3.5 w-3.5 text-primary" />
                <Label className="font-medium">{t('flow_builder.call_agent.twilio_configuration', 'Twilio Configuration')}</Label>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs font-medium">{t('flow_builder.call_agent.twilio_account_sid', 'Account SID')}</Label>
                    {twilioAccountSid && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 w-4 p-0"
                              onClick={() => copyToClipboard(twilioAccountSid, 'accountSid')}
                            >
                              {copiedField === 'accountSid' ? (
                                <CheckCircle className="h-3 w-3 text-primary" />
                              ) : (
                                <Copy className="h-3 w-3 text-muted-foreground" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">{t('flow_builder.call_agent.copy', 'Copy')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", getCharCountBadgeClass(twilioAccountSid.length, 34))}>
                    {twilioAccountSid.length}/34 {t('flow_builder.call_agent.char_count', 'chars')}
                  </Badge>
                </div>
                <Input
                  placeholder="AC..."
                  value={twilioAccountSid}
                  onChange={(e) => {
                    const rawValue = e.target.value;
                    const hadProblematicChars = hasProblematicCharacters(rawValue);
                    const sanitizedValue = sanitizeCredential(rawValue);
                    
                    setTwilioAccountSid(sanitizedValue);
                    if (hadProblematicChars && sanitizedValue !== rawValue) {
                      setProblematicCharsWarning('accountSid');
                      setTimeout(() => setProblematicCharsWarning(null), 3000);
                    }
                    validateTwilioCredentials();
                  }}
                  className={cn(
                    "text-xs h-7",
                    validationErrors.twilioAccountSid ? "border-destructive" : ""
                  )}
                />
                {problematicCharsWarning === 'accountSid' && (
                  <p className="text-[10px] text-yellow-600 mt-1">
                    {t('flow_builder.call_agent.problematic_chars_warning', '⚠️ Contains hidden characters - credential has been cleaned')}
                  </p>
                )}
                {validationErrors.twilioAccountSid && (
                  <p className="text-[10px] text-destructive mt-1">{validationErrors.twilioAccountSid}</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs font-medium">{t('flow_builder.call_agent.twilio_auth_token', 'Auth Token')}</Label>
                    {twilioAuthToken && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 w-4 p-0"
                              onClick={() => copyToClipboard(twilioAuthToken, 'authToken')}
                            >
                              {copiedField === 'authToken' ? (
                                <CheckCircle className="h-3 w-3 text-primary" />
                              ) : (
                                <Copy className="h-3 w-3 text-muted-foreground" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">{t('flow_builder.call_agent.copy', 'Copy')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", getCharCountBadgeClass(twilioAuthToken.length, 32))}>
                      {twilioAuthToken.length}/32 {t('flow_builder.call_agent.char_count', 'chars')}
                    </Badge>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0"
                            onClick={() => setShowAuthToken(!showAuthToken)}
                          >
                            {showAuthToken ? (
                              <EyeOff className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <Eye className="h-3 w-3 text-muted-foreground" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            {showAuthToken ? t('flow_builder.call_agent.hide_token', 'Hide token') : t('flow_builder.call_agent.show_token', 'Show token')}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
                <Input
                  type={showAuthToken ? 'text' : 'password'}
                  placeholder={t('flow_builder.call_agent.auth_token_placeholder', 'Your auth token')}
                  value={twilioAuthToken}
                  onChange={(e) => {
                    const rawValue = e.target.value;
                    const hadProblematicChars = hasProblematicCharacters(rawValue);
                    const sanitizedValue = sanitizeCredential(rawValue);
                    
                    setTwilioAuthToken(sanitizedValue);
                    if (hadProblematicChars && sanitizedValue !== rawValue) {
                      setProblematicCharsWarning('authToken');
                      setTimeout(() => setProblematicCharsWarning(null), 3000);
                    }
                    validateTwilioCredentials();
                  }}
                  className={cn(
                    "text-xs h-7",
                    validationErrors.twilioAuthToken ? "border-destructive" : ""
                  )}
                />
                {problematicCharsWarning === 'authToken' && (
                  <p className="text-[10px] text-yellow-600 mt-1">
                    {t('flow_builder.call_agent.problematic_chars_warning', '⚠️ Contains hidden characters - credential has been cleaned')}
                  </p>
                )}
                {validationErrors.twilioAuthToken && (
                  <p className="text-[10px] text-destructive mt-1">{validationErrors.twilioAuthToken}</p>
                )}
              </div>

              <div>
                <div className="flex items-center gap-1 mb-1">
                  <Label className="text-xs font-medium">{t('flow_builder.call_agent.twilio_from_number', 'From Number')}</Label>
                </div>
                <Input
                  placeholder="+1234567890"
                  value={twilioFromNumber}
                  onChange={(e) => {
                    setTwilioFromNumber(e.target.value);
                    validateTwilioCredentials();
                  }}
                  className={cn(
                    "text-xs h-7",
                    validationErrors.twilioFromNumber ? "border-destructive" : ""
                  )}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {t('flow_builder.call_agent.e164_format_hint', 'E.164 format: +1234567890')}
                </p>
                {validationErrors.twilioFromNumber && (
                  <p className="text-[10px] text-destructive mt-1">{validationErrors.twilioFromNumber}</p>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs flex-1"
                  onClick={validateCredentials}
                  disabled={isValidating}
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      {t('flow_builder.call_agent.validating', 'Validating...')}
                    </>
                  ) : (
                    <>
                      <Shield className="h-3 w-3 mr-1" />
                      {t('flow_builder.call_agent.validate_credentials', 'Validate Credentials')}
                    </>
                  )}
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs flex-1"
                  onClick={testCall}
                  disabled={isTesting}
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      {t('flow_builder.call_agent.testing', 'Testing...')}
                    </>
                  ) : (
                    <>
                      <PhoneCall className="h-3 w-3 mr-1" />
                      {t('flow_builder.call_agent.test_connection', 'Test Connection')}
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Section B: ElevenLabs Configuration */}
            <div className="text-xs space-y-2 border rounded p-2">
              <div className="flex items-center gap-2 mb-2">
                <PhoneCall className="h-3.5 w-3.5 text-primary" />
                <Label className="font-medium">{t('flow_builder.call_agent.elevenlabs_configuration', 'ElevenLabs Configuration')}</Label>
              </div>

              <div>
                <div className="flex items-center gap-1 mb-1">
                  <Label className="text-xs font-medium">{t('flow_builder.call_agent.elevenlabs_api_key', 'API Key')}</Label>
                  {elevenLabsApiKey && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0"
                            onClick={() => copyToClipboard(elevenLabsApiKey, 'elevenLabsApiKey')}
                          >
                            {copiedField === 'elevenLabsApiKey' ? (
                              <CheckCircle className="h-3 w-3 text-primary" />
                            ) : (
                              <Copy className="h-3 w-3 text-muted-foreground" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">{t('flow_builder.call_agent.copy', 'Copy')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                <Input
                  type="password"
                  placeholder={t('flow_builder.call_agent.api_key_placeholder', 'Your ElevenLabs API key')}
                  value={elevenLabsApiKey}
                  onChange={(e) => {
                    setElevenLabsApiKey(e.target.value);
                    validateElevenLabsCredentials();
                  }}
                  className={cn(
                    "text-xs h-7",
                    validationErrors.elevenLabsApiKey ? "border-destructive" : ""
                  )}
                />
                {validationErrors.elevenLabsApiKey && (
                  <p className="text-[10px] text-destructive mt-1">{validationErrors.elevenLabsApiKey}</p>
                )}
              </div>

              <div>
                <Label className="text-xs font-medium mb-1 block">{t('flow_builder.call_agent.agent_config_mode', 'Agent Configuration')}</Label>
                <Select
                  value={agentConfigMode}
                  onValueChange={(value: 'agentId' | 'customPrompt') => setAgentConfigMode(value)}
                >
                  <SelectTrigger className="text-xs h-7">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agentId">{t('flow_builder.call_agent.use_agent_id', 'Use Agent ID')}</SelectItem>
                    <SelectItem value="customPrompt">{t('flow_builder.call_agent.use_custom_prompt', 'Use Custom Prompt')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {agentConfigMode === 'agentId' && (
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <Label className="text-xs font-medium">{t('flow_builder.call_agent.elevenlabs_agent_id', 'Agent ID')}</Label>
                    {elevenLabsAgentId && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 w-4 p-0"
                              onClick={() => copyToClipboard(elevenLabsAgentId, 'agentId')}
                            >
                              {copiedField === 'agentId' ? (
                                <CheckCircle className="h-3 w-3 text-primary" />
                              ) : (
                                <Copy className="h-3 w-3 text-muted-foreground" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">{t('flow_builder.call_agent.copy', 'Copy')}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  <Input
                    placeholder={t('flow_builder.call_agent.agent_id_placeholder', 'Your agent ID')}
                    value={elevenLabsAgentId}
                    onChange={(e) => {
                      setElevenLabsAgentId(e.target.value);
                      validateElevenLabsCredentials();
                    }}
                    className={cn(
                      "text-xs h-7",
                      validationErrors.elevenLabsAgentId ? "border-destructive" : ""
                    )}
                  />
                  {validationErrors.elevenLabsAgentId && (
                    <p className="text-[10px] text-destructive mt-1">{validationErrors.elevenLabsAgentId}</p>
                  )}
                </div>
              )}

              {agentConfigMode === 'customPrompt' && (
                <>
                  <div>
                    <Label className="text-xs font-medium mb-1 block">{t('flow_builder.call_agent.custom_agent_prompt', 'Custom Agent Prompt')}</Label>
                    <Textarea
                      placeholder={t('flow_builder.call_agent.prompt_placeholder', 'Enter your agent prompt...')}
                      value={customAgentPrompt}
                      onChange={(e) => {
                        setCustomAgentPrompt(e.target.value);
                        validateElevenLabsCredentials();
                      }}
                      className={cn(
                        "text-xs min-h-[80px] resize-y",
                        validationErrors.customAgentPrompt ? "border-destructive" : ""
                      )}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {customAgentPrompt.length} {t('flow_builder.call_agent.characters', 'characters')}
                    </p>
                    {validationErrors.customAgentPrompt && (
                      <p className="text-[10px] text-destructive mt-1">{validationErrors.customAgentPrompt}</p>
                    )}
                  </div>

                  <div>
                    <Label className="text-xs font-medium mb-1 block">{t('flow_builder.call_agent.voice_id', 'Voice ID')}</Label>
                    <Input
                      placeholder={t('flow_builder.call_agent.voice_id_placeholder', 'Voice ID')}
                      value={voiceId}
                      onChange={(e) => setVoiceId(e.target.value)}
                      className="text-xs h-7"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-medium mb-1 block">{t('flow_builder.call_agent.voice_stability', 'Voice Stability')}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={voiceSettings.stability || 0.5}
                        onChange={(e) => setVoiceSettings({ ...voiceSettings, stability: parseFloat(e.target.value) })}
                        className="flex-1"
                      />
                      <span className="text-xs w-8 text-center">{voiceSettings.stability?.toFixed(1) || 0.5}</span>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-medium mb-1 block">{t('flow_builder.call_agent.voice_similarity', 'Voice Similarity Boost')}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={voiceSettings.similarity_boost || 0.75}
                        onChange={(e) => setVoiceSettings({ ...voiceSettings, similarity_boost: parseFloat(e.target.value) })}
                        className="flex-1"
                      />
                      <span className="text-xs w-8 text-center">{voiceSettings.similarity_boost?.toFixed(1) || 0.75}</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Section C: Call Parameters */}
            <div className="text-xs space-y-2 border rounded p-2">
              <Label className="font-medium">{t('flow_builder.call_agent.call_parameters', 'Call Parameters')}</Label>

              <div>
                <Label className="text-xs font-medium mb-1 block">{t('flow_builder.call_agent.to_phone_number', 'To Phone Number')}</Label>
                <Input
                  placeholder="+1234567890 or {{contact.phone}}"
                  value={toPhoneNumber}
                  onChange={(e) => {
                    setToPhoneNumber(e.target.value);
                    if (e.target.value && !e.target.value.includes('{{')) {
                      const normalized = normalizePhoneNumber(e.target.value);
                      if (!validatePhoneNumber(normalized)) {
                        setValidationErrors(prev => ({ ...prev, toPhoneNumber: t('flow_builder.call_agent.invalid_phone', 'Invalid phone number format') }));
                      } else {
                        setValidationErrors(prev => {
                          const newErrors = { ...prev };
                          delete newErrors.toPhoneNumber;
                          return newErrors;
                        });
                      }
                    }
                  }}
                  className={cn(
                    "text-xs h-7",
                    validationErrors.toPhoneNumber ? "border-destructive" : ""
                  )}
                />
                {validationErrors.toPhoneNumber && (
                  <p className="text-[10px] text-destructive mt-1">{validationErrors.toPhoneNumber}</p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">{t('flow_builder.call_agent.timeout', 'Timeout (seconds)')}</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setTimeoutValue(Math.max(10, timeout - 30))}
                    disabled={timeout <= 10}
                  >-</Button>
                  <span className="text-xs w-8 text-center">{timeout}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setTimeoutValue(Math.min(600, timeout + 30))}
                    disabled={timeout >= 600}
                  >+</Button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">{t('flow_builder.call_agent.max_call_duration', 'Max Call Duration (seconds)')}</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setMaxCallDuration(Math.max(60, maxCallDuration - 60))}
                    disabled={maxCallDuration <= 60}
                  >-</Button>
                  <span className="text-xs w-8 text-center">{maxCallDuration}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setMaxCallDuration(Math.min(3600, maxCallDuration + 60))}
                    disabled={maxCallDuration >= 3600}
                  >+</Button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">{t('flow_builder.call_agent.retry_attempts', 'Retry Attempts')}</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setRetryAttempts(Math.max(0, retryAttempts - 1))}
                    disabled={retryAttempts <= 0}
                  >-</Button>
                  <span className="text-xs w-8 text-center">{retryAttempts}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setRetryAttempts(Math.min(5, retryAttempts + 1))}
                    disabled={retryAttempts >= 5}
                  >+</Button>
                </div>
              </div>

              {retryAttempts > 0 && (
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">{t('flow_builder.call_agent.retry_delay', 'Retry Delay (seconds)')}</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => setRetryDelay(Math.max(30, retryDelay - 30))}
                      disabled={retryDelay <= 30}
                    >-</Button>
                    <span className="text-xs w-8 text-center">{retryDelay}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => setRetryDelay(Math.min(300, retryDelay + 30))}
                      disabled={retryDelay >= 300}
                    >+</Button>
                  </div>
                </div>
              )}
            </div>

            {/* Section D: Execution Mode */}
            <div className="text-xs space-y-2 border rounded p-2">
              <Label className="font-medium">{t('flow_builder.call_agent.execution_mode', 'Execution Mode')}</Label>

              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label className="text-xs font-medium">{t('flow_builder.call_agent.mode', 'Mode')}</Label>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {executionMode === 'blocking'
                      ? t('flow_builder.call_agent.blocking_description', 'Blocking: Wait for call completion before continuing flow.')
                      : t('flow_builder.call_agent.async_description', 'Async: Continue immediately after initiating call.')}
                  </p>
                </div>
                <Select
                  value={executionMode}
                  onValueChange={(value: 'blocking' | 'async') => setExecutionMode(value)}
                >
                  <SelectTrigger className="text-xs h-7 w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blocking">{t('flow_builder.call_agent.blocking', 'Blocking')}</SelectItem>
                    <SelectItem value="async">{t('flow_builder.call_agent.async', 'Async')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {executionMode === 'async' && (
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">{t('flow_builder.call_agent.wait_for_completion', 'Wait for Completion')}</Label>
                  <Switch
                    checked={waitForCompletion}
                    onCheckedChange={setWaitForCompletion}
                  />
                </div>
              )}
            </div>

            {/* Section E: Inbound Call Configuration */}
            <div className="text-xs space-y-2 border rounded p-2">
              <button
                className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center justify-between w-full p-2 rounded hover:bg-muted transition-colors"
                onClick={() => setShowWebhookConfig(!showWebhookConfig)}
              >
                <div className="flex items-center gap-2">
                  <span>{t('flow_builder.call_agent.inbound_configuration', 'Inbound Call Configuration')}</span>
                </div>
                {showWebhookConfig ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>

              {showWebhookConfig && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">{t('flow_builder.call_agent.enable_inbound', 'Enable Inbound Calls')}</Label>
                    <Switch
                      checked={enableInbound}
                      onCheckedChange={setEnableInbound}
                    />
                  </div>

                  {enableInbound && (
                    <>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">{t('flow_builder.call_agent.auto_generate_webhook', 'Auto-generate Webhook URL')}</Label>
                        <Switch
                          checked={autoGenerateWebhook}
                          onCheckedChange={setAutoGenerateWebhook}
                        />
                      </div>

                      <div>
                        <Label className="text-xs font-medium mb-1 block">{t('flow_builder.call_agent.webhook_url', 'Webhook URL')}</Label>
                        <div className="flex gap-2">
                          <Input
                            value={webhookUrl}
                            onChange={(e) => setWebhookUrl(e.target.value)}
                            disabled={autoGenerateWebhook}
                            className="text-xs h-7 flex-1"
                          />
                          {webhookUrl && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() => copyToClipboard(webhookUrl, 'webhookUrl')}
                                  >
                                    {copiedField === 'webhookUrl' ? (
                                      <CheckCircle className="h-3 w-3 text-primary" />
                                    ) : (
                                      <Copy className="h-3 w-3 text-muted-foreground" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">{t('flow_builder.call_agent.copy', 'Copy')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {t('flow_builder.call_agent.webhook_instructions', 'Configure this URL in your Twilio phone number settings as the Voice webhook')}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Section F: Advanced Settings */}
            <div className="text-xs space-y-2 border rounded p-2">
              <button
                className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center justify-between w-full p-2 rounded hover:bg-muted transition-colors"
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              >
                <div className="flex items-center gap-2">
                  <span>{t('flow_builder.call_agent.advanced_settings', 'Advanced Settings')}</span>
                </div>
                {showAdvancedSettings ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>

              {showAdvancedSettings && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <Label className="text-xs font-medium">{t('flow_builder.call_agent.record_call', 'Record Call')}</Label>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {t('flow_builder.call_agent.record_call_description', 'Record the call for later review')}
                      </p>
                    </div>
                    <Switch
                      checked={recordCall}
                      onCheckedChange={setRecordCall}
                    />
                  </div>

                  {recordCall && (
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">{t('flow_builder.call_agent.transcribe_call', 'Transcribe Call')}</Label>
                      <Switch
                        checked={transcribeCall}
                        onCheckedChange={setTranscribeCall}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <Label className="text-xs font-medium">{t('flow_builder.call_agent.detect_voicemail', 'Detect Voicemail')}</Label>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {t('flow_builder.call_agent.detect_voicemail_description', 'Automatically detect if call goes to voicemail')}
                      </p>
                    </div>
                    <Switch
                      checked={detectVoicemail}
                      onCheckedChange={setDetectVoicemail}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="font-medium">{t('flow_builder.call_agent.custom_headers', 'Custom Headers')}</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={addHeader}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </div>
                    {customHeaders.map((header, index) => (
                      <div key={index} className="flex gap-2 mb-2">
                        <Input
                          placeholder={t('flow_builder.call_agent.header_name', 'Header name')}
                          value={header.key}
                          onChange={(e) => updateHeader(index, 'key', e.target.value)}
                          className="text-xs h-7 flex-1"
                        />
                        <Input
                          placeholder={t('flow_builder.call_agent.header_value', 'Header value')}
                          value={header.value}
                          onChange={(e) => updateHeader(index, 'value', e.target.value)}
                          className="text-xs h-7 flex-1"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => removeHeader(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Variable Preview Section */}
            <div className="pt-3 border-t">
              <button
                className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center justify-between w-full p-2 rounded hover:bg-muted transition-colors"
                onClick={() => setShowVariablePreview(!showVariablePreview)}
              >
                <div className="flex items-center gap-2">
                  <span>{t('flow_builder.call_agent.variable_preview', 'Variable Preview')}</span>
                </div>
                {showVariablePreview ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
              {showVariablePreview && (
                <div className="mt-2 space-y-2">
                  <div className="text-[10px] bg-primary/10 border border-primary/20 p-2 rounded">
                    <div className="font-medium text-primary mb-2">{t('flow_builder.call_agent.available_variables', 'Available Variables')}</div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <code className="text-primary bg-card px-1 py-0.5 rounded">&#123;&#123;contact.phone&#125;&#125;</code>
                        <span className="text-primary">{t('flow_builder.call_agent.contact_phone', 'Contact phone number')}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <code className="text-primary bg-card px-1 py-0.5 rounded">&#123;&#123;contact.name&#125;&#125;</code>
                        <span className="text-primary">{t('flow_builder.call_agent.contact_name', 'Contact name')}</span>
                      </div>
                    </div>
                  </div>
                  {toPhoneNumber && toPhoneNumber.includes('{{') && (
                    <div className="text-[10px] bg-primary/10 border border-primary/20 p-2 rounded">
                      <div className="font-medium text-primary mb-2">{t('flow_builder.call_agent.preview', 'Preview')}</div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <code className="text-primary bg-card px-1 py-0.5 rounded">{toPhoneNumber}</code>
                          <span className="text-primary">→</span>
                          <code className="text-primary bg-card px-1 py-0.5 rounded">{replaceVariables(toPhoneNumber)}</code>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Validation Results Display */}
            {showValidationResult && validationResult && (
              <div className={cn(
                "mt-3 border rounded p-2 transition-all",
                validationResult.valid ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"
              )}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {validationResult.valid ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    <span className="text-xs font-medium">
                      {validationResult.valid
                        ? t('flow_builder.call_agent.credentials_valid', 'Credentials Valid')
                        : t('flow_builder.call_agent.credentials_invalid', 'Credentials Invalid')
                      }
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={() => setShowValidationResult(false)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>

                {validationResult.valid && validationResult.accountInfo ? (
                  <div className="space-y-1">
                    <div className="text-xs text-green-700">
                      <span className="font-medium">{t('flow_builder.call_agent.account_name', 'Account:')}</span> {validationResult.accountInfo.friendlyName}
                    </div>
                    <div className="text-xs text-green-700">
                      <span className="font-medium">{t('flow_builder.call_agent.account_status', 'Status:')}</span> {validationResult.accountInfo.status}
                    </div>
                    <div className="text-xs text-green-700">
                      <span className="font-medium">{t('flow_builder.call_agent.account_type', 'Type:')}</span> {validationResult.accountInfo.type}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {validationResult.error && (
                      <div className="text-xs text-red-700 bg-red-100/50 p-2 rounded">
                        {validationResult.error}
                      </div>
                    )}
                    
                    {validationResult.formatIssues && validationResult.formatIssues.length > 0 && (
                      <div className="text-xs text-red-700">
                        <div className="font-medium mb-1">{t('flow_builder.call_agent.format_issues', 'Format Issues:')}</div>
                        <ul className="list-disc list-inside space-y-0.5">
                          {validationResult.formatIssues.map((issue, index) => (
                            <li key={index}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {validationResult.suggestions && validationResult.suggestions.length > 0 && (
                      <div className="text-xs text-red-700">
                        <div className="font-medium mb-1">{t('flow_builder.call_agent.suggestions', 'Suggestions:')}</div>
                        <ul className="list-disc list-inside space-y-0.5">
                          {validationResult.suggestions.map((suggestion, index) => (
                            <li key={index}>{suggestion}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {validationResult.documentation && (
                      <div className="text-xs">
                        <a
                          href={validationResult.documentation}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {t('flow_builder.call_agent.view_documentation', 'View Documentation')}
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Test Results Display */}
            {showTestResult && testResult && (
              <div className="mt-3 border rounded p-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {testResult.success ? (
                      <CheckCircle className="h-4 w-4 text-primary" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <span className="text-xs font-medium">
                      {testResult.success
                        ? t('flow_builder.call_agent.test_success', 'Test Call Successful')
                        : t('flow_builder.call_agent.test_failed', 'Test Call Failed')}
                    </span>
                    {testResult.duration && (
                      <span className="text-[10px] text-muted-foreground">
                        ({testResult.duration}ms)
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={() => setShowTestResult(false)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>

                {testResult.error ? (
                  <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                    {testResult.error}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {testResult.callSid && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium">{t('flow_builder.call_agent.call_sid', 'Call SID:')}</span>
                        <code className="text-primary bg-card px-1 py-0.5 rounded text-[10px]">{testResult.callSid}</code>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-4 w-4 p-0"
                                onClick={() => copyToClipboard(testResult.callSid || '', 'callSid')}
                              >
                                {copiedField === 'callSid' ? (
                                  <CheckCircle className="h-3 w-3 text-primary" />
                                ) : (
                                  <Copy className="h-3 w-3 text-muted-foreground" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">{t('flow_builder.call_agent.copy', 'Copy')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    )}
                    {testResult.transcript && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">
                          {t('flow_builder.call_agent.transcript', 'Transcript:')}
                        </div>
                        <div className="text-[10px] bg-muted p-2 rounded font-mono max-h-32 overflow-y-auto">
                          {testResult.transcript}
                        </div>
                      </div>
                    )}
                  </div>
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

      <Handle
        type="source"
        position={Position.Right}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
    </div>
  );
}
