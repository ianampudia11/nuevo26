import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Download, 
  Upload, 
  FileSpreadsheet, 
  AlertCircle, 
  CheckCircle,
  X,
  Info,
  Loader2,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStageFilter?: number | null;
}

interface ImportResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; error: string; data: any }>;
}

export default function ImportExportModal({ 
  isOpen, 
  onClose, 
  currentStageFilter 
}: ImportExportModalProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [mode, setMode] = useState<'export' | 'import' | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);


  const exportMutation = useMutation({
    mutationFn: async (format: 'csv' | 'excel' | 'json') => {
      const params = new URLSearchParams();
      if (currentStageFilter) {
        params.append('stageId', currentStageFilter.toString());
      }
      
      const response = await apiRequest('GET', `/api/deals/export?format=${format}&${params.toString()}`);
      
      if (format === 'json') {
        const data = await response.json();
        return { data, format };
      } else {
        const blob = await response.blob();
        return { blob, format };
      }
    },
    onSuccess: ({ blob, data, format }) => {
      if (format === 'json') {

        const jsonString = JSON.stringify(data, null, 2);
        const jsonBlob = new Blob([jsonString], { type: 'application/json' });
        const url = window.URL.createObjectURL(jsonBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `deals_export_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `deals_export_${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'xlsx' : 'csv'}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
      
      toast({
        title: t('common.success', 'Success'),
        description: t('pipeline.export_success', 'Deals exported successfully'),
      });
      
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.export_failed', 'Failed to export deals: {{error}}', { error: error.message }),
        variant: 'destructive',
      });
    },
  });


  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await apiRequest('POST', '/api/deals/import', formData);
      
      return response.json();
    },
    onSuccess: (result: ImportResult) => {
      setImportResult(result);
      setIsProcessing(false);
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
      
      if (result.success > 0) {
        toast({
          title: t('common.success', 'Success'),
          description: t('pipeline.import_success', `${result.success} deals imported successfully`),
        });
      }
      
      if (result.failed > 0) {
        toast({
          title: t('common.warning', 'Warning'),
          description: t('pipeline.import_partial', `${result.failed} deals failed to import`),
          variant: 'destructive',
        });
      }
    },
    onError: (error: Error) => {
      setIsProcessing(false);
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.import_failed', 'Failed to import deals: {{error}}', { error: error.message }),
        variant: 'destructive',
      });
    },
  });

  const handleExport = (format: 'csv' | 'excel' | 'json') => {
    exportMutation.mutate(format);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const processFile = (file: File) => {

    const validTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/json'
    ];
    
    const isValidFile = validTypes.includes(file.type) || 
                       file.name.endsWith('.csv') || 
                       file.name.endsWith('.json');
    
    if (!isValidFile) {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.invalid_file_type', 'Please upload a CSV, Excel, or JSON file'),
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    setImportProgress(0);
    

    const progressInterval = setInterval(() => {
      setImportProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return prev;
        }
        return prev + 10;
      });
    }, 200);

    importMutation.mutate(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  };

  const downloadTemplate = (format: 'csv' | 'json' = 'csv') => {
    if (format === 'json') {
      const jsonTemplate = [
        {
          title: "Sample Deal",
          description: "Deal description",
          value: 5000,
          priority: "high",
          contactId: null,
          contactName: "John Doe",
          contactEmail: "john@example.com",
          contactPhone: "+1234567890",
          assignedToUserId: null,
          assignedToEmail: "user@company.com",
          tags: ["tag1", "tag2"],
          stageId: null,
          stage: "Prospecting"
        }
      ];
      
      const jsonString = JSON.stringify(jsonTemplate, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'deals_import_template.json';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } else {
      const csvContent = `title,description,value,priority,contactId,contactName,contactEmail,contactPhone,assignedToUserId,assignedToEmail,tags,stageId,stage\n"Sample Deal","Deal description",5000,high,,"John Doe","john@example.com","+1234567890",,"user@company.com","tag1,tag2",,"Prospecting"`;
      
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'deals_import_template.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
  };

  const resetModal = () => {
    setMode(null);
    setImportResult(null);
    setImportProgress(0);
    setIsProcessing(false);
    setIsDragOver(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'export' ? t('pipeline.export_deals', 'Export Deals') : mode === 'import' ? t('pipeline.import_deals', 'Import Deals') : t('pipeline.import_export_deals', 'Import / Export Deals')}
          </DialogTitle>
          <DialogDescription>
            {mode === 'export' 
              ? t('pipeline.download_deals_data', 'Download your deals data in CSV, Excel, or JSON format')
              : mode === 'import' 
              ? t('pipeline.upload_file_to_import', 'Upload a CSV, Excel, or JSON file to import deals')
              : t('pipeline.choose_import_export', 'Choose whether to import or export deals data')
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {!mode && (
            <div className="grid grid-cols-2 gap-4">
              <Button
                variant="outline"
                className="h-24 flex flex-col gap-2"
                onClick={() => setMode('export')}
              >
                <Download className="h-6 w-6" />
                <span>{t('pipeline.export_deals', 'Export Deals')}</span>
              </Button>
              <Button
                variant="outline"
                className="h-24 flex flex-col gap-2"
                onClick={() => setMode('import')}
              >
                <Upload className="h-6 w-6" />
                <span>{t('pipeline.import_deals', 'Import Deals')}</span>
              </Button>
            </div>
          )}

          {mode === 'export' && (
            <div className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  {currentStageFilter 
                    ? t('pipeline.exporting_from_stage', 'Exporting deals from the current filtered stage only.')
                    : t('pipeline.exporting_all_deals', 'Exporting all deals from your pipeline.')
                  }
                </AlertDescription>
              </Alert>
              
              <div className="grid grid-cols-3 gap-4">
                <Button
                  variant="outline"
                  onClick={() => handleExport('csv')}
                  disabled={exportMutation.isPending}
                  className="h-16 flex flex-col gap-2"
                >
                  {exportMutation.isPending ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-6 w-6" />
                  )}
                  <span>{t('pipeline.export_as_csv', 'Export as CSV')}</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleExport('excel')}
                  disabled={exportMutation.isPending}
                  className="h-16 flex flex-col gap-2"
                >
                  {exportMutation.isPending ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-6 w-6" />
                  )}
                  <span>{t('pipeline.export_as_excel', 'Export as Excel')}</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleExport('json')}
                  disabled={exportMutation.isPending}
                  className="h-16 flex flex-col gap-2"
                >
                  {exportMutation.isPending ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <FileText className="h-6 w-6" />
                  )}
                  <span>{t('pipeline.export_as_json', 'Export as JSON')}</span>
                </Button>
              </div>
            </div>
          )}

          {mode === 'import' && (
            <div className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  {t('pipeline.upload_file_description', 'Upload a CSV, Excel, or JSON file with deal data. Make sure your file includes the required fields.')}
                </AlertDescription>
              </Alert>

              <div className="text-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="mb-4">
                      <Download className="h-4 w-4 mr-2" />
                      {t('pipeline.download_template', 'Download Template')}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => downloadTemplate('csv')}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      {t('pipeline.csv_template', 'CSV Template')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => downloadTemplate('json')}>
                      <FileText className="h-4 w-4 mr-2" />
                      {t('pipeline.json_template', 'JSON Template')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div 
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors relative ${
                  isDragOver 
                    ? 'border-primary bg-primary/10' 
                    : 'border-border hover:border-border/80'
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <div className="space-y-2">
                  <p className="text-sm text-foreground">
                    {t('pipeline.click_to_upload', 'Click to upload or drag and drop your file here')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('pipeline.supports_file_formats', 'Supports CSV, Excel, and JSON files (max 10MB)')}
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.json"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {isProcessing && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{t('pipeline.processing_file', 'Processing file...')}</span>
                    <span>{importProgress}%</span>
                  </div>
                  <Progress value={importProgress} />
                </div>
              )}

              {importResult && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="font-medium text-green-800">{importResult.success}</p>
                        <p className="text-sm text-green-600">{t('pipeline.imported', 'Imported')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <AlertCircle className="h-5 w-5 text-red-600" />
                      <div>
                        <p className="font-medium text-red-800">{importResult.failed}</p>
                        <p className="text-sm text-red-600">{t('pipeline.failed', 'Failed')}</p>
                      </div>
                    </div>
                  </div>

                  {importResult.errors.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">{t('pipeline.import_errors', 'Import Errors:')}</h4>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {importResult.errors.slice(0, 5).map((error, index) => (
                          <div key={index} className="text-xs p-2 bg-red-50 border border-red-200 rounded">
                            <span className="font-medium">{t('pipeline.row', 'Row')} {error.row}:</span> {error.error}
                          </div>
                        ))}
                        {importResult.errors.length > 5 && (
                          <p className="text-xs text-muted-foreground">
                            +{importResult.errors.length - 5} {t('pipeline.more_errors', 'more errors')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {mode && (
            <Button variant="outline" onClick={resetModal}>
              {t('pipeline.back', 'Back')}
            </Button>
          )}
          <Button variant="outline" onClick={handleClose}>
            {importResult ? t('pipeline.done', 'Done') : t('common.cancel', 'Cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
