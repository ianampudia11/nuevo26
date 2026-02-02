import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Check, ChevronDown, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/use-translation';

interface MultiSelectFilterProps<T extends string | number> {
  options: Array<{ value: T; label: string }>;
  selected: T[];
  onChange: (selected: T[]) => void;
  label: string;
  icon?: LucideIcon;
  placeholder?: string;
  searchable?: boolean;
}

export function MultiSelectFilter<T extends string | number>({
  options,
  selected,
  onChange,
  label,
  icon: Icon,
  placeholder = 'Select options...',
  searchable = true,
}: MultiSelectFilterProps<T>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredOptions = searchable
    ? options.filter(opt => opt.label.toLowerCase().includes(searchTerm.toLowerCase()))
    : options;

  const handleToggle = (value: T) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const handleSelectAll = () => {
    if (selected.length === filteredOptions.length) {
      onChange([]);
    } else {
      onChange(filteredOptions.map(opt => opt.value));
    }
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const selectedLabels = options
    .filter(opt => selected.includes(opt.value))
    .map(opt => opt.label);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-expanded={open}
          aria-haspopup="listbox"
          role="combobox"
          className={cn(
            'w-full justify-between text-left font-normal',
            selected.length > 0 && 'border-primary'
          )}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {Icon && <Icon className="h-4 w-4 flex-shrink-0" />}
            <span className="text-sm font-medium flex-shrink-0">{label}:</span>
            <span className="text-sm text-muted-foreground truncate">
              {selected.length === 0
                ? placeholder
                : selected.length === 1
                ? selectedLabels[0]
                : t('pipeline.selected', '{{count}} selected', { count: selected.length })}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <div className="p-2 space-y-2">
          {searchable && (
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('pipeline.search', 'Search...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8"
              />
            </div>
          )}
          <div className="flex items-center justify-between px-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              className="h-7 text-xs"
            >
              {selected.length === filteredOptions.length ? t('pipeline.deselect_all', 'Deselect All') : t('pipeline.select_all', 'Select All')}
            </Button>
            {selected.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="h-7 text-xs"
              >
                {t('common.clear', 'Clear')}
              </Button>
            )}
          </div>
          <div className="max-h-[300px] overflow-y-auto space-y-1">
            {filteredOptions.length === 0 ? (
              <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                {t('pipeline.no_options_found', 'No options found')}
              </div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = selected.includes(option.value);
                return (
                  <div
                    key={String(option.value)}
                    role="option"
                    aria-selected={isSelected}
                    className="flex items-center space-x-2 px-2 py-1.5 hover:bg-accent rounded cursor-pointer"
                    onClick={() => handleToggle(option.value)}
                  >
                    <Checkbox checked={isSelected} />
                    <span className="text-sm flex-1">{option.label}</span>
                    {isSelected && <Check className="h-4 w-4 text-primary" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
