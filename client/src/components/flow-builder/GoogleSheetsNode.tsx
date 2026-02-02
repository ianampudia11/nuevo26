import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  HelpCircle,
  Loader2,
  Play,
  Plus,
  Table,
  Trash2,
  Variable,
  X,
  XCircle,
  Download,
  Search,
  User,
  Minus,
  MessageSquare,
  Settings,
  Phone
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { useFlowContext } from '../../pages/flow-builder';
import { GoogleSheetsOAuthStatus } from './GoogleSheetsOAuthStatus';
import { useGoogleSheetsAuth } from '@/hooks/useGoogleSheetsAuth';
import React from 'react';

const GOOGLE_SHEETS_OPERATIONS = [
  {
    id: 'append_row',
    name: 'Append Row',
    description: 'Add new data row to sheet',
    tooltip: 'Add a new row of data to the end of your Google Sheet. Sets variables: {{google_sheets.success}} (true/false), {{google_sheets.appendedRange}} (cell range), {{google_sheets.rowsAdded}} (count).',
    icon: '➕',
    color: 'text-primary'
  },
  {
    id: 'read_rows',
    name: 'Read Rows',
    description: 'Fetch data with optional filters',
    tooltip: 'Read data from your Google Sheet with optional filtering and row range selection. Sets variables: {{google_sheets.rows}} (all data), {{google_sheets.headers}} (column names), {{google_sheets.totalRows}} (count), {{google_sheets.row_1}} (first row), {{google_sheets.column_Name}} (column data).',
    icon: '📖',
    color: 'text-primary'
  },
  {
    id: 'update_row',
    name: 'Update Row',
    description: 'Modify existing row data',
    tooltip: 'Update existing rows in your Google Sheet by matching column values. Sets variables: {{google_sheets.success}} (true/false), {{google_sheets.matchingRows}} (found), {{google_sheets.updatedRows}} (modified).',
    icon: '✏️',
    color: 'text-secondary'
  },
  {
    id: 'get_sheet_info',
    name: 'Get Sheet Info',
    description: 'Retrieve sheet metadata and headers',
    tooltip: 'Get information about your Google Sheet including column headers and metadata. Sets variables: {{google_sheets.headers}} (column names), {{google_sheets.title}} (sheet title), {{google_sheets.rowCount}}, {{google_sheets.columnCount}}.',
    icon: 'ℹ️',
    color: 'text-primary'
  }
];

const GOOGLE_SHEETS_TEMPLATES: Array<{
  id: string;
  name: string;
  operation: string;
  config: ConfigValue;
}> = [
  {
    id: 'lead_capture',
    name: 'Lead Capture Form',
    operation: 'append_row',
    config: {
      columnMappings: {
        'Name': '{{contact.name}}',
        'Phone': '{{contact.phone}}',
        'Message': '{{message.content}}',
        'Timestamp': '{{current.timestamp}}'
      },
      duplicateCheck: {
        enabled: true,
        columns: ['Phone'],
        caseSensitive: false,
        onDuplicate: 'skip'
      }
    }
  },
  {
    id: 'order_tracking',
    name: 'Order Status Update',
    operation: 'update_row',
    config: {
      matchColumn: 'Order ID',
      matchValue: '{{order.id}}',
      columnMappings: {
        'Status': '{{order.status}}',
        'Updated': '{{current.timestamp}}'
      }
    }
  },
  {
    id: 'user_lookup',
    name: 'User Information Lookup',
    operation: 'read_rows',
    config: {
      filterColumn: 'Phone',
      filterValue: '{{contact.phone}}',
      maxRows: 1
    }
  }
];

interface VariableOption {
  value: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: 'contact' | 'message' | 'system' | 'flow';
}

const AVAILABLE_VARIABLES: VariableOption[] = [
  { value: 'contact.name', label: 'Contact Name', description: 'Full name of the contact', icon: <User className="w-3 h-3" />, category: 'contact' },
  { value: 'contact.phone', label: 'Contact Phone', description: 'Phone number of the contact', icon: <Phone className="w-3 h-3" />, category: 'contact' },
  { value: 'contact.email', label: 'Contact Email', description: 'Email address of the contact', icon: <User className="w-3 h-3" />, category: 'contact' },
  { value: 'contact.company', label: 'Contact Company', description: 'Company name of the contact', icon: <User className="w-3 h-3" />, category: 'contact' },

  { value: 'message.content', label: 'Message Content', description: 'Text content of the message', icon: <MessageSquare className="w-3 h-3" />, category: 'message' },
  { value: 'message.type', label: 'Message Type', description: 'Type of message (text, image, etc.)', icon: <MessageSquare className="w-3 h-3" />, category: 'message' },
  { value: 'message.timestamp', label: 'Message Timestamp', description: 'When the message was sent', icon: <MessageSquare className="w-3 h-3" />, category: 'message' },

  { value: 'current.timestamp', label: 'Current Timestamp', description: 'Current date and time', icon: <Settings className="w-3 h-3" />, category: 'system' },
  { value: 'current.date', label: 'Current Date', description: 'Current date (YYYY-MM-DD)', icon: <Settings className="w-3 h-3" />, category: 'system' },
  { value: 'current.time', label: 'Current Time', description: 'Current time (HH:MM:SS)', icon: <Settings className="w-3 h-3" />, category: 'system' },

  { value: 'flow.result', label: 'Flow Result', description: 'Result from previous flow node', icon: <Variable className="w-3 h-3" />, category: 'flow' },
];

