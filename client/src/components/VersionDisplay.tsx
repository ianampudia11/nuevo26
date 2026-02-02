import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

interface VersionDisplayProps {
  className?: string;
  showIcon?: boolean;
  variant?: 'default' | 'secondary' | 'outline';
}

export function VersionDisplay({ 
  className = '', 
  showIcon = false,
  variant = 'default' 
}: VersionDisplayProps) {
  const { data: versionData, isLoading } = useQuery({
    queryKey: ['app-version'],
    queryFn: async () => {
      const response = await fetch('/api/auto-update/version');
      if (!response.ok) {
        throw new Error('Failed to fetch version');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className={`text-xs text-muted-foreground ${className}`}>
        Loading version...
      </div>
    );
  }

  const version = versionData?.version || '2.0.0';

  return (
    <div className={`flex items-center space-x-1 ${className}`}>
      <Badge variant={variant} className="text-xs text-primary-foreground">
         v{version}
      </Badge>
      {showIcon && (
        <Tooltip>
          <TooltipTrigger>
            <Info className="h-3 w-3 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent>
            <p>Application Version: {version}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export default VersionDisplay;
