import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, X, LucideIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/use-translation';

interface DateRangeFilterProps {
  label: string;
  icon?: LucideIcon;
  dateRange: { from?: Date; to?: Date } | undefined;
  onChange: (range: { from?: Date; to?: Date } | undefined) => void;
  placeholder?: string;
}

const getPresets = (t: (key: string, fallback?: string) => string) => [
  {
    label: t('pipeline.overdue_preset', 'Overdue'),
    getRange: () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(23, 59, 59, 999);
      return { from: undefined, to: yesterday };
    },
  },
  {
    label: t('pipeline.due_today_preset', 'Due Today'),
    getRange: () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { from: today, to: tomorrow };
    },
  },
  {
    label: t('pipeline.due_this_week_preset', 'Due This Week'),
    getRange: () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(today);
      const daysUntilSunday = 7 - today.getDay();
      endOfWeek.setDate(today.getDate() + daysUntilSunday);
      endOfWeek.setHours(23, 59, 59, 999);
      return { from: today, to: endOfWeek };
    },
  },
  {
    label: t('pipeline.due_this_month_preset', 'Due This Month'),
    getRange: () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      monthEnd.setHours(23, 59, 59, 999);
      return { from: today, to: monthEnd };
    },
  },
];

export function DateRangeFilter({
  label,
  icon: Icon,
  dateRange,
  onChange,
  placeholder = 'Select date range...',
}: DateRangeFilterProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const presets = getPresets(t);

  const handlePreset = (preset: typeof presets[0]) => {
    const range = preset.getRange();
    onChange(range);
  };

  const handleClear = () => {
    onChange(undefined);
  };

  const displayText = dateRange?.from
    ? dateRange.to
      ? `${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d, yyyy')}`
      : format(dateRange.from, 'MMM d, yyyy')
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full justify-between text-left font-normal',
            dateRange && 'border-primary'
          )}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {Icon && <Icon className="h-4 w-4 flex-shrink-0" />}
            <span className="text-sm font-medium flex-shrink-0">{label}:</span>
            <span className="text-sm text-muted-foreground truncate">{displayText}</span>
          </div>
          <CalendarIcon className="h-4 w-4 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3 space-y-3">
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground px-2">{t('pipeline.quick_presets', 'Quick Presets')}</div>
            <div className="grid grid-cols-2 gap-2">
              {presets.map((preset) => (
                <Button
                  key={preset.label}
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePreset(preset)}
                  className="justify-start text-xs h-8"
                  aria-label={`Set date range to ${preset.label.toLowerCase()}`}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="border-t pt-3">
            <Calendar
              mode="range"
              selected={dateRange as any}
              onSelect={(range) => onChange(range)}
              numberOfMonths={2}
            />
          </div>
          {dateRange && (
            <div className="flex justify-end pt-2 border-t">
              <Button variant="ghost" size="sm" onClick={handleClear} className="h-7 text-xs">
                <X className="h-3 w-3 mr-1" />
                {t('common.clear', 'Clear')}
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
