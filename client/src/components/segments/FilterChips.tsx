import React from 'react';
import { Badge } from '@/components/ui/badge';
import { X, Calendar, Tag, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterChip {
  id: string;
  label: string;
  type: 'date' | 'tag' | 'pipeline';
  onRemove: () => void;
}

interface FilterChipsProps {
  filters: FilterChip[];
  className?: string;
}

const typeIcons = {
  date: Calendar,
  tag: Tag,
  pipeline: Target,
};

const typeColors = {
  date: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-900',
  tag: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-900',
  pipeline: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-900',
};

export function FilterChips({ filters, className }: FilterChipsProps) {
  if (filters.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {filters.map((filter) => {
        const Icon = typeIcons[filter.type];
        return (
          <Badge
            key={filter.id}
            variant="outline"
            className={cn(
              'flex items-center gap-1.5 pr-1 transition-all hover:shadow-sm',
              typeColors[filter.type]
            )}
          >
            <Icon className="w-3 h-3" />
            <span className="text-xs font-medium">{filter.label}</span>
            <button
              type="button"
              onClick={filter.onRemove}
              className="ml-1 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        );
      })}
    </div>
  );
}
