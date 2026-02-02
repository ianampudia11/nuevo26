import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  HelpCircle,
  Plus,
  Settings,
  Trash2,
  Variable,
  X,
  Database,
  User,
  MessageSquare,
  Phone,
  Mail,
  Tag,
  Calendar,
  Hash
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { useFlowContext } from '../../pages/flow-builder';
import React from 'react';

interface DataCaptureRule {
  id: string;
  variableName: string;
  sourceType: 'message_content' | 'contact_field' | 'regex_extract' | 'user_input' | 'custom_prompt';
  sourceValue: string;
  dataType: 'string' | 'number' | 'boolean' | 'email' | 'phone' | 'date';
  required: boolean;
  defaultValue?: string;
  validationPattern?: string;
  description?: string;
}

interface DataCaptureNodeProps {
  id: string;
  data: {
    label: string;
    captureRules?: DataCaptureRule[];
    storageScope?: 'session' | 'flow' | 'global';
    overwriteExisting?: boolean;
    enableValidation?: boolean;
  };
  isConnectable: boolean;
}

const DATA_SOURCE_TYPES = [
  {
    id: 'message_content',
    name: 'Message Content',
    description: 'Extract data from the entire message text',
    icon: <MessageSquare className="w-3 h-3" />,
    placeholder: 'Full message content'
  },
  {
    id: 'contact_field',
    name: 'Contact Field',
    description: 'Use existing contact information',
    icon: <User className="w-3 h-3" />,
    placeholder: 'contact.name, contact.phone, contact.email'
  },
  {
    id: 'regex_extract',
    name: 'Regex Extract',
    description: 'Extract specific patterns from message',
    icon: <Hash className="w-3 h-3" />,
    placeholder: 'Regular expression pattern'
  },
  {
    id: 'user_input',
    name: 'User Input',
    description: 'Capture direct user response',
    icon: <MessageSquare className="w-3 h-3" />,
    placeholder: 'Direct user input'
  },
  {
    id: 'custom_prompt',
    name: 'Custom Prompt',
    description: 'Ask user for specific information',
    icon: <MessageSquare className="w-3 h-3" />,
    placeholder: 'What is your name?'
  }
];

const DATA_TYPES = [
  { id: 'string', name: 'Text', icon: <Tag className="w-3 h-3" /> },
  { id: 'number', name: 'Number', icon: <Hash className="w-3 h-3" /> },
  { id: 'email', name: 'Email', icon: <Mail className="w-3 h-3" /> },
  { id: 'phone', name: 'Phone', icon: <Phone className="w-3 h-3" /> },
  { id: 'date', name: 'Date', icon: <Calendar className="w-3 h-3" /> },
  { id: 'boolean', name: 'Yes/No', icon: <CheckCircle className="w-3 h-3" /> }
];

const CAPTURE_TEMPLATES = [
  {
    id: 'contact_info',
    name: 'Contact Information',
    rules: [
      {
        id: 'name',
        variableName: 'user_name',
        sourceType: 'regex_extract' as const,
        sourceValue: 'My name is ([A-Za-z\\s]+)',
        dataType: 'string' as const,
        required: true,
        description: 'Extract user name from message'
      },
      {
        id: 'email',
        variableName: 'user_email',
        sourceType: 'regex_extract' as const,
        sourceValue: '([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})',
        dataType: 'email' as const,
        required: false,
        description: 'Extract email address from message'
      }
    ]
  },
  {
    id: 'order_details',
    name: 'Order Information',
    rules: [
      {
        id: 'order_id',
        variableName: 'order_id',
        sourceType: 'regex_extract' as const,
        sourceValue: 'order[\\s#]*([A-Z0-9]+)',
        dataType: 'string' as const,
        required: true,
        description: 'Extract order ID from message'
      },
      {
        id: 'quantity',
        variableName: 'quantity',
        sourceType: 'regex_extract' as const,
        sourceValue: '(\\d+)\\s*(?:items?|pieces?|qty)',
        dataType: 'number' as const,
        required: false,
        description: 'Extract quantity from message'
      }
    ]
  },
  {
    id: 'feedback_form',
    name: 'Feedback Collection',
    rules: [
      {
        id: 'rating',
        variableName: 'satisfaction_rating',
        sourceType: 'regex_extract' as const,
        sourceValue: '([1-5]|one|two|three|four|five)',
        dataType: 'number' as const,
        required: true,
        description: 'Extract rating from 1-5'
      },
      {
        id: 'feedback',
        variableName: 'feedback_text',
        sourceType: 'message_content' as const,
        sourceValue: '',
        dataType: 'string' as const,
        required: false,
        description: 'Capture full feedback message'
      }
    ]
  }
];

