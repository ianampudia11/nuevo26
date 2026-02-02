import { PlusCircle, Search, Filter, FileSpreadsheet, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/use-translation';

interface EmptyPipelineStateProps {
  onAddDeal: () => void;
  onAddStage: () => void;
}

export function EmptyPipelineState({ onAddDeal, onAddStage }: EmptyPipelineStateProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center h-96 p-8 text-center bg-gradient-to-b from-muted to-background rounded-lg border-2 border-dashed border-border">
      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
        <PlusCircle className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-xl font-semibold text-foreground mb-2">{t('pipeline.welcome_to_pipeline', 'Welcome to your Pipeline!')}</h3>
      <p className="text-muted-foreground mb-6 max-w-md">
        {t('pipeline.get_started_message', 'Get started by creating your first pipeline stage, then add deals to track your sales opportunities.')}
      </p>
      <div className="flex gap-3">
        <Button onClick={onAddStage} className="flex items-center gap-2">
          <PlusCircle className="h-4 w-4" />
          {t('pipeline.create_first_stage_button', 'Create First Stage')}
        </Button>
        <Button variant="outline" onClick={onAddDeal} className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          {t('pipeline.add_deal_button', 'Add Deal')}
        </Button>
      </div>
    </div>
  );
}

interface EmptyDealsStateProps {
  onAddDeal: () => void;
  hasFilter: boolean;
  onClearFilters: () => void;
}

export function EmptyDealsState({ onAddDeal, hasFilter, onClearFilters }: EmptyDealsStateProps) {
  const { t } = useTranslation();
  if (hasFilter) {
    return (
      <div className="flex flex-col items-center justify-center h-64 p-6 text-center">
        <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
          <Search className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">{t('pipeline.no_deals_found', 'No deals found')}</h3>
        <p className="text-muted-foreground mb-4">
          {t('pipeline.try_adjusting_filters', "Try adjusting your search criteria or filters to find what you're looking for.")}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClearFilters} className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            {t('pipeline.clear_filters', 'Clear Filters')}
          </Button>
          <Button onClick={onAddDeal} className="flex items-center gap-2">
            <PlusCircle className="h-4 w-4" />
            {t('pipeline.add_deal_button', 'Add Deal')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-64 p-6 text-center">
      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
        <PlusCircle className="h-6 w-6 text-primary" />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2">{t('pipeline.no_deals_yet', 'No deals yet')}</h3>
      <p className="text-muted-foreground mb-4">
        {t('pipeline.start_building_message', 'Start building your pipeline by adding your first deal.')}
      </p>
      <Button onClick={onAddDeal} className="flex items-center gap-2">
        <PlusCircle className="h-4 w-4" />
        {t('pipeline.add_first_deal', 'Add Your First Deal')}
      </Button>
    </div>
  );
}

interface EmptyStageStateProps {
  stageName: string;
  onAddDeal: () => void;
}

export function EmptyStageState({ stageName, onAddDeal }: EmptyStageStateProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center h-32 p-4 text-center border-2 border-dashed border-border rounded-lg bg-muted">
      <div className="w-8 h-8 bg-muted-foreground/20 rounded-full flex items-center justify-center mb-2">
        <PlusCircle className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground mb-2">{t('pipeline.no_deals_in_stage', 'No deals in {{stageName}}', { stageName })}</p>
      <Button size="sm" variant="ghost" onClick={onAddDeal} className="text-xs">
        {t('pipeline.add_deal_button', 'Add Deal')}
      </Button>
    </div>
  );
}
