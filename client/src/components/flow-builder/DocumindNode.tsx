import { useState, useCallback, useEffect } from 'react';
import { Handle, Position } from 'reactflow';
import { useReactFlow } from 'reactflow';
import { Trash2, RefreshCw, Eye, EyeOff, CheckCircle, AlertCircle, ExternalLink, FileText, Upload, Folder } from 'lucide-react';
import { useFlowContext } from '../../pages/flow-builder';
import { useTranslation } from '@/hooks/use-translation';

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

interface DocumindNodeProps {
  id: string;
  data: {
    label: string;
    apiKey?: string;
    selectedFolder?: string;
    folders?: Array<{id: string, name: string}>;
    files?: Array<{id: string, name: string}>;
    operation?: string;
    systemPrompt?: string;
    enableHistory?: boolean;
    historyLimit?: number;
    connectionStatus?: 'idle' | 'testing' | 'success' | 'error';
    connectionMessage?: string;
    onDeleteNode?: (id: string) => void;
    onDuplicateNode?: (id: string) => void;
  };
  isConnectable: boolean;
}



export function DocumindNode({ id, data, isConnectable }: DocumindNodeProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [apiKey, setApiKey] = useState(data.apiKey || '');
  const [selectedFolder, setSelectedFolder] = useState(data.selectedFolder || '');
  const [folders, setFolders] = useState<Array<{id: string, name: string}>>(data.folders || []);
  const [files, setFiles] = useState<Array<{id: string, name: string}>>(data.files || []);
  const [operation, setOperation] = useState(data.operation || 'ask_question');

  const DOCUMIND_OPERATIONS = [
    {
      id: 'ask_question',
      name: t('flow_builder.documind_ask_question', 'Ask Question'),
      description: t('flow_builder.documind_ask_question_description', 'Ask a question about documents in the selected folder')
    },
    {
      id: 'analyze_documents',
      name: t('flow_builder.documind_analyze_documents', 'Analyze Documents'),
      description: t('flow_builder.documind_analyze_documents_description', 'Analyze all documents in the folder and provide insights')
    },
    {
      id: 'search_content',
      name: t('flow_builder.documind_search_content', 'Search Content'),
      description: t('flow_builder.documind_search_content_description', 'Search for specific content across documents')
    }
  ];
  const [systemPrompt, setSystemPrompt] = useState(data.systemPrompt || '');


  const [enableHistory, setEnableHistory] = useState(data.enableHistory !== undefined ? data.enableHistory : false);
  const [historyLimit, setHistoryLimit] = useState(data.historyLimit || 5);


  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>(data.connectionStatus || 'idle');
  const [connectionMessage, setConnectionMessage] = useState(data.connectionMessage || '');
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);


  const [configurationProgress, setConfigurationProgress] = useState(0);
  const selectedOperation = operation;

  const { setNodes } = useReactFlow();
  const { onDeleteNode } = useFlowContext();


  useEffect(() => {
    if (data.apiKey !== undefined) setApiKey(data.apiKey);
    if (data.selectedFolder !== undefined) setSelectedFolder(data.selectedFolder);
    if (data.folders !== undefined) setFolders(data.folders);
    if (data.files !== undefined) setFiles(data.files);
    if (data.operation !== undefined) setOperation(data.operation);
    if (data.systemPrompt !== undefined) setSystemPrompt(data.systemPrompt);
    if (data.enableHistory !== undefined) setEnableHistory(data.enableHistory);
    if (data.historyLimit !== undefined) setHistoryLimit(data.historyLimit);
  }, [data]);


  useEffect(() => {
    let progress = 0;

    if (apiKey.trim()) progress += 50; // 50%
    if (selectedFolder) progress += 50; // 50%

    setConfigurationProgress(progress);
  }, [apiKey, selectedFolder]);

  const updateNodeData = useCallback((updates: any) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                ...updates
              }
            }
          : node
      )
    );
  }, [id, setNodes]);


  const testConnection = useCallback(async () => {
    if (!apiKey.trim()) {
      setConnectionStatus('error');
      setConnectionMessage('Please enter an API key');
      return;
    }

    setIsTestingConnection(true);
    setConnectionStatus('testing');
    setConnectionMessage('Testing connection...');

    try {
      const formData = new FormData();
      formData.append('secretkey', apiKey);



      const response = await fetch('https://documind.onrender.com/api-get-folders', {
        method: 'POST',
        body: formData
      });



      if (response.ok) {
        const data = await response.json();


        if (data.status === 200) {

          const folders = (data.data || []).map((folder: any) => ({
            id: folder.folder_id,
            name: folder.folder_name
          }));
          setFolders(folders);
          setConnectionStatus('success');
          setConnectionMessage(`Connection successful! ${folders.length} folder(s) loaded.`);
        } else {
          setConnectionStatus('error');
          setConnectionMessage(data.message || `API Error: Status ${data.status}. Please check your API key.`);
        }
      } else {
        const errorText = await response.text();
        console.error('Documind API error:', response.status, errorText);
        setConnectionStatus('error');
        setConnectionMessage(`API Error (${response.status}): ${response.statusText}. Please check your API key.`);
      }
    } catch (error) {
      console.error('Documind connection error:', error);
      setConnectionStatus('error');
      setConnectionMessage(`Connection failed: ${error instanceof Error ? error.message : 'Network error'}. Please try again.`);
    } finally {
      setIsTestingConnection(false);
    }
  }, [apiKey]);

  const createFolder = useCallback(async (folderName: string) => {
    if (!apiKey.trim() || !folderName.trim()) return;

    try {
      const formData = new FormData();
      formData.append('secretkey', apiKey);
      formData.append('folder_name', folderName);

      const response = await fetch('https://documind.onrender.com/api-create-folder', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {

        await testConnection();
      }
    } catch (error) {
      console.error('Error creating folder:', error);
    }
  }, [apiKey, testConnection]);

  const loadFiles = useCallback(async (folderId: string) => {
    if (!apiKey.trim() || !folderId) return;

    try {
      const formData = new FormData();
      formData.append('secretkey', apiKey);
      formData.append('folder_id', folderId);

      const response = await fetch('https://documind.onrender.com/api-get-documents', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();

        if (data.status === 200) {

          const files = (data.data?.list || []).map((file: any) => ({
            id: file.id,
            name: file.file_name
          }));
          setFiles(files);
        }
      }
    } catch (error) {
      console.error('Error loading files:', error);
    }
  }, [apiKey]);

  const uploadFile = useCallback(async (file: File, folderId: string) => {
    if (!apiKey.trim() || !folderId || !file) {

      return;
    }


    setIsUploadingFile(true);

    const formData = new FormData();
    formData.append('secretkey', apiKey);
    formData.append('folder_id', folderId);
    formData.append('file', file);

    try {
      const response = await fetch('https://documind.onrender.com/api-upload-file', {
        method: 'POST',
        body: formData
      });



      if (response.ok) {
        const result = await response.json();


        await loadFiles(folderId);
      } else {
        const errorText = await response.text();
        console.error('Upload failed:', response.status, errorText);
      }
    } catch (error) {
      console.error('Error uploading file:', error);
    } finally {
      setIsUploadingFile(false);
    }
  }, [apiKey, loadFiles]);

  const deleteFile = useCallback(async (fileId: string, folderId: string) => {
    if (!apiKey.trim() || !fileId) {

      return;
    }


    setDeletingFileId(fileId);

    const formData = new FormData();
    formData.append('secretkey', apiKey);
    formData.append('documentId', fileId);

    try {
      const response = await fetch('https://documind.onrender.com/api-delete-document', {
        method: 'POST',
        body: formData
      });



      if (response.ok) {
        const result = await response.json();


        await loadFiles(folderId);
      } else {
        const errorText = await response.text();
        console.error('Delete failed:', response.status, errorText);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
    } finally {
      setDeletingFileId(null);
    }
  }, [apiKey, loadFiles]);

  const deleteFolder = useCallback(async (folderId: string) => {
    if (!apiKey.trim() || !folderId) {

      return;
    }


    setDeletingFolderId(folderId);

    const formData = new FormData();
    formData.append('secretkey', apiKey);
    formData.append('folder_id', folderId);

    try {
      const response = await fetch('https://documind.onrender.com/api-delete-folder', {
        method: 'POST',
        body: formData
      });



      if (response.ok) {
        const result = await response.json();


        if (selectedFolder === folderId) {
          setSelectedFolder('');
          setFiles([]);
        }

        await testConnection();
      } else {
        const errorText = await response.text();
        console.error('Delete folder failed:', response.status, errorText);
      }
    } catch (error) {
      console.error('Error deleting folder:', error);
    } finally {
      setDeletingFolderId(null);
    }
  }, [apiKey, selectedFolder, testConnection]);


  useEffect(() => {
    updateNodeData({
      apiKey,
      selectedFolder,
      folders,
      files,
      operation,
      systemPrompt,
      enableHistory,
      historyLimit,
      connectionStatus,
      connectionMessage
    });
  }, [updateNodeData, apiKey, selectedFolder, folders, files, operation, systemPrompt, enableHistory, historyLimit, connectionStatus, connectionMessage]);


  useEffect(() => {
    if (apiKey.trim() && connectionStatus === 'idle' && !connectionMessage) {
      testConnection();
    }
  }, [apiKey, connectionStatus, connectionMessage, testConnection]);

  const handleDelete = () => {
    if (onDeleteNode) {
      onDeleteNode(id);
    }
  };



  return (
    <div className="node-documind p-3 rounded-lg bg-card border border-border shadow-sm min-w-[380px] max-w-[480px] group">
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
                alt="Documind PDF Chat" 
                className="h-4 w-4"
              />
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{t('flow_builder.documind_node_title', 'Documind PDF Chat Integration')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span>Documind Integration</span>

        {/* Configuration Progress Badge */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant={configurationProgress >= 70 ? "default" : "secondary"}
                className={cn(
                  "text-[10px] px-1.5 py-0.5",
                  configurationProgress >= 70 ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground"
                )}
              >
                {configurationProgress}% configured
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">Configuration completeness: {configurationProgress}%</p>
              <p className="text-xs text-muted-foreground">
                {configurationProgress < 70 ? "Complete required fields to reach 70%" : "Configuration ready!"}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {isEditing ? t('common.hide', 'Hide') : t('common.edit', 'Edit')}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{isEditing ? 'Hide configuration panel' : 'Show configuration panel'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="text-sm p-2 bg-card rounded border border-border">
        <div className="flex items-center gap-1 mb-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <span className="text-lg">📄</span>
                  <span className="font-medium text-primary">
                    {DOCUMIND_OPERATIONS.find(op => op.id === selectedOperation)?.name || selectedOperation}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs font-medium">{DOCUMIND_OPERATIONS.find(op => op.id === selectedOperation)?.name}</p>
                <p className="text-xs text-muted-foreground">{DOCUMIND_OPERATIONS.find(op => op.id === selectedOperation)?.description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <span className="text-muted-foreground">•</span>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  {connectionStatus === 'success' && selectedFolder ? (
                    <CheckCircle className="h-3 w-3 text-primary" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span className="text-xs text-muted-foreground">
                    {connectionStatus === 'success' && selectedFolder ? 'Ready' : 'Setup Required'}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">
                  {connectionStatus === 'success' && selectedFolder
                    ? 'Documind is configured and ready to use'
                    : 'Complete API key and folder configuration'}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {selectedFolder && files.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {files.length} document{files.length !== 1 ? 's' : ''} in {folders.find(f => f.id === selectedFolder)?.name || 'folder'}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        {!isEditing ? (

          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="font-medium">Operation:</span>
                <span>{DOCUMIND_OPERATIONS.find(op => op.id === operation)?.name || 'Ask Question'}</span>
              </div>
              {selectedFolder && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-medium">Folder:</span>
                  <span>{folders.find(f => f.id === selectedFolder)?.name || selectedFolder}</span>
                </div>
              )}
              {files.length > 0 && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-medium">Files:</span>
                  <span>{files.length} document{files.length !== 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className={`w-2 h-2 rounded-full ${
                connectionStatus === 'success' ? 'bg-primary' :
                connectionStatus === 'error' ? 'bg-destructive' : 'bg-muted-foreground'
              }`} />
              <span className="text-muted-foreground">
                {connectionStatus === 'success' ? 'Connected' :
                 connectionStatus === 'error' ? 'Connection Error' : 'Not Connected'}
              </span>
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
                  onClick={testConnection}
                  disabled={isTestingConnection || !apiKey.trim()}
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
                placeholder="Enter your Documind API key"
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
                onClick={() => window.open('https://www.documind.chat/chat-with-pdf-api-docs.html', '_blank')}
                className="h-6 px-2 text-xs text-primary hover:text-primary/80"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Get API Key
              </Button>
            </div>

            {connectionStatus === 'success' && (
              <>
                {/* Folder Selection */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Folder</Label>
                  <div className="flex gap-2">
                    <Select
                      value={selectedFolder}
                      onValueChange={(value) => {
                        setSelectedFolder(value);
                        if (value) {
                          loadFiles(value);
                        }
                      }}
                    >
                      <SelectTrigger className="text-xs h-7 flex-1">
                        <SelectValue placeholder="Choose a folder" />
                      </SelectTrigger>
                      <SelectContent>
                        {folders.map((folder) => (
                          <SelectItem key={folder.id} value={folder.id} className="text-xs">
                            {folder.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedFolder && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={deletingFolderId === selectedFolder}
                              onClick={() => {
                                if (deletingFolderId === selectedFolder) return;
                                const folder = folders.find(f => f.id === selectedFolder);
                                if (folder && window.confirm(`Are you sure you want to delete the folder "${folder.name}"? This will also delete all files in it.`)) {
                                  deleteFolder(selectedFolder);
                                }
                              }}
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive/80"
                            >
                              {deletingFolderId === selectedFolder ? (
                                <RefreshCw className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delete folder</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const folderName = window.prompt('Enter folder name:');
                      if (folderName) {
                        createFolder(folderName);
                      }
                    }}
                    className="h-6 px-2 text-xs w-full"
                  >
                    <Folder className="h-3 w-3 mr-1" />
                    Create Folder
                  </Button>
                  {folders.length > 0 && (
                    <p className="text-[10px] text-muted-foreground text-center">
                      {folders.length} folder{folders.length !== 1 ? 's' : ''} available
                    </p>
                  )}
                </div>

                {/* Files Section */}
                {selectedFolder && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Files</Label>
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
                            uploadFile(file, selectedFolder);
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
                      {isUploadingFile ? 'Uploading...' : 'Upload PDF'}
                    </Button>
                    {files.length > 0 && (
                      <TooltipProvider>
                        <div className="space-y-1">
                          {files.slice(0, 3).map((file) => (
                            <div key={file.id} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-1 rounded group">
                              <FileText className="h-3 w-3" />
                              <span className="truncate flex-1">{file.name}</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={deletingFileId === file.id}
                                    onClick={() => {
                                      if (deletingFileId === file.id) return;
                                      if (window.confirm(`Are you sure you want to delete "${file.name}"?`)) {
                                        deleteFile(file.id, selectedFolder);
                                      }
                                    }}
                                    className="h-4 w-4 p-0 text-destructive hover:text-destructive/80 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    {deletingFileId === file.id ? (
                                      <RefreshCw className="h-2 w-2 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-2 w-2" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">Delete file</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          ))}
                          {files.length > 3 && (
                            <div className="text-xs text-muted-foreground">
                              +{files.length - 3} more files
                            </div>
                          )}
                        </div>
                      </TooltipProvider>
                    )}
                  </div>
                )}

                {/* Operation Selection */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Operation</Label>
                  <Select value={operation} onValueChange={setOperation}>
                    <SelectTrigger className="text-xs h-7">
                      <SelectValue placeholder="Select operation" />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMIND_OPERATIONS.map((op) => (
                        <SelectItem key={op.id} value={op.id} className="text-xs">
                          <div>
                            <div className="font-medium">{op.name}</div>
                            <div className="text-[10px] text-muted-foreground">{op.description}</div>

                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* System Prompt Configuration */}
                <div className="space-y-2 mt-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">System Prompt</Label>
                    <span className={`text-[10px] ${systemPrompt.length > 500 ? 'text-destructive' : 'text-muted-foreground'}`}>{systemPrompt.length}/500</span>
                  </div>
                  <Textarea
                    value={systemPrompt}
                    onChange={(e) => {
                      const value = e.target.value.length > 500 ? e.target.value.slice(0, 500) : e.target.value;
                      setSystemPrompt(value);
                    }}
                    placeholder="Enter system instructions to guide the AI's response (e.g., 'Answer in a professional tone', 'Provide bullet points', 'Focus on technical details')"
                    className="text-xs min-h-[80px]"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Supports variables like {'{{contact.name}}'}, {'{{message.content}}'}. These will be replaced at runtime.
                  </p>
                </div>

                {/* Conversation History Configuration */}
                <div className="border border-border rounded-lg p-3 bg-primary/10 mt-3">
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    {t('flow_builder.documind_conversation_history', 'Conversation History')}
                  </h3>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="enable-history"
                          checked={enableHistory}
                          onCheckedChange={setEnableHistory}
                          className="data-[state=checked]:bg-primary"
                        />
                        <Label htmlFor="enable-history" className="text-xs font-medium cursor-pointer">
                          {t('flow_builder.documind_enable_history', 'Include conversation history')}
                        </Label>
                      </div>
                    </div>

                    {enableHistory && (
                      <div className="pl-4 border-l-2 border-primary/20">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] font-medium text-foreground">
                            {t('flow_builder.documind_history_limit', 'Message Limit')}
                          </Label>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 w-6 p-0 text-xs"
                              onClick={() => setHistoryLimit(Math.max(1, historyLimit - 1))}
                              disabled={historyLimit <= 1}
                            >-</Button>
                            <span className="text-xs w-6 text-center font-medium">{historyLimit}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 w-6 p-0 text-xs"
                              onClick={() => setHistoryLimit(Math.min(20, historyLimit + 1))}
                              disabled={historyLimit >= 20}
                            >+</Button>
                          </div>
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-1">
                          {t('flow_builder.documind_history_help', 'Previous messages to include for context')}
                        </p>
                      </div>
                    )}
                  </div>
                </div>





              </>
            )}
          </div>
        )}
      </div>


    </div>
  );
}