export function DataCaptureNode({ id, data, isConnectable }: DataCaptureNodeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [captureRules, setCaptureRules] = useState<DataCaptureRule[]>(data.captureRules || []);
  const [storageScope, setStorageScope] = useState(data.storageScope || 'session');
  const [overwriteExisting, setOverwriteExisting] = useState<boolean>(data.overwriteExisting || false);
  const [enableValidation, setEnableValidation] = useState<boolean>(data.enableValidation !== false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [configurationProgress, setConfigurationProgress] = useState(0);

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

  const standardHandleStyle = {
    width: 12,
    height: 12,
    backgroundColor: '#3b82f6',
    border: '2px solid white',
  };

  const addCaptureRule = () => {
    const newRule: DataCaptureRule = {
      id: `rule_${Date.now()}`,
      variableName: '',
      sourceType: 'message_content',
      sourceValue: '',
      dataType: 'string',
      required: false,
      description: ''
    };
    setCaptureRules([...captureRules, newRule]);
  };

  const updateCaptureRule = (ruleId: string, updates: Partial<DataCaptureRule>) => {
    setCaptureRules(rules =>
      rules.map(rule =>
        rule.id === ruleId ? { ...rule, ...updates } : rule
      )
    );
  };

  const removeCaptureRule = (ruleId: string) => {
    setCaptureRules(rules => rules.filter(rule => rule.id !== ruleId));
  };

  const applyTemplate = (templateId: string) => {
    const template = CAPTURE_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setCaptureRules(template.rules);
    }
  };

  const calculateProgress = () => {
    const hasRules = captureRules.length > 0;
    const validRules = captureRules.filter(rule => 
      rule.variableName.trim() && rule.sourceValue.trim()
    ).length;
    const totalRules = captureRules.length || 1;
    
    const progress = hasRules ? (validRules / totalRules) * 100 : 0;
    setConfigurationProgress(Math.round(progress));
  };

  useEffect(() => {
    calculateProgress();
  }, [captureRules]);

  useEffect(() => {
    updateNodeData({
      captureRules,
      storageScope,
      overwriteExisting,
      enableValidation
    });
  }, [updateNodeData, captureRules, storageScope, overwriteExisting, enableValidation]);

  return (
    <div className="node-data-capture p-3 rounded-lg bg-card border border-border shadow-sm min-w-[380px] max-w-[480px] group">
      <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <TooltipProvider>
          <Tooltip>
            <Dialog>
              <DialogTrigger asChild>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-primary hover:text-primary/80 hover:bg-primary/10"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
              </DialogTrigger>
              <DialogPrimitive.Portal>
                <DialogPrimitive.Content
                  className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-4xl max-h-[90vh] translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg overflow-hidden"
                >
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Database className="h-5 w-5 text-primary" />
                      Data Capture Node - Help & Documentation
                    </DialogTitle>
                    <DialogDescription>
                      Learn how to effectively capture and use data in your flows
                    </DialogDescription>
                  </DialogHeader>
                  <DataCaptureHelpContent />
                  <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                    <X className="h-4 w-4" />
                  </DialogPrimitive.Close>
                </DialogPrimitive.Content>
              </DialogPrimitive.Portal>
            </Dialog>
            <TooltipContent side="top">
              <p className="text-xs">Help & Documentation</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

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

      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        style={standardHandleStyle}
      />

      <div className="font-medium flex items-center gap-2 mb-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <img 
                src="https://cdn-icons-png.flaticon.com/128/2920/2920349.png" 
                alt="Data Capture" 
                className="h-4 w-4"
              />
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">Data Capture Node</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span>Data Capture</span>
        
        {configurationProgress > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20">
                  {configurationProgress}%
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">Configuration Progress</p>
                <p className="text-xs text-muted-foreground">
                  {configurationProgress === 100 ? 'Fully configured and ready to capture data' : 'Complete capture rules for full functionality'}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
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
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">
                {isEditing ? 'Hide configuration options' : 'Show configuration options'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="text-sm p-2  rounded border border-border">
        <div className="flex items-center gap-1 mb-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <Variable className="h-3 w-3 text-primary" />
                  <span className="font-medium text-primary">
                    {captureRules.length} Variable{captureRules.length !== 1 ? 's' : ''}
                  </span>
                  {captureRules.length > 0 && (
                    <span className="text-xs text-primary font-medium">✓</span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs font-medium">Data Capture Rules</p>
                <p className="text-xs text-muted-foreground">
                  {captureRules.length === 0
                    ? 'No capture rules configured yet'
                    : `Capturing ${captureRules.length} variable${captureRules.length !== 1 ? 's' : ''} from user data`
                  }
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <span className="text-muted-foreground">•</span>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  {captureRules.length > 0 ? (
                    <CheckCircle className="h-3 w-3 text-primary" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-secondary" />
                  )}
                  <span className="text-xs text-muted-foreground truncate">
                    {captureRules.length > 0 ? 'Ready' : 'Setup required'}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">
                  {captureRules.length > 0
                    ? `Data capture ready with ${storageScope} scope`
                    : 'Please configure capture rules to start capturing data'
                  }
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex flex-wrap gap-1 text-[10px]">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[9px] px-1 py-0">
                  📊 {storageScope.charAt(0).toUpperCase() + storageScope.slice(1)}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">Variable Storage Scope</p>
                <p className="text-xs text-muted-foreground">
                  Variables will be stored at {storageScope} level
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {enableValidation && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    ✅ Validation
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Data validation enabled</p>
                  <p className="text-xs text-muted-foreground">
                    Captured data will be validated before storage
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {overwriteExisting && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    🔄 Overwrite
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Overwrite existing variables</p>
                  <p className="text-xs text-muted-foreground">
                    Will replace existing variables with same names
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {captureRules.some(rule => rule.required) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    ⚠️ Required
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Has required fields</p>
                  <p className="text-xs text-muted-foreground">
                    Some variables are marked as required
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="mt-3 text-xs space-y-3 border rounded p-2 ">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Database className="h-3.5 w-3.5 text-primary" />
              <Label className="font-medium">Quick Templates</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">Pre-configured templates for common data capture scenarios</p>
                    <p className="text-xs text-muted-foreground">Select a template to quickly set up data capture rules</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Select
              value=""
              onValueChange={applyTemplate}
            >
              <SelectTrigger className="text-xs h-7">
                <SelectValue placeholder="Choose a template..." />
              </SelectTrigger>
              <SelectContent>
                {CAPTURE_TEMPLATES.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    <div className="flex items-center gap-2">
                      <Variable className="w-3 h-3" />
                      <div>
                        <div className="font-medium">{template.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {template.rules.length} capture rule{template.rules.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label className="font-medium">Capture Rules</Label>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={addCaptureRule}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Rule
              </Button>
            </div>

            {captureRules.length === 0 && (
              <div className="text-center py-4 text-muted-foreground">
                <Variable className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs">No capture rules configured</p>
                <p className="text-[10px] text-muted-foreground">Add rules to start capturing data from conversations</p>
              </div>
            )}

            <div className="space-y-2">
              {captureRules.map((rule, index) => (
                <div key={rule.id} className="border rounded p-2 bg-background">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary" className="text-[9px]">
                      Rule {index + 1}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 text-destructive hover:text-destructive"
                      onClick={() => removeCaptureRule(rule.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <Label className="text-[10px] font-medium mb-1 block">Variable Name</Label>
                      <Input
                        value={rule.variableName}
                        onChange={(e) => updateCaptureRule(rule.id, { variableName: e.target.value })}
                        placeholder="user_name"
                        className="text-[10px] h-6"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] font-medium mb-1 block">Data Type</Label>
                      <Select
                        value={rule.dataType}
                        onValueChange={(value: any) => updateCaptureRule(rule.id, { dataType: value })}
                      >
                        <SelectTrigger className="text-[10px] h-6">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DATA_TYPES.map((type) => (
                            <SelectItem key={type.id} value={type.id}>
                              <div className="flex items-center gap-1">
                                {type.icon}
                                {type.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="mb-2">
                    <Label className="text-[10px] font-medium mb-1 block">Source Type</Label>
                    <Select
                      value={rule.sourceType}
                      onValueChange={(value: any) => updateCaptureRule(rule.id, { sourceType: value })}
                    >
                      <SelectTrigger className="text-[10px] h-6">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DATA_SOURCE_TYPES.map((source) => (
                          <SelectItem key={source.id} value={source.id}>
                            <div className="flex items-center gap-1">
                              {source.icon}
                              <div>
                                <div className="font-medium">{source.name}</div>
                                <div className="text-[9px] text-muted-foreground">{source.description}</div>
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="mb-2">
                    <Label className="text-[10px] font-medium mb-1 block">Source Value</Label>
                    <Input
                      value={rule.sourceValue}
                      onChange={(e) => updateCaptureRule(rule.id, { sourceValue: e.target.value })}
                      placeholder={DATA_SOURCE_TYPES.find(s => s.id === rule.sourceType)?.placeholder || ''}
                      className="text-[10px] h-6 font-mono"
                    />
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={rule.required}
                        onCheckedChange={(checked) => updateCaptureRule(rule.id, { required: checked })}
                      />
                      <Label className="text-[10px]">Required</Label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 p-1 text-[10px] w-full justify-between">
                <span>Advanced Settings</span>
                {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 mt-2">
              <div>
                <Label className="text-[10px] font-medium mb-1 block">Storage Scope</Label>
                <Select
                  value={storageScope}
                  onValueChange={(value: any) => setStorageScope(value)}
                >
                  <SelectTrigger className="text-[10px] h-6">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="session">Session - Available during current conversation</SelectItem>
                    <SelectItem value="flow">Flow - Available throughout entire flow execution</SelectItem>
                    <SelectItem value="global">Global - Available across all flows</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={overwriteExisting}
                  onCheckedChange={(checked) => setOverwriteExisting(checked)}
                />
                <Label className="text-[10px] font-medium">
                  Overwrite Existing Variables
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-2.5 w-2.5 text-muted-foreground cursor-help ml-1 inline" />
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs max-w-48">
                          If enabled, will replace existing variables with the same name. If disabled, will skip capture if variable already exists.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={enableValidation}
                  onCheckedChange={(checked) => setEnableValidation(checked)}
                />
                <Label className="text-[10px] font-medium">
                  Enable Data Validation
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-2.5 w-2.5 text-muted-foreground cursor-help ml-1 inline" />
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs max-w-48">
                          Validate captured data against the specified data type (email format, phone format, etc.)
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        style={standardHandleStyle}
      /> */}
    </div>
  );
}


function DataCaptureHelpContent() {
  return (
    <ScrollArea className="h-[70vh] pr-4">
      <div className="space-y-6">
        {/* Node Overview */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            Node Overview
          </h3>
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
            <p className="text-sm text-foreground mb-2">
              The <strong>Data Capture Node</strong> is a powerful tool for extracting and storing information from user conversations.
              It enables you to capture specific data points and make them available as variables throughout your entire flow.
            </p>
            <p className="text-sm text-foreground">
              <strong>Key Benefits:</strong> Personalize responses, store user preferences, extract order information,
              collect contact details, and create dynamic, context-aware conversations.
            </p>
          </div>
        </section>

        {/* Data Source Types */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Data Source Types
          </h3>
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <MessageSquare className="h-3 w-3" />
                Message Content
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                Captures the entire message text sent by the user.
              </p>
              <div className="bg-muted rounded p-2 text-xs font-mono">
                User: "Hello, my name is John and I need help with order #12345"<br/>
                Captured: "Hello, my name is John and I need help with order #12345"
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <User className="h-3 w-3" />
                Contact Field
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                Extracts data from existing contact information using dot notation.
              </p>
              <div className="bg-muted rounded p-2 text-xs font-mono space-y-1">
                <div><strong>Examples:</strong></div>
                <div>contact.name → "John Smith"</div>
                <div>contact.phone → "+1234567890"</div>
                <div>contact.email → "john@example.com"</div>
                <div>contact.company → "Acme Corp"</div>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <Hash className="h-3 w-3" />
                Regex Extract
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                Uses regular expressions to extract specific patterns from messages.
              </p>
              <div className="bg-muted rounded p-2 text-xs font-mono space-y-1">
                <div><strong>Common Patterns:</strong></div>
                <div>Name: My name is ([A-Za-z\\s]+)</div>
                <div>Email: ([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]&#123;2,&#125;)</div>
                <div>Phone: (\\+?[\\d\\s\\-\\(\\)]&#123;10,15&#125;)</div>
                <div>Order ID: order[\\s#]*([A-Z0-9]+)</div>
                <div>Number: (\\d+)</div>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <MessageSquare className="h-3 w-3" />
                User Input & Custom Prompt
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                Captures direct user responses or prompts users for specific information.
              </p>
              <div className="bg-muted rounded p-2 text-xs">
                Best used when you want to capture the user's complete response to a specific question or prompt.
              </div>
            </div>
          </div>
        </section>

        {/* Data Types */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" />
            Data Types & Validation
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1">String (Text)</h4>
              <p className="text-xs text-muted-foreground">Any text content, no validation</p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1">Number</h4>
              <p className="text-xs text-muted-foreground">Numeric values, validates format</p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1">Email</h4>
              <p className="text-xs text-muted-foreground">Validates email format (user@domain.com)</p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1">Phone</h4>
              <p className="text-xs text-muted-foreground">Validates phone number format</p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1">Date</h4>
              <p className="text-xs text-muted-foreground">Validates date format</p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1">Boolean (Yes/No)</h4>
              <p className="text-xs text-muted-foreground">True/false, yes/no values</p>
            </div>
          </div>
        </section>

        <Separator />

        {/* Variable System */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Variable className="h-4 w-4 text-primary" />
            Variable System
          </h3>
          <div className="space-y-4">
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2">How Variables Work</h4>
              <p className="text-xs text-foreground mb-2">
                Once captured, data becomes available as <code className="bg-muted px-1 rounded">&#123;&#123;variable_name&#125;&#125;</code> tokens
                that can be used in any subsequent node in your flow.
              </p>
              <div className="bg-card rounded p-2 text-xs font-mono">
                Captured: user_name = "John"<br/>
                Usage: "Hello &#123;&#123;user_name&#125;&#125;, how can I help you today?"<br/>
                Result: "Hello John, how can I help you today?"
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-sm mb-2">Variable Scoping</h4>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="text-xs">Session</Badge>
                  <p className="text-xs text-muted-foreground">Available during the current conversation only</p>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="text-xs">Flow</Badge>
                  <p className="text-xs text-muted-foreground">Available throughout the entire flow execution</p>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="text-xs">Global</Badge>
                  <p className="text-xs text-muted-foreground">Available across all flows for this contact</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Configuration Options */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            Configuration Options
          </h3>
          <div className="space-y-3">
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
                <CheckCircle className="h-3 w-3 text-primary" />
                Overwrite Existing Variables
              </h4>
              <p className="text-xs text-muted-foreground">
                When enabled, will replace existing variables with the same name.
                When disabled, will skip capture if variable already exists.
              </p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
                <CheckCircle className="h-3 w-3 text-primary" />
                Enable Data Validation
              </h4>
              <p className="text-xs text-muted-foreground">
                Validates captured data against the specified data type (email format, phone format, etc.).
                Invalid data will be rejected.
              </p>
            </div>
            <div className="border rounded-lg p-3">
              <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
                <AlertCircle className="h-3 w-3 text-destructive" />
                Required Fields
              </h4>
              <p className="text-xs text-muted-foreground">
                When a field is marked as required, the flow will fail if the data cannot be captured.
                Use for critical information only.
              </p>
            </div>
          </div>
        </section>

        <Separator />

        {/* Practical Examples */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            Practical Examples
          </h3>
          <div className="space-y-4">
            {/* Example 1 */}
            <div className="border rounded-lg p-4 bg-primary/10 border-primary/20">
              <h4 className="font-medium text-sm mb-2">Example 1: Contact Information Collection</h4>
              <div className="space-y-2 text-xs">
                <div className="bg-card rounded p-2">
                  <strong>User Message:</strong> "Hi, my name is Sarah Johnson and my email is sarah@company.com"
                </div>
                <div className="bg-muted rounded p-2 font-mono">
                  <strong>Capture Rules:</strong><br/>
                  Rule 1: user_name | Regex Extract | My name is ([A-Za-z\\s]+)<br/>
                  Rule 2: user_email | Regex Extract | ([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]&#123;2,&#125;)
                </div>
                <div className="bg-primary/10 rounded p-2">
                  <strong>Result:</strong><br/>
                  &#123;&#123;user_name&#125;&#125; = "Sarah Johnson"<br/>
                  &#123;&#123;user_email&#125;&#125; = "sarah@company.com"
                </div>
                <div className="bg-primary/10 rounded p-2">
                  <strong>Usage in Next Node:</strong><br/>
                  "Thank you &#123;&#123;user_name&#125;&#125;! I'll send the information to &#123;&#123;user_email&#125;&#125;."
                </div>
              </div>
            </div>

            {/* Example 2 */}
            <div className="border rounded-lg p-4 bg-primary/10 border-primary/20">
              <h4 className="font-medium text-sm mb-2">Example 2: Order Status Inquiry</h4>
              <div className="space-y-2 text-xs">
                <div className="bg-card rounded p-2">
                  <strong>User Message:</strong> "I need help with order #ORD-12345"
                </div>
                <div className="bg-muted rounded p-2 font-mono">
                  <strong>Capture Rule:</strong><br/>
                  order_id | Regex Extract | order[\\s#]*([A-Z0-9-]+)
                </div>
                <div className="bg-primary/10 rounded p-2">
                  <strong>Result:</strong> &#123;&#123;order_id&#125;&#125; = "ORD-12345"
                </div>
                <div className="bg-primary/10 rounded p-2">
                  <strong>Usage:</strong> Pass to API call node to fetch order details
                </div>
              </div>
            </div>

            {/* Example 3 */}
            <div className="border rounded-lg p-4 bg-secondary/10 border-secondary/20">
              <h4 className="font-medium text-sm mb-2">Example 3: Using Contact Fields</h4>
              <div className="space-y-2 text-xs">
                <div className="bg-muted rounded p-2 font-mono">
                  <strong>Capture Rules:</strong><br/>
                  customer_name | Contact Field | contact.name<br/>
                  customer_phone | Contact Field | contact.phone<br/>
                  customer_company | Contact Field | contact.company
                </div>
                <div className="bg-primary/10 rounded p-2">
                  <strong>Usage:</strong> Automatically populate forms or personalize messages with existing contact data
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Best Practices */}
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-primary" />
            Best Practices & Tips
          </h3>
          <div className="space-y-3">
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
              <h4 className="font-medium text-sm mb-2 text-primary">✅ Do's</h4>
              <ul className="text-xs text-foreground space-y-1">
                <li>• Use descriptive variable names (user_email, order_id, customer_name)</li>
                <li>• Test regex patterns with sample data before deploying</li>
                <li>• Use appropriate data types for validation</li>
                <li>• Set reasonable default values for optional fields</li>
                <li>• Use session scope for temporary data, global for persistent data</li>
              </ul>
            </div>
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <h4 className="font-medium text-sm mb-2 text-destructive">❌ Don'ts</h4>
              <ul className="text-xs text-foreground space-y-1">
                <li>• Don't make too many fields required (causes flow failures)</li>
                <li>• Don't use overly complex regex patterns (hard to maintain)</li>
                <li>• Don't overwrite important variables accidentally</li>
              </ul>
            </div>
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
              <h4 className="font-medium text-sm mb-2 text-primary">💡 Pro Tips</h4>
              <ul className="text-xs text-foreground space-y-1">
                <li>• Use the Variables tab in the sidebar to browse all available variables</li>
                <li>• Use templates for common capture scenarios</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}
