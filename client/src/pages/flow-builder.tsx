import { AIAssistantNode } from '@/components/flow-builder/AIAssistantNode';
import { BotDisableNode } from '@/components/flow-builder/BotDisableNode';
import { BotResetNode } from '@/components/flow-builder/BotResetNode';
import { DocumindNode } from '@/components/flow-builder/DocumindNode';
import { ChatPdfNode } from '@/components/flow-builder/ChatPdfNode';
import { GoogleSheetsNode } from '@/components/flow-builder/GoogleSheetsNode';
import { DataCaptureNode } from '@/components/flow-builder/DataCaptureNode';
import { VariableBrowser } from '@/components/flow-builder/VariableBrowser';
import { N8nNode } from '@/components/flow-builder/N8nNode';
import { MakeNode } from '@/components/flow-builder/MakeNode';
import { AIFlowAssistant } from '@/components/flow-builder/AIFlowAssistant';
import WhatsAppInteractiveButtonsNode from '@/components/flow-builder/WhatsAppInteractiveButtonsNode';
import WhatsAppInteractiveListNode from '@/components/flow-builder/WhatsAppInteractiveListNode';
import WhatsAppCTAURLNode from '@/components/flow-builder/WhatsAppCTAURLNode';
import WhatsAppLocationRequestNode from '@/components/flow-builder/WhatsAppLocationRequestNode';
import WhatsAppPollNode from '@/components/flow-builder/WhatsAppPollNode';

import { HTTPRequestNode } from '@/components/flow-builder/HTTPRequestNode';
import { CodeExecutionNode } from '@/components/flow-builder/CodeExecutionNode';
import { WhatsAppFlowsNode } from '@/components/flow-builder/WhatsAppFlowsNode';
import { TranslationNode } from '@/components/flow-builder/TranslationNode';
import UpdatePipelineStageNode from '@/components/flow-builder/UpdatePipelineStageNode';
import MoveDealToPipelineNode from '@/components/flow-builder/MoveDealToPipelineNode';
import ManageContactNode from '@/components/flow-builder/ManageContactNode';
import { WebhookNode } from '@/components/flow-builder/WebhookNode';
import { ContactNotificationNode } from '@/components/flow-builder/ContactNotificationNode';
import { StripeNode } from '@/components/flow-builder/StripeNode';
import { CallAgentNode } from '@/components/flow-builder/CallAgentNode';
import { Button } from '@/components/ui/button';
import { Calendar } from "@/components/ui/calendar";
import { FileUpload } from '@/components/ui/file-upload';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem, SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useTheme } from 'next-themes';
import { getBrowserTimezone } from '@/utils/timezones';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowRightCircle,
  Bot,
  Calendar as CalendarIcon,
  Clock,
  Copy,
  Database,
  File,
  FileAudio, FileText, FileVideo,
  Globe,
  LayoutGrid,
  Loader2,
  MessageSquare,
  Network,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  User,
  UserCheck,
  Variable,
  X,
  Code
} from 'lucide-react';
import { nanoid } from 'nanoid';
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  addEdge,
  Background,
  BaseEdge,
  Connection,
  Controls,
  Edge,
  EdgeLabelRenderer,
  EdgeProps,
  getSmoothStepPath,
  MiniMap,
  Node,
  NodeTypes,
  Panel,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Link, useLocation, useRoute } from 'wouter';
import { autoArrangeFlow } from '@/utils/flow-layout';

const CalendarClock = (props: any) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7.5" />
    <path d="M16 2v4" />
    <path d="M8 2v4" />
    <path d="M3 10h5" />
    <path d="M17.5 17.5 16 16.25V14" />
    <path d="M22 16a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z" />
  </svg>
);



import { noHandleStyle, standardHandleStyle, yesHandleStyle } from '@/components/flow-builder/StyledHandle';
import { Handle, Position } from 'reactflow';

const AudioPreview = React.memo(({ url }: { url: string }) => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [metadata, setMetadata] = useState<{ duration?: number }>({});

  React.useEffect(() => {
    if (url) {
      setIsLoading(true);
      setHasError(false);
      setMetadata({});
    }
  }, [url]);

  const handleLoadedMetadata = React.useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    const audio = e.currentTarget;
    setMetadata({ duration: audio.duration });
    setIsLoading(false);
    setHasError(false);
  }, []);

  const handleError = React.useCallback(() => {
    setIsLoading(false);
    setHasError(true);
  }, []);

  const formatDuration = React.useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const fileName = React.useMemo(() => {
    return url.split('/').pop() || 'audio file';
  }, [url]);

  if (!url) return null;

  return (
    <div className="mt-2 p-2 rounded border">
      <div className="flex items-center gap-2 mb-2">
        <FileAudio className="h-4 w-4 text-purple-500" />
        <span className="text-xs font-medium truncate">{fileName}</span>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-500"></div>
          <span className="ml-2 text-xs text-muted-foreground">{t('flow_builder.preview.loading_audio', 'Loading audio...')}</span>
        </div>
      )}

      {hasError && (
        <div className="flex items-center justify-center py-4 text-red-500">
          <span className="text-xs">{t('flow_builder.preview.failed_audio', 'Failed to load audio')}</span>
        </div>
      )}

      {!hasError && (
        <audio
          src={url}
          controls
          className="w-full h-8"
          onLoadedMetadata={handleLoadedMetadata}
          onError={handleError}
          preload="metadata"
        />
      )}

      {metadata.duration && (
        <div className="mt-1 text-xs text-muted-foreground">
          {t('flow_builder.preview.duration', 'Duration')}: {formatDuration(metadata.duration)}
        </div>
      )}
    </div>
  );
});

const VideoPreview = React.memo(({ url }: { url: string }) => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [metadata, setMetadata] = useState<{ duration?: number; width?: number; height?: number }>({});

  React.useEffect(() => {
    if (url) {
      setIsLoading(true);
      setHasError(false);
      setMetadata({});
    }
  }, [url]);

  const handleLoadedMetadata = React.useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    setMetadata({
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight
    });
    setIsLoading(false);
    setHasError(false);
  }, []);

  const handleError = React.useCallback(() => {
    setIsLoading(false);
    setHasError(true);
  }, []);

  const formatDuration = React.useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const fileName = React.useMemo(() => {
    return url.split('/').pop() || 'video file';
  }, [url]);

  if (!url) return null;

  return (
    <div className="mt-2 p-2  rounded border">
      <div className="flex items-center gap-2 mb-2">
        <FileVideo className="h-4 w-4 text-red-500" />
        <span className="text-xs font-medium truncate">{fileName}</span>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8 bg-black/5 rounded">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-500"></div>
          <span className="ml-2 text-xs text-muted-foreground">{t('flow_builder.preview.loading_video', 'Loading video...')}</span>
        </div>
      )}

      {hasError && (
        <div className="flex items-center justify-center py-8 bg-black/5 rounded text-red-500">
          <FileVideo className="h-6 w-6 mr-2" />
          <span className="text-xs">{t('flow_builder.preview.failed_video', 'Failed to load video')}</span>
        </div>
      )}

      {!hasError && (
        <video
          src={url}
          controls
          className="w-full max-h-32 bg-black rounded"
          onLoadedMetadata={handleLoadedMetadata}
          onError={handleError}
          preload="metadata"
        />
      )}

      {metadata.duration && (
        <div className="mt-1 text-xs text-muted-foreground flex gap-4">
          <span>{t('flow_builder.preview.duration', 'Duration')}: {formatDuration(metadata.duration)}</span>
          {metadata.width && metadata.height && (
            <span>{t('flow_builder.preview.resolution', 'Resolution')}: {metadata.width}x{metadata.height}</span>
          )}
        </div>
      )}
    </div>
  );
});

const DocumentPreview = React.memo(({ url, fileName }: { url: string; fileName?: string }) => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  React.useEffect(() => {
    if (url) {
      setIsLoading(true);
      setHasError(false);
    }
  }, [url]);

  const getFileExtension = React.useCallback((url: string) => {
    const name = fileName || url.split('/').pop() || '';
    return name.split('.').pop()?.toLowerCase() || '';
  }, [fileName, url]);

  const getFileIcon = React.useCallback((extension: string) => {
    switch (extension) {
      case 'pdf':
        return '📄';
      case 'doc':
      case 'docx':
        return '📝';
      case 'xls':
      case 'xlsx':
        return '📊';
      case 'ppt':
      case 'pptx':
        return '📽️';
      case 'txt':
        return '📃';
      case 'zip':
      case 'rar':
        return '🗜️';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return '🖼️';
      default:
        return '📁';
    }
  }, []);

  const getFileTypeLabel = React.useCallback((extension: string) => {
    switch (extension) {
      case 'pdf':
        return 'PDF Document';
      case 'doc':
      case 'docx':
        return 'Word Document';
      case 'xls':
      case 'xlsx':
        return 'Excel Spreadsheet';
      case 'ppt':
      case 'pptx':
        return 'PowerPoint Presentation';
      case 'txt':
        return 'Text File';
      case 'zip':
      case 'rar':
        return 'Archive File';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return 'Image File';
      default:
        return 'Document';
    }
  }, []);

  const displayFileName = React.useMemo(() => {
    return fileName || url.split('/').pop() || 'document';
  }, [fileName, url]);

  const extension = React.useMemo(() => getFileExtension(url), [getFileExtension, url]);
  const isImage = React.useMemo(() => ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension), [extension]);

  const handleImageLoad = React.useCallback(() => {
    setIsLoading(false);
    setHasError(false);
  }, []);

  const handleImageError = React.useCallback(() => {
    setIsLoading(false);
    setHasError(true);
  }, []);

  if (!url) return null;

  return (
    <div className="mt-2 p-2  rounded border">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{getFileIcon(extension)}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{displayFileName}</div>
          <div className="text-xs text-muted-foreground">{getFileTypeLabel(extension)}</div>
        </div>
      </div>

      {isImage ? (
        <div className="relative">
          {isLoading && (
            <div className="flex items-center justify-center py-8 bg-black/5 rounded">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-600"></div>
              <span className="ml-2 text-xs text-muted-foreground">{t('flow_builder.preview.loading_image', 'Loading image...')}</span>
            </div>
          )}
          {hasError && (
            <div className="flex items-center justify-center py-8 bg-black/5 rounded text-red-500">
              <span className="text-xs">{t('flow_builder.preview.failed_image', 'Failed to load image')}</span>
            </div>
          )}
          <img
            src={url}
            alt={displayFileName}
            className={`w-full max-h-32 object-cover rounded ${isLoading ? 'hidden' : ''}`}
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        </div>
      ) : (
        <div className="flex items-center justify-between p-2 rounded">
          <span className="text-xs text-muted-foreground">{t('flow_builder.preview.click_to_download', 'Click to download/view')}</span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/80"
          >
            {t('flow_builder.preview.open_document', 'Open')}
          </a>
        </div>
      )}
    </div>
  );
});

function NodeToolbar({ id, onDuplicate, onDelete }: { id: string; onDuplicate: (id: string) => void; onDelete: (id: string) => void }) {
  const { t } = useTranslation();

  return (
    <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onDuplicate(id)}
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
              onClick={() => onDelete(id)}
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
  );
}

const FlowContext = React.createContext<{
  onDeleteNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
} | null>(null);

interface MessageKeyword {
  id: string;
  text: string;
  value: string;
  caseSensitive: boolean;
}

