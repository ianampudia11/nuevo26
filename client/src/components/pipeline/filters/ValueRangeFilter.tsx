import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DollarSign, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/use-translation';

interface ValueRangeFilterProps {
  label: string;
  icon?: LucideIcon;
  minValue?: number;
  maxValue?: number;
  onChange: (min?: number, max?: number) => void;
  currencySymbol?: string;
}

export function ValueRangeFilter({
  label,
  icon: Icon,
  minValue,
  maxValue,
  onChange,
  currencySymbol = '$',
}: ValueRangeFilterProps) {
  const { t } = useTranslation();
  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value === '' ? undefined : parseFloat(e.target.value);
    if (value !== undefined && value < 0) return; // Prevent negative
    onChange(value, maxValue);
  };

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value === '' ? undefined : parseFloat(e.target.value);
    if (value !== undefined && value < 0) return; // Prevent negative
    onChange(minValue, value);
  };

  const hasError = minValue !== undefined && maxValue !== undefined && minValue > maxValue;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        <Label className="text-sm font-medium">{label}</Label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="min-value" className="text-xs text-muted-foreground">
            {t('pipeline.min', 'Min')}
          </Label>
          <div className="relative">
            <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground text-sm">
              {currencySymbol}
            </span>
            <Input
              id="min-value"
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              value={minValue ?? ''}
              onChange={handleMinChange}
              className={cn('pl-6', hasError && 'border-destructive')}
              aria-describedby={hasError ? 'min-value-error' : undefined}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="max-value" className="text-xs text-muted-foreground">
            {t('pipeline.max', 'Max')}
          </Label>
          <div className="relative">
            <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground text-sm">
              {currencySymbol}
            </span>
            <Input
              id="max-value"
              type="number"
              min="0"
              step="0.01"
              placeholder={t('pipeline.no_limit', 'No limit')}
              value={maxValue ?? ''}
              onChange={handleMaxChange}
              className={cn('pl-6', hasError && 'border-destructive')}
              aria-describedby={hasError ? 'max-value-error' : undefined}
            />
          </div>
        </div>
      </div>
      {hasError && (
        <p id="min-value-error" className="text-xs text-destructive" role="alert" aria-live="polite">
          {t('pipeline.min_greater_than_max', 'Minimum value cannot be greater than maximum')}
        </p>
      )}
    </div>
  );
}
