import React, { useCallback, useEffect, useState, useMemo } from "react";
import {
  NodeProps,
  Handle,
  Position,
  useReactFlow
} from "reactflow";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Trash2,
  Copy,
  ArrowRightLeft,
  HelpCircle,
  AlertCircle,
  CheckCircle,
  Loader2,
  Variable,
  Phone,
  Layers,
  Target
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useFlowContext } from "@/pages/flow-builder";
import { PipelineStage, Pipeline } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { standardHandleStyle } from './StyledHandle';
import { apiRequest } from '@/lib/queryClient';

interface VariableOption {
  value: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: 'contact' | 'message' | 'system' | 'deal';
}

const AVAILABLE_VARIABLES: VariableOption[] = [
  {
    value: 'contact.phone',
    label: 'Contact Phone',
    description: 'Phone number of the contact',
    icon: <Phone className="w-4 h-4" />,
    category: 'contact'
  },
  {
    value: 'contact.name',
    label: 'Contact Name',
    description: 'Full name of the contact',
    icon: <Phone className="w-4 h-4" />,
    category: 'contact'
  },
  {
    value: 'pipeline.currentPipelineId',
    label: 'Current Pipeline ID',
    description: 'Current pipeline ID',
    icon: <Layers className="w-4 h-4" />,
    category: 'deal'
  }
];

interface VariablePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