const getCategoryLabel = (category: string): string => {
  switch (category) {
    case 'contact': return 'Contact Information';
    case 'message': return 'Message Data';
    case 'system': return 'System Variables';
    case 'flow': return 'Flow Variables';
    default: return 'Other';
  }
};

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
    const currentValue = value || '';
    const beforeCursor = currentValue.substring(0, cursorPosition);
    const afterCursor = currentValue.substring(cursorPosition);
    const newValue = `${beforeCursor}{{${variableValue}}}${afterCursor}`;

    onChange(newValue);
    setOpen(false);

    setTimeout(() => {
      if (inputRef.current) {
        const newCursorPosition = beforeCursor.length + variableValue.length + 4;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPosition, newCursorPosition);
        setCursorPosition(newCursorPosition);
      }
    }, 0);
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

type ConfigValue = Record<string, any>;

interface VariableMapping {
  variable: string;
  path: string;
}

type ConfigField = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  default?: boolean | string | number;
  description?: string;
  options?: string[];
  tooltip?: string;
  placeholder?: string;
}

const OPERATION_CONFIG: Record<string, ConfigField[]> = {
  append_row: [
    {
      key: 'columnMappings',
      label: 'Column Mappings',
      type: 'object',
      description: 'Map sheet columns to flow variables',
      required: true,
      tooltip: 'Define which data goes into which columns. Use variables like {{contact.name}} or {{message.content}} to include dynamic data from the conversation.',
      placeholder: '{"Name": "{{contact.name}}", "Phone": "{{contact.phone}}", "Message": "{{message.content}}"}'
    },
    {
      key: 'duplicateCheck',
      label: 'Duplicate Prevention',
      type: 'object',
      description: 'Configure duplicate checking before inserting rows',
      required: false,
      tooltip: 'Enable duplicate checking to prevent adding duplicate entries. Useful for lead capture to avoid duplicate contacts based on phone number or email.',
      placeholder: '{"enabled": true, "columns": ["Phone"], "caseSensitive": false, "onDuplicate": "skip"}'
    }
  ],
  read_rows: [
    {
      key: 'filterColumn',
      label: 'Filter Column',
      type: 'text',
      description: 'Column name to filter by',
      required: false,
      tooltip: 'Specify a column name to filter results. Leave empty to read all rows within the specified range.',
      placeholder: 'Phone'
    },
    {
      key: 'filterValue',
      label: 'Filter Value',
      type: 'text',
      description: 'Value to match in filter column',
      required: false,
      tooltip: 'The value to search for in the filter column. Use variables like {{contact.phone}} for dynamic filtering.',
      placeholder: '{{contact.phone}}'
    },
    {
      key: 'startRow',
      label: 'Start Row',
      type: 'number',
      description: 'Starting row number (1-based)',
      required: false,
      default: 2,
      tooltip: 'The row number to start reading from. Row 1 is typically headers, so start from row 2 for data.',
      placeholder: '2'
    },
    {
      key: 'maxRows',
      label: 'Max Rows',
      type: 'number',
      description: 'Maximum number of rows to read',
      required: false,
      default: 100,
      tooltip: 'Limit the number of rows returned to avoid performance issues with large sheets.',
      placeholder: '100'
    }
  ],
  update_row: [
    {
      key: 'matchColumn',
      label: 'Match Column',
      type: 'text',
      description: 'Column to match for row identification',
      required: true,
      tooltip: 'The column name used to identify which row to update. For example, "Order ID" or "Phone Number".',
      placeholder: 'Order ID'
    },
    {
      key: 'matchValue',
      label: 'Match Value',
      type: 'text',
      description: 'Value to match in the match column',
      required: true,
      tooltip: 'The value to search for in the match column. Use variables like {{order.id}} for dynamic matching.',
      placeholder: '{{order.id}}'
    },
    {
      key: 'columnMappings',
      label: 'Column Updates',
      type: 'object',
      description: 'Columns to update with new values',
      required: true,
      tooltip: 'Define which columns to update with what values. Only specified columns will be modified.',
      placeholder: '{"Status": "{{order.status}}", "Updated": "{{current.timestamp}}"}'
    }
  ],
  get_sheet_info: []
};

interface DuplicatePreventionConfig {
  enabled?: boolean;
  columns?: string[];
  caseSensitive?: boolean;
  onDuplicate?: 'skip' | 'update' | 'add_anyway';
}

interface DuplicatePreventionUIProps {
  value: DuplicatePreventionConfig;
  onChange: (value: DuplicatePreventionConfig) => void;
}

interface ColumnMappingsUIProps {
  value: Record<string, any>;
  onChange: (value: Record<string, any>) => void;
  placeholder?: string;
}

