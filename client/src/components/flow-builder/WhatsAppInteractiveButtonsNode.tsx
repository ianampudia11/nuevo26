import React, { useState, useCallback, useEffect } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  MessageSquare,
  Plus,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  AlertCircle
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

interface WhatsAppButton {
  id: string;
  title: string;
  payload: string;
}

interface WhatsAppInteractiveButtonsNodeData {
  label: string;
  headerText?: string;
  bodyText: string;
  footerText?: string;
  buttons: WhatsAppButton[];
}

interface WhatsAppInteractiveButtonsNodeProps {
  id: string;
  data: WhatsAppInteractiveButtonsNodeData;
  isConnectable: boolean;
}

const WhatsAppInteractiveButtonsNode: React.FC<WhatsAppInteractiveButtonsNodeProps> = ({
  id,
  data,
  isConnectable
}) => {
  const { t } = useTranslation();
  const { setNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode } = useFlowContext();
  
  const [isEditing, setIsEditing] = useState(false);
  const [headerText, setHeaderText] = useState(data.headerText || '');
  const [bodyText, setBodyText] = useState(data.bodyText || t('whatsapp_interactive.default_body', 'Please select an option:'));
  const [footerText, setFooterText] = useState(data.footerText || '');
  const [buttons, setButtons] = useState<WhatsAppButton[]>(
    data.buttons || [
      { id: '1', title: t('whatsapp_interactive.default_button1', 'Option 1'), payload: 'option_1' },
      { id: '2', title: t('whatsapp_interactive.default_button2', 'Option 2'), payload: 'option_2' }
    ]
  );

  const updateNodeData = useCallback(() => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                headerText: headerText.trim() || undefined,
                bodyText: bodyText.trim(),
                footerText: footerText.trim() || undefined,
                buttons: buttons.filter(btn => btn.title.trim() && btn.payload.trim())
              }
            }
          : node
      )
    );
  }, [id, setNodes, headerText, bodyText, footerText, buttons]);

  const handleDoneClick = useCallback(() => {
    updateNodeData();
    setIsEditing(false);
  }, [updateNodeData]);

  const addButton = useCallback(() => {
    if (buttons.length < 3) {
      const newButton: WhatsAppButton = {
        id: Date.now().toString(),
        title: `${t('whatsapp_interactive.option', 'Option')} ${buttons.length + 1}`,
        payload: `option_${buttons.length + 1}`
      };
      setButtons([...buttons, newButton]);
    }
  }, [buttons, t]);

  const removeButton = useCallback((buttonId: string) => {
    if (buttons.length > 1) {
      setButtons(buttons.filter(btn => btn.id !== buttonId));
    }
  }, [buttons]);

  const updateButton = useCallback((buttonId: string, field: 'title' | 'payload', value: string) => {
    setButtons(buttons.map(btn => 
      btn.id === buttonId ? { ...btn, [field]: value } : btn
    ));
  }, [buttons]);

  const validateButton = (button: WhatsAppButton) => {
    const titleLength = button.title.trim().length;
    const payloadLength = button.payload.trim().length;
    
    return {
      titleValid: titleLength >= 1 && titleLength <= 20,
      payloadValid: payloadLength >= 1 && payloadLength <= 256,
      titleError: titleLength === 0 ? 'Title required' : titleLength > 20 ? 'Max 20 characters' : null,
      payloadError: payloadLength === 0 ? 'Payload required' : payloadLength > 256 ? 'Max 256 characters' : null
    };
  };

  const validateText = (text: string, maxLength: number, required: boolean = false) => {
    const length = text.trim().length;
    if (required && length === 0) return 'Required';
    if (length > maxLength) return `Max ${maxLength} characters`;
    return null;
  };

  const headerError = validateText(headerText, 60);
  const bodyError = validateText(bodyText, 1024, true);
  const footerError = validateText(footerText, 60);

  const hasErrors = headerError || bodyError || footerError || 
    buttons.some(btn => {
      const validation = validateButton(btn);
      return !validation.titleValid || !validation.payloadValid;
    });

  return (
    <div className="node-whatsapp-interactive-buttons p-3 rounded-lg bg-card border border-border shadow-sm min-w-[380px] max-w-[480px] group">
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
          <img src="https://cdn-icons-png.flaticon.com/128/1516/1516938.png" alt="WhatsApp Interactive Buttons" className="h-4 w-4" />
          <span className="text-sm">{t('whatsapp_interactive.node_title', 'WhatsApp Interactive Buttons')}</span>
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
          <span className="text-xs text-destructive">
            {t('whatsapp_interactive.validation_errors', 'Please fix validation errors')}
          </span>
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
              {buttons.map((button) => (
                <div
                  key={button.id}
                  className="border border-primary/20 rounded-md p-2 text-center text-sm bg-card hover:bg-primary/10 transition-colors relative"
                >
                  {button.title}
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={button.payload}
                    style={{
                      ...standardHandleStyle,
                      top: '50%',
                      right: '-9%'
                    }}
                    isConnectable={isConnectable}
                  />
                </div>
              ))}
            </div>
            {footerText && (
              <div className="text-xs text-muted-foreground mt-3">
                {footerText}
              </div>
            )}
          </div>
          
          <div className="text-xs text-muted-foreground">
            {t('whatsapp_interactive.button_count', `${buttons.length} button(s) configured`)}
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
              className={cn("text-xs", headerError && "border-destructive")}
              maxLength={60}
            />
            {headerError && (
              <p className="text-xs text-destructive">{headerError}</p>
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
              placeholder={t('whatsapp_interactive.body_placeholder', 'Enter your message text...')}
              className={cn("text-xs min-h-[60px]", bodyError && "border-destructive")}
              maxLength={1024}
            />
            {bodyError && (
              <p className="text-xs text-destructive">{bodyError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {bodyText.length}/1024 {t('common.characters', 'characters')}
            </p>
          </div>

          {/* Buttons Configuration */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">
                {t('whatsapp_interactive.buttons', 'Interactive Buttons')}
                <span className="text-destructive ml-1">*</span>
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addButton}
                disabled={buttons.length >= 3}
                className="h-6 px-2 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                {t('whatsapp_interactive.add_button', 'Add Button')}
              </Button>
            </div>

            <div className="space-y-3">
              {buttons.map((button, index) => {
                const validation = validateButton(button);
                return (
                  <div key={button.id} className="border rounded-lg p-3 bg-muted relative">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-foreground">
                        {t('whatsapp_interactive.button', 'Button')} {index + 1}
                      </span>
                      {buttons.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeButton(button.id)}
                          className="h-5 w-5 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs">
                          {t('whatsapp_interactive.button_title', 'Button Title')}
                          <span className="text-destructive ml-1">*</span>
                        </Label>
                        <Input
                          value={button.title}
                          onChange={(e) => updateButton(button.id, 'title', e.target.value)}
                          placeholder={t('whatsapp_interactive.title_placeholder', 'Button text...')}
                          className={cn("text-xs", !validation.titleValid && "border-destructive")}
                          maxLength={20}
                        />
                        {validation.titleError && (
                          <p className="text-xs text-destructive">{validation.titleError}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {button.title.length}/20 {t('common.characters', 'characters')}
                        </p>
                      </div>

                      <div>
                        <Label className="text-xs">
                          {t('whatsapp_interactive.button_payload', 'Button Payload')}
                          <span className="text-destructive ml-1">*</span>
                        </Label>
                        <Input
                          value={button.payload}
                          onChange={(e) => updateButton(button.id, 'payload', e.target.value)}
                          placeholder={t('whatsapp_interactive.payload_placeholder', 'button_value')}
                          className={cn("text-xs", !validation.payloadValid && "border-destructive")}
                          maxLength={256}
                        />
                        {validation.payloadError && (
                          <p className="text-xs text-destructive">{validation.payloadError}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {button.payload.length}/256 {t('common.characters', 'characters')}
                        </p>
                      </div>
                    </div>

                    {/* Source handle for this button */}
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={button.payload}
                      style={{
                        ...standardHandleStyle,
                        top: '50%',
                        right: '-12px'
                      }}
                      isConnectable={isConnectable}
                    />
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground">
              {t('whatsapp_interactive.button_limit', 'Maximum 3 buttons allowed by WhatsApp API')}
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
              className={cn("text-xs", footerError && "border-destructive")}
              maxLength={60}
            />
            {footerError && (
              <p className="text-xs text-destructive">{footerError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {footerText.length}/60 {t('common.characters', 'characters')}
            </p>
          </div>

          {/* API Info */}
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-primary mt-0.5" />
              <div className="text-xs text-primary">
                <p className="font-medium mb-1">
                  {t('whatsapp_interactive.api_info_title', 'WhatsApp Business API Requirements')}
                </p>
                <ul className="space-y-1 text-xs">
                  <li>• {t('whatsapp_interactive.api_info_1', 'Only works with Official WhatsApp Business API connections')}</li>
                  <li>• {t('whatsapp_interactive.api_info_2', 'Maximum 3 interactive buttons per message')}</li>
                  <li>• {t('whatsapp_interactive.api_info_3', 'Button titles: 1-20 characters each')}</li>
                  <li>• {t('whatsapp_interactive.api_info_4', 'Users can tap buttons to respond')}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Target Handle */}
      <Handle
        type="target"
        position={Position.Left}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
    </div>
  );
};

export default WhatsAppInteractiveButtonsNode;
