import React, { useState } from 'react';
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
import { Info, TestTube, ExternalLink, Check, X, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
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

type FieldValidationStatus = 'valid' | 'invalid' | 'validating' | null;

export function TwilioVoiceConnectionForm({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [validationReport, setValidationReport] = useState<{
    success: boolean;
    twilioRestApi?: { valid: boolean; accountInfo?: any; error?: string; suggestions?: string[] };
    twimlApp?: { valid: boolean; error?: string; appName?: string };
    voiceSdk?: { valid: boolean; error?: string };
    elevenLabs?: { valid: boolean; error?: string };
    webhooks?: { statusCallbackAccessible?: boolean; error?: string };
    recommendations?: string[];
  } | null>(null);
  const [fieldStatus, setFieldStatus] = useState<Record<string, FieldValidationStatus>>({});
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

  const getConnectionDataPayload = () => ({
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
  });

  const runValidation = async (): Promise<typeof validationReport> => {
    const res = await fetch('/api/channel-connections/validate-twilio-voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionData: getConnectionDataPayload() }),
      credentials: 'include'
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 429) {
      toast({ title: 'Rate limited', description: data.error || 'Try again in a minute.', variant: 'destructive' });
      return null;
    }
    return data;
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
      const report = await runValidation();
      if (report && !report.success) {
        setValidationReport(report);
        setValidationOpen(true);
        toast({
          title: 'Pre-flight validation failed',
          description: report.recommendations?.[0] || 'Fix errors below before saving.',
          variant: 'destructive'
        });
        setLoading(false);
        return;
      }
      if (report && report.success && report.recommendations?.length) {
        setValidationReport(report);
        const proceed = window.confirm(
          'Validation passed with warnings:\n\n' +
          report.recommendations.join('\n') +
          '\n\nDo you want to save anyway?'
        );
        if (!proceed) {
          setLoading(false);
          return;
        }
      }
      const res = await fetch('/api/channel-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelType: 'twilio_voice',
          accountId: form.fromNumber,
          accountName: form.accountName,
          connectionData: getConnectionDataPayload(),
          status: 'active'
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to create Twilio Voice connection');
      }
      toast({
        title: 'Twilio Voice Connected',
        description: 'Your Twilio Voice channel has been added. Estimated setup: configure webhooks in Twilio Console, then test a call.'
      });
      onSuccess();
      onClose();
    } catch (error: any) {
      toast({ title: 'Connection Failed', description: error.message || 'Failed to connect Twilio Voice.', variant: 'destructive' });
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

  const handleValidateCredentials = async () => {
    if (!form.accountSid || !form.authToken || !form.apiKey || !form.apiSecret || !form.twimlAppSid) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in Account SID, Auth Token, API Key, API Secret, and TwiML App SID before validating.',
        variant: 'destructive'
      });
      return;
    }
    setValidating(true);
    setFieldStatus({
      accountSid: 'validating',
      authToken: 'validating',
      apiKey: 'validating',
      apiSecret: 'validating',
      twimlAppSid: 'validating',
      ...(form.callMode === 'ai-powered' && form.elevenLabsApiKey ? { elevenLabsApiKey: 'validating' as const } : {})
    });
    setValidationReport(null);
    try {
      const report = await runValidation();
      setValidationReport(report || null);
      setValidationOpen(!!report);
      const status: Record<string, FieldValidationStatus> = {};
      if (report?.twilioRestApi) status.accountSid = status.authToken = report.twilioRestApi.valid ? 'valid' : 'invalid';
      if (report?.twimlApp) status.twimlAppSid = report.twimlApp.valid ? 'valid' : 'invalid';
      if (report?.voiceSdk) status.apiKey = status.apiSecret = report.voiceSdk.valid ? 'valid' : 'invalid';
      if (report?.elevenLabs) status.elevenLabsApiKey = report.elevenLabs.valid ? 'valid' : 'invalid';
      setFieldStatus(prev => ({ ...prev, ...status }));
      if (report?.success) {
        toast({ title: 'Validation passed', description: 'All credentials validated. You can save the connection.' });
      } else {
        toast({
          title: 'Validation failed',
          description: report?.recommendations?.[0] || 'Check the validation report below.',
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      toast({ title: 'Validation Failed', description: error.message || 'Failed to validate credentials.', variant: 'destructive' });
      setFieldStatus({});
    } finally {
      setValidating(false);
    }
  };

  const ValidationIcon = ({ field }: { field: string }) => {
    const s = fieldStatus[field];
    if (s === 'validating') return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    if (s === 'valid') return <Check className="h-4 w-4 text-green-600" />;
    if (s === 'invalid') return <X className="h-4 w-4 text-destructive" />;
    return null;
  };

  return (
    <TooltipProvider>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Connect Twilio Voice</DialogTitle>
          <DialogDescription>
            Configure Twilio Programmable Voice to enable voice calls (Basic or AI-Powered).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="accountName">Account Name *</Label>
            <Input id="accountName" name="accountName" value={form.accountName} onChange={onChange} placeholder="e.g. Main Voice Line" required />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="accountSid">Twilio Account SID *</Label>
              <Tooltip>
                <TooltipTrigger asChild><span><Info className="h-4 w-4 text-muted-foreground cursor-help" /></span></TooltipTrigger>
                <TooltipContent>34-character identifier starting with &apos;AC&apos;. Find in Twilio Console → Account Dashboard</TooltipContent>
              </Tooltip>
              <ValidationIcon field="accountSid" />
            </div>
            <Input id="accountSid" name="accountSid" value={form.accountSid} onChange={onChange} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" required />
            {validationReport?.twilioRestApi && !validationReport.twilioRestApi.valid && (
              <p className="text-xs text-destructive">{validationReport.twilioRestApi.error}</p>
            )}
          </div>

          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="authToken">Twilio Auth Token *</Label>
              <Tooltip>
                <TooltipTrigger asChild><span><Info className="h-4 w-4 text-muted-foreground cursor-help" /></span></TooltipTrigger>
                <TooltipContent>32-character secret. Click &apos;Show&apos; in Twilio Console to reveal</TooltipContent>
              </Tooltip>
              <ValidationIcon field="authToken" />
            </div>
            <Input id="authToken" name="authToken" type="password" value={form.authToken} onChange={onChange} placeholder="Your Twilio Auth Token" required />
            {validationReport?.twilioRestApi && !validationReport.twilioRestApi.valid && (
              <p className="text-xs text-destructive">{validationReport.twilioRestApi.error}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="fromNumber">From Number (E.164) *</Label>
            <Input id="fromNumber" name="fromNumber" value={form.fromNumber} onChange={onChange} placeholder="+15551234567" required />
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
                <ValidationIcon field="apiKey" />
              </div>
              <Input 
                id="apiKey" 
                name="apiKey" 
                value={form.apiKey} 
                onChange={onChange} 
                placeholder="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" 
                required 
              />
              {validationReport?.voiceSdk && !validationReport.voiceSdk.valid && (
                <p className="text-xs text-destructive">{validationReport.voiceSdk.error}</p>
              )}
              <p className="text-xs text-muted-foreground">
                From Twilio Console → Account → API Keys → Create API Key
              </p>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="apiSecret">API Secret *</Label>
                <ValidationIcon field="apiSecret" />
              </div>
              <Input 
                id="apiSecret" 
                name="apiSecret" 
                type="password" 
                value={form.apiSecret} 
                onChange={onChange} 
                placeholder="Shown once when creating API Key" 
                required 
              />
         
            </div>

            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="twimlAppSid">TwiML App SID *</Label>
                <Tooltip>
                  <TooltipTrigger asChild><span><Info className="h-4 w-4 text-muted-foreground cursor-help" /></span></TooltipTrigger>
                  <TooltipContent>Starts with &apos;AP&apos;. Create in Twilio Console → Voice → TwiML Apps</TooltipContent>
                </Tooltip>
                <ValidationIcon field="twimlAppSid" />
              </div>
              <Input 
                id="twimlAppSid" 
                name="twimlAppSid" 
                value={form.twimlAppSid} 
                onChange={onChange} 
                placeholder="APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" 
                required 
              />
              {validationReport?.twimlApp && !validationReport.twimlApp.valid && (
                <p className="text-xs text-destructive">{validationReport.twimlApp.error}</p>
              )}
              <p className="text-xs text-muted-foreground">
                From Twilio Console → Voice → TwiML Apps → Create new TwiML App
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
                <div className="flex items-center gap-2">
                  <Label htmlFor="elevenLabsApiKey">ElevenLabs API Key *</Label>
                  <ValidationIcon field="elevenLabsApiKey" />
                </div>
                <Input id="elevenLabsApiKey" name="elevenLabsApiKey" type="password" value={form.elevenLabsApiKey} onChange={onChange} placeholder="Your ElevenLabs API Key" required={form.callMode === 'ai-powered'} />
                {validationReport?.elevenLabs && !validationReport.elevenLabs.valid && (
                  <p className="text-xs text-destructive">{validationReport.elevenLabs.error}</p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="elevenLabsAgentId">ElevenLabs Agent ID (Optional)</Label>
                <Input id="elevenLabsAgentId" name="elevenLabsAgentId" value={form.elevenLabsAgentId} onChange={onChange} placeholder="Pre-configured agent ID" />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="voiceId">Voice ID (Optional)</Label>
                <Input id="voiceId" name="voiceId" value={form.voiceId} onChange={onChange} placeholder="ElevenLabs voice identifier" />
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
                <Button type="button" variant="outline" size="sm" onClick={() => setShowDocs(true)} className="flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Setup Instructions
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={testWebhookHint} className="flex items-center gap-2">
                  <TestTube className="h-4 w-4" />
                  Test Webhook
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="webhookUrl">Voice Webhook URL</Label>
              <Input id="webhookUrl" name="webhookUrl" value={form.webhookUrl} onChange={onChange} placeholder={`${window.location.origin}/api/webhooks/twilio/voice`} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="statusCallbackUrl">Status Callback URL</Label>
              <Input id="statusCallbackUrl" name="statusCallbackUrl" value={form.statusCallbackUrl} onChange={onChange} placeholder={`${window.location.origin}/api/webhooks/twilio/voice-status`} />
            </div>

            <Alert>
              <AlertDescription>
                Ensure both URLs are publicly accessible via HTTPS. We verify Twilio requests with X-Twilio-Signature.
              </AlertDescription>
            </Alert>
          </div>

          {validationReport && (
            <Collapsible open={validationOpen} onOpenChange={setValidationOpen}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="w-full justify-between">
                  <span>{validationReport.success ? '✓ Validation report' : 'Validation report (issues found)'}</span>
                  {validationOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 rounded-md border bg-muted/50 p-3 text-sm space-y-2">
                  {validationReport.twilioRestApi && (
                    <p>
                      <strong>Twilio REST API:</strong>{' '}
                      {validationReport.twilioRestApi.valid ? '✓ Valid' : `✗ ${validationReport.twilioRestApi.error}`}
                      {validationReport.twilioRestApi.accountInfo?.friendlyName && ` (${validationReport.twilioRestApi.accountInfo.friendlyName})`}
                    </p>
                  )}
                  {validationReport.twimlApp && (
                    <p>
                      <strong>TwiML App:</strong>{' '}
                      {validationReport.twimlApp.valid ? `✓ Valid${validationReport.twimlApp.appName ? ` (${validationReport.twimlApp.appName})` : ''}` : `✗ ${validationReport.twimlApp.error}`}
                    </p>
                  )}
                  {validationReport.voiceSdk && (
                    <p>
                      <strong>Voice SDK:</strong>{' '}
                      {validationReport.voiceSdk.valid ? '✓ Token generated' : `✗ ${validationReport.voiceSdk.error}`}
                    </p>
                  )}
                  {validationReport.elevenLabs && (
                    <p>
                      <strong>ElevenLabs:</strong>{' '}
                      {validationReport.elevenLabs.valid ? '✓ Valid' : `✗ ${validationReport.elevenLabs.error}`}
                    </p>
                  )}
                  {validationReport.webhooks && (
                    <p>
                      <strong>Webhooks:</strong>{' '}
                      {validationReport.webhooks.statusCallbackAccessible !== false ? '✓ Accessible' : `⚠ ${validationReport.webhooks.error || 'Not publicly accessible'}`}
                    </p>
                  )}
                  {validationReport.recommendations && validationReport.recommendations.length > 0 && (
                    <div>
                      <strong>Recommendations:</strong>
                      <ul className="list-disc list-inside mt-1">
                        {validationReport.recommendations.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          <DialogFooter className="flex items-center justify-between">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleValidateCredentials}
              disabled={validating || !form.accountSid || !form.authToken || !form.apiKey || !form.apiSecret || !form.twimlAppSid}
              className="flex items-center gap-2"
            >
              {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
              {validating ? 'Validating...' : 'Validate All'}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" className="btn-brand-primary" variant="outline" disabled={loading}>
                {loading ? 'Connecting...' : 'Connect Twilio Voice'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>

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
                <div className="mt-1 p-2 bg-muted rounded text-xs select-all break-all">{form.webhookUrl}</div>
              </li>
              <li>Set the Status Callback URL to:
                <div className="mt-1 p-2 bg-muted rounded text-xs select-all break-all">{form.statusCallbackUrl}</div>
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
    </Dialog>
    </TooltipProvider>
  );
}
