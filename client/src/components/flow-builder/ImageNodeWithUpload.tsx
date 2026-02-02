import React, { useState, useCallback, useContext } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { Image, Copy, Trash2 } from 'lucide-react';
import { FileUpload } from '@/components/ui/file-upload';
import { FlowContext } from './FlowContext';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from '@/hooks/use-translation';

interface ImageNodeProps {
  id: string;
  data: {
    label: string;
    mediaUrl?: string;
    caption?: string;
  };
  isConnectable: boolean;
}

export function ImageNodeWithUpload({ id, data, isConnectable }: ImageNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [mediaUrl, setMediaUrl] = useState(data.mediaUrl || "");
  const [caption, setCaption] = useState(data.caption || t('flow_builder.image_upload_default_caption', 'Check out this image!'));
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { setNodes } = useReactFlow();
  const flowContext = useContext(FlowContext);

  const updateNodeData = useCallback((updates: any) => {
    setNodes((nodes) => 
      nodes.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              ...updates
            }
          };
        }
        return node;
      })
    );
  }, [id, setNodes]);

  const handleCaptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCaption = e.target.value;
    setCaption(newCaption);
    updateNodeData({ caption: newCaption });
  };

  const handleFileSelected = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload', true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percentComplete);
        }
      };

      xhr.onload = () => {
        setIsUploading(false);
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          setMediaUrl(response.url);
          updateNodeData({ mediaUrl: response.url });
          toast({
            title: t('flow_builder.image_upload_upload_complete', 'Upload complete'),
            description: t('flow_builder.image_upload_upload_success', 'Image uploaded successfully')
          });
        } else {
          toast({
            title: t('flow_builder.image_upload_upload_failed', 'Upload failed'),
            description: t('flow_builder.image_upload_upload_error', 'There was an error uploading your image'),
            variant: 'destructive'
          });
        }
      };

      xhr.onerror = () => {
        setIsUploading(false);
        toast({
          title: t('flow_builder.image_upload_upload_failed', 'Upload failed'),
          description: t('flow_builder.image_upload_upload_error', 'There was an error uploading your image'),
          variant: 'destructive'
        });
      };

      xhr.send(formData);
    } catch (error) {
      console.error('Upload error:', error);
      setIsUploading(false);
      toast({
        title: t('flow_builder.image_upload_upload_failed', 'Upload failed'),
        description: t('flow_builder.image_upload_upload_error', 'There was an error uploading your image'),
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="node-image p-3 rounded-lg bg-white border border-border shadow-sm max-w-[250px] relative group">
      {flowContext && (
        <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7" 
                  onClick={() => flowContext.onDuplicateNode(id)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">{t('flow_builder.image_upload_duplicate_node', 'Duplicate node')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-destructive hover:text-destructive" 
                  onClick={() => flowContext.onDeleteNode(id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">{t('flow_builder.image_upload_delete_node', 'Delete node')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
      
      <div className="font-medium flex items-center gap-2 mb-2">
        <Image className="h-4 w-4 text-blue-500" />
        <span>{t('flow_builder.image_upload_node_title', 'Image Message')}</span>
        <button 
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? t('common.done', 'Done') : t('common.edit', 'Edit')}
        </button>
      </div>
      
      {isEditing ? (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium mb-1">{t('flow_builder.image_upload_upload_label', 'Upload Image:')}</p>
            <FileUpload
              onFileSelected={handleFileSelected}
              fileType="image/*"
              maxSize={30}
              className="w-full"
              showProgress={isUploading}
              progress={uploadProgress}
            />
          </div>
          
          <div>
            <p className="text-xs font-medium mb-1">{t('flow_builder.image_upload_caption_label', 'Caption:')}</p>
            <input
              className="w-full p-2 text-sm border rounded"
              value={caption}
              onChange={handleCaptionChange}
              placeholder={t('flow_builder.image_upload_caption_placeholder', 'Enter caption')}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {mediaUrl ? (
            <div className="relative aspect-video  rounded overflow-hidden flex items-center justify-center">
              {mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                <img 
                  src={mediaUrl} 
                  alt={t('flow_builder.image_upload_preview_alt', 'Preview')}
                  className="object-cover w-full h-full"
                  onError={(e) => {
                    e.currentTarget.src = '';
                    e.currentTarget.classList.add('hidden');
                    e.currentTarget.parentElement?.classList.add('flex');
                  }}
                />
              ) : (
                <Image className="h-8 w-8 text-muted-foreground" />
              )}
              <span className="absolute bottom-1 right-1 text-[10px] px-1 bg-background/80 rounded">{t('flow_builder.image_upload_image_label', 'Image')}</span>
            </div>
          ) : (
            <div className=" p-3 rounded flex flex-col items-center justify-center">
              <Image className="h-8 w-8 text-muted-foreground mb-1" />
              <span className="text-xs text-muted-foreground">{t('flow_builder.image_upload_no_image_selected', 'No image selected')}</span>
            </div>
          )}
          <div className="text-sm">{caption}</div>
        </div>
      )}
      
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#64748b' }}
        isConnectable={isConnectable}
      />
      <Handle
        type="source" 
        position={Position.Right}
        style={{ background: '#64748b' }}
        isConnectable={isConnectable}
      />
    </div>
  );
}