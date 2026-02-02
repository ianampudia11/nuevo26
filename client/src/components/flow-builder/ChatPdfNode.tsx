import { useState, useCallback, useEffect } from 'react';
import { Handle, Position } from 'reactflow';
import { useReactFlow } from 'reactflow';
import { Trash2, RefreshCw, CheckCircle, AlertCircle, ExternalLink, FileText, Upload } from 'lucide-react';
import { useFlowContext } from '../../pages/flow-builder';
import { useTranslation } from '@/hooks/use-translation';

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";

interface ChatPdfNodeProps {
  id: string;
  data: {
    label: string;
    apiKey?: string;
    selectedDocument?: string;
    documents?: Array<{id: string, name: string, size: number, uploadedAt: string}>;
    operation?: string;
    gptModel?: string;
    enableOcr?: boolean;
    connectionStatus?: 'idle' | 'testing' | 'success' | 'error';
    connectionMessage?: string;
    onDeleteNode?: (id: string) => void;
    onDuplicateNode?: (id: string) => void;
  };
  isConnectable: boolean;
}



export function ChatPdfNode({ id, data, isConnectable }: ChatPdfNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [apiKey, setApiKey] = useState(data.apiKey || '');
  const [selectedDocument, setSelectedDocument] = useState(data.selectedDocument || '');
  const [documents, setDocuments] = useState<Array<{id: string, name: string, size: number, uploadedAt: string}>>(data.documents || []);
  const [operation, setOperation] = useState(data.operation || 'ask_question');

  const CHAT_PDF_OPERATIONS = [
    {
      id: 'ask_question',
      name: t('flow_builder.chatpdf_ask_question', 'Ask Question'),
      description: t('flow_builder.chatpdf_ask_question_description', 'Ask a question about the selected PDF document')
    },
    {
      id: 'summarize',
      name: t('flow_builder.chatpdf_summarize', 'Summarize'),
      description: t('flow_builder.chatpdf_summarize_description', 'Get a comprehensive summary of the PDF document')
    },
    {
      id: 'analyze_content',
      name: t('flow_builder.chatpdf_analyze_content', 'Analyze Content'),
      description: t('flow_builder.chatpdf_analyze_content_description', 'Analyze and extract insights from the PDF content')
    }
  ];

  const GPT_MODELS = [
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      description: t('flow_builder.chatpdf_gpt4o_description', 'Latest GPT-4 model (2 credits per message)'),
      credits: 2
    },
    {
      id: 'gpt-4-turbo',
      name: 'GPT-4 Turbo',
      description: t('flow_builder.chatpdf_gpt4_turbo_description', 'GPT-4 Turbo model (4 credits per message)'),
      credits: 4
    }
  ];
  const [gptModel, setGptModel] = useState(data.gptModel || 'gpt-4o');
  const [enableOcr, setEnableOcr] = useState(data.enableOcr || false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>(data.connectionStatus || 'idle');
  const [connectionMessage, setConnectionMessage] = useState(data.connectionMessage || '');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [configurationProgress, setConfigurationProgress] = useState(0);

  const { setNodes } = useReactFlow();
  const { onDeleteNode } = useFlowContext();


  useEffect(() => {
    if (data.apiKey !== undefined) setApiKey(data.apiKey);
    if (data.selectedDocument !== undefined) setSelectedDocument(data.selectedDocument);
    if (data.documents !== undefined) setDocuments(data.documents);
    if (data.operation !== undefined) setOperation(data.operation);
    if (data.gptModel !== undefined) setGptModel(data.gptModel);
    if (data.enableOcr !== undefined) setEnableOcr(data.enableOcr);
  }, [data]);


  useEffect(() => {
    let progress = 0;

    if (apiKey.trim()) progress += 50; // 50%
    if (selectedDocument) progress += 50; // 50%

    setConfigurationProgress(progress);
  }, [apiKey, selectedDocument]);

  const updateNodeData = useCallback((updates: any) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                ...updates,
              },
            }
          : node
      )
    );
  }, [id, setNodes]);

  const testConnection = useCallback(async () => {
    if (!apiKey.trim()) {
      setConnectionStatus('error');
      setConnectionMessage('API key is required');
      return;
    }

    setIsTestingConnection(true);
    setConnectionStatus('testing');
    setConnectionMessage('Testing connection...');

    try {


      const response = await fetch('/api/chat-pdf/documents', {
        method: 'GET',
        headers: {
          'X-Chat-PDF-API-Key': apiKey
        }
      });



      if (response.ok) {
        const data = await response.json();

        
        if (data.data && Array.isArray(data.data)) {

          const docs = data.data.map((doc: any) => ({
            id: doc.id,
            name: doc.name,
            size: doc.size,
            uploadedAt: doc.uploadedAt
          }));
          setDocuments(docs);
          setConnectionStatus('success');
          setConnectionMessage(`Connected successfully. Found ${docs.length} document${docs.length !== 1 ? 's' : ''}.`);
          
          updateNodeData({
            apiKey,
            documents: docs,
            connectionStatus: 'success',
            connectionMessage: `Connected successfully. Found ${docs.length} document${docs.length !== 1 ? 's' : ''}.`
          });
        } else {
          setConnectionStatus('success');
          setConnectionMessage('Connected successfully. No documents found.');
          setDocuments([]);
          
          updateNodeData({
            apiKey,
            documents: [],
            connectionStatus: 'success',
            connectionMessage: 'Connected successfully. No documents found.'
          });
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
        setConnectionStatus('error');
        setConnectionMessage(errorMessage);
        
        updateNodeData({
          apiKey,
          connectionStatus: 'error',
          connectionMessage: errorMessage
        });
      }
    } catch (error) {
      console.error('Error testing Chat PDF connection:', error);
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      setConnectionStatus('error');
      setConnectionMessage(errorMessage);
      
      updateNodeData({
        apiKey,
        connectionStatus: 'error',
        connectionMessage: errorMessage
      });
    } finally {
      setIsTestingConnection(false);
    }
  }, [apiKey, updateNodeData]);

  const uploadFile = useCallback(async (file: File) => {
    if (!apiKey.trim()) {
      setConnectionMessage('API key is required for file upload');
      return;
    }

    if (file.size > 4.5 * 1024 * 1024) {
      setConnectionMessage('File size must be less than 4.5MB for direct upload');
      return;
    }

    setIsUploadingFile(true);
    setConnectionMessage('Uploading file...');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('isPrivate', 'false');
      if (enableOcr) {
        formData.append('ocr', 'true');
      }

      const response = await fetch('/api/chat-pdf/upload', {
        method: 'POST',
        headers: {
          'X-Chat-PDF-API-Key': apiKey
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();

        
        if (data.docId) {

          await testConnection();
          setConnectionMessage('File uploaded successfully!');
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || 'Upload failed';
        setConnectionMessage(errorMessage);
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      setConnectionMessage('Upload failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsUploadingFile(false);
    }
  }, [apiKey, enableOcr, testConnection]);

  const deleteDocument = useCallback(async (docId: string) => {
    if (!apiKey.trim() || !docId) {

      return;
    }


    setDeletingDocumentId(docId);

    try {
      const response = await fetch(`/api/chat-pdf/documents/${docId}`, {
        method: 'DELETE',
        headers: {
          'X-Chat-PDF-API-Key': apiKey
        }
      });



      if (response.ok) {
        const result = await response.json();



        if (selectedDocument === docId) {
          setSelectedDocument('');
        }


        await testConnection();
        setConnectionMessage('Document deleted successfully!');
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || 'Delete failed';
        console.error('Delete failed:', response.status, errorMessage);
        setConnectionMessage(errorMessage);
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      setConnectionMessage('Delete failed. Please try again.');
    } finally {
      setDeletingDocumentId(null);
    }
  }, [apiKey, selectedDocument, testConnection]);

  const handleSave = useCallback(() => {
    updateNodeData({
      apiKey,
      selectedDocument,
      documents,
      operation,
      gptModel,
      enableOcr,
      connectionStatus,
      connectionMessage
    });
    setIsEditing(false);
  }, [apiKey, selectedDocument, documents, operation, gptModel, enableOcr, connectionStatus, connectionMessage, updateNodeData]);

  const handleDelete = useCallback(() => {
    if (onDeleteNode) {
      onDeleteNode(id);
    }
  }, [id, onDeleteNode]);

  const selectedOperation = CHAT_PDF_OPERATIONS.find(op => op.id === operation) || CHAT_PDF_OPERATIONS[0];
  const selectedModel = GPT_MODELS.find(model => model.id === gptModel) || GPT_MODELS[0];

  return (
    <div className="node-chat-pdf p-3 rounded-lg bg-card border border-border shadow-sm min-w-[380px] max-w-[480px] group">
      <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={handleDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">Delete node</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="w-3 h-3 bg-primary border-2 border-background"
      />

      <div className="font-medium flex items-center gap-2 mb-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <img 
                src="https://cdn-icons-png.flaticon.com/128/136/136522.png" 
                alt="Chat PDF AI" 
                className="h-4 w-4"
              />
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">Chat PDF AI Integration</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span>Chat PDF Integration</span>
        <button
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? 'Done' : 'Edit'}
        </button>
      </div>

      {/* Configuration Progress */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Configuration</span>
          <span>{configurationProgress}%</span>
        </div>
        <div className="w-full  rounded-full h-1.5">
          <div
            className="bg-primary h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${configurationProgress}%` }}
          />
        </div>
      </div>

      {/* Status Badge */}
      <div className="text-sm p-2 bg-card rounded border border-border">
        <div className="flex items-center gap-1 mb-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <span className="text-lg">🤖</span>
                  <span className="font-medium text-primary">
                    {CHAT_PDF_OPERATIONS.find(op => op.id === selectedOperation.id)?.name || selectedOperation.name}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs font-medium">{CHAT_PDF_OPERATIONS.find(op => op.id === selectedOperation.id)?.name}</p>
                <p className="text-xs text-muted-foreground">{CHAT_PDF_OPERATIONS.find(op => op.id === selectedOperation.id)?.description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <span className="text-muted-foreground">•</span>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  {connectionStatus === 'success' && selectedDocument ? (
                    <CheckCircle className="h-3 w-3 text-primary" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span className="text-xs text-muted-foreground">
                    {connectionStatus === 'success' && selectedDocument ? 'Ready' : 'Setup Required'}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">
                  {connectionStatus === 'success' && selectedDocument
                    ? 'Chat PDF is configured and ready to use'
                    : 'Complete API key and document configuration'}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        {!isEditing ? (

          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="font-medium">Operation:</span>
                <span>{CHAT_PDF_OPERATIONS.find(op => op.id === operation)?.name || 'Ask Question'}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-medium">Model:</span>
                <span>{selectedModel.name} ({selectedModel.credits} credits)</span>
              </div>
              {selectedDocument && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-medium">Document:</span>
                  <span>{documents.find(d => d.id === selectedDocument)?.name || selectedDocument}</span>
                </div>
              )}
              {documents.length > 0 && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-medium">Available:</span>
                  <span>{documents.length} document{documents.length !== 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
          </div>
        ) : (

          <div className="space-y-4">
            {/* API Key Configuration */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">API Key</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isTestingConnection || !apiKey.trim()}
                  onClick={testConnection}
                  className="h-6 px-2 text-xs"
                >
                  {isTestingConnection ? (
                    <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <CheckCircle className="h-3 w-3 mr-1" />
                  )}
                  Test Connection
                </Button>
              </div>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your Chat PDF API key"
                className="text-xs h-7"
              />
              {connectionMessage && (
                <div className={`text-xs flex items-center gap-1 ${
                  connectionStatus === 'success' ? 'text-primary' :
                  connectionStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'
                }`}>
                  {connectionStatus === 'success' && <CheckCircle className="h-3 w-3" />}
                  {connectionStatus === 'error' && <AlertCircle className="h-3 w-3" />}
                  {connectionMessage}
                </div>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => window.open('https://pdf.ai/developer', '_blank')}
                className="h-6 px-2 text-xs text-primary hover:text-primary/80"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Get API Key
              </Button>
            </div>

            {connectionStatus === 'success' && (
              <>
                {/* Document Selection */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Document</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isTestingConnection}
                            onClick={testConnection}
                            className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                          >
                            <RefreshCw className={cn("h-3 w-3", isTestingConnection && "animate-spin")} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="text-xs">Refresh document list</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="flex gap-2">
                    <Select
                      value={selectedDocument}
                      onValueChange={(value) => {
                        setSelectedDocument(value);
                      }}
                    >
                      <SelectTrigger className="text-xs h-7 flex-1">
                        <SelectValue placeholder="Choose a document" />
                      </SelectTrigger>
                      <SelectContent>
                        {documents.map((doc) => (
                          <SelectItem key={doc.id} value={doc.id} className="text-xs">
                            <div className="flex flex-col">
                              <span>{doc.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {(doc.size / 1024 / 1024).toFixed(2)} MB • {new Date(doc.uploadedAt).toLocaleDateString()}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* File Upload Section */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Upload New Document</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isUploadingFile}
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.pdf';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) {
                          uploadFile(file);
                        }
                      };
                      input.click();
                    }}
                    className="h-6 px-2 text-xs w-full"
                  >
                    {isUploadingFile ? (
                      <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Upload className="h-3 w-3 mr-1" />
                    )}
                    Upload PDF (Max 4.5MB)
                  </Button>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="enableOcr"
                      checked={enableOcr}
                      onChange={(e) => setEnableOcr(e.target.checked)}
                      className="h-3 w-3"
                    />
                    <Label htmlFor="enableOcr" className="text-xs">
                      Enable OCR for scanned documents
                    </Label>
                  </div>

                  {/* Document List with Delete Options */}
                  {documents.length > 0 && (
                    <TooltipProvider>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">Available Documents</Label>
                        {documents.slice(0, 3).map((doc) => (
                          <div key={doc.id} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-1 rounded group">
                            <FileText className="h-3 w-3" />
                            <div className="flex-1 min-w-0">
                              <div className="truncate">{doc.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {(doc.size / 1024 / 1024).toFixed(2)} MB • {new Date(doc.uploadedAt).toLocaleDateString()}
                              </div>
                            </div>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={deletingDocumentId === doc.id}
                                  onClick={() => {
                                    if (deletingDocumentId === doc.id) return;
                                    if (window.confirm(`Are you sure you want to delete "${doc.name}"? This will also delete all chat history for this document.`)) {
                                      deleteDocument(doc.id);
                                    }
                                  }}
                                  className="h-4 w-4 p-0 text-destructive hover:text-destructive/80 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  {deletingDocumentId === doc.id ? (
                                    <RefreshCw className="h-2 w-2 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-2 w-2" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">Delete document</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        ))}
                        {documents.length > 3 && (
                          <div className="text-xs text-muted-foreground">
                            +{documents.length - 3} more documents
                          </div>
                        )}
                      </div>
                    </TooltipProvider>
                  )}
                </div>

                {/* Operation Selection */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Operation</Label>
                  <Select
                    value={operation}
                    onValueChange={(value) => setOperation(value)}
                  >
                    <SelectTrigger className="text-xs h-7">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHAT_PDF_OPERATIONS.map((op) => (
                        <SelectItem key={op.id} value={op.id} className="text-xs">
                          <div className="flex flex-col">
                            <span>{op.name}</span>
                            <span className="text-xs text-muted-foreground">{op.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* GPT Model Selection */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">AI Model</Label>
                  <Select
                    value={gptModel}
                    onValueChange={(value) => setGptModel(value)}
                  >
                    <SelectTrigger className="text-xs h-7">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GPT_MODELS.map((model) => (
                        <SelectItem key={model.id} value={model.id} className="text-xs">
                          <div className="flex flex-col">
                            <span>{model.name}</span>
                            <span className="text-xs text-muted-foreground">{model.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
