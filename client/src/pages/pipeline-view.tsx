import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Redirect } from 'wouter';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import KanbanBoard from '@/components/pipeline/KanbanBoard';
import AddDealModal from '@/components/pipeline/AddDealModal';
import PipelineSearchBar from '@/components/pipeline/PipelineSearchBar';
import PipelineSelector from '@/components/pipeline/PipelineSelector';
import { QuickFilters } from '@/components/pipeline/QuickFilters';
import { ActiveFilterChips } from '@/components/pipeline/ActiveFilterChips';
import { PipelineProvider, usePipeline } from '@/contexts/PipelineContext';
import ManagePipelinesModal from '@/components/pipeline/ManagePipelinesModal';
import PipelineErrorBoundary from '@/components/ErrorBoundary';

function PipelineViewContent() {
  const { activePipelineId, pipelines, setActivePipelineId, isLoading } = usePipeline();
  const [isAddDealModalOpen, setIsAddDealModalOpen] = useState(false);
  const [isManagePipelinesOpen, setIsManagePipelinesOpen] = useState(false);


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p' && !e.shiftKey) {
        e.preventDefault();

      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setIsManagePipelinesOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden font-sans text-foreground">
      <Header />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        
        <div className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 py-6">
            {/* Pipeline Header with Search */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-4 flex-shrink-0">
                <PipelineSelector
                  activePipelineId={activePipelineId}
                  pipelines={pipelines}
                  onPipelineChange={setActivePipelineId}
                  onManagePipelines={() => setIsManagePipelinesOpen(true)}
                  isLoading={isLoading}
                />
              </div>
              <div className="w-full sm:w-auto sm:flex-1 sm:max-w-none">
                <PipelineSearchBar />
              </div>
            </div>

            {/* Quick Filters */}
            <QuickFilters />

            {/* Active Filter Chips */}
            <ActiveFilterChips />

            <KanbanBoard
              onAddDeal={() => setIsAddDealModalOpen(true)}
              activePipelineId={activePipelineId}
            />
            
            <AddDealModal
              isOpen={isAddDealModalOpen}
              onClose={() => setIsAddDealModalOpen(false)}
              activePipelineId={activePipelineId}
            />

            <ManagePipelinesModal
              isOpen={isManagePipelinesOpen}
              onClose={() => setIsManagePipelinesOpen(false)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PipelineView() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/auth" />;
  }

  return (
    <PipelineProvider>
      <PipelineErrorBoundary>
        <PipelineViewContent />
      </PipelineErrorBoundary>
    </PipelineProvider>
  );
}