import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogPortal,
  DialogClose,
} from '@/components/ui/dialog';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  FileText,
  File,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  Download,
  Eye,
  ExternalLink,
  X,
  Upload
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Document {
  id: number;
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  chunkCount: number;
  processingError?: string;
  processingDurationMs?: number;
  createdAt: string;
  updatedAt: string;
}

interface DocumentListProps {
  nodeId?: string;
  showNodeFilter?: boolean;
  onDocumentSelect?: (document: Document) => void;
  onUploadClick?: () => void; // Callback to trigger upload
}

export function DocumentList({
  nodeId,
  showNodeFilter = false,
  onDocumentSelect,
  onUploadClick
}: DocumentListProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDocuments, setSelectedDocuments] = useState<number[]>([]);
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);


  const { data: documents, isLoading, error, refetch } = useQuery({
    queryKey: ['knowledge-base-documents', nodeId],
    queryFn: async () => {
      const url = nodeId
        ? `/api/knowledge-base/documents?nodeId=${nodeId}`
        : '/api/knowledge-base/documents';

      const response = await apiRequest('GET', url);
      const result = await response.json();
      return result.data as Document[];
    }
  });


  React.useEffect(() => {
    if (!documents) return;

    const hasProcessing = documents.some((doc: Document) =>
      doc.status === 'uploading' || doc.status === 'processing'
    );

    if (hasProcessing) {
      const interval = setInterval(() => {
        refetch();
      }, 5000); // 5 seconds

      return () => clearInterval(interval);
    }
  }, [documents, refetch]);


  const deleteMutation = useMutation({
    mutationFn: async (documentId: number) => {
      const response = await apiRequest('DELETE', `/api/knowledge-base/documents/${documentId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Delete failed');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('knowledge_base.document.delete_success', 'Document deleted'),
        description: t('knowledge_base.document.delete_success_desc', 'Document has been removed from knowledge base')
      });
      queryClient.invalidateQueries({ queryKey: ['knowledge-base-documents'] });
    },
    onError: (error: Error) => {
      toast({
        title: t('knowledge_base.document.delete_error', 'Delete failed'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });


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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base-documents'] });
      toast({
        title: t('knowledge_base.upload.success', 'Upload successful'),
        description: t('knowledge_base.upload.file_uploaded', 'Document uploaded and processing started')
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('knowledge_base.upload.error', 'Upload failed'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });


  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    for (const file of files) {
      try {
        await uploadMutation.mutateAsync(file);
      } catch (error) {
        console.error('Upload error:', error);
      }
    }


    event.target.value = '';
  };


  const handleUploadButtonClick = () => {
    if (onUploadClick) {
      onUploadClick();
    } else {
      fileInputRef.current?.click();
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType === 'application/pdf') {
      return <FileText className="w-4 h-4 text-red-500" />;
    }
    if (mimeType.includes('word')) {
      return <FileText className="w-4 h-4 text-blue-500" />;
    }
    return <File className="w-4 h-4 text-muted-foreground" />;
  };

  const getStatusIcon = (status: Document['status']) => {
    switch (status) {
      case 'uploading':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'processing':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusBadge = (status: Document['status']) => {
    switch (status) {
      case 'uploading':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800">
          {t('knowledge_base.status.uploading', 'Uploading')}
        </Badge>;
      case 'processing':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
          {t('knowledge_base.status.processing', 'Processing')}
        </Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-green-100 text-green-800">
          {t('knowledge_base.status.completed', 'Completed')}
        </Badge>;
      case 'failed':
        return <Badge variant="destructive">
          {t('knowledge_base.status.failed', 'Failed')}
        </Badge>;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDelete = async (documentId: number) => {
    await deleteMutation.mutateAsync(documentId);
  };

  const handleDocumentClick = (document: Document) => {
    if (onDocumentSelect) {
      onDocumentSelect(document);
    }
  };

  const handlePreviewClick = (e: React.MouseEvent, document: Document) => {
    e.stopPropagation(); // Prevent triggering the row click
    setPreviewDocument(document);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          {t('common.loading', 'Loading...')}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="text-red-600 mb-4">
              {t('knowledge_base.document.load_error', 'Failed to load documents')}
            </p>
            <Button onClick={() => refetch()} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              {t('common.retry', 'Retry')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {t('knowledge_base.document.title', 'Knowledge Base Documents')}
            </CardTitle>
            <CardDescription>
              {documents?.length || 0} {t('knowledge_base.document.count', 'documents')}
            </CardDescription>
          </div>
          <Button
            onClick={handleUploadButtonClick}
            variant="outline"
            size="sm"
            disabled={uploadMutation.isPending}
          >
            {uploadMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            {t('knowledge_base.upload.upload_button', 'Upload')}
          </Button>
        </div>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.txt"
          onChange={handleFileSelect}
          className="hidden"
        />
      </CardHeader>
      <CardContent>
        {!documents || documents.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-2">
              {t('knowledge_base.document.no_documents', 'No documents uploaded yet')}
            </p>
            <p className="text-sm text-gray-500">
              {t('knowledge_base.document.upload_first', 'Upload your first document to get started')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((document) => (
              <div
                key={document.id}
                className={`
                  flex items-center gap-4 p-4 border rounded-lg transition-colors
                  ${onDocumentSelect ? 'cursor-pointer hover:bg-gray-50' : ''}
                `}
                onClick={() => handleDocumentClick(document)}
              >
                {/* File Icon & Info */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {getFileIcon(document.mimeType)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium truncate">
                        {document.originalName}
                      </p>
                      {getStatusBadge(document.status)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>{formatFileSize(document.fileSize)}</span>
                      {document.status === 'completed' && (
                        <span>{document.chunkCount} chunks</span>
                      )}
                      <span>
                        {formatDistanceToNow(new Date(document.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status & Progress */}
                <div className="flex items-center gap-3">
                  {getStatusIcon(document.status)}
                  
                  {document.status === 'processing' && (
                    <div className="w-24">
                      <Progress value={75} className="h-2" />
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {document.status === 'completed' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={(e) => handlePreviewClick(e, document)}
                        title={t('knowledge_base.document.preview', 'Preview document')}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    )}
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t('knowledge_base.document.delete_confirm_title', 'Delete Document')}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('knowledge_base.document.delete_confirm_desc', 
                              'Are you sure you want to delete this document? This action cannot be undone and will remove all associated chunks from the knowledge base.'
                            )}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {t('common.cancel', 'Cancel')}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(document.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            {t('common.delete', 'Delete')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {/* Error Message */}
                {document.status === 'failed' && document.processingError && (
                  <div className="w-full mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
                    {document.processingError}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Document Preview Modal */}
      <Dialog open={!!previewDocument} onOpenChange={() => setPreviewDocument(null)}>
        <DialogPortal>
          {/* Custom content without overlay */}
          <DialogPrimitive.Content
            className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-4xl max-h-[80vh] translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg overflow-hidden"
          >
            <div className="overflow-y-auto pr-1">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  {previewDocument?.originalName}
                </DialogTitle>
                <DialogDescription>
                  {previewDocument && (
                    <div className="flex items-center gap-4 text-sm">
                      <span>{formatFileSize(previewDocument.fileSize)}</span>
                      <span>{previewDocument.chunkCount} chunks</span>
                      <span>
                        {formatDistanceToNow(new Date(previewDocument.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-auto">
                {previewDocument && (
                  <div className="space-y-4">
                    {/* Document Info */}
                    <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                      <div>
                        <span className="text-sm font-medium text-gray-700">File Type:</span>
                        <p className="text-sm text-gray-600">{previewDocument.mimeType}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-700">Status:</span>
                        <p className="text-sm text-gray-600">{getStatusBadge(previewDocument.status)}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-700">Processing Time:</span>
                        <p className="text-sm text-gray-600">
                          {previewDocument.processingDurationMs
                            ? `${Math.round(previewDocument.processingDurationMs / 1000)}s`
                            : 'N/A'
                          }
                        </p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-700">Chunks:</span>
                        <p className="text-sm text-gray-600">{previewDocument.chunkCount}</p>
                      </div>
                    </div>

                    {/* Download/View Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const fileUrl = `/uploads/knowledge-base/${previewDocument.filename}`;
                          window.open(fileUrl, '_blank');
                        }}
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        {t('knowledge_base.document.open_file', 'Open File')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const fileUrl = `/uploads/knowledge-base/${previewDocument.filename}`;
                          const link = document.createElement('a');
                          link.href = fileUrl;
                          link.download = previewDocument.originalName;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        {t('knowledge_base.document.download', 'Download')}
                      </Button>
                    </div>

                    {/* Note about content */}
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800">
                        {t('knowledge_base.document.preview_note', 'This document has been processed and chunked for the knowledge base. Use the "Open File" button to view the original document content.')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Close button */}
            <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    </Card>
  );
}
