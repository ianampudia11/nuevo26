import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { UserPlus, Users, Loader2, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';

interface Segment {
  id: number;
  name: string;
  criteria: {
    contactIds?: number[];
    [key: string]: any;
  };
}

interface AddToExistingSegmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedContactIds: number[];
  onContactsAdded: (segmentName: string, contactCount: number) => void;
}

export function AddToExistingSegmentModal({
  isOpen,
  onClose,
  selectedContactIds,
  onContactsAdded,
}: AddToExistingSegmentModalProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchSegments();
      setSelectedSegmentId('');
    }
  }, [isOpen]);

  const fetchSegments = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/campaigns/segments');
      if (!response.ok) {
        throw new Error('Failed to fetch segments');
      }
      const result = await response.json();
      const segments = result.data || [];
      const manualSegments = segments.filter(
        (segment: Segment) => segment.criteria?.contactIds && Array.isArray(segment.criteria.contactIds)
      );
      setSegments(manualSegments);
    } catch (error) {
      console.error('Error fetching segments:', error);
      toast({
        title: t('segments.add_to_existing.error'),
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddToSegment = async () => {
    if (!selectedSegmentId) {
      toast({
        title: t('segments.add_to_existing.error'),
        description: 'Please select a segment',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const segmentResponse = await fetch(`/api/campaigns/segments/${selectedSegmentId}`);
      if (!segmentResponse.ok) {
        throw new Error('Failed to fetch segment details');
      }
      const segment: Segment = await segmentResponse.json();

      const existingContactIds = segment.criteria?.contactIds || [];
      const mergedContactIds = Array.from(
        new Set([...existingContactIds, ...selectedContactIds])
      );

      const updatedSegment = {
        ...segment,
        criteria: {
          ...segment.criteria,
          contactIds: mergedContactIds,
        },
      };

      const updateResponse = await fetch(`/api/campaigns/segments/${selectedSegmentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedSegment),
      });

      if (!updateResponse.ok) {
        throw new Error('Failed to update segment');
      }

      const addedCount = mergedContactIds.length - existingContactIds.length;
      
      toast({
        title: t('common.success', 'Success'),
        description: t('segments.add_to_existing.success', 'Added {{count}} contact(s) to segment "{{name}}"', { count: addedCount.toString(), name: segment.name }),
      });

      onContactsAdded(segment.name, addedCount);
      onClose();
    } catch (error) {
      console.error('Error adding contacts to segment:', error);
      toast({
        title: t('segments.add_to_existing.error'),
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {t('segments.add_to_existing.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
            <Users className="h-4 w-4" />
            <span>{t('segments.add_to_existing.selected_count', undefined, { count: selectedContactIds.length.toString() })}</span>
          </div>

          <Separator />

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : segments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-sm text-gray-600">
                {t('segments.add_to_existing.no_segments')}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="segment-select">{t('segments.add_to_existing.select_label')}</Label>
              <Select value={selectedSegmentId} onValueChange={setSelectedSegmentId}>
                <SelectTrigger id="segment-select">
                  <SelectValue placeholder={t('segments.add_to_existing.select_placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {segments.map((segment) => (
                    <SelectItem key={segment.id} value={segment.id.toString()}>
                      <div className="flex items-center justify-between gap-2">
                        <span>{segment.name}</span>
                        <span className="text-xs text-gray-500">
                          ({segment.criteria.contactIds?.length || 0} contacts)
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleAddToSegment}
            disabled={!selectedSegmentId || isSubmitting || segments.length === 0}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                {t('segments.add_to_existing.button')}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
