import React, { useState, useRef } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Upload,
  X,
  FileText,
  Image,
  Video,
  Music,
  Loader2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { VariableInsertion } from './VariableInsertion';
import {
  WHATSAPP_CHANNEL_TYPES,
  WHATSAPP_TEMPLATE_CATEGORIES,
  WHATSAPP_TEMPLATE_STATUS,
  WhatsAppChannelType
} from '@/lib/whatsapp-constants';

interface CreateTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTemplateCreated: (template: any) => void;
  whatsappChannelType: WhatsAppChannelType;
}

interface TemplateFormData {
  name: string;
  description: string;
  category: string;
  content: string;
  whatsappChannelType: WhatsAppChannelType;
  whatsappTemplateCategory: string;
  whatsappTemplateId: string;
  whatsappTemplateName: string;
  whatsappTemplateLanguage: string;
}

interface MediaFile {
  file: File;
  url: string;
  type: 'image' | 'video' | 'audio' | 'document';
}

const TEMPLATE_CATEGORIES = [
  'general',
  'marketing',
  'support',
  'notification',
  'welcome',
  'follow-up',
  'promotional'
];

const WHATSAPP_TEMPLATE_CATEGORY_OPTIONS = [
  { value: WHATSAPP_TEMPLATE_CATEGORIES.MARKETING, label: 'Marketing' },
  { value: WHATSAPP_TEMPLATE_CATEGORIES.UTILITY, label: 'Utility' },
  { value: WHATSAPP_TEMPLATE_CATEGORIES.AUTHENTICATION, label: 'Authentication' }
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export function CreateTemplateModal({ isOpen, onClose, onTemplateCreated, whatsappChannelType }: CreateTemplateModalProps) {
  const [formData, setFormData] = useState<TemplateFormData>({
    name: '',
    description: '',
    category: 'general',
    content: '',
    whatsappChannelType: whatsappChannelType,
    whatsappTemplateCategory: '',
    whatsappTemplateId: '',
    whatsappTemplateName: '',
    whatsappTemplateLanguage: 'en',
  });
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const { t } = useTranslation();

  React.useEffect(() => {
    if (isOpen) {
      setFormData({
        name: '',
        description: '',
        category: 'general',
        content: '',
        whatsappChannelType: whatsappChannelType,
        whatsappTemplateCategory: '',
        whatsappTemplateId: '',
        whatsappTemplateName: '',
        whatsappTemplateLanguage: 'en',
      });
      setMediaFiles([]);
      setUploadProgress({});
    }
  }, [isOpen, whatsappChannelType]);

  const getFileType = (file: File): 'image' | 'video' | 'audio' | 'document' => {
    const type = file.type.toLowerCase();
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('video/')) return 'video';
    if (type.startsWith('audio/')) return 'audio';
    return 'document';
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image': return <Image className="w-4 h-4" />;
      case 'video': return <Video className="w-4 h-4" />;
      case 'audio': return <Music className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return t('templates.create.file_size_error', `File size must be less than ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }

    const type = getFileType(file);
    const allowedTypes = {
      image: ['image/jpeg', 'image/png', 'image/webp'],
      video: ['video/mp4', 'video/3gpp'],
      audio: ['audio/mpeg', 'audio/aac', 'audio/ogg'],
      document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    };

    if (type === 'image' && !allowedTypes.image.includes(file.type)) {
      return t('templates.create.image_type_error', 'Only JPEG, PNG, and WebP images are allowed');
    }
    if (type === 'video' && !allowedTypes.video.includes(file.type)) {
      return t('templates.create.video_type_error', 'Only MP4 and 3GP videos are allowed');
    }
    if (type === 'audio' && !allowedTypes.audio.includes(file.type)) {
      return t('templates.create.audio_type_error', 'Only MP3, AAC, and OGG audio files are allowed');
    }
    if (type === 'document' && !allowedTypes.document.includes(file.type)) {
      return t('templates.create.document_type_error', 'Only PDF, DOC, and DOCX documents are allowed');
    }

    return null;
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);

    for (const file of files) {
      const error = validateFile(file);
      if (error) {
        toast({
          title: t('templates.create.invalid_file', 'Invalid File'),
          description: error,
          variant: 'destructive'
        });
        continue;
      }

      const mediaFile: MediaFile = {
        file,
        url: URL.createObjectURL(file),
        type: getFileType(file)
      };

      setMediaFiles(prev => [...prev, mediaFile]);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeMediaFile = (index: number) => {
    setMediaFiles(prev => {
      const newFiles = [...prev];
      URL.revokeObjectURL(newFiles[index].url);
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const uploadMediaFiles = async (): Promise<string[]> => {
    const uploadedUrls: string[] = [];

    for (let i = 0; i < mediaFiles.length; i++) {
      const mediaFile = mediaFiles[i];
      const formData = new FormData();
      formData.append('media', mediaFile.file);

      try {
        setUploadProgress(prev => ({ ...prev, [i]: 0 }));

        const response = await fetch('/api/templates/upload-media', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          throw new Error(t('templates.create.upload_failed', 'Upload failed'));
        }

        const data = await response.json();
        uploadedUrls.push(data.url);
        setUploadProgress(prev => ({ ...prev, [i]: 100 }));
      } catch (error) {
        throw new Error(t('templates.create.upload_file_failed', `Failed to upload ${mediaFile.file.name}`, { filename: mediaFile.file.name }));
      }
    }

    return uploadedUrls;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: t('common.error', 'Error'),
        description: t('templates.create.name_required', 'Please enter a template name'),
        variant: 'destructive'
      });
      return;
    }

    if (!formData.content.trim()) {
      toast({
        title: t('common.error', 'Error'),
        description: t('templates.create.content_required', 'Please enter template content'),
        variant: 'destructive'
      });
      return;
    }


    if (formData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.OFFICIAL && !formData.whatsappTemplateCategory) {
      toast({
        title: t('common.error', 'Error'),
        description: t('templates.create.whatsapp_category_required', 'Please select a WhatsApp template category for official channels'),
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);
    try {
      const mediaUrls = mediaFiles.length > 0 ? await uploadMediaFiles() : [];


      const cleanedFormData = {
        ...formData,
        mediaUrls,

        whatsappTemplateCategory: formData.whatsappChannelType === WHATSAPP_CHANNEL_TYPES.OFFICIAL && formData.whatsappTemplateCategory
          ? formData.whatsappTemplateCategory
          : null
      };

      const response = await fetch('/api/campaigns/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanedFormData)
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: t('common.success', 'Success'),
          description: t('templates.create.success', 'Template created successfully')
        });
        onTemplateCreated(data.data);
        onClose();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('templates.create.failed', 'Failed to create template'),
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {t('templates.create.title', 'Create Template')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">{t('templates.create.name_label', 'Template Name')}</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={t('templates.create.name_placeholder', 'e.g., Welcome Message')}
                  required
                />
              </div>

              <div>
                <Label htmlFor="category">{t('templates.create.category_label', 'Category')}</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category.charAt(0).toUpperCase() + category.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="description">{t('templates.create.description_label', 'Description (Optional)')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('templates.create.description_placeholder', 'Describe this template...')}
                rows={2}
              />
            </div>

          </div>

          <Separator />

          <div className="space-y-4">
            <div>
              <Label htmlFor="content">{t('templates.create.content_label', 'Template Content')}</Label>
              <Textarea
                ref={contentTextareaRef}
                id="content"
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                placeholder={t('templates.create.content_placeholder', "Enter your template content. Click 'Insert Variable' to add personalization...")}
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
              <Label>{t('templates.create.media_files_label', 'Media Files (Optional)')}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                {t('templates.create.add_media', 'Add Media')}
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

            {mediaFiles.length > 0 && (
              <div className="space-y-2">
                {mediaFiles.map((mediaFile, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 border rounded-lg">
                    {getFileIcon(mediaFile.type)}
                    <div className="flex-1">
                      <p className="text-sm font-medium">{mediaFile.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {mediaFile.type} • {(mediaFile.file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      {uploadProgress[index] !== undefined && (
                        <div className="w-full bg-muted rounded-full h-1 mt-1">
                          <div
                            className="bg-primary h-1 rounded-full transition-all"
                            style={{ width: `${uploadProgress[index]}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeMediaFile(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {t('templates.create.supported_files', 'Supported: Images (JPEG, PNG, WebP), Videos (MP4, 3GP), Audio (MP3, AAC, OGG), Documents (PDF, DOC, DOCX). Max 10MB per file.')}
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('templates.create.create_button', 'Create Template')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
