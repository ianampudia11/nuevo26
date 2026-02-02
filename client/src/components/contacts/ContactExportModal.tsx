import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { 
  Download, 
  Calendar, 
  Tag, 
  Filter, 
  X, 
  Loader2,
  FileText,
  Users
} from 'lucide-react';

interface ContactExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFilters?: {
    search?: string;
    channel?: string;
  };
}

interface ExportFilters {
  tags: string[];
  createdAfter: string;
  createdBefore: string;
  search: string;
  channel: string;
  exportScope: 'all' | 'filtered';
}

export function ContactExportModal({ 
  isOpen, 
  onClose, 
  currentFilters = {} 
}: ContactExportModalProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);
  
  const [filters, setFilters] = useState<ExportFilters>({
    tags: [],
    createdAfter: '',
    createdBefore: '',
    search: currentFilters.search || '',
    channel: currentFilters.channel || '',
    exportScope: 'all'
  });


  const { data: availableTags = [], isLoading: isLoadingTags } = useQuery({
    queryKey: ['/api/contacts/tags'],
    queryFn: async () => {
      const response = await fetch('/api/contacts/tags');
      if (!response.ok) {
        throw new Error('Failed to fetch tags');
      }
      return response.json();
    },
    enabled: isOpen
  });


  useEffect(() => {
    if (isOpen) {
      setFilters({
        tags: [],
        createdAfter: '',
        createdBefore: '',
        search: currentFilters.search || '',
        channel: currentFilters.channel || '',
        exportScope: 'all'
      });
    }
  }, [isOpen, currentFilters]);

  const handleTagToggle = (tag: string) => {
    setFilters(prev => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag]
    }));
  };

  const handleRemoveTag = (tag: string) => {
    setFilters(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }));
  };

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      const exportData = {
        exportScope: filters.exportScope,
        tags: filters.tags.length > 0 ? filters.tags : undefined,
        createdAfter: filters.createdAfter || undefined,
        createdBefore: filters.createdBefore || undefined,
        search: filters.search || undefined,
        channel: filters.channel && filters.channel !== 'all' ? filters.channel : undefined
      };

      const response = await fetch('/api/contacts/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(exportData),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }


      const exportedCount = parseInt(response.headers.get('X-Exported-Count') || '0', 10);

      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
        : `contacts_export_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.csv`;


      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);


      if (exportedCount === 0) {
        toast({
          title: t('contacts.export.success_title', 'Export Completed'),
          description: t('contacts.export.no_contacts_message', 'Export completed but no contacts matched the selected filters.'),
          variant: 'default',
        });
      } else {
        toast({
          title: t('contacts.export.success_title', 'Export Successful'),
          description: t('contacts.export.success_message', 'Contacts have been exported successfully.'),
        });
      }

      onClose();
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: t('contacts.export.error_title', 'Export Failed'),
        description: t('contacts.export.error_message', 'Failed to export contacts. Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Download className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('contacts.export.title', 'Export Contacts')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 relative">
            <div className="space-y-4 sm:space-y-6 py-2 pr-2 sm:pr-4">
            {/* Export Scope */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                {t('contacts.export.scope', 'Export Scope')}
              </Label>
              <div className="space-y-3 sm:space-y-2">
                <div className="flex items-start sm:items-center space-x-2">
                  <Checkbox
                    id="scope-all"
                    checked={filters.exportScope === 'all'}
                    onCheckedChange={() => setFilters(prev => ({ ...prev, exportScope: 'all' }))}
                    className="mt-0.5 sm:mt-0"
                  />
                  <Label htmlFor="scope-all" className="text-sm leading-relaxed">
                    {t('contacts.export.all_contacts', 'All contacts')}
                  </Label>
                </div>
                <div className="flex items-start sm:items-center space-x-2">
                  <Checkbox
                    id="scope-filtered"
                    checked={filters.exportScope === 'filtered'}
                    onCheckedChange={() => setFilters(prev => ({ ...prev, exportScope: 'filtered' }))}
                    className="mt-0.5 sm:mt-0"
                  />
                  <Label htmlFor="scope-filtered" className="text-sm leading-relaxed">
                    {t('contacts.export.filtered_contacts', 'Apply filters below')}
                  </Label>
                </div>
              </div>
            </div>

            {filters.exportScope === 'filtered' && (
              <>
                <Separator className="my-4 sm:my-6" />

                {/* Tag Filter */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    {t('contacts.export.filter_by_tags', 'Filter by Tags')}
                  </Label>
                  
                  {/* Selected Tags */}
                  {filters.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 sm:gap-2 p-2 sm:p-3 bg-muted rounded-lg">
                      {filters.tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="flex items-center gap-1 text-xs sm:text-sm">
                          {tag}
                          <X
                            className="h-3 w-3 cursor-pointer hover:text-red-500"
                            onClick={() => handleRemoveTag(tag)}
                          />
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Available Tags */}
                  <div className="space-y-2">
                    {isLoadingTags ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('contacts.export.loading_tags', 'Loading tags...')}
                      </div>
                    ) : availableTags.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-32 sm:max-h-40 overflow-y-auto">
                        {availableTags.map((tag: string) => (
                          <div key={tag} className="flex items-center space-x-2">
                            <Checkbox
                              id={`tag-${tag}`}
                              checked={filters.tags.includes(tag)}
                              onCheckedChange={() => handleTagToggle(tag)}
                            />
                            <Label htmlFor={`tag-${tag}`} className="text-sm cursor-pointer truncate">
                              {tag}
                            </Label>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t('contacts.export.no_tags', 'No tags available')}
                      </p>
                    )}
                  </div>
                </div>

                <Separator className="my-4 sm:my-6" />

                {/* Date Range Filter */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {t('contacts.export.date_range', 'Date Range')}
                  </Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <Label htmlFor="created-after" className="text-xs text-muted-foreground block mb-1">
                        {t('contacts.export.created_after', 'Created After')}
                      </Label>
                      <Input
                        id="created-after"
                        type="date"
                        value={filters.createdAfter}
                        onChange={(e) => setFilters(prev => ({ ...prev, createdAfter: e.target.value }))}
                        className="text-sm w-full"
                      />
                    </div>
                    <div>
                      <Label htmlFor="created-before" className="text-xs text-muted-foreground block mb-1">
                        {t('contacts.export.created_before', 'Created Before')}
                      </Label>
                      <Input
                        id="created-before"
                        type="date"
                        value={filters.createdBefore}
                        onChange={(e) => setFilters(prev => ({ ...prev, createdBefore: e.target.value }))}
                        className="text-sm w-full"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Additional Filters */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    {t('contacts.export.additional_filters', 'Additional Filters')}
                  </Label>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="search-filter" className="text-xs text-muted-foreground block mb-1">
                        {t('contacts.export.search_filter', 'Search (Name, Email, Phone)')}
                      </Label>
                      <Input
                        id="search-filter"
                        value={filters.search}
                        onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                        placeholder={t('contacts.export.search_placeholder', 'Enter search term...')}
                        className="text-sm w-full"
                      />
                    </div>
                    <div>
                      <Label htmlFor="channel-filter" className="text-xs text-muted-foreground block mb-1">
                        {t('contacts.export.channel_filter', 'Channel Type')}
                      </Label>
                      <select
                        id="channel-filter"
                        value={filters.channel}
                        onChange={(e) => setFilters(prev => ({ ...prev, channel: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:ring-2 focus:ring-primary focus:border-transparent"
                      >
                        <option value="">{t('contacts.export.all_channels', 'All Channels')}</option>
                        <option value="whatsapp_official">{t('contacts.export.whatsapp_official', 'WhatsApp Official')}</option>
                        <option value="whatsapp_unofficial">{t('contacts.export.whatsapp_unofficial', 'WhatsApp Unofficial')}</option>
                        <option value="messenger">{t('contacts.export.messenger', 'Messenger')}</option>
                        <option value="instagram">{t('contacts.export.instagram', 'Instagram')}</option>
                        <option value="telegram">{t('contacts.export.telegram', 'Telegram')}</option>
                        <option value="email">{t('contacts.export.email', 'Email')}</option>
                      </select>
                    </div>
                  </div>
                </div>
              </>
            )}
            </div>
        </div>

        <DialogFooter className="flex-shrink-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 pt-4 border-t bg-background mt-4">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground order-2 sm:order-1">
            <FileText className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
            <span className="hidden sm:inline">{t('contacts.export.csv_format', 'CSV format with all contact fields')}</span>
            <span className="sm:hidden">{t('contacts.export.csv_format_short', 'CSV format')}</span>
          </div>
          <div className="flex gap-2 w-full sm:w-auto order-1 sm:order-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isExporting}
              className="flex-1 sm:flex-none text-sm"
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleExport}
              disabled={isExporting}
              className="flex-1 sm:flex-none text-sm"
            >
              {isExporting ? (
                <>
                  <Loader2 className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                  <span className="hidden sm:inline">{t('contacts.export.exporting', 'Exporting...')}</span>
                  <span className="sm:hidden">{t('contacts.export.exporting_short', 'Exporting...')}</span>
                </>
              ) : (
                <>
                  <Download className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">{t('contacts.export.export_button', 'Export Contacts')}</span>
                  <span className="sm:hidden">{t('contacts.export.export_button_short', 'Export')}</span>
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