function VariablePicker({ value, onChange, placeholder, className }: VariablePickerProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const filteredVariables = AVAILABLE_VARIABLES.filter(variable =>
    variable.label.toLowerCase().includes(searchValue.toLowerCase()) ||
    variable.value.toLowerCase().includes(searchValue.toLowerCase()) ||
    variable.description.toLowerCase().includes(searchValue.toLowerCase())
  );

  const groupedVariables = filteredVariables.reduce((acc, variable) => {
    if (!acc[variable.category]) {
      acc[variable.category] = [];
    }
    acc[variable.category].push(variable);
    return acc;
  }, {} as Record<string, VariableOption[]>);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setCursorPosition(e.target.selectionStart || 0);
  };

  const handleInputSelect = (e: React.SyntheticEvent<HTMLInputElement>) => {
    const target = e.target as HTMLInputElement;
    setCursorPosition(target.selectionStart || 0);
  };

  const insertVariable = (variableValue: string) => {
    const variableText = `{{${variableValue}}}`;
    const beforeCursor = value.substring(0, cursorPosition);
    const afterCursor = value.substring(cursorPosition);
    const newValue = beforeCursor + variableText + afterCursor;

    onChange(newValue);
    setOpen(false);

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const newCursorPosition = cursorPosition + variableText.length;
        inputRef.current.setSelectionRange(newCursorPosition, newCursorPosition);
      }
    }, 0);
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'contact': return 'Contact';
      case 'message': return 'Message';
      case 'system': return 'System';
      case 'deal': return 'Deal';
      default: return category;
    }
  };

  return (
    <div className="flex gap-2">
      <Input
        ref={inputRef}
        value={value}
        onChange={handleInputChange}
        onSelect={handleInputSelect}
        onKeyUp={handleInputSelect}
        onClick={handleInputSelect}
        placeholder={placeholder}
        className={cn("font-mono text-xs", className)}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 flex items-center gap-1"
          >
            <Variable className="w-3 h-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Search variables..."
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <CommandList>
              <CommandEmpty>No variables found.</CommandEmpty>

              {Object.entries(groupedVariables).map(([category, variables]) => (
                <CommandGroup
                  key={category}
                  heading={getCategoryLabel(category)}
                >
                  {variables.map((variable) => (
                    <CommandItem
                      key={variable.value}
                      value={variable.value}
                      onSelect={() => insertVariable(variable.value)}
                      className="flex items-center gap-3 p-3"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        {variable.icon}
                        <div className="flex-1">
                          <div className="font-medium text-xs">{variable.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {variable.description}
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {`{{${variable.value}}}`}
                        </Badge>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export type MoveDealToPipelineData = {
  id: string;
  type: "move_deal_to_pipeline";
  dealIdVariable?: string;
  sourcePipelineId?: number | null;
  targetPipelineId: number;
  targetStageId: number;
  createDealIfNotExists?: boolean;
  preserveDealData?: boolean;
  errorHandling?: 'continue' | 'stop';
};

function MoveDealToPipelineNode({
  id,
  data,
  selected,
  isConnectable
}: NodeProps<MoveDealToPipelineData>) {
  const { onDeleteNode, onDuplicateNode } = useFlowContext();
  const { getNodes, setNodes } = useReactFlow();
  const [showToolbar, setShowToolbar] = useState(false);

  const { data: pipelines, isLoading: pipelinesLoading } = useQuery<Pipeline[]>({
    queryKey: ['/api/pipelines'],
    staleTime: 60 * 1000,
  });


  const { data: targetPipelineStages = [], isLoading: stagesLoading } = useQuery<PipelineStage[]>({
    queryKey: ['/api/pipeline/stages', data.targetPipelineId],
    queryFn: async () => {
      if (!data.targetPipelineId) {
        return [];
      }
      const res = await apiRequest('GET', `/api/pipeline/stages?pipelineId=${data.targetPipelineId}`);
      return res.json();
    },
    enabled: !!data.targetPipelineId,
    staleTime: 60 * 1000,
  });

  const updateNodeData = useCallback((updates: Partial<MoveDealToPipelineData>) => {
    const nodes = getNodes();
    const updatedNodes = nodes.map((node: any) => {
      if (node.id === id) {
        return {
          ...node,
          data: { ...node.data, ...updates }
        };
      }
      return node;
    });
    setNodes(updatedNodes);
  }, [id, getNodes, setNodes]);

  useEffect(() => {
    if (data && (!data.dealIdVariable || !data.targetPipelineId || !data.targetStageId)) {
      const updatedData = {
        ...data,
        dealIdVariable: data.dealIdVariable || "{{contact.phone}}",
        errorHandling: data.errorHandling || 'continue',
        createDealIfNotExists: data.createDealIfNotExists || false,
        preserveDealData: data.preserveDealData || true
      };

      updateNodeData(updatedData);
    }
  }, [data, id, updateNodeData]);

  const handleDelete = useCallback(() => {
    onDeleteNode(id);
  }, [id, onDeleteNode]);

  const handleDuplicate = useCallback(() => {
    onDuplicateNode(id);
  }, [id, onDuplicateNode]);

  const handleSelectChange = useCallback((field: keyof MoveDealToPipelineData) =>
    (value: string) => {
      if (field === 'targetPipelineId') {
        updateNodeData({ 
          [field]: parseInt(value),
          targetStageId: undefined // Reset stage when pipeline changes
        });
      } else if (field === 'sourcePipelineId') {
        updateNodeData({ 
          [field]: value === 'any' ? null : parseInt(value)
        });
      } else if (field === 'errorHandling') {

        updateNodeData({ [field]: value as 'continue' | 'stop' });
      } else {
        updateNodeData({ [field]: value === 'none' ? null : parseInt(value) });
      }
    }, [updateNodeData]);

  const handleSwitchChange = useCallback((field: keyof MoveDealToPipelineData) =>
    (checked: boolean) => {
      updateNodeData({ [field]: checked });
    }, [updateNodeData]);


  const isValidStage = useMemo(() => {
    if (!data.targetPipelineId || !data.targetStageId || !targetPipelineStages) return true;
    const stage = targetPipelineStages.find(s => s.id.toString() === data.targetStageId.toString());
    return stage ? stage.pipelineId === data.targetPipelineId : false;
  }, [data.targetPipelineId, data.targetStageId, targetPipelineStages]);

  return (
    <TooltipProvider>
      <div
        className="group relative"
        onMouseEnter={() => setShowToolbar(true)}
        onMouseLeave={() => setShowToolbar(false)}
      >
        {showToolbar && (
          <div className="absolute -top-10 right-0 flex space-x-2 z-50 bg-background p-1 rounded-md shadow-sm">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleDuplicate}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}

        <Handle
          type="target"
          position={Position.Left}
          style={standardHandleStyle}
          isConnectable={isConnectable}
        />

        <Card className={cn(
          "min-w-[380px] max-w-[480px] transition-all duration-200",
          selected ? ' border-2 shadow-lg' : 'border-border',
          "bg-gradient-to-br from-background to-muted/20"
        )}>
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/20">
                  <ArrowRightLeft className="w-4 h-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">
                    Move Deal to Pipeline
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Move a deal to a different pipeline and stage
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!isValidStage && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="destructive" className="text-xs">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Invalid Config
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Selected stage does not belong to target pipeline</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <Badge variant="secondary" className="text-xs">
                  Pipeline
                </Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 pt-0 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1">
                <Phone className="w-3 h-3" />
                Contact Phone Variable
              </Label>
              <VariablePicker
                value={data.dealIdVariable || ''}
                onChange={(value) => updateNodeData({ dealIdVariable: value })}
                placeholder="{{contact.phone}}"
                className="h-8"
              />
              <p className="text-xs text-muted-foreground">
                Variable containing the contact phone number to identify the deal
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1">
                <Layers className="w-3 h-3" />
                Source Pipeline (Optional Filter)
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="w-3 h-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Optionally filter deals by source pipeline. Leave as "Any Pipeline" to move deals from any pipeline.</p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Select
                value={data.sourcePipelineId?.toString() || 'any'}
                onValueChange={handleSelectChange('sourcePipelineId')}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Any Pipeline" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any Pipeline</SelectItem>
                  {pipelinesLoading ? (
                    <SelectItem value="loading" disabled>Loading pipelines...</SelectItem>
                  ) : (
                    pipelines?.map(pipeline => (
                      <SelectItem key={pipeline.id} value={pipeline.id.toString()}>
                        {pipeline.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 border-t"></div>
              <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
              <div className="flex-1 border-t"></div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1">
                <Target className="w-3 h-3" />
                Target Pipeline
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="w-3 h-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Select the target pipeline where the deal will be moved</p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Select
                value={data.targetPipelineId?.toString() || ''}
                onValueChange={handleSelectChange('targetPipelineId')}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select target pipeline" />
                </SelectTrigger>
                <SelectContent>
                  {pipelinesLoading ? (
                    <SelectItem value="loading" disabled>Loading pipelines...</SelectItem>
                  ) : (
                    pipelines?.map(pipeline => (
                      <SelectItem key={pipeline.id} value={pipeline.id.toString()}>
                        {pipeline.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {data.targetPipelineId && (
              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  Target Stage
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="w-3 h-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Select the target stage within the selected pipeline</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Select
                  value={data.targetStageId?.toString() || ''}
                  onValueChange={handleSelectChange('targetStageId')}
                >
                  <SelectTrigger className={cn(
                    "h-8",
                    !isValidStage && "border-red-500"
                  )}>
                    <SelectValue placeholder="Select target stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {stagesLoading ? (
                      <SelectItem value="loading" disabled>Loading stages...</SelectItem>
                    ) : targetPipelineStages.length > 0 ? (
                      targetPipelineStages.map((stage) => (
                        <SelectItem
                          key={stage.id}
                          value={stage.id.toString()}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: stage.color }}
                            />
                            {stage.name}
                          </div>
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-stages" disabled>No stages available for this pipeline</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {!isValidStage && (
                  <p className="text-xs text-red-500">Selected stage does not belong to target pipeline</p>
                )}
              </div>
            )}

            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Create deal if not exists</Label>
                <Switch
                  checked={data.createDealIfNotExists || false}
                  onCheckedChange={handleSwitchChange('createDealIfNotExists')}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Preserve deal data</Label>
                <Switch
                  checked={data.preserveDealData !== false}
                  onCheckedChange={handleSwitchChange('preserveDealData')}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium">Error Handling</Label>
                <Select
                  value={data.errorHandling || 'continue'}
                  onValueChange={handleSelectChange('errorHandling')}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="continue">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-green-500" />
                        Continue on error
                      </div>
                    </SelectItem>
                    <SelectItem value="stop">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-3 h-3 text-red-500" />
                        Stop on error
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Handle
          type="source"
          position={Position.Right}
          style={standardHandleStyle}
          isConnectable={isConnectable}
        />
      </div>
    </TooltipProvider>
  );
}

export default MoveDealToPipelineNode;