const ColumnMappingsUI: React.FC<ColumnMappingsUIProps> = ({ value, onChange, placeholder }) => {
  const [mappings, setMappings] = useState<Array<{id: string, column: string, variable: string}>>(() => {
    if (value && typeof value === 'object') {
      return Object.entries(value).map(([column, variable], index) => ({
        id: `mapping-${index}`,
        column,
        variable: String(variable)
      }));
    }
    return [{ id: 'mapping-0', column: '', variable: '' }];
  });

  const updateMappings = (newMappings: Array<{id: string, column: string, variable: string}>) => {
    setMappings(newMappings);
    const result: Record<string, any> = {};
    newMappings.forEach(mapping => {
      if (mapping.column.trim() && mapping.variable.trim()) {
        result[mapping.column.trim()] = mapping.variable.trim();
      }
    });
    onChange(result);
  };

  const addMapping = () => {
    const newId = `mapping-${Date.now()}`;
    updateMappings([...mappings, { id: newId, column: '', variable: '' }]);
  };

  const removeMapping = (id: string) => {
    if (mappings.length > 1) {
      updateMappings(mappings.filter(mapping => mapping.id !== id));
    }
  };

  const updateMapping = (id: string, field: 'column' | 'variable', newValue: string) => {
    updateMappings(mappings.map(mapping => 
      mapping.id === id ? { ...mapping, [field]: newValue } : mapping
    ));
  };

  const validMappings = mappings.filter(mapping => mapping.column.trim() && mapping.variable.trim());
  const hasValidMappings = validMappings.length > 0;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {mappings.map((mapping, index) => (
          <div key={mapping.id} className="flex gap-2 items-center p-2 bg-muted/30 rounded border">
            <div className="flex items-center gap-2 w-full">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground mb-1 block">Column Name</Label>
                <div className="relative">
                  <Input
                    placeholder="e.g., Name, Phone, Email"
                    value={mapping.column}
                    onChange={(e) => updateMapping(mapping.id, 'column', e.target.value)}
                    className="text-xs h-7"
                    list={`column-suggestions-${mapping.id}`}
                  />
                  <datalist id={`column-suggestions-${mapping.id}`}>
                    <option value="Name" />
                    <option value="Phone" />
                    <option value="Email" />
                    <option value="Message" />
                    <option value="Timestamp" />
                    <option value="Status" />
                    <option value="Company" />
                    <option value="Address" />
                    <option value="Notes" />
                    <option value="ID" />
                  </datalist>
                </div>
              </div>
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground mb-1 block">Variable</Label>
                <VariablePicker
                  value={mapping.variable}
                  onChange={(value) => updateMapping(mapping.id, 'variable', value)}
                  placeholder="e.g., {{contact.name}}"
                  className="text-xs h-7"
                />
              </div>
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeMapping(mapping.id)}
                  disabled={mappings.length === 1}
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  title="Remove mapping"
                >
                  <Minus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {hasValidMappings && (
        <div className="bg-primary/10 p-3 rounded border border-primary/20">
          <div className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium text-primary mb-1 text-xs">Current Mappings ({validMappings.length}):</div>
              <div className="space-y-1">
                {validMappings.map((mapping, index) => (
                  <div key={mapping.id} className="text-xs font-mono bg-card p-1 rounded border border-border">
                    <span className="text-primary">"{mapping.column}"</span> → <span className="text-primary">{mapping.variable}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      
      <Button
        variant="outline"
        size="sm"
        onClick={addMapping}
        className="h-7 text-xs w-full"
      >
        <Plus className="h-3 w-3 mr-1" />
        Add Column Mapping
      </Button>
      
      {placeholder && (
        <div className="text-xs text-muted-foreground bg-primary/10 p-3 rounded border border-primary/20">
          <div className="flex items-start gap-2">
            <HelpCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium text-primary mb-1">Example Configuration:</div>
              <div className="font-mono text-xs bg-card p-2 rounded border border-border">
                {placeholder}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DuplicatePreventionUI: React.FC<DuplicatePreventionUIProps> = ({ value, onChange }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [columnsInput, setColumnsInput] = useState(value.columns?.join(', ') || 'Phone');

  const updateValue = (updates: Partial<DuplicatePreventionConfig>) => {
    onChange({ ...value, ...updates });
  };

  const handleColumnsChange = (input: string) => {
    setColumnsInput(input);
    const columns = input.split(',').map(col => col.trim()).filter(col => col.length > 0);
    updateValue({ columns });
  };


  useEffect(() => {
    if (!value.columns || value.columns.length === 0) {
      updateValue({ columns: ['Phone'] });
    }
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Switch
          checked={value.enabled || false}
          onCheckedChange={(enabled) => updateValue({ enabled })}
        />
        <Label className="text-[10px] font-medium">
          Enable Duplicate Prevention
        </Label>
      </div>

      {value.enabled && (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 p-1 text-[10px] w-full justify-between">
              <span>Advanced Settings</span>
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 mt-2">
            <div>
              <Label className="text-[10px] font-medium mb-1 block">
                Check Columns
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-2.5 w-2.5 text-muted-foreground cursor-help ml-1 inline" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs max-w-48">
                        Comma-separated list of column names to check for duplicates (e.g., "Phone, Email")
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <Input
                value={columnsInput}
                onChange={(e) => handleColumnsChange(e.target.value)}
                placeholder="Phone, Email"
                className="text-[10px] h-6"
              />
            </div>

            <div>
              <Label className="text-[10px] font-medium mb-1 block">
                When Duplicate Found
              </Label>
              <Select
                value={value.onDuplicate || 'skip'}
                onValueChange={(onDuplicate: 'skip' | 'update' | 'add_anyway') => updateValue({ onDuplicate })}
              >
                <SelectTrigger className="text-[10px] h-6">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Skip insertion</SelectItem>
                  <SelectItem value="update">Update existing row</SelectItem>
                  <SelectItem value="add_anyway">Add anyway (with warning)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={value.caseSensitive !== false}
                onCheckedChange={(caseSensitive) => updateValue({ caseSensitive })}
              />
              <Label className="text-[10px] font-medium">
                Case Sensitive
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-2.5 w-2.5 text-muted-foreground cursor-help ml-1 inline" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs max-w-48">
                        Whether to match case exactly (John vs john)
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};

interface GoogleSheetsNodeProps {
  id: string;
  data: {
    label: string;
    spreadsheetId?: string;
    sheetName?: string;
    operation?: string;
    config?: ConfigValue;
    variableMappings?: VariableMapping[];
    timeout?: number;
  };
  isConnectable: boolean;
}

export function GoogleSheetsNode({ id, data, isConnectable }: GoogleSheetsNodeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [spreadsheetId, setSpreadsheetId] = useState(data.spreadsheetId || '');
  const [sheetName, setSheetName] = useState(data.sheetName || '');
  const [operation, setOperation] = useState(data.operation || 'append_row');
  const [config, setConfig] = useState<ConfigValue>(data.config || {});
  const [variableMappings, setVariableMappings] = useState<VariableMapping[]>(data.variableMappings || []);
  const [timeout, setTimeoutState] = useState(data.timeout || 30);
  
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    data?: any;
  } | null>(null);
  const [showTestResult, setShowTestResult] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [fieldValidation, setFieldValidation] = useState<Record<string, { isValid: boolean; message?: string }>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [configurationProgress, setConfigurationProgress] = useState(0);

  const [isFetchingSheets, setIsFetchingSheets] = useState(false);
  const [isFetchingSheetNames, setIsFetchingSheetNames] = useState(false);
  const [fetchedSheets, setFetchedSheets] = useState<Array<{id: string, name: string}>>([]);
  const [fetchedSheetNames, setFetchedSheetNames] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedSheetId, setSelectedSheetId] = useState<string>('');
  const [selectedSheetName, setSelectedSheetName] = useState<string>('');

  const { setNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode } = useFlowContext();

  const { isConnected: isGoogleSheetsConnected, refetchStatus } = useGoogleSheetsAuth();

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
    backgroundColor: 'hsl(var(--primary))',
    border: '2px solid hsl(var(--background))',
  };

  const getOperationColor = (op: string) => {
    const operationData = GOOGLE_SHEETS_OPERATIONS.find(operation => operation.id === op);
    return operationData?.color || 'text-muted-foreground';
  };

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const validateField = (fieldName: string, value: string, required: boolean = false) => {
    let isValid = true;
    let message = '';

    if (required && !value.trim()) {
      isValid = false;
      message = 'This field is required';
    } else if (fieldName === 'spreadsheetId' && value.trim()) {
      const spreadsheetIdRegex = /^[a-zA-Z0-9-_]{44}$/;
      if (!spreadsheetIdRegex.test(value)) {
        isValid = false;
        message = 'Invalid Google Sheets ID format';
      }
    }

    setFieldValidation(prev => ({
      ...prev,
      [fieldName]: { isValid, message }
    }));

    return isValid;
  };

  const calculateProgress = () => {
    const requiredFields = [spreadsheetId, sheetName, operation];
    const filledRequired = requiredFields.filter(field => field && field.toString().trim()).length;
    const optionalFields = [JSON.stringify(config)];
    const filledOptional = optionalFields.filter(field => field && field.trim() && field !== '{}').length;


    const oauthConnected = isGoogleSheetsConnected ? 1 : 0;
    const totalRequired = requiredFields.length + 1; // +1 for OAuth
    const totalFilledRequired = filledRequired + oauthConnected;

    const progress = ((totalFilledRequired / totalRequired) * 80) + ((filledOptional / optionalFields.length) * 20);
    setConfigurationProgress(Math.round(progress));
  };

  useEffect(() => {
    calculateProgress();
  }, [isGoogleSheetsConnected, spreadsheetId, sheetName, operation, config]);

  useEffect(() => {
    refetchStatus();
  }, [refetchStatus]);

  useEffect(() => {
    const handleWindowFocus = () => {
      setTimeout(() => {
        refetchStatus();
      }, 500);
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, [refetchStatus]);

  useEffect(() => {
    updateNodeData({
      spreadsheetId,
      sheetName,
      operation,
      config,
      variableMappings,
      timeout
    });
  }, [
    updateNodeData,
    spreadsheetId,
    sheetName,
    operation,
    config,
    variableMappings,
    timeout
  ]);


  useEffect(() => {
    if (!selectedTemplate && operation && Object.keys(config).length > 0) {
      const matchingTemplate = GOOGLE_SHEETS_TEMPLATES.find(template => {
        if (template.operation !== operation) return false;
        

        const templateConfigKeys = Object.keys(template.config);
        const currentConfigKeys = Object.keys(config);
        
        if (templateConfigKeys.length !== currentConfigKeys.length) return false;
        
        return templateConfigKeys.every(key => {
          const templateValue = template.config[key];
          const currentValue = config[key];
          return templateValue === currentValue;
        });
      });
      
      if (matchingTemplate) {
        setSelectedTemplate(matchingTemplate.id);
      }
    }
  }, [operation, config, selectedTemplate]);


  useEffect(() => {
    if (spreadsheetId && fetchedSheets.length > 0 && !selectedSheetId) {
      const matchingSheet = fetchedSheets.find(sheet => sheet.id === spreadsheetId);
      if (matchingSheet) {
        setSelectedSheetId(spreadsheetId);
      }
    }
  }, [spreadsheetId, fetchedSheets, selectedSheetId]);


  useEffect(() => {
    if (sheetName && fetchedSheetNames.length > 0 && !selectedSheetName) {
      const matchingSheetName = fetchedSheetNames.find(name => name === sheetName);
      if (matchingSheetName) {
        setSelectedSheetName(sheetName);
      }
    }
  }, [sheetName, fetchedSheetNames, selectedSheetName]);



  const applyTemplate = (templateId: string) => {
    const template = GOOGLE_SHEETS_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setSelectedTemplate(templateId);
      setOperation(template.operation);
      const configWithoutUndefined = Object.fromEntries(
        Object.entries(template.config).filter(([_, value]) => value !== undefined)
      );
      setConfig(configWithoutUndefined as ConfigValue);
    }
  };

  const updateConfig = (key: string, value: string | boolean | number | object) => {
    setConfig(prev => ({ ...prev, [key]: value }));

    if (selectedTemplate) {
      setSelectedTemplate('');
    }
  };

  const removeConfig = (key: string) => {
    setConfig(prev => {
      const newConfig = { ...prev };
      delete newConfig[key];
      return newConfig;
    });

    if (selectedTemplate) {
      setSelectedTemplate('');
    }
  };

  const testConnection = async () => {
    if (!isGoogleSheetsConnected) {
      setTestResult({
        success: false,
        message: 'Please connect your Google account above to test the connection'
      });
      setShowTestResult(true);
      return;
    }

    if (!spreadsheetId.trim()) {
      setTestResult({
        success: false,
        message: 'Please provide a Spreadsheet ID'
      });
      setShowTestResult(true);
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/google/sheets/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          spreadsheetId,
          sheetName: sheetName || 'Sheet1',
          useOAuth: true
        }),
      });

      const result = await response.json();

      if (result.success) {

        try {
          const testDataResponse = await fetch('/api/google/sheets/add-test-data', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
              spreadsheetId,
              sheetName: sheetName || 'Sheet1',
              useOAuth: true // Add OAuth flag for test data
            }),
          });

          const testDataResult = await testDataResponse.json();

          if (testDataResult.success) {
            setTestResult({
              success: true,
              message: `✅ Connection successful!\n📊 Test data added to "${result.data?.title || 'Google Sheet'}"\n\nTest data includes:\n• Sample contact information\n• Timestamp: ${new Date().toLocaleString()}\n• Row added at: ${testDataResult.data?.range || 'Unknown range'}`,
              data: { ...result.data, testData: testDataResult.data }
            });
          } else {
            setTestResult({
              success: true,
              message: `✅ Connection successful to "${result.data?.title || 'Google Sheet'}"\n⚠️ Could not add test data: ${testDataResult.error}`,
              data: result.data
            });
          }
        } catch (testError) {
          console.error('Error adding test data:', testError);
          setTestResult({
            success: true,
            message: `✅ Connection successful to "${result.data?.title || 'Google Sheet'}"\n⚠️ Could not add test data due to network error`,
            data: result.data
          });
        }
      } else {
        setTestResult({
          success: false,
          message: result.error || 'Failed to connect to Google Sheets'
        });
      }
    } catch (error) {
      console.error('Test connection error:', error);
      setTestResult({
        success: false,
        message: 'Network error: Unable to test connection'
      });
    } finally {
      setIsTesting(false);
      setShowTestResult(true);
    }
  };

  const fetchGoogleSheets = async () => {
    if (!isGoogleSheetsConnected) {
      setTestResult({
        success: false,
        message: 'Please connect your Google account first to fetch sheets'
      });
      setShowTestResult(true);
      return;
    }

    setIsFetchingSheets(true);
    try {
      const response = await fetch('/api/google/sheets/list', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch Google Sheets');
      }

      const result = await response.json();

      if (result.success) {
        setFetchedSheets(result.sheets || []);


        if (result.sheets && result.sheets.length > 0) {
          setTestResult({
            success: true,
            message: `Found ${result.sheets.length} Google Sheets`
          });
          setShowTestResult(true);
        }
      } else {
        setTestResult({
          success: false,
          message: result.error || 'Failed to fetch Google Sheets'
        });
        setShowTestResult(true);
      }
    } catch (error) {
      console.error('Error fetching Google Sheets:', error);
      setTestResult({
        success: false,
        message: 'Network error: Unable to fetch Google Sheets'
      });
      setShowTestResult(true);
    } finally {
      setIsFetchingSheets(false);
    }
  };

  const fetchSheetNames = async (spreadsheetIdToFetch?: string) => {
    const targetSpreadsheetId = spreadsheetIdToFetch || spreadsheetId;

    if (!isGoogleSheetsConnected) {
      setTestResult({
        success: false,
        message: 'Please connect your Google account first to fetch sheet names'
      });
      setShowTestResult(true);
      return;
    }

    if (!targetSpreadsheetId.trim()) {
      setTestResult({
        success: false,
        message: 'Please provide a Spreadsheet ID to fetch sheet names'
      });
      setShowTestResult(true);
      return;
    }

    setIsFetchingSheetNames(true);
    try {
      const response = await fetch('/api/google/sheets/sheet-names', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spreadsheetId: targetSpreadsheetId
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch sheet names');
      }

      const result = await response.json();
      if (result.success) {
        setFetchedSheetNames(result.sheetNames || []);
      } else {
        setTestResult({
          success: false,
          message: result.error || 'Failed to fetch sheet names'
        });
        setShowTestResult(true);
      }
    } catch (error) {
      console.error('Error fetching sheet names:', error);
      setTestResult({
        success: false,
        message: 'Network error: Unable to fetch sheet names'
      });
      setShowTestResult(true);
    } finally {
      setIsFetchingSheetNames(false);
    }
  };

  return (
    <div className="node-google-sheets p-3 rounded-lg bg-card border border-border shadow-sm min-w-[380px] max-w-[480px] group">
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
                src="https://cdn.activepieces.com/pieces/google-sheets.png" 
                alt="Google Sheets" 
                className="h-4 w-4"
              />
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">Google Sheets Integration</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span>Google Sheets</span>
        
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
                  {configurationProgress === 100 ? 'Fully configured and ready to use' : 'Complete all required fields for full functionality'}
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

      <div className="text-sm p-2 bg-card rounded border border-border">
        <div className="flex items-center gap-1 mb-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <span className="text-lg">{GOOGLE_SHEETS_OPERATIONS.find(op => op.id === operation)?.icon || '📊'}</span>
                  <span className={cn("font-medium", getOperationColor(operation))}>
                    {GOOGLE_SHEETS_OPERATIONS.find(op => op.id === operation)?.name || operation}
                  </span>
                  {isGoogleSheetsConnected && (
                    <span className="text-xs text-primary font-medium">✓</span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs font-medium">{GOOGLE_SHEETS_OPERATIONS.find(op => op.id === operation)?.name}</p>
                <p className="text-xs text-muted-foreground">{GOOGLE_SHEETS_OPERATIONS.find(op => op.id === operation)?.tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <span className="text-muted-foreground">•</span>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  {isGoogleSheetsConnected && spreadsheetId && sheetName ? (
                    <CheckCircle className="h-3 w-3 text-primary" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span className="text-xs text-muted-foreground truncate">
                    {isGoogleSheetsConnected && spreadsheetId && sheetName
                      ? 'Ready'
                      : 'Setup required'
                    }
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">
                  {isGoogleSheetsConnected && spreadsheetId && sheetName
                    ? 'Google Sheets ready to use (OAuth)'
                    : 'Please authenticate and configure sheet details'
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
                  {isGoogleSheetsConnected ? '✅ OAuth' : '❌ No Auth'}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">
                  {isGoogleSheetsConnected
                    ? 'Connected via OAuth - Modern authentication'
                    : 'Authentication required - Connect your Google account above'
                  }
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[9px] px-1 py-0">
                  {spreadsheetId ? '📄 Sheet' : '❌ No Sheet'}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">
                  {spreadsheetId ? `Sheet ID: ${spreadsheetId.substring(0, 10)}...` : 'Google Sheet ID required'}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[9px] px-1 py-0">
                  {sheetName ? `📋 ${sheetName}` : '❌ No Tab'}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">
                  {sheetName ? `Sheet tab: ${sheetName}` : 'Sheet tab name required'}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {Object.keys(config).length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    ⚙️ Config
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Operation configuration completed</p>
                  <p className="text-xs text-muted-foreground">
                    {Object.keys(config).length} configuration option(s) set
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {variableMappings.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    🔗 {variableMappings.length} Vars
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Variable mappings configured</p>
                  <p className="text-xs text-muted-foreground">
                    {variableMappings.length} output variable(s) will be created
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      <GoogleSheetsOAuthStatus
        className="mt-3"
        onAuthSuccess={() => {
          refetchStatus();
        }}
        onDisconnect={() => {
          refetchStatus();
        }}
      />

      {isEditing && (
        <div className="mt-3 text-xs space-y-3 border border-border rounded p-2 bg-card">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Table className="h-3.5 w-3.5 text-primary" />
              <Label className="font-medium">Quick Templates</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">Pre-configured templates for common Google Sheets operations</p>
                    <p className="text-xs text-muted-foreground">Select a template to quickly set up your integration</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Select
              value={selectedTemplate}
              onValueChange={applyTemplate}
            >
              <SelectTrigger className="text-xs h-7">
                <SelectValue placeholder="Choose a template...">
                  {selectedTemplate ? GOOGLE_SHEETS_TEMPLATES.find(t => t.id === selectedTemplate)?.name : "Choose a template..."}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {GOOGLE_SHEETS_TEMPLATES.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{GOOGLE_SHEETS_OPERATIONS.find(op => op.id === template.operation)?.icon}</span>
                      <div>
                        <div className="font-medium">{template.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {GOOGLE_SHEETS_OPERATIONS.find(op => op.id === template.operation)?.description}
                        </div>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 pt-2 border-t">

            <div>
              <div className="flex items-center gap-2 mb-1">
                <Label className="font-medium">Google Sheet ID</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      <p className="text-xs font-medium">Google Sheets Document ID</p>
                      <p className="text-xs text-muted-foreground">
                        Found in the Google Sheets URL between '/d/' and '/edit'
                      </p>
                      <p className="text-xs text-primary mt-1">
                        Example: docs.google.com/spreadsheets/d/[SHEET_ID]/edit
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 ml-auto"
                  onClick={() => copyToClipboard(spreadsheetId, 'spreadsheetId')}
                  disabled={!spreadsheetId}
                >
                  {copiedField === 'spreadsheetId' ? (
                    <CheckCircle className="h-3 w-3 text-primary" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <VariablePicker
                    value={spreadsheetId}
                    onChange={(value) => {
                      setSpreadsheetId(value);
                      validateField('spreadsheetId', value, true);

                      if (selectedSheetId) {
                        setSelectedSheetId('');
                      }

                      setSelectedSheetName('');
                      setSheetName('');
                      setFetchedSheetNames([]);
                    }}
                    placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                    className={cn(
                      fieldValidation.spreadsheetId?.isValid === false ? "border-destructive" :
                      fieldValidation.spreadsheetId?.isValid === true ? "border-primary" : ""
                    )}
                  />
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2"
                        onClick={fetchGoogleSheets}
                        disabled={isFetchingSheets || !isGoogleSheetsConnected}
                        title="Fetch your Google Sheets"
                      >
                        {isFetchingSheets ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">
                        {!isGoogleSheetsConnected
                          ? 'Connect your Google account first'
                          : 'Fetch your Google Sheets'
                        }
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              {fieldValidation.spreadsheetId?.message && (
                <p className="text-[10px] text-destructive mt-1">
                  {fieldValidation.spreadsheetId.message}
                </p>
              )}

              {fetchedSheets.length > 0 && (
                <div className="mt-2">
                  <Label className="text-xs text-muted-foreground mb-1 block">Select from your sheets:</Label>
                  <Select
                    value={selectedSheetId}
                    onValueChange={(value) => {
                      const selectedSheet = fetchedSheets.find(sheet => sheet.id === value);
                      if (selectedSheet) {
                        setSelectedSheetId(value);
                        setSpreadsheetId(selectedSheet.id);
                        validateField('spreadsheetId', selectedSheet.id, true);

                        setSelectedSheetName('');
                        setSheetName('');
                        setFetchedSheetNames([]);
                      }
                    }}
                  >
                    <SelectTrigger className="text-xs h-7">
                      <SelectValue placeholder="Choose a sheet...">
                        {selectedSheetId ? fetchedSheets.find(sheet => sheet.id === selectedSheetId)?.name : "Choose a sheet..."}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {fetchedSheets.map((sheet) => (
                        <SelectItem key={sheet.id} value={sheet.id}>
                          <div className="flex items-center gap-2">
                            <img 
                              src="https://cdn.activepieces.com/pieces/google-sheets.png" 
                              alt="Google Sheets" 
                              className="w-3 h-3"
                            />
                            <div>
                              <div className="font-medium text-xs">{sheet.name}</div>
                              <div className="text-[10px] text-muted-foreground">{sheet.id}</div>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <Label className="font-medium">Sheet Name</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      <p className="text-xs font-medium">Sheet Tab Name</p>
                      <p className="text-xs text-muted-foreground">
                        The name of the specific sheet tab within your Google Sheets document
                      </p>
                      <p className="text-xs text-primary mt-1">
                        Default is usually "Sheet1" for new sheets
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <VariablePicker
                    value={sheetName}
                    onChange={(value) => {
                      setSheetName(value);

                      if (selectedSheetName) {
                        setSelectedSheetName('');
                      }
                    }}
                    placeholder="Sheet1"
                  />
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => fetchSheetNames()}
                        disabled={isFetchingSheetNames || !isGoogleSheetsConnected || !spreadsheetId.trim()}
                        title="Fetch sheet names"
                      >
                        {isFetchingSheetNames ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Search className="w-3 h-3" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">
                        {!isGoogleSheetsConnected
                          ? 'Connect your Google account first'
                          : !spreadsheetId.trim()
                          ? 'Enter Spreadsheet ID first'
                          : 'Fetch sheet names from this spreadsheet'
                        }
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {fetchedSheetNames.length > 0 && (
                <div className="mt-2">
                  <Label className="text-xs text-muted-foreground mb-1 block">Select sheet name:</Label>
                  <Select
                    value={selectedSheetName}
                    onValueChange={(value) => {
                      setSelectedSheetName(value);
                      setSheetName(value);
                    }}
                  >
                    <SelectTrigger className="text-xs h-7">
                      <SelectValue placeholder="Choose a sheet name...">
                        {selectedSheetName || "Choose a sheet name..."}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {fetchedSheetNames.map((name) => (
                        <SelectItem key={name} value={name}>
                          <div className="flex items-center gap-2">
                            <Table className="w-3 h-3 text-primary" />
                            <span className="text-xs">{name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 flex-1"
                    onClick={testConnection}
                    disabled={isTesting || !isGoogleSheetsConnected || !spreadsheetId.trim()}
                  >
                    {isTesting ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Play className="h-3 w-3 mr-1" />
                    )}
                    Test & Add Sample Data
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Test connection and add sample data</p>
                  <p className="text-xs text-muted-foreground">
                    {!isGoogleSheetsConnected || !spreadsheetId.trim()
                      ? 'Connect your Google account and enter Spreadsheet ID to enable testing'
                      : 'Verify your configuration and add test data to the sheet'
                    }
                  </p>
                  <p className="text-xs text-primary mt-1">
                    📊 Will add a sample row with contact information
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>


          </div>

          {showTestResult && testResult && (
            <div className={cn(
              "p-2 rounded border text-xs mt-2",
              testResult.success
                ? "bg-primary/10 border-primary/20 text-primary"
                : "bg-destructive/10 border-destructive/20 text-destructive"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  {testResult.success ? (
                    <CheckCircle className="h-3 w-3" />
                  ) : (
                    <XCircle className="h-3 w-3" />
                  )}
                  <span className="font-medium">
                    {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 hover:bg-transparent"
                  onClick={() => setShowTestResult(false)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="mt-1 whitespace-pre-line">{testResult.message}</div>
              {testResult.success && testResult.data?.sheets && (
                <div className="mt-2">
                  <p className="font-medium">Available sheets:</p>
                  <p className="text-muted-foreground">
                    {testResult.data.sheets.map((sheet: any) => sheet.properties.title).join(', ')}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2 pt-2 border-t">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Label className="font-medium">Google Sheets Operation</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">Choose the type of Google Sheets operation to perform</p>
                      <p className="text-xs text-muted-foreground">Each operation has different configuration options</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Select
                value={operation}
                onValueChange={(value) => {
                  setOperation(value);

                  if (selectedTemplate) {
                    setSelectedTemplate('');
                  }
                }}
              >
                <SelectTrigger className="text-xs h-7">
                  <SelectValue placeholder="Select operation" />
                </SelectTrigger>
                <SelectContent className="z-[9998]">
                  {GOOGLE_SHEETS_OPERATIONS.map((op) => (
                    <SelectItem key={op.id} value={op.id}>
                      <div className="flex items-center gap-2 w-full" title={`${op.name}: ${op.tooltip}`}>
                        <span className="text-sm">{op.icon}</span>
                        <div className="flex-1">
                          <div className={cn("font-medium", op.color)}>{op.name}</div>
                          <div className="text-[10px] text-muted-foreground">{op.description}</div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {OPERATION_CONFIG[operation as keyof typeof OPERATION_CONFIG] && (
            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <div className="flex items-center gap-2 pt-2 border-t">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                    {showAdvanced ? (
                      <ChevronDown className="h-3 w-3 mr-1" />
                    ) : (
                      <ChevronRight className="h-3 w-3 mr-1" />
                    )}
                    Operation Configuration
                  </Button>
                </CollapsibleTrigger>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">Configure specific options for the selected operation</p>
                      <p className="text-xs text-muted-foreground">Settings vary based on operation type</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <CollapsibleContent className="space-y-2">
                {OPERATION_CONFIG[operation as keyof typeof OPERATION_CONFIG].map((configField) => (
                  <div key={configField.key} className="p-2 rounded border border-border bg-card">
                    <div className="flex gap-2 items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-1 mb-1">
                          <Label className="text-[10px] font-medium">
                            {configField.label}
                            {configField.required && <span className="text-destructive ml-1">*</span>}
                          </Label>
                          {configField.tooltip && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <HelpCircle className="h-2.5 w-2.5 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p className="text-xs max-w-48">{configField.tooltip}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>

                        {configField.key === 'duplicateCheck' ? (
                          <DuplicatePreventionUI
                            value={config[configField.key] || {}}
                            onChange={(value) => updateConfig(configField.key, value)}
                          />
                        ) : configField.key === 'columnMappings' ? (
                          <ColumnMappingsUI
                            value={config[configField.key] || {}}
                            onChange={(value) => updateConfig(configField.key, value)}
                            placeholder={configField.placeholder}
                          />
                        ) : configField.type === 'object' ? (
                          <Textarea
                            value={typeof config[configField.key] === 'object'
                              ? JSON.stringify(config[configField.key], null, 2)
                              : config[configField.key] || ''
                            }
                            onChange={(e) => {
                              try {
                                const parsed = JSON.parse(e.target.value);
                                updateConfig(configField.key, parsed);
                              } catch {
                                updateConfig(configField.key, e.target.value);
                              }
                            }}
                            placeholder={configField.placeholder}
                            className="text-[10px] h-16 resize-none"
                          />
                        ) : configField.type === 'boolean' ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={config[configField.key] || configField.default || false}
                              onChange={(e) => updateConfig(configField.key, e.target.checked)}
                              className="h-3 w-3"
                            />
                            <span className="text-[10px] text-muted-foreground">
                              {configField.description}
                            </span>
                          </div>
                        ) : configField.type === 'number' ? (
                          <NumberInput
                            value={Number(config[configField.key]) || Number(configField.default) || 0}
                            onChange={(value) => updateConfig(configField.key, value)}
                            fallbackValue={Number(configField.default) || 0}
                            className="text-[10px] h-6"
                          />
                        ) : (
                          <VariablePicker
                            value={config[configField.key] || ''}
                            onChange={(value) => updateConfig(configField.key, value)}
                            placeholder={configField.placeholder}
                            className="text-[10px] h-6"
                          />
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 mt-4"
                        onClick={() => removeConfig(configField.key)}
                      >
                        <X className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          <div className="mt-3 p-2 bg-primary/10 border border-primary/20 rounded">
            <div className="flex items-center gap-1 mb-1">
              <span className="text-xs font-medium text-primary">💡 Quick Examples</span>
            </div>
            <div className="text-[10px] text-primary space-y-1">
              {operation === 'append_row' && (
                <>
                  <p>• Column mapping: {"{"}"Name": "{"{{contact.name}}"}", "Phone": "{"{{contact.phone}}"}", "Message": "{"{{message.content}}"}"{"}"}</p>
                  <p>• Use variables from conversation context</p>
                </>
              )}
              {operation === 'read_rows' && (
                <>
                  <p>• Filter by phone: filterColumn="Phone", filterValue="{"{{contact.phone}}"}"</p>
                  <p>• Limit results with maxRows for better performance</p>
                </>
              )}
              {operation === 'update_row' && (
                <>
                  <p>• Match by ID: matchColumn="Order ID", matchValue="{"{{order.id}}"}"</p>
                  <p>• Update specific columns: {"{"}"Status": "{"{{order.status}}"}", "Updated": "{"{{current.timestamp}}"}"{"}"}</p>
                </>
              )}
              {operation === 'get_sheet_info' && (
                <>
                  <p>• No configuration needed - returns sheet metadata</p>
                  <p>• Use to get column headers and sheet information</p>
                </>
              )}
            </div>
          </div>

          {/* Variables Available Section */}
          <div className="bg-primary/10 border border-primary/20 rounded-md p-2 mt-2">
            <div className="flex items-center gap-1 mb-1">
              <Variable className="w-3 h-3 text-primary" />
              <span className="text-xs font-medium text-primary">📊 Variables Available After Execution</span>
            </div>
            <div className="text-[10px] text-primary space-y-1">
              <p className="font-medium">Common Variables (all operations):</p>
              <p>• <code>{"{{google_sheets.success}}"}</code> - Operation success (true/false)</p>
              <p>• <code>{"{{google_sheets.data}}"}</code> - Complete response data</p>
              <p>• <code>{"{{google_sheets.lastExecution}}"}</code> - Execution timestamp</p>

              {operation === 'read_rows' && (
                <>
                  <p className="font-medium mt-2">Read Rows Variables:</p>
                  <p>• <code>{"{{google_sheets.rows}}"}</code> - Array of all row data</p>
                  <p>• <code>{"{{google_sheets.headers}}"}</code> - Column header names</p>
                  <p>• <code>{"{{google_sheets.totalRows}}"}</code> - Number of rows returned</p>
                  <p>• <code>{"{{google_sheets.row_1}}"}</code> - First row data (row_2, row_3, etc.)</p>
                  <p>• <code>{"{{google_sheets.column_Name}}"}</code> - All values from "Name" column</p>
                </>
              )}

              {operation === 'append_row' && (
                <>
                  <p className="font-medium mt-2">Append Row Variables:</p>
                  <p>• <code>{"{{google_sheets.appendedRange}}"}</code> - Cell range where data was added</p>
                  <p>• <code>{"{{google_sheets.rowsAdded}}"}</code> - Number of rows added</p>
                </>
              )}

              {operation === 'update_row' && (
                <>
                  <p className="font-medium mt-2">Update Row Variables:</p>
                  <p>• <code>{"{{google_sheets.matchingRows}}"}</code> - Number of rows found</p>
                  <p>• <code>{"{{google_sheets.updatedRows}}"}</code> - Number of rows updated</p>
                </>
              )}

              {operation === 'get_sheet_info' && (
                <>
                  <p className="font-medium mt-2">Sheet Info Variables:</p>
                  <p>• <code>{"{{google_sheets.headers}}"}</code> - Column header names</p>
                  <p>• <code>{"{{google_sheets.title}}"}</code> - Spreadsheet title</p>
                  <p>• <code>{"{{google_sheets.rowCount}}"}</code> - Total rows in sheet</p>
                  <p>• <code>{"{{google_sheets.columnCount}}"}</code> - Total columns in sheet</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



