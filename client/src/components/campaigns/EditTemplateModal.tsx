import React, { useState, useEffect, useRef } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  FileText,
  Upload,
  X,
  Loader2,
  AlertTriangle,
  Image,
  Video,
  Music,
  File
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { VariableInsertion } from './VariableInsertion';

interface EditTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateId: number;
  onTemplateUpdated: (template: any) => void;
}

interface MediaFile {
  id: string;
  file: File;
  type: 'image' | 'video' | 'audio' | 'document';
  url: string;
  name: string;
  size: number;
}

interface CampaignTemplate {
  id: number;
  name: string;
  description: string;
  category: string;
  content: string;
  mediaUrls: string[];
  variables: string[];
  channelType: string;
  isActive: boolean;
  createdById: number;
}

export function EditTemplateModal({ isOpen, onClose, templateId, onTemplateUpdated }: EditTemplateModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'general',
    content: '',
  });
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [originalTemplate, setOriginalTemplate] = useState<CampaignTemplate | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    if (isOpen && templateId) {
      loadTemplate();
    }
  }, [isOpen, templateId]);

  const loadTemplate = async () => {
    setIsLoadingTemplate(true);
    try {
      const response = await fetch(`/api/campaigns/templates/${templateId}`);
      const data = await response.json();

      if (data.success) {
        const template = data.data;
        setOriginalTemplate(template);
        setFormData({
          name: template.name,
          description: template.description || '',
          category: template.category,
          content: template.content,
        });

        const existingMedia: MediaFile[] = (template.mediaUrls || []).map((url: string, index: number) => ({
          id: `existing-${index}`,
          file: null as any,
          type: getMediaTypeFromUrl(url),
          url,
          name: url.split('/').pop() || 'media',
          size: 0
        }));
        setMediaFiles(existingMedia);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('templates.edit.load_failed', 'Failed to load template'),
        variant: 'destructive'
      });
      onClose();
    } finally {
      setIsLoadingTemplate(false);
    }
  };

  const getMediaTypeFromUrl = (url: string): 'image' | 'video' | 'audio' | 'document' => {
    const extension = url.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension || '')) return 'image';
    if (['mp4', 'avi', 'mov', 'wmv'].includes(extension || '')) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(extension || '')) return 'audio';
    return 'document';
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      category: 'general',
      content: '',
    });
    setMediaFiles([]);
    setUploadProgress({});
    setOriginalTemplate(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.content.trim()) {
      toast({
        title: t('templates.edit.validation_error', 'Validation Error'),
        description: t('templates.edit.name_content_required', 'Name and content are required'),
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);
    try {
      const mediaUrls = mediaFiles.map(file => file.url);

      const response = await fetch(`/api/campaigns/templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          category: formData.category,
          content: formData.content,
          mediaUrls,
          channelType: 'whatsapp',
          isActive: true
        })
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: t('common.success', 'Success'),
          description: t('templates.edit.update_success', 'Template updated successfully')
        });
        onTemplateUpdated(data.data);
        onClose();
        resetForm();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('templates.edit.update_failed', 'Failed to update template'),
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/campaigns/templates/${templateId}`, {
        method: 'DELETE'
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: t('common.success', 'Success'),
          description: t('templates.edit.delete_success', 'Template deleted successfully')
        });
        onTemplateUpdated(null);
        onClose();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: (error instanceof Error ? error.message : null) || t('templates.edit.delete_failed', 'Failed to delete template'),
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  const removeMediaFile = (fileId: string) => {
    setMediaFiles(prev => prev.filter(file => file.id !== fileId));
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: t('common.error', 'Error'),
          description: t('templates.edit.file_too_large', `File ${file.name} is too large. Maximum size is 10MB.`),
          variant: 'destructive'
        });
        continue;
      }

      const fileType = getFileType(file);
      const fileId = `new-${Date.now()}-${Math.random()}`;


      try {
        setUploadProgress(prev => ({ ...prev, [fileId]: 0 }));

        const formData = new FormData();
        formData.append('media', file);

        const response = await fetch('/api/templates/upload-media', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Upload failed with status ${response.status}`);
        }

        const data = await response.json();

        if (data.success && data.url) {
          const newMediaFile: MediaFile = {
            id: fileId,
            file,
            type: fileType,
            url: data.url,
            name: file.name,
            size: file.size
          };

          setMediaFiles(prev => [...prev, newMediaFile]);
          setUploadProgress(prev => {
            const updated = { ...prev };
            delete updated[fileId];
            return updated;
          });

          toast({
            title: t('common.success', 'Success'),
            description: t('templates.edit.file_uploaded', `${file.name} uploaded successfully`)
          });
        } else {
          throw new Error(data.error || 'Upload failed');
        }
      } catch (error) {
        console.error('Upload error:', error);
        toast({
          title: t('common.error', 'Error'),
          description: t('templates.edit.upload_failed', `Failed to upload ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`),
          variant: 'destructive'
        });
        setUploadProgress(prev => {
          const updated = { ...prev };
          delete updated[fileId];
          return updated;
        });
      }
    }


    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getFileType = (file: File): 'image' | 'video' | 'audio' | 'document' => {
    const type = file.type.toLowerCase();
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('video/')) return 'video';
    if (type.startsWith('audio/')) return 'audio';
    return 'document';
  };

  const getFileIcon = (type: 'image' | 'video' | 'audio' | 'document') => {
    switch (type) {
      case 'image':
        return <Image className="w-4 h-4 text-blue-500" />;
      case 'video':
        return <Video className="w-4 h-4 text-purple-500" />;
      case 'audio':
        return <Music className="w-4 h-4 text-green-500" />;
      case 'document':
        return <File className="w-4 h-4 text-muted-foreground" />;
    }
  };

  if (isLoadingTemplate) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[600px]">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">{t('templates.edit.loading_template', 'Loading template...')}</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {t('templates.edit.title', 'Edit Template')}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">{t('templates.edit.name_label', 'Template Name')}</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={t('templates.edit.name_placeholder', 'e.g., Welcome Message, Promotion Alert')}
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">{t('templates.edit.description_label', 'Description (Optional)')}</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder={t('templates.edit.description_placeholder', 'Describe this template...')}
                  rows={2}
                />
              </div>

              <div>
                <Label htmlFor="category">{t('templates.edit.category_label', 'Category')}</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">{t('templates.edit.category.general', 'General')}</SelectItem>
                    <SelectItem value="marketing">{t('templates.edit.category.marketing', 'Marketing')}</SelectItem>
                    <SelectItem value="support">{t('templates.edit.category.support', 'Support')}</SelectItem>
                    <SelectItem value="notification">{t('templates.edit.category.notification', 'Notification')}</SelectItem>
                    <SelectItem value="welcome">{t('templates.edit.category.welcome', 'Welcome')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div>
                <Label htmlFor="content">{t('templates.edit.content_label', 'Message Content')}</Label>
                <Textarea
                  ref={contentTextareaRef}
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  placeholder={t('templates.edit.content_placeholder', "Enter your message content here... Click 'Insert Variable' to add personalization...")}
                  rows={6}
                  required
                />

                <div className="mt-2">
                  <VariableInsertion
                    textareaRef={contentTextareaRef}
                    value={formData.content}
                    onChange={(content) => setFormData(prev => ({ ...prev, content }))}
                    customVariables={['company', 'position', 'location', 'industry']}
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>{t('templates.edit.media_files_label', 'Media Files (Optional)')}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2"
                  disabled={isLoading || Object.keys(uploadProgress).length > 0}
                >
                  <Upload className="w-4 h-4" />
                  {t('templates.edit.add_media', 'Add Media')}
                </Button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                onChange={handleFileSelect}
                className="hidden"
              />

              {Object.keys(uploadProgress).length > 0 && (
                <div className="space-y-2">
                  {Object.entries(uploadProgress).map(([fileId, progress]) => (
                    <div key={fileId} className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">
                        {t('templates.edit.uploading', 'Uploading...')} {progress}%
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {mediaFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {mediaFiles.map((file) => (
                      <div key={file.id} className="relative border rounded-lg p-3">
                        <div className="flex items-center gap-2">
                          {getFileIcon(file.type)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="secondary" className="text-xs !bg-muted !text-muted-foreground">
                                {file.type}
                              </Badge>
                              {file.size > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {(file.size / 1024 / 1024).toFixed(2)} MB
                                </span>
                              )}
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeMediaFile(file.id)}
                            className="h-8 w-8 p-0 shrink-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="flex justify-between">
              <Button
                type="button"
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isLoading}
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                {t('templates.edit.delete_button', 'Delete Template')}
              </Button>

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t('templates.edit.updating', 'Updating...')}
                    </>
                  ) : (
                    t('templates.edit.update_button', 'Update Template')
                  )}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('templates.edit.delete_confirm_title', 'Delete Template')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('templates.edit.delete_confirm_message', 'Are you sure you want to delete this template? This action cannot be undone.')}
              {originalTemplate && (
                <div className="mt-2 p-2 bg-muted rounded text-sm">
                  <strong>{originalTemplate.name}</strong>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('templates.edit.delete_confirm_button', 'Delete Template')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
