import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, Trash2, Database, Files, MessageSquare, Users, Settings, CreditCard } from "lucide-react";
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';

interface CompanyDeletionPreview {
  companyId: number;
  companyName: string;
  dataToDelete: {
    users: number;
    contacts: number;
    conversations: number;
    messages: number;
    notes: number;
    channelConnections: number;
    flows: number;
    deals: number;
    pipelineStages: number;
    companySettings: number;
    paymentTransactions: number;
    teamInvitations: number;
    googleCalendarTokens: number;
    estimatedMediaFiles: number;
    estimatedWhatsappSessions: number;
  };
  warnings: string[];
}

interface CompanyDeletionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: number | null;
  companyName: string;
  onSuccess: () => void;
}

export function CompanyDeletionDialog({
  isOpen,
  onClose,
  companyId,
  companyName,
  onSuccess
}: CompanyDeletionDialogProps) {
  const [step, setStep] = useState<'preview' | 'confirm' | 'final'>('preview');
  const [confirmationName, setConfirmationName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    if (isOpen) {
      setStep('preview');
      setConfirmationName('');
      setIsDeleting(false);
    }
  }, [isOpen]);

  const { data: preview, isLoading: isLoadingPreview } = useQuery<CompanyDeletionPreview>({
    queryKey: [`/api/admin/companies/${companyId}/deletion-preview`],
    queryFn: async () => {
      if (!companyId) throw new Error('No company ID');
      const res = await apiRequest('GET', `/api/admin/companies/${companyId}/deletion-preview`);
      if (!res.ok) throw new Error('Failed to fetch deletion preview');
      return res.json();
    },
    enabled: isOpen && !!companyId
  });

  const deleteCompanyMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error('No company ID');
      const res = await apiRequest('DELETE', `/api/admin/companies/${companyId}`, {
        confirmationName
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete company');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: t('admin.company_deletion.messages.success_title', 'Company Deleted'),
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/companies'] });
      onSuccess();
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: t('admin.company_deletion.messages.error_title', 'Deletion Failed'),
        description: error.message,
        variant: "destructive",
      });
      setIsDeleting(false);
    },
  });

  const handleDelete = () => {
    setIsDeleting(true);
    deleteCompanyMutation.mutate();
  };

  const handleClose = () => {
    if (!isDeleting) {
      onClose();
    }
  };

  const renderDataSummary = () => {
    if (!preview) return null;

    const dataItems = [
      { icon: Users, label: t('admin.company_deletion.data_types.users', 'Users'), count: preview.dataToDelete.users, color: 'text-blue-600 dark:text-blue-400' },
      { icon: MessageSquare, label: t('admin.company_deletion.data_types.conversations', 'Conversations'), count: preview.dataToDelete.conversations, color: 'text-green-600 dark:text-green-400' },
      { icon: MessageSquare, label: t('admin.company_deletion.data_types.messages', 'Messages'), count: preview.dataToDelete.messages, color: 'text-green-500 dark:text-green-400' },
      { icon: Database, label: t('admin.company_deletion.data_types.contacts', 'Contacts'), count: preview.dataToDelete.contacts, color: 'text-purple-600 dark:text-purple-400' },
      { icon: Settings, label: t('admin.company_deletion.data_types.flows', 'Flows'), count: preview.dataToDelete.flows, color: 'text-orange-600 dark:text-orange-400' },
      { icon: Database, label: t('admin.company_deletion.data_types.deals', 'Deals'), count: preview.dataToDelete.deals, color: 'text-red-600 dark:text-red-400' },
      { icon: CreditCard, label: t('admin.company_deletion.data_types.payment_records', 'Payment Records'), count: preview.dataToDelete.paymentTransactions, color: 'text-yellow-600 dark:text-yellow-400' },
      { icon: Files, label: t('admin.company_deletion.data_types.media_files', 'Media Files'), count: preview.dataToDelete.estimatedMediaFiles, color: 'text-indigo-600 dark:text-indigo-400' },
      { icon: Settings, label: t('admin.company_deletion.data_types.whatsapp_sessions', 'WhatsApp Sessions'), count: preview.dataToDelete.estimatedWhatsappSessions, color: 'text-pink-600 dark:text-pink-400' },
    ];

    return (
      <div className="grid grid-cols-2 gap-3 mt-4">
        {dataItems.map(({ icon: Icon, label, count, color }) => (
          count > 0 && (
            <div key={label} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="flex items-center space-x-2">
                <Icon className={`h-4 w-4 ${color}`} />
                <span className="text-sm font-medium">{label}</span>
              </div>
              <Badge variant="outline" className="text-xs">
                {count.toLocaleString()}
              </Badge>
            </div>
          )
        ))}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center text-red-600 dark:text-red-400">
            <Trash2 className="h-5 w-5 mr-2" />
            {t('admin.company_deletion.title', 'Delete Company')}: {companyName}
          </DialogTitle>
          <DialogDescription>
            {step === 'preview' && t('admin.company_deletion.steps.preview_description', 'Review what will be permanently deleted')}
            {step === 'confirm' && t('admin.company_deletion.steps.confirm_description', 'Confirm the deletion by typing the company name')}
            {step === 'final' && t('admin.company_deletion.steps.final_description', 'Final confirmation - this action cannot be undone')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {step === 'preview' && (
            <div className="space-y-4">
              <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <AlertTitle className="text-red-800 dark:text-red-300">{t('admin.company_deletion.preview.warning_title', 'Warning: Irreversible Action')}</AlertTitle>
                <AlertDescription className="text-red-700 dark:text-red-400">
                  {t('admin.company_deletion.preview.warning_description', 'This will permanently delete the company and ALL associated data. This action cannot be undone.')}
                </AlertDescription>
              </Alert>

              {isLoadingPreview ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : preview ? (
                <div>
                  <h4 className="font-medium mb-3">{t('admin.company_deletion.preview.data_title', 'Data to be permanently deleted')}:</h4>
                  {renderDataSummary()}

                  {preview.warnings.length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-medium mb-2 text-red-800 dark:text-red-300">{t('admin.company_deletion.preview.warnings_title', 'Critical Warnings')}:</h4>
                      <ul className="space-y-1">
                        {preview.warnings.map((warning, index) => (
                          <li key={index} className="text-sm text-red-700 dark:text-red-400 flex items-start">
                            <AlertTriangle className="h-3 w-3 mr-2 mt-0.5 flex-shrink-0" />
                            {warning}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 text-red-600 dark:text-red-400">
                  {t('admin.company_deletion.preview.load_error', 'Failed to load deletion preview')}
                </div>
              )}
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <AlertTitle className="text-red-800 dark:text-red-300">{t('admin.company_deletion.confirm.title', 'Type Company Name to Continue')}</AlertTitle>
                <AlertDescription className="text-red-700 dark:text-red-400">
                  {t('admin.company_deletion.confirm.description', 'To confirm deletion, type the exact company name')}: <strong>{companyName}</strong>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="confirmationName">{t('admin.company_deletion.confirm.label', 'Company Name')}</Label>
                <Input
                  id="confirmationName"
                  value={confirmationName}
                  onChange={(e) => setConfirmationName(e.target.value)}
                  placeholder={t('admin.company_deletion.confirm.placeholder', 'Type "{{name}}" to confirm', { name: companyName })}
                  className="border-red-300 focus:border-red-500 dark:border-red-700 dark:focus:border-red-500"
                />
              </div>
            </div>
          )}

          {step === 'final' && (
            <div className="space-y-4">
              <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <AlertTitle className="text-red-800 dark:text-red-300">{t('admin.company_deletion.final.title', 'Final Confirmation')}</AlertTitle>
                <AlertDescription className="text-red-700 dark:text-red-400">
                  {t('admin.company_deletion.final.description', 'You are about to permanently delete {{name}} and all its data. This action is irreversible and will immediately remove all associated information.', { name: companyName })}
                </AlertDescription>
              </Alert>

              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                <h4 className="font-medium mb-2">{t('admin.company_deletion.final.consequences_title', 'What happens next')}:</h4>
                <ul className="text-sm space-y-1 text-gray-700 dark:text-gray-300">
                  <li>• {t('admin.company_deletion.final.consequence_users', 'All user accounts will be deleted')}</li>
                  <li>• {t('admin.company_deletion.final.consequence_conversations', 'All conversations and messages will be removed')}</li>
                  <li>• {t('admin.company_deletion.final.consequence_contacts', 'All contacts and their data will be deleted')}</li>
                  <li>• {t('admin.company_deletion.final.consequence_media', 'All media files will be permanently removed')}</li>
                  <li>• {t('admin.company_deletion.final.consequence_whatsapp', 'All WhatsApp sessions will be terminated')}</li>
                  <li>• {t('admin.company_deletion.final.consequence_payments', 'All payment records will be deleted')}</li>
                  <li>• {t('admin.company_deletion.final.consequence_company', 'The company will be completely removed from the system')}</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isDeleting}
          >
            {t('common.cancel', 'Cancel')}
          </Button>

          <div className="flex space-x-2">
            {step === 'preview' && (
              <Button
                variant="destructive"
                onClick={() => setStep('confirm')}
                disabled={!preview}
              >
                {t('admin.company_deletion.buttons.continue_to_confirmation', 'Continue to Confirmation')}
              </Button>
            )}

            {step === 'confirm' && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setStep('preview')}
                  disabled={isDeleting}
                >
                  {t('common.back', 'Back')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setStep('final')}
                  disabled={confirmationName !== companyName}
                >
                  {t('admin.company_deletion.buttons.proceed_to_final', 'Proceed to Final Step')}
                </Button>
              </>
            )}

            {step === 'final' && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setStep('confirm')}
                  disabled={isDeleting}
                >
                  {t('common.back', 'Back')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('admin.company_deletion.buttons.deleting', 'Deleting...')}
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('admin.company_deletion.buttons.delete_permanently', 'Delete Company Permanently')}
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
