import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Info, TestTube, ExternalLink, Loader2, Eye, EyeOff, Stethoscope } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';
interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  connectionId: number;
}

interface FormData {
  accountName: string;
  accountSid: string;
  authToken: string;
  fromNumber: string;
  apiKey: string;
  apiSecret: string;
  twimlAppSid: string;
  callMode: 'basic' | 'ai-powered';
  elevenLabsApiKey: string;
  elevenLabsAgentId: string;
  voiceId: string;
  audioFormat: 'ulaw_8000' | 'pcm_8000' | 'pcm_16000';
  webhookUrl: string;
  statusCallbackUrl: string;
}

export function EditTwilioVoiceConnectionForm({ isOpen, onClose, onSuccess, connectionId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [showElevenLabsKey, setShowElevenLabsKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnosticsReport, setDiagnosticsReport] = useState<any>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [form, setForm] = useState<FormData>({
    accountName: '',
    accountSid: '',
    authToken: '',
    fromNumber: '',
    apiKey: '',
    apiSecret: '',
    twimlAppSid: '',
    callMode: 'basic',
    elevenLabsApiKey: '',
    elevenLabsAgentId: '',
    voiceId: '',
    audioFormat: 'ulaw_8000',
    webhookUrl: `${window.location.origin}/api/webhooks/twilio/voice`,
    statusCallbackUrl: `${window.location.origin}/api/webhooks/twilio/voice-status`
  });

  useEffect(() => {
    if (isOpen && connectionId) {
      loadConfiguration();
    }
  }, [isOpen, connectionId]);

  const loadConfiguration = async () => {
    setIsLoadingData(true);
    try {
      const response = await fetch(`/api/channel-connections/${connectionId}`, {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to load Twilio Voice configuration');
      }

      const connection = await response.json();
 
      if (connection.channelType !== 'twilio_voice') {
        throw new Error('Invalid channel type');
      }

      let connectionData = connection.connectionData;
      if (typeof connectionData === 'string') {
        try {
          connectionData = JSON.parse(connectionData);
        } catch (e) {
          connectionData = {};
        }
      }

      const formData = {
        accountName: connection.accountName || '',
        accountSid: connectionData?.accountSid || '',
        authToken: connectionData?.authToken || '',
        fromNumber: connectionData?.fromNumber || connection.accountId || '',
        apiKey: connectionData?.apiKey || '',
        apiSecret: connectionData?.apiSecret || '',
        twimlAppSid: connectionData?.twimlAppSid || '',
        callMode: connectionData?.callMode || 'basic',
        elevenLabsApiKey: connectionData?.elevenLabsApiKey || '',
        elevenLabsAgentId: connectionData?.elevenLabsAgentId || '',
        voiceId: connectionData?.voiceId || '',
        audioFormat: connectionData?.audioFormat || 'ulaw_8000',
        webhookUrl: connectionData?.webhookUrl || `${window.location.origin}/api/webhooks/twilio/voice`,
        statusCallbackUrl: connectionData?.statusCallbackUrl || `${window.location.origin}/api/webhooks/twilio/voice-status`
      };

      setForm(formData);
    } catch (error: any) {
      console.error('Error loading Twilio Voice configuration:', error);
      toast({
        title: 'Load Failed',
        description: error.message || 'Failed to load Twilio Voice configuration',
        variant: 'destructive'
      });
    } finally {
      setIsLoadingData(false);
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const validate = (): string | null => {
    if (!form.accountName || !form.accountSid || !form.authToken || !form.fromNumber) {
      return 'Please fill all required fields.';
    }
    if (!/^\+\d{6,15}$/.test(form.fromNumber.trim())) {
      return 'From Number must be in E.164 format (e.g., +15551234567).';
    }
    if (!form.apiKey || !form.apiSecret || !form.twimlAppSid) {
      return 'Voice SDK credentials (API Key, API Secret, TwiML App SID) are required for direct calls.';
    }
    if (form.callMode === 'ai-powered' && !form.elevenLabsApiKey) {
      return 'ElevenLabs API Key is required for AI-Powered calls.';
    }
    try {
      const w = new URL(form.webhookUrl);
      const s = new URL(form.statusCallbackUrl);
   
    } catch {
      return 'Webhook URLs are invalid.';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast({ title: 'Validation Error', description: err, variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/channel-connections/${connectionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName: form.accountName,
          accountId: form.fromNumber,
          connectionData: {
            accountSid: form.accountSid,
            authToken: form.authToken,
            fromNumber: form.fromNumber,
            apiKey: form.apiKey,
            apiSecret: form.apiSecret,
            twimlAppSid: form.twimlAppSid,
            webhookUrl: form.webhookUrl,
            statusCallbackUrl: form.statusCallbackUrl,
            callMode: form.callMode,
            ...(form.callMode === 'ai-powered' && {
              elevenLabsApiKey: form.elevenLabsApiKey,
              elevenLabsAgentId: form.elevenLabsAgentId,
              voiceId: form.voiceId,
              audioFormat: form.audioFormat
            })
          }
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to update Twilio Voice connection');
      }
      toast({ 
        title: 'Twilio Voice Updated', 
        description: 'Your Twilio Voice channel has been updated successfully.' 
      });
      onSuccess();
      onClose();
    } catch (error: any) {
      toast({ 
        title: 'Update Failed', 
        description: error.message || 'Failed to update Twilio Voice connection.', 
        variant: 'destructive' 
      });
    } finally {
      setLoading(false);
    }
  };

  const testWebhookHint = () => {
    toast({
      title: 'Webhook Test Tip',
      description: 'Use Twilio Console "Try It Out" or make a test call to your From Number to test voice webhooks.',
    });
  };

  const runDiagnostics = async () => {
    setDiagnosticsLoading(true);
    setDiagnosticsReport(null);
    try {
      const res = await fetch(`/api/call-agent/troubleshoot/${connectionId}`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      setDiagnosticsReport(data);
      setDiagnosticsOpen(true);
      if (data.success && !data.issues?.length) {
        toast({ title: 'Diagnostics passed', description: 'No issues found.' });
      } else if (data.issues?.length) {
        toast({ title: 'Diagnostics complete', description: `${data.issues.length} issue(s) found.`, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Diagnostics failed', description: err.message, variant: 'destructive' });
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  return (
    <TooltipProvider>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Edit Twilio Voice Connection</DialogTitle>
          <DialogDescription>
            Update your Twilio Programmable Voice configuration.
          </DialogDescription>
        </DialogHeader>

        {isLoadingData ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="accountName">Account Name *</Label>
              <Input 
                id="accountName" 
                name="accountName" 
                value={form.accountName} 
                onChange={onChange} 
                placeholder="e.g. Main Voice Line" 
                required 
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="accountSid">Twilio Account SID *</Label>
                <Tooltip>
                  <TooltipTrigger asChild><span><Info className="h-4 w-4 text-muted-foreground cursor-help" /></span></TooltipTrigger>
                  <TooltipContent>34-character identifier starting with &apos;AC&apos;. Find in Twilio Console → Account Dashboard</TooltipContent>
                </Tooltip>
              </div>
              <Input 
                id="accountSid" 
                name="accountSid" 
                value={form.accountSid} 
                onChange={onChange} 
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" 
                required 
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="authToken">Twilio Auth Token *</Label>
                <Tooltip>
                  <TooltipTrigger asChild><span><Info className="h-4 w-4 text-muted-foreground cursor-help" /></span></TooltipTrigger>
                  <TooltipContent>32-character secret. Click &apos;Show&apos; in Twilio Console to reveal</TooltipContent>
                </Tooltip>
              </div>
              <div className="relative">
                <Input 
                  id="authToken" 
                  name="authToken" 
                  type={showAuthToken ? "text" : "password"} 
                  value={form.authToken} 
                  onChange={onChange} 
                  placeholder="Your Twilio Auth Token" 
                  required 
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowAuthToken(!showAuthToken)}
                >
                  {showAuthToken ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="fromNumber">From Number (E.164) *</Label>
              <Input 
                id="fromNumber" 
                name="fromNumber" 
                value={form.fromNumber} 
                onChange={onChange} 
                placeholder="+15551234567" 
                required 
              />
            </div>

            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center gap-2">
                <Label className="text-base font-semibold">Voice SDK Credentials (Required for Direct Calls)</Label>
                <Info className="h-4 w-4 text-muted-foreground" />
              </div>
              
              <Alert>
                <AlertDescription>
                  These credentials enable browser-to-Twilio WebRTC connections for direct calls.
                  Create them in Twilio Console → Account → API Keys and Voice → TwiML Apps.
                </AlertDescription>
              </Alert>

              <div className="grid gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="apiKey">API Key (SID) *</Label>
                  <Tooltip>
                    <TooltipTrigger asChild><span><Info className="h-4 w-4 text-muted-foreground cursor-help" /></span></TooltipTrigger>
                    <TooltipContent>Starts with &apos;SK&apos;. Create in Twilio Console → Account → API Keys</TooltipContent>
                  </Tooltip>
                </div>
                <Input 
                  id="apiKey" 
                  name="apiKey" 
                  value={form.apiKey} 
                  onChange={onChange} 
                  placeholder="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" 
                  required 
                />
                <p className="text-xs text-muted-foreground">
                  From Twilio Console → Account → API Keys
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="apiSecret">API Secret *</Label>
                <div className="relative">
                  <Input 
                    id="apiSecret" 
                    name="apiSecret" 
                    type={showApiSecret ? "text" : "password"}
                    value={form.apiSecret} 
                    onChange={onChange} 
                    placeholder="Shown once when creating API Key" 
                    required
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowApiSecret(!showApiSecret)}
                  >
                    {showApiSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
          
              </div>

              <div className="grid gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="twimlAppSid">TwiML App SID *</Label>
                  <Tooltip>
                    <TooltipTrigger asChild><span><Info className="h-4 w-4 text-muted-foreground cursor-help" /></span></TooltipTrigger>
                    <TooltipContent>Starts with &apos;AP&apos;. Create in Twilio Console → Voice → TwiML Apps</TooltipContent>
                  </Tooltip>
                </div>
                <Input 
                  id="twimlAppSid" 
                  name="twimlAppSid" 
                  value={form.twimlAppSid} 
                  onChange={onChange} 
                  placeholder="APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" 
                  required 
                />
                <p className="text-xs text-muted-foreground">
                  From Twilio Console → Voice → TwiML Apps
                  <br />
                  Set Voice Request URL to: {window.location.origin}/api/twilio/voice-app-twiml
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Call Mode *</Label>
              <div className="flex gap-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="callMode"
                    value="basic"
                    checked={form.callMode === 'basic'}
                    onChange={(e) => setForm(prev => ({ ...prev, callMode: e.target.value as 'basic' | 'ai-powered' }))}
                  />
                  <span>Basic Calls</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="callMode"
                    value="ai-powered"
                    checked={form.callMode === 'ai-powered'}
                    onChange={(e) => setForm(prev => ({ ...prev, callMode: e.target.value as 'basic' | 'ai-powered' }))}
                  />
                  <span>AI-Powered Calls</span>
                </label>
              </div>
            </div>

            {form.callMode === 'ai-powered' && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="elevenLabsApiKey">ElevenLabs API Key *</Label>
                  <div className="relative">
                    <Input 
                      id="elevenLabsApiKey" 
                      name="elevenLabsApiKey" 
                      type={showElevenLabsKey ? "text" : "password"} 
                      value={form.elevenLabsApiKey} 
                      onChange={onChange} 
                      placeholder="Your ElevenLabs API Key" 
                      required={form.callMode === 'ai-powered'}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowElevenLabsKey(!showElevenLabsKey)}
                    >
                      {showElevenLabsKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="elevenLabsAgentId">ElevenLabs Agent ID (Optional)</Label>
                  <Input 
                    id="elevenLabsAgentId" 
                    name="elevenLabsAgentId" 
                    value={form.elevenLabsAgentId} 
                    onChange={onChange} 
                    placeholder="Pre-configured agent ID" 
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="voiceId">Voice ID (Optional)</Label>
                  <Input 
                    id="voiceId" 
                    name="voiceId" 
                    value={form.voiceId} 
                    onChange={onChange} 
                    placeholder="ElevenLabs voice identifier" 
                  />
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="audioFormat">Audio Format</Label>
                    <Tooltip>
                      <TooltipTrigger asChild><span><Info className="h-4 w-4 text-muted-foreground cursor-help" /></span></TooltipTrigger>
                      <TooltipContent>Must match ElevenLabs agent settings. µ-law 8kHz recommended for Twilio</TooltipContent>
                    </Tooltip>
                  </div>
                  <select
                    id="audioFormat"
                    name="audioFormat"
                    value={form.audioFormat}
                    onChange={(e) => setForm(prev => ({ ...prev, audioFormat: e.target.value as 'ulaw_8000' | 'pcm_8000' | 'pcm_16000' }))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="ulaw_8000">µ-law 8kHz (Recommended for Twilio)</option>
                    <option value="pcm_8000">PCM 8kHz</option>
                    <option value="pcm_16000">PCM 16kHz</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Must match the agent's audio format in ElevenLabs dashboard. µ-law 8kHz is recommended for best Twilio compatibility.
                  </p>
                </div>
              </>
            )}

            <div className="border-t pt-4 grid gap-3">
              <div className="flex items-center justify-between">
                <Label>Webhook URLs</Label>
                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setShowDocs(true)} 
                    className="flex items-center gap-2"
                  >
                    <Info className="h-4 w-4" />
                    Setup Instructions
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={testWebhookHint} 
                    className="flex items-center gap-2"
                  >
                    <TestTube className="h-4 w-4" />
                    Test Webhook
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="webhookUrl">Voice Webhook URL</Label>
                <Input 
                  id="webhookUrl" 
                  name="webhookUrl" 
                  value={form.webhookUrl} 
                  onChange={onChange} 
                  placeholder={`${window.location.origin}/api/webhooks/twilio/voice`} 
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="statusCallbackUrl">Status Callback URL</Label>
                <Input 
                  id="statusCallbackUrl" 
                  name="statusCallbackUrl" 
                  value={form.statusCallbackUrl} 
                  onChange={onChange} 
                  placeholder={`${window.location.origin}/api/webhooks/twilio/voice-status`} 
                />
              </div>

              <Alert>
                <AlertDescription>
                  Ensure both URLs are publicly accessible via HTTPS. We verify Twilio requests with X-Twilio-Signature.
                </AlertDescription>
              </Alert>
            </div>

            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Troubleshooting & Config</Label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={runDiagnostics} disabled={diagnosticsLoading}>
                  {diagnosticsLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Stethoscope className="h-4 w-4 mr-2" />}
                  Run Diagnostics
                </Button>
              </div>
              {diagnosticsReport && (
                <Collapsible open={diagnosticsOpen} onOpenChange={setDiagnosticsOpen}>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="w-full justify-between">
                      <span>Diagnostics report</span>
                      <span className="text-muted-foreground text-xs">
                        {diagnosticsReport.issues?.length ? `${diagnosticsReport.issues.length} issue(s)` : 'OK'}
                      </span>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 rounded-md border p-3 text-sm space-y-2">
                      <p><strong>Twilio Account:</strong>{' '}
                        <span className={diagnosticsReport.twilioAccount?.status === 'valid' ? 'text-green-600' : 'text-destructive'}>
                          {diagnosticsReport.twilioAccount?.status ?? 'unknown'} {diagnosticsReport.twilioAccount?.friendlyName && `(${diagnosticsReport.twilioAccount.friendlyName})`}
                        </span>
                      </p>
                      <p><strong>TwiML App:</strong>{' '}
                        <span className={diagnosticsReport.twimlApp?.status === 'valid' ? 'text-green-600' : 'text-destructive'}>
                          {diagnosticsReport.twimlApp?.status ?? 'unknown'}
                        </span>
                      </p>
                      <p><strong>Webhook:</strong>{' '}
                        <span className={diagnosticsReport.webhook?.accessible !== false ? 'text-green-600' : 'text-amber-600'}>
                          {diagnosticsReport.webhook?.accessible !== false ? 'Accessible' : 'Not reachable'}
                        </span>
                      </p>
                      <p><strong>Circuit Breaker:</strong> {diagnosticsReport.circuitBreaker?.state ?? 'unknown'} (failures: {diagnosticsReport.circuitBreaker?.failureCount ?? 0})</p>
                      {diagnosticsReport.issues?.length > 0 && (
                        <div>
                          <strong>Issues:</strong>
                          <ul className="list-disc list-inside mt-1">
                            {diagnosticsReport.issues.map((i: any, idx: number) => (
                              <li key={idx} className={i.severity === 'critical' ? 'text-destructive' : i.severity === 'warning' ? 'text-amber-600' : ''}>
                                {i.message} {i.suggestion && `— ${i.suggestion}`}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <a href="/api/call-agent/health" target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                        Full health check (super admin)
                      </a>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="btn-brand-primary" 
                variant="outline" 
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Connection'
                )}
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* In-app setup instructions popup */}
        <Dialog open={showDocs} onOpenChange={setShowDocs}>
          <DialogContent className="sm:max-w-[720px]">
            <DialogHeader>
              <DialogTitle>Twilio Voice Setup Instructions</DialogTitle>
              <DialogDescription>
                Follow these steps to complete the integration.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <ol className="list-decimal list-inside space-y-2">
                <li>Buy or select a Twilio phone number enabled for Voice.</li>
                <li>In Twilio Console, set the Voice webhook to:
                  <div className="mt-1 p-2 bg-muted rounded text-xs select-all break-all">
                    {form.webhookUrl}
                  </div>
                </li>
                <li>Set the Status Callback URL to:
                  <div className="mt-1 p-2 bg-muted rounded text-xs select-all break-all">
                    {form.statusCallbackUrl}
                  </div>
                </li>
                <li>Paste your Account SID and Auth Token here, and the From Number in E.164 format (e.g., +15551234567).</li>
                <li>Choose your call mode:
                  <ul className="list-disc list-inside mt-1 ml-4">
                    <li><strong>Basic Calls:</strong> Standard Twilio voice calls</li>
                    <li><strong>AI-Powered Calls:</strong> Uses ElevenLabs for AI voice conversations</li>
                  </ul>
                </li>
                {form.callMode === 'ai-powered' && (
                  <li>For AI-Powered calls:
                    <ul className="list-disc list-inside mt-1 ml-4">
                      <li>Get your ElevenLabs API Key from the ElevenLabs dashboard</li>
                      <li>Optionally, specify an Agent ID for pre-configured AI agents</li>
                      <li>Optionally, provide a Voice ID for custom voice selection</li>
                      <li><strong>Important:</strong> Configure your ElevenLabs agent with matching audio format:
                        <ul className="list-disc list-inside mt-1 ml-4">
                          <li>Go to ElevenLabs dashboard → Agent Settings → Advanced Settings</li>
                          <li>Set "User Input Audio Format" to "ulaw 8000 Hz" (recommended) or matching format</li>
                          <li>Set "TTS Output Format" to match the input format</li>
                          <li>Save the agent configuration</li>
                        </ul>
                      </li>
                    </ul>
                  </li>
                )}
                <li>Save. Incoming calls will appear in the system and can be handled based on your configuration.</li>
              </ol>
              <div className="pt-2 space-y-2">
                <a
                  href="https://www.twilio.com/docs/voice"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" /> Twilio Voice Docs (external)
                </a>
                {form.callMode === 'ai-powered' && (
                  <a
                    href="https://elevenlabs.io/docs"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-primary hover:underline block"
                  >
                    <ExternalLink className="h-4 w-4" /> ElevenLabs Docs (external)
                  </a>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
    </TooltipProvider>
  );
}
