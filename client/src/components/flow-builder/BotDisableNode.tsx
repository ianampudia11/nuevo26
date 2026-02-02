import { useState, useCallback, useEffect } from 'react';
import { Handle, Position } from 'reactflow';
import { useReactFlow } from 'reactflow';
import { useQuery } from '@tanstack/react-query';
import { Trash2, Copy, Pause, Loader2, Users, Eye, EyeOff } from 'lucide-react';
import { useFlowContext } from '../../pages/flow-builder';
import { apiRequest } from '@/lib/queryClient';
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
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { standardHandleStyle } from './StyledHandle';

interface Agent {
  id: number;
  fullName: string;
  email: string;
  avatarUrl?: string;
  role: string;
  username: string;
}



interface BotDisableNodeProps {
  id: string;
  data: {
    label: string;
    disableDuration?: string;
    customDuration?: number;
    customDurationUnit?: string;
    triggerMethod?: string;
    keyword?: string;
    caseSensitive?: boolean;
    assignToAgent?: string;
    notifyAgent?: boolean;
    handoffMessage?: string;
  };
  isConnectable: boolean;
}

export function BotDisableNode({ id, data, isConnectable }: BotDisableNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [disableDuration, setDisableDuration] = useState(data.disableDuration || '30');
  const [customDuration, setCustomDuration] = useState(data.customDuration || 60);
  const [customDurationUnit, setCustomDurationUnit] = useState(data.customDurationUnit || 'minutes');
  const [triggerMethod, setTriggerMethod] = useState(data.triggerMethod || 'always');
  const [keyword, setKeyword] = useState(data.keyword || 'agent');
  const [caseSensitive, setCaseSensitive] = useState(data.caseSensitive || false);
  const [assignToAgent, setAssignToAgent] = useState(data.assignToAgent || '');
  const [notifyAgent, setNotifyAgent] = useState(data.notifyAgent !== undefined ? data.notifyAgent : true);
  const [handoffMessage, setHandoffMessage] = useState(data.handoffMessage || t('flow_builder.bot_disable_default_handoff_message', 'A customer is requesting human assistance.'));

  const DURATION_OPTIONS = [
    { value: '5', label: t('flow_builder.bot_disable_5_minutes', '5 minutes') },
    { value: '15', label: t('flow_builder.bot_disable_15_minutes', '15 minutes') },
    { value: '30', label: t('flow_builder.bot_disable_30_minutes', '30 minutes') },
    { value: '60', label: t('flow_builder.bot_disable_1_hour', '1 hour') },
    { value: '120', label: t('flow_builder.bot_disable_2_hours', '2 hours') },
    { value: '240', label: t('flow_builder.bot_disable_4_hours', '4 hours') },
    { value: '480', label: t('flow_builder.bot_disable_8_hours', '8 hours') },
    { value: '1440', label: t('flow_builder.bot_disable_24_hours', '24 hours') },
    { value: 'manual', label: t('flow_builder.bot_disable_manual', 'Until manually re-enabled') },
    { value: 'custom', label: t('flow_builder.bot_disable_custom', 'Custom duration') }
  ];

  const { setNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode } = useFlowContext();

  const { data: agents = [], isLoading: isLoadingAgents, error: agentsError } = useQuery<Agent[]>({
    queryKey: ['/api/agents'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/agents');
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch agents: ${response.status} ${errorText}`);
      }
      return response.json();
    },
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const availableAgents = [
    { id: 'auto', name: t('flow_builder.bot_disable_auto_assign', 'Auto-assign to available agent') },
    ...agents.map(agent => ({
      id: agent.id.toString(),
      name: `${agent.fullName} (${agent.role})`
    }))
  ];

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
      disableDuration,
      customDuration,
      customDurationUnit,
      triggerMethod,
      keyword,
      caseSensitive,
      assignToAgent,
      notifyAgent,
      handoffMessage
    });
  }, [
    updateNodeData,
    disableDuration,
    customDuration,
    customDurationUnit,
    triggerMethod,
    keyword,
    caseSensitive,
    assignToAgent,
    notifyAgent,
    handoffMessage
  ]);

  const getDurationDisplay = () => {
    if (disableDuration === 'manual') {
      return 'Until manually re-enabled';
    } else if (disableDuration === 'custom') {
      return `${customDuration} ${customDurationUnit}`;
    } else {
      const option = DURATION_OPTIONS.find(opt => opt.value === disableDuration);
      return option?.label || '30 minutes';
    }
  };

  const getTriggerDisplay = () => {
    if (triggerMethod === 'keyword') {
      return `When "${keyword}" detected`;
    }
    return 'Always when executed';
  };

  return (
    <div className="node-bot-disable p-3 rounded-lg bg-card border border-border shadow-sm max-w-[320px] group">
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
              <p className="text-xs">{t('flow_builder.bot_disable_duplicate_node', 'Duplicate node')}</p>
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
              <p className="text-xs">{t('flow_builder.bot_disable_delete_node', 'Delete node')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="font-medium flex items-center gap-2 mb-2">
        <img 
          src="https://cdn-icons-png.flaticon.com/128/8898/8898827.png" 
          alt="Agent Handoff" 
          className="h-4 w-4"
        />
        <span>{t('flow_builder.bot_disable_node_title', 'Agent Handoff')}</span>
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
          <Pause className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium text-primary">{t('flow_builder.bot_disable_disable_bot', 'Disable Bot')}</span>
          <span className="text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground truncate">
            {getDurationDisplay()}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap gap-1">
          <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded">
            {getTriggerDisplay()}
          </span>
          {assignToAgent && (
            <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded">
              {availableAgents.find(a => a.id === assignToAgent)?.name.split(' ')[0] || 'Agent'}
            </span>
          )}
          {notifyAgent && (
            <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded">
              Notify Agent
            </span>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="mt-3 text-xs space-y-3 border rounded p-2 ">
          <div>
            <Label className="block mb-2 font-medium">Trigger Method</Label>
            <RadioGroup
              value={triggerMethod}
              onValueChange={setTriggerMethod}
              className="space-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="always" id="always" />
                <Label htmlFor="always" className="text-xs">Always disable when this node executes</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="keyword" id="keyword" />
                <Label htmlFor="keyword" className="text-xs">Disable only when specific keyword is detected</Label>
              </div>
            </RadioGroup>
          </div>

          {triggerMethod === 'keyword' && (
            <div className="space-y-2 pt-2 border-t">
              <div>
                <Label className="block mb-1 text-xs">Trigger Keyword</Label>
                <Input
                  placeholder="e.g., agent, human, help"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="text-xs h-7"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="case-sensitive"
                  checked={caseSensitive}
                  onCheckedChange={setCaseSensitive}
                />
                <Label htmlFor="case-sensitive" className="text-xs">Case sensitive matching</Label>
              </div>
            </div>
          )}

          <div className="space-y-2 pt-2 border-t">
            <Label className="block mb-1 font-medium">Disable Duration</Label>
            <Select
              value={disableDuration}
              onValueChange={setDisableDuration}
            >
              <SelectTrigger className="text-xs h-7">
                <SelectValue placeholder="Select duration..." />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {disableDuration === 'custom' && (
              <div className="flex gap-2">
                <NumberInput
                  value={customDuration}
                  onChange={setCustomDuration}
                  fallbackValue={1}
                  min={1}
                  className="text-xs h-7 flex-1"
                />
                <Select
                  value={customDurationUnit}
                  onValueChange={setCustomDurationUnit}
                >
                  <SelectTrigger className="text-xs h-7 w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">min</SelectItem>
                    <SelectItem value="hours">hrs</SelectItem>
                    <SelectItem value="days">days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2 border-t">
            <Label className="block mb-1 font-medium">Agent Assignment</Label>
            <Select
              value={assignToAgent}
              onValueChange={setAssignToAgent}
              disabled={isLoadingAgents}
            >
              <SelectTrigger className="text-xs h-7">
                <SelectValue placeholder={isLoadingAgents ? "Loading agents..." : "Select agent..."} />
              </SelectTrigger>
              <SelectContent>
                {isLoadingAgents ? (
                  <SelectItem value="loading" disabled>
                    <div className="flex items-center">
                      <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                      Loading agents...
                    </div>
                  </SelectItem>
                ) : agentsError ? (
                  <SelectItem value="error" disabled>
                    <div className="flex items-center">
                      <Users className="h-3 w-3 mr-2" />
                      Error loading agents
                    </div>
                  </SelectItem>
                ) : availableAgents.length === 0 ? (
                  <SelectItem value="empty" disabled>
                    <div className="flex items-center">
                      <Users className="h-3 w-3 mr-2" />
                      No agents available
                    </div>
                  </SelectItem>
                ) : (
                  availableAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center space-x-2">
              <Switch
                id="notify-agent"
                checked={notifyAgent}
                onCheckedChange={setNotifyAgent}
              />
              <Label htmlFor="notify-agent" className="text-xs font-medium">Notify assigned agent</Label>
            </div>

            {notifyAgent && (
              <div>
                <Label className="block mb-1 text-xs">Handoff Message</Label>
                <Input
                  placeholder="Message to send to agent"
                  value={handoffMessage}
                  onChange={(e) => setHandoffMessage(e.target.value)}
                  className="text-xs h-7"
                />
              </div>
            )}
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
