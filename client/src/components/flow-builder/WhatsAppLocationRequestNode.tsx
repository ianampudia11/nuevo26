import React, { useState, useCallback, useEffect } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { useTranslation } from '@/hooks/use-translation';
import { useFlowContext } from '../../pages/flow-builder';
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
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { standardHandleStyle } from '@/components/flow-builder/StyledHandle';

interface WhatsAppLocationRequestNodeData {
  label?: string;
  bodyText: string;
}

interface WhatsAppLocationRequestNodeProps {
  id: string;
  data: WhatsAppLocationRequestNodeData;
  isConnectable: boolean;
}

const WhatsAppLocationRequestNode: React.FC<WhatsAppLocationRequestNodeProps> = ({ id, data, isConnectable }) => {
  const { t } = useTranslation();
  const { onDeleteNode, onDuplicateNode } = useFlowContext();
  const { setNodes } = useReactFlow();
  
  const [isEditing, setIsEditing] = useState(false);
  const [bodyText, setBodyText] = useState(data.bodyText || 'Please share your location so we can assist you better.');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateNodeData = useCallback(() => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                bodyText
              }
            }
          : node
      )
    );
  }, [id, setNodes, bodyText]);

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

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [bodyText]);

  useEffect(() => {
    validateData();
  }, [validateData]);

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className={cn(
      "node-whatsapp-location-request p-3 rounded-lg bg-card border border-border shadow-sm min-w-[400px] max-w-[500px] group",
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
          <img src="https://cdn-icons-png.flaticon.com/128/535/535137.png" alt="WhatsApp Location Request" className="h-4 w-4" />
          <span className="text-sm">{t('whatsapp_location_request.node_title', 'WhatsApp Location Request')}</span>
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
            <div className="text-sm text-foreground mb-3">
              {bodyText}
            </div>
            <div className="space-y-2">
              <div className="border border-primary/20 rounded-md p-2 text-center text-sm bg-card hover:bg-primary/10 transition-colors relative flex items-center justify-center gap-2">
                <img src="https://cdn-icons-png.flaticon.com/128/535/535137.png" alt="Location" className="h-4 w-4" />
                {t('whatsapp_location_request.send_location_button', 'Send Location')}
              </div>
            </div>
          </div>
          
          <div className="text-xs text-muted-foreground">
            {t('whatsapp_location_request.awaits_location', 'Awaits user location response')}
          </div>
        </div>
      )}

      {/* Edit Mode */}
      {isEditing && (
        <div className="space-y-4">
          {/* Body Text */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">
              {t('whatsapp_interactive.body_text', 'Body Text')}
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder={t('whatsapp_location_request.body_placeholder', 'Enter your message text...')}
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

          {/* API Info */}
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-primary mt-0.5" />
              <div className="text-xs text-primary">
                <p className="font-medium mb-1">{t('whatsapp_location_request.api_info_title', 'Location Request Message')}</p>
                <p>{t('whatsapp_location_request.api_info_description', 'This message displays body text and a "Send Location" button. When tapped, users can share their location. The flow will continue after receiving the location response.')}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsAppLocationRequestNode;
