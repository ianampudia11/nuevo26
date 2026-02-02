import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Users, Loader2, CheckCircle, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { useLocation } from 'wouter';

interface CreateSegmentFromContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedContactIds: number[];
  onSegmentCreated: (segment: any) => void;
}

interface FormData {
  name: string;
  description: string;
}

interface SuccessState {
  isVisible: boolean;
  segmentName: string;
  segmentId: number;
}

export function CreateSegmentFromContactsModal({
  isOpen,
  onClose,
  selectedContactIds,
  onSegmentCreated
}: CreateSegmentFromContactsModalProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [successState, setSuccessState] = useState<SuccessState>({
    isVisible: false,
    segmentName: '',
    segmentId: 0
  });
  const { toast } = useToast();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const handleClose = () => {
    if (!isLoading) {
      setFormData({ name: '', description: '' });
      setSuccessState({ isVisible: false, segmentName: '', segmentId: 0 });
      onClose();
    }
  };

  const handleGoToCampaigns = () => {
    setLocation('/campaigns');
    handleClose();
  };

  const handleStayOnContacts = () => {
    toast({
      title: t('common.success', 'Success'),
      description: t('segments.create.success_with_count', 'Segment "{{name}}" created with {{count}} contacts', {
        name: successState.segmentName,
        count: selectedContactIds.length
      })
    });
    handleClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: t('common.error', 'Error'),
        description: t('segments.create.name_required', 'Please enter a segment name'),
        variant: 'destructive'
      });
      return;
    }

    if (selectedContactIds.length === 0) {
      toast({
        title: t('common.error', 'Error'),
        description: t('segments.create.no_contacts_selected', 'No contacts selected'),
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);
    try {

      const criteria = {
        contactIds: selectedContactIds
      };

      const response = await fetch('/api/campaigns/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          criteria
        })
      });

      const data = await response.json();
      if (data.success) {
        setSuccessState({
          isVisible: true,
          segmentName: formData.name,
          segmentId: data.data.id
        });
        onSegmentCreated(data.data);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error creating segment:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('segments.create.failed', 'Failed to create segment'),
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            {successState.isVisible
              ? t('segments.create_from_contacts.success_title', 'Segment Created Successfully!')
              : t('segments.create_from_contacts.title', 'Create Segment from Selected Contacts')
            }
          </DialogTitle>
        </DialogHeader>

        {successState.isVisible ? (

          <div className="space-y-6">
            <div className="text-center py-6">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {t('segments.create_from_contacts.success_message', 'Segment "{{name}}" created successfully!', {
                  name: successState.segmentName
                })}
              </h3>
              
            </div>

            <div className="flex justify-center gap-3">
              <Button
                variant="outline"
                onClick={handleStayOnContacts}
              >
                {t('segments.create_from_contacts.stay_on_contacts', 'Stay on Contacts')}
              </Button>
              <Button
                onClick={handleGoToCampaigns}
                className="flex items-center gap-2"
              >
                <ArrowRight className="w-4 h-4" />
                {t('segments.create_from_contacts.go_to_campaigns', 'Go to Campaigns')}
              </Button>
            </div>
          </div>
        ) : (

          <form onSubmit={handleSubmit} className="space-y-6">
          {/* Selected Contacts Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-blue-800">
              <CheckCircle className="w-4 h-4" />
              <span className="font-medium">
                {t('segments.create_from_contacts.selected_count', '{{count}} contacts selected', {
                  count: selectedContactIds.length
                })}
              </span>
            </div>
            <p className="text-sm text-blue-600 mt-1">
              {t('segments.create_from_contacts.selected_description', 'These contacts will be included in the new segment')}
            </p>
          </div>

          <Separator />

          {/* Form Fields */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">{t('segments.create.name_label', 'Segment Name')}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t('segments.create.name_placeholder', 'e.g., VIP Customers, New Leads')}
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <Label htmlFor="description">{t('segments.create.description_label', 'Description (Optional)')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('segments.create.description_placeholder', 'Describe this segment...')}
                rows={3}
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !formData.name.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('segments.create.creating', 'Creating...')}
                </>
              ) : (
                <>
                  <Users className="w-4 h-4 mr-2" />
                  {t('segments.create.create_segment', 'Create Segment')}
                </>
              )}
            </Button>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
