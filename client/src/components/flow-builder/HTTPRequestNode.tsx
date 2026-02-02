import { useState, useCallback, useEffect } from 'react';
import { Handle, Position } from 'reactflow';
import { useReactFlow } from 'reactflow';
import { Trash2, Copy, Settings, Plus, X, Play, CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp, RotateCcw, Eye, EyeOff } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { standardHandleStyle } from './StyledHandle';
import { useTranslation } from '@/hooks/use-translation';

const HTTP_METHODS = [
  { id: 'GET', name: 'GET' },
  { id: 'POST', name: 'POST' },
  { id: 'PUT', name: 'PUT' },
  { id: 'DELETE', name: 'DELETE' },
  { id: 'PATCH', name: 'PATCH' }
];

const AUTH_TYPES = [
  { id: 'none', name: 'None' },
  { id: 'bearer', name: 'Bearer Token' },
  { id: 'basic', name: 'Basic Auth' },
  { id: 'apikey', name: 'API Key' }
];

const RESPONSE_TYPES = [
  { id: 'json', name: 'JSON' },
  { id: 'text', name: 'Text' },
  { id: 'xml', name: 'XML' },
  { id: 'auto', name: 'Auto-detect' }
];



interface HeaderPair {
  key: string;
  value: string;
}

interface VariableMapping {
  responseField: string;
  variableName: string;
}

interface HTTPRequestNodeProps {
  id: string;
  data: {
    label: string;
    url?: string;
    method?: string;
    headers?: HeaderPair[];
    body?: string;
    authType?: string;
    authToken?: string;
    authUsername?: string;
    authPassword?: string;
    authApiKey?: string;
    authApiKeyHeader?: string;
    timeout?: number;
    followRedirects?: boolean;
    responseType?: string;
    retryCount?: number;
    retryDelay?: number;
    variableMappings?: VariableMapping[];
    onDeleteNode?: (id: string) => void;
    onDuplicateNode?: (id: string) => void;
  };
  isConnectable: boolean;
}

