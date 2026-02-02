"use client";

import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Download, Upload, Loader2, FileJson } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MASKED_VALUES = ["[REDACTED]", "****", ""];
function isMasked(val: string | undefined): boolean {
  if (val === undefined || val === null) return true;
  const s = String(val).trim();
  if (MASKED_VALUES.includes(s)) return true;
  if (/^\*+$/.test(s)) return true;
  if (s.length > 0 && s.length < 20 && s.includes("*")) return true;
  return false;
}

interface TwilioVoiceConfigManagerProps {
  connectionId?: number;
  onExport?: () => void;
  onImportComplete?: () => void;
  showBulkExport?: boolean;
}

export function TwilioVoiceConfigManager({
  connectionId,
  onExport,
  onImportComplete,
  showBulkExport = false
}: TwilioVoiceConfigManagerProps) {
  const { toast } = useToast();
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [secrets, setSecrets] = useState<Record<string, string>>({
    accountSid: "",
    authToken: "",
    apiKey: "",
    apiSecret: "",
    elevenLabsApiKey: "",
    fromNumber: ""
  });
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!connectionId) {
      toast({ title: "No connection", description: "Select a connection to export.", variant: "destructive" });
      return;
    }
    setExporting(true);
    try {
      const res = await fetch(`/api/channel-connections/${connectionId}/export`, { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `twilio-voice-${connectionId}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exported", description: "Configuration saved as JSON." });
      onExport?.();
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const config = importPreview?.configuration ?? {};
  const maskedFields = useMemo(() => {
    const fields: string[] = [];
    if (isMasked(config.accountSid)) fields.push("accountSid");
    if (isMasked(config.authToken)) fields.push("authToken");
    if (isMasked(config.apiKey)) fields.push("apiKey");
    if (isMasked(config.apiSecret)) fields.push("apiSecret");
    if (isMasked(config.elevenLabsApiKey)) fields.push("elevenLabsApiKey");
    return fields;
  }, [config.accountSid, config.authToken, config.apiKey, config.apiSecret, config.elevenLabsApiKey]);

  const requiredForSubmit = useMemo(() => {
    const required = ["accountSid", "authToken"];
    if (isMasked(config.fromNumber) || !config.fromNumber) required.push("fromNumber");
    if (config.callMode === "ai-powered" && isMasked(config.elevenLabsApiKey)) required.push("elevenLabsApiKey");
    return required;
  }, [config.fromNumber, config.callMode, config.elevenLabsApiKey]);

  const secretsComplete = useMemo(() => {
    for (const key of requiredForSubmit) {
      const val =
        key === "fromNumber"
          ? (isMasked(config.fromNumber) ? (secrets.fromNumber ?? "") : (config.fromNumber ?? ""))
          : (secrets[key] ?? "");
      if (!val || (key !== "fromNumber" && isMasked(config[key]) && !val)) return false;
    }
    return true;
  }, [requiredForSubmit, secrets, config]);

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".json")) {
      toast({ title: "Invalid file", description: "Please select a JSON file.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        setImportPreview(parsed);
        setImportFile(file);
        setSecrets({ accountSid: "", authToken: "", apiKey: "", apiSecret: "", elevenLabsApiKey: "", fromNumber: "" });
      } catch {
        toast({ title: "Invalid JSON", description: "Could not parse file.", variant: "destructive" });
      }
    };
    reader.readAsText(file);
  };

  const handleSecretChange = (key: string, value: string) => {
    setSecrets((prev) => ({ ...prev, [key]: value }));
  };

  const handleImportSubmit = async () => {
    if (!importPreview?.configuration) {
      toast({ title: "Invalid file", description: "Missing configuration.", variant: "destructive" });
      return;
    }
    if (!secretsComplete) {
      toast({ title: "Missing credentials", description: "Fill in all required masked fields (Account SID, Auth Token, and others as shown).", variant: "destructive" });
      return;
    }
    const mergedConfig = { ...config };
    const secretKeys = ["accountSid", "authToken", "apiKey", "apiSecret", "elevenLabsApiKey", "fromNumber"] as const;
    for (const key of secretKeys) {
      if (secrets[key]?.trim()) mergedConfig[key] = secrets[key].trim();
    }
    const payload = { ...importPreview, configuration: mergedConfig };
    setImporting(true);
    try {
      const res = await fetch("/api/channel-connections/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include"
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || "Import failed");
      }
      toast({ title: "Imported", description: "Twilio Voice connection created." });
      setImportOpen(false);
      setImportFile(null);
      setImportPreview(null);
      setSecrets({ accountSid: "", authToken: "", apiKey: "", apiSecret: "", elevenLabsApiKey: "" });
      onImportComplete?.();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex gap-2">
      {connectionId && (
        <Button type="button" variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
          Export config
        </Button>
      )}
      <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
        <Upload className="h-4 w-4 mr-2" />
        Import config
      </Button>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Import Twilio Voice Config</DialogTitle>
            <DialogDescription>
              Upload a JSON config file. Masked credentials must be filled in before saving.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>JSON file</Label>
              <Input type="file" accept=".json" onChange={handleImportFileChange} />
            </div>
            {importPreview?.configuration && (
              <>
                <div className="rounded-md border p-2 text-xs space-y-1">
                  <p><strong>Connection type:</strong> {importPreview.connectionType}</p>
                  <p><strong>Account name:</strong> {importPreview.configuration?.accountName}</p>
                  <p><strong>From number:</strong> {isMasked(importPreview.configuration?.fromNumber) ? "(masked — fill below)" : importPreview.configuration?.fromNumber}</p>
                  <p className="text-muted-foreground">Provide real values for any masked credentials below. Import is blocked until required secrets are provided.</p>
                </div>
                {(maskedFields.length > 0 || requiredForSubmit.includes("fromNumber")) && (
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Masked credentials (fill with real values)</Label>
                    {(maskedFields.includes("accountSid") || requiredForSubmit.includes("accountSid")) && (
                      <div className="grid gap-1">
                        <Label className="text-xs">Account SID *</Label>
                        <Input
                          type="text"
                          placeholder="ACxxxxxxxx..."
                          value={secrets.accountSid}
                          onChange={(e) => handleSecretChange("accountSid", e.target.value)}
                          className="font-mono text-sm"
                        />
                      </div>
                    )}
                    {(maskedFields.includes("authToken") || requiredForSubmit.includes("authToken")) && (
                      <div className="grid gap-1">
                        <Label className="text-xs">Auth Token *</Label>
                        <Input
                          type="password"
                          placeholder="Your Twilio Auth Token"
                          value={secrets.authToken}
                          onChange={(e) => handleSecretChange("authToken", e.target.value)}
                          className="font-mono text-sm"
                        />
                      </div>
                    )}
                    {requiredForSubmit.includes("fromNumber") && (
                      <div className="grid gap-1">
                        <Label className="text-xs">From Number (E.164) *</Label>
                        <Input
                          type="text"
                          placeholder="+15551234567"
                          value={secrets.fromNumber}
                          onChange={(e) => handleSecretChange("fromNumber", e.target.value)}
                          className="font-mono text-sm"
                        />
                      </div>
                    )}
                    {maskedFields.includes("apiKey") && (
                      <div className="grid gap-1">
                        <Label className="text-xs">API Key (SID)</Label>
                        <Input
                          type="text"
                          placeholder="SKxxxxxxxx..."
                          value={secrets.apiKey}
                          onChange={(e) => handleSecretChange("apiKey", e.target.value)}
                          className="font-mono text-sm"
                        />
                      </div>
                    )}
                    {maskedFields.includes("apiSecret") && (
                      <div className="grid gap-1">
                        <Label className="text-xs">API Secret</Label>
                        <Input
                          type="password"
                          placeholder="API Key secret"
                          value={secrets.apiSecret}
                          onChange={(e) => handleSecretChange("apiSecret", e.target.value)}
                          className="font-mono text-sm"
                        />
                      </div>
                    )}
                    {maskedFields.includes("elevenLabsApiKey") && (
                      <div className="grid gap-1">
                        <Label className="text-xs">ElevenLabs API Key {requiredForSubmit.includes("elevenLabsApiKey") ? "*" : ""}</Label>
                        <Input
                          type="password"
                          placeholder="ElevenLabs API key"
                          value={secrets.elevenLabsApiKey}
                          onChange={(e) => handleSecretChange("elevenLabsApiKey", e.target.value)}
                          className="font-mono text-sm"
                        />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleImportSubmit} disabled={!importPreview?.configuration || !secretsComplete || importing}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileJson className="h-4 w-4 mr-2" />}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
