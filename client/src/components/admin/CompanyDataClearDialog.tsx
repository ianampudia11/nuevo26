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
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Loader2, 
  AlertTriangle, 
  Database, 
  Files, 
  MessageSquare, 
  Users, 
  Settings, 
  BarChart3,
  Mail,
  Trash2,
  Info
} from "lucide-react";
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';

interface DataCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  count: number;
  estimatedSize?: string;
  color: string;
  canClear: boolean;
  warning?: string;
}

interface CompanyDataPreview {
  companyId: number;
  companyName: string;
  dataCategories: DataCategory[];
  warnings: string[];
  totalEstimatedSize: string;
}

interface CompanyDataClearDialogProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: number | null;
  companyName: string;
  onSuccess: () => void;
}

export function CompanyDataClearDialog({
  isOpen,
  onClose,
  companyId,
  companyName,
  onSuccess
}: CompanyDataClearDialogProps) {
  const [step, setStep] = useState<'preview' | 'confirm' | 'final'>('preview');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [confirmationName, setConfirmationName] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    if (isOpen) {
      setStep('preview');
      setSelectedCategories([]);
      setConfirmationName('');
      setIsClearing(false);
    }
  }, [isOpen]);

  const { data: preview, isLoading: isLoadingPreview } = useQuery<CompanyDataPreview>({
    queryKey: [`/api/admin/companies/${companyId}/data-preview`],
    queryFn: async () => {
      if (!companyId) throw new Error('No company ID');
      const res = await apiRequest('GET', `/api/admin/companies/${companyId}/data-preview`);
      if (!res.ok) throw new Error('Failed to fetch data preview');
      return res.json();
    },
    enabled: isOpen && !!companyId
  });

  const clearDataMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error('No company ID');
      const res = await apiRequest('POST', `/api/admin/companies/${companyId}/clear-data`, {
        categories: selectedCategories,
        confirmationName
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to clear company data');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: t('admin.company_data_clear.messages.success_title', 'Data Cleared Successfully'),
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/companies'] });
      onSuccess();
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: t('admin.company_data_clear.messages.error_title', 'Data Clear Failed'),
        description: error.message,
        variant: "destructive",
      });
      setIsClearing(false);
    },
  });

  const handleClearData = () => {
    setIsClearing(true);
    clearDataMutation.mutate();
  };

  const handleClose = () => {
    if (!isClearing) {
      onClose();
    }
  };

  const handleCategoryToggle = (categoryId: string) => {
    setSelectedCategories(prev => 
      prev.includes(categoryId) 
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const selectAllCategories = () => {
    if (!preview) return;
    const clearableCategories = preview.dataCategories
      .filter(cat => cat.canClear && cat.count > 0)
      .map(cat => cat.id);
    setSelectedCategories(clearableCategories);
  };

  const deselectAllCategories = () => {
    setSelectedCategories([]);
  };

  const getSelectedCategoriesData = () => {
    if (!preview) return [];
    return preview.dataCategories.filter(cat => selectedCategories.includes(cat.id));
  };

  const renderDataCategories = () => {
    if (!preview) return null;

    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h4 className="font-medium">Select data types to clear:</h4>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={selectAllCategories}
            >
              Select All
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={deselectAllCategories}
            >
              Clear Selection
            </Button>
          </div>
        </div>

        <div className="grid gap-3">
          {preview.dataCategories.map((category) => {
            const Icon = category.icon;
            const isSelected = selectedCategories.includes(category.id);
            const canSelect = category.canClear && category.count > 0;

            return (
              <div
                key={category.id}
                className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors ${
                  canSelect 
                    ? isSelected 
                      ? 'bg-blue-50 border-blue-200 dark:bg-blue-900 dark:border-blue-700' 
                      : 'bg-gray-50 hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-800 cursor-pointer'
                    : 'bg-gray-25 border-gray-100 dark:bg-gray-800 dark:border-gray-700 opacity-60'
                }`}
                onClick={() => canSelect && handleCategoryToggle(category.id)}
              >
                <Checkbox
                  checked={isSelected}
                  disabled={!canSelect}
                  onChange={() => handleCategoryToggle(category.id)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-2">
                      <Icon className={`h-4 w-4 ${category.color}`} />
                      <span className="font-medium">{category.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {category.count.toLocaleString()}
                      </Badge>
                      {category.estimatedSize && (
                        <Badge variant="secondary" className="text-xs">
                          {category.estimatedSize}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">{category.description}</p>
                  {category.warning && (
                    <div className="flex items-start space-x-1 mt-2">
                      <AlertTriangle className="h-3 w-3 text-amber-500 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-amber-700 dark:text-amber-300">{category.warning}</p>
                    </div>
                  )}
                  {!canSelect && category.count === 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">No data to clear</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {selectedCategories.length > 0 && (
          <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertDescription className="text-blue-800 dark:text-blue-200">
              <strong>{selectedCategories.length}</strong> data type(s) selected for clearing.
              This will permanently remove the selected data from <strong>{companyName}</strong>.
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center text-orange-600 dark:text-orange-400">
            <Database className="h-5 w-5 mr-2" />
            {t('admin.company_data_clear.title', 'Clear Company Data')}: {companyName}
          </DialogTitle>
          <DialogDescription>
            {step === 'preview' && t('admin.company_data_clear.steps.preview_description', 'Select which data types to permanently clear')}
            {step === 'confirm' && t('admin.company_data_clear.steps.confirm_description', 'Confirm the data clearing by typing the company name')}
            {step === 'final' && t('admin.company_data_clear.steps.final_description', 'Final confirmation - this action cannot be undone')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {step === 'preview' && (
            <div className="space-y-4">
              <Alert className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
                <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                <AlertTitle className="text-orange-800 dark:text-orange-300">
                  {t('admin.company_data_clear.preview.warning_title', 'Warning: Selective Data Removal')}
                </AlertTitle>
                <AlertDescription className="text-orange-700 dark:text-orange-400">
                  {t('admin.company_data_clear.preview.warning_description', 'This will permanently delete the selected data types. This action cannot be undone.')}
                </AlertDescription>
              </Alert>

              {isLoadingPreview ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : preview ? (
                <div>
                  {renderDataCategories()}

                  {preview.warnings.length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-medium mb-2 text-orange-800 dark:text-orange-300">
                        {t('admin.company_data_clear.preview.warnings_title', 'Important Warnings')}:
                      </h4>
                      <ul className="space-y-1">
                        {preview.warnings.map((warning, index) => (
                          <li key={index} className="text-sm text-orange-700 dark:text-orange-400 flex items-start">
                            <AlertTriangle className="h-3 w-3 mr-2 mt-0.5 flex-shrink-0" />
                            {warning}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 text-orange-600 dark:text-orange-400">
                  {t('admin.company_data_clear.preview.load_error', 'Failed to load data preview')}
                </div>
              )}
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <Alert className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
                <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                <AlertTitle className="text-orange-800 dark:text-orange-300">
                  {t('admin.company_data_clear.confirm.title', 'Type Company Name to Continue')}
                </AlertTitle>
                <AlertDescription className="text-orange-700 dark:text-orange-400">
                  {t('admin.company_data_clear.confirm.description', 'To confirm data clearing, type the exact company name')}: <strong>{companyName}</strong>
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                  <h4 className="font-medium mb-3">Selected data types to clear:</h4>
                  <div className="grid gap-2">
                    {getSelectedCategoriesData().map((category) => {
                      const Icon = category.icon;
                      return (
                        <div key={category.id} className="flex items-center justify-between p-2 bg-card rounded border">
                          <div className="flex items-center space-x-2">
                            <Icon className={`h-4 w-4 ${category.color}`} />
                            <span className="font-medium">{category.name}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Badge variant="outline" className="text-xs">
                              {category.count.toLocaleString()} items
                            </Badge>
                            {category.estimatedSize && (
                              <Badge variant="secondary" className="text-xs">
                                {category.estimatedSize}
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmationName">
                    {t('admin.company_data_clear.confirm.label', 'Company Name')}
                  </Label>
                  <Input
                    id="confirmationName"
                    value={confirmationName}
                    onChange={(e) => setConfirmationName(e.target.value)}
                    placeholder={t('admin.company_data_clear.confirm.placeholder', 'Type "{{name}}" to confirm', { name: companyName })}
                    className="border-orange-300 focus:border-orange-500 dark:border-orange-700 dark:focus:border-orange-500"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 'final' && (
            <div className="space-y-4">
              <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <AlertTitle className="text-red-800 dark:text-red-300">
                  {t('admin.company_data_clear.final.title', 'Final Confirmation')}
                </AlertTitle>
                <AlertDescription className="text-red-700 dark:text-red-400">
                  {t('admin.company_data_clear.final.description', 'You are about to permanently clear selected data from {{name}}. This action is irreversible.', { name: companyName })}
                </AlertDescription>
              </Alert>

              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                <h4 className="font-medium mb-2">
                  {t('admin.company_data_clear.final.consequences_title', 'What will be cleared')}:
                </h4>
                <ul className="text-sm space-y-1 text-gray-700 dark:text-gray-300">
                  {getSelectedCategoriesData().map((category) => (
                    <li key={category.id} className="flex items-center space-x-2">
                      <Trash2 className="h-3 w-3 text-red-500" />
                      <span>
                        <strong>{category.name}</strong>: {category.count.toLocaleString()} items
                        {category.estimatedSize && ` (${category.estimatedSize})`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
                <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <AlertDescription className="text-amber-800 dark:text-amber-200">
                  <strong>Note:</strong> The company account and users will remain active. Only the selected data types will be cleared.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isClearing}
          >
            {t('common.cancel', 'Cancel')}
          </Button>

          <div className="flex space-x-2">
            {step === 'preview' && (
              <Button
                variant="default"
                onClick={() => setStep('confirm')}
                disabled={!preview || selectedCategories.length === 0}
                className="bg-orange-600 hover:bg-orange-700 dark:bg-orange-700 dark:hover:bg-orange-800 text-white"
              >
                {t('admin.company_data_clear.buttons.continue_to_confirmation', 'Continue to Confirmation')}
              </Button>
            )}

            {step === 'confirm' && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setStep('preview')}
                  disabled={isClearing}
                >
                  {t('common.back', 'Back')}
                </Button>
                <Button
                  variant="default"
                  onClick={() => setStep('final')}
                  disabled={confirmationName !== companyName}
                  className="bg-orange-600 hover:bg-orange-700 dark:bg-orange-700 dark:hover:bg-orange-800 text-white"
                >
                  {t('admin.company_data_clear.buttons.proceed_to_final', 'Proceed to Final Step')}
                </Button>
              </>
            )}

            {step === 'final' && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setStep('confirm')}
                  disabled={isClearing}
                >
                  {t('common.back', 'Back')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleClearData}
                  disabled={isClearing}
                  className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
                >
                  {isClearing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('admin.company_data_clear.buttons.clearing', 'Clearing Data...')}
                    </>
                  ) : (
                    <>
                      <Database className="mr-2 h-4 w-4" />
                      {t('admin.company_data_clear.buttons.clear_data', 'Clear Selected Data')}
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
