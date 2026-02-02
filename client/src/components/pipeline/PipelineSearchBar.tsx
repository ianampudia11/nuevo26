import { useState, useEffect, useRef } from 'react';
import { Search, X, Command, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDebounce } from '@/hooks/use-debounce';
import { usePipeline } from '@/contexts/PipelineContext';
import { useTranslation } from '@/hooks/use-translation';
import FilterBuilderModal from './FilterBuilderModal';

interface PipelineSearchBarProps {
  className?: string;
}

export default function PipelineSearchBar({ 
  className = '' 
}: PipelineSearchBarProps) {
  const { t } = useTranslation();
  const { filters, setFilters, activeFilterCount } = usePipeline();
  const [searchTerm, setSearchTerm] = useState(filters.searchTerm || '');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {

    if (filters.searchTerm !== debouncedSearchTerm) {
      setFilters(prev => ({ ...prev, searchTerm: debouncedSearchTerm }));
    }
  }, [debouncedSearchTerm, setFilters, filters.searchTerm]);

  useEffect(() => {
    if (filters.searchTerm !== searchTerm) {
      setSearchTerm(filters.searchTerm || '');
    }
  }, [filters.searchTerm]); // Remove searchTerm from deps to avoid circular updates

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
        event.preventDefault();
        inputRef.current?.focus();
      }

      if (event.key === 'Escape' && document.activeElement === inputRef.current) {
        setSearchTerm('');
        setFilters({ ...filters, searchTerm: '' });
        inputRef.current?.blur();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [filters, setFilters]);

  const handleClear = () => {
    setSearchTerm('');
    setFilters({ ...filters, searchTerm: '' });
    inputRef.current?.focus();
  };

  const handleClearAllFilters = () => {
    setFilters({});
    setSearchTerm('');
  };

  const showClearButton = searchTerm.length > 0;
  const hasFilters = activeFilterCount > 0;

  return (
    <>
      <div className={`relative flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full ${className}`}>
        <div className="relative flex-1 w-full sm:min-w-[200px] md:min-w-[300px] lg:min-w-[540px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            placeholder={t('pipeline.search_placeholder', 'Search deals, contacts, tags... (Ctrl+F)')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-12 h-9 text-sm border-border focus:border-ring focus:ring-1 focus:ring-ring w-full"
            title={t('pipeline.search_title', 'Search by deal title, contact name, phone, tags, description... (Ctrl+F)')}
          />
          
          <div className="absolute right-1 top-1/2 transform -translate-y-1/2">
            {showClearButton && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="h-7 w-7 p-0 hover:bg-accent"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFilterModalOpen(true)}
            className="h-9 gap-2 flex-1 sm:flex-initial"
          >
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline">{t('pipeline.filters', 'Filters')}</span>
            {hasFilters && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-xs">
                {activeFilterCount}
              </Badge>
            )}
          </Button>

          {hasFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAllFilters}
              className="h-9 flex-1 sm:flex-initial"
            >
              <span className="hidden sm:inline">{t('pipeline.clear_all', 'Clear All')}</span>
              <span className="sm:hidden">{t('pipeline.clear', 'Clear')}</span>
            </Button>
          )}
        </div>
      </div>

      <FilterBuilderModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
      />
    </>
  );
}
