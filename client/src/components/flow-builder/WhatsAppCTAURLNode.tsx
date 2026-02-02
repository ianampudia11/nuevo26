import React, { useState, useCallback, useEffect } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Copy,
  Eye,
  EyeOff,
  AlertCircle,
  Trash2
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { useTranslation } from '@/hooks/use-translation';
import { useFlowContext } from '../../pages/flow-builder';
import { standardHandleStyle } from '@/components/flow-builder/StyledHandle';
import { cn } from '@/lib/utils';

interface WhatsAppCTAURLNodeData {
  label: string;
  headerText?: string;
  bodyText: string;
  footerText?: string;
  displayText: string;
  url: string;
}

interface WhatsAppCTAURLNodeProps {
  id: string;
  data: WhatsAppCTAURLNodeData;
  isConnectable: boolean;
}

const WhatsAppCTAURLNode: React.FC<WhatsAppCTAURLNodeProps> = ({ id, data, isConnectable }) => {
  const { t } = useTranslation();
  const { onDeleteNode, onDuplicateNode } = useFlowContext();
  const { setNodes } = useReactFlow();

  const [isEditing, setIsEditing] = useState(false);
  const [headerText, setHeaderText] = useState(data.headerText || '');
  const [bodyText, setBodyText] = useState(data.bodyText || 'Click the button below to visit our website.');
  const [footerText, setFooterText] = useState(data.footerText || '');
  const [displayText, setDisplayText] = useState(data.displayText || 'Visit Website');
  const [url, setUrl] = useState(data.url || 'https://example.com');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateNodeData = useCallback(() => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                headerText,
                bodyText,
                footerText,
                displayText,
                url
              }
            }
          : node
      )
    );
  }, [id, setNodes, headerText, bodyText, footerText, displayText, url]);

  const handleDoneClick = useCallback(() => {
    updateNodeData();
    setIsEditing(false);
  }, [updateNodeData]);

  const validateData = useCallback(() => {
    const newErrors: Record<string, string> = {};


    if (!bodyText?.trim()) {
      newErrors.bodyText = 'Body text is required';
    } else if (bodyText.length > 1024) {
      newErrors.bodyText = 'Body text must be 1024 characters or less';
    }


    if (!displayText?.trim()) {
      newErrors.displayText = 'Button text is required';
    } else if (new Blob([displayText]).size > 20) {
      newErrors.displayText = 'Button text must be 20 bytes or less';
    }


    if (!url?.trim()) {
      newErrors.url = 'URL is required';
    } else {
      try {
        new URL(url);
      } catch {
        newErrors.url = 'Please enter a valid URL';
      }
    }


    if (headerText && headerText.length > 60) {
      newErrors.headerText = 'Header text must be 60 characters or less';
    }


    if (footerText && footerText.length > 60) {
      newErrors.footerText = 'Footer text must be 60 characters or less';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [bodyText, displayText, url, headerText, footerText]);

  useEffect(() => {
    validateData();
  }, [validateData]);

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className={cn(
      "node-whatsapp-cta-url p-3 rounded-lg bg-card border border-border shadow-sm min-w-[400px] max-w-[500px] group",
      hasErrors ? "border-destructive" : ""
    )}>
      {/* Input Handles */}
      <Handle
        type="target"
        position={Position.Left}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />

      {/* Node Toolbar */}
      <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
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
      </div>

      {/* Node Header */}
      <div className="font-medium flex items-center gap-2 mb-3">
        <div className="flex items-center gap-2">
          <img src="https://cdn-icons-png.flaticon.com/128/3305/3305847.png" alt="WhatsApp CTA URL" className="h-4 w-4" />
          <span className="text-sm">{t('whatsapp_cta_url.node_title', 'WhatsApp CTA URL')}</span>
        </div>
        <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border border-primary/20">
          {t('whatsapp_interactive.official_api', 'Official API')}
        </Badge>
        <button
          className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          onClick={() => isEditing ? handleDoneClick() : setIsEditing(true)}
        >
          {isEditing ? (
            <>
              <EyeOff className="h-3 w-3" />
              {t('common.done', 'Done')}
            </>
          ) : (
            <>
              <Eye className="h-3 w-3" />
              {t('common.edit', 'Edit')}
            </>
          )}
        </button>
      </div>

      {/* Error Indicator */}
      {hasErrors && (
        <div className="flex items-center gap-2 mb-3 p-2 bg-destructive/10 border border-destructive/20 rounded-md">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">Please fix the errors below</span>
        </div>
      )}

      {/* Preview Mode */}
      {!isEditing && (
        <div className="space-y-3">
          {/* WhatsApp Message Preview */}
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
            {headerText && (
              <div className="font-medium text-sm text-foreground mb-2">
                {headerText}
              </div>
            )}
            <div className="text-sm text-foreground mb-3">
              {bodyText}
            </div>
            <div className="space-y-2">
              <div className="border border-primary/20 rounded-md p-2 text-center text-sm bg-card hover:bg-primary/10 transition-colors relative flex items-center justify-center gap-2">
                <img src="https://cdn-icons-png.flaticon.com/128/3305/3305847.png" alt="CTA" className="h-4 w-4" />
                {displayText}
              </div>
            </div>
            {footerText && (
              <div className="text-xs text-muted-foreground mt-3">
                {footerText}
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            {t('whatsapp_cta_url.url_configured', `URL: ${url}`)}
          </div>
        </div>
      )}

      {/* Edit Mode */}
      {isEditing && (
        <div className="space-y-4">
          {/* Header Text */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">
              {t('whatsapp_interactive.header_text', 'Header Text')}
              <span className="text-muted-foreground ml-1">({t('common.optional', 'Optional')})</span>
            </Label>
            <Input
              value={headerText}
              onChange={(e) => setHeaderText(e.target.value)}
              placeholder={t('whatsapp_interactive.header_placeholder', 'Optional header text...')}
              className={cn("text-xs", errors.headerText && "border-destructive")}
              maxLength={60}
            />
            {errors.headerText && (
              <p className="text-xs text-destructive">{errors.headerText}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {headerText.length}/60 {t('common.characters', 'characters')}
            </p>
          </div>

          {/* Body Text */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">
              {t('whatsapp_interactive.body_text', 'Body Text')}
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder={t('whatsapp_cta_url.body_placeholder', 'Enter your message text...')}
              className={cn("text-xs min-h-[60px]", errors.bodyText && "border-destructive")}
              maxLength={1024}
            />
            {errors.bodyText && (
              <p className="text-xs text-destructive">{errors.bodyText}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {bodyText.length}/1024 {t('common.characters', 'characters')}
            </p>
          </div>

          {/* Footer Text */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">
              {t('whatsapp_interactive.footer_text', 'Footer Text')}
              <span className="text-muted-foreground ml-1">({t('common.optional', 'Optional')})</span>
            </Label>
            <Input
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder={t('whatsapp_interactive.footer_placeholder', 'Optional footer text...')}
              className={cn("text-xs", errors.footerText && "border-destructive")}
              maxLength={60}
            />
            {errors.footerText && (
              <p className="text-xs text-destructive">{errors.footerText}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {footerText.length}/60 {t('common.characters', 'characters')}
            </p>
          </div>

          {/* Button Display Text */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">
              {t('whatsapp_cta_url.button_text', 'Button Text')}
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Input
              value={displayText}
              onChange={(e) => setDisplayText(e.target.value)}
              placeholder={t('whatsapp_cta_url.button_placeholder', 'Enter button text...')}
              className={cn("text-xs", errors.displayText && "border-destructive")}
            />
            {errors.displayText && (
              <p className="text-xs text-destructive">{errors.displayText}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {new Blob([displayText]).size}/20 bytes
            </p>
          </div>

          {/* URL */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">
              {t('whatsapp_cta_url.url', 'URL')}
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className={cn("text-xs", errors.url && "border-destructive")}
            />
            {errors.url && (
              <p className="text-xs text-destructive">{errors.url}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsAppCTAURLNode;
