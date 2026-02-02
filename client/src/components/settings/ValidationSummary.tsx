"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, AlertTriangle, X, ChevronDown, ChevronUp, Copy, Share2 } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";

export interface ValidationSection {
  key: string;
  label: string;
  status: "valid" | "warning" | "error";
  responseTime?: number;
  message?: string;
  recommendedActions?: string[];
}

export interface ValidationSummaryProps {
  sections: ValidationSection[];
  onCopyDiagnostics?: () => string;
  onShareWithSupport?: (report: string) => void;
  className?: string;
}

const statusConfig = {
  valid: { icon: Check, color: "text-green-600", bg: "bg-green-500/10", label: "Valid" },
  warning: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-500/10", label: "Warning" },
  error: { icon: X, color: "text-destructive", bg: "bg-destructive/10", label: "Error" }
};

export function ValidationSummary({
  sections,
  onCopyDiagnostics,
  onShareWithSupport,
  className = ""
}: ValidationSummaryProps) {
  const { toast } = useToast();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const fullReport = sections
    .map(
      (s) =>
        `[${s.label}] ${statusConfig[s.status].label}${s.responseTime != null ? ` (${s.responseTime}ms)` : ""}${s.message ? `: ${s.message}` : ""}${s.recommendedActions?.length ? `\n  Actions: ${s.recommendedActions.join("; ")}` : ""}`
    )
    .join("\n");

  const handleCopy = () => {
    const text = onCopyDiagnostics ? onCopyDiagnostics() : fullReport;
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Diagnostics copied to clipboard" });
  };

  const handleShare = () => {
    const report = onCopyDiagnostics ? onCopyDiagnostics() : fullReport;
    if (onShareWithSupport) {
      onShareWithSupport(report);
    } else {
      const subject = encodeURIComponent("Twilio Voice diagnostics");
      const body = encodeURIComponent(`Please find the diagnostics report below:\n\n${report}`);
      window.open(`mailto:support@example.com?subject=${subject}&body=${body}`, "_blank");
    }
    toast({ title: "Share", description: "Opening support ticket option" });
  };

  return (
    <div className={`rounded-md border bg-muted/30 ${className}`}>
      <div className="p-3 flex items-center justify-between gap-2 border-b">
        <span className="text-sm font-medium">Validation summary</span>
        <div className="flex gap-2">
          {onCopyDiagnostics && (
            <Button type="button" variant="ghost" size="sm" onClick={handleCopy}>
              <Copy className="h-4 w-4 mr-1" />
              Copy diagnostics
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={handleShare}>
            <Share2 className="h-4 w-4 mr-1" />
            Share with support
          </Button>
        </div>
      </div>
      <div className="divide-y">
        {sections.map((section) => {
          const config = statusConfig[section.status];
          const Icon = config.icon;
          const isOpen = openSections[section.key] ?? false;
          return (
            <Collapsible
              key={section.key}
              open={isOpen}
              onOpenChange={(open) => setOpenSections((prev) => ({ ...prev, [section.key]: open }))}
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                >
                  <span className={`shrink-0 ${config.color}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1 text-sm font-medium">{section.label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${config.bg} ${config.color}`}>
                    {config.label}
                  </span>
                  {section.responseTime != null && (
                    <span className="text-xs text-muted-foreground">{section.responseTime}ms</span>
                  )}
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-3 pb-3 pt-0 pl-10 text-sm text-muted-foreground space-y-1">
                  {section.message && <p>{section.message}</p>}
                  {section.recommendedActions && section.recommendedActions.length > 0 && (
                    <div>
                      <p className="font-medium text-foreground">Recommended actions:</p>
                      <ul className="list-disc list-inside mt-1">
                        {section.recommendedActions.map((action, i) => (
                          <li key={i}>{action}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