export function HTTPRequestNode({ id, data, isConnectable }: HTTPRequestNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);

  const REQUEST_TEMPLATES = [
    {
      id: 'get_user',
      name: t('flow_builder.template_get_user_data', 'Get User Data'),
      method: 'GET',
      url: 'https://api.example.com/users/{{user.id}}',
      headers: [{ key: 'Accept', value: 'application/json' }],
      body: ''
    },
    {
      id: 'post_data',
      name: t('flow_builder.template_post_form_data', 'Post Form Data'),
      method: 'POST',
      url: 'https://api.example.com/submit',
      headers: [{ key: 'Content-Type', value: 'application/json' }],
      body: '{\n  "name": "{{contact.name}}",\n  "email": "{{contact.email}}",\n  "message": "{{message.content}}"\n}'
    },
    {
      id: 'update_record',
      name: t('flow_builder.template_update_record', 'Update Record'),
      method: 'PUT',
      url: 'https://api.example.com/records/{{record.id}}',
      headers: [{ key: 'Content-Type', value: 'application/json' }],
      body: '{\n  "status": "updated",\n  "timestamp": "{{date.now}}"\n}'
    }
  ];
  const [url, setUrl] = useState(data.url || '');
  const [method, setMethod] = useState(data.method || 'GET');
  const [headers, setHeaders] = useState<HeaderPair[]>(data.headers || []);
  const [body, setBody] = useState(data.body || '');
  const [authType, setAuthType] = useState(data.authType || 'none');
  const [authToken, setAuthToken] = useState(data.authToken || '');
  const [authUsername, setAuthUsername] = useState(data.authUsername || '');
  const [authPassword, setAuthPassword] = useState(data.authPassword || '');
  const [authApiKey, setAuthApiKey] = useState(data.authApiKey || '');
  const [authApiKeyHeader, setAuthApiKeyHeader] = useState(data.authApiKeyHeader || 'X-API-Key');
  const [timeout, setTimeoutValue] = useState(data.timeout || 30);
  const [followRedirects, setFollowRedirects] = useState(data.followRedirects !== undefined ? data.followRedirects : true);
  const [responseType, setResponseType] = useState(data.responseType || 'auto');
  const [retryCount, setRetryCount] = useState(data.retryCount || 0);
  const [retryDelay, setRetryDelay] = useState(data.retryDelay || 1000);
  const [variableMappings, setVariableMappings] = useState<VariableMapping[]>(data.variableMappings || []);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    data?: any;
    error?: string;
    duration?: number;
    retryAttempts?: number;
  } | null>(null);
  const [showTestResult, setShowTestResult] = useState(false);
  const [showResponseHeaders, setShowResponseHeaders] = useState(false);
  const [showVariablePreview, setShowVariablePreview] = useState(false);

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
      url,
      method,
      headers,
      body,
      authType,
      authToken,
      authUsername,
      authPassword,
      authApiKey,
      authApiKeyHeader,
      timeout,
      followRedirects,
      responseType,
      retryCount,
      retryDelay,
      variableMappings
    });
  }, [
    updateNodeData,
    url,
    method,
    headers,
    body,
    authType,
    authToken,
    authUsername,
    authPassword,
    authApiKey,
    authApiKeyHeader,
    timeout,
    followRedirects,
    responseType,
    retryCount,
    retryDelay,
    variableMappings
  ]);

  const addHeader = () => {
    setHeaders([...headers, { key: '', value: '' }]);
  };

  const removeHeader = (index: number) => {
    setHeaders(headers.filter((_, i) => i !== index));
  };

  const updateHeader = (index: number, field: 'key' | 'value', value: string) => {
    const newHeaders = [...headers];
    newHeaders[index][field] = value;
    setHeaders(newHeaders);
  };

  const addVariableMapping = () => {
    setVariableMappings([...variableMappings, { responseField: '', variableName: '' }]);
  };

  const removeVariableMapping = (index: number) => {
    setVariableMappings(variableMappings.filter((_, i) => i !== index));
  };

  const updateVariableMapping = (index: number, field: 'responseField' | 'variableName', value: string) => {
    const newMappings = [...variableMappings];
    newMappings[index][field] = value;
    setVariableMappings(newMappings);
  };

  const applyTemplate = (templateId: string) => {
    const template = REQUEST_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setMethod(template.method);
      setUrl(template.url);
      setHeaders(template.headers);
      setBody(template.body);
    }
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'GET': return 'text-primary';
      case 'POST': return 'text-primary';
      case 'PUT': return 'text-secondary';
      case 'DELETE': return 'text-destructive';
      case 'PATCH': return 'text-primary';
      default: return 'text-muted-foreground';
    }
  };

  const replaceVariables = (text: string): string => {
    const testData: Record<string, string> = {
      'contact.name': 'Test Contact',
      'contact.phone': '+1234567890',
      'contact.email': 'test@example.com',
      'contact.id': '12345',
      'message.content': 'This is a test message',
      'date.today': new Date().toISOString().split('T')[0],
      'date.now': new Date().toISOString(),
      'time.now': new Date().toLocaleTimeString(),
      'user.name': 'Test User',
      'user.id': '123',
      'record.id': '456'
    };

    let result = text;
    Object.entries(testData).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, value);
    });

    return result;
  };

  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const parseResponse = async (response: Response, expectedType: string): Promise<any> => {
    const contentType = response.headers.get('content-type') || '';

    try {
      if (expectedType === 'json' || (expectedType === 'auto' && contentType.includes('application/json'))) {
        return await response.json();
      } else if (expectedType === 'xml' || (expectedType === 'auto' && contentType.includes('xml'))) {
        const text = await response.text();
        return text;
      } else {
        return await response.text();
      }
    } catch {
      return await response.text();
    }
  };

  const testRequest = async () => {
    if (!url.trim()) {
      setTestResult({
        success: false,
        error: 'Please enter a request URL'
      });
      setShowTestResult(true);
      return;
    }

    if (!isValidUrl(url)) {
      setTestResult({
        success: false,
        error: 'Please enter a valid URL (must include http:// or https://)'
      });
      setShowTestResult(true);
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setShowTestResult(true);

    const startTime = Date.now();
    let lastError: any = null;
    let attempts = 0;
    const maxAttempts = retryCount + 1;

    while (attempts < maxAttempts) {
      try {
        attempts++;

        const requestHeaders: Record<string, string> = {};

        if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && body) {
          requestHeaders['Content-Type'] = 'application/json';
        }

        headers.forEach(header => {
          if (header.key && header.value) {
            requestHeaders[header.key] = replaceVariables(header.value);
          }
        });

        if (authType === 'bearer' && authToken) {
          requestHeaders['Authorization'] = `Bearer ${authToken}`;
        } else if (authType === 'basic' && authUsername && authPassword) {
          const credentials = btoa(`${authUsername}:${authPassword}`);
          requestHeaders['Authorization'] = `Basic ${credentials}`;
        } else if (authType === 'apikey' && authApiKey && authApiKeyHeader) {
          requestHeaders[authApiKeyHeader] = authApiKey;
        }

        const requestOptions: RequestInit = {
          method: method,
          headers: requestHeaders,
          redirect: followRedirects ? 'follow' : 'manual',
        };

        if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && body) {
          try {
            const processedBody = replaceVariables(body);
            if (requestHeaders['Content-Type']?.includes('application/json')) {
              JSON.parse(processedBody);
            }
            requestOptions.body = processedBody;
          } catch (jsonError) {
            setTestResult({
              success: false,
              error: 'Invalid JSON in request body'
            });
            setIsTesting(false);
            return;
          }
        }

        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), timeout * 1000);
        requestOptions.signal = controller.signal;

        const response = await fetch(replaceVariables(url), requestOptions);
        window.clearTimeout(timeoutId);

        const duration = Date.now() - startTime;

        const responseData = await parseResponse(response, responseType);

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        setTestResult({
          success: response.ok,
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          data: responseData,
          duration,
          retryAttempts: attempts - 1
        });

        setIsTesting(false);
        return;

      } catch (error: any) {
        lastError = error;

        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    const duration = Date.now() - startTime;
    let errorMessage = 'Unknown error occurred';

    if (lastError?.name === 'AbortError') {
      errorMessage = `Request timed out after ${timeout} seconds`;
    } else if (lastError?.message) {
      errorMessage = lastError.message;
    }

    setTestResult({
      success: false,
      error: errorMessage,
      duration,
      retryAttempts: attempts - 1
    });

    setIsTesting(false);
  };

  return (
    <div className="node-http-request rounded-lg bg-card border border-border shadow-sm max-w-[360px] group relative">
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

      {/* Fixed Header */}
      <div className="p-3 border-b border-primary/20 bg-primary/10">
        <div className="font-medium flex items-center gap-2">
          <img 
            src="https://cdn-icons-png.flaticon.com/128/1674/1674969.png" 
            alt="HTTP Request" 
            className="h-4 w-4"
          />
          <span>{t('flow_builder.http_request', 'HTTP Request')}</span>
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

      {/* Scrollable Content */}
      <div className={`${isEditing ? 'max-h-[500px]' : 'max-h-[200px]'} overflow-y-auto custom-scrollbar`}>
        <div className="p-3 space-y-3">

          {/* Configuration Summary */}
          <div className="text-sm p-3  rounded border border-border">
            <div className="flex items-center gap-1 mb-2">
              <Settings className="h-3.5 w-3.5 text-muted-foreground" />
              <span className={cn("font-medium", getMethodColor(method))}>{method}</span>
              <span className="text-xs text-muted-foreground">
                {url ? (url.length > 30 ? `${url.substring(0, 30)}...` : url) : 'No URL configured'}
              </span>
            </div>

            <div className="text-xs text-muted-foreground mb-2">
              {authType !== 'none' && `Auth: ${AUTH_TYPES.find(t => t.id === authType)?.name} • `}
              {headers.length > 0 && `${headers.length} header${headers.length !== 1 ? 's' : ''} • `}
              {body && (method === 'POST' || method === 'PUT' || method === 'PATCH') && 'Body configured • '}
              {retryCount > 0 && `${retryCount} retries • `}
              {variableMappings.length > 0 && `${variableMappings.length} mapping${variableMappings.length !== 1 ? 's' : ''}`}
            </div>

            <div className="flex flex-wrap gap-1">
              {authType !== 'none' && (
                <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded shrink-0">
                  {t('flow_builder.http_auth', 'Auth')}: {AUTH_TYPES.find(t => t.id === authType)?.name}
                </span>
              )}
              {headers.length > 0 && (
                <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded shrink-0">
                  {headers.length} {t('flow_builder.http_header', 'header')}{headers.length !== 1 ? 's' : ''}
                </span>
              )}
              {body && (method === 'POST' || method === 'PUT' || method === 'PATCH') && (
                <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded shrink-0">
                  {t('flow_builder.http_body_configured', 'Body configured')}
                </span>
              )}
              {retryCount > 0 && (
                <span className="text-[10px] bg-secondary/10 text-secondary border border-secondary/20 px-1 py-0.5 rounded shrink-0">
                  {t('flow_builder.http_retry', 'Retry')}: {retryCount}x
                </span>
              )}
              {variableMappings.length > 0 && (
                <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded shrink-0">
                  {variableMappings.length} {t('flow_builder.http_mapping', 'mapping')}{variableMappings.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {isEditing && (
            <div className="text-xs space-y-3 border rounded p-2 ">
          <div>
            <Label className="block mb-1 font-medium">{t('flow_builder.http_quick_templates', 'Quick Templates')}</Label>
            <Select
              value=""
              onValueChange={applyTemplate}
            >
              <SelectTrigger className="text-xs h-7">
                <SelectValue placeholder={t('flow_builder.http_choose_template', 'Choose a template...')} />
              </SelectTrigger>
              <SelectContent
                className="w-64 max-h-60 overflow-y-auto z-50"
                side="top"
                align="end"
                sideOffset={8}
                avoidCollisions={true}
              >
                {REQUEST_TEMPLATES.map((template) => (
                  <SelectItem key={template.id} value={template.id} className="text-xs p-2">
                    <div className="flex flex-col items-start space-y-1 max-w-full">
                      <span className="font-medium text-xs truncate max-w-full">{template.name}</span>
                      <span className="text-[9px] text-muted-foreground leading-tight">
                        {template.method} • {template.url.length > 30 ? `${template.url.substring(0, 30)}...` : template.url}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="block mb-1 font-medium">{t('flow_builder.http_method', 'HTTP Method')}</Label>
            <Select
              value={method}
              onValueChange={setMethod}
            >
              <SelectTrigger className="text-xs h-7">
                <SelectValue placeholder={t('flow_builder.http_select_method', 'Select method')} />
              </SelectTrigger>
              <SelectContent
                className="w-40 z-50"
                side="top"
                align="start"
                sideOffset={8}
                avoidCollisions={true}
              >
                {HTTP_METHODS.map((method) => (
                  <SelectItem key={method.id} value={method.id}>
                    <span className={getMethodColor(method.id)}>{method.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="block mb-1 font-medium">{t('flow_builder.http_request_url', 'Request URL')}</Label>
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="https://api.example.com/endpoint"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="text-xs h-7 flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2"
                onClick={testRequest}
                disabled={isTesting || !url.trim()}
                title="Test request with current configuration"
              >
                {isTesting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>

          <div>
            <Label className="block mb-1 font-medium">Authentication</Label>
            <Select
              value={authType}
              onValueChange={setAuthType}
            >
              <SelectTrigger className="text-xs h-7">
                <SelectValue placeholder="Select auth type" />
              </SelectTrigger>
              <SelectContent
                className="w-48 z-50"
                side="top"
                align="start"
                sideOffset={8}
                avoidCollisions={true}
              >
                {AUTH_TYPES.map((auth) => (
                  <SelectItem key={auth.id} value={auth.id}>
                    {auth.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {authType === 'bearer' && (
              <div className="mt-2">
                <Input
                  type="password"
                  placeholder="Bearer token"
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  className="text-xs h-7"
                />
              </div>
            )}

            {authType === 'basic' && (
              <div className="mt-2 space-y-2">
                <Input
                  placeholder="Username"
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  className="text-xs h-7"
                />
                <Input
                  type="password"
                  placeholder="Password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="text-xs h-7"
                />
              </div>
            )}

            {authType === 'apikey' && (
              <div className="mt-2 space-y-2">
                <Input
                  placeholder="Header name (e.g., X-API-Key)"
                  value={authApiKeyHeader}
                  onChange={(e) => setAuthApiKeyHeader(e.target.value)}
                  className="text-xs h-7"
                />
                <Input
                  type="password"
                  placeholder="API key value"
                  value={authApiKey}
                  onChange={(e) => setAuthApiKey(e.target.value)}
                  className="text-xs h-7"
                />
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="font-medium">Custom Headers</Label>
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
            {headers.map((header, index) => (
              <div key={index} className="flex gap-2 mb-2">
                <Input
                  placeholder="Header name"
                  value={header.key}
                  onChange={(e) => updateHeader(index, 'key', e.target.value)}
                  className="text-xs h-7 flex-1"
                />
                <Input
                  placeholder="Header value"
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

          {(method === 'POST' || method === 'PUT' || method === 'PATCH') && (
            <div>
              <Label className="block mb-1 font-medium">Request Body (JSON)</Label>
              <Textarea
                placeholder='{"key": "value", "data": "{{contact.name}}"}'
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="text-xs min-h-[80px] resize-y font-mono"
              />
              <div className="text-[10px] text-muted-foreground mt-1">
                Use &#123;&#123;variable&#125;&#125; syntax for dynamic values
              </div>
            </div>
          )}

          <div>
            <Label className="block mb-1 font-medium">Response Type</Label>
            <Select
              value={responseType}
              onValueChange={setResponseType}
            >
              <SelectTrigger className="text-xs h-7">
                <SelectValue placeholder="Select response type" />
              </SelectTrigger>
              <SelectContent
                className="w-40 z-50"
                side="top"
                align="start"
                sideOffset={8}
                avoidCollisions={true}
              >
                {RESPONSE_TYPES.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Retry on Failure</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setRetryCount(Math.max(0, retryCount - 1))}
                  disabled={retryCount <= 0}
                >-</Button>
                <span className="text-xs w-8 text-center">{retryCount}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setRetryCount(Math.min(5, retryCount + 1))}
                  disabled={retryCount >= 5}
                >+</Button>
              </div>
            </div>

            {retryCount > 0 && (
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Retry Delay (ms)</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setRetryDelay(Math.max(100, retryDelay - 500))}
                    disabled={retryDelay <= 100}
                  >-</Button>
                  <span className="text-xs w-12 text-center">{retryDelay}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setRetryDelay(Math.min(10000, retryDelay + 500))}
                    disabled={retryDelay >= 10000}
                  >+</Button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Timeout (seconds)</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setTimeoutValue(Math.max(1, timeout - 5))}
                  disabled={timeout <= 1}
                >-</Button>
                <span className="text-xs w-8 text-center">{timeout}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setTimeoutValue(Math.min(300, timeout + 5))}
                  disabled={timeout >= 300}
                >+</Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium cursor-pointer">
                Follow redirects
              </Label>
              <Switch
                checked={followRedirects}
                onCheckedChange={setFollowRedirects}
              />
            </div>
          </div>

          <div className="pt-2 border-t">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Label className="font-medium text-sm">Response Variable Mapping</Label>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={addVariableMapping}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Mapping
              </Button>
            </div>

            {variableMappings.length === 0 ? (
              <div className="text-center py-4 border-2 border-dashed border-border rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground mb-2">
                  No variable mappings configured
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Map response fields to flow variables for use in subsequent nodes
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar">
                {variableMappings.map((mapping, index) => (
                  <div key={index} className="group border rounded-lg p-2 bg-card hover:bg-muted/50 transition-colors">
                    <div className="flex gap-2 items-center">
                      <div className="flex-1">
                        <Label className="text-[10px] font-medium text-muted-foreground mb-1 block">Response Field</Label>
                        <Input
                          placeholder="response.data.id"
                          value={mapping.responseField}
                          onChange={(e) => updateVariableMapping(index, 'responseField', e.target.value)}
                          className="text-xs h-6 border-border"
                        />
                      </div>
                      <div className="flex items-center justify-center mt-4">
                        <div className="bg-primary/10 text-primary rounded-full p-1">
                          <span className="text-xs font-medium">→</span>
                        </div>
                      </div>
                      <div className="flex-1">
                        <Label className="text-[10px] font-medium text-muted-foreground mb-1 block">Variable Name</Label>
                        <Input
                          placeholder="http.user_id"
                          value={mapping.variableName}
                          onChange={(e) => updateVariableMapping(index, 'variableName', e.target.value)}
                          className="text-xs h-6 border-border"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 mt-4 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeVariableMapping(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    {mapping.responseField && mapping.variableName && (
                      <div className="mt-2 text-[9px] text-muted-foreground bg-muted px-2 py-1 rounded">
                        <code className="text-primary">&#123;&#123;{mapping.variableName}&#125;&#125;</code> will contain data from <code className="text-primary">{mapping.responseField}</code>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 p-2 bg-primary/10 border border-primary/20 rounded-md">
              <p className="text-[10px] text-primary">
                💡 <strong>Tip:</strong> Use dot notation for nested fields (e.g., <code>response.data.user.id</code>) and create meaningful variable names for easy reference in subsequent nodes.
              </p>
            </div>
          </div>

          <div className="pt-3 border-t">
            <button
              className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center justify-between w-full p-2 rounded hover:bg-muted transition-colors"
              onClick={() => setShowVariablePreview(!showVariablePreview)}
            >
              <div className="flex items-center gap-2">
                <span>Available Output Variables</span>
                <span className="text-[10px] bg-muted text-muted-foreground border border-border px-1.5 py-0.5 rounded-full">
                  {5 + variableMappings.filter(m => m.variableName).length} variables
                </span>
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
                  <div className="font-medium text-primary mb-2">Built-in Variables</div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <code className="text-primary bg-card px-1 py-0.5 rounded">&#123;&#123;http.response.status&#125;&#125;</code>
                      <span className="text-primary">HTTP status code</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <code className="text-primary bg-card px-1 py-0.5 rounded">&#123;&#123;http.response.data&#125;&#125;</code>
                      <span className="text-primary">Response body data</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <code className="text-primary bg-card px-1 py-0.5 rounded">&#123;&#123;http.response.headers&#125;&#125;</code>
                      <span className="text-primary">Response headers</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <code className="text-primary bg-card px-1 py-0.5 rounded">&#123;&#123;http.duration&#125;&#125;</code>
                      <span className="text-primary">Request duration (ms)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <code className="text-primary bg-card px-1 py-0.5 rounded">&#123;&#123;http.success&#125;&#125;</code>
                      <span className="text-primary">Request success status</span>
                    </div>
                  </div>
                </div>

                {variableMappings.filter(m => m.variableName).length > 0 && (
                  <div className="text-[10px] bg-primary/10 border border-primary/20 p-2 rounded">
                    <div className="font-medium text-primary mb-2">Custom Mapped Variables</div>
                    <div className="space-y-1">
                      {variableMappings.map((mapping, index) => (
                        mapping.variableName && (
                          <div key={index} className="flex items-center justify-between">
                            <code className="text-primary bg-card px-1 py-0.5 rounded">&#123;&#123;{mapping.variableName}&#125;&#125;</code>
                            <span className="text-primary truncate ml-2">{mapping.responseField || 'Custom mapping'}</span>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="text-[10px] text-muted-foreground mt-2">
            <p>
              The HTTP request node makes an HTTP request when reached in the flow and continues immediately to the next node. Response data is stored in variables (http.lastResponse, http.status, http.data, etc.) for use in subsequent nodes. The HTTP request executes only once per flow execution.
            </p>
          </div>

          {showTestResult && testResult && (
            <div className="mt-3 border rounded p-2 ">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <CheckCircle className="h-4 w-4 text-primary" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span className="text-xs font-medium">
                    {testResult.success ? 'Request Successful' : 'Request Failed'}
                  </span>
                  {testResult.duration && (
                    <span className="text-[10px] text-muted-foreground">
                      ({testResult.duration}ms)
                    </span>
                  )}
                  {testResult.retryAttempts !== undefined && testResult.retryAttempts > 0 && (
                    <span className="text-[10px] text-secondary flex items-center gap-1">
                      <RotateCcw className="h-2.5 w-2.5" />
                      {testResult.retryAttempts} retries
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
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium">Status:</span>
                    <span className={`px-1 py-0.5 rounded text-[10px] ${
                      testResult.success
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'bg-destructive/10 text-destructive border border-destructive/20'
                    }`}>
                      {testResult.status} {testResult.statusText}
                    </span>
                  </div>

                  {testResult.headers && Object.keys(testResult.headers).length > 0 && (
                    <div>
                      <button
                        className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
                        onClick={() => setShowResponseHeaders(!showResponseHeaders)}
                      >
                        Response Headers
                        {showResponseHeaders ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                      {showResponseHeaders && (
                        <div className="mt-1 text-[10px] bg-muted p-2 rounded font-mono max-h-20 overflow-y-auto">
                          {Object.entries(testResult.headers).map(([key, value]) => (
                            <div key={key} className="break-words leading-tight">
                              <span className="text-foreground">{key}:</span> {
                                typeof value === 'string' && value.length > 50
                                  ? `${value.substring(0, 50)}...`
                                  : value
                              }
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {testResult.data && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Response Data:
                      </div>
                      <div className="text-[10px] bg-muted p-2 rounded font-mono max-h-32 overflow-y-auto">
                        {typeof testResult.data === 'string'
                          ? testResult.data
                          : JSON.stringify(testResult.data, null, 2)
                        }
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
        </div>
      </div>

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