import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SegmentSummaryProps {
  totalContacts: number;
  excludedCount?: number;
  invalidCount?: number;
  className?: string;
}

export function SegmentSummary({
  totalContacts,
  excludedCount = 0,
  invalidCount = 0,
  className,
}: SegmentSummaryProps) {
  const effectiveContacts = totalContacts - excludedCount;

  return (
    <Card className={cn('border-2', className)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">{effectiveContacts}</span>
                <span className="text-muted-foreground">contacts</span>
              </div>
              <p className="text-sm text-muted-foreground">
                will receive this campaign
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {excludedCount > 0 && (
              <Badge variant="outline" className="flex items-center gap-1.5 text-orange-600 border-orange-200">
                <AlertCircle className="w-3 h-3" />
                {excludedCount} excluded
              </Badge>
            )}
            {invalidCount > 0 && (
              <Badge variant="outline" className="flex items-center gap-1.5 text-red-600 border-red-200">
                <AlertCircle className="w-3 h-3" />
                {invalidCount} invalid
              </Badge>
            )}
            {excludedCount === 0 && invalidCount === 0 && (
              <Badge variant="outline" className="flex items-center gap-1.5 text-green-600 border-green-200">
                <CheckCircle className="w-3 h-3" />
                All valid
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
