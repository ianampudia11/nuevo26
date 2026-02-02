import React, { useState, useCallback, useEffect } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { FileUpload } from '@/components/ui/file-upload';
import {
  Clock,
  Calendar,
  MessageSquare,
  Image,
  Video,
  FileAudio,
  FileText,
  Trash2,
  Copy,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { standardHandleStyle } from '../StyledHandle';
import { useTranslation } from '@/hooks/use-translation';
import { toast } from '@/hooks/use-toast';
import { useFlowContext } from '../../../pages/flow-builder';
import { TimezoneSelector } from '@/components/ui/timezone-selector';
import { getBrowserTimezone } from '@/utils/timezones';

interface FollowUpNodeData {
  label: string;
  messageType: 'text' | 'image' | 'video' | 'audio' | 'document';
  messageContent: string;
  mediaUrl?: string;
  caption?: string;
  templateId?: number;
  triggerEvent: 'conversation_start' | 'specific_datetime' | 'relative_delay';
  delayAmount: number;
  delayUnit: 'minutes' | 'hours' | 'days' | 'weeks';
  specificDatetime?: string;
  timezone?: string;
  maxRetries: number;
}

interface FollowUpNodeProps {
  id: string;
  data: FollowUpNodeData;
  isConnectable: boolean;
}

export function FollowUpNode({ id, data, isConnectable }: FollowUpNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [messageType, setMessageType] = useState(data.messageType || 'text');
  const [messageContent, setMessageContent] = useState(data.messageContent || '');
  const [mediaUrl, setMediaUrl] = useState(data.mediaUrl || '');
  const [caption, setCaption] = useState(data.caption || '');
  const [templateId, setTemplateId] = useState(data.templateId);
  const [triggerEvent, setTriggerEvent] = useState(data.triggerEvent || 'conversation_start');
  const [delayAmount, setDelayAmount] = useState(data.delayAmount || 1);
  const [delayUnit, setDelayUnit] = useState(data.delayUnit || 'hours');
  const [specificDatetime, setSpecificDatetime] = useState(data.specificDatetime || '');
  const [timezone, setTimezone] = useState(data.timezone || getBrowserTimezone());
  const [maxRetries, setMaxRetries] = useState(data.maxRetries || 3);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const { setNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode } = useFlowContext();

  const availableVariables = [
    { name: "contact.name", description: t('flow_builder.var_contact_name', "Contact's name") },
    { name: "contact.phone", description: t('flow_builder.var_contact_phone', "Contact's phone number") },
    { name: "contact.email", description: t('flow_builder.var_contact_email', "Contact's email address") },
    { name: "message.content", description: t('flow_builder.var_message_content', "Received message content") },
    { name: "date.today", description: t('flow_builder.var_date_today', "Current date") },
    { name: "time.now", description: t('flow_builder.var_time_now', "Current time") },
    { name: "availability", description: t('flow_builder.var_availability', "Google Calendar availability data from previous node") }
  ];

  const defaultTemplates = {
    text: t('flow_builder.followup_default_text_template', "Thank you for your interest! How can we help you further?")
  };



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

  useEffect(() => {
    updateNodeData({
      messageType,
      messageContent,
      mediaUrl,
      caption,
      templateId,
      triggerEvent,
      delayAmount,
      delayUnit,
      specificDatetime,
      timezone,
      maxRetries
    });
  }, [
    updateNodeData,
    messageType,
    messageContent,
    mediaUrl,
    caption,
    templateId,
    triggerEvent,
    delayAmount,
    delayUnit,
    specificDatetime,
    timezone,
    maxRetries
  ]);

  const getMessageTypeIcon = () => {
    switch (messageType) {
      case 'image': return <Image className="h-4 w-4" />;
      case 'video': return <Video className="h-4 w-4" />;
      case 'audio': return <FileAudio className="h-4 w-4" />;
      case 'document': return <FileText className="h-4 w-4" />;
      default: return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getTriggerEventLabel = () => {
    switch (triggerEvent) {
      case 'conversation_start': return t('flow_builder.conversation_start', 'Conversation Start');
      case 'specific_datetime': return t('flow_builder.specific_datetime', 'Specific Date/Time');
      case 'relative_delay': return t('flow_builder.relative_delay', 'Relative Delay');
      default: return t('flow_builder.conversation_start', 'Conversation Start');
    }
  };

  const getDelayDisplay = () => {
    if (triggerEvent === 'specific_datetime') {
      return specificDatetime ?
        new Date(specificDatetime).toLocaleString() :
        t('flow_builder.no_date_set', 'No date set');
    }
    return `${delayAmount} ${delayUnit}`;
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
          toast({
            title: t('common.upload_complete', 'Upload complete'),
            description: t('flow_builder.media_uploaded_successfully', 'Media uploaded successfully')
          });
        } else {
          toast({
            title: t('common.upload_failed', 'Upload failed'),
            description: t('flow_builder.error_uploading_media', 'There was an error uploading your media'),
            variant: 'destructive'
          });
        }
      };

      xhr.onerror = () => {
        setIsUploading(false);
        toast({
          title: t('common.upload_failed', 'Upload failed'),
          description: t('flow_builder.error_uploading_media', 'There was an error uploading your media'),
          variant: 'destructive'
        });
      };

      xhr.send(formData);
    } catch (error) {
      setIsUploading(false);
      toast({
        title: t('common.upload_failed', 'Upload failed'),
        description: t('flow_builder.error_uploading_media', 'There was an error uploading your media'),
        variant: 'destructive'
      });
    }
  };

  const getFileType = () => {
    switch (messageType) {
      case 'image': return 'image/*';
      case 'video': return 'video/*';
      case 'audio': return 'audio/*';
      case 'document': return '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar';
      default: return '*/*';
    }
  };

  const insertVariableIntoMessage = (variable: string) => {
    const textArea = document.getElementById(`followup-message-textarea-${id}`) as HTMLTextAreaElement;
    if (!textArea) return;

    const cursorPos = textArea.selectionStart;
    const variableText = `{{${variable}}}`;
    const newMessage = messageContent.substring(0, cursorPos) + variableText + messageContent.substring(cursorPos);

    setMessageContent(newMessage);

    setTimeout(() => {
      textArea.focus();
      textArea.setSelectionRange(cursorPos + variableText.length, cursorPos + variableText.length);
    }, 0);
  };

  const insertVariableIntoCaption = (variable: string) => {
    const textArea = document.getElementById(`followup-caption-textarea-${id}`) as HTMLTextAreaElement;
    if (!textArea) return;

    const cursorPos = textArea.selectionStart;
    const variableText = `{{${variable}}}`;
    const newCaption = caption.substring(0, cursorPos) + variableText + caption.substring(cursorPos);

    setCaption(newCaption);

    setTimeout(() => {
      textArea.focus();
      textArea.setSelectionRange(cursorPos + variableText.length, cursorPos + variableText.length);
    }, 0);
  };

  const applyTemplate = () => {
    if (messageType === 'text') {
      setMessageContent(defaultTemplates.text);
    }
  };



  return (
    <div className="node-follow-up rounded-lg bg-white border border-orange-200 shadow-sm max-w-[320px] group relative">
      <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onDuplicateNode(id)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{t('flow_builder.duplicate_node', 'Duplicate node')}</p>
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
                onClick={() => onDeleteNode(id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{t('flow_builder.delete_node', 'Delete node')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="p-3 border-b border-orange-100 bg-orange-50/30">
        <div className="font-medium flex items-center gap-2">
          <Clock className="h-4 w-4 text-orange-600" />
          <span>{t('flow_builder.follow_up_message', 'Follow-up Message')}</span>
        <button
                className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? (
                  <>
                    <EyeOff className="h-3 w-3" />
                    Hide
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3" />
                    Edit
                  </>
                )}
              </button>
        </div>
      </div>

      <div className={`${isEditing ? 'max-h-[500px]' : 'max-h-[200px]'} overflow-y-auto custom-scrollbar`}>
        <div className="p-3 space-y-3">

          <div className="text-sm p-3  rounded border border-border">
            <div className="flex items-center gap-2 mb-2">
              {getMessageTypeIcon()}
              <span className="font-medium">
                {messageType.charAt(0).toUpperCase() + messageType.slice(1)} {t('flow_builder.message', 'Message')}
              </span>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                <span>{getTriggerEventLabel()}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3" />
                <span>{getDelayDisplay()}</span>
              </div>
            </div>

            {messageContent && (
              <div className="text-xs bg-background/80 p-2 rounded border border-border mt-2">
                {messageContent.length > 50
                  ? `${messageContent.substring(0, 50)}...`
                  : messageContent}
              </div>
            )}
          </div>

          {isEditing && (
            <>
              <div className="border rounded-lg p-3 bg-gradient-to-r from-blue-50 to-indigo-50">
                <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  {getMessageTypeIcon()}
                  {t('flow_builder.message_config', 'Message Configuration')}
                </h3>
                <div className="space-y-2">
                  <Label className="text-[10px] font-medium text-gray-700">{t('flow_builder.message_type', 'Message Type')}</Label>
                  <Select
                    value={messageType}
                    onValueChange={(value: any) => setMessageType(value)}
                  >
                    <SelectTrigger className="text-xs h-7">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">{t('flow_builder.text_message', 'Text Message')}</SelectItem>
                      <SelectItem value="image">{t('flow_builder.image', 'Image')}</SelectItem>
                      <SelectItem value="video">{t('flow_builder.video', 'Video')}</SelectItem>
                      <SelectItem value="audio">{t('flow_builder.audio', 'Audio')}</SelectItem>
                      <SelectItem value="document">{t('flow_builder.document', 'Document')}</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="text-[10px] text-muted-foreground">
                    {messageType === 'text' && t('flow_builder.text_message_desc', 'Sends a text message with optional variable substitution')}
                    {messageType === 'image' && t('flow_builder.image_message_desc', 'Sends an uploaded image file with optional caption')}
                    {messageType === 'video' && t('flow_builder.video_message_desc', 'Sends an uploaded video file with optional caption')}
                    {messageType === 'audio' && t('flow_builder.audio_message_desc', 'Sends an uploaded audio file (no caption support)')}
                    {messageType === 'document' && t('flow_builder.document_message_desc', 'Sends an uploaded document file with optional caption')}
                  </div>
                </div>

                {messageType === 'text' ? (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-medium text-gray-700">{t('flow_builder.template', 'Template')}</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => applyTemplate()}
                        className="w-full text-xs h-7 justify-start"
                      >
                        {t('flow_builder.use_default_template', 'Use Default Template')}
                      </Button>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-medium text-gray-700">{t('flow_builder.message_content', 'Message Content')}</Label>
                      <Textarea
                        id={`followup-message-textarea-${id}`}
                        placeholder={t('flow_builder.enter_follow_up_message', 'Enter your follow-up message...')}
                        value={messageContent}
                        onChange={(e) => setMessageContent(e.target.value)}
                        className="text-xs h-20 resize-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-medium text-gray-700">{t('flow_builder.insert_variable', 'Insert Variable:')}</Label>
                      <div className="flex flex-wrap gap-1">
                        {availableVariables.map((variable) => (
                          <button
                            key={variable.name}
                            className="text-[10px] px-2 py-1  rounded hover:"
                            title={variable.description}
                            onClick={() => insertVariableIntoMessage(variable.name)}
                          >
                            {variable.name}
                          </button>
                        ))}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {t('flow_builder.variables_replaced_desc', 'Variables will be replaced with actual values when message is sent.')}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-medium text-gray-700">
                        {t('flow_builder.upload_media', 'Upload Media')}
                      </Label>
                      <FileUpload
                        onFileSelected={handleFileSelected}
                        fileType={getFileType()}
                        maxSize={30}
                        className="w-full"
                        showProgress={isUploading}
                        progress={uploadProgress}
                      />
                      {mediaUrl && !isUploading && (
                        <div className="text-[10px] text-green-600 bg-green-50 p-1 rounded">
                          ✓ {t('flow_builder.file_uploaded', 'File uploaded successfully')}
                        </div>
                      )}
                    </div>

                    {messageType !== 'audio' && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-medium text-gray-700">{t('flow_builder.caption_optional', 'Caption (Optional)')}</Label>
                          <Textarea
                            id={`followup-caption-textarea-${id}`}
                            placeholder={t('flow_builder.enter_caption', 'Enter caption for media...')}
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                            className="text-xs h-16 resize-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-[10px] font-medium text-gray-700">{t('flow_builder.insert_variable', 'Insert Variable:')}</Label>
                          <div className="flex flex-wrap gap-1">
                            {availableVariables.map((variable) => (
                              <button
                                key={variable.name}
                                className="text-[10px] px-2 py-1  rounded hover:"
                                title={variable.description}
                                onClick={() => insertVariableIntoCaption(variable.name)}
                              >
                                {variable.name}
                              </button>
                            ))}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {t('flow_builder.variables_replaced_desc', 'Variables will be replaced with actual values when message is sent.')}
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>

              <div className="border rounded-lg p-3 bg-gradient-to-r from-green-50 to-emerald-50">
                <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {t('flow_builder.timing_config', 'Timing Configuration')}
                </h3>

                <div className="space-y-2">
                  <Label className="text-[10px] font-medium text-gray-700">{t('flow_builder.trigger_event', 'Trigger Event')}</Label>
                  <Select
                    value={triggerEvent}
                    onValueChange={(value: any) => setTriggerEvent(value)}
                  >
                    <SelectTrigger className="text-xs h-7">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conversation_start">{t('flow_builder.conversation_start', 'Conversation Start')}</SelectItem>
                      <SelectItem value="relative_delay">{t('flow_builder.relative_delay', 'Relative Delay')}</SelectItem>
                      <SelectItem value="specific_datetime">{t('flow_builder.specific_datetime', 'Specific Date/Time')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {triggerEvent === 'specific_datetime' ? (
                  <div className="space-y-2">
                    <Label className="text-[10px] font-medium text-gray-700">{t('flow_builder.date_and_time', 'Date and Time')}</Label>
                    <Input
                      type="datetime-local"
                      value={specificDatetime}
                      onChange={(e) => {
                        setSpecificDatetime(e.target.value);
                      }}
                      className="text-xs h-7"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      {t('flow_builder.datetime_timezone_note',
                        `Enter time as it should appear in ${timezone || 'UTC'} timezone`)}
                    </p>

                    <Label className="text-[10px] font-medium text-gray-700">{t('flow_builder.timezone', 'Timezone')}</Label>
                    <TimezoneSelector
                      value={timezone}
                      onValueChange={setTimezone}
                      placeholder={t('flow_builder.select_timezone', 'Select timezone...')}
                      className="w-full"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      {t('flow_builder.timezone_desc', 'Message will be sent at the specified time in this timezone')}
                    </p>

                    {specificDatetime && timezone && (
                      <div className="text-[10px] p-2 bg-blue-50 rounded border border-blue-200">
                        <div className="font-medium text-blue-800">Scheduled Time Preview:</div>
                        <div className="text-blue-700">
                          Local: {new Date(specificDatetime).toLocaleString()} ({timezone})
                        </div>
                        <div className="text-blue-600">
                          UTC: {new Date(specificDatetime).toISOString()}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-medium text-gray-700">{t('flow_builder.delay_amount', 'Delay Amount')}</Label>
                      <NumberInput
                        min={1}
                        value={delayAmount}
                        onChange={setDelayAmount}
                        fallbackValue={1}
                        className="text-xs h-7"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-medium text-gray-700">{t('flow_builder.delay_unit', 'Delay Unit')}</Label>
                      <Select
                        value={delayUnit}
                        onValueChange={(value: any) => setDelayUnit(value)}
                      >
                        <SelectTrigger className="text-xs h-7">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="minutes">{t('flow_builder.minutes', 'Minutes')}</SelectItem>
                          <SelectItem value="hours">{t('flow_builder.hours', 'Hours')}</SelectItem>
                          <SelectItem value="days">{t('flow_builder.days', 'Days')}</SelectItem>
                          <SelectItem value="weeks">{t('flow_builder.weeks', 'Weeks')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}


              </div>

              <div className="border rounded-lg p-3 bg-gradient-to-r from-purple-50 to-pink-50">
                <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {t('flow_builder.advanced_config', 'Advanced Configuration')}
                </h3>

                <div className="space-y-2">
                  <Label className="text-[10px] font-medium text-gray-700">{t('flow_builder.max_retries', 'Max Retries')}</Label>
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={maxRetries}
                    onChange={(e) => setMaxRetries(parseInt(e.target.value) || 3)}
                    className="text-xs h-7"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {t('flow_builder.retry_attempts_desc', 'Number of retry attempts if message delivery fails')}
                  </p>
                </div>
              </div>

            </>
          )}
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
    </div>
  );
}

export default FollowUpNode;
