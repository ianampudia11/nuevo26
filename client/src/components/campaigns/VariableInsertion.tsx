import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/hooks/use-translation';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { 
  Variable, 
  User, 
  Phone, 
  Mail, 
  Building, 
  Calendar,
  Tag,
  Hash,
  Type
} from 'lucide-react';

interface VariableOption {
  value: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: 'contact' | 'custom' | 'system';
}

interface VariableInsertionProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
  customVariables?: string[];
  className?: string;
}

const getDefaultVariables = (t: (key: string, fallback: string) => string): VariableOption[] => [
  {
    value: 'name',
    label: t('variables.contact_name', 'Contact Name'),
    description: t('variables.contact_name_desc', 'Full name of the contact'),
    icon: <User className="w-4 h-4" />,
    category: 'contact'
  },
  {
    value: 'phone',
    label: t('variables.phone_number', 'Phone Number'),
    description: t('variables.phone_number_desc', 'Contact phone number'),
    icon: <Phone className="w-4 h-4" />,
    category: 'contact'
  },
  {
    value: 'email',
    label: t('variables.email_address', 'Email Address'),
    description: t('variables.email_address_desc', 'Contact email address'),
    icon: <Mail className="w-4 h-4" />,
    category: 'contact'
  },
  {
    value: 'company',
    label: t('variables.company_name', 'Company Name'),
    description: t('variables.company_name_desc', 'Contact company or organization'),
    icon: <Building className="w-4 h-4" />,
    category: 'contact'
  },
  {
    value: 'date',
    label: t('variables.current_date', 'Current Date'),
    description: t('variables.current_date_desc', 'Today\'s date'),
    icon: <Calendar className="w-4 h-4" />,
    category: 'system'
  },
  {
    value: 'time',
    label: t('variables.current_time', 'Current Time'),
    description: t('variables.current_time_desc', 'Current time'),
    icon: <Calendar className="w-4 h-4" />,
    category: 'system'
  }
];

export function VariableInsertion({
  textareaRef,
  value,
  onChange,
  customVariables = [],
  className = ''
}: VariableInsertionProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const { t } = useTranslation();

  const allVariables: VariableOption[] = [
    ...getDefaultVariables(t),
    ...customVariables.map(variable => ({
      value: variable,
      label: variable.charAt(0).toUpperCase() + variable.slice(1),
      description: t('variables.custom_variable_desc', `Custom variable: ${variable}`, { variable }),
      icon: <Tag className="w-4 h-4" />,
      category: 'custom' as const
    }))
  ];

  const filteredVariables = allVariables.filter(variable =>
    variable.label.toLowerCase().includes(searchValue.toLowerCase()) ||
    variable.value.toLowerCase().includes(searchValue.toLowerCase()) ||
    variable.description.toLowerCase().includes(searchValue.toLowerCase())
  );

  const groupedVariables = filteredVariables.reduce((groups, variable) => {
    const category = variable.category;
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(variable);
    return groups;
  }, {} as Record<string, VariableOption[]>);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleSelectionChange = () => {
      setCursorPosition(textarea.selectionStart);
    };

    textarea.addEventListener('selectionchange', handleSelectionChange);
    textarea.addEventListener('click', handleSelectionChange);
    textarea.addEventListener('keyup', handleSelectionChange);

    return () => {
      textarea.removeEventListener('selectionchange', handleSelectionChange);
      textarea.removeEventListener('click', handleSelectionChange);
      textarea.removeEventListener('keyup', handleSelectionChange);
    };
  }, [textareaRef]);

  const insertVariable = (variableValue: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const variableText = `{{${variableValue}}}`;
    
    const newValue = value.substring(0, start) + variableText + value.substring(end);
    onChange(newValue);

    setTimeout(() => {
      const newCursorPosition = start + variableText.length;
      textarea.setSelectionRange(newCursorPosition, newCursorPosition);
      textarea.focus();
    }, 0);

    setOpen(false);
    setSearchValue('');
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === '{' && value.charAt(cursorPosition - 1) === '{') {
      setOpen(true);
    }
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleInput = () => {
      const cursorPos = textarea.selectionStart;
      const textBeforeCursor = value.substring(0, cursorPos);
      
      if (textBeforeCursor.endsWith('{{')) {
        setOpen(true);
      }
    };

    textarea.addEventListener('input', handleInput);
    return () => textarea.removeEventListener('input', handleInput);
  }, [value, textareaRef]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'contact': return <User className="w-4 h-4" />;
      case 'custom': return <Tag className="w-4 h-4" />;
      case 'system': return <Hash className="w-4 h-4" />;
      default: return <Type className="w-4 h-4" />;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'contact': return t('variables.category.contact', 'Contact Information');
      case 'custom': return t('variables.category.custom', 'Custom Variables');
      case 'system': return t('variables.category.system', 'System Variables');
      default: return t('variables.category.other', 'Other');
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <Variable className="w-4 h-4" />
            {t('variables.insert_variable', 'Insert Variable')}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command>
            <CommandInput
              placeholder={t('variables.search_placeholder', 'Search variables...')}
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <CommandList>
              <CommandEmpty>{t('variables.no_variables_found', 'No variables found.')}</CommandEmpty>
              
              {Object.entries(groupedVariables).map(([category, variables]) => (
                <CommandGroup 
                  key={category} 
                  heading={
                    <div className="flex items-center gap-2">
                      {getCategoryIcon(category)}
                      {getCategoryLabel(category)}
                    </div>
                  }
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
                          <div className="font-medium">{variable.label}</div>
                          <div className="text-sm text-muted-foreground">
                            {variable.description}
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-xs !bg-muted !text-muted-foreground">
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

      <div className="text-sm text-muted-foreground">
        {t('variables.help_text', 'Use variables like')} <Badge variant="outline" className="text-xs">{'{{name}}'}</Badge> {t('variables.for_personalization', 'for personalization')}
      </div>
    </div>
  );
}
