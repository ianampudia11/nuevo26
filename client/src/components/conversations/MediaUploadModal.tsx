import React, { useState, useRef, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, X, Clock, Send } from 'lucide-react';
import { useConversations } from '@/context/ConversationContext';

interface MediaUploadModalProps {
  conversationId: number;
  isOpen: boolean;
  onClose: () => void;
  file: File | null;
}

export default function MediaUploadModal({ 
  conversationId, 
  isOpen, 
  onClose, 
  file 
}: MediaUploadModalProps) {
  const [caption, setCaption] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSchedulerOpen, setIsSchedulerOpen] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [timezone, setTimezone] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();
  const { sendMediaMessage } = useConversations();

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);


  const detectUserTimezone = () => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (error) {
      console.warn('Failed to detect timezone, falling back to UTC:', error);
      return 'UTC';
    }
  };


  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().split('T')[0];
  const defaultTime = '09:00';


  const timezoneOptions = [

    { value: 'America/Argentina/Buenos_Aires', label: '🇦🇷 Argentina - Buenos Aires (ART)' },
    { value: 'America/Argentina/Cordoba', label: '🇦🇷 Argentina - Córdoba (ART)' },
    { value: 'America/Argentina/Mendoza', label: '🇦🇷 Argentina - Mendoza (ART)' },
    { value: 'America/Argentina/Salta', label: '🇦🇷 Argentina - Salta (ART)' },
    { value: 'America/Argentina/Tucuman', label: '🇦🇷 Argentina - Tucumán (ART)' },
    { value: 'America/Argentina/Ushuaia', label: '🇦🇷 Argentina - Ushuaia (ART)' },
    
    { value: 'America/Sao_Paulo', label: '🇧🇷 Brazil - São Paulo (BRT)' },
    { value: 'America/Manaus', label: '🇧🇷 Brazil - Manaus (AMT)' },
    { value: 'America/Cuiaba', label: '🇧🇷 Brazil - Cuiabá (AMT)' },
    { value: 'America/Campo_Grande', label: '🇧🇷 Brazil - Campo Grande (AMT)' },
    { value: 'America/Porto_Velho', label: '🇧🇷 Brazil - Porto Velho (AMT)' },
    { value: 'America/Rio_Branco', label: '🇧🇷 Brazil - Rio Branco (ACT)' },
    { value: 'America/Boa_Vista', label: '🇧🇷 Brazil - Boa Vista (AMT)' },
    { value: 'America/Recife', label: '🇧🇷 Brazil - Recife (BRT)' },
    { value: 'America/Fortaleza', label: '🇧🇷 Brazil - Fortaleza (BRT)' },
    { value: 'America/Maceio', label: '🇧🇷 Brazil - Maceió (BRT)' },
    { value: 'America/Aracaju', label: '🇧🇷 Brazil - Aracaju (BRT)' },
    { value: 'America/Salvador', label: '🇧🇷 Brazil - Salvador (BRT)' },
    { value: 'America/Bahia', label: '🇧🇷 Brazil - Bahia (BRT)' },
    { value: 'America/Santarem', label: '🇧🇷 Brazil - Santarém (BRT)' },
    { value: 'America/Belem', label: '🇧🇷 Brazil - Belém (BRT)' },
    { value: 'America/Araguaina', label: '🇧🇷 Brazil - Araguaína (BRT)' },
    { value: 'America/Sao_Luis', label: '🇧🇷 Brazil - São Luís (BRT)' },
    
    { value: 'America/Mexico_City', label: '🇲🇽 Mexico - Mexico City (CST)' },
    { value: 'America/Cancun', label: '🇲🇽 Mexico - Cancún (EST)' },
    { value: 'America/Merida', label: '🇲🇽 Mexico - Mérida (CST)' },
    { value: 'America/Monterrey', label: '🇲🇽 Mexico - Monterrey (CST)' },
    { value: 'America/Mazatlan', label: '🇲🇽 Mexico - Mazatlán (MST)' },
    { value: 'America/Chihuahua', label: '🇲🇽 Mexico - Chihuahua (MST)' },
    { value: 'America/Hermosillo', label: '🇲🇽 Mexico - Hermosillo (MST)' },
    { value: 'America/Tijuana', label: '🇲🇽 Mexico - Tijuana (PST)' },
    { value: 'America/Bahia_Banderas', label: '🇲🇽 Mexico - Bahía de Banderas (CST)' },
    
    { value: 'America/Bogota', label: '🇨🇴 Colombia - Bogotá (COT)' },
    { value: 'America/Lima', label: '🇵🇪 Peru - Lima (PET)' },
    { value: 'America/Caracas', label: '🇻🇪 Venezuela - Caracas (VET)' },
    { value: 'America/Santiago', label: '🇨🇱 Chile - Santiago (CLT)' },
    { value: 'America/La_Paz', label: '🇧🇴 Bolivia - La Paz (BOT)' },
    { value: 'America/Asuncion', label: '🇵🇾 Paraguay - Asunción (PYT)' },
    { value: 'America/Montevideo', label: '🇺🇾 Uruguay - Montevideo (UYT)' },
    { value: 'America/Guyana', label: '🇬🇾 Guyana - Georgetown (GYT)' },
    { value: 'America/Paramaribo', label: '🇸🇷 Suriname - Paramaribo (SRT)' },
    { value: 'America/Cayenne', label: '🇬🇫 French Guiana - Cayenne (GFT)' },
    
    { value: 'America/Guatemala', label: '🇬🇹 Guatemala - Guatemala City (CST)' },
    { value: 'America/Tegucigalpa', label: '🇭🇳 Honduras - Tegucigalpa (CST)' },
    { value: 'America/Managua', label: '🇳🇮 Nicaragua - Managua (CST)' },
    { value: 'America/San_Salvador', label: '🇸🇻 El Salvador - San Salvador (CST)' },
    { value: 'America/Costa_Rica', label: '🇨🇷 Costa Rica - San José (CST)' },
    { value: 'America/Panama', label: '🇵🇦 Panama - Panama City (EST)' },
    
    { value: 'America/Havana', label: '🇨🇺 Cuba - Havana (CST)' },
    { value: 'America/Santo_Domingo', label: '🇩🇴 Dominican Republic - Santo Domingo (AST)' },
    { value: 'America/Port-au-Prince', label: '🇭🇹 Haiti - Port-au-Prince (EST)' },
    { value: 'America/Jamaica', label: '🇯🇲 Jamaica - Kingston (EST)' },
    { value: 'America/Port_of_Spain', label: '🇹🇹 Trinidad and Tobago - Port of Spain (AST)' },
    { value: 'America/Barbados', label: '🇧🇧 Barbados - Bridgetown (AST)' },
    

    { value: 'UTC', label: '🌍 UTC (Coordinated Universal Time)' },
    { value: 'America/New_York', label: '🇺🇸 United States - New York (EST/EDT)' },
    { value: 'America/Chicago', label: '🇺🇸 United States - Chicago (CST/CDT)' },
    { value: 'America/Denver', label: '🇺🇸 United States - Denver (MST/MDT)' },
    { value: 'America/Los_Angeles', label: '🇺🇸 United States - Los Angeles (PST/PDT)' },
    { value: 'Europe/London', label: '🇬🇧 United Kingdom - London (GMT/BST)' },
    { value: 'Europe/Paris', label: '🇫🇷 France - Paris (CET/CEST)' },
    { value: 'Europe/Madrid', label: '🇪🇸 Spain - Madrid (CET/CEST)' },
    { value: 'Asia/Tokyo', label: '🇯🇵 Japan - Tokyo (JST)' },
    { value: 'Asia/Shanghai', label: '🇨🇳 China - Shanghai (CST)' },
    { value: 'Asia/Dubai', label: '🇦🇪 United Arab Emirates - Dubai (GST)' },
    { value: 'Australia/Sydney', label: '🇦🇺 Australia - Sydney (AEST/AEDT)' }
  ];

  React.useEffect(() => {
    if (isSchedulerOpen) {
      setScheduledDate(defaultDate);
      setScheduledTime(defaultTime);

      const userTimezone = detectUserTimezone();
      setTimezone(userTimezone);
    }
  }, [isSchedulerOpen]);

  const handleSend = async () => {
    if (!file) {
      toast({
        title: t('common.error', 'Error'),
        description: t('media_upload.no_file_selected', 'No media file selected'),
        variant: "destructive"
      });
      return;
    }

    setIsSending(true);
    try {
      await sendMediaMessage(conversationId, file, caption);

      toast({
        title: t('common.success', 'Success'),
        description: t('media_upload.sent_successfully', 'Media message sent successfully')
      });
      onClose();
    } catch (error: any) {
      toast({
        title: t('media_upload.error_sending', 'Error Sending Media'),
        description: error.message || t('media_upload.send_failed', 'Failed to send media message'),
        variant: "destructive"
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleScheduleMedia = async () => {
    if (!file) {
      toast({
        title: t('common.error', 'Error'),
        description: t('media_upload.no_file_selected', 'No media file selected'),
        variant: "destructive"
      });
      return;
    }

    if (!scheduledDate || !scheduledTime || !timezone) {
      toast({
        title: t('scheduler.error.incomplete', 'Incomplete Information'),
        description: t('scheduler.error.fill_all_fields', 'Please fill in all scheduling fields'),
        variant: "destructive"
      });
      return;
    }

    setIsScheduling(true);
    try {

      const formData = new FormData();
      formData.append('file', file);
      formData.append('conversationId', conversationId.toString());
      
      const uploadResponse = await fetch('/api/scheduled-messages/upload-media', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.message || 'Failed to upload media file');
      }

      const uploadResult = await uploadResponse.json();
      const mediaFilePath = uploadResult.mediaFilePath;


      const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
      

      const response = await fetch('/api/scheduled-messages', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId,
          content: caption || `Media file: ${file?.name}`,
          scheduledFor: scheduledDateTime.toISOString(),
          messageType: 'media',
          mediaFilePath: mediaFilePath, // Store file path instead of data
          mediaType: file?.type.startsWith('image/') ? 'image' : 
                    file?.type.startsWith('video/') ? 'video' : 
                    file?.type.startsWith('audio/') ? 'audio' : 'document',
          caption: caption,
          timezone: timezone,
          metadata: {
            fileName: file?.name,
            fileSize: file?.size,
            fileType: file?.type
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to schedule media message');
      }

      const result = await response.json();
      
      toast({
        title: t('scheduler.success.scheduled', 'Media Scheduled'),
        description: t('scheduler.success.media_scheduled', 'Your media message has been scheduled successfully'),
        variant: 'default'
      });
      
      onClose();
      return result;
    } catch (error: any) {
      toast({
        title: t('scheduler.error.failed', 'Scheduling Failed'),
        description: error.message || t('scheduler.error.generic', 'Failed to schedule media message'),
        variant: "destructive"
      });
    } finally {
      setIsScheduling(false);
    }
  };

  const getMediaPreview = () => {
    if (!file || !previewUrl) return null;

    const fileType = file.type;
    
    if (fileType.startsWith('image/')) {
      return (
        <img
          src={previewUrl}
          alt={t('media_upload.image_preview', 'Image preview')}
          className="max-h-64 max-w-full object-contain rounded-lg"
        />
      );
    } else if (fileType.startsWith('video/')) {
      return (
        <video
          src={previewUrl}
          controls
          className="max-h-64 max-w-full rounded-lg"
        />
      );
    } else if (fileType.startsWith('audio/')) {
      return (
        <audio
          src={previewUrl}
          controls
          className="w-full"
        />
      );
    } else {
      return (
        <div className="flex items-center justify-center p-6 bg-muted rounded-lg w-full">
          <div className="text-center">
            <i className="ri-file-line text-4xl text-muted-foreground mb-2"></i>
            <p className="text-sm text-muted-foreground break-all">{file.name}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('media_upload.file_size_kb', '{{size}} KB', { size: (file.size / 1024).toFixed(2) })}
            </p>
          </div>
        </div>
      );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg md:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('media_upload.title', 'Send Media')}</DialogTitle>
          <DialogDescription>
            {t('media_upload.description', 'Preview and send media files through WhatsApp')}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col gap-4 py-4">
          {file ? (
            <>
              <div className="flex justify-center">
                {getMediaPreview()}
              </div>
              <div className="text-sm text-muted-foreground">
                <span className="font-medium">{file.name}</span> ({t('media_upload.file_size_kb', '{{size}} KB', { size: (file.size / 1024).toFixed(2) })})
              </div>
              <Textarea
                placeholder={t('media_upload.caption_placeholder', 'Add a caption (optional)')}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="min-h-24"
              />
              
              {/* Scheduling Form */}
              {isSchedulerOpen && (
                <div className="border-t pt-4 mt-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-medium text-foreground">
                      {t('scheduler.title', 'Schedule Message')}
                    </h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Date Input */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        {t('scheduler.date', 'Date')}
                      </label>
                      <input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground"
                      />
                    </div>
                    
                    {/* Time Input */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        {t('scheduler.time', 'Time')}
                      </label>
                      <input
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground"
                      />
                    </div>
                  </div>
                  
                  {/* Timezone Selector */}
                  <div className="mt-4 space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      {t('scheduler.timezone', 'Timezone')}
                    </label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground"
                    >
                      {timezoneOptions.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                    {timezone && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('scheduler.auto_detected', 'Auto-detected: {{timezone}}', { timezone })}
                      </p>
                    )}
                  </div>
                  
                  {/* Preview */}
                  {scheduledDate && scheduledTime && timezone && (
                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <p className="text-sm text-blue-800 dark:text-blue-400">
                        <strong>{t('scheduler.preview', 'Scheduled for:')}</strong>{' '}
                        {new Date(`${scheduledDate}T${scheduledTime}`).toLocaleString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: timezone
                        })}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-6">
              <p className="text-muted-foreground">{t('media_upload.no_file_selected', 'No media file selected')}</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row sm:justify-end gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSending || isScheduling}
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          
          {file && !isSchedulerOpen && (
            <>
              <Button
                variant="outline"
                onClick={() => setIsSchedulerOpen(true)}
                disabled={isSending || isScheduling}
                className="flex items-center gap-2"
              >
                <Clock className="h-4 w-4" />
                {t('media_upload.schedule', 'Schedule')}
              </Button>
              
              <Button
                onClick={handleSend}
                disabled={!file || isSending || isScheduling}
              >
                {isSending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('media_upload.sending', 'Sending...')}
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    {t('media_upload.send', 'Send')}
                  </>
                )}
              </Button>
            </>
          )}
          
          {file && isSchedulerOpen && (
            <>
              <Button
                variant="outline"
                onClick={() => setIsSchedulerOpen(false)}
                disabled={isSending || isScheduling}
                className="flex items-center gap-2"
              >
                {t('scheduler.cancel', 'Cancel Schedule')}
              </Button>
              
              <Button
                onClick={handleScheduleMedia}
                disabled={!file || isSending || isScheduling || !scheduledDate || !scheduledTime || !timezone}
                className="flex items-center gap-2"
              >
                {isScheduling ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('scheduler.scheduling', 'Scheduling...')}
                  </>
                ) : (
                  <>
                    <Clock className="mr-2 h-4 w-4" />
                    {t('scheduler.schedule', 'Schedule')}
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}