import React, { useState } from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Clock, X, Send, Image, FileText, Mic } from 'lucide-react';

interface MessageSchedulerProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (data: ScheduledMessageData) => void;
  conversationId: number;
  initialContent?: string;
  messageType?: 'text' | 'media';
  mediaFile?: File;
}

interface ScheduledMessageData {
  content: string;
  scheduledFor: Date;
  timezone: string;
  messageType: string;
  mediaUrl?: string;
  mediaType?: string;
  caption?: string;
}

export default function MessageScheduler({
  isOpen,
  onClose,
  onSchedule,
  conversationId,
  initialContent = '',
  messageType = 'text',
  mediaFile
}: MessageSchedulerProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [timezone, setTimezone] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);


  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().split('T')[0];
  const defaultTime = '09:00';


  const detectUserTimezone = () => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (error) {
      console.warn('Failed to detect timezone, falling back to UTC:', error);
      return 'UTC';
    }
  };


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
    if (isOpen) {
      setScheduledDate(defaultDate);
      setScheduledTime(defaultTime);

      const userTimezone = detectUserTimezone();
      setTimezone(userTimezone);
    }
  }, [isOpen]);

  const handleSchedule = async () => {
    if (!initialContent.trim()) {
      toast({
        title: t('scheduler.validation.content_required', 'Content Required'),
        description: t('scheduler.validation.message_content_required', 'Message content is required'),
        variant: 'destructive'
      });
      return;
    }

    if (!scheduledDate || !scheduledTime) {
      toast({
        title: t('scheduler.validation.time_required', 'Time Required'),
        description: t('scheduler.validation.scheduled_time_required', 'Please select a scheduled time'),
        variant: 'destructive'
      });
      return;
    }

    const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
    
    if (scheduledDateTime <= new Date()) {
      toast({
        title: t('scheduler.validation.future_time', 'Future Time Required'),
        description: t('scheduler.validation.scheduled_time_future', 'Scheduled time must be in the future'),
        variant: 'destructive'
      });
      return;
    }

    setIsScheduling(true);
    try {
      const scheduledData: ScheduledMessageData = {
        content: initialContent.trim(),
        scheduledFor: scheduledDateTime,
        timezone,
        messageType: messageType,
        ...(messageType === 'media' && mediaFile && {
          mediaType: mediaFile.type.startsWith('image/') ? 'image' : 
                    mediaFile.type.startsWith('video/') ? 'video' : 
                    mediaFile.type.startsWith('audio/') ? 'audio' : 'document'
        })
      };

      await onSchedule(scheduledData);
      
      toast({
        title: t('scheduler.success.scheduled', 'Message Scheduled'),
        description: t('scheduler.success.message_scheduled', 'Your message has been scheduled successfully'),
        variant: 'default'
      });
      
      onClose();
    } catch (error: any) {
      toast({
        title: t('scheduler.error.failed', 'Scheduling Failed'),
        description: error.message || t('scheduler.error.scheduling_failed', 'Failed to schedule message'),
        variant: 'destructive'
      });
    } finally {
      setIsScheduling(false);
    }
  };

  const formatScheduledTime = () => {
    if (!scheduledDate || !scheduledTime || !timezone) return '';
    try {
      const date = new Date(`${scheduledDate}T${scheduledTime}`);
      return date.toLocaleString('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch (error) {
      console.warn('Error formatting scheduled time:', error);
      return `${scheduledDate} ${scheduledTime}`;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary-600 dark:text-primary-400" />
              <h2 className="text-lg font-semibold text-foreground">
                {t('scheduler.title', 'Schedule Message')}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Message Content Preview */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('scheduler.content_label', 'Message Content')}
            </label>
            <div className="p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md">
              <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                {initialContent || t('scheduler.no_content', 'No message content')}
              </p>
              {initialContent && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {initialContent.length}/4096 characters
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('scheduler.content_note', 'This message will be sent at the scheduled time.')}
            </p>
          </div>

          {/* Media Preview */}
          {messageType === 'media' && mediaFile && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-foreground mb-2">
                {t('scheduler.media_label', 'Media File')}
              </label>
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                {mediaFile.type.startsWith('image/') ? (
                  <Image className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                ) : mediaFile.type.startsWith('video/') ? (
                  <FileText className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                ) : mediaFile.type.startsWith('audio/') ? (
                  <Mic className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                ) : (
                  <FileText className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {mediaFile.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {(mediaFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Date and Time Selection */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {t('scheduler.date_label', 'Date')}
              </label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {t('scheduler.time_label', 'Time')}
              </label>
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground"
              />
            </div>
          </div>

          {/* Timezone */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('scheduler.timezone_label', 'Timezone')}
              {timezone && (
                <span className="text-xs text-primary-600 dark:text-primary-400 ml-2">
                  (Auto-detected: {timezone})
                </span>
              )}
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              {timezoneOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('scheduler.timezone_help', 'Your timezone was automatically detected. You can change it if needed.')}
            </p>
          </div>

          {/* Preview */}
          <div className="mb-6 p-4 bg-primary-50 dark:bg-primary-900/20 rounded-md">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-primary-600 dark:text-primary-400" />
              <span className="text-sm font-medium text-primary-900 dark:text-primary-100">
                {t('scheduler.preview_title', 'Scheduled for')}
              </span>
            </div>
            <p className="text-sm text-primary-800 dark:text-primary-200">
              {formatScheduledTime()}
            </p>
            {timezone && (
              <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">
                {t('scheduler.timezone_info', 'Timezone')}: {timezone}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-6">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-foreground bg-muted hover:bg-accent rounded-md transition-colors"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              onClick={handleSchedule}
              disabled={isScheduling || !initialContent.trim() || !scheduledDate || !scheduledTime}
              className="flex-1 px-4 py-2 bg-gray-700 text-white hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-full transition-colors flex items-center justify-center gap-2"
            >
              {isScheduling ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  {t('scheduler.scheduling', 'Scheduling...')}
                </>
              ) : (
                <>
                  <Clock className="h-4 w-4" />
                  {t('scheduler.schedule_button', 'Schedule Message')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
