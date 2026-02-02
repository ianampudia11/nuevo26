import { useState, useCallback, useEffect } from 'react';
import { Handle, Position } from 'reactflow';
import { useReactFlow } from 'reactflow';
import { Trash2, Copy, Settings, Plus, X, Play, CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';
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



interface HeaderPair {
  key: string;
  value: string;
}

interface WebhookNodeProps {
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
    onDeleteNode?: (id: string) => void;
    onDuplicateNode?: (id: string) => void;
  };
  isConnectable: boolean;
}

export function WebhookNode({ id, data, isConnectable }: WebhookNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);

  const AUTH_TYPES = [
    { id: 'none', name: t('flow_builder.auth_none', 'None') },
    { id: 'bearer', name: t('flow_builder.auth_bearer_token', 'Bearer Token') },
    { id: 'basic', name: t('flow_builder.auth_basic_auth', 'Basic Auth') },
    { id: 'apikey', name: t('flow_builder.auth_api_key', 'API Key') }
  ];
  const [url, setUrl] = useState(data.url || '');
  const [method, setMethod] = useState(data.method || 'POST');
  const [headers, setHeaders] = useState<HeaderPair[]>(data.headers || []);
  const [body, setBody] = useState(data.body || '');
  const [authType, setAuthType] = useState(data.authType || 'none');
  const [authToken, setAuthToken] = useState(data.authToken || '');
  const [authUsername, setAuthUsername] = useState(data.authUsername || '');
  const [authPassword, setAuthPassword] = useState(data.authPassword || '');
  const [authApiKey, setAuthApiKey] = useState(data.authApiKey || '');
  const [authApiKeyHeader, setAuthApiKeyHeader] = useState(data.authApiKeyHeader || 'X-API-Key');
  const [timeout, setTimeout] = useState(data.timeout || 30);
  const [followRedirects, setFollowRedirects] = useState(data.followRedirects !== undefined ? data.followRedirects : true);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    data?: any;
    error?: string;
    duration?: number;
  } | null>(null);
  const [showTestResult, setShowTestResult] = useState(false);
  const [showResponseHeaders, setShowResponseHeaders] = useState(false);

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
      followRedirects
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
    followRedirects
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

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'GET': return 'text-primary';
      case 'POST': return 'text-primary';
      case 'PUT': return 'text-primary';
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
      'message.content': 'This is a test message',
      'date.today': new Date().toISOString().split('T')[0],
      'time.now': new Date().toLocaleTimeString(),
      'user.name': 'Test User',
      'user.id': '123'
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

  const testWebhook = async () => {
    if (!url.trim()) {
      setTestResult({
        success: false,
        error: 'Please enter a webhook URL'
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

    try {
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };

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
          JSON.parse(processedBody);
          requestOptions.body = processedBody;
        } catch (jsonError) {
          setTestResult({
            success: false,
            error: 'Invalid JSON in request body'
          });
          return;
        }
      }

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), timeout * 1000);
      requestOptions.signal = controller.signal;

      const response = await fetch(url, requestOptions);
      window.clearTimeout(timeoutId);

      const duration = Date.now() - startTime;

      let responseData: any;
      const contentType = response.headers.get('content-type');

      try {
        if (contentType?.includes('application/json')) {
          responseData = await response.json();
        } else {
          responseData = await response.text();
        }
      } catch {
        responseData = 'Unable to parse response body';
      }

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
        duration
      });

    } catch (error: any) {
      const duration = Date.now() - startTime;

      let errorMessage = t('flow_builder.webhook_unknown_error', 'Unknown error occurred');
      if (error.name === 'AbortError') {
        errorMessage = t('flow_builder.webhook_timeout_error', 'Request timed out after {{timeout}} seconds', { timeout });
      } else if (error.message) {
        errorMessage = error.message;
      }

      setTestResult({
        success: false,
        error: errorMessage,
        duration
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="node-webhook p-3 rounded-lg bg-card border border-border shadow-sm max-w-[320px] group">
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

      <div className="font-medium flex items-center gap-2 mb-2">
        <img 
          src="https://cdn-icons-png.flaticon.com/128/919/919829.png" 
          alt="Webhook" 
          className="h-4 w-4"
        />
        <span>{t('flow_builder.webhook', 'Webhook')}</span>
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

      <div className="text-sm p-2 bg-card rounded border border-border">
        <div className="flex items-center gap-1 mb-1">
          <Settings className="h-3.5 w-3.5 text-muted-foreground" />
          <span className={cn("font-medium", getMethodColor(method))}>{method}</span>
          <span className="text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground truncate">
            {url || t('flow_builder.webhook_no_url', 'No URL configured')}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap gap-1">
          {authType !== 'none' && (
            <span className="text-[10px] bg-primary/10 text-primary px-1 py-0.5 rounded">
              Auth: {AUTH_TYPES.find(t => t.id === authType)?.name}
            </span>
          )}
          {headers.length > 0 && (
            <span className="text-[10px] bg-primary/10 text-primary px-1 py-0.5 rounded">
              {headers.length} header{headers.length !== 1 ? 's' : ''}
            </span>
          )}
          {body && (method === 'POST' || method === 'PUT' || method === 'PATCH') && (
            <span className="text-[10px] bg-primary/10 text-primary px-1 py-0.5 rounded">
              {t('flow_builder.webhook_body_configured', 'Body configured')}
            </span>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="mt-3 text-xs space-y-3 border border-border rounded p-2 bg-card">
          <div>
            <Label className="block mb-1 font-medium">{t('flow_builder.webhook_method', 'HTTP Method')}</Label>
            <Select
              value={method}
              onValueChange={setMethod}
            >
              <SelectTrigger className="text-xs h-7">
                <SelectValue placeholder={t('flow_builder.webhook_select_method', 'Select method')} />
              </SelectTrigger>
              <SelectContent>
                {HTTP_METHODS.map((method) => (
                  <SelectItem key={method.id} value={method.id}>
                    <span className={getMethodColor(method.id)}>{method.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="block mb-1 font-medium">{t('flow_builder.webhook_url', 'Webhook URL')}</Label>
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder={t('flow_builder.webhook_url_placeholder', 'https://api.example.com/webhook')}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="text-xs h-7 flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2"
                onClick={testWebhook}
                disabled={isTesting || !url.trim()}
                title={t('flow_builder.webhook_test_tooltip', 'Test webhook with current configuration')}
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
            <Label className="block mb-1 font-medium">{t('flow_builder.webhook_authentication', 'Authentication')}</Label>
            <Select
              value={authType}
              onValueChange={setAuthType}
            >
              <SelectTrigger className="text-xs h-7">
                <SelectValue placeholder={t('flow_builder.webhook_select_auth', 'Select auth type')} />
              </SelectTrigger>
              <SelectContent>
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
                  placeholder={t('flow_builder.webhook_bearer_token', 'Bearer token')}
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  className="text-xs h-7"
                />
              </div>
            )}

            {authType === 'basic' && (
              <div className="mt-2 space-y-2">
                <Input
                  placeholder={t('flow_builder.webhook_username', 'Username')}
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  className="text-xs h-7"
                />
                <Input
                  type="password"
                  placeholder={t('flow_builder.webhook_password', 'Password')}
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

          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Timeout (seconds)</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setTimeout(Math.max(1, timeout - 5))}
                  disabled={timeout <= 1}
                >-</Button>
                <span className="text-xs w-8 text-center">{timeout}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setTimeout(Math.min(300, timeout + 5))}
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

          <div className="text-[10px] text-muted-foreground mt-2">
            <p>
              The webhook node makes an HTTP request when reached in the flow and continues immediately to the next node. Response data is stored in variables (webhook.lastResponse, webhook.status, etc.) for use in subsequent nodes. The webhook executes only once per flow execution.
            </p>
          </div>

          {showTestResult && testResult && (
            <div className="mt-3 border border-border rounded p-2 bg-card">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <CheckCircle className="h-4 w-4 text-primary" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span className="text-xs font-medium">
                    {testResult.success ? 'Test Successful' : 'Test Failed'}
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
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium">Status:</span>
                    <span className={`px-1 py-0.5 rounded text-[10px] ${
                      testResult.success
                        ? 'bg-primary/10 text-primary'
                        : 'bg-destructive/10 text-destructive'
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
                        <div className="mt-1 text-[10px] bg-muted/50 p-2 rounded font-mono max-h-20 overflow-y-auto">
                          {Object.entries(testResult.headers).map(([key, value]) => (
                            <div key={key} className="truncate">
                              <span className="text-muted-foreground">{key}:</span> {value}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {testResult.data && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Response Body:
                      </div>
                      <div className="text-[10px] bg-muted/50 p-2 rounded font-mono max-h-32 overflow-y-auto">
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
