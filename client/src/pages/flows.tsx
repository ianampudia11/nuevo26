import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Copy, 
  Activity, 
  Calendar, 
  FileCode, 
  Search, 
  Filter, 
  X, 
  SortAsc, 
  SortDesc, 
  CheckCircle, 
  Loader2, 
  Download, 
  Upload,
  ChevronDown, 
  ArrowUpDown,
  Check,
  Clock,
  Archive,
  Play,
  Pause,
  MessageSquare,
  Zap,
  AlertTriangle
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { format } from 'date-fns';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';


function FlowCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2">
              <div className="h-6 bg-muted rounded w-48 animate-pulse"></div>
              <div className="h-6 bg-muted rounded w-16 animate-pulse"></div>
            </div>
            <div className="h-4 bg-muted rounded w-32 animate-pulse"></div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <div className="h-8 bg-muted rounded w-16 animate-pulse"></div>
            <div className="h-8 bg-muted rounded w-20 animate-pulse"></div>
            <div className="h-8 bg-muted rounded w-20 animate-pulse"></div>
            <div className="h-8 bg-muted rounded w-16 animate-pulse"></div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="h-3 bg-muted rounded w-12 animate-pulse"></div>
            <div className="h-4 bg-muted rounded w-16 animate-pulse"></div>
          </div>
          <div className="space-y-1">
            <div className="h-3 bg-muted rounded w-16 animate-pulse"></div>
            <div className="h-4 bg-muted rounded w-24 animate-pulse"></div>
          </div>
          <div className="space-y-1">
            <div className="h-3 bg-muted rounded w-14 animate-pulse"></div>
            <div className="h-4 bg-muted rounded w-12 animate-pulse"></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FlowAssignmentsDialog({ flowId, flowName }: { flowId: number, flowName: string }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const { data: flow, isLoading: isLoadingFlow } = useQuery({
    queryKey: ['/api/flows', flowId],
    queryFn: async () => {
      const res = await fetch(`/api/flows/${flowId}`);
      if (!res.ok) throw new Error('Failed to load flow');
      return res.json();
    },
    enabled: open
  });

  const { data: channels, isLoading: isLoadingChannels } = useQuery({
    queryKey: ['/api/channel-connections'],
    queryFn: async () => {
      const res = await fetch('/api/channel-connections');
      if (!res.ok) throw new Error('Failed to load channels');
      return res.json();
    },
    enabled: open
  });

  const { data: assignments, isLoading: isLoadingAssignments } = useQuery({
    queryKey: ['/api/flow-assignments', { flowId }],
    queryFn: async () => {
      const res = await fetch(`/api/flow-assignments?flowId=${flowId}`);
      if (!res.ok) throw new Error('Failed to load assignments');
      return res.json();
    },
    enabled: open
  });

  const createAssignmentMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/flow-assignments', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/flow-assignments'] });
      toast({
        title: t('flows.flow_assigned', 'Flow assigned'),
        description: t('flows.flow_assigned_success', 'Flow has been assigned to channel successfully.')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('flows.error_assigning_flow', 'Error assigning flow'),
        description: error.message || t('common.something_went_wrong', 'Something went wrong'),
        variant: 'destructive'
      });
    }
  });

  const updateAssignmentStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const response = await apiRequest('PATCH', `/api/flow-assignments/${id}/status`, { isActive });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/flow-assignments'] });
      toast({
        title: t('flows.assignment_updated', 'Assignment updated'),
        description: t('flows.assignment_updated_success', 'Flow assignment status has been updated.')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('flows.error_updating_assignment', 'Error updating assignment'),
        description: error.message || t('common.something_went_wrong', 'Something went wrong'),
        variant: 'destructive'
      });
    }
  });

  const getChannelName = (channelId: number) => {
    const channel = channels?.find((c: any) => c.id === channelId);
    return channel ? `${channel.accountName} (${channel.channelType})` : 'Unknown channel';
  };

  const handleAssignToChannel = async (channelId: number) => {
    try {
      await createAssignmentMutation.mutateAsync({
        flowId,
        channelId,
        isActive: false
      });
    } catch (error) {
      console.error('Error assigning flow:', error);
    }
  };

  const handleUpdateStatus = async (assignmentId: number, isActive: boolean) => {

    if (isActive && flow && flow.status !== 'active') {
      toast({
        title: t('flows.cannot_activate_assignment', 'Cannot activate assignment'),
        description: t('flows.flow_must_be_active', 'The flow must be in Active status to activate channel assignments.'),
        variant: 'destructive'
      });
      return;
    }
    
    try {
      await updateAssignmentStatusMutation.mutateAsync({
        id: assignmentId,
        isActive
      });
    } catch (error) {
      console.error('Error updating assignment status:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Calendar className="h-4 w-4 mr-2" />
          {t('flows.assign', 'Assign')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('flows.manage_flow_assignments', 'Manage Flow Assignments')}</DialogTitle>
          <DialogDescription>
            {t('flows.assign_flow_description', 'Assign "{{flowName}}" to channels and manage active assignments.', { flowName })}
          </DialogDescription>
          
          {/* Flow Status Warning */}
          {flow && flow.status === 'draft' && (
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-800">
                  {t('flows.draft_status_notice', 'Flow is in Draft Status')}
                </span>
              </div>
              <p className="text-xs text-yellow-700 mt-1">
                {t('flows.draft_status_explanation', 'Channel assignments are automatically deactivated when a flow is in draft status. Set the flow to Active to enable assignments.')}
              </p>
            </div>
          )}
        </DialogHeader>

        {(isLoadingChannels || isLoadingAssignments || isLoadingFlow) ? (
          <div className="flex justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            <div>
              <h3 className="text-sm font-medium mb-2">{t('flows.active_assignments', 'Active Assignments')}</h3>
              {assignments && assignments.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('flows.channel', 'Channel')}</TableHead>
                      <TableHead>{t('flows.status', 'Status')}</TableHead>
                      <TableHead>{t('flows.actions', 'Actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map((assignment: any) => (
                      <TableRow key={assignment.id}>
                        <TableCell>{getChannelName(assignment.channelId)}</TableCell>
                        <TableCell>
                          <Badge variant={assignment.isActive ? "default" : "outline"}>
                            {assignment.isActive ? t('flows.active', 'Active') : t('flows.inactive', 'Inactive')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUpdateStatus(assignment.id, !assignment.isActive)}
                            disabled={!assignment.isActive && flow && flow.status !== 'active'}
                            className={`${!assignment.isActive && flow && flow.status !== 'active' ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {assignment.isActive ? t('flows.deactivate', 'Deactivate') : t('flows.activate', 'Activate')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">{t('flows.no_assignments_yet', 'No assignments yet')}</p>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium mb-2">{t('flows.available_channels', 'Available Channels')}</h3>
              {channels && channels.length > 0 ? (
                <div className="grid gap-2">
                  {channels
                    .filter((channel: any) =>
                      !assignments || !assignments.some((a: any) => a.channelId === channel.id)
                    )
                    .map((channel: any) => (
                      <div
                        key={channel.id}
                        className="flex justify-between items-center p-2 border rounded-md"
                      >
                        <div className="text-sm">
                          {channel.accountName} <span className="text-xs text-muted-foreground">({channel.channelType})</span>
                        </div>
                        <Button
                          variant="brand"
                          size="sm"
                          onClick={() => handleAssignToChannel(channel.id)}
                        >
                          {t('flows.assign', 'Assign')}
                        </Button>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('flows.no_channels_available', 'No channels available')}</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="brand">{t('common.close', 'Close')}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteFlowDialog({ flowId, flowName, onDeleted }: { flowId: number, flowName: string, onDeleted: () => void }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteFlowMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/flows/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/flows'] });
      toast({
        title: t('flows.flow_deleted', 'Flow deleted'),
        description: t('flows.flow_deleted_success', 'Flow has been deleted successfully.')
      });
      onDeleted();
    },
    onError: (error: any) => {
      toast({
        title: t('flows.error_deleting_flow', 'Error deleting flow'),
        description: error.message || t('common.something_went_wrong', 'Something went wrong'),
        variant: 'destructive'
      });
    }
  });

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteFlowMutation.mutateAsync(flowId);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="bg-destructive text-destructive-foreground">
          <Trash2 className="h-4 w-4 mr-2" />
          {t('common.delete', 'Delete')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('flows.delete_flow', 'Delete Flow')}</DialogTitle>
          <DialogDescription>
            {t('flows.delete_flow_confirmation', 'Are you sure you want to delete "{{flowName}}"? This action cannot be undone.', { flowName })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:gap-0">
          <DialogClose asChild>
            <Button variant="brand">{t('common.cancel', 'Cancel')}</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('common.delete', 'Delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



function PaginationWrapper({ 
  currentPage, 
  totalPages, 
  onPageChange, 
  totalItems, 
  itemsPerPage 
}: { 
  currentPage: number; 
  totalPages: number; 
  onPageChange: (page: number) => void; 
  totalItems: number; 
  itemsPerPage: number; 
}) {
  const { t } = useTranslation();
  
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      
      if (currentPage <= 3) {
        pages.push(2, 3, 4, '...', totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push('...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push('...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }
    
    return pages;
  };

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 w-full">
      <div className="text-sm text-muted-foreground">
        {t('common.showing', 'Showing')} {startItem} {t('common.to', 'to')} {endItem} {t('common.of', 'of')} {totalItems} {t('flows.results', 'results')}
      </div>
      
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious 
              href="#"
              onClick={(e) => {
                e.preventDefault();
                if (currentPage > 1) onPageChange(currentPage - 1);
              }}
              className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''}
            />
          </PaginationItem>
          
          {getPageNumbers().map((page, index) => (
            <PaginationItem key={index}>
              {page === '...' ? (
                <PaginationEllipsis />
              ) : (
                <PaginationLink
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (typeof page === 'number') onPageChange(page);
                  }}
                  isActive={page === currentPage}
                >
                  {page}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}
          
          <PaginationItem>
            <PaginationNext 
              href="#"
              onClick={(e) => {
                e.preventDefault();
                if (currentPage < totalPages) onPageChange(currentPage + 1);
              }}
              className={currentPage === totalPages ? 'pointer-events-none opacity-50' : ''}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}



function FlowImportDialog({ 
  open, 
  onOpenChange 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);

  const importMutation = useMutation({
    mutationFn: async (importData: any) => {
      const importPromises = importData.flows.map((flow: any) => 
        apiRequest('POST', '/api/flows', {
          name: flow.name,
          description: flow.description,
          nodes: flow.nodes,
          edges: flow.edges,
          status: 'draft' // Import as draft by default
        })
      );
      return await Promise.all(importPromises);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/flows'] });
      toast({
        title: t('flows.import_success', 'Flows imported successfully'),
        description: t('flows.import_success_description', '{{count}} flows have been imported as drafts.', {
          count: result.length
        })
      });
      onOpenChange(false);
      resetImportState();
    },
    onError: (error: any) => {
      toast({
        title: t('flows.import_failed', 'Import failed'),
        description: error.message || t('flows.import_error', 'Failed to import flows. Please check the file format.'),
        variant: 'destructive'
      });
    }
  });

  const resetImportState = () => {
    setSelectedFile(null);
    setImportPreview(null);
  };

  const validateImportFile = async (file: File) => {
    setIsValidating(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      

      if (!data.flows || !Array.isArray(data.flows)) {
        throw new Error(t('flows.invalid_format', 'Invalid file format. Expected flows array.'));
      }


      for (const flow of data.flows) {
        if (!flow.name || !flow.nodes || !flow.edges) {
          throw new Error(t('flows.invalid_flow_data', 'Invalid flow data. Each flow must have name, nodes, and edges.'));
        }
      }

      setImportPreview(data);
    } catch (error: any) {
      toast({
        title: t('flows.validation_failed', 'File validation failed'),
        description: error.message,
        variant: 'destructive'
      });
      setSelectedFile(null);
    } finally {
      setIsValidating(false);
    }
  };

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith('.json')) {
      toast({
        title: t('flows.invalid_file_type', 'Invalid file type'),
        description: t('flows.json_files_only', 'Please select a JSON file.'),
        variant: 'destructive'
      });
      return;
    }

    setSelectedFile(file);
    validateImportFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleImport = () => {
    if (importPreview) {
      importMutation.mutate(importPreview);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t('flows.import_flows', 'Import Flows')}</DialogTitle>
          <DialogDescription>
            {t('flows.import_description', 'Import flows from a JSON file. Flows will be imported as drafts and can be reviewed before activation.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Drop Zone */}
          <div
            className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
            }`}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
          >
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {isDragging 
                  ? t('flows.drop_file_here', 'Drop your file here')
                  : t('flows.drag_drop_or_click', 'Drag and drop your JSON file here')
                }
              </p>
              <p className="text-xs text-muted-foreground">
                {t('flows.or_click_to_browse', 'or click to browse files')}
              </p>
            </div>
            <input
              type="file"
              accept=".json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>

          {/* File Info */}
          {selectedFile && (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <FileCode className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
              {isValidating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : importPreview ? (
                <Check className="h-4 w-4 text-green-600 dark:text-green-500" />
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedFile(null);
                    setImportPreview(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}

          {/* Import Preview */}
          {importPreview && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium">{t('flows.import_preview', 'Import Preview')}</h4>
              <div className="border rounded-lg p-4 max-h-48 overflow-y-auto">
                <div className="text-sm space-y-2">
                  <p className="font-medium">
                    {t('flows.flows_to_import', 'Flows to import: {{count}}', { count: importPreview.flows.length })}
                  </p>
                  <div className="space-y-1">
                    {importPreview.flows.map((flow: any, index: number) => (
                      <div key={index} className="flex items-center gap-2 text-xs p-2 bg-muted/50 rounded">
                        <FileCode className="h-3 w-3" />
                        <span className="font-medium">{flow.name}</span>
                        {flow.description && (
                          <span className="text-muted-foreground">- {flow.description}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground p-3 bg-primary/10 dark:bg-primary/20 border border-primary/30 rounded">
                <p className="font-medium text-primary dark:text-primary/90 mb-1">
                  {t('flows.import_note', 'Import Note:')}
                </p>
                <p>
                  {t('flows.import_draft_note', 'All flows will be imported with "draft" status. You can review and activate them after import.')}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleImport}
            disabled={!importPreview || importMutation.isPending}
          >
            {importMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            {t('flows.import_flows_action', 'Import Flows')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function KeyboardShortcutsDialog({ 
  open, 
  onOpenChange 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
}) {
  const { t } = useTranslation();

  const shortcuts = [
    {
      category: t('flows.general_shortcuts', 'General'),
      items: [
        { keys: ['Ctrl', 'F'], description: t('flows.shortcut_search', 'Focus search input') },
        { keys: ['Ctrl', 'N'], description: t('flows.shortcut_new_flow', 'Create new flow') },
        { keys: ['Ctrl', 'I'], description: t('flows.shortcut_import', 'Open import dialog') },
        { keys: ['F1', '?'], description: t('flows.shortcut_help', 'Show keyboard shortcuts') },
      ]
    },
    {
      category: t('flows.selection_shortcuts', 'Selection Mode'),
      items: [
        { keys: ['Ctrl', 'A'], description: t('flows.shortcut_select_all', 'Select all visible flows') },
        { keys: ['Escape'], description: t('flows.shortcut_deselect', 'Deselect all / Exit selection mode') },
        { keys: ['Delete'], description: t('flows.shortcut_delete', 'Delete selected flows') },
        { keys: ['Ctrl', 'E'], description: t('flows.shortcut_export', 'Export selected flows') },
      ]
    }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            {t('flows.keyboard_shortcuts_title', 'Keyboard Shortcuts')}
          </DialogTitle>
          <DialogDescription>
            {t('flows.keyboard_shortcuts_description', 'Use these keyboard shortcuts to navigate and manage flows more efficiently.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {shortcuts.map((section, sectionIndex) => (
            <div key={sectionIndex}>
              <h3 className="font-medium text-sm text-muted-foreground mb-3">
                {section.category}
              </h3>
              <div className="space-y-2">
                {section.items.map((shortcut, itemIndex) => (
                  <div key={itemIndex} className="flex items-center justify-between py-2">
                    <span className="text-sm">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <div key={keyIndex} className="flex items-center gap-1">
                          <kbd className="px-2 py-1 text-xs font-semibold text-foreground bg-muted border border-border rounded-lg">
                            {key}
                          </kbd>
                          {keyIndex < shortcut.keys.length - 1 && (
                            <span className="text-xs text-muted-foreground">+</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            {t('common.close', 'Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Keys to strip from node.data on export so credentials never leave the app (lowercase for case-insensitive match) */
const EXPORT_SENSITIVE_KEYS = new Set([
  'apikey', 'api_key', 'apipassword', 'password', 'secret', 'authtoken', 'authheader',
  'pineconeapikey', 'elevenlabsapikey', 'elevenlabscustomvoiceid'
]);

function sanitizeNodeDataForExport(data: Record<string, unknown>): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (EXPORT_SENSITIVE_KEYS.has(key.toLowerCase())) continue;
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && (key === 'headers' || key === 'auth')) {
      out[key] = {}; // Redact nested auth/headers
      continue;
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = sanitizeNodeDataForExport(value as Record<string, unknown>);
      continue;
    }
    out[key] = value;
  }
  return out;
}

export default function FlowsPage() {
  const { toast } = useToast();
  const { t } = useTranslation();
  

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'updatedAt' | 'createdAt'>('updatedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');


  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(12);


  const [selectedFlows, setSelectedFlows] = useState<Set<number>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);


  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);


  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data: flows, isLoading } = useQuery({
    queryKey: ['/api/flows'],
    queryFn: async () => {
      const res = await fetch('/api/flows');
      if (!res.ok) throw new Error('Failed to load flows');
      return res.json();
    }
  });

  const { data: planInfo } = useQuery({
    queryKey: ['/api/user/plan-info'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/user/plan-info');
        if (!res.ok) return null;
        return res.json();
      } catch (error) {
        console.error('Error fetching plan info:', error);
        return null;
      }
    }
  });

  const duplicateFlowMutation = useMutation({
    mutationFn: async (flowId: number) => {
      const res = await fetch(`/api/flows/${flowId}/duplicate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to duplicate flow');
      }
      return res.json();
    },
    onSuccess: (duplicatedFlow) => {
      queryClient.invalidateQueries({ queryKey: ['/api/flows'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/plan-info'] });
      toast({
        title: t('flows.flow_duplicated', 'Flow duplicated'),
        description: t('flows.flow_duplicated_description', 'Flow "{{flowName}}" has been duplicated successfully.', {
          flowName: duplicatedFlow.name
        })
      });
    },
    onError: (error: any) => {
      toast({
        title: t('flows.duplicate_failed', 'Duplication failed'),
        description: error.message || t('flows.duplicate_error', 'Failed to duplicate flow. Please try again.'),
        variant: 'destructive'
      });
    }
  });

  const updateFlowStatusMutation = useMutation({
    mutationFn: async ({ flowId, status }: { flowId: number; status: string }) => {
      const response = await apiRequest('PATCH', `/api/flows/${flowId}`, { status });
      const updatedFlow = await response.json();
      

      if (status === 'draft') {
        try {

          const assignmentsResponse = await fetch(`/api/flow-assignments?flowId=${flowId}`);
          if (assignmentsResponse.ok) {
            const assignments = await assignmentsResponse.json();
            

            const deactivatePromises = assignments
              .filter((assignment: any) => assignment.isActive)
              .map((assignment: any) => 
                apiRequest('PATCH', `/api/flow-assignments/${assignment.id}/status`, { isActive: false })
              );
            
            await Promise.all(deactivatePromises);
          }
        } catch (error) {
          console.error('Error deactivating flow assignments:', error);

        }
      }
      
      return updatedFlow;
    },
    onSuccess: (updatedFlow) => {
      queryClient.invalidateQueries({ queryKey: ['/api/flows'] });
      queryClient.invalidateQueries({ queryKey: ['/api/flow-assignments'] });
      
      const statusMessage = updatedFlow.status === 'draft' 
        ? t('flows.status_updated_with_assignments', 'Flow status changed to {{status}} and all channel assignments have been deactivated.', {
            status: updatedFlow.status
          })
        : t('flows.status_updated_description', 'Flow status has been changed to {{status}}.', {
            status: updatedFlow.status
          });
      
      toast({
        title: t('flows.status_updated', 'Status updated'),
        description: statusMessage
      });
    },
    onError: (error: any) => {
      toast({
        title: t('flows.status_update_failed', 'Status update failed'),
        description: error.message || t('flows.status_update_error', 'Failed to update flow status. Please try again.'),
        variant: 'destructive'
      });
    }
  });

  const handleDuplicateFlow = (flowId: number) => {
    duplicateFlowMutation.mutate(flowId);
  };

  const handleStatusChange = (flowId: number, newStatus: string) => {
    updateFlowStatusMutation.mutate({ flowId, status: newStatus });
  };


  const filteredAndSortedFlows = useMemo(() => {
    if (!flows) return [];


    let filtered = flows.filter((flow: any) => {

      const searchMatch = debouncedSearchTerm === '' || 
        flow.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        (flow.description && flow.description.toLowerCase().includes(debouncedSearchTerm.toLowerCase()));
      

      const statusMatch = statusFilter === 'all' || flow.status === statusFilter;
      
      return searchMatch && statusMatch;
    });


    filtered.sort((a: any, b: any) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        case 'createdAt':
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          break;
        case 'updatedAt':
        default:
          aValue = new Date(a.updatedAt).getTime();
          bValue = new Date(b.updatedAt).getTime();
          break;
      }
      
      if (sortBy === 'name' || sortBy === 'status') {

        const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        return sortDirection === 'asc' ? comparison : -comparison;
      } else {

        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }
    });

    return filtered;
  }, [flows, debouncedSearchTerm, statusFilter, sortBy, sortDirection]);


  const totalPages = Math.ceil(filteredAndSortedFlows.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedFlows = filteredAndSortedFlows.slice(startIndex, endIndex);


  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, statusFilter, sortBy, sortDirection]);


  const availableStatuses = useMemo(() => {
    if (!flows) return [];
    const statusSet = new Set<string>();
    flows.forEach((flow: any) => statusSet.add(flow.status));
    const statuses = Array.from(statusSet);
    return statuses.sort();
  }, [flows]);


  const toggleSelectMode = () => {
    setIsSelectMode(!isSelectMode);
    if (isSelectMode) {
      setSelectedFlows(new Set());
    }
  };

  const toggleFlowSelection = (flowId: number) => {
    const newSelected = new Set(selectedFlows);
    if (newSelected.has(flowId)) {
      newSelected.delete(flowId);
    } else {
      newSelected.add(flowId);
    }
    setSelectedFlows(newSelected);
  };

  const selectAllVisible = () => {
    const visibleFlowIds = new Set<number>(filteredAndSortedFlows.map((flow: any) => flow.id as number));
    setSelectedFlows(visibleFlowIds);
  };

  const deselectAll = () => {
    setSelectedFlows(new Set());
  };

  const isAllVisibleSelected = useMemo(() => {
    if (filteredAndSortedFlows.length === 0) return false;
    return filteredAndSortedFlows.every((flow: any) => selectedFlows.has(flow.id));
  }, [filteredAndSortedFlows, selectedFlows]);

  const isSomeSelected = selectedFlows.size > 0;


  const bulkDeleteMutation = useMutation({
    mutationFn: async (flowIds: number[]) => {
      const deletePromises = flowIds.map(id => 
        apiRequest('DELETE', `/api/flows/${id}`)
      );
      await Promise.all(deletePromises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/flows'] });
      toast({
        title: t('flows.bulk_delete_success', 'Flows deleted'),
        description: t('flows.bulk_delete_description', '{{count}} flows have been deleted successfully.', {
          count: selectedFlows.size
        })
      });
      setSelectedFlows(new Set());
      setIsSelectMode(false);
    },
    onError: (error: any) => {
      toast({
        title: t('flows.bulk_delete_failed', 'Bulk delete failed'),
        description: error.message || t('flows.bulk_delete_error', 'Failed to delete some flows. Please try again.'),
        variant: 'destructive'
      });
    }
  });


  const bulkStatusChangeMutation = useMutation({
    mutationFn: async ({ flowIds, status }: { flowIds: number[]; status: string }) => {
      const updatePromises = flowIds.map(id => 
        apiRequest('PATCH', `/api/flows/${id}`, { status })
      );
      await Promise.all(updatePromises);
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/flows'] });
      toast({
        title: t('flows.bulk_status_success', 'Status updated'),
        description: t('flows.bulk_status_description', '{{count}} flows have been set to {{status}}.', {
          count: selectedFlows.size,
          status
        })
      });
      setSelectedFlows(new Set());
    },
    onError: (error: any) => {
      toast({
        title: t('flows.bulk_status_failed', 'Bulk status change failed'),
        description: error.message || t('flows.bulk_status_error', 'Failed to update some flows. Please try again.'),
        variant: 'destructive'
      });
    }
  });

  const handleBulkDelete = () => {
    if (selectedFlows.size === 0) return;
    bulkDeleteMutation.mutate(Array.from(selectedFlows));
  };

  const handleBulkStatusChange = (status: string) => {
    if (selectedFlows.size === 0) return;
    bulkStatusChangeMutation.mutate({ 
      flowIds: Array.from(selectedFlows), 
      status 
    });
  };


  const exportFlows = (flowIds: number[]) => {
    if (!flows) return;
    
    const flowsToExport = flows.filter((flow: any) => flowIds.includes(flow.id));
    const exportData = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      flows: flowsToExport.map((flow: any) => ({
        name: flow.name,
        description: flow.description,
        status: flow.status,
        nodes: (flow.nodes || []).map((node: any) => ({
          ...node,
          data: sanitizeNodeDataForExport(node.data || {})
        })),
        edges: flow.edges,
        version: flow.version,
        createdAt: flow.createdAt,
        updatedAt: flow.updatedAt
      }))
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `flows-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: t('flows.export_success', 'Flows exported'),
      description: t('flows.export_description', '{{count}} flows have been exported successfully.', {
        count: flowIds.length
      })
    });
  };

  const handleBulkExport = () => {
    if (selectedFlows.size === 0) return;
    exportFlows(Array.from(selectedFlows));
  };

  const handleExportAll = () => {
    if (!flows) return;
    exportFlows(flows.map((flow: any) => flow.id));
  };


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {

      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();

        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
        return;
      }

      if (!isSelectMode) {

        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
          e.preventDefault();

          if (planInfo && planInfo.remainingFlows > 0) {
            window.location.href = '/flows/new';
          }
        }
        return;
      }
      

      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        selectAllVisible();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (selectedFlows.size > 0) {
          deselectAll();
        } else {
          setIsSelectMode(false);
        }
      } else if (e.key === 'Delete' && selectedFlows.size > 0) {
        e.preventDefault();
        handleBulkDelete();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'e' && selectedFlows.size > 0) {
        e.preventDefault();
        handleBulkExport();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        setShowImportDialog(true);
      } else if (e.key === 'F1' || (e.key === '?' && !isSelectMode)) {
        e.preventDefault();
        setShowKeyboardHelp(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSelectMode, selectedFlows.size, filteredAndSortedFlows, planInfo]);


  const clearSearch = () => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
  };


  const clearAllFilters = () => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setStatusFilter('all');
  };


  const handleSort = (newSortBy: typeof sortBy) => {
    if (sortBy === newSortBy) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortDirection('asc');
    }
  };

  const sortedFlows = flows ? [...flows].sort((a, b) => {
    const dateA = new Date(a.updatedAt);
    const dateB = new Date(b.updatedAt);
    return sortDirection === 'desc' ? dateB.getTime() - dateA.getTime() : dateA.getTime() - dateB.getTime();
  }) : [];

  const toggleSortDirection = () => {
    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM d, yyyy h:mm a');
    } catch (error) {
      return 'Invalid date';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <Badge className="bg-green-600 dark:bg-green-500 hover:bg-green-700 dark:hover:bg-green-600 text-white flex items-center gap-1">
            <Play className="h-3 w-3" />
            {t('flows.active', 'Active')}
          </Badge>
        );
      case 'draft':
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {t('flows.draft', 'Draft')}
          </Badge>
        );
      default:
        return (
          <Badge variant="default" className="flex items-center gap-1">
            <Activity className="h-3 w-3" />
            {status}
          </Badge>
        );
    }
  };

  const StatusSelector = ({ flow }: { flow: any }) => {
    const statusOptions = [
      { value: 'active', label: t('flows.active', 'Active'), color: 'bg-green-600 dark:bg-green-500', icon: Play },
      { value: 'draft', label: t('flows.draft', 'Draft'), color: 'bg-yellow-600', icon: Clock }
    ];

    const handleStatusChange = (newStatus: string) => {
      if (newStatus === flow.status) return;
      updateFlowStatusMutation.mutate({ flowId: flow.id, status: newStatus });
    };

    return (
      <Select
        value={flow.status}
        onValueChange={handleStatusChange}
        disabled={updateFlowStatusMutation.isPending}
      >
        <SelectTrigger className="w-auto h-auto p-0 border-0 bg-transparent hover:bg-muted/50 rounded-md">
          <SelectValue asChild>
            <div className="flex items-center">
              {getStatusBadge(flow.status)}
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {statusOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex items-center gap-2">
                <option.icon className="h-3 w-3" />
                <div className={`w-2 h-2 rounded-full ${option.color}`} />
                {option.label}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden font-sans text-foreground">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main 
          className="flex-1 overflow-y-auto p-6" 
          role="main" 
          aria-label={t('flows.main_content', 'Flows management content')}
        >
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl">{t('nav.flow_builder', 'Flow Builder')}</h1>
                <p className="text-muted-foreground">
                  {t('flows.page_description', 'Create and manage automated conversation flows for your channels.')}
                </p>
                {planInfo && (
                  <div className="mt-1 text-sm flex items-center gap-2">
                    <div className="bg-muted px-2 py-1 rounded-md flex items-center">
                      <span className="text-muted-foreground">
                        <span className={planInfo.remainingFlows === 0 ? "text-destructive font-medium" : "font-medium"}>
                          {planInfo.currentFlowCount}
                        </span> / {planInfo.plan.maxFlows} {t('flows.flows', 'flows')}
                      </span>
                      {planInfo.remainingFlows === 0 && (
                        <span className="ml-2 text-destructive font-medium bg-destructive/10 px-2 py-0.5 rounded-full text-xs">
                          {t('flows.limit_reached', 'Limit reached')}
                        </span>
                      )}
                    </div>
                    {planInfo.remainingFlows === 0 && (
                      <span className="text-muted-foreground text-xs">
                        {t('flows.contact_admin_upgrade', 'Contact your administrator to upgrade your plan')}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Import Flows */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowImportDialog(true)}
                  className="border-dashed hover:border-solid transition-all"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {t('flows.import', 'Import')}
                </Button>

                {/* Export All Flows */}
                {flows && flows.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportAll}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {t('flows.export_all', 'Export All')}
                  </Button>
                )}

                {/* Bulk Operations Toggle */}
                {flows && flows.length > 0 && (
                  <Button
                    variant={isSelectMode ? "default" : "outline"}
                    size="sm"
                    onClick={toggleSelectMode}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {isSelectMode ? t('flows.exit_select', 'Exit Select') : t('flows.select', 'Select')}
                  </Button>
                )}
                
                {planInfo && planInfo.remainingFlows === 0 ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button disabled size="sm" className="opacity-50">
                          <Plus className="h-4 w-4 mr-2" />
                          {t('flows.new_flow', 'New Flow')}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('flows.plan_limit_tooltip', "You've reached your plan's flow limit")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <Link href="/flows/new">
                    <Button className="flex items-center gap-2" size="sm">
                      <Plus className="h-4 w-4" />
                      {t('flows.new_flow', 'New Flow')}
                    </Button>
                  </Link>
                )}
              </div>
            </div>

            {/* Bulk Operations Toolbar */}
            {isSelectMode && (
              <div className="sticky top-0 z-10 bg-background border border-border rounded-lg p-4 shadow-lg">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={isAllVisibleSelected}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            selectAllVisible();
                          } else {
                            deselectAll();
                          }
                        }}
                        className="h-5 w-5"
                      />
                      <span className="text-sm font-medium">
                        {selectedFlows.size === 0 
                          ? t('flows.select_flows', 'Select flows')
                          : t('flows.selected_count', '{{count}} selected', { count: selectedFlows.size })
                        }
                      </span>
                    </div>
                    
                    {selectedFlows.size > 0 && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={selectAllVisible}
                          disabled={isAllVisibleSelected}
                        >
                          {t('flows.select_all_visible', 'Select All ({{count}})', { count: filteredAndSortedFlows.length })}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={deselectAll}
                        >
                          {t('flows.deselect_all', 'Deselect All')}
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Bulk Actions */}
                  {selectedFlows.size > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Bulk Status Change */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={bulkStatusChangeMutation.isPending}
                          >
                            <Activity className="h-4 w-4 mr-2" />
                            {t('flows.change_status', 'Change Status')}
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuLabel>{t('flows.set_status_to', 'Set status to')}</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleBulkStatusChange('active')}>
                            <div className="flex items-center gap-2">
                              <Play className="h-3 w-3" />
                              <div className="w-2 h-2 rounded-full bg-green-600 dark:bg-green-500" />
                              {t('flows.active', 'Active')}
                            </div>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleBulkStatusChange('inactive')}>
                            <div className="flex items-center gap-2">
                              <Pause className="h-3 w-3" />
                              <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                              {t('flows.inactive', 'Inactive')}
                            </div>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleBulkStatusChange('draft')}>
                            <div className="flex items-center gap-2">
                              <Clock className="h-3 w-3" />
                              <div className="w-2 h-2 rounded-full bg-yellow-600" />
                              {t('flows.draft', 'Draft')}
                            </div>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => handleBulkStatusChange('archived')}
                            className="text-destructive focus:text-destructive"
                          >
                            <div className="flex items-center gap-2">
                              <Archive className="h-3 w-3" />
                              <div className="w-2 h-2 rounded-full bg-red-600" />
                              {t('flows.archived', 'Archived')}
                            </div>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Bulk Export */}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleBulkExport}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        {t('flows.export_selected', 'Export ({{count}})', { count: selectedFlows.size })}
                      </Button>

                      {/* Bulk Delete */}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleBulkDelete}
                        disabled={bulkDeleteMutation.isPending}
                      >
                        {bulkDeleteMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 mr-2" />
                        )}
                        {t('flows.delete_selected', 'Delete ({{count}})', { count: selectedFlows.size })}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Keyboard shortcuts hint */}
                {selectedFlows.size > 0 && (
                  <div className="mt-3 pt-3 border-t text-xs text-muted-foreground flex items-center justify-between">
                    <span>{t('flows.keyboard_shortcuts', 'Keyboard shortcuts: Ctrl+A (select all), Esc (deselect), Delete (remove selected), Ctrl+E (export selected)')}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowKeyboardHelp(true)}
                      className="text-xs h-6 px-2"
                    >
                      {t('flows.view_all_shortcuts', 'View all shortcuts')}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Search, Filter, and Sort Controls */}
            {flows && flows.length > 0 && (
              <section 
                className="space-y-4"
                aria-label={t('flows.search_filter_section', 'Search and filter controls')}
              >
                <div className="flex flex-col gap-4">
                  {/* Search */}
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <Input
                      placeholder={t('flows.search_flows', 'Search flows...')}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-10"
                      aria-label={t('flows.search_flows_label', 'Search flows by name or description')}
                      role="searchbox"
                      aria-describedby="search-help"
                    />
                    <div id="search-help" className="sr-only">
                      {t('flows.search_help', 'Type to search through flow names and descriptions. Press Ctrl+F to focus this field.')}
                    </div>
                    {searchTerm && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
                        onClick={clearSearch}
                        aria-label={t('flows.clear_search', 'Clear search')}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {/* Filter and Sort Controls */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Status Filter */}
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[140px]">
                        <Filter className="h-4 w-4 mr-2" />
                        <SelectValue placeholder={t('flows.filter_status', 'Filter by status')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('flows.all_statuses', 'All Statuses')}</SelectItem>
                        {availableStatuses.map((status) => (
                          <SelectItem key={status} value={status}>
                            {t(`flows.${status}`, status.charAt(0).toUpperCase() + status.slice(1))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Sort Controls */}
                    <Select value={sortBy} onValueChange={(value: any) => handleSort(value)}>
                      <SelectTrigger className="w-[120px]">
                        {sortDirection === 'asc' ? (
                          <SortAsc className="h-4 w-4 mr-2" />
                        ) : (
                          <SortDesc className="h-4 w-4 mr-2" />
                        )}
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name">{t('flows.sort_name', 'Name')}</SelectItem>
                        <SelectItem value="status">{t('flows.sort_status', 'Status')}</SelectItem>
                        <SelectItem value="updatedAt">{t('flows.sort_updated', 'Updated')}</SelectItem>
                        <SelectItem value="createdAt">{t('flows.sort_created', 'Created')}</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Clear Filters */}
                    {(searchTerm || statusFilter !== 'all') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearAllFilters}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4 mr-1" />
                        {t('flows.clear_filters', 'Clear')}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Results Summary */}
                {(debouncedSearchTerm || statusFilter !== 'all') && (
                  <div className="text-sm text-muted-foreground">
                    {t('flows.results_summary', 'Showing {{count}} of {{total}} flows', {
                      count: filteredAndSortedFlows.length,
                      total: flows.length
                    })}
                    {debouncedSearchTerm && (
                      <span> {t('flows.search_for', 'for "{{term}}"', { term: debouncedSearchTerm })}</span>
                    )}
                  </div>
                )}
              </section>
            )}

            {isLoading ? (
              <div className="grid gap-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <FlowCardSkeleton key={index} />
                ))}
              </div>
            ) : (
              <section 
                className="grid gap-4"
                aria-label={t('flows.flows_list', 'List of flows')}
                role="region"
                aria-live="polite"
                aria-busy={isLoading}
              >
                {flows && flows.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-16 px-8">
                      <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                        <FileCode className="h-12 w-12 text-primary" />
                      </div>
                      
                      <div className="text-center space-y-4 mb-8">
                        <h3 className="text-2xl font-bold">{t('flows.welcome_title', 'Flow Builder')}</h3>
                        <p className="text-muted-foreground text-lg max-w-md">
                          {t('flows.welcome_message', 'Create automated conversation flows to engage with your customers 24/7')}
                        </p>
                      </div>

                      <div className="grid md:grid-cols-3 gap-6 mb-8 max-w-4xl">
                        <div className="text-center space-y-3">
                          <div className="w-12 h-12 bg-primary/10 dark:bg-primary/20 rounded-lg flex items-center justify-center mx-auto">
                            <MessageSquare className="h-6 w-6 text-primary" />
                          </div>
                          <h4 className="font-semibold">{t('flows.benefit_automate', 'Automate Conversations')}</h4>
                          <p className="text-sm text-muted-foreground">
                            {t('flows.benefit_automate_desc', 'Handle common inquiries automatically')}
                          </p>
                        </div>
                        
                        <div className="text-center space-y-3">
                          <div className="w-12 h-12 bg-green-500/10 dark:bg-green-500/20 rounded-lg flex items-center justify-center mx-auto">
                            <Clock className="h-6 w-6 text-green-600 dark:text-green-500" />
                          </div>
                          <h4 className="font-semibold">{t('flows.benefit_247', '24/7 Availability')}</h4>
                          <p className="text-sm text-muted-foreground">
                            {t('flows.benefit_247_desc', 'Respond to customers anytime, anywhere')}
                          </p>
                        </div>
                        
                        <div className="text-center space-y-3">
                          <div className="w-12 h-12 bg-purple-500/10 dark:bg-purple-500/20 rounded-lg flex items-center justify-center mx-auto">
                            <Zap className="h-6 w-6 text-purple-600 dark:text-purple-500" />
                          </div>
                          <h4 className="font-semibold">{t('flows.benefit_instant', 'Instant Responses')}</h4>
                          <p className="text-sm text-muted-foreground">
                            {t('flows.benefit_instant_desc', 'Provide immediate answers and support')}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-4">
                        <Link href="/flows/new">
                          <Button size="lg" className="flex items-center gap-2">
                            <Plus className="h-5 w-5" />
                            {t('flows.create_first_flow', 'Create Your First Flow')}
                          </Button>
                        </Link>
                        
                        <Button 
                          variant="outline" 
                          size="lg"
                          onClick={() => setShowImportDialog(true)}
                          className="flex items-center gap-2"
                        >
                          <Upload className="h-5 w-5" />
                          {t('flows.import_template', 'Import Template')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : filteredAndSortedFlows.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Search className="h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">{t('flows.no_results_found', 'No flows match your filters')}</h3>
                      <p className="text-muted-foreground text-center mb-4">
                        {t('flows.try_different_filters', 'Try adjusting your search terms or filters to find what you\'re looking for.')}
                      </p>
                      <Button variant="outline" onClick={clearAllFilters}>
                        <X className="h-4 w-4 mr-2" />
                        {t('flows.clear_all_filters', 'Clear All Filters')}
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  paginatedFlows.map((flow: any) => (
                    <Card 
                      key={flow.id} 
                      className={`${isSelectMode ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''} ${selectedFlows.has(flow.id) ? 'ring-2 ring-primary bg-primary/5' : ''}`}
                      onClick={() => isSelectMode && toggleFlowSelection(flow.id)}
                    >
                      <CardHeader>
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            {/* Selection Checkbox */}
                            {isSelectMode && (
                              <Checkbox
                                checked={selectedFlows.has(flow.id)}
                                onCheckedChange={() => toggleFlowSelection(flow.id)}
                                className="mt-1 h-5 w-5"
                                onClick={(e) => e.stopPropagation()}
                              />
                            )}
                            
                            <div className="space-y-1 flex-1 min-w-0">
                              <CardTitle className="flex items-center gap-2 flex-wrap">
                                <span className="truncate">{flow.name}</span>
                                <StatusSelector flow={flow} />
                              </CardTitle>
                              {flow.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2">
                                  {flow.description}
                                </p>
                              )}
                            </div>
                          </div>
                          
                          {/* Desktop Actions - Hide in select mode */}
                          {!isSelectMode && (
                            <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                              <Link href={`/flows/${flow.id}`}>
                                <Button variant="outline" size="sm">
                                  <Edit className="h-4 w-4 mr-2" />
                                  {t('common.edit', 'Edit')}
                                </Button>
                              </Link>
                              <FlowAssignmentsDialog flowId={flow.id} flowName={flow.name} />
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleDuplicateFlow(flow.id)}
                                      disabled={duplicateFlowMutation.isPending}
                                    >
                                      {duplicateFlowMutation.isPending ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      ) : (
                                        <Copy className="h-4 w-4 mr-2" />
                                      )}
                                      {t('flows.duplicate', 'Duplicate')}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{t('flows.duplicate_tooltip', 'Create a copy of this flow')}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => exportFlows([flow.id])}
                                    >
                                      <Download className="h-4 w-4 mr-2" />
                                      {t('flows.export', 'Export')}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{t('flows.export_tooltip', 'Export this flow as JSON')}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <DeleteFlowDialog
                                flowId={flow.id}
                                flowName={flow.name}
                                onDeleted={() => {

                                  window.location.reload();
                                }}
                              />
                            </div>
                          )}

                          {/* Mobile Actions Dropdown - Hide in select mode */}
                          {!isSelectMode && (
                            <div className="sm:hidden">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm">
                                    <Activity className="h-4 w-4 mr-2" />
                                    {t('flows.actions', 'Actions')}
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuLabel>{t('flows.flow_actions', 'Flow Actions')}</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem asChild>
                                    <Link href={`/flows/${flow.id}`} className="flex items-center w-full">
                                      <Edit className="h-4 w-4 mr-2" />
                                      {t('common.edit', 'Edit')}
                                    </Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleDuplicateFlow(flow.id)}
                                    disabled={duplicateFlowMutation.isPending}
                                  >
                                    <Copy className="h-4 w-4 mr-2" />
                                    {t('flows.duplicate', 'Duplicate')}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => exportFlows([flow.id])}
                                  >
                                    <Download className="h-4 w-4 mr-2" />
                                    {t('flows.export', 'Export')}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-destructive focus:text-destructive">
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    {t('common.delete', 'Delete')}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">{t('flows.status', 'Status')}</p>
                            <p className="font-medium">{flow.status}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">{t('flows.updated', 'Updated')}</p>
                            <p className="font-medium">{formatDate(flow.updatedAt)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">{t('flows.version', 'Version')}</p>
                            <p className="font-medium">v{flow.version}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </section>
          )}
              {
                flows && flows.length > 0 && filteredAndSortedFlows.length > itemsPerPage && (
                <div className="mt-8 flex justify-center">
                  <PaginationWrapper
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    totalItems={filteredAndSortedFlows.length}
                    itemsPerPage={itemsPerPage}
                  />
                </div>
              )}
          
          </div>
        </main>
      </div>

      {/* Flow Import Dialog */}
      <FlowImportDialog 
        open={showImportDialog} 
        onOpenChange={setShowImportDialog} 
      />

      {/* Keyboard Shortcuts Help Dialog */}
      <KeyboardShortcutsDialog 
        open={showKeyboardHelp} 
        onOpenChange={setShowKeyboardHelp} 
      />
    </div>
  );
}