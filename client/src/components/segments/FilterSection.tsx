import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface FilterSectionProps {
  title: string;
  icon?: React.ReactNode;
  summary?: string;
  isActive?: boolean;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  color?: 'blue' | 'purple' | 'green' | 'orange';
}

const colorClasses = {
  blue: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900',
  purple: 'bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-900',
  green: 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900',
  orange: 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900',
};

const activeDotColors = {
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  green: 'bg-green-500',
  orange: 'bg-orange-500',
};

export function FilterSection({
  title,
  icon,
  summary,
  isActive = false,
  defaultExpanded = false,
  children,
  color = 'blue',
}: FilterSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className={cn('border rounded-lg transition-all duration-300', colorClasses[color])}>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <span className="font-medium text-sm">{title}</span>
          {isActive && !isExpanded && (
            <div className="flex items-center gap-1.5">
              <div className={cn('w-2 h-2 rounded-full', activeDotColors[color])} />
              <span className="text-xs text-muted-foreground">(Active)</span>
            </div>
          )}
        </div>
        {!isExpanded && summary && (
          <Badge variant="secondary" className="text-xs">
            {summary}
          </Badge>
        )}
      </button>
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 space-y-3 animate-in slide-in-from-top-2 duration-300">
          {children}
        </div>
      )}
    </div>
  );
}
