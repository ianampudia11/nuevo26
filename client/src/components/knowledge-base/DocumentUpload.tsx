import React, { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  FileText,
  File,
  X,
  CheckCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { ProcessorStatus } from './ProcessorStatus';

interface DocumentUploadProps {
  nodeId?: string;
  onUploadComplete?: (document: any) => void;
  maxFiles?: number;
  disabled?: boolean;
}

interface UploadingFile {
  id: string; // Unique identifier for tracking
  file: File;
  progress: number;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
  documentId?: number;
}

const ACCEPTED_FILE_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'text/plain': ['.txt']
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function DocumentUpload({ 
  nodeId, 
  onUploadComplete, 
  maxFiles = 10,
  disabled = false 
}: DocumentUploadProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('document', file);
      if (nodeId) {
        formData.append('nodeId', nodeId);
      }

      const response = await apiRequest('POST', '/api/knowledge-base/documents/upload', formData);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      return response.json();
    }
  });

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;

    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;


    if (uploadingFiles.length + files.length > maxFiles) {
      toast({
        title: t('knowledge_base.upload.too_many_files', 'Too many files'),
        description: t('knowledge_base.upload.max_files_exceeded', `Maximum ${maxFiles} files allowed`),
        variant: 'destructive'
      });
      return;
    }


    const validFiles: File[] = [];
    for (const file of files) {
      if (!Object.keys(ACCEPTED_FILE_TYPES).includes(file.type)) {
        toast({
          title: t('knowledge_base.upload.file_rejected', 'File rejected'),
          description: `${file.name}: ${t('knowledge_base.upload.invalid_type', 'File type not supported')}`,
          variant: 'destructive'
        });
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: t('knowledge_base.upload.file_rejected', 'File rejected'),
          description: `${file.name}: ${t('knowledge_base.upload.file_too_large', 'File is too large (max 50MB)')}`,
          variant: 'destructive'
        });
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) return;


    const newUploadingFiles: UploadingFile[] = validFiles.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Unique ID
      file,
      progress: 0,
      status: 'uploading'
    }));

    setUploadingFiles(prev => [...prev, ...newUploadingFiles]);


    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      const uploadId = newUploadingFiles[i].id;

      try {

        setUploadingFiles(prev => prev.map(f =>
          f.id === uploadId ? { ...f, progress: 10 } : f
        ));

        const result = await uploadMutation.mutateAsync(file);


        setUploadingFiles(prev => prev.map(f =>
          f.id === uploadId ? {
            ...f,
            progress: 50,
            status: 'processing',
            documentId: result.data.id
          } : f
        ));


        await pollProcessingStatus(result.data.id, uploadId);


        setUploadingFiles(prev => prev.map(f =>
          f.id === uploadId ? {
            ...f,
            progress: 100,
            status: 'completed'
          } : f
        ));


        if (onUploadComplete) {
          onUploadComplete(result.data);
        }


        toast({
          title: t('knowledge_base.upload.success', 'Upload successful'),
          description: t('knowledge_base.upload.file_processed', `${file.name} has been processed successfully`)
        });


        setTimeout(() => {
          setUploadingFiles(prev => prev.filter(f => f.id !== uploadId));
        }, 2000);

      } catch (error) {
        console.error('Upload error:', error);

        setUploadingFiles(prev => prev.map(f =>
          f.id === uploadId ? {
            ...f,
            status: 'error',
            error: error instanceof Error ? error.message : 'Upload failed'
          } : f
        ));

        toast({
          title: t('knowledge_base.upload.error', 'Upload failed'),
          description: error instanceof Error ? error.message : 'Unknown error occurred',
          variant: 'destructive'
        });
      }
    }


    event.target.value = '';


    queryClient.invalidateQueries({ queryKey: ['knowledge-base-documents'] });
  }, [uploadingFiles.length, maxFiles, disabled, nodeId, uploadMutation, onUploadComplete, toast, t, queryClient]);

  const pollProcessingStatus = async (documentId: number, uploadId: string): Promise<void> => {
    const maxAttempts = 60; // 5 minutes max
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await apiRequest('GET', `/api/knowledge-base/documents/${documentId}/status`);
        const result = await response.json();

        if (result.data.status === 'completed') {
          return;
        } else if (result.data.status === 'failed') {
          throw new Error(result.data.processingError || 'Processing failed');
        }


        const progress = result.data.status === 'processing' ? 75 : 50;
        setUploadingFiles(prev => prev.map(f =>
          f.id === uploadId ? { ...f, progress } : f
        ));


        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;

      } catch (error) {
        throw error;
      }
    }

    throw new Error('Processing timeout');
  };

  const removeUploadingFile = (uploadId: string) => {
    setUploadingFiles(prev => prev.filter(f => f.id !== uploadId));
  };

  const getFileIcon = (file: File) => {
    if (file.type === 'application/pdf') return <FileText className="w-4 h-4" />;
    return <File className="w-4 h-4" />;
  };

  const getStatusIcon = (status: UploadingFile['status']) => {
    switch (status) {
      case 'uploading':
      case 'processing':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusBadge = (status: UploadingFile['status']) => {
    switch (status) {
      case 'uploading':
        return <Badge variant="secondary">{t('knowledge_base.status.uploading', 'Uploading')}</Badge>;
      case 'processing':
        return <Badge variant="secondary">{t('knowledge_base.status.processing', 'Processing')}</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-green-100 text-green-800">{t('knowledge_base.status.completed', 'Completed')}</Badge>;
      case 'error':
        return <Badge variant="destructive">{t('knowledge_base.status.error', 'Error')}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Processor Status */}
      <ProcessorStatus compact={true} showInstallInstructions={false} />

      {/* Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            {t('knowledge_base.upload.title', 'Upload Documents')}
          </CardTitle>
          <CardDescription>
            {t('knowledge_base.upload.description', 'Upload PDF, Word documents, or text files to enhance your AI assistant with knowledge base capabilities.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <div className="space-y-2">
                <p className="text-gray-600 mb-2">
                  {t('knowledge_base.upload.select_files', 'Select files to upload')}
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  {t('knowledge_base.upload.supported_formats', 'Supports PDF, Word documents, and text files (max 50MB each)')}
                </p>
                <Button
                  variant="outline"
                  disabled={disabled}
                  onClick={() => document.getElementById('file-upload-input')?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {t('knowledge_base.upload.choose_files', 'Choose Files')}
                </Button>
                <input
                  id="file-upload-input"
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={disabled}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Uploading Files */}
      {uploadingFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {t('knowledge_base.upload.uploading_files', 'Uploading Files')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {uploadingFiles.map((uploadingFile) => (
              <div key={uploadingFile.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {getFileIcon(uploadingFile.file)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {uploadingFile.file.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {(uploadingFile.file.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {getStatusIcon(uploadingFile.status)}
                    {getStatusBadge(uploadingFile.status)}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeUploadingFile(uploadingFile.id)}
                      className="h-8 w-8 p-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Progress bar on separate row */}
                {uploadingFile.status !== 'completed' && uploadingFile.status !== 'error' && (
                  <div className="w-full">
                    <Progress value={uploadingFile.progress} className="h-2" />
                  </div>
                )}

                {uploadingFile.error && (
                  <div className="w-full p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
                    {uploadingFile.error}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
