import { Skeleton } from '@/components/ui/skeleton';

export function DealCardSkeleton() {
  return (
    <div className="bg-card border rounded-lg shadow-sm p-3 mb-3">
      {/* Header */}
      <div className="flex justify-between items-start gap-2 mb-2">
        <div className="flex-1">
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-6 w-20" />
        </div>
        <Skeleton className="h-3 w-3 rounded-full" />
      </div>
      
      {/* Description */}
      <Skeleton className="h-3 w-full mb-1" />
      <Skeleton className="h-3 w-2/3 mb-3" />
      
      {/* Contact section */}
      <div className="border-t border-border pt-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-6 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-3 w-24 mb-1" />
            <Skeleton className="h-2 w-16" />
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <div className="flex justify-between items-center mt-2 pt-2 border-t border-border">
        <div className="flex items-center gap-1">
          <Skeleton className="h-3 w-3" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  );
}

export function StageColumnSkeleton() {
  return (
    <div className="bg-muted rounded-lg p-4 min-h-[600px]">
      {/* Stage Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-8 rounded-full" />
        </div>
        <Skeleton className="h-4 w-4" />
      </div>
      
      {/* Stage Stats */}
      <div className="mb-4 p-3 bg-card rounded-lg border">
        <Skeleton className="h-4 w-20 mb-2" />
        <div className="space-y-1">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
      
      {/* Deal Cards */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <DealCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}

export function PipelineLoadingSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
      
      {/* Kanban Board skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <StageColumnSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}
