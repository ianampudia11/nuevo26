"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Info, TestTube, Check, Loader2, ChevronLeft, ChevronRight, Copy, ExternalLink } from "lucide-react";
import { ValidationSummary, type ValidationSection } from "@/components/settings/ValidationSummary";

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
  callMode: "basic" | "ai-powered";
  elevenLabsApiKey: string;
  elevenLabsAgentId: string;
  voiceId: string;
  audioFormat: "ulaw_8000" | "pcm_8000" | "pcm_16000";
  statusCallbackUrl: string;
}

const STEPS = [
  { id: 1, title: "Twilio Account" },
  { id: 2, title: "Voice SDK" },
  { id: 3, title: "Call Mode" },
  { id: 4, title: "ElevenLabs" },
  { id: 5, title: "Webhooks" },
  { id: 6, title: "Review & Save" }
];

export function TwilioVoiceSetupWizard({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationReport, setValidationReport] = useState<any>(null);
  const [form, setForm] = useState<FormData>({
    accountName: "",
    accountSid: "",
    authToken: "",
    fromNumber: "",
    apiKey: "",
    apiSecret: "",
    twimlAppSid: "",
    callMode: "basic",
    elevenLabsApiKey: "",
    elevenLabsAgentId: "",
    voiceId: "",
    audioFormat: "ulaw_8000",
    statusCallbackUrl: `${window.location.origin}/api/webhooks/twilio/voice-status`
  });

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const runValidation = async () => {
    const res = await fetch("/api/channel-connections/validate-twilio-voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionData: {
          accountSid: form.accountSid,
          authToken: form.authToken,
          fromNumber: form.fromNumber,
          apiKey: form.apiKey,
          apiSecret: form.apiSecret,
          twimlAppSid: form.twimlAppSid,
          statusCallbackUrl: form.statusCallbackUrl,
          callMode: form.callMode,
          ...(form.callMode === "ai-powered" && {
            elevenLabsApiKey: form.elevenLabsApiKey,
            elevenLabsAgentId: form.elevenLabsAgentId,
            voiceId: form.voiceId,
            audioFormat: form.audioFormat
          })
        }
      }),
      credentials: "include"
    });
    return res.json();
  };

  const validationReportToSections = (report: any): ValidationSection[] => {
    if (!report) return [];
    const sections: ValidationSection[] = [];
    if (report.twilioRestApi) {
      sections.push({
        key: "twilioRestApi",
        label: "Twilio account",
        status: report.twilioRestApi.valid ? "valid" : "error",
        responseTime: report.twilioRestApi.responseTime,
        message: report.twilioRestApi.valid ? report.twilioRestApi.accountInfo?.friendlyName : report.twilioRestApi.error,
        recommendedActions: report.twilioRestApi.valid ? undefined : (report.recommendations || []).slice(0, 3)
      });
    }
    if (report.voiceSdk) {
      sections.push({
        key: "voiceSdk",
        label: "Voice SDK",
        status: report.voiceSdk.valid ? "valid" : "error",
        responseTime: report.voiceSdk.responseTime,
        message: report.voiceSdk.error,
        recommendedActions: report.voiceSdk.valid ? undefined : (report.recommendations || []).slice(0, 3)
      });
    }
    if (report.twimlApp) {
      sections.push({
        key: "twimlApp",
        label: "TwiML App",
        status: report.twimlApp.valid ? "valid" : "error",
        responseTime: report.twimlApp.responseTime,
        message: report.twimlApp.valid ? report.twimlApp.appName : report.twimlApp.error,
        recommendedActions: report.twimlApp.valid ? undefined : (report.recommendations || []).slice(0, 3)
      });
    }
    if (report.elevenLabs) {
      sections.push({
        key: "elevenLabs",
        label: "ElevenLabs",
        status: report.elevenLabs.valid ? "valid" : "error",
        responseTime: report.elevenLabs.responseTime,
        message: report.elevenLabs.error,
        recommendedActions: report.elevenLabs.valid ? undefined : (report.recommendations || []).slice(0, 3)
      });
    }
    if (report.webhooks) {
      const accessible = report.webhooks.statusCallbackAccessible === true;
      sections.push({
        key: "webhooks",
        label: "Webhook accessibility",
        status: accessible ? "valid" : "warning",
        message: accessible ? "Status callback URL reachable" : (report.webhooks.error || "URL not reachable"),
        recommendedActions: accessible ? undefined : (report.recommendations || []).slice(0, 3)
      });
    }
    return sections;
  };

  const handleValidateStep1 = async () => {
    if (!form.accountSid || !form.authToken || !form.fromNumber) {
      toast({ title: "Fill required fields", description: "Account SID, Auth Token, From Number", variant: "destructive" });
      return;
    }
    setValidating(true);
    try {
      const report = await runValidation();
      setValidationReport(report);
      if (report?.twilioRestApi?.valid) {
        toast({ title: "Twilio credentials valid", description: report.twilioRestApi.accountInfo?.friendlyName ? `Account: ${report.twilioRestApi.accountInfo.friendlyName}` : undefined });
      } else {
        toast({ title: "Validation failed", description: report?.twilioRestApi?.error, variant: "destructive" });
      }
    } finally {
      setValidating(false);
    }
  };

  const handleValidateStep2 = async () => {
    if (!form.apiKey || !form.apiSecret || !form.twimlAppSid) {
      toast({ title: "Fill API Key, API Secret, TwiML App SID", variant: "destructive" });
      return;
    }
    setValidating(true);
    try {
      const report = await runValidation();
      setValidationReport(report);
      if (report?.voiceSdk?.valid && report?.twimlApp?.valid) {
        toast({ title: "Voice SDK valid", description: "Token generation and TwiML App OK" });
      } else {
        toast({ title: "Validation failed", description: report?.voiceSdk?.error || report?.twimlApp?.error, variant: "destructive" });
      }
    } finally {
      setValidating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "URL copied to clipboard" });
  };

  const stepRequiresValidation = (s: number) => s === 1 || s === 2 || (s === 4 && isStep4Visible) || s === 5;

  const stepValidationPassed = (report: any, s: number): boolean => {
    if (!report) return false;
    if (s === 1) return !!report.twilioRestApi?.valid;
    if (s === 2) return !!(report.voiceSdk?.valid && report.twimlApp?.valid);
    if (s === 4 && isStep4Visible) return !!report.elevenLabs?.valid;
    if (s === 5) return report.webhooks?.statusCallbackAccessible !== false;
    return true;
  };

  const handleNext = async () => {
    if (step === 3) {
      setStep(form.callMode === "ai-powered" ? 4 : 5);
      return;
    }
    if (stepRequiresValidation(step)) {
      if (!form.accountSid || !form.authToken || !form.fromNumber) {
        toast({ title: "Fill required fields", description: "Account SID, Auth Token, From Number", variant: "destructive" });
        return;
      }
      if (step === 2 && (!form.apiKey || !form.apiSecret || !form.twimlAppSid)) {
        toast({ title: "Fill API Key, API Secret, TwiML App SID", variant: "destructive" });
        return;
      }
      if (step === 4 && isStep4Visible && !form.elevenLabsApiKey) {
        toast({ title: "ElevenLabs API Key required for AI-powered mode", variant: "destructive" });
        return;
      }
      setValidating(true);
      try {
        const report = await runValidation();
        setValidationReport(report);
        if (!stepValidationPassed(report, step)) {
          toast({ title: "Validation failed", description: "Fix the issues below before continuing.", variant: "destructive" });
          setValidating(false);
          return;
        }
        if (step === 1) setStep(2);
        else if (step === 2) setStep(3);
        else if (step === 4) setStep(5);
        else if (step === 5) setStep(6);
      } finally {
        setValidating(false);
      }
      return;
    }
    if (step === 6) return;
    setStep((s) => s + 1);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const report = await runValidation();
      setValidationReport(report);
      if (!report?.success) {
        toast({ title: "Validation failed", description: "Fix validation errors before saving.", variant: "destructive" });
        setLoading(false);
        return;
      }
      const res = await fetch("/api/channel-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelType: "twilio_voice",
          accountId: form.fromNumber,
          accountName: form.accountName,
          connectionData: {
            accountSid: form.accountSid,
            authToken: form.authToken,
            fromNumber: form.fromNumber,
            apiKey: form.apiKey,
            apiSecret: form.apiSecret,
            twimlAppSid: form.twimlAppSid,
            statusCallbackUrl: form.statusCallbackUrl,
            callMode: form.callMode,
            ...(form.callMode === "ai-powered" && {
              elevenLabsApiKey: form.elevenLabsApiKey,
              elevenLabsAgentId: form.elevenLabsAgentId,
              voiceId: form.voiceId,
              audioFormat: form.audioFormat
            })
          },
          status: "active"
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to create connection");
      }
      toast({ title: "Setup complete", description: "Twilio Voice connection saved. Configure webhooks in Twilio Console and test a call." });
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const exportConfig = () => {
    const config = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      connectionType: "twilio_voice",
      configuration: {
        accountName: form.accountName,
        accountSid: form.accountSid ? form.accountSid.slice(0, 4) + "*".repeat(26) + form.accountSid.slice(-4) : "",
        authToken: "[REDACTED]",
        fromNumber: form.fromNumber,
        apiKey: form.apiKey ? form.apiKey.slice(0, 4) + "*".repeat(28) + form.apiKey.slice(-4) : "",
        apiSecret: "[REDACTED]",
        twimlAppSid: form.twimlAppSid ? form.twimlAppSid.slice(0, 4) + "*".repeat(28) + form.twimlAppSid.slice(-4) : "",
        callMode: form.callMode,
        elevenLabsApiKey: form.elevenLabsApiKey ? "[REDACTED]" : "",
        elevenLabsAgentId: form.elevenLabsAgentId,
        voiceId: form.voiceId,
        audioFormat: form.audioFormat
      }
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `twilio-voice-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "Configuration saved as JSON" });
  };

  const isStep4Visible = form.callMode === "ai-powered";
  const stepsVisible = STEPS.filter((s) => s.id !== 4 || isStep4Visible);
  const maxStepNum = stepsVisible.length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Twilio Voice Setup Wizard</DialogTitle>
          <DialogDescription>
            Step {stepsVisible.findIndex((s) => s.id === step) + 1 || 1} of {maxStepNum}: {STEPS.find((s) => s.id === step)?.title}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {stepsVisible.map((s, idx) => {
            const active = step === s.id;
            return (
              <div
                key={s.id}
                className={`shrink-0 px-2 py-1 rounded text-xs font-medium ${active ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                {idx + 1}. {s.title}
              </div>
            );
          })}
        </div>

        {/* Step 1: Twilio Account Credentials */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Account Name *</Label>
              <Input name="accountName" value={form.accountName} onChange={onChange} placeholder="e.g. Main Voice Line" />
            </div>
            <div className="grid gap-2">
              <Label>Account SID *</Label>
              <Input name="accountSid" value={form.accountSid} onChange={onChange} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
            </div>
            <div className="grid gap-2">
              <Label>Auth Token *</Label>
              <Input name="authToken" type="password" value={form.authToken} onChange={onChange} placeholder="Your Twilio Auth Token" />
            </div>
            <div className="grid gap-2">
              <Label>From Number (E.164) *</Label>
              <Input name="fromNumber" value={form.fromNumber} onChange={onChange} placeholder="+15551234567" />
            </div>
            {validationReport?.twilioRestApi && (
              <Alert variant={validationReport.twilioRestApi.valid ? "default" : "destructive"}>
                <AlertDescription>
                  {validationReport.twilioRestApi.valid
                    ? `✓ Account: ${validationReport.twilioRestApi.accountInfo?.friendlyName || "Valid"}`
                    : validationReport.twilioRestApi.error}
                </AlertDescription>
              </Alert>
            )}
            <Button type="button" variant="outline" onClick={handleValidateStep1} disabled={validating}>
              {validating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Validate credentials
            </Button>
          </div>
        )}

        {/* Step 2: Voice SDK */}
        {step === 2 && (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                Create API Key and TwiML App in Twilio Console → Account → API Keys and Voice → TwiML Apps.
              </AlertDescription>
            </Alert>
            <div className="grid gap-2">
              <Label>API Key (SID) *</Label>
              <Input name="apiKey" value={form.apiKey} onChange={onChange} placeholder="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
            </div>
            <div className="grid gap-2">
              <Label>API Secret *</Label>
              <Input name="apiSecret" type="password" value={form.apiSecret} onChange={onChange} placeholder="Shown once when creating API Key" />
            </div>
            <div className="grid gap-2">
              <Label>TwiML App SID *</Label>
              <Input name="twimlAppSid" value={form.twimlAppSid} onChange={onChange} placeholder="APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
            </div>
            <p className="text-xs text-muted-foreground">
              Voice Request URL: {window.location.origin}/api/twilio/voice-app-twiml
            </p>
            {validationReport?.voiceSdk && (
              <Alert variant={validationReport.voiceSdk.valid && validationReport.twimlApp?.valid ? "default" : "destructive"}>
                <AlertDescription>
                  {validationReport.voiceSdk.valid ? "✓ Token generated" : validationReport.voiceSdk.error}
                  {validationReport.twimlApp && (validationReport.twimlApp.valid ? ` • TwiML App: ${validationReport.twimlApp.appName || "OK"}` : ` • TwiML: ${validationReport.twimlApp.error}`)}
                </AlertDescription>
              </Alert>
            )}
            <Button type="button" variant="outline" onClick={handleValidateStep2} disabled={validating}>
              {validating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Validate Voice SDK
            </Button>
          </div>
        )}

        {/* Step 3: Call Mode */}
        {step === 3 && (
          <div className="space-y-4">
            <Label>Call Mode *</Label>
            <div className="flex gap-4">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="callMode"
                  value="basic"
                  checked={form.callMode === "basic"}
                  onChange={(e) => setForm((prev) => ({ ...prev, callMode: e.target.value as "basic" | "ai-powered" }))}
                />
                <span>Basic Calls</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="callMode"
                  value="ai-powered"
                  checked={form.callMode === "ai-powered"}
                  onChange={(e) => setForm((prev) => ({ ...prev, callMode: e.target.value as "basic" | "ai-powered" }))}
                />
                <span>AI-Powered Calls</span>
              </label>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className="font-medium">Feature</th>
                    <th className="font-medium">Basic</th>
                    <th className="font-medium">AI-Powered</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>WebRTC / Direct</td><td>✓</td><td>✓</td></tr>
                  <tr><td>ElevenLabs AI voice</td><td>—</td><td>✓</td></tr>
                  <tr><td>Conversational AI</td><td>—</td><td>✓</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step 4: ElevenLabs (conditional) */}
        {step === 4 && isStep4Visible && (
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>ElevenLabs API Key *</Label>
              <Input name="elevenLabsApiKey" type="password" value={form.elevenLabsApiKey} onChange={onChange} placeholder="Your ElevenLabs API Key" />
            </div>
            <div className="grid gap-2">
              <Label>ElevenLabs Agent ID (Optional)</Label>
              <Input name="elevenLabsAgentId" value={form.elevenLabsAgentId} onChange={onChange} placeholder="Pre-configured agent ID" />
            </div>
            <div className="grid gap-2">
              <Label>Voice ID (Optional)</Label>
              <Input name="voiceId" value={form.voiceId} onChange={onChange} placeholder="ElevenLabs voice identifier" />
            </div>
            <div className="grid gap-2">
              <Label>Audio Format</Label>
              <select
                value={form.audioFormat}
                onChange={(e) => setForm((prev) => ({ ...prev, audioFormat: e.target.value as FormData["audioFormat"] }))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="ulaw_8000">µ-law 8kHz (Recommended for Twilio)</option>
                <option value="pcm_8000">PCM 8kHz</option>
                <option value="pcm_16000">PCM 16kHz</option>
              </select>
              <p className="text-xs text-muted-foreground">Must match ElevenLabs agent settings. µ-law 8kHz recommended.</p>
            </div>
            {validationReport?.elevenLabs && (
              <Alert variant={validationReport.elevenLabs.valid ? "default" : "destructive"}>
                <AlertDescription>
                  {validationReport.elevenLabs.valid
                    ? "✓ ElevenLabs configured"
                    : validationReport.elevenLabs.error}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Step 5: Webhooks */}
        {step === 5 && (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>Set these URLs in Twilio Console for your phone number and TwiML App.</AlertDescription>
            </Alert>
            <div className="grid gap-2">
              <Label>Status Callback URL</Label>
              <div className="flex gap-2">
                <Input readOnly value={form.statusCallbackUrl} className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={() => copyToClipboard(form.statusCallbackUrl)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Voice webhook: {window.location.origin}/api/webhooks/twilio/voice
            </p>
            {validationReport?.webhooks && (
              <Alert variant={validationReport.webhooks.statusCallbackAccessible ? "default" : "destructive"}>
                <AlertDescription>
                  {validationReport.webhooks.statusCallbackAccessible
                    ? "✓ Status callback URL reachable"
                    : (validationReport.webhooks.error || "Status callback URL not reachable")}
                </AlertDescription>
              </Alert>
            )}
            <Button type="button" variant="outline" size="sm" asChild>
              <a href="https://www.twilio.com/docs/voice" target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" /> Twilio Console configuration
              </a>
            </Button>
          </div>
        )}

        {/* Step 6: Review & Save */}
        {step === 6 && (
          <div className="space-y-4">
            {validationReport && (
              <ValidationSummary
                sections={validationReportToSections(validationReport)}
                onCopyDiagnostics={() =>
                  JSON.stringify(validationReport, null, 2)
                }
              />
            )}
            <div className="rounded-md border p-3 text-sm space-y-1">
              <p><strong>Account:</strong> {form.accountName} ({form.fromNumber})</p>
              <p><strong>Call mode:</strong> {form.callMode}</p>
              {form.callMode === "ai-powered" && <p><strong>ElevenLabs:</strong> {form.elevenLabsAgentId || "Custom prompt"}</p>}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={exportConfig}>
                Export config as JSON
              </Button>
              <Button type="button" variant="outline" onClick={() => toast({ title: "Test Call", description: "Use the call feature from a conversation to place a test call." })}>
                <TestTube className="h-4 w-4 mr-2" /> Test Call
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="flex justify-between mt-4">
          <div className="flex gap-2">
            {step > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep((s) => (s === 5 && form.callMode === "basic" ? 3 : s === 5 && form.callMode === "ai-powered" ? 4 : s - 1))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step < 6 ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={validating}
              >
                {validating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button type="button" onClick={handleSave} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save configuration
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