function MessageNode({ data, isConnectable, id }: any) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState(data.message || t('flow_builder.default_message', "Hello! How can I help you?"));
  const [keywords, setKeywords] = useState<MessageKeyword[]>(
    data.keywords || []
  );
  const [enableKeywordTriggers, setEnableKeywordTriggers] = useState(data.enableKeywordTriggers || false);
  const { setNodes } = useReactFlow();
  const flowContext = useFlowContext();

  const availableVariables = [
    { name: "contact.name", description: t('flow_builder.var_contact_name', "Contact's name") },
    { name: "contact.phone", description: t('flow_builder.var_contact_phone', "Contact's phone number") },
    { name: "message.content", description: t('flow_builder.var_message_content', "Received message content") },
    { name: "date.today", description: t('flow_builder.var_date_today', "Current date") },
    { name: "time.now", description: t('flow_builder.var_time_now', "Current time") },
    { name: "availability", description: t('flow_builder.var_availability', "Google Calendar availability data from previous node") }
  ];

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

  const handleEnableKeywordTriggersChange = (checked: boolean) => {
    setEnableKeywordTriggers(checked);
    updateNodeData({ enableKeywordTriggers: checked });
  };

  const addKeyword = () => {
    const defaultValue = `keyword${keywords.length + 1}`;
    const newKeyword: MessageKeyword = {
      id: Date.now().toString(),
      text: defaultValue, // Set text to match value
      value: defaultValue,
      caseSensitive: false
    };
    const newKeywords = [...keywords, newKeyword];
    setKeywords(newKeywords);
    updateNodeData({ keywords: newKeywords });
  };

  const removeKeyword = (keywordId: string) => {
    const newKeywords = keywords.filter(k => k.id !== keywordId);
    setKeywords(newKeywords);
    updateNodeData({ keywords: newKeywords });
  };

  const updateKeyword = (keywordId: string, field: keyof MessageKeyword, value: any) => {
    const newKeywords = keywords.map(k => {
      if (k.id === keywordId) {
        const updatedKeyword = { ...k, [field]: value };

        if (field === 'value') {
          updatedKeyword.text = value;
        }
        return updatedKeyword;
      }
      return k;
    });
    setKeywords(newKeywords);
    updateNodeData({ keywords: newKeywords });
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newMessage = e.target.value;
    setMessage(newMessage);
    updateNodeData({ message: newMessage });
  };

  const insertVariable = (variable: string) => {
    const textArea = document.getElementById(`message-textarea-${id}`) as HTMLTextAreaElement;
    if (!textArea) return;

    const cursorPos = textArea.selectionStart;
    const variableText = `{{${variable}}}`;
    const newMessage = message.substring(0, cursorPos) + variableText + message.substring(cursorPos);

    setMessage(newMessage);
    updateNodeData({ message: newMessage });

    setTimeout(() => {
      textArea.focus();
      textArea.setSelectionRange(cursorPos + variableText.length, cursorPos + variableText.length);
    }, 0);
  };

  const formatMessage = (message: string) => {
    const regex = /\{\{([^}]+)\}\}/g;

    if (!regex.test(message)) {
      return message;
    }

    const parts = [];
    let lastIndex = 0;
    let match;

    regex.lastIndex = 0;
    while ((match = regex.exec(message)) !== null) {
      if (match.index > lastIndex) {
        parts.push(message.substring(lastIndex, match.index));
      }

      parts.push(
        <span key={match.index} className="bg-primary/10 text-primary px-1 rounded">
          {match[0]}
        </span>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < message.length) {
      parts.push(message.substring(lastIndex));
    }

    return parts;
  };

  return (
    <div className="node-message p-3 rounded-lg bg-card border border-border shadow-sm max-w-[350px] group">
      {flowContext && (
        <NodeToolbar
          id={id}
          onDuplicate={flowContext.onDuplicateNode}
          onDelete={flowContext.onDeleteNode}
        />
      )}
      <div className="font-medium flex items-center gap-2 mb-2">
        <img src="https://cdn-icons-png.flaticon.com/128/811/811476.png" alt="Text Message" className="h-4 w-4" />
        <span>{t('flow_builder.send_message', 'Send Message')}</span>
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
            <label className="text-xs font-medium mb-1 block">{t('flow_builder.message_content', 'Message Content:')}</label>
            <textarea
              id={`message-textarea-${id}`}
              className="w-full p-2 text-sm border rounded min-h-[80px] resize-none"
              value={message}
              onChange={handleMessageChange}
              placeholder={t('flow_builder.type_message_placeholder', 'Type your message here...')}
            />

            <div className="mt-2">
              <p className="text-xs font-medium mb-1">{t('flow_builder.insert_variable', 'Insert Variable:')}</p>
              <div className="flex flex-wrap gap-1">
                {availableVariables.map((variable) => (
                  <button
                    key={variable.name}
                    className="text-xs px-2 py-1 rounded "
                    title={variable.description}
                    onClick={() => insertVariable(variable.name)}
                  >
                    {variable.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[10px] text-muted-foreground mt-1">
              {t('flow_builder.variables_help', 'Variables will be replaced with actual values when message is sent.')}
            </div>
          </div>

          {/* Keyword Triggers Section */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">{t('flow_builder.keyword_triggers', 'Keyword Triggers:')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`enable-keywords-${id}`}
                  checked={enableKeywordTriggers}
                  onChange={(e) => handleEnableKeywordTriggersChange(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor={`enable-keywords-${id}`} className="text-xs text-muted-foreground">
                  {t('flow_builder.enable_keyword_triggers', 'Enable keyword-based routing')}
                </label>
              </div>
            </div>

            {enableKeywordTriggers && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {t('flow_builder.keywords_help', 'Define keywords that will route to different paths when users respond:')}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={addKeyword}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {t('flow_builder.add_keyword', 'Add Keyword')}
                  </Button>
                </div>

                {keywords.length > 0 && (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {keywords.map((keyword, index) => (
                      <div key={keyword.id} className="border rounded p-2 space-y-2 relative">
                        <div className="flex items-center gap-2">
                          <div className="flex-shrink-0 w-6 h-6 rounded-md bg-primary text-white flex items-center justify-center text-xs font-medium">
                            {index + 1}
                          </div>
                          <div className="flex-1 text-xs font-medium">Keyword {index + 1}</div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => removeKeyword(keyword.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>

                        <div className="pl-8 space-y-2">
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Match Value:</label>
                            <input
                              className="w-full p-1.5 text-xs border rounded"
                              value={keyword.value}
                              onChange={(e) => updateKeyword(keyword.id, 'value', e.target.value)}
                              placeholder="Text to match"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`case-sensitive-${keyword.id}`}
                              checked={keyword.caseSensitive}
                              onChange={(e) => updateKeyword(keyword.id, 'caseSensitive', e.target.checked)}
                              className="w-3 h-3"
                            />
                            <label htmlFor={`case-sensitive-${keyword.id}`} className="text-xs text-muted-foreground">
                              Case sensitive
                            </label>
                          </div>
                        </div>

                        {/* Output handle for this keyword */}
                        <Handle
                          type="source"
                          position={Position.Right}
                          id={`keyword-${keyword.value.toLowerCase().replace(/\s+/g, '-')}`}
                          style={{
                            ...standardHandleStyle,
                            top: '20px',
                            right: '-12px'
                          }}
                          isConnectable={isConnectable}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {enableKeywordTriggers && (
                  <div className="text-[10px] text-muted-foreground space-y-1">
                    <div>Each keyword will create its own output connection.</div>
                    <div>A "no match" output will be available for unmatched responses.</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-sm p-2 rounded border border-border">
            {formatMessage(message)}
          </div>

          {enableKeywordTriggers && keywords.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <div className="font-medium mb-1">{t('flow_builder.keyword_triggers_active', 'Keyword Triggers Active:')}</div>
              <div className="space-y-1">
                {keywords.map((keyword, index) => (
                  <div key={keyword.id} className="flex items-center gap-2 relative">
                    <div className="flex-shrink-0 w-4 h-4 rounded bg-primary text-white flex items-center justify-center text-[10px] font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <span className="font-medium">{keyword.text}</span>
                      <span className="text-muted-foreground/70"> → "{keyword.value}"</span>
                      {keyword.caseSensitive && <span className="text-orange-600 ml-1">(case sensitive)</span>}
                    </div>

                    {/* Output handle for this keyword */}
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={`keyword-${keyword.value.toLowerCase().replace(/\s+/g, '-')}`}
                      style={{
                        ...standardHandleStyle,
                        top: '50%',
                        right: '-12px'
                      }}
                      isConnectable={isConnectable}
                    />
                  </div>
                ))}

                {/* No match handle */}
                <div className="flex items-center gap-2 relative mt-2 pt-2 border-t border-border/50">
                  <div className="flex-shrink-0 w-4 h-4 rounded bg-muted-foreground text-primary-foreground flex items-center justify-center text-[10px] font-medium">
                    ?
                  </div>
                  <div className="flex-1 text-muted-foreground">
                    {t('flow_builder.no_match_route', 'No keyword match')}
                  </div>

                  <Handle
                    type="source"
                    position={Position.Right}
                    id="no-match"
                    style={{
                      ...standardHandleStyle,
                      top: '50%',
                      right: '-12px',
                      background: '#9ca3af'
                    }}
                    isConnectable={isConnectable}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />

      {/* Output handles only shown when keyword triggers are enabled */}
    </div>
  );
}

const getConditionTypes = (t: any) => ({
  MESSAGE_CONTAINS: t('flow_builder.condition_types.message_contains', "Message Contains"),
  EXACT_MATCH: t('flow_builder.condition_types.exact_match', "Exact Match"),
  REGEX_MATCH: t('flow_builder.condition_types.regex_match', "Regex Match"),
  MESSAGE_STARTS_WITH: t('flow_builder.condition_types.message_starts_with', "Message Starts With"),
  MESSAGE_ENDS_WITH: t('flow_builder.condition_types.message_ends_with', "Message Ends With"),
  HAS_MEDIA: t('flow_builder.condition_types.has_media', "Has Media"),
  MEDIA_TYPE: t('flow_builder.condition_types.media_type_is', "Media Type Is"),
  TIME_BASED: t('flow_builder.condition_types.time_condition', "Time Condition"),
  CONTACT_ATTRIBUTE: t('flow_builder.condition_types.contact_attribute', "Contact Attribute"),
  CUSTOM: t('flow_builder.condition_types.custom_expression', "Custom Expression")
});

const MEDIA_TYPES = [
  "image",
  "video",
  "audio",
  "document",
  "sticker"
];

function ConditionNode({ data, isConnectable, id }: any) {
  const { t } = useTranslation();
  const CONDITION_TYPES = getConditionTypes(t);
  const [isEditing, setIsEditing] = useState(false);
  const [conditionType, setConditionType] = useState(data.conditionType || CONDITION_TYPES.MESSAGE_CONTAINS);
  const [conditionValue, setConditionValue] = useState(data.conditionValue || "");
  const [caseSensitive, setCaseSensitive] = useState(data.caseSensitive || false);
  const [mediaType, setMediaType] = useState(data.mediaType || MEDIA_TYPES[0]);
  const [timeOperator, setTimeOperator] = useState(data.timeOperator || "after");
  const [timeValue, setTimeValue] = useState(data.timeValue || "");
  const [contactAttribute, setContactAttribute] = useState(data.contactAttribute || "name");
  const [attributeValue, setAttributeValue] = useState(data.attributeValue || "");
  const [advancedMode, setAdvancedMode] = useState(data.advancedMode || false);
  const [customCondition, setCustomCondition] = useState(data.customCondition || "Contains('hello')");

  const [condition, setCondition] = useState(data.condition || "Contains('hello')");

  const { setNodes } = useReactFlow();
  const flowContext = useFlowContext();

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

  const updateConditionText = useCallback(() => {
    let newCondition = "";
    if (advancedMode) {
      newCondition = customCondition;
    } else {
      switch (conditionType) {
        case CONDITION_TYPES.MESSAGE_CONTAINS:
          newCondition = `Contains('${conditionValue}'${caseSensitive ? ', true' : ''})`;
          break;
        case CONDITION_TYPES.EXACT_MATCH:
          newCondition = `ExactMatch('${conditionValue}'${caseSensitive ? ', true' : ''})`;
          break;
        case CONDITION_TYPES.REGEX_MATCH:
          newCondition = `RegexMatch('${conditionValue}')`;
          break;
        case CONDITION_TYPES.MESSAGE_STARTS_WITH:
          newCondition = `StartsWith('${conditionValue}'${caseSensitive ? ', true' : ''})`;
          break;
        case CONDITION_TYPES.MESSAGE_ENDS_WITH:
          newCondition = `EndsWith('${conditionValue}'${caseSensitive ? ', true' : ''})`;
          break;
        case CONDITION_TYPES.HAS_MEDIA:
          newCondition = `HasMedia()`;
          break;
        case CONDITION_TYPES.MEDIA_TYPE:
          newCondition = `MediaType('${mediaType}')`;
          break;
        case CONDITION_TYPES.TIME_BASED:
          newCondition = `Time${timeOperator.charAt(0).toUpperCase() + timeOperator.slice(1)}('${timeValue}')`;
          break;
        case CONDITION_TYPES.CONTACT_ATTRIBUTE:
          newCondition = `Contact.${contactAttribute} == '${attributeValue}'`;
          break;
        default:
          newCondition = `Contains('${conditionValue}')`;
      }
    }

    setCondition(newCondition);
    updateNodeData({
      condition: newCondition,
      conditionType,
      conditionValue,
      caseSensitive,
      mediaType,
      timeOperator,
      timeValue,
      contactAttribute,
      attributeValue,
      advancedMode,
      customCondition
    });
  }, [
    advancedMode, conditionType, conditionValue, caseSensitive,
    mediaType, timeOperator, timeValue, contactAttribute,
    attributeValue, customCondition, updateNodeData
  ]);

  const handleConditionTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setConditionType(e.target.value);
  };

  const handleConditionValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConditionValue(e.target.value);
  };

  const handleTimeValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTimeValue(e.target.value);
  };

  const handleCustomConditionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomCondition(e.target.value);
  };

  const handleDoneClick = () => {
    updateConditionText();
    setIsEditing(false);
  };

  const renderConditionInputs = () => {
    if (advancedMode) {
      return (
        <div className="space-y-2">
          <input
            className="w-full p-2 text-sm border rounded"
            value={customCondition}
            onChange={handleCustomConditionChange}
            placeholder={t('flow_builder.enter_custom_condition', 'Enter custom condition')}
          />
          <div className="text-[10px] text-muted-foreground">
            {t('flow_builder.condition_examples', "Examples: Contains('help'), IsMedia(), ExactMatch('hello')")}
          </div>
        </div>
      );
    }

    switch (conditionType) {
      case CONDITION_TYPES.MESSAGE_CONTAINS:
      case CONDITION_TYPES.EXACT_MATCH:
      case CONDITION_TYPES.REGEX_MATCH:
      case CONDITION_TYPES.MESSAGE_STARTS_WITH:
      case CONDITION_TYPES.MESSAGE_ENDS_WITH:
        return (
          <div className="space-y-2">
            <input
              className="w-full p-2 text-sm border rounded"
              value={conditionValue}
              onChange={handleConditionValueChange}
              placeholder={t('flow_builder.enter_text_value', 'Enter text value')}
            />
            {conditionType !== CONDITION_TYPES.REGEX_MATCH && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`case-sensitive-${id}`}
                  checked={caseSensitive}
                  onChange={(e) => setCaseSensitive(e.target.checked)}
                />
                <label htmlFor={`case-sensitive-${id}`} className="text-xs">
                  {t('flow_builder.case_sensitive', 'Case sensitive')}
                </label>
              </div>
            )}
          </div>
        );

      case CONDITION_TYPES.HAS_MEDIA:
        return (
          <div className="text-xs text-muted-foreground">
            {t('flow_builder.has_media_desc', 'Checks if the message has any attached media.')}
          </div>
        );

      case CONDITION_TYPES.MEDIA_TYPE:
        return (
          <div className="space-y-2">
            <select
              className="w-full p-2 text-sm border rounded"
              value={mediaType}
              onChange={(e) => setMediaType(e.target.value)}
            >
              {MEDIA_TYPES.map(type => (
                <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
              ))}
            </select>
            <div className="text-[10px] text-muted-foreground">
              {t('flow_builder.media_type_desc', 'Checks if the message contains media of the selected type.')}
            </div>
          </div>
        );

      case CONDITION_TYPES.TIME_BASED:
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <select
                className="flex-1 p-2 text-sm border rounded"
                value={timeOperator}
                onChange={(e) => setTimeOperator(e.target.value)}
              >
                <option value="before">{t('flow_builder.before', 'Before')}</option>
                <option value="after">{t('flow_builder.after', 'After')}</option>
                <option value="between">{t('flow_builder.between', 'Between')}</option>
              </select>
            </div>
            <input
              className="w-full p-2 text-sm border rounded"
              value={timeValue}
              onChange={handleTimeValueChange}
              placeholder={timeOperator === "between" ? "09:00,17:00" : "09:00"}
              type="text"
            />
            <div className="text-[10px] text-muted-foreground">
              {timeOperator === "between"
                ? t('flow_builder.time_format_between', 'Use format: HH:MM,HH:MM (24h)')
                : t('flow_builder.time_format_single', 'Use format: HH:MM (24h)')
              }
            </div>
          </div>
        );

      case CONDITION_TYPES.CONTACT_ATTRIBUTE:
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <select
                className="flex-1 p-2 text-sm border rounded"
                value={contactAttribute}
                onChange={(e) => setContactAttribute(e.target.value)}
              >
                <option value="name">{t('flow_builder.name', 'Name')}</option>
                <option value="phone">{t('flow_builder.phone', 'Phone')}</option>
                <option value="email">{t('flow_builder.email', 'Email')}</option>
                <option value="tags">{t('flow_builder.tags', 'Tags')}</option>
              </select>
            </div>
            <input
              className="w-full p-2 text-sm border rounded"
              value={attributeValue}
              onChange={(e) => setAttributeValue(e.target.value)}
              placeholder={t('flow_builder.attribute_value', 'Attribute value')}
            />
          </div>
        );

      default:
        return null;
    }
  };

  const formatConditionDisplay = () => {
    if (advancedMode) {
      return customCondition;
    }

    switch (conditionType) {
      case CONDITION_TYPES.MESSAGE_CONTAINS:
        return `Message contains: "${conditionValue}"${caseSensitive ? " (case sensitive)" : ""}`;
      case CONDITION_TYPES.EXACT_MATCH:
        return `Message exactly matches: "${conditionValue}"${caseSensitive ? " (case sensitive)" : ""}`;
      case CONDITION_TYPES.REGEX_MATCH:
        return `Message matches regex: "${conditionValue}"`;
      case CONDITION_TYPES.MESSAGE_STARTS_WITH:
        return `Message starts with: "${conditionValue}"${caseSensitive ? " (case sensitive)" : ""}`;
      case CONDITION_TYPES.MESSAGE_ENDS_WITH:
        return `Message ends with: "${conditionValue}"${caseSensitive ? " (case sensitive)" : ""}`;
      case CONDITION_TYPES.HAS_MEDIA:
        return "Message has media attachment";
      case CONDITION_TYPES.MEDIA_TYPE:
        return `Media type is: ${mediaType}`;
      case CONDITION_TYPES.TIME_BASED:
        return `Time is ${timeOperator}: ${timeValue}`;
      case CONDITION_TYPES.CONTACT_ATTRIBUTE:
        return `Contact ${contactAttribute} is: "${attributeValue}"`;
      default:
        return condition;
    }
  };

  return (
    <div className="node-condition p-3 rounded-lg bg-card border border-border shadow-sm max-w-[280px] group">
      {flowContext && (
        <NodeToolbar
          id={id}
          onDuplicate={flowContext.onDuplicateNode}
          onDelete={flowContext.onDeleteNode}
        />
      )}
      <div className="font-medium flex items-center gap-2 mb-2">
        <img 
          src="https://cdn-icons-png.flaticon.com/128/17359/17359067.png" 
          alt="Condition" 
          className="h-4 w-4"
        />
        <span>{t('flow_builder.condition', 'Condition')}</span>
        <button
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          onClick={() => isEditing ? handleDoneClick() : setIsEditing(true)}
        >
          {isEditing ? t('common.done', 'Done') : t('common.edit', 'Edit')}
        </button>
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium">{t('flow_builder.condition_type', 'Condition Type:')}</label>
            <div className="flex items-center gap-2">
              <span className="text-xs">{t('flow_builder.advanced', 'Advanced')}</span>
              <Switch
                checked={advancedMode}
                onCheckedChange={setAdvancedMode}
                className="scale-75"
              />
            </div>
          </div>

          {!advancedMode && (
            <select
              className="w-full p-2 text-sm border rounded"
              value={conditionType}
              onChange={handleConditionTypeChange}
            >
              {Object.entries(CONDITION_TYPES).map(([key, value]) => (
                <option key={key} value={value}>{value}</option>
              ))}
            </select>
          )}

          {renderConditionInputs()}
        </div>
      ) : (
        <div className="text-sm p-2  rounded border border-border">
          {formatConditionDisplay()}
        </div>
      )}

      <div className="flex mt-2 text-xs justify-between">
        <div className="text-green-600">{t('flow_builder.yes', 'Yes')} →</div>
        <div className="text-red-500">{t('flow_builder.no', 'No')} →</div>
      </div>

      <Handle
        type="target"
        position={Position.Top}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        style={yesHandleStyle}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        style={noHandleStyle}
        isConnectable={isConnectable}
      />
    </div>
  );
}

function ImageNode({ data, isConnectable, id }: any) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [imageUrl, setImageUrl] = useState(data.mediaUrl || "");
  const [caption, setCaption] = useState(data.caption || "");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [keywords, setKeywords] = useState<MessageKeyword[]>(
    data.keywords || []
  );
  const [enableKeywordTriggers, setEnableKeywordTriggers] = useState(data.enableKeywordTriggers || false);
  const { setNodes } = useReactFlow();
  const flowContext = useFlowContext();

  const availableVariables = [
    { name: "contact.name", description: "Contact's name" },
    { name: "contact.phone", description: "Contact's phone number" },
    { name: "date.today", description: "Current date" },
    { name: "time.now", description: "Current time" }
  ];

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

  const handleEnableKeywordTriggersChange = (checked: boolean) => {
    setEnableKeywordTriggers(checked);
    updateNodeData({ enableKeywordTriggers: checked });
  };

  const addKeyword = () => {
    const defaultValue = `keyword${keywords.length + 1}`;
    const newKeyword: MessageKeyword = {
      id: Date.now().toString(),
      text: defaultValue, // Set text to match value
      value: defaultValue,
      caseSensitive: false
    };
    const newKeywords = [...keywords, newKeyword];
    setKeywords(newKeywords);
    updateNodeData({ keywords: newKeywords });
  };

  const removeKeyword = (keywordId: string) => {
    const newKeywords = keywords.filter(k => k.id !== keywordId);
    setKeywords(newKeywords);
    updateNodeData({ keywords: newKeywords });
  };

  const updateKeyword = (keywordId: string, field: keyof MessageKeyword, value: any) => {
    const newKeywords = keywords.map(k => {
      if (k.id === keywordId) {
        const updatedKeyword = { ...k, [field]: value };

        if (field === 'value') {
          updatedKeyword.text = value;
        }
        return updatedKeyword;
      }
      return k;
    });
    setKeywords(newKeywords);
    updateNodeData({ keywords: newKeywords });
  };

  const handleImageUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setImageUrl(newUrl);
    updateNodeData({
      mediaUrl: newUrl,
      originalName: '',
      mimetype: '',
      size: 0
    });
  };

  const handleCaptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newCaption = e.target.value;
    setCaption(newCaption);
    updateNodeData({ caption: newCaption });
  };

  const handleRemoveImage = () => {
    setImageUrl("");
    updateNodeData({
      mediaUrl: "",
      originalName: "",
      mimetype: "",
      size: 0
    });
    toast({
      title: t('flow_builder.success.image_removed', 'Image removed'),
      description: t('flow_builder.success.image_removed_desc', 'Image has been removed from the node')
    });
  };

  const insertVariable = (variable: string) => {
    const textArea = document.getElementById(`caption-textarea-${id}`) as HTMLTextAreaElement;
    if (!textArea) return;

    const cursorPos = textArea.selectionStart;
    const variableText = `{{${variable}}}`;
    const newCaption = caption.substring(0, cursorPos) + variableText + caption.substring(cursorPos);

    setCaption(newCaption);
    updateNodeData({ caption: newCaption });

    setTimeout(() => {
      textArea.focus();
      textArea.setSelectionRange(cursorPos + variableText.length, cursorPos + variableText.length);
    }, 0);
  };

  const formatText = (text: string) => {
    const regex = /\{\{([^}]+)\}\}/g;

    if (!regex.test(text)) {
      return text;
    }

    const parts = [];
    let lastIndex = 0;
    let match;

    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      parts.push(
        <span key={match.index} className="bg-primary/10 text-primary px-1 rounded">
          {match[0]}
        </span>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts;
  };

  const handleFileUpload = async (file: File) => {
    if (!file) {
      toast({
        title: t('flow_builder.error.no_file', 'No file selected'),
        description: t('flow_builder.error.no_file_desc', 'Please select a file to upload'),
        variant: 'destructive'
      });
      return;
    }

    const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!validImageTypes.includes(file.type)) {
      toast({
        title: t('flow_builder.error.invalid_file_type', 'Invalid file type'),
        description: t('flow_builder.error.invalid_image_type', 'Please select a valid image file (JPEG, PNG, GIF, WebP, SVG)'),
        variant: 'destructive'
      });
      return;
    }

    const maxSize = 30 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: t('flow_builder.error.file_too_large', 'File too large'),
        description: t('flow_builder.error.max_file_size', 'Maximum file size is 30MB'),
        variant: 'destructive'
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'image');

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        setIsUploading(false);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.url) {
              setImageUrl(response.url);
              updateNodeData({
                mediaUrl: response.url,
                originalName: response.originalName,
                mimetype: response.mimetype,
                size: response.size
              });
              toast({
                title: t('flow_builder.success.upload_complete', 'Upload complete'),
                description: t('flow_builder.success.image_uploaded', 'Image uploaded successfully')
              });
            } else {
              throw new Error('Invalid response: missing URL');
            }
          } catch (parseError) {
            console.error('Error parsing response:', parseError);
            throw new Error('Invalid server response');
          }
        } else {
          let errorMessage = 'Upload failed';
          try {
            const errorResponse = JSON.parse(xhr.responseText);
            errorMessage = errorResponse.error || errorResponse.message || errorMessage;
          } catch (e) {
          }
          throw new Error(errorMessage);
        }
      });

      xhr.addEventListener('error', () => {
        setIsUploading(false);
        throw new Error('Network error during upload');
      });

      xhr.addEventListener('timeout', () => {
        setIsUploading(false);
        throw new Error('Upload timeout');
      });

      xhr.timeout = 60000;
      xhr.open('POST', '/api/upload');
      xhr.send(formData);
    } catch (error) {
      console.error('Error uploading file:', error);
      setIsUploading(false);
      toast({
        title: t('flow_builder.error.upload_failed', 'Upload failed'),
        description: error instanceof Error ? error.message : t('flow_builder.error.upload_error', 'An error occurred while uploading the file'),
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="node-image p-3 rounded-lg bg-card border border-border shadow-sm max-w-[350px] relative group">
      {flowContext && (
        <NodeToolbar
          id={id}
          onDuplicate={flowContext.onDuplicateNode}
          onDelete={flowContext.onDeleteNode}
        />
      )}

      <div className="font-medium flex items-center gap-2 mb-2">
        <img src="https://cdn-icons-png.flaticon.com/128/17320/17320313.png" alt="Image Message" className="h-4 w-4" />
        <span>{t('flow_builder.send_image', 'Send Image')}</span>
        <button
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? t('common.done', 'Done') : t('common.edit', 'Edit')}
        </button>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium mb-1 block">{t('flow_builder.image_label', 'Image:')}</label>
            <div className="space-y-2">
              <FileUpload
                onFileSelected={handleFileUpload}
                fileType="image/*"
                maxSize={30}
                className="w-full"
                showProgress={isUploading}
                progress={uploadProgress}
              />

              <div className="text-[10px] text-muted-foreground mt-1">
                {t('flow_builder.or_enter_image_url', 'Or enter image URL:')}
              </div>

              <input
                className="w-full p-2 text-xs border rounded"
                value={imageUrl}
                onChange={handleImageUrlChange}
                placeholder={t('flow_builder.enter_image_url', 'Enter image URL or path')}
              />

              {imageUrl && (
                <button
                  className="w-full mt-2 px-3 py-1 text-xs bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-800 rounded hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors"
                  onClick={handleRemoveImage}
                >
                  {t('flow_builder.remove_image', 'Remove Image')}
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">{t('flow_builder.caption_optional', 'Caption (optional):')}</label>
            <textarea
              id={`caption-textarea-${id}`}
              className="w-full p-2 text-sm border rounded min-h-[60px] resize-none"
              value={caption}
              onChange={handleCaptionChange}
              placeholder={t('flow_builder.add_caption_image', 'Add a caption to your image...')}
            />
          </div>

          <div>
            <p className="text-xs font-medium mb-1">{t('flow_builder.insert_variable_caption', 'Insert Variable in Caption:')}</p>
            <div className="flex flex-wrap gap-1">
              {availableVariables.map((variable) => (
                <button
                  key={variable.name}
                  className="text-xs px-2 py-1  rounded hover:"
                  title={variable.description}
                  onClick={() => insertVariable(variable.name)}
                >
                  {variable.name}
                </button>
              ))}
            </div>
          </div>

          {/* Keyword Triggers Section */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">{t('flow_builder.keyword_triggers', 'Keyword Triggers:')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`enable-keywords-${id}`}
                  checked={enableKeywordTriggers}
                  onChange={(e) => handleEnableKeywordTriggersChange(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor={`enable-keywords-${id}`} className="text-xs text-muted-foreground">
                  {t('flow_builder.enable_keyword_triggers', 'Enable keyword-based routing')}
                </label>
              </div>
            </div>

            {enableKeywordTriggers && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {t('flow_builder.keywords_help', 'Define keywords that will route to different paths when users respond:')}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={addKeyword}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {t('flow_builder.add_keyword', 'Add Keyword')}
                  </Button>
                </div>

                {keywords.length > 0 && (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {keywords.map((keyword, index) => (
                      <div key={keyword.id} className="border rounded p-2 space-y-2 relative">
                        <div className="flex items-center gap-2">
                          <div className="flex-shrink-0 w-6 h-6 rounded-md bg-primary text-white flex items-center justify-center text-xs font-medium">
                            {index + 1}
                          </div>
                          <div className="flex-1 text-xs font-medium">Keyword {index + 1}</div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => removeKeyword(keyword.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>

                        <div className="pl-8 space-y-2">
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Match Value:</label>
                            <input
                              className="w-full p-1.5 text-xs border rounded"
                              value={keyword.value}
                              onChange={(e) => updateKeyword(keyword.id, 'value', e.target.value)}
                              placeholder="Text to match"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`case-sensitive-${keyword.id}`}
                              checked={keyword.caseSensitive}
                              onChange={(e) => updateKeyword(keyword.id, 'caseSensitive', e.target.checked)}
                              className="w-3 h-3"
                            />
                            <label htmlFor={`case-sensitive-${keyword.id}`} className="text-xs text-muted-foreground">
                              Case sensitive
                            </label>
                          </div>
                        </div>

                        {/* Output handle for this keyword */}
                        <Handle
                          type="source"
                          position={Position.Right}
                          id={`keyword-${keyword.value.toLowerCase().replace(/\s+/g, '-')}`}
                          style={{
                            ...standardHandleStyle,
                            top: '20px',
                            right: '-12px'
                          }}
                          isConnectable={isConnectable}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {enableKeywordTriggers && (
                  <div className="text-[10px] text-muted-foreground space-y-1">
                    <div>Each keyword will create its own output connection.</div>
                    <div>A "no match" output will be available for unmatched responses.</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {imageUrl ? (
            <div className="relative aspect-video  rounded overflow-hidden flex items-center justify-center">
              <img
                src={imageUrl}
                alt="Message attachment"
                className="max-w-full max-h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://placehold.co/400x300?text=Invalid+Image+URL';
                }}
              />
            </div>
          ) : (
            <div className="aspect-video  rounded flex items-center justify-center text-muted-foreground">
              <div className="text-center text-xs">{t('flow_builder.no_image_provided', 'No image provided')}</div>
            </div>
          )}

          {caption && (
            <>
              <div className="text-xs text-muted-foreground">{t('flow_builder.caption_label', 'Caption:')}</div>
              <div className="text-sm p-2  rounded border border-border">
                {formatText(caption)}
              </div>
            </>
          )}

          {enableKeywordTriggers && keywords.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <div className="font-medium mb-1">{t('flow_builder.keyword_triggers_active', 'Keyword Triggers Active:')}</div>
              <div className="space-y-1">
                {keywords.map((keyword, index) => (
                  <div key={keyword.id} className="flex items-center gap-2 relative">
                    <div className="flex-shrink-0 w-4 h-4 rounded bg-primary text-white flex items-center justify-center text-[10px] font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <span className="font-medium">{keyword.text}</span>
                      <span className="text-muted-foreground/70"> → "{keyword.value}"</span>
                      {keyword.caseSensitive && <span className="text-orange-600 ml-1">(case sensitive)</span>}
                    </div>

                    {/* Output handle for this keyword */}
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={`keyword-${keyword.value.toLowerCase().replace(/\s+/g, '-')}`}
                      style={{
                        ...standardHandleStyle,
                        top: '50%',
                        right: '-12px'
                      }}
                      isConnectable={isConnectable}
                    />
                  </div>
                ))}

                {/* No match handle */}
                <div className="flex items-center gap-2 relative mt-2 pt-2 border-t border-border/50">
                  <div className="flex-shrink-0 w-4 h-4 rounded bg-muted-foreground text-primary-foreground flex items-center justify-center text-[10px] font-medium">
                    ?
                  </div>
                  <div className="flex-1 text-muted-foreground">
                    {t('flow_builder.no_match_route', 'No keyword match')}
                  </div>

                  <Handle
                    type="source"
                    position={Position.Right}
                    id="no-match"
                    style={{
                      ...standardHandleStyle,
                      top: '50%',
                      right: '-12px',
                      background: '#9ca3af'
                    }}
                    isConnectable={isConnectable}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />

      {/* Output handles only shown when keyword triggers are enabled */}
    </div>
  );
}

function VideoNode({ data, isConnectable, id }: any) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [videoUrl, setVideoUrl] = useState(data.mediaUrl || "");
  const [caption, setCaption] = useState(data.caption || t('flow_builder.default_video_caption', 'Watch this video!'));
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [keywords, setKeywords] = useState<MessageKeyword[]>(
    data.keywords || []
  );
  const [enableKeywordTriggers, setEnableKeywordTriggers] = useState(data.enableKeywordTriggers || false);
  const { setNodes } = useReactFlow();
  const flowContext = useFlowContext();

  const availableVariables = [
    { name: "contact.name", description: "Contact's name" },
    { name: "contact.phone", description: "Contact's phone number" },
    { name: "date.today", description: "Current date" },
    { name: "time.now", description: "Current time" }
  ];

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

  const handleEnableKeywordTriggersChange = (checked: boolean) => {
    setEnableKeywordTriggers(checked);
    updateNodeData({ enableKeywordTriggers: checked });
  };

  const addKeyword = () => {
    const defaultValue = `keyword${keywords.length + 1}`;
    const newKeyword: MessageKeyword = {
      id: Date.now().toString(),
      text: defaultValue, // Set text to match value
      value: defaultValue,
      caseSensitive: false
    };
    const newKeywords = [...keywords, newKeyword];
    setKeywords(newKeywords);
    updateNodeData({ keywords: newKeywords });
  };

  const removeKeyword = (keywordId: string) => {
    const newKeywords = keywords.filter(k => k.id !== keywordId);
    setKeywords(newKeywords);
    updateNodeData({ keywords: newKeywords });
  };

  const updateKeyword = (keywordId: string, field: keyof MessageKeyword, value: any) => {
    const newKeywords = keywords.map(k => {
      if (k.id === keywordId) {
        const updatedKeyword = { ...k, [field]: value };

        if (field === 'value') {
          updatedKeyword.text = value;
        }
        return updatedKeyword;
      }
      return k;
    });
    setKeywords(newKeywords);
    updateNodeData({ keywords: newKeywords });
  };

  const handleVideoUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setVideoUrl(newUrl);
    updateNodeData({ mediaUrl: newUrl });
  };



  const handleCaptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newCaption = e.target.value;
    setCaption(newCaption);
    updateNodeData({ caption: newCaption });
  };

  const insertVariable = (variable: string) => {
    const textArea = document.getElementById(`video-caption-textarea-${id}`) as HTMLTextAreaElement;
    if (!textArea) return;

    const cursorPos = textArea.selectionStart;
    const variableText = `{{${variable}}}`;
    const newCaption = caption.substring(0, cursorPos) + variableText + caption.substring(cursorPos);

    setCaption(newCaption);
    updateNodeData({ caption: newCaption });

    setTimeout(() => {
      textArea.focus();
      textArea.setSelectionRange(cursorPos + variableText.length, cursorPos + variableText.length);
    }, 0);
  };

  const formatText = (text: string) => {
    const regex = /\{\{([^}]+)\}\}/g;

    if (!regex.test(text)) {
      return text;
    }

    const parts = [];
    let lastIndex = 0;
    let match;

    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      parts.push(
        <span key={match.index} className="bg-primary/10 text-primary px-1 rounded">
          {match[0]}
        </span>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts;
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'video');

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const response = JSON.parse(xhr.responseText);
          setVideoUrl(response.url);
          updateNodeData({ mediaUrl: response.url });
          setIsUploading(false);
        } else {
          throw new Error('Upload failed');
        }
      });

      xhr.addEventListener('error', () => {
        throw new Error('Upload failed');
      });

      xhr.open('POST', '/api/upload');
      xhr.send(formData);
    } catch (error) {
      console.error('Error uploading file:', error);
      setIsUploading(false);
    }
  };

  return (
    <div className="node-video p-3 rounded-lg bg-card border border-border shadow-sm max-w-[350px] relative group">
      {flowContext && (
        <NodeToolbar
          id={id}
          onDuplicate={flowContext.onDuplicateNode}
          onDelete={flowContext.onDeleteNode}
        />
      )}

      <div className="font-medium flex items-center gap-2 mb-2">
        <img 
          src="https://cdn-icons-png.flaticon.com/128/2839/2839026.png" 
          alt="Video Message" 
          className="h-4 w-4"
        />
        <span>{t('flow_builder.send_video', 'Send Video')}</span>
        <button
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? t('common.done', 'Done') : t('common.edit', 'Edit')}
        </button>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium mb-1 block">{t('flow_builder.video_url_label', 'Video URL:')}</label>
            <input
              className="w-full p-2 text-sm border rounded"
              value={videoUrl}
              onChange={handleVideoUrlChange}
              placeholder={t('flow_builder.enter_video_url', 'Enter video URL or path')}
            />
            <div className="mt-2">
              <FileUpload
                onFileSelected={handleFileUpload}
                fileType="video/*"
                maxSize={30}
                className="w-full"
                showProgress={isUploading}
                progress={uploadProgress}
              />
            </div>
            {videoUrl && (
              <button
                className="w-full mt-2 px-3 py-2 text-xs bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-800 rounded hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors flex items-center justify-center gap-2"
                onClick={() => setShowPreview(!showPreview)}
              >
                <FileVideo className="h-3 w-3" />
                {showPreview ? t('flow_builder.hide_preview', 'Hide Preview') : t('flow_builder.preview_video', 'Preview Video')}
              </button>
            )}
            {videoUrl && showPreview && <VideoPreview url={videoUrl} />}
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">{t('flow_builder.caption_optional', 'Caption (optional):')}</label>
            <textarea
              id={`video-caption-textarea-${id}`}
              className="w-full p-2 text-sm border rounded min-h-[60px] resize-none"
              value={caption}
              onChange={handleCaptionChange}
              placeholder={t('flow_builder.add_caption_video', 'Add a caption to your video...')}
            />
          </div>

          <div>
            <p className="text-xs font-medium mb-1">{t('flow_builder.insert_variable_caption', 'Insert Variable in Caption:')}</p>
            <div className="flex flex-wrap gap-1">
              {availableVariables.map((variable) => (
                <button
                  key={variable.name}
                  className="text-xs px-2 py-1  rounded hover:"
                  title={variable.description}
                  onClick={() => insertVariable(variable.name)}
                >
                  {variable.name}
                </button>
              ))}
            </div>
          </div>

          {/* Keyword Triggers Section */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">{t('flow_builder.keyword_triggers', 'Keyword Triggers:')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`enable-keywords-${id}`}
                  checked={enableKeywordTriggers}
                  onChange={(e) => handleEnableKeywordTriggersChange(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor={`enable-keywords-${id}`} className="text-xs text-muted-foreground">
                  {t('flow_builder.enable_keyword_triggers', 'Enable keyword-based routing')}
                </label>
              </div>
            </div>

            {enableKeywordTriggers && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {t('flow_builder.keywords_help', 'Define keywords that will route to different paths when users respond:')}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={addKeyword}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {t('flow_builder.add_keyword', 'Add Keyword')}
                  </Button>
                </div>

                {keywords.length > 0 && (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {keywords.map((keyword, index) => (
                      <div key={keyword.id} className="border rounded p-2 space-y-2 relative">
                        <div className="flex items-center gap-2">
                          <div className="flex-shrink-0 w-6 h-6 rounded-md bg-primary text-white flex items-center justify-center text-xs font-medium">
                            {index + 1}
                          </div>
                          <div className="flex-1 text-xs font-medium">Keyword {index + 1}</div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => removeKeyword(keyword.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>

                        <div className="pl-8 space-y-2">
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Match Value:</label>
                            <input
                              className="w-full p-1.5 text-xs border rounded"
                              value={keyword.value}
                              onChange={(e) => updateKeyword(keyword.id, 'value', e.target.value)}
                              placeholder="Text to match"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`case-sensitive-${keyword.id}`}
                              checked={keyword.caseSensitive}
                              onChange={(e) => updateKeyword(keyword.id, 'caseSensitive', e.target.checked)}
                              className="w-3 h-3"
                            />
                            <label htmlFor={`case-sensitive-${keyword.id}`} className="text-xs text-muted-foreground">
                              Case sensitive
                            </label>
                          </div>
                        </div>

                        {/* Output handle for this keyword */}
                        <Handle
                          type="source"
                          position={Position.Right}
                          id={`keyword-${keyword.value.toLowerCase().replace(/\s+/g, '-')}`}
                          style={{
                            ...standardHandleStyle,
                            top: '20px',
                            right: '-12px'
                          }}
                          isConnectable={isConnectable}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {enableKeywordTriggers && (
                  <div className="text-[10px] text-muted-foreground space-y-1">
                    <div>Each keyword will create its own output connection.</div>
                    <div>A "no match" output will be available for unmatched responses.</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">{t('flow_builder.video_url_label', 'Video URL:')}</div>
          <div className="text-sm p-2  rounded border border-border truncate">
            {videoUrl || t('flow_builder.no_url_provided', 'No URL provided')}
          </div>
          {videoUrl && (
            <button
              className="w-full mt-2 px-3 py-2 text-xs bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-800 rounded hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors flex items-center justify-center gap-2"
              onClick={() => setShowPreview(!showPreview)}
            >
              <FileVideo className="h-3 w-3" />
              {showPreview ? t('flow_builder.hide_preview', 'Hide Preview') : t('flow_builder.preview_video', 'Preview Video')}
            </button>
          )}
          {videoUrl && showPreview && <VideoPreview url={videoUrl} />}

          {caption && (
            <>
              <div className="text-xs text-muted-foreground">{t('flow_builder.caption_label', 'Caption:')}</div>
              <div className="text-sm p-2  rounded border border-border">
                {formatText(caption)}
              </div>
            </>
          )}

          {enableKeywordTriggers && keywords.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <div className="font-medium mb-1">{t('flow_builder.keyword_triggers_active', 'Keyword Triggers Active:')}</div>
              <div className="space-y-1">
                {keywords.map((keyword, index) => (
                  <div key={keyword.id} className="flex items-center gap-2 relative">
                    <div className="flex-shrink-0 w-4 h-4 rounded bg-primary text-white flex items-center justify-center text-[10px] font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <span className="font-medium">{keyword.text}</span>
                      <span className="text-muted-foreground/70"> → "{keyword.value}"</span>
                      {keyword.caseSensitive && <span className="text-orange-600 ml-1">(case sensitive)</span>}
                    </div>

                    {/* Output handle for this keyword */}
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={`keyword-${keyword.value.toLowerCase().replace(/\s+/g, '-')}`}
                      style={{
                        ...standardHandleStyle,
                        top: '50%',
                        right: '-12px'
                      }}
                      isConnectable={isConnectable}
                    />
                  </div>
                ))}

                {/* No match handle */}
                <div className="flex items-center gap-2 relative mt-2 pt-2 border-t border-border/50">
                  <div className="flex-shrink-0 w-4 h-4 rounded bg-muted-foreground text-primary-foreground flex items-center justify-center text-[10px] font-medium">
                    ?
                  </div>
                  <div className="flex-1 text-muted-foreground">
                    {t('flow_builder.no_match_route', 'No keyword match')}
                  </div>

                  <Handle
                    type="source"
                    position={Position.Right}
                    id="no-match"
                    style={{
                      ...standardHandleStyle,
                      top: '50%',
                      right: '-12px',
                      background: '#9ca3af'
                    }}
                    isConnectable={isConnectable}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />

      {/* Output handles only shown when keyword triggers are enabled */}
    </div>
  );
}

function AudioNode({ data, isConnectable, id }: any) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [audioUrl, setAudioUrl] = useState(data.mediaUrl || "");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [keywords, setKeywords] = useState<MessageKeyword[]>(
    data.keywords || []
  );
  const [enableKeywordTriggers, setEnableKeywordTriggers] = useState(data.enableKeywordTriggers || false);
  const { setNodes } = useReactFlow();
  const flowContext = useFlowContext();

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

  const handleEnableKeywordTriggersChange = (checked: boolean) => {
    setEnableKeywordTriggers(checked);
    updateNodeData({ enableKeywordTriggers: checked });
  };

  const addKeyword = () => {
    const defaultValue = `keyword${keywords.length + 1}`;
    const newKeyword: MessageKeyword = {
      id: Date.now().toString(),
      text: defaultValue, // Set text to match value
      value: defaultValue,
      caseSensitive: false
    };
    const newKeywords = [...keywords, newKeyword];
    setKeywords(newKeywords);
    updateNodeData({ keywords: newKeywords });
  };

  const removeKeyword = (keywordId: string) => {
    const newKeywords = keywords.filter(k => k.id !== keywordId);
    setKeywords(newKeywords);
    updateNodeData({ keywords: newKeywords });
  };

  const updateKeyword = (keywordId: string, field: keyof MessageKeyword, value: any) => {
    const newKeywords = keywords.map(k => {
      if (k.id === keywordId) {
        const updatedKeyword = { ...k, [field]: value };

        if (field === 'value') {
          updatedKeyword.text = value;
        }
        return updatedKeyword;
      }
      return k;
    });
    setKeywords(newKeywords);
    updateNodeData({ keywords: newKeywords });
  };

  const handleAudioUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setAudioUrl(newUrl);
    updateNodeData({ mediaUrl: newUrl });
  };





  const handleFileUpload = async (file: File) => {
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'audio');

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const response = JSON.parse(xhr.responseText);
          setAudioUrl(response.url);
          updateNodeData({ mediaUrl: response.url });
          setIsUploading(false);
        } else {
          throw new Error('Upload failed');
        }
      });

      xhr.addEventListener('error', () => {
        throw new Error('Upload failed');
      });

      xhr.open('POST', '/api/upload');
      xhr.send(formData);
    } catch (error) {
      console.error('Error uploading file:', error);
      setIsUploading(false);
    }
  };

  return (
    <div className="node-audio p-3 rounded-lg bg-card border border-border shadow-sm max-w-[350px] relative group">
      {flowContext && (
        <NodeToolbar
          id={id}
          onDuplicate={flowContext.onDuplicateNode}
          onDelete={flowContext.onDeleteNode}
        />
      )}

      <div className="font-medium flex items-center gap-2 mb-2">
        <img 
          src="https://cdn-icons-png.flaticon.com/128/5320/5320910.png" 
          alt="Audio Message" 
          className="h-4 w-4"
        />
        <span>{t('flow_builder.send_audio', 'Send Audio')}</span>
        <button
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? t('common.done', 'Done') : t('common.edit', 'Edit')}
        </button>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium mb-1 block">{t('flow_builder.audio_url_label', 'Audio URL:')}</label>
            <input
              className="w-full p-2 text-sm border rounded"
              value={audioUrl}
              onChange={handleAudioUrlChange}
              placeholder={t('flow_builder.enter_audio_url', 'Enter audio URL or path')}
            />
            <div className="mt-2">
              <FileUpload
                onFileSelected={handleFileUpload}
                fileType="audio/*"
                maxSize={30}
                className="w-full"
                showProgress={isUploading}
                progress={uploadProgress}
              />
            </div>
            {audioUrl && (
              <button
                className="w-full mt-2 px-3 py-2 text-xs bg-purple-100 text-purple-700 border border-purple-300 rounded hover:bg-purple-200 transition-colors flex items-center justify-center gap-2"
                onClick={() => setShowPreview(!showPreview)}
              >
                <FileAudio className="h-3 w-3" />
                {showPreview ? t('flow_builder.hide_preview', 'Hide Preview') : t('flow_builder.preview_audio', 'Preview Audio')}
              </button>
            )}
            {audioUrl && showPreview && <AudioPreview url={audioUrl} />}
          </div>

          {/* Keyword Triggers Section */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">{t('flow_builder.keyword_triggers', 'Keyword Triggers:')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`enable-keywords-${id}`}
                  checked={enableKeywordTriggers}
                  onChange={(e) => handleEnableKeywordTriggersChange(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor={`enable-keywords-${id}`} className="text-xs text-muted-foreground">
                  {t('flow_builder.enable_keyword_triggers', 'Enable keyword-based routing')}
                </label>
              </div>
            </div>

            {enableKeywordTriggers && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {t('flow_builder.keywords_help', 'Define keywords that will route to different paths when users respond:')}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={addKeyword}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {t('flow_builder.add_keyword', 'Add Keyword')}
                  </Button>
                </div>

                {keywords.length > 0 && (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {keywords.map((keyword, index) => (
                      <div key={keyword.id} className="border rounded p-2 space-y-2 relative">
                        <div className="flex items-center gap-2">
                          <div className="flex-shrink-0 w-6 h-6 rounded-md bg-primary text-white flex items-center justify-center text-xs font-medium">
                            {index + 1}
                          </div>
                          <div className="flex-1 text-xs font-medium">Keyword {index + 1}</div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => removeKeyword(keyword.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>

                        <div className="pl-8 space-y-2">
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Match Value:</label>
                            <input
                              className="w-full p-1.5 text-xs border rounded"
                              value={keyword.value}
                              onChange={(e) => updateKeyword(keyword.id, 'value', e.target.value)}
                              placeholder="Text to match"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`case-sensitive-${keyword.id}`}
                              checked={keyword.caseSensitive}
                              onChange={(e) => updateKeyword(keyword.id, 'caseSensitive', e.target.checked)}
                              className="w-3 h-3"
                            />
                            <label htmlFor={`case-sensitive-${keyword.id}`} className="text-xs text-muted-foreground">
                              Case sensitive
                            </label>
                          </div>
                        </div>

                        {/* Output handle for this keyword */}
                        <Handle
                          type="source"
                          position={Position.Right}
                          id={`keyword-${keyword.value.toLowerCase().replace(/\s+/g, '-')}`}
                          style={{
                            ...standardHandleStyle,
                            top: '20px',
                            right: '-12px'
                          }}
                          isConnectable={isConnectable}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {enableKeywordTriggers && (
                  <div className="text-[10px] text-muted-foreground space-y-1">
                    <div>Each keyword will create its own output connection.</div>
                    <div>A "no match" output will be available for unmatched responses.</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">{t('flow_builder.audio_url_label', 'Audio URL:')}</div>
          <div className="text-sm p-2  rounded border border-border truncate">
            {audioUrl || t('flow_builder.no_url_provided', 'No URL provided')}
          </div>
          {audioUrl && (
            <button
              className="w-full mt-2 px-3 py-2 text-xs bg-purple-100 text-purple-700 border border-purple-300 rounded hover:bg-purple-200 transition-colors flex items-center justify-center gap-2"
              onClick={() => setShowPreview(!showPreview)}
            >
              <FileAudio className="h-3 w-3" />
              {showPreview ? t('flow_builder.hide_preview', 'Hide Preview') : t('flow_builder.preview_audio', 'Preview Audio')}
            </button>
          )}
          {audioUrl && showPreview && <AudioPreview url={audioUrl} />}

          {enableKeywordTriggers && keywords.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <div className="font-medium mb-1">{t('flow_builder.keyword_triggers_active', 'Keyword Triggers Active:')}</div>
              <div className="space-y-1">
                {keywords.map((keyword, index) => (
                  <div key={keyword.id} className="flex items-center gap-2 relative">
                    <div className="flex-shrink-0 w-4 h-4 rounded bg-primary text-white flex items-center justify-center text-[10px] font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <span className="font-medium">{keyword.text}</span>
                      <span className="text-muted-foreground/70"> → "{keyword.value}"</span>
                      {keyword.caseSensitive && <span className="text-orange-600 ml-1">(case sensitive)</span>}
                    </div>

                    {/* Output handle for this keyword */}
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={`keyword-${keyword.value.toLowerCase().replace(/\s+/g, '-')}`}
                      style={{
                        ...standardHandleStyle,
                        top: '50%',
                        right: '-12px'
                      }}
                      isConnectable={isConnectable}
                    />
                  </div>
                ))}

                {/* No match handle */}
                <div className="flex items-center gap-2 relative mt-2 pt-2 border-t border-border/50">
                  <div className="flex-shrink-0 w-4 h-4 rounded bg-muted-foreground text-primary-foreground flex items-center justify-center text-[10px] font-medium">
                    ?
                  </div>
                  <div className="flex-1 text-muted-foreground">
                    {t('flow_builder.no_match_route', 'No keyword match')}
                  </div>

                  <Handle
                    type="source"
                    position={Position.Right}
                    id="no-match"
                    style={{
                      ...standardHandleStyle,
                      top: '50%',
                      right: '-12px',
                      background: '#9ca3af'
                    }}
                    isConnectable={isConnectable}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />

      {/* Output handles only shown when keyword triggers are enabled */}
    </div>
  );
}

function DocumentNode({ data, isConnectable, id }: any) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [documentUrl, setDocumentUrl] = useState(data.mediaUrl || "");
  const [fileName, setFileName] = useState(data.fileName || "");
  const [caption, setCaption] = useState(data.caption || t('flow_builder.default_document_caption', 'Check out this document!'));
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [keywords, setKeywords] = useState<MessageKeyword[]>(
    data.keywords || []
  );
  const [enableKeywordTriggers, setEnableKeywordTriggers] = useState(data.enableKeywordTriggers || false);
  const { setNodes } = useReactFlow();
  const flowContext = useFlowContext();

  const availableVariables = [
    { name: "contact.name", description: "Contact's name" },
    { name: "contact.phone", description: "Contact's phone number" },
    { name: "date.today", description: "Current date" },
    { name: "time.now", description: "Current time" }
  ];

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

  const handleEnableKeywordTriggersChange = (checked: boolean) => {
    setEnableKeywordTriggers(checked);
    updateNodeData({ enableKeywordTriggers: checked });
  };

  const addKeyword = () => {
    const defaultValue = `keyword${keywords.length + 1}`;
    const newKeyword: MessageKeyword = {
      id: Date.now().toString(),
      text: defaultValue, // Set text to match value
      value: defaultValue,
      caseSensitive: false
    };
    const newKeywords = [...keywords, newKeyword];
    setKeywords(newKeywords);
    updateNodeData({ keywords: newKeywords });
  };

  const removeKeyword = (keywordId: string) => {
    const newKeywords = keywords.filter(k => k.id !== keywordId);
    setKeywords(newKeywords);
    updateNodeData({ keywords: newKeywords });
  };

  const updateKeyword = (keywordId: string, field: keyof MessageKeyword, value: any) => {
    const newKeywords = keywords.map(k => {
      if (k.id === keywordId) {
        const updatedKeyword = { ...k, [field]: value };

        if (field === 'value') {
          updatedKeyword.text = value;
        }
        return updatedKeyword;
      }
      return k;
    });
    setKeywords(newKeywords);
    updateNodeData({ keywords: newKeywords });
  };

  const handleDocumentUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setDocumentUrl(newUrl);
    updateNodeData({ mediaUrl: newUrl });
  };



  const handleFileNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setFileName(newName);
    updateNodeData({ fileName: newName });
  };

  const handleCaptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newCaption = e.target.value;
    setCaption(newCaption);
    updateNodeData({ caption: newCaption });
  };

  const insertVariable = (variable: string) => {
    const textArea = document.getElementById(`doc-caption-textarea-${id}`) as HTMLTextAreaElement;
    if (!textArea) return;

    const cursorPos = textArea.selectionStart;
    const variableText = `{{${variable}}}`;
    const newCaption = caption.substring(0, cursorPos) + variableText + caption.substring(cursorPos);

    setCaption(newCaption);
    updateNodeData({ caption: newCaption });

    setTimeout(() => {
      textArea.focus();
      textArea.setSelectionRange(cursorPos + variableText.length, cursorPos + variableText.length);
    }, 0);
  };

  const formatText = (text: string) => {
    const regex = /\{\{([^}]+)\}\}/g;
    if (!regex.test(text)) return text;

    const parts = [];
    let lastIndex = 0;
    let match;

    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      parts.push(
        <span key={match.index} className="bg-primary/10 text-primary px-1 rounded">
          {match[0]}
        </span>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts;
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'document');

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const response = JSON.parse(xhr.responseText);
          setDocumentUrl(response.url);
          updateNodeData({ mediaUrl: response.url });

          if (!fileName) {
            const urlParts = response.url.split('/');
            const extractedFileName = urlParts[urlParts.length - 1];
            if (extractedFileName) {
              setFileName(extractedFileName);
              updateNodeData({ fileName: extractedFileName });
            }
          }

          setIsUploading(false);
        } else {
          throw new Error('Upload failed');
        }
      });

      xhr.addEventListener('error', () => {
        throw new Error('Upload failed');
      });

      xhr.open('POST', '/api/upload');
      xhr.send(formData);
    } catch (error) {
      console.error('Error uploading file:', error);
      setIsUploading(false);
    }
  };

  return (
    <div className="node-document p-3 rounded-lg bg-card border border-border shadow-sm max-w-[350px] relative group">
      {flowContext && (
        <NodeToolbar
          id={id}
          onDuplicate={flowContext.onDuplicateNode}
          onDelete={flowContext.onDeleteNode}
        />
      )}

      <div className="font-medium flex items-center gap-2 mb-2">
        <img 
          src="https://cdn-icons-png.flaticon.com/128/136/136522.png" 
          alt="Document Message" 
          className="h-4 w-4"
        />
        <span>{t('flow_builder.send_document', 'Send Document')}</span>
        <button
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? t('common.done', 'Done') : t('common.edit', 'Edit')}
        </button>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium mb-1 block">{t('flow_builder.document_url_label', 'Document URL:')}</label>
            <input
              className="w-full p-2 text-sm border rounded"
              value={documentUrl}
              onChange={handleDocumentUrlChange}
              placeholder={t('flow_builder.enter_document_url', 'Enter document URL or path')}
            />
            <div className="mt-2">
              <FileUpload
                onFileSelected={handleFileUpload}
                fileType="application/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                maxSize={30}
                className="w-full"
                showProgress={isUploading}
                progress={uploadProgress}
              />
            </div>
            {documentUrl && (
              <button
                className="w-full mt-2 px-3 py-2 text-xs bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800 rounded hover:bg-amber-200 dark:hover:bg-amber-900/30 transition-colors flex items-center justify-center gap-2"
                onClick={() => setShowPreview(!showPreview)}
              >
                <File className="h-3 w-3" />
                {showPreview ? t('flow_builder.hide_preview', 'Hide Preview') : t('flow_builder.preview_document', 'Preview Document')}
              </button>
            )}
            {documentUrl && showPreview && <DocumentPreview url={documentUrl} fileName={fileName} />}
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">{t('flow_builder.file_name_optional', 'File Name (optional):')}</label>
            <input
              className="w-full p-2 text-sm border rounded"
              value={fileName}
              onChange={handleFileNameChange}
              placeholder={t('flow_builder.enter_file_name', 'Enter file name (e.g. report.pdf)')}
            />
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">{t('flow_builder.caption_optional', 'Caption (optional):')}</label>
            <textarea
              id={`doc-caption-textarea-${id}`}
              className="w-full p-2 text-sm border rounded min-h-[60px] resize-none"
              value={caption}
              onChange={handleCaptionChange}
              placeholder={t('flow_builder.add_caption_document', 'Add a caption to your document...')}
            />
          </div>

          <div>
            <p className="text-xs font-medium mb-1">{t('flow_builder.insert_variable_caption', 'Insert Variable in Caption:')}</p>
            <div className="flex flex-wrap gap-1">
              {availableVariables.map((variable) => (
                <button
                  key={variable.name}
                  className="text-xs px-2 py-1  rounded hover:"
                  title={variable.description}
                  onClick={() => insertVariable(variable.name)}
                >
                  {variable.name}
                </button>
              ))}
            </div>
          </div>

          {/* Keyword Triggers Section */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">{t('flow_builder.keyword_triggers', 'Keyword Triggers:')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`enable-keywords-${id}`}
                  checked={enableKeywordTriggers}
                  onChange={(e) => handleEnableKeywordTriggersChange(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor={`enable-keywords-${id}`} className="text-xs text-muted-foreground">
                  {t('flow_builder.enable_keyword_triggers', 'Enable keyword-based routing')}
                </label>
              </div>
            </div>

            {enableKeywordTriggers && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {t('flow_builder.keywords_help', 'Define keywords that will route to different paths when users respond:')}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={addKeyword}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {t('flow_builder.add_keyword', 'Add Keyword')}
                  </Button>
                </div>

                {keywords.length > 0 && (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {keywords.map((keyword, index) => (
                      <div key={keyword.id} className="border rounded p-2 space-y-2 relative">
                        <div className="flex items-center gap-2">
                          <div className="flex-shrink-0 w-6 h-6 rounded-md bg-primary text-white flex items-center justify-center text-xs font-medium">
                            {index + 1}
                          </div>
                          <div className="flex-1 text-xs font-medium">Keyword {index + 1}</div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => removeKeyword(keyword.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>

                        <div className="pl-8 space-y-2">
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Match Value:</label>
                            <input
                              className="w-full p-1.5 text-xs border rounded"
                              value={keyword.value}
                              onChange={(e) => updateKeyword(keyword.id, 'value', e.target.value)}
                              placeholder="Text to match"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`case-sensitive-${keyword.id}`}
                              checked={keyword.caseSensitive}
                              onChange={(e) => updateKeyword(keyword.id, 'caseSensitive', e.target.checked)}
                              className="w-3 h-3"
                            />
                            <label htmlFor={`case-sensitive-${keyword.id}`} className="text-xs text-muted-foreground">
                              Case sensitive
                            </label>
                          </div>
                        </div>

                        {/* Output handle for this keyword */}
                        <Handle
                          type="source"
                          position={Position.Right}
                          id={`keyword-${keyword.value.toLowerCase().replace(/\s+/g, '-')}`}
                          style={{
                            ...standardHandleStyle,
                            top: '20px',
                            right: '-12px'
                          }}
                          isConnectable={isConnectable}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {enableKeywordTriggers && (
                  <div className="text-[10px] text-muted-foreground space-y-1">
                    <div>Each keyword will create its own output connection.</div>
                    <div>A "no match" output will be available for unmatched responses.</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">{t('flow_builder.document_url_label', 'Document URL:')}</div>
          <div className="text-sm p-2  rounded border border-border truncate">
            {documentUrl || t('flow_builder.no_url_provided', 'No URL provided')}
          </div>
          {documentUrl && (
            <button
              className="w-full mt-2 px-3 py-2 text-xs bg-amber-100 text-amber-700 border border-amber-300 rounded hover:bg-amber-200 transition-colors flex items-center justify-center gap-2"
              onClick={() => setShowPreview(!showPreview)}
            >
              <File className="h-3 w-3" />
              {showPreview ? t('flow_builder.hide_preview', 'Hide Preview') : t('flow_builder.preview_document', 'Preview Document')}
            </button>
          )}
          {documentUrl && showPreview && <DocumentPreview url={documentUrl} fileName={fileName} />}

          {fileName && (
            <>
              <div className="text-xs text-muted-foreground">{t('flow_builder.file_name_label', 'File Name:')}</div>
              <div className="text-sm p-2  rounded border border-border truncate">
                {fileName}
              </div>
            </>
          )}

          {caption && (
            <>
              <div className="text-xs text-muted-foreground">{t('flow_builder.caption_label', 'Caption:')}</div>
              <div className="text-sm p-2  rounded border border-border">
                {formatText(caption)}
              </div>
            </>
          )}

          {enableKeywordTriggers && keywords.length > 0 && (
            <div className="text-xs text-muted-foreground">
              <div className="font-medium mb-1">{t('flow_builder.keyword_triggers_active', 'Keyword Triggers Active:')}</div>
              <div className="space-y-1">
                {keywords.map((keyword, index) => (
                  <div key={keyword.id} className="flex items-center gap-2 relative">
                    <div className="flex-shrink-0 w-4 h-4 rounded bg-primary text-white flex items-center justify-center text-[10px] font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <span className="font-medium">{keyword.text}</span>
                      <span className="text-muted-foreground/70"> → "{keyword.value}"</span>
                      {keyword.caseSensitive && <span className="text-orange-600 ml-1">(case sensitive)</span>}
                    </div>

                    {/* Output handle for this keyword */}
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={`keyword-${keyword.value.toLowerCase().replace(/\s+/g, '-')}`}
                      style={{
                        ...standardHandleStyle,
                        top: '50%',
                        right: '-12px'
                      }}
                      isConnectable={isConnectable}
                    />
                  </div>
                ))}

                {/* No match handle */}
                <div className="flex items-center gap-2 relative mt-2 pt-2 border-t border-border/50">
                  <div className="flex-shrink-0 w-4 h-4 rounded bg-muted-foreground text-primary-foreground flex items-center justify-center text-[10px] font-medium">
                    ?
                  </div>
                  <div className="flex-1 text-muted-foreground">
                    {t('flow_builder.no_match_route', 'No keyword match')}
                  </div>

                  <Handle
                    type="source"
                    position={Position.Right}
                    id="no-match"
                    style={{
                      ...standardHandleStyle,
                      top: '50%',
                      right: '-12px',
                      background: '#9ca3af'
                    }}
                    isConnectable={isConnectable}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />

      {/* Output handles only shown when keyword triggers are enabled */}
    </div>
  );
}

function TriggerNode({ data, isConnectable, id }: any) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [triggerType, setTriggerType] = useState(data.triggerType || 'message_received');
  const [localConditionType, setLocalConditionType] = useState(data.conditionType || 'any');
  const [localConditionValue, setLocalConditionValue] = useState(data.conditionValue || '');
  const [selectedChannelType, setSelectedChannelType] = useState<string>(
    Array.isArray(data.channelTypes) ? data.channelTypes[0] || 'whatsapp_unofficial' : data.channelTypes || 'whatsapp_unofficial'
  );
  
  interface Pipeline {
    id: number;
    name: string;
    description: string | null;
    icon: string | null;
    color: string | null;
    isDefault: boolean;
    orderNum: number;
  }

  const { data: pipelines } = useQuery<Pipeline[]>({
    queryKey: ['/api/pipelines'],
    queryFn: async () => {
      const response = await fetch('/api/pipelines');
      if (!response.ok) throw new Error('Failed to fetch pipelines');
      return response.json() as Promise<Pipeline[]>;
    },
    staleTime: 60 * 1000,
  });
  const [hardResetKeyword, setHardResetKeyword] = useState(data.hardResetKeyword || '');
  const [hardResetConfirmationMessage, setHardResetConfirmationMessage] = useState(
    data.hardResetConfirmationMessage || t('flow_builder.trigger_default_reset_message', 'Bot has been reactivated. Starting fresh conversation...')
  );
  const [sessionTimeout, setSessionTimeout] = useState(data.sessionTimeout || 30);
  const [sessionTimeoutUnit, setSessionTimeoutUnit] = useState(data.sessionTimeoutUnit || 'minutes');
  const [enableSessionPersistence, setEnableSessionPersistence] = useState(data.enableSessionPersistence !== false);
  const [multipleKeywords, setMultipleKeywords] = useState(data.multipleKeywords || '');
  const [keywordsCaseSensitive, setKeywordsCaseSensitive] = useState(data.keywordsCaseSensitive || false);
  const { setNodes, setEdges, getEdges } = useReactFlow();
  const flowContext = useFlowContext();

  const getConditionLabel = (conditionType: string): string => {
    switch (conditionType) {
      case 'multiple_keywords': return t('flow_builder.trigger_condition_contains_any', 'contains any of');
      case 'regex': return t('flow_builder.trigger_condition_matches_pattern', 'matches pattern');
      case 'media': return t('flow_builder.trigger_condition_has_media', 'has media attachment');
      default: return '';
    }
  };

  const getConditionPlaceholder = (conditionType: string): string => {
    switch (conditionType) {
      case 'multiple_keywords': return t('flow_builder.trigger_placeholder_keywords', 'Enter keywords separated by commas (e.g., help, support, agent)');
      case 'regex': return t('flow_builder.trigger_placeholder_regex', '\\b\\w+\\b');
      default: return '';
    }
  };

  const channelTypes = [
    { value: 'whatsapp_unofficial', label: t('flow_builder.trigger_channel_whatsapp_unofficial', 'WhatsApp (Unofficial)'), icon: 'fab fa-whatsapp', color: 'text-green-600 dark:text-green-400' },
    { value: 'whatsapp_official', label: t('flow_builder.trigger_channel_whatsapp_official', 'WhatsApp (Official)'), icon: 'fab fa-whatsapp', color: 'text-green-700 dark:text-green-400' },
    { value: 'messenger', label: t('flow_builder.trigger_channel_messenger', 'Facebook Messenger'), icon: 'fab fa-facebook-messenger', color: 'text-blue-500 dark:text-blue-400' },
    { value: 'instagram', label: t('flow_builder.trigger_channel_instagram', 'Instagram'), icon: 'fab fa-instagram', color: 'text-pink-500 dark:text-pink-400' },
    { value: 'email', label: t('flow_builder.trigger_channel_email', 'Email'), icon: 'fas fa-envelope', color: 'text-muted-foreground' },
    { value: 'webchat', label: t('flow_builder.trigger_channel_webchat', 'WebChat'), color: 'text-indigo-600 dark:text-indigo-400' }
  ];

  const getConditionTypesForChannels = (channels: string[]) => {
    const baseConditions = [
      { value: 'any', label: t('flow_builder.any_message', 'Any Message') },
      { value: 'multiple_keywords', label: t('flow_builder.multiple_keywords', 'Multiple Keywords') },
      { value: 'regex', label: t('flow_builder.regex_pattern', 'Regex Pattern') }
    ];


    const supportsMedia = channels.some(ch =>
      ['whatsapp_unofficial', 'whatsapp_official', 'messenger', 'instagram', 'webchat'].includes(ch)
    );
    if (supportsMedia) {
      baseConditions.push({ value: 'media', label: t('flow_builder.has_media', 'Has Media') });
    }


    const hasEmail = channels.includes('email');
    if (hasEmail) {
      baseConditions.push(
        { value: 'subject_contains', label: t('flow_builder.subject_contains', 'Subject Contains') },
        { value: 'from_domain', label: t('flow_builder.from_domain', 'From Domain') },
        { value: 'has_attachment', label: t('flow_builder.has_attachment', 'Has Attachment') }
      );
    }

    return baseConditions;
  };

  const conditionTypes = getConditionTypesForChannels([selectedChannelType]);

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


  const parseKeywords = (keywordString: string): string[] => {
    return keywordString
      .split(',')
      .map(keyword => keyword.trim())
      .filter(keyword => keyword.length > 0);
  };


  const validateKeywords = (keywordString: string): boolean => {
    const keywords = parseKeywords(keywordString);
    return keywords.length > 0;
  };


  useEffect(() => {
    if (localConditionType === 'multiple_keywords') {
      const currentKeywords = parseKeywords(multipleKeywords);
      const currentHandleIds = currentKeywords.map(keyword =>
        `keyword-${keyword.toLowerCase().replace(/\s+/g, '-')}`
      );


      const currentEdges = getEdges();
      const edgesToRemove = currentEdges.filter(edge =>
        edge.source === id &&
        edge.sourceHandle &&
        edge.sourceHandle.startsWith('keyword-') &&
        !currentHandleIds.includes(edge.sourceHandle)
      );

      if (edgesToRemove.length > 0) {
        setEdges(edges => edges.filter(edge => !edgesToRemove.includes(edge)));

      }
    }
  }, [multipleKeywords, localConditionType, id, getEdges, setEdges]);

  const handleChannelTypeSelect = (channelType: string) => {
    setSelectedChannelType(channelType);
    updateNodeData({ channelTypes: [channelType] }); // Keep as array for backward compatibility

    const supportedConditions = getConditionTypesForChannels([channelType]);
    if (!supportedConditions.some(ct => ct.value === localConditionType)) {
      setLocalConditionType('any');
      updateNodeData({ conditionType: 'any', conditionValue: '' });
    }
  };

  const handleConditionTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value;
    setLocalConditionType(newType);
    if (newType === 'media' || localConditionType === 'media') {
      setLocalConditionValue('');
      updateNodeData({ conditionType: newType, conditionValue: '' });
    } else {
      updateNodeData({ conditionType: newType });
    }
  };

  const handleConditionValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalConditionValue(newValue);
    updateNodeData({ conditionValue: newValue });
  };

  const handleHardResetKeywordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setHardResetKeyword(newValue);
    updateNodeData({ hardResetKeyword: newValue });
  };

  const handleHardResetConfirmationMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setHardResetConfirmationMessage(newValue);
    updateNodeData({ hardResetConfirmationMessage: newValue });
  };

  const handleSessionTimeoutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value) || 30;
    setSessionTimeout(newValue);
    updateNodeData({ sessionTimeout: newValue });
  };

  const handleSessionTimeoutUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    setSessionTimeoutUnit(newValue);
    updateNodeData({ sessionTimeoutUnit: newValue });
  };

  const handleEnableSessionPersistenceChange = (checked: boolean) => {
    setEnableSessionPersistence(checked);
    updateNodeData({ enableSessionPersistence: checked });
  };

  const handleMultipleKeywordsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setMultipleKeywords(newValue);
    const keywordsArray = parseKeywords(newValue);
    updateNodeData({
      multipleKeywords: newValue,
      keywordsArray: keywordsArray
    });
  };

  const handleKeywordsCaseSensitiveChange = (checked: boolean) => {
    setKeywordsCaseSensitive(checked);
    updateNodeData({ keywordsCaseSensitive: checked });
  };

  return (
    <div className="node-trigger p-3 rounded-lg bg-card border border-border shadow-sm max-w-[350px] min-w-[300px] group">
      {flowContext && (
        <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
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
                <p className="text-xs">{t('flow_builder.trigger_delete_node', 'Delete node')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
      <div className="font-medium flex items-center gap-2 mb-2">
        <img src="https://cdn-icons-png.flaticon.com/128/5324/5324247.png" alt="Message Trigger" className="h-4 w-4" />
        {selectedChannelType && (
          <i className={`${channelTypes.find(ct => ct.value === selectedChannelType)?.icon || 'fas fa-message'} text-green-600 dark:text-green-400 text-sm`}></i>
        )}
        <span>{t('flow_builder.trigger_node', 'Message Trigger')}</span>
        <button
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? t('common.hide', 'Hide') : t('common.edit', 'Edit')}
        </button>
      </div>


      

      <div className="text-sm p-2  rounded border border-border">
        <div className="text-xs text-muted-foreground mb-1">{t('flow_builder.when', 'When')}</div>

        <div className="flex items-center gap-1 flex-wrap">
          {selectedChannelType && (() => {
            const channelInfo = channelTypes.find(ct => ct.value === selectedChannelType);
            return (
              <span className="flex items-center gap-1">
                {channelInfo && (
                  <>
                    <i className={`${channelInfo.icon} ${channelInfo.color} text-xs`}></i>
                    <span className="font-medium text-xs">{channelInfo.label}</span>
                  </>
                )}
              </span>
            );
          })()}
          <span className="text-muted-foreground">{t('flow_builder.message_lowercase', 'message')}</span>
        </div>

        {data.conditionType !== 'any' && (
          <div className="mt-1 text-xs flex flex-wrap gap-1">
            <span>{t('flow_builder.that', 'that')} {getConditionLabel(data.conditionType)}</span>
            {data.conditionType === 'multiple_keywords' && data.multipleKeywords ? (
              <div className="flex flex-wrap gap-1">
                {parseKeywords(data.multipleKeywords).slice(0, 3).map((keyword, index) => (
                  <span key={index} className="font-medium bg-primary/10 rounded px-1">
                    "{keyword}"
                  </span>
                ))}
                {parseKeywords(data.multipleKeywords).length > 3 && (
                  <span className="text-muted-foreground">
                    {t('flow_builder.trigger_more_keywords', '+{{count}} more', { count: parseKeywords(data.multipleKeywords).length - 3 })}
                  </span>
                )}
              </div>
            ) : data.conditionValue && (
              <span className="font-medium bg-primary/10 rounded px-1">
                "{data.conditionValue}"
              </span>
            )}
          </div>
        )}

        {data.hardResetKeyword && (
          <div className="mt-1 text-xs flex flex-wrap gap-1">
            <span className="text-orange-600 dark:text-orange-400">{t('flow_builder.hard_reset_label', 'Hard Reset')}:</span>
            <span className="font-medium bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 rounded px-1">
              "{data.hardResetKeyword}"
            </span>
          </div>
        )}

        {data.enableSessionPersistence !== false && (
          <div className="mt-1 text-xs flex flex-wrap gap-1">
            <span className="text-blue-600 dark:text-blue-400">{t('flow_builder.session_active', 'Session')}:</span>
            <span className="font-medium bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded px-1">
              {data.sessionTimeout || 30} {data.sessionTimeoutUnit || 'minutes'}
            </span>
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="mt-3 text-xs space-y-2 p-2 border rounded ">
          <div>
            <label className="block mb-1 font-medium text-blue-600 dark:text-blue-400">
              Trigger Type
            </label>
            <select
              className="w-full p-1 border rounded bg-background text-xs"
              value={triggerType}
              onChange={(e) => {
                setTriggerType(e.target.value);
                updateNodeData({ triggerType: e.target.value });
              }}
            >
              <option value="message_received">Message Received</option>
              {/* <option value="webhook">Webhook</option>
              <option value="schedule">Schedule</option>
              <option value="manual">Manual</option>
              <option value="deal_enters_pipeline">Deal Enters Pipeline</option>
              <option value="deal_moves_between_pipelines">Deal Moves Between Pipelines</option>
              <option value="deal_stage_changed">Deal Stage Changed</option> */}
            </select>
          </div>

          {triggerType === 'deal_enters_pipeline' && (
            <div>
              <label className="block mb-1 font-medium">Target Pipeline</label>
              <select
                className="w-full p-1 border rounded bg-background text-xs"
                value={data.pipelineId?.toString() || ''}
                onChange={(e) => updateNodeData({ pipelineId: e.target.value ? parseInt(e.target.value) : null })}
              >
                <option value="">Select pipeline</option>
                {pipelines?.map((p: Pipeline) => (
                  <option key={p.id} value={p.id.toString()}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {triggerType === 'deal_moves_between_pipelines' && (
            <>
              <div>
                <label className="block mb-1 font-medium">From Pipeline (Optional)</label>
                <select
                  className="w-full p-1 border rounded bg-background text-xs"
                  value={data.fromPipelineId?.toString() || 'any'}
                  onChange={(e) => updateNodeData({ fromPipelineId: e.target.value === 'any' ? null : parseInt(e.target.value) })}
                >
                  <option value="any">Any Pipeline</option>
                  {pipelines?.map((p: Pipeline) => (
                    <option key={p.id} value={p.id.toString()}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block mb-1 font-medium">To Pipeline (Optional)</label>
                <select
                  className="w-full p-1 border rounded bg-background text-xs"
                  value={data.toPipelineId?.toString() || 'any'}
                  onChange={(e) => updateNodeData({ toPipelineId: e.target.value === 'any' ? null : parseInt(e.target.value) })}
                >
                  <option value="any">Any Pipeline</option>
                  {pipelines?.map((p: Pipeline) => (
                    <option key={p.id} value={p.id.toString()}>{p.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {triggerType === 'message_received' && (
            <>
          <div>
            <label className="block mb-1 font-medium text-blue-600 dark:text-blue-400">
              {t('flow_builder.channel_types', 'Channel Types')}
            </label>
            <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto">
              {channelTypes.map(channelType => (
                <label key={channelType.value} className="flex items-center space-x-1 p-1 hover: rounded cursor-pointer">
                  <input
                    type="radio"
                    name="channelType"
                    checked={selectedChannelType === channelType.value}
                    onChange={() => handleChannelTypeSelect(channelType.value)}
                    className="w-3 h-3"
                  />
                  <i className={`${channelType.icon} ${channelType.color} text-[10px]`}></i>
                  <span className="text-[10px] truncate">{channelType.label}</span>
                </label>
              ))}
            </div>
            <div className="text-[9px] text-muted-foreground mt-1">
              {t('flow_builder.channel_types_help_radio', 'Select which channel type this trigger should respond to.')}
            </div>
          </div>

          <div>
            <label className="block mb-1 font-medium">{t('flow_builder.trigger_condition_type', 'Condition Type')}</label>
            <select
              className="w-full p-1 border rounded bg-background text-xs"
              value={localConditionType}
              onChange={handleConditionTypeChange}
            >
              {conditionTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {localConditionType !== 'any' && localConditionType !== 'media' && (
            <div>
              <label className="block mb-1 font-medium">
                {localConditionType === 'multiple_keywords' ? t('flow_builder.trigger_multiple_keywords', 'Multiple Keywords') : t('flow_builder.trigger_pattern', 'Pattern')}
              </label>
              {localConditionType === 'multiple_keywords' ? (
                <div>
                  <input
                    className={`w-full p-1 border rounded bg-background text-xs ${
                      multipleKeywords && !validateKeywords(multipleKeywords) ? 'border-destructive' : ''
                    }`}
                    placeholder={getConditionPlaceholder(localConditionType)}
                    value={multipleKeywords}
                    onChange={handleMultipleKeywordsChange}
                  />
                  {!multipleKeywords && (
                    <div className="text-[9px] text-muted-foreground mt-1">
                      {t('flow_builder.trigger_keywords_help', 'Enter keywords separated by commas. The trigger will activate when any of these keywords is detected in a message.')}
                    </div>
                  )}
                  {multipleKeywords && (
                    <div className="mt-2">
                      <div className="text-[9px] text-muted-foreground mb-1">{t('flow_builder.trigger_keywords_label', 'Keywords:')}</div>
                      <div className="flex flex-wrap gap-1">
                        {parseKeywords(multipleKeywords).map((keyword, index) => (
                          <span
                            key={index}
                            className="inline-block bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400 text-[9px] px-1.5 py-0.5 rounded"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                      {!validateKeywords(multipleKeywords) && (
                        <div className="text-[9px] text-red-600 dark:text-red-400 mt-1">
                          {t('flow_builder.trigger_keywords_required', 'At least one keyword is required')}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-2 flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="case-sensitive-keywords"
                      checked={keywordsCaseSensitive}
                      onChange={(e) => handleKeywordsCaseSensitiveChange(e.target.checked)}
                      className="w-3 h-3"
                    />
                    <label htmlFor="case-sensitive-keywords" className="text-[10px] text-muted-foreground">
                      {t('flow_builder.trigger_case_sensitive', 'Case sensitive matching')}
                    </label>
                  </div>
                </div>
              ) : (
                <input
                  className="w-full p-1 border rounded bg-background text-xs"
                  placeholder={getConditionPlaceholder(localConditionType)}
                  value={localConditionValue}
                  onChange={handleConditionValueChange}
                />
              )}
            </div>
          )}

          <div className="border-t pt-2 mt-2">
            <label className="block mb-1 font-medium text-orange-600 dark:text-orange-400">
              {t('flow_builder.hard_reset_keyword', 'Hard Reset Keyword')}
            </label>
            <input
              className="w-full p-1 border rounded bg-background text-xs"
              placeholder={t('flow_builder.hard_reset_keyword_placeholder', 'reset, restart, newchat, etc.')}
              value={hardResetKeyword}
              onChange={handleHardResetKeywordChange}
            />
            <div className="text-[9px] text-muted-foreground mt-1">
              {t('flow_builder.hard_reset_keyword_help', 'When bot is disabled, users can type this keyword to re-enable the bot and start fresh')}
            </div>
          </div>

          {hardResetKeyword && (
            <div>
              <label className="block mb-1 font-medium text-orange-600">
                {t('flow_builder.hard_reset_confirmation_message', 'Reset Confirmation Message')}
              </label>
              <textarea
                className="w-full p-1 border rounded bg-background text-xs h-12 resize-none"
                placeholder={t('flow_builder.hard_reset_confirmation_placeholder', 'Bot has been reactivated. Starting fresh conversation...')}
                value={hardResetConfirmationMessage}
                onChange={handleHardResetConfirmationMessageChange}
              />
              <div className="text-[9px] text-muted-foreground mt-1">
                {t('flow_builder.hard_reset_confirmation_help', 'Message sent to user when hard reset is triggered')}
              </div>
            </div>
          )}

          <div className="border-t pt-2 mt-2">
            <div className="flex items-center justify-between mb-2">
              <label className="block font-medium text-blue-600 dark:text-blue-400">
                {t('flow_builder.session_persistence', 'Session-Based Triggering')}
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id={`session-persistence-${id}`}
                  checked={enableSessionPersistence}
                  readOnly
                  disabled
                  className="w-3 h-3 opacity-50 cursor-not-allowed"
                />
                <label htmlFor={`session-persistence-${id}`} className="text-xs text-muted-foreground cursor-not-allowed">{t('flow_builder.trigger_enable', 'Enable')}</label>
              </div>
            </div>
            <div className="text-[9px] text-muted-foreground mb-2">
              {t('flow_builder.session_persistence_help', 'When enabled, users who match the condition will continue triggering this flow for subsequent messages until session expires')}
            </div>

            {enableSessionPersistence && (
              <div className="space-y-2 pt-2 border-t">
                <label className="block mb-1 font-medium text-xs">
                  {t('flow_builder.session_timeout', 'Session Timeout')}
                </label>
                <div className="flex gap-2">
                  <NumberInput
                    min={1}
                    max={1440}
                    value={sessionTimeout}
                    onChange={(value) => {
                      setSessionTimeout(value);
                      updateNodeData({ sessionTimeout: value });
                    }}
                    fallbackValue={30}
                    className="flex-1 p-1 border rounded bg-background text-xs"
                  />
                  <select
                    className="p-1 border rounded bg-background text-xs"
                    value={sessionTimeoutUnit}
                    onChange={handleSessionTimeoutUnitChange}
                  >
                    <option value="minutes">{t('flow_builder.trigger_minutes', 'Minutes')}</option>
                    <option value="hours">{t('flow_builder.trigger_hours', 'Hours')}</option>
                    <option value="days">{t('flow_builder.trigger_days', 'Days')}</option>
                  </select>
                </div>
                <div className="text-[9px] text-muted-foreground">
                  {t('flow_builder.session_timeout_help', 'After this period of inactivity, the user session will reset and conditions will be evaluated again')}
                </div>
              </div>
            )}
          </div>
            </>
          )}

          <div className="text-[10px] text-muted-foreground mt-2">
            {t('flow_builder.changes_saved_automatically', 'Changes are saved automatically when you save the flow.')}
          </div>
        </div>
      )}

      {/* Dynamic output handles based on condition type */}
      {localConditionType === 'multiple_keywords' && multipleKeywords ? (
        <div className="relative">
          {/* Multiple keyword handles */}
          {parseKeywords(multipleKeywords).map((keyword, index) => (
            <div key={`keyword-${keyword}`} className="absolute" style={{ left: `${20 + (index * 60)}px`, bottom: '-30px' }}>
              <Handle
                type="source"
                position={Position.Bottom}
                id={`keyword-${keyword.toLowerCase().replace(/\s+/g, '-')}`}
                style={{
                  ...standardHandleStyle,
                  position: 'relative',
                  left: '0px',
                  bottom: '0px'
                }}
                isConnectable={isConnectable}
              />
              <div className="absolute top-5 left-1/2 transform -translate-x-1/2 text-[8px] text-muted-foreground whitespace-nowrap bg-background px-1 rounded border">
                {keyword}
              </div>
            </div>
          ))}
        </div>
      ) : (

        <Handle
          type="source"
          position={Position.Right}
          style={{
            ...standardHandleStyle,
            right: '-6px', // Position at the very right edge
            top: '50%',    // Center vertically (middle)
            transform: 'translateY(-50%)' // Perfect center alignment
          }}
          isConnectable={isConnectable}
        />
      )}
    </div>
  );
}




function WaitNode({ data, isConnectable, id }: any) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const { setNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode } = useFlowContext();

  const [waitMode, setWaitMode] = useState(data.waitMode || 'duration');

  const [timeValue, setTimeValue] = useState(data.timeValue || 5);
  const [timeUnit, setTimeUnit] = useState(data.timeUnit || 'minutes');

  const [waitDate, setWaitDate] = useState<Date | undefined>(
    data.waitDate ? new Date(data.waitDate) : undefined
  );
  const [waitTime, setWaitTime] = useState(data.waitTime || '12:00');
  const [timezone, setTimezone] = useState(data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);

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

  const handleModeChange = (newMode: string) => {
    setWaitMode(newMode);
    updateNodeData({ waitMode: newMode });
  };

  const handleTimeValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 1;
    setTimeValue(value);
    updateNodeData({ timeValue: value });
  };

  const handleTimeUnitChange = (value: string) => {
    setTimeUnit(value);
    updateNodeData({ timeUnit: value });
  };

  const handleDateChange = (date: Date | undefined) => {
    setWaitDate(date);
    updateNodeData({ waitDate: date ? date.toISOString() : null });
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWaitTime(e.target.value);
    updateNodeData({ waitTime: e.target.value });
  };

  const handleTimezoneChange = (value: string) => {
    setTimezone(value);
    updateNodeData({ timezone: value });
  };

  const formatDate = (date: Date | undefined): string => {
    if (!date) return t('flow_builder.wait_no_date_selected', 'No date selected');
    return date.toLocaleDateString();
  };

  const getWaitDescription = (): string => {
    if (waitMode === 'duration') {
      return t('flow_builder.wait_for_duration', 'Wait for {{value}} {{unit}}', { value: timeValue, unit: timeUnit });
    } else {
      if (!waitDate) return t('flow_builder.wait_schedule_not_set', 'Schedule not set');
      return t('flow_builder.wait_scheduled_for', 'Scheduled for {{date}} at {{time}} ({{timezone}})', {
        date: formatDate(waitDate),
        time: waitTime,
        timezone: timezone.split('/').pop()?.replace('_', ' ') || timezone
      });
    }
  };

  return (
    <div className="node-wait p-3 rounded-lg bg-card border border-border shadow-sm max-w-[250px] group">
      <NodeToolbar id={id} onDuplicate={onDuplicateNode} onDelete={onDeleteNode} />

      <div className="font-medium flex items-center gap-2 mb-2">
        <img 
          src="https://cdn-icons-png.flaticon.com/128/717/717815.png" 
          alt="Wait" 
          className="h-4 w-4"
        />
        <span>{t('flow_builder.wait_node_title', 'Wait')}</span>
        <button
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? t('common.done', 'Done') : t('common.edit', 'Edit')}
        </button>
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              size="sm"
              variant={waitMode === 'duration' ? 'default' : 'outline'}
              onClick={() => handleModeChange('duration')}
              className="text-xs"
            >
              <Clock className="h-3 w-3 mr-1" />
              {t('flow_builder.wait_duration_mode', 'Duration')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={waitMode === 'datetime' ? 'default' : 'outline'}
              onClick={() => handleModeChange('datetime')}
              className="text-xs"
            >
              <CalendarClock className="h-3 w-3 mr-1" />
              {t('flow_builder.wait_schedule_mode', 'Schedule')}
            </Button>
          </div>

          {waitMode === 'duration' ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">{t('flow_builder.wait_time_value', 'Duration')}</label>
                <NumberInput
                  min={1}
                  value={timeValue}
                  onChange={(value) => {
                    setTimeValue(value);
                    updateNodeData({ timeValue: value });
                  }}
                  fallbackValue={1}
                  className="w-full p-1 border rounded bg-background text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t('flow_builder.wait_time_unit', 'Unit')}</label>
                <Select value={timeUnit} onValueChange={handleTimeUnitChange}>
                  <SelectTrigger className="w-full h-8 text-xs">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seconds">{t('flow_builder.wait_seconds', 'Seconds')}</SelectItem>
                    <SelectItem value="minutes">{t('flow_builder.wait_minutes', 'Minutes')}</SelectItem>
                    <SelectItem value="hours">{t('flow_builder.wait_hours', 'Hours')}</SelectItem>
                    <SelectItem value="days">{t('flow_builder.wait_days', 'Days')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground">{t('flow_builder.wait_date', 'Date')}</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="brand"
                      size="sm"
                      className="w-full justify-start text-left font-normal h-8 text-xs"
                    >
                      <CalendarIcon className="mr-2 h-3 w-3" />
                      {waitDate ? formatDate(waitDate) : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={waitDate}
                      onSelect={handleDateChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t('flow_builder.wait_time', 'Time')}</label>
                <input
                  type="time"
                  className="w-full h-8 p-1 border rounded bg-background text-xs"
                  value={waitTime}
                  onChange={handleTimeChange}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t('flow_builder.wait_timezone', 'Timezone')}</label>
                <Select value={timezone} onValueChange={handleTimezoneChange}>
                  <SelectTrigger className="w-full h-8 text-xs">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[160px]">
                    <SelectGroup>
                      {Intl.supportedValuesOf("timeZone").map((tz) => (
                        <SelectItem key={tz} value={tz} className="text-xs">
                          {tz.replace('_', ' ').split('/').pop() || tz}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm p-2  rounded border border-border">
          {getWaitDescription()}
        </div>
      )}

      <Handle
        type="target"
        position={Position.Top}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
    </div>
  );
}

interface QuickReplyOption {
  text: string;
  value: string;
}

function QuickReplyNode({ data, isConnectable, id }: any) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState(data.message || t('flow_builder.quick_reply_default_message', 'Please select an option to continue:'));
  const [options, setOptions] = useState<QuickReplyOption[]>(
    data.options || [
      { text: t('flow_builder.quick_reply_default_option1', 'I have a question about my order.'), value: "order" },
      { text: t('flow_builder.quick_reply_default_option2', 'I have a question about a product.'), value: "product" },
      { text: t('flow_builder.quick_reply_default_option3', 'I have another question.'), value: "other" }
    ]
  );

  const [invalidResponseMessage, setInvalidResponseMessage] = useState(
    data.invalidResponseMessage || t('flow_builder.quick_reply_invalid_response', "I didn't understand your selection. Please choose one of the available options:")
  );

  const [enableGoBack, setEnableGoBack] = useState(data.enableGoBack !== false);
  const [goBackText, setGoBackText] = useState(data.goBackText || t('flow_builder.quick_reply_go_back_default', '← Go Back'));
  const [goBackValue, setGoBackValue] = useState(data.goBackValue || 'go_back');

  const [showPreview, setShowPreview] = useState(false);
  const { setNodes } = useReactFlow();
  const flowContext = useFlowContext();

  const availableVariables = [
    { name: "contact.name", description: "Contact's name" },
    { name: "contact.phone", description: "Contact's phone number" },
    { name: "date.today", description: "Current date" },
    { name: "time.now", description: "Current time" }
  ];

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

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newMessage = e.target.value;
    setMessage(newMessage);
    updateNodeData({ message: newMessage });
  };


  const handleInvalidResponseMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newInvalidMessage = e.target.value;
    setInvalidResponseMessage(newInvalidMessage);
    updateNodeData({ invalidResponseMessage: newInvalidMessage });
  };

  const handleEnableGoBackChange = (checked: boolean) => {
    setEnableGoBack(checked);
    updateNodeData({ enableGoBack: checked });
  };

  const handleGoBackTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newText = e.target.value;
    setGoBackText(newText);
    updateNodeData({ goBackText: newText });
  };

  const handleGoBackValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setGoBackValue(newValue);
    updateNodeData({ goBackValue: newValue });
  };

  const handleOptionTextChange = (index: number, text: string) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], text };
    setOptions(newOptions);
    updateNodeData({ options: newOptions });
  };

  const handleOptionValueChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], value };
    setOptions(newOptions);
    updateNodeData({ options: newOptions });
  };

  const addOption = () => {
    const newOptions = [...options, { text: t('flow_builder.quick_reply_new_option', 'New option'), value: `option${options.length + 1}` }];
    setOptions(newOptions);
    updateNodeData({ options: newOptions });
  };

  const removeOption = (index: number) => {
    const newOptions = options.filter((_, i) => i !== index);
    setOptions(newOptions);
    updateNodeData({ options: newOptions });
  };


  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();

    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      return;
    }

    const newOptions = [...options];
    const draggedOption = newOptions[draggedIndex];


    newOptions.splice(draggedIndex, 1);


    newOptions.splice(dropIndex, 0, draggedOption);

    setOptions(newOptions);
    updateNodeData({ options: newOptions });
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };


  const [selectedOptions, setSelectedOptions] = useState<Set<number>>(new Set());

  const toggleOptionSelection = (index: number) => {
    const newSelected = new Set(selectedOptions);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedOptions(newSelected);
  };

  const selectAllOptions = () => {
    setSelectedOptions(new Set(options.map((_, index) => index)));
  };

  const deselectAllOptions = () => {
    setSelectedOptions(new Set());
  };

  const bulkDeleteOptions = () => {
    const newOptions = options.filter((_, index) => !selectedOptions.has(index));
    if (newOptions.length === 0) {

      return;
    }
    setOptions(newOptions);
    updateNodeData({ options: newOptions });
    setSelectedOptions(new Set());
  };

  const bulkDuplicateOptions = () => {
    const newOptions = [...options];
    selectedOptions.forEach(index => {
      const optionToDuplicate = options[index];
      newOptions.push({
        text: `${optionToDuplicate.text} (Copy)`,
        value: `${optionToDuplicate.value}_copy`
      });
    });
    setOptions(newOptions);
    updateNodeData({ options: newOptions });
    setSelectedOptions(new Set());
  };


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {

      if (!isEditing) return;


      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && e.target instanceof HTMLElement &&
          e.target.closest('.node-quickreply')) {
        e.preventDefault();
        selectAllOptions();
        return;
      }


      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedOptions.size > 0) {
        e.preventDefault();
        bulkDuplicateOptions();
        return;
      }


      if (e.key === 'Delete' && selectedOptions.size > 0 &&
          e.target instanceof HTMLElement && e.target.closest('.node-quickreply')) {
        e.preventDefault();
        bulkDeleteOptions();
        return;
      }


      if (e.key === 'Escape' && selectedOptions.size > 0) {
        e.preventDefault();
        deselectAllOptions();
        return;
      }


      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && options.length < 10) {
        e.preventDefault();
        addOption();
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, selectedOptions, options.length, selectAllOptions, bulkDuplicateOptions, bulkDeleteOptions, deselectAllOptions, addOption]);

  const insertVariable = (variable: string) => {
    const textArea = document.getElementById(`quickreply-textarea-${id}`) as HTMLTextAreaElement;
    if (!textArea) return;

    const cursorPos = textArea.selectionStart;
    const variableText = `{{${variable}}}`;
    const newMessage = message.substring(0, cursorPos) + variableText + message.substring(cursorPos);

    setMessage(newMessage);
    updateNodeData({ message: newMessage });

    setTimeout(() => {
      textArea.focus();
      textArea.setSelectionRange(cursorPos + variableText.length, cursorPos + variableText.length);
    }, 0);
  };


  const insertVariableIntoInvalidMessage = (variable: string) => {
    const textArea = document.getElementById(`quickreply-invalid-textarea-${id}`) as HTMLTextAreaElement;
    if (!textArea) return;

    const cursorPos = textArea.selectionStart;
    const variableText = `{{${variable}}}`;
    const newInvalidMessage = invalidResponseMessage.substring(0, cursorPos) + variableText + invalidResponseMessage.substring(cursorPos);

    setInvalidResponseMessage(newInvalidMessage);
    updateNodeData({ invalidResponseMessage: newInvalidMessage });

    setTimeout(() => {
      textArea.focus();
      textArea.setSelectionRange(cursorPos + variableText.length, cursorPos + variableText.length);
    }, 0);
  };


  const validateVariables = (text: string) => {
    const regex = /\{\{([^}]+)\}\}/g;
    const validVariables = availableVariables.map(v => v.name);
    const issues: string[] = [];
    let match;

    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
      const variableName = match[1].trim();
      if (!validVariables.includes(variableName)) {
        issues.push(`Unknown variable: {{${variableName}}}`);
      }
    }

    return issues;
  };


  const formatMessage = (text: string, showPreview = false) => {
    const regex = /\{\{([^}]+)\}\}/g;

    if (!regex.test(text)) {
      return text;
    }

    const parts = [];
    let lastIndex = 0;
    let match;


    const previewValues: Record<string, string> = {
      'contact.name': 'John Doe',
      'contact.phone': '+1234567890',
      'date.today': new Date().toLocaleDateString(),
      'time.now': new Date().toLocaleTimeString()
    };

    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      const variableName = match[1].trim();
      const validVariables = availableVariables.map(v => v.name);
      const isValid = validVariables.includes(variableName);
      const previewValue = showPreview ? previewValues[variableName] : null;

      if (showPreview && previewValue) {

        parts.push(
          <span key={match.index} className="bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400 px-1 rounded font-medium">
            {previewValue}
          </span>
        );
      } else {

        parts.push(
          <span
            key={match.index}
            className={`px-1 rounded ${
              isValid
                ? 'bg-primary/10 text-primary'
                : 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800'
            }`}
            title={isValid ? `Variable: ${variableName}` : `Invalid variable: ${variableName}`}
          >
            {match[0]}
          </span>
        );
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts;
  };

  return (
    <div className="node-quickreply p-3 rounded-lg bg-card border border-border shadow-sm max-w-[380px] group">
      {flowContext && (
        <NodeToolbar
          id={id}
          onDuplicate={flowContext.onDuplicateNode}
          onDelete={flowContext.onDeleteNode}
        />
      )}

      <div className="font-medium flex items-center gap-2 mb-2">
        <img src="https://cdn-icons-png.flaticon.com/128/14669/14669047.png" alt="Quick Reply Options" className="h-4 w-4" />
        <span>{t('flow_builder.quick_reply_node_title', 'Quick Reply Options')}</span>
        <button
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? 'Done' : 'Edit'}
        </button>
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block">{t('flow_builder.quick_reply_message_label', 'Message:')}</label>
            <textarea
              id={`quickreply-textarea-${id}`}
              className="w-full p-2 text-sm border rounded min-h-[80px] resize-none"
              value={message}
              onChange={handleMessageChange}
              placeholder="Type your message here..."
            />

            {/* 🔧 NEW: Validation warnings for main message */}
            {(() => {
              const issues = validateVariables(message);
              return issues.length > 0 && (
                <div className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2">
                  <div className="font-medium mb-1">Variable Issues:</div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {issues.map((issue, index) => (
                      <li key={index}>{issue}</li>
                    ))}
                  </ul>
                </div>
              );
            })()}

            <div className="mt-2">
              <p className="text-xs font-medium mb-1">Insert Variable:</p>
              <div className="flex flex-wrap gap-1">
                {availableVariables.map((variable) => (
                  <button
                    key={variable.name}
                    className="text-xs px-2 py-1  rounded hover:"
                    title={variable.description}
                    onClick={() => insertVariable(variable.name)}
                  >
                    {variable.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">{t('flow_builder.quick_reply_options_label', 'Options:')}</label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={addOption}
                disabled={options.length >= 10}
              >
                <Plus className="h-3 w-3 mr-1" />
                {t('flow_builder.quick_reply_add_option', 'Add Option')}
              </Button>
            </div>

            {/* 🔧 NEW: Bulk operations controls */}
            {options.length > 1 && (
              <div className="mb-3 p-2  rounded border">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {selectedOptions.size > 0 ? `${selectedOptions.size} selected` : 'Bulk actions:'}
                    </span>
                    <button
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-500"
                      onClick={selectedOptions.size === options.length ? deselectAllOptions : selectAllOptions}
                    >
                      {selectedOptions.size === options.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  {selectedOptions.size > 0 && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2"
                        onClick={bulkDuplicateOptions}
                      >
                        Duplicate
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500"
                        onClick={bulkDeleteOptions}
                        disabled={options.length - selectedOptions.size < 1}
                      >
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
              {options.map((option, index) => (
                <div
                  key={index}
                  className={`space-y-2 relative border rounded-lg p-2 transition-all ${
                    draggedIndex === index
                      ? 'opacity-50 scale-95 border-primary/50'
                      : 'border-transparent hover:border-border'
                  }`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                >
                  <div className="flex items-center gap-2">
                    {/* 🔧 NEW: Bulk selection checkbox */}
                    {options.length > 1 && (
                      <input
                        type="checkbox"
                        className="flex-shrink-0 w-4 h-4 rounded border-input"
                        checked={selectedOptions.has(index)}
                        onChange={() => toggleOptionSelection(index)}
                      />
                    )}
                    {/* 🔧 NEW: Drag handle */}
                    <div className="flex-shrink-0 cursor-move text-muted-foreground hover:text-foreground">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M7 2a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 2zM7 8a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 8zM7 14a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 14zM13 2a2 2 0 1 1 .001 4.001A2 2 0 0 1 13 2zM13 8a2 2 0 1 1 .001 4.001A2 2 0 0 1 13 8zM13 14a2 2 0 1 1 .001 4.001A2 2 0 0 1 13 14z"/>
                      </svg>
                    </div>
                    <div className="flex-shrink-0 w-6 h-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1 font-medium text-xs">Option {index + 1}</div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeOption(index)}
                      disabled={options.length <= 1}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="pl-8 space-y-2">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Display Text:</label>
                      <input
                        className="w-full p-2 text-sm border rounded"
                        value={option.text}
                        onChange={(e) => handleOptionTextChange(index, e.target.value)}
                        placeholder="Text to display"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Response Value:</label>
                      <input
                        className="w-full p-2 text-sm border rounded"
                        value={option.value}
                        onChange={(e) => handleOptionValueChange(index, e.target.value)}
                        placeholder="Value to match"
                      />
                      <div className="text-[10px] text-muted-foreground mt-1">
                        User can respond with this value to select this option
                      </div>
                    </div>
                  </div>

                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`option-${index + 1}`}
                    style={{
                      ...standardHandleStyle,
                      top: '30px',
                      right: '-12px'
                    }}
                    isConnectable={isConnectable}
                  />
                </div>
              ))}
            </div>

            <div className="text-[10px] text-muted-foreground mt-2 space-y-1">
              <div>Each option will have its own output connection.</div>
              {/* 🔧 NEW: Keyboard shortcuts help */}
              <div className="text-[9px] text-muted-foreground/70">
                <strong>Shortcuts:</strong> Ctrl+A (select all), Ctrl+D (duplicate), Del (delete), Esc (deselect), Ctrl+Enter (add option)
              </div>
            </div>
          </div>

          {/* 🔧 NEW: Invalid Response Message Section */}
          <div>
            <label className="text-xs font-medium mb-1 block">{t('flow_builder.quick_reply_invalid_response_label', 'Invalid Response Message:')}</label>
            <textarea
              id={`quickreply-invalid-textarea-${id}`}
              className="w-full p-2 text-sm border rounded min-h-[60px] resize-none"
              value={invalidResponseMessage}
              onChange={handleInvalidResponseMessageChange}
              placeholder="Message to send when user's response doesn't match any option..."
            />

            {/* 🔧 NEW: Validation warnings for invalid response message */}
            {(() => {
              const issues = validateVariables(invalidResponseMessage);
              return issues.length > 0 && (
                <div className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2">
                  <div className="font-medium mb-1">Variable Issues:</div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {issues.map((issue, index) => (
                      <li key={index}>{issue}</li>
                    ))}
                  </ul>
                </div>
              );
            })()}

            <div className="mt-2">
              <p className="text-xs font-medium mb-1">Insert Variable:</p>
              <div className="flex flex-wrap gap-1">
                {availableVariables.map((variable) => (
                  <button
                    key={variable.name}
                    className="text-xs px-2 py-1  rounded hover:"
                    title={variable.description}
                    onClick={() => insertVariableIntoInvalidMessage(variable.name)}
                  >
                    {variable.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[10px] text-muted-foreground mt-2">
              This message will be sent when the user's response doesn't match any of the option values above.
            </div>
          </div>

          {/* 🔧 NEW: Go Back Option Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">{t('flow_builder.quick_reply_go_back_label', 'Go Back Option:')}</label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableGoBack}
                  onChange={(e) => handleEnableGoBackChange(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <span className="text-muted-foreground">Enable Go Back</span>
              </label>
            </div>
            
            {enableGoBack && (
              <div className="space-y-2 p-3 border rounded-lg ">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Display Text:</label>
                  <input
                    className="w-full p-2 text-sm border rounded"
                    value={goBackText}
                    onChange={handleGoBackTextChange}
                    placeholder="← Go Back"
                  />
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Text shown to users for the go back option
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Response Value:</label>
                  <input
                    className="w-full p-2 text-sm border rounded"
                    value={goBackValue}
                    onChange={handleGoBackValueChange}
                    placeholder="go_back"
                  />
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Value users can type to trigger the go back action
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 🔧 NEW: Invalid Response Handle */}
          <Handle
            type="source"
            position={Position.Right}
            id="invalid-response"
            style={{
              ...standardHandleStyle,
              top: '50%',
              right: '-12px',
              backgroundColor: '#f97316', // Orange color for invalid response
              borderColor: '#ea580c'
            }}
            isConnectable={isConnectable}
          />

          {/* 🔧 NEW: Go Back Handle */}
          {enableGoBack && (
            <Handle
              type="source"
              position={Position.Right}
              id="go-back"
              style={{
                ...standardHandleStyle,
                top: '60%',
                right: '-12px',
                backgroundColor: '#6b7280', // Gray color for go back
                borderColor: '#4b5563'
              }}
              isConnectable={isConnectable}
            />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* 🔧 ENHANCED: Message display with validation and preview */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-muted-foreground">Message</div>
              <button
                className="text-xs px-2 py-1 rounded  hover: transition-colors"
                onClick={() => setShowPreview(!showPreview)}
                title={showPreview ? "Show variables" : "Show preview values"}
              >
                {showPreview ? "Variables" : "Preview"}
              </button>
            </div>
            <div className="text-sm p-2  rounded border border-border">
              {formatMessage(message, showPreview)}
            </div>
            {/* 🔧 NEW: Validation warnings */}
            {(() => {
              const issues = validateVariables(message);
              return issues.length > 0 && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                  <div className="font-medium mb-1">Variable Issues:</div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {issues.map((issue, index) => (
                      <li key={index}>{issue}</li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </div>

          <div className="space-y-1.5 mt-3">
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2 relative">
                <div className="flex-shrink-0 w-6 h-6 rounded-md bg-blue-500 text-white flex items-center justify-center text-xs font-medium">
                  {index + 1}
                </div>
                <div className="text-sm flex-1 pr-6">
                  <div>{option.text}</div>
                  <div className="text-xs text-muted-foreground">
                    Responds to: "{option.value}"
                  </div>
                </div>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`option-${index + 1}`}
                  style={{
                    ...standardHandleStyle,
                    top: '50%',
                    right: '-12px'
                  }}
                  isConnectable={isConnectable}
                />
              </div>
            ))}
            
            {/* 🔧 NEW: Go Back Option Display */}
            {enableGoBack && (
              <div className="flex items-center gap-2 relative">
                <div className="flex-shrink-0 w-6 h-6 rounded-md bg-muted-foreground text-primary-foreground flex items-center justify-center text-xs font-medium">
                  ←
                </div>
                <div className="text-sm flex-1 pr-6">
                  <div>{goBackText}</div>
                  <div className="text-xs text-muted-foreground">
                    Responds to: "{goBackValue}"
                  </div>
                </div>
                <Handle
                  type="source"
                  position={Position.Right}
                  id="go-back"
                  style={{
                    ...standardHandleStyle,
                    top: '50%',
                    right: '-12px',
                    backgroundColor: '#6b7280', // Gray color for go back
                    borderColor: '#4b5563'
                  }}
                  isConnectable={isConnectable}
                />
              </div>
            )}
          </div>

          {/* 🔧 NEW: Invalid Response Indicator in View Mode */}
          <div className="flex items-center gap-2 relative mt-3 pt-2 border-t border-border/50">
            <div className="flex-shrink-0 w-6 h-6 rounded-md bg-orange-500 dark:bg-orange-400 text-white flex items-center justify-center text-xs font-medium">
              !
            </div>
            <div className="text-sm flex-1 pr-6">
              <div className="text-orange-700 dark:text-orange-400 font-medium">Invalid Response</div>
              <div className="text-xs text-muted-foreground">
                {invalidResponseMessage.length > 50
                  ? `${invalidResponseMessage.substring(0, 50)}...`
                  : invalidResponseMessage}
              </div>
            </div>
            <Handle
              type="source"
              position={Position.Right}
              id="invalid-response"
              style={{
                ...standardHandleStyle,
                top: '50%',
                right: '-12px',
                backgroundColor: '#f97316', // Orange color for invalid response
                borderColor: '#ea580c'
              }}
              isConnectable={isConnectable}
            />
          </div>
        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  message: MessageNode,
  condition: ConditionNode,
  trigger: TriggerNode,
  image: ImageNode,
  video: VideoNode,
  audio: AudioNode,
  document: DocumentNode,
  wait: WaitNode,
  quickreply: QuickReplyNode,
  whatsapp_interactive_buttons: WhatsAppInteractiveButtonsNode,
  whatsapp_interactive_list: WhatsAppInteractiveListNode,
  whatsapp_cta_url: WhatsAppCTAURLNode,
  whatsapp_location_request: WhatsAppLocationRequestNode,
  whatsapp_poll: WhatsAppPollNode as any,

  ai_assistant: AIAssistantNode,
  translation: TranslationNode,
  update_pipeline_stage: UpdatePipelineStageNode,
  move_deal_to_pipeline: MoveDealToPipelineNode,
  manage_contact: ManageContactNode,
  contactNotification: ContactNotificationNode,
  webhook: WebhookNode,
  http_request: HTTPRequestNode,
  code_execution: CodeExecutionNode,
  whatsapp_flows: WhatsAppFlowsNode,
  n8n: N8nNode,
  make: MakeNode,
  google_sheets: GoogleSheetsNode,
  data_capture: DataCaptureNode,
  documind: DocumindNode,
  chat_pdf: ChatPdfNode,
  bot_disable: BotDisableNode,
  bot_reset: BotResetNode,
  stripe: StripeNode,
  call_agent: CallAgentNode
};

const CustomEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
}: EdgeProps) => {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleDelete = () => {
    setEdges((edges) => edges.filter((edge) => edge.id !== id));
  };

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 12,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <button
              className="flex items-center justify-center w-6 h-6 rounded-full bg-background border border-red-500 dark:border-red-400 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              onClick={handleDelete}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

const edgeTypes = {
  custom: CustomEdge,
  smoothstep: CustomEdge
};


function SidebarContent({ onAdd, nodes, flowId }: { onAdd: (type: string) => void; nodes: Node[]; flowId?: number }) {
  const { t } = useTranslation();

  return (
    <Tabs defaultValue="nodes" className="w-full h-full flex flex-col">
      <TabsList className="grid w-full grid-cols-2 mb-4">
        <TabsTrigger value="nodes" className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          {t('flow_builder.nodes', 'Nodes')}
        </TabsTrigger>
        <TabsTrigger value="variables" className="flex items-center gap-2">
          <Variable className="h-4 w-4" />
          {t('flow_builder.variables', 'Variables')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="nodes" className="flex-1 mt-0">
        <NodeSelector onAdd={onAdd} nodes={nodes} />
      </TabsContent>

      <TabsContent value="variables" className="flex-1 mt-0">
        <div className="h-full">
          <VariableBrowser
            flowId={flowId}
            className="h-full"
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}

function NodeSelector({ onAdd, nodes }: { onAdd: (type: string) => void; nodes: Node[] }) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');

  const getSingletonNodeState = (nodeType: string) => {
    switch (nodeType) {
      default:
        return { disabled: false, tooltip: '' };
    }
  };

  const allNodes = [
    {
      type: 'trigger',
      name: t('flow_builder.node_types.trigger_node', 'Message Trigger'),
      section: t('flow_builder.sections.triggers', 'Triggers'),
      icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/5324/5324247.png" alt="Message Trigger" className={className} />,
      color: 'text-green-500',
      ...getSingletonNodeState('trigger')
    },

    { type: 'message', name: t('flow_builder.node_types.text_message', 'Text Message'), section: t('flow_builder.sections.messages', 'Messages'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/811/811476.png" alt="Text Message" className={className} />, color: 'text-secondry', disabled: false },
    { type: 'quickreply', name: t('flow_builder.node_types.quick_reply_options', 'Quick Reply Options'), section: t('flow_builder.sections.messages', 'Messages'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/14669/14669047.png" alt="Quick Reply Options" className={className} />, color: 'text-blue-500', disabled: false },
    { type: 'whatsapp_poll', name: t('flow_builder.node_types.whatsapp_poll', 'WhatsApp Poll'), section: t('flow_builder.sections.messages', 'Messages'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/12482/12482449.png" alt="WhatsApp Poll" className={className} />, color: 'text-green-600', disabled: false },
    { type: 'whatsapp_interactive_buttons', name: t('flow_builder.node_types.whatsapp_interactive_buttons', 'WhatsApp Buttons'), section: t('flow_builder.sections.messages', 'Messages'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/1516/1516938.png" alt="WhatsApp Buttons" className={className} />, color: 'text-green-600', disabled: false },
    { type: 'whatsapp_interactive_list', name: t('flow_builder.node_types.whatsapp_interactive_list', 'WhatsApp List'), section: t('flow_builder.sections.messages', 'Messages'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/8428/8428362.png" alt="WhatsApp List" className={className} />, color: 'text-green-600', disabled: false },
    { type: 'whatsapp_cta_url', name: t('flow_builder.node_types.whatsapp_cta_url', 'WhatsApp CTA URL'), section: t('flow_builder.sections.messages', 'Messages'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/3305/3305847.png" alt="WhatsApp CTA URL" className={className} />, color: 'text-green-600', disabled: false },
    { type: 'whatsapp_location_request', name: t('flow_builder.node_types.whatsapp_location_request', 'WA Location Request'), section: t('flow_builder.sections.messages', 'Messages'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/535/535137.png" alt="WA Location Request" className={className} />, color: 'text-green-600', disabled: false },
    { type: 'whatsapp_flows', name: t('flow_builder.node_types.whatsapp_flows', 'WhatsApp Flows'), section: t('flow_builder.sections.messages', 'Messages'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/1587/1587495.png" alt="WhatsApp Flows" className={className} />, color: 'text-green-600', disabled: false },
    { type: 'image', name: t('flow_builder.node_types.image_message', 'Image Message'), section: t('flow_builder.sections.messages', 'Messages'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/17320/17320313.png" alt="Image Message" className={className} />, color: 'text-blue-500', disabled: false },
    { type: 'video', name: t('flow_builder.node_types.video_message', 'Video Message'), section: t('flow_builder.sections.messages', 'Messages'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/2839/2839026.png" alt="Video Message" className={className} />, color: 'text-red-500', disabled: false },
    { type: 'audio', name: t('flow_builder.node_types.audio_message', 'Audio Message'), section: t('flow_builder.sections.messages', 'Messages'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/5320/5320910.png" alt="Audio Message" className={className} />, color: 'text-purple-500', disabled: false },
    { type: 'document', name: t('flow_builder.node_types.document_message', 'Document Message'), section: t('flow_builder.sections.messages', 'Messages'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/136/136522.png" alt="Document Message" className={className} />, color: 'text-amber-600', disabled: false },



    { type: 'ai_assistant', name: t('flow_builder.node_types.ai_assistant', 'AI Assistant'), section: t('flow_builder.sections.flow_control', 'Flow Control'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/512/14958/14958196.png" alt="AI Assistant" className={className} />, color: 'text-violet-500', ...getSingletonNodeState('ai_assistant') },
    { type: 'condition', name: t('flow_builder.node_types.condition', 'Condition'), section: t('flow_builder.sections.flow_control', 'Flow Control'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/17359/17359067.png" alt="Condition" className={className} />, color: 'text-amber-500', disabled: false },
    { type: 'wait', name: t('flow_builder.node_types.wait', 'Wait'), section: t('flow_builder.sections.flow_control', 'Flow Control'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/717/717815.png" alt="Wait" className={className} />, color: 'text-orange-500', disabled: false },
    { type: 'translation', name: t('flow_builder.node_types.translation', 'Translation'), section: t('flow_builder.sections.flow_control', 'Flow Control'), icon: ({ className }: { className?: string }) => <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Google_Translate_logo.svg/1024px-Google_Translate_logo.svg.png" alt="Translation" className={className} />, color: 'text-blue-600', disabled: false },
    { type: 'update_pipeline_stage', name: t('flow_builder.node_types.pipeline', 'Pipeline'), section: t('flow_builder.sections.flow_control', 'Flow Control'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/10215/10215964.png" alt="Pipeline" className={className} />, color: 'text-teal-500', disabled: false },
    { type: 'move_deal_to_pipeline', name: 'Move Deal to Pipeline', section: t('flow_builder.sections.flow_control', 'Flow Control'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/10215/10215964.png" alt="Move Deal to Pipeline" className={className} />, color: 'text-purple-500', disabled: false },
    { type: 'manage_contact', name: t('flow_builder.node_types.manage_contact', 'Manage Contact'), section: t('flow_builder.sections.flow_control', 'Flow Control'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/9722/9722917.png" alt="Manage Contact" className={className} />, color: 'text-indigo-500', disabled: false },
    { type: 'bot_disable', name: t('flow_builder.node_types.agent_handoff', 'Agent Handoff'), section: t('flow_builder.sections.flow_control', 'Flow Control'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/8898/8898827.png" alt="Agent Handoff" className={className} />, color: 'text-orange-600', disabled: false },
    { type: 'n8n', name: t('flow_builder.node_types.n8n', 'n8n'), section: t('flow_builder.sections.integrations', 'Integrations'), icon: ({ className }: { className?: string }) => <img src="https://registry.npmmirror.com/@lobehub/icons-static-png/1.75.0/files/dark/n8n-color.png" alt="n8n" className={className} />, color: 'text-orange-600', disabled: false },
    { type: 'make', name: t('flow_builder.node_types.make_com', 'Make.com'), section: t('flow_builder.sections.integrations', 'Integrations'), icon: ({ className }: { className?: string }) => <img src="https://registry.npmmirror.com/@lobehub/icons-static-png/1.75.0/files/dark/make-color.png" alt="Make.com" className={className} />, color: 'text-blue-600', disabled: false },
    { type: 'http_request', name: t('flow_builder.node_types.http_request', 'HTTP Request'), section: t('flow_builder.sections.integrations', 'Integrations'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/1674/1674969.png" alt="HTTP Request" className={className} />, color: 'text-purple-500', disabled: false },
    { type: 'code_execution', name: t('flow_builder.node_types.code_execution', 'Code Execution'), section: t('flow_builder.sections.flow_control', 'Flow Control'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/4205/4205106.png" alt="Code Execution" className={className} />, color: 'text-foreground', disabled: false },
    { type: 'google_sheets', name: t('flow_builder.node_types.google_sheets', 'Google Sheets'), section: t('flow_builder.sections.integrations', 'Integrations'), icon: ({ className }: { className?: string }) => <img src="https://cdn.activepieces.com/pieces/google-sheets.png" alt="Google Sheets" className={className} />, color: 'text-green-600', disabled: false },
    { type: 'data_capture', name: t('flow_builder.node_types.data_capture', 'Data Capture'), section: t('flow_builder.sections.flow_control', 'Flow Control'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/2920/2920349.png" alt="Data Capture" className={className} />, color: 'text-blue-600', disabled: false },
    { type: 'webhook', name: t('flow_builder.node_types.webhook', 'Webhook'), section: t('flow_builder.sections.integrations', 'Integrations'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/919/919829.png" alt="Webhook" className={className} />, color: 'text-blue-500', disabled: false },
    { type: 'stripe', name: t('flow_builder.node_types.stripe', 'Stripe'), section: t('flow_builder.sections.integrations', 'Integrations'), icon: ({ className }: { className?: string }) => <img src="https://cdn.activepieces.com/pieces/stripe.png" alt="Stripe" className={className} />, color: 'text-blue-600', disabled: false },
    { 
      type: 'call_agent', 
      name: t('flow_builder.node_types.call_agent', 'Call Agent'), 
      section: t('flow_builder.sections.integrations', 'Integrations'), 
      icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/8898/8898892.png" alt="Call Agent" className={className} />, 
      color: 'text-blue-500', 
      disabled: false 
    },
    { type: 'contactNotification', name: t('flow_builder.contact_notification', 'Contact Notification'), section: t('flow_builder.sections.messages', 'Messages'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/4325/4325930.png" alt="Contact Notification" className={className} />, color: 'text-purple-600', disabled: false },
    { type: 'documind', name: t('flow_builder.node_types.documind_pdf_chat', 'Documind PDF Chat'), section: t('flow_builder.sections.integrations', 'Integrations'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/136/136522.png" alt="Documind PDF Chat" className={className} />, color: 'text-orange-600', disabled: false },
    { type: 'chat_pdf', name: t('flow_builder.node_types.chat_pdf_ai', 'Chat PDF AI'), section: t('flow_builder.sections.integrations', 'Integrations'), icon: ({ className }: { className?: string }) => <img src="https://cdn-icons-png.flaticon.com/128/136/136522.png" alt="Chat PDF AI" className={className} />, color: 'text-blue-600', disabled: false },
  ];

  const filteredNodes = searchTerm.trim() === '' ? allNodes : allNodes.filter(node => {
    const searchLower = searchTerm.toLowerCase();
    return (
      node.name.toLowerCase().includes(searchLower) ||
      node.section.toLowerCase().includes(searchLower) ||
      node.type.toLowerCase().includes(searchLower)
    );
  });

  const groupedNodes = filteredNodes.reduce((acc, node) => {
    if (!acc[node.section]) {
      acc[node.section] = [];
    }
    acc[node.section].push(node);
    return acc;
  }, {} as Record<string, typeof allNodes>);


  const clearSearch = () => {
    setSearchTerm('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      clearSearch();
    } else if (e.key === 'Enter' && filteredNodes.length === 1) {
      onAdd(filteredNodes[0].type);
    }
  };


  return (
    <div className="w-full flex flex-col h-full">
      <div className="relative mb-3 flex-shrink-0">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={t('flow_builder.search_nodes', 'Search nodes...')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          className="pl-10 pr-10 h-9 text-sm"
        />
        {searchTerm && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0 hover:bg-muted"
            onClick={clearSearch}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      <h3 className="font-medium mb-3 flex-shrink-0">{t('flow_builder.add_node', 'Add Node')}</h3>

      <div
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{
          scrollbarWidth: 'thin',
          maxHeight: 'calc(100vh - 200px)',
          overflowY: 'auto',
          paddingRight: '4px'
        }}
      >
        {searchTerm && filteredNodes.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('flow_builder.no_nodes_found', 'No nodes found')}</p>
            <p className="text-xs">{t('flow_builder.try_different_search', 'Try a different search term')}</p>
          </div>
        )}

        {filteredNodes.length > 0 && (
          <div className="grid gap-4 pr-2">
            {Object.entries(groupedNodes).map(([sectionName, sectionNodes]) => (
              <div key={sectionName}>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">{sectionName}</h4>

                <div className={sectionName === 'Triggers' ? 'w-full' : 'grid gap-2'}>
                  {sectionNodes.map((node) => {
                    const IconComponent = node.icon;
                    const getTooltipText = () => {
                      if ((node as any).tooltip) return (node as any).tooltip;
                      return "";
                    };

                    return (
                      <Button
                        key={node.type}
                        variant="outline"
                        className={`${sectionName === 'Triggers' ? 'justify-start w-full' : 'justify-start'} ${
                          node.disabled ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        onClick={() => onAdd(node.type)}
                        disabled={node.disabled}
                        title={getTooltipText()}
                      >
                        <IconComponent className={`h-4 w-4 mr-2 ${node.disabled ? 'text-muted-foreground' : node.color}`} />
                        <span className="flex items-center gap-2 flex-1">
                          {node.name}
                          {(node.type === 'whatsapp_flows' || node.type === 'whatsapp_interactive_buttons' || node.type === 'whatsapp_interactive_list' || node.type === 'whatsapp_cta_url' || node.type === 'whatsapp_location_request') && (
                            <span className="px-1.5 py-0.5 text-[8px] font-medium bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded border border-green-200 dark:border-green-900">
                              Official API
                            </span>
                          )}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FlowEditor() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [match, params] = useRoute('/flows/:id');
  const flowId = match ? parseInt(params.id) : null;
  const isEditMode = flowId !== null;

  const { toast } = useToast();
  const [, navigate] = useLocation();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useReactFlow();

  const initialNodes: Node[] = !isEditMode ? [
    {
      id: 'trigger-node',
      type: 'trigger',
      position: { x: 250, y: 50 },
      data: {
        label: 'Message Trigger',
        channelTypes: ['whatsapp_unofficial'],
        conditionType: 'any',
        conditionValue: '',
        enableSessionPersistence: true,
        sessionTimeout: 30,
        sessionTimeoutUnit: 'minutes'
      }
    }
  ] : [];

  const initialEdges: Edge[] = [];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAutoArranging, setIsAutoArranging] = useState(false);
  const [previousNodePositions, setPreviousNodePositions] = useState<Node[]>([]);
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);

  const { data: flowData, isLoading: isLoadingFlow } = useQuery({
    queryKey: ['/api/flows', flowId],
    queryFn: async () => {
      if (!flowId) return null;
      const res = await fetch(`/api/flows/${flowId}`);
      if (!res.ok) throw new Error('Failed to load flow');
      return res.json();
    },
    enabled: isEditMode
  });

  useEffect(() => {
    if (flowData) {
      setName(flowData.name);
      try {
        const parsedNodes = typeof flowData.nodes === 'string'
          ? JSON.parse(flowData.nodes)
          : flowData.nodes;

        const parsedEdges = typeof flowData.edges === 'string'
          ? JSON.parse(flowData.edges)
          : flowData.edges;

        setNodes(parsedNodes || []);
        setEdges(parsedEdges || []);
      } catch (error) {
        toast({
          title: t('flow_builder.error_loading_flow', 'Error loading flow'),
          description: t('flow_builder.could_not_parse_flow_data', 'Could not parse flow data'),
          variant: 'destructive'
        });
      }
    }
  }, [flowData, setNodes, setEdges, toast]);

  const createFlowMutation = useMutation({
    mutationFn: async (flowData: any) => {
      const response = await apiRequest('POST', '/api/flows', flowData);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/flows'] });
      navigate(`/flows/${data.id}`);
      toast({
        title: t('flow_builder.flow_created', 'Flow created'),
        description: t('flow_builder.flow_created_successfully', 'Your flow has been created successfully.')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('flow_builder.error_creating_flow', 'Error creating flow'),
        description: error.message || t('flow_builder.something_went_wrong', 'Something went wrong'),
        variant: 'destructive'
      });
    }
  });

  const updateFlowMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await apiRequest('PATCH', `/api/flows/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/flows', flowId] });
      toast({
        title: t('flow_builder.flow_updated', 'Flow updated'),
        description: t('flow_builder.flow_updated_successfully', 'Your flow has been updated successfully.')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('flow_builder.error_updating_flow', 'Error updating flow'),
        description: error.message || t('flow_builder.something_went_wrong', 'Something went wrong'),
        variant: 'destructive'
      });
    }
  });

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({
        ...connection,
        animated: true,
        type: 'smoothstep'
      }, eds));
    },
    [setEdges]
  );

  const onDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((node) => node.id !== nodeId));

      setEdges((eds) => eds.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId
      ));

      toast({
        title: t('flow_builder.node_deleted', 'Node deleted'),
        description: t('flow_builder.node_connections_removed', 'Node and its connections have been removed.')
      });
    },
    [setNodes, setEdges, toast]
  );

  const onDuplicateNode = useCallback(
    (nodeId: string) => {
      const nodeToDuplicate = nodes.find((node) => node.id === nodeId);
      if (!nodeToDuplicate) return;

      const newNodeId = `node_${nanoid()}`;

      const duplicateNode: Node = {
        ...nodeToDuplicate,
        id: newNodeId,
        position: {
          x: nodeToDuplicate.position.x + 30,
          y: nodeToDuplicate.position.y + 30
        },
        selected: true // Ensure the new node is selected
      };


      setNodes((nds) => [
        ...nds.map(node => ({ ...node, selected: false })), // Deselect all existing nodes
        duplicateNode // Add the new selected duplicate node
      ]);


      setTimeout(() => {
        if (reactFlowInstance) {

          reactFlowInstance.setNodes((nds) =>
            nds.map(node => ({
              ...node,
              selected: node.id === newNodeId
            }))
          );
        }
      }, 10); // Small delay to ensure DOM updates

      toast({
        title: t('flow_builder.node_duplicated', 'Node duplicated'),
        description: t('flow_builder.node_copy_created', 'A copy of the node has been created.')
      });
    },
    [nodes, setNodes, toast, t, reactFlowInstance]
  );

  const onAddNode = useCallback(
    (type: string) => {
      if (!reactFlowWrapper.current) return;

      const triggerNode = nodes.find(node => node.type === 'trigger');
      const triggerNodeId = triggerNode?.id || '';
      const hasExistingConnection = edges.some(edge => edge.source === triggerNodeId);

      const newNodeId = `node_${nanoid()}`;

      let nodeData: any = { label: `${type.charAt(0).toUpperCase() + type.slice(1)} Node` };

      switch (type) {
        case 'message':
          nodeData = { ...nodeData, message: 'Hello! How can I help you?' };
          break;
        case 'quickreply':
          nodeData = {
            ...nodeData,
            message: 'Please select an option to continue:',
            options: [
              { text: 'I have a question about my order.', value: 'order' },
              { text: 'I have a question about a product.', value: 'product' },
              { text: 'I have another question.', value: 'other' }
            ],
            invalidResponseMessage: "I didn't understand your selection. Please choose one of the available options:",
            enableGoBack: false,
            goBackText: '← Go Back',
            goBackValue: 'go_back'
          };
          break;
        case 'whatsapp_interactive_buttons':
          nodeData = {
            ...nodeData,
            headerText: '',
            bodyText: 'Please select an option:',
            footerText: '',
            buttons: [
              { id: '1', title: 'Option 1', payload: 'option_1' },
              { id: '2', title: 'Option 2', payload: 'option_2' }
            ]
          };
          break;
        case 'whatsapp_interactive_list':
          nodeData = {
            ...nodeData,
            headerText: '',
            bodyText: 'Please select an option:',
            footerText: '',
            buttonText: 'View Options',
            sections: [
              {
                id: '1',
                title: 'Options',
                rows: [
                  { id: '1', title: 'Option 1', description: '', payload: 'option_1' },
                  { id: '2', title: 'Option 2', description: '', payload: 'option_2' }
                ]
              }
            ]
          };
          break;
        case 'whatsapp_poll':
          nodeData = {
            ...nodeData,
            question: 'Please vote:',
            message: 'Please vote:',
            options: [
              { text: 'Option 1', value: 'option1' },
              { text: 'Option 2', value: 'option2' }
            ],
            invalidResponseMessage: 'I did not understand your selection. Please choose one of the available options.',
            enableGoBack: false,
            goBackText: '← Go Back',
            goBackValue: 'go_back'
          };
          break;
        case 'condition':
          nodeData = { ...nodeData, condition: "Contains('help')" };
          break;
        case 'action':
          nodeData = { ...nodeData, action: 'Create ticket' };
          break;
        case 'image':
          nodeData = { ...nodeData, mediaUrl: '', caption: t('flow_builder.default_image_caption', 'Check out this image!') };
          break;
        case 'video':
          nodeData = { ...nodeData, mediaUrl: '', caption: t('flow_builder.default_video_caption', 'Watch this video!') };
          break;
        case 'audio':
          nodeData = { ...nodeData, mediaUrl: '', caption: t('flow_builder.default_audio_caption', 'Listen to this audio!') };
          break;
        case 'document':
          nodeData = { ...nodeData, mediaUrl: '', fileName: 'document.pdf', caption: t('flow_builder.default_document_caption_full', 'Here is the document you requested.') };
          break;
        case 'wait':
          nodeData = { ...nodeData, timeValue: 5, timeUnit: 'minutes' };
          break;

        case 'ai_assistant':
          nodeData = {
            ...nodeData,
            provider: 'openai',
            model: 'gpt-4o',
            apiKey: '',
            prompt: 'You are a helpful assistant. Answer user questions concisely and accurately.\n\nWhen users request calendar-related tasks, you can:\n- Book appointments and meetings\n- Check availability for scheduling\n- Update or modify appointments\n- Cancel appointments when needed\n\nFor appointment booking:\n1. First check availability\n2. Collect necessary details (title, date, time, attendees,email, location)\n3. Confirm all details with the user before booking\n4. Provide confirmation with event details\n\nAlways be professional and ensure you have all required information before making calendar changes. Also make sure to ask the user about their email if they wish to know the previous appointments. So that we can fetch the previous appointments from the  calendar. Also make sure to not share any sensitive information with the user like appointemnts made by other users etc. Only give info to the user if they are the owner of the event.\n\n Note: Always check available slots before responding when a user requests an appointment. For example, if the user asks to book 10 AM on a specific date, verify availability first, then reply based on the result.',
            enableHistory: true,
            enableAudio: false,
            enableTaskExecution: false,
            tasks: [],
            enableGoogleCalendar: false,
            calendarBusinessHours: { start: '09:00', end: '17:00' },
            calendarDefaultDuration: 60,

            calendarTimeZone: getBrowserTimezone(),
            calendarFunctions: [],
            onDeleteNode: onDeleteNode,
            onDuplicateNode: onDuplicateNode
          };
          break;
        case 'update_pipeline_stage':
          nodeData = {
            ...nodeData,
            stageId: null,
            dealIdVariable: "{{contact.id}}",
            type: "update_pipeline_stage"
          };
          break;
        case 'webhook':
          nodeData = {
            ...nodeData,
            url: '',
            method: 'POST',
            headers: [],
            body: '{"message": "{{message.content}}", "contact": "{{contact.name}}"}',
            authType: 'none',
            authToken: '',
            authUsername: '',
            authPassword: '',
            authApiKey: '',
            authApiKeyHeader: 'X-API-Key',
            timeout: 30,
            followRedirects: true,
            onDeleteNode: onDeleteNode,
            onDuplicateNode: onDuplicateNode
          };
          break;
        case 'http_request':
          nodeData = {
            ...nodeData,
            url: '',
            method: 'GET',
            headers: [{ key: 'Accept', value: 'application/json' }],
            body: '',
            authType: 'none',
            authToken: '',
            authUsername: '',
            authPassword: '',
            authApiKey: '',
            authApiKeyHeader: 'X-API-Key',
            timeout: 30,
            followRedirects: true,
            responseType: 'auto',
            retryCount: 0,
            retryDelay: 1000,
            variableMappings: [],
            onDeleteNode: onDeleteNode,
            onDuplicateNode: onDuplicateNode
          };
          break;
        
        case 'whatsapp_flows':
          nodeData = {
            ...nodeData,
            flowName: '',
            flowId: '',
            screens: [{
              id: 'WELCOME_SCREEN',
              title: 'Welcome',
              terminal: true,
              layout: {
                type: 'SingleColumnLayout',
                children: [{
                  type: 'TextHeading',
                  text: 'Welcome to our Flow!'
                }]
              }
            }],
            flowJSON: {
              version: '7.2',
              screens: [{
                id: 'WELCOME_SCREEN',
                title: 'Welcome',
                terminal: true,
                layout: {
                  type: 'SingleColumnLayout',
                  children: [{
                    type: 'TextHeading',
                    text: 'Welcome to our Flow!'
                  }]
                }
              }]
            },
            onDeleteNode: onDeleteNode,
            onDuplicateNode: onDuplicateNode
          };
          break;
        case 'n8n':
          nodeData = {
            ...nodeData,
            instanceUrl: '',
            apiKey: '',
            webhookUrl: '',
            workflowId: '',
            workflowName: '',
            operation: 'webhook_trigger',
            config: {},
            variableMappings: [],
            timeout: 30,
            onDeleteNode: onDeleteNode,
            onDuplicateNode: onDuplicateNode
          };
          break;
        case 'bot_disable':
          nodeData = {
            ...nodeData,
            disableDuration: '30',
            customDuration: 60,
            customDurationUnit: 'minutes',
            triggerMethod: 'always',
            keyword: 'agent',
            caseSensitive: false,
            assignToAgent: 'auto',
            notifyAgent: true,
            handoffMessage: 'A customer is requesting human assistance.'
          };
          break;
        case 'translation':
          nodeData = {
            ...nodeData,
            enabled: true,
            apiKey: '',
            targetLanguage: 'en',
            translationMode: 'separate',
            detectLanguage: true,
            onDeleteNode: onDeleteNode,
            onDuplicateNode: onDuplicateNode
          };
          break;
        case 'bot_reset':
          nodeData = {
            ...nodeData,
            resetScope: 'bot_only',
            confirmationMessage: 'Bot assistance has been re-enabled. How can I help you?',
            sendConfirmation: true,
            clearVariables: false,
            resetFlowPosition: false,
            notifyAgent: true,
            autoReassign: false
          };
          break;
        case 'data_capture':
          nodeData = {
            ...nodeData,
            captureRules: [],
            storageScope: 'session',
            overwriteExisting: false,
            enableValidation: true
          };
          break;
      }

      const newNode: Node = {
        id: newNodeId,
        type,
        position: {
          x: triggerNode ? triggerNode.position.x : 250,
          y: triggerNode ? triggerNode.position.y + 150 : 150
        },
        data: nodeData
      };

      setNodes((nds) => nds.concat(newNode));

      if (triggerNode && !hasExistingConnection && type !== 'trigger') {
        const newEdge: Edge = {
          id: `edge-${triggerNodeId}-${newNodeId}`,
          source: triggerNodeId,
          target: newNodeId,
          animated: true,
          type: 'smoothstep'
        };

        setEdges((eds) => eds.concat(newEdge));
      }

      setTimeout(() => {
        try {
          reactFlowInstance.fitView({
            nodes: [{ id: newNodeId }],
            duration: 800,
            padding: 0.3,
            maxZoom: 1.2,
            minZoom: 0.5
          });
        } catch (error) {
          
        }
      }, 100);
    },
    [nodes, edges, setNodes, setEdges, reactFlowInstance]
  );

  const autoArrangeNodes = useCallback(() => {
    if (nodes.length === 0) return;


    setPreviousNodePositions([...nodes]);
    setIsAutoArranging(true);

    try {

      const { nodes: layoutedNodes, edges: layoutedEdges, stats } = autoArrangeFlow(
        nodes,
        edges,
        {
          direction: 'TB', // Top-to-bottom for chatbot flows
          preserveUserPositions: false
        }
      );


      setNodes(layoutedNodes);




      setTimeout(() => {
        if (reactFlowInstance) {
          reactFlowInstance.fitView({
            padding: 0.1,
            includeHiddenNodes: false,
            minZoom: 0.5,
            maxZoom: 1.5,
            duration: 800
          });
        }
      }, 100);


      toast({
        title: t('flow_builder.main.nodes_auto_arranged', 'Nodes Auto-Arranged'),
        description: t('flow_builder.main.nodes_arranged_desc', '{{count}} nodes organized across {{levels}} levels with proper spacing. No overlaps guaranteed!', {
          count: stats.nodeCount,
          levels: stats.levels
        }),
      });

    } catch (error) {
      console.error('Auto-arrange failed:', error);


      toast({
        title: t('flow_builder.main.auto_arrange_error', 'Auto-Arrange Failed'),
        description: t('flow_builder.main.auto_arrange_error_desc', 'Failed to arrange nodes. Please try again or arrange manually.'),
        variant: 'destructive'
      });
    } finally {

      setTimeout(() => {
        setIsAutoArranging(false);
      }, 500);
    }
  }, [nodes, edges, setNodes, reactFlowInstance, toast, t]);

  const handleApplyAIFlow = useCallback((suggestion: any) => {
    try {

      setNodes([]);
      setEdges([]);


      const newNodes = suggestion.nodes.map((node: any) => ({
        ...node,
        id: node.id || `node-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        position: node.position || { x: 0, y: 0 },
        data: {
          ...node.data,
          label: node.label || node.data?.label || 'Untitled Node'
        }
      }));


      const newEdges = suggestion.edges.map((edge: any) => ({
        ...edge,
        id: edge.id || `edge-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        animated: true,
        type: edge.type || 'smoothstep'
      }));


      setTimeout(() => {
        setNodes(newNodes);
        setEdges(newEdges);


        if (reactFlowInstance) {
          setTimeout(() => {
            reactFlowInstance.fitView({ padding: 0.1 });
          }, 100);
        }
      }, 100);

      toast({
        title: "AI Flow Applied",
        description: `Successfully applied "${suggestion.title}" with ${newNodes.length} nodes.`,
      });

    } catch (error) {
      console.error('Error applying AI flow:', error);
      toast({
        title: "Error",
        description: "Failed to apply AI-generated flow. Please try again.",
        variant: "destructive",
      });
    }
  }, [setNodes, setEdges, reactFlowInstance, toast]);

  const undoAutoArrange = useCallback(() => {
    if (previousNodePositions.length > 0) {
      setNodes(previousNodePositions);
      setPreviousNodePositions([]);
      toast({
        title: t('flow_builder.main.auto_arrange_undone', 'Auto-Arrange Undone'),
        description: t('flow_builder.main.nodes_restored', 'Nodes have been restored to their previous positions.'),
      });
    }
  }, [previousNodePositions, setNodes, toast]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: t('flow_builder.name_required', 'Name required'),
        description: t('flow_builder.provide_flow_name', 'Please provide a name for your flow'),
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      const flowToSave = {
        name,
        nodes: JSON.stringify(nodes),
        edges: JSON.stringify(edges),

        status: (isEditMode && flowData?.status) ? flowData.status : 'draft'
      };

      if (isEditMode && flowId) {
        await updateFlowMutation.mutateAsync({ id: flowId, data: flowToSave });
      } else {
        await createFlowMutation.mutateAsync(flowToSave);
      }
    } finally {
      setLoading(false);
    }
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };

    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'A') {
        event.preventDefault();
        if (!isAutoArranging && nodes.length > 0) {
          autoArrangeNodes();
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && previousNodePositions.length > 0) {
        event.preventDefault();
        undoAutoArrange();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [autoArrangeNodes, undoAutoArrange, isAutoArranging, nodes.length, previousNodePositions.length]);

  if (isEditMode && isLoadingFlow) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flow-builder h-full flex flex-col">
      <div className="flow-header p-4 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-4 items-start sm:items-center">
          <Input
            placeholder={t('flow_builder.main.flow_name', 'Flow name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full sm:w-64"
          />
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={loading}
              className="flex-1 sm:flex-none btn-brand-primary"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {t('common.save', 'Save')}
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={autoArrangeNodes}
                    disabled={isAutoArranging || nodes.length === 0}
                    className="flex-1 sm:flex-none"
                  >
                    {isAutoArranging ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <LayoutGrid className="h-4 w-4 mr-2" />
                    )}
                    {isAutoArranging ? t('flow_builder.main.arranging', 'Arranging...') : t('flow_builder.main.auto_arrange', 'Auto-Arrange')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('flow_builder.main.auto_arrange_tooltip', 'Automatically organize all nodes in a clean hierarchical layout')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t('flow_builder.main.auto_arrange_shortcut', 'Shortcut: Ctrl+Shift+A')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {previousNodePositions.length > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      onClick={undoAutoArrange}
                      disabled={isAutoArranging}
                      className="flex-1 sm:flex-none"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      {t('flow_builder.main.undo_arrange', 'Undo')}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('flow_builder.main.undo_arrange_tooltip', 'Restore nodes to their previous positions')}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('flow_builder.main.undo_arrange_shortcut', 'Shortcut: Ctrl+Z')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() => setIsAIAssistantOpen(true)}
                    className="flex-1 sm:flex-none"
                  >
                    <Bot className="h-4 w-4 mr-2" />
                    {t('flow_builder.main.ai_assistant', 'AI Assistant')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('flow_builder.main.ai_assistant_tooltip', 'Get AI-powered suggestions for your flow')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Link href="/flows" className="flex-1 sm:flex-none">
              <Button variant="outline" className="w-full">{t('common.cancel', 'Cancel')}</Button>
            </Link>
            <Button
              variant="outline"
              size="icon"
              className="md:hidden"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <ArrowRightCircle /> : <MessageSquare />}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex relative min-h-0">
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-10 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div className={`flow-sidebar border-r bg-background shadow-lg md:shadow-none z-20 transition-all duration-300 ease-in-out ${
          sidebarOpen
            ? 'absolute md:relative h-full w-full sm:w-80 md:w-auto md:min-w-[280px] md:max-w-[320px] lg:min-w-[300px] lg:max-w-[350px]'
            : 'hidden md:flex md:min-w-[280px] md:max-w-[320px] lg:min-w-[300px] lg:max-w-[350px]'
        }`}>
          <div className="flex justify-between items-center p-4 border-b md:hidden">
            <h3 className="font-medium">{t('flow_builder.main.node_selection', 'Node Selection')}</h3>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSidebarOpen(false)}
            >
              <ArrowRightCircle />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <SidebarContent
              nodes={nodes}
              flowId={flowId || undefined}
              onAdd={(type) => {
                onAddNode(type);
                if (window.innerWidth < 768) {
                  setSidebarOpen(false);
                }
              }}
            />
          </div>
        </div>

        <div
          className={`flow-container flex-1 relative ${
            sidebarOpen ? 'hidden md:flex' : 'flex'
          }`}
          ref={reactFlowWrapper}
          style={{ minHeight: '90vh' }}
        >
          <FlowProvider onDeleteNode={onDeleteNode} onDuplicateNode={onDuplicateNode}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={{
          animated: true,
          type: 'smoothstep',
          style: { stroke: 'hsl(var(--muted-foreground))' }
              }}
            >
              <Background />
              <Controls />
              <MiniMap
                nodeColor={() => 'hsl(var(--primary))'}
                maskColor={theme === 'dark' ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.6)'}
                style={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))'
                }}
                className="react-flow__minimap"
              />
              <Panel position="top-right" className="bg-background p-2 rounded-md shadow-sm border border-border">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-xs flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${
              isEditMode ? (
                flowData?.status === 'active' ? 'bg-primary' : 'bg-muted-foreground'
              ) : 'bg-primary'
            }`} />
            {isEditMode ? (
              flowData?.status === 'active' ? t('flow_builder.active', 'Active') : t('flow_builder.draft', 'Draft')
            ) : t('flow_builder.creating_new_flow', 'Creating New Flow')}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('flow_builder.current_flow_status', 'Current flow status')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
              </Panel>
            </ReactFlow>
          </FlowProvider>
        </div>

        {/* AI Flow Assistant */}
        <AIFlowAssistant
          flowId={flowId || undefined}
          onApplyFlow={handleApplyAIFlow}
          onAddNode={onAddNode}
          isOpen={isAIAssistantOpen}
          onClose={() => setIsAIAssistantOpen(false)}
        />
      </div>
    </div>
  );
}

function FlowProvider({ children, onDeleteNode, onDuplicateNode }: {
  children: React.ReactNode;
  onDeleteNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
}) {
  return (
    <FlowContext.Provider value={{ onDeleteNode, onDuplicateNode }}>
      {children}
    </FlowContext.Provider>
  );
}

export function useFlowContext() {
  const context = useContext(FlowContext);
  if (!context) {
    throw new Error('useFlowContext must be used within a FlowProvider');
  }
  return context;
}

export default function FlowBuilderPage() {
  return (
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  );
}