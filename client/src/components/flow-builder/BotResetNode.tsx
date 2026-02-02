import { useState, useCallback, useEffect } from 'react';
import { Handle, Position } from 'reactflow';
import { useReactFlow } from 'reactflow';
import { Trash2, Copy, RefreshCw, RotateCcw, Settings, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useFlowContext } from '../../pages/flow-builder';
import { useTranslation } from '@/hooks/use-translation';

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { standardHandleStyle } from './StyledHandle';



interface BotResetNodeProps {
  id: string;
  data: {
    label: string;
    resetScope?: string;
    confirmationMessage?: string;
    sendConfirmation?: boolean;
    clearVariables?: boolean;
    resetFlowPosition?: boolean;
    notifyAgent?: boolean;
    autoReassign?: boolean;
  };
  isConnectable: boolean;
}

export function BotResetNode({ id, data, isConnectable }: BotResetNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [resetScope, setResetScope] = useState(data.resetScope || 'bot_only');
  const [confirmationMessage, setConfirmationMessage] = useState(data.confirmationMessage || t('flow_builder.bot_reset_default_confirmation', 'Bot assistance has been re-enabled. How can I help you?'));

  const RESET_SCOPE_OPTIONS = [
    {
      value: 'bot_only',
      label: t('flow_builder.bot_reset_bot_only', 'Re-enable bot responses only'),
      description: t('flow_builder.bot_reset_bot_only_description', 'Only remove bot disable flag, keep all context and history')
    },
    {
      value: 'bot_and_context',
      label: t('flow_builder.bot_reset_bot_and_context', 'Reset bot + clear conversation context'),
      description: t('flow_builder.bot_reset_bot_and_context_description', 'Re-enable bot and clear flow variables/context')
    },
    {
      value: 'full_reset',
      label: t('flow_builder.bot_reset_full_reset', 'Full reset (bot + context + history)'),
      description: t('flow_builder.bot_reset_full_reset_description', 'Complete reset including conversation history')
    }
  ];
  const [sendConfirmation, setSendConfirmation] = useState(data.sendConfirmation !== undefined ? data.sendConfirmation : true);
  const [clearVariables, setClearVariables] = useState(data.clearVariables !== undefined ? data.clearVariables : false);
  const [resetFlowPosition, setResetFlowPosition] = useState(data.resetFlowPosition !== undefined ? data.resetFlowPosition : false);
  const [notifyAgent, setNotifyAgent] = useState(data.notifyAgent !== undefined ? data.notifyAgent : true);
  const [autoReassign, setAutoReassign] = useState(data.autoReassign !== undefined ? data.autoReassign : false);

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
      resetScope,
      confirmationMessage,
      sendConfirmation,
      clearVariables,
      resetFlowPosition,
      notifyAgent,
      autoReassign
    });
  }, [
    updateNodeData,
    resetScope,
    confirmationMessage,
    sendConfirmation,
    clearVariables,
    resetFlowPosition,
    notifyAgent,
    autoReassign
  ]);

  const getResetScopeDisplay = () => {
    const option = RESET_SCOPE_OPTIONS.find(opt => opt.value === resetScope);
    return option?.label || 'Re-enable bot only';
  };

  const getResetScopeIcon = () => {
    switch (resetScope) {
      case 'bot_only':
        return <CheckCircle className="h-3.5 w-3.5 text-green-600" />;
      case 'bot_and_context':
        return <RotateCcw className="h-3.5 w-3.5 text-blue-600" />;
      case 'full_reset':
        return <AlertCircle className="h-3.5 w-3.5 text-red-600" />;
      default:
        return <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <div className="node-bot-reset p-3 rounded-lg bg-white border border-green-200 shadow-sm max-w-[320px] group">
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
              <p className="text-xs">Duplicate node</p>
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
              <p className="text-xs">Delete node</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="font-medium flex items-center gap-2 mb-2">
        <RefreshCw className="h-4 w-4 text-green-600" />
        <span>Reset Bot</span>
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

      <div className="text-sm p-2  rounded border border-border">
        <div className="flex items-center gap-1 mb-1">
          {getResetScopeIcon()}
          <span className="font-medium text-green-600">Re-enable Bot</span>
          <span className="text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground truncate">
            {getResetScopeDisplay()}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap gap-1">
          {sendConfirmation && (
            <span className="text-[10px] bg-green-100 text-green-800 px-1 py-0.5 rounded">
              Send Confirmation
            </span>
          )}
          {clearVariables && (
            <span className="text-[10px] bg-blue-100 text-blue-800 px-1 py-0.5 rounded">
              Clear Variables
            </span>
          )}
          {resetFlowPosition && (
            <span className="text-[10px] bg-purple-100 text-purple-800 px-1 py-0.5 rounded">
              Reset Flow
            </span>
          )}
          {notifyAgent && (
            <span className="text-[10px] bg-orange-100 text-orange-800 px-1 py-0.5 rounded">
              Notify Agent
            </span>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="mt-3 text-xs space-y-3 border rounded p-2 ">
          <div>
            <Label className="block mb-2 font-medium">Reset Scope</Label>
            <Select
              value={resetScope}
              onValueChange={setResetScope}
            >
              <SelectTrigger className="text-xs h-7">
                <SelectValue placeholder="Select reset scope..." />
              </SelectTrigger>
              <SelectContent>
                {RESET_SCOPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div>
                      <div className="font-medium">{option.label}</div>
                      <div className="text-xs text-muted-foreground">{option.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {resetScope !== 'bot_only' && (
            <div className="space-y-2 pt-2 border-t">
              <Label className="block mb-1 font-medium">Advanced Options</Label>

              <div className="flex items-center space-x-2">
                <Switch
                  id="clear-variables"
                  checked={clearVariables}
                  onCheckedChange={setClearVariables}
                />
                <Label htmlFor="clear-variables" className="text-xs">Clear all flow variables</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="reset-flow-position"
                  checked={resetFlowPosition}
                  onCheckedChange={setResetFlowPosition}
                />
                <Label htmlFor="reset-flow-position" className="text-xs">Reset flow to beginning</Label>
              </div>
            </div>
          )}

          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center space-x-2">
              <Switch
                id="send-confirmation"
                checked={sendConfirmation}
                onCheckedChange={setSendConfirmation}
              />
              <Label htmlFor="send-confirmation" className="text-xs font-medium">Send confirmation message</Label>
            </div>

            {sendConfirmation && (
              <div>
                <Label className="block mb-1 text-xs">Confirmation Message</Label>
                <Textarea
                  placeholder="Message to send when bot is re-enabled"
                  value={confirmationMessage}
                  onChange={(e) => setConfirmationMessage(e.target.value)}
                  className="text-xs min-h-[60px] resize-none"
                />
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2 border-t">
            <Label className="block mb-1 font-medium">Agent Notification</Label>

            <div className="flex items-center space-x-2">
              <Switch
                id="notify-agent"
                checked={notifyAgent}
                onCheckedChange={setNotifyAgent}
              />
              <Label htmlFor="notify-agent" className="text-xs">Notify agent of bot re-enablement</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="auto-reassign"
                checked={autoReassign}
                onCheckedChange={setAutoReassign}
              />
              <Label htmlFor="auto-reassign" className="text-xs">Auto-reassign conversation to bot</Label>
            </div>
          </div>
        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
    </div>
  );
}
