import { useState } from 'react';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  Loader2,
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { CreateTemplateModal, EditTemplateModal, ViewTemplateModal } from '@/components/templates';
import type { WhatsAppTemplate } from '@/types/whatsapp-template';

export default function Templates() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);


  const { data: templates = [], isLoading } = useQuery<WhatsAppTemplate[]>({
    queryKey: ['/api/whatsapp-templates'],
    refetchOnWindowFocus: false,
  });


  const { data: connections = [], isLoading: isLoadingConnections } = useQuery<any[]>({
    queryKey: ['/api/channel-connections'],
    select: (data) => {
      const filtered = data.filter((conn: any) => conn.channelType === 'whatsapp_official' && conn.status === 'active');
      return filtered;
    },
  });


  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const res = await apiRequest('DELETE', `/api/whatsapp-templates/${templateId}`);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t('templates.deleted', 'Template Deleted'),
        description: t('templates.deleted_success', 'Template has been deleted successfully'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp-templates'] });
      setShowDeleteAlert(false);
      setSelectedTemplate(null);
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('templates.delete_error', 'Failed to delete template: {{error}}', { error: error.message }),
        variant: 'destructive',
      });
    },
  });


  const syncStatusMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const res = await apiRequest('POST', `/api/whatsapp-templates/${templateId}/sync-status`);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t('templates.status_synced', 'Status Synced'),
        description: t('templates.status_synced_success', 'Template status has been updated'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp-templates'] });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('templates.sync_error', 'Failed to sync status: {{error}}', { error: error.message }),
        variant: 'destructive',
      });
    },
  });


  const syncFromMetaMutation = useMutation({
    mutationFn: async (connectionId: number) => {

      const res = await fetch('/api/whatsapp-templates/sync-from-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
        credentials: 'include',
      });
      
      if (!res.ok) {

        let errorData: any = {};
        try {
          errorData = await res.json();
        } catch {
          errorData = { error: res.statusText || 'Failed to sync templates' };
        }
        
        const error = new Error(errorData.error || errorData.details || 'Failed to sync templates');
        (error as any).response = { data: errorData, status: res.status };
        (error as any).connectionId = connectionId;
        throw error;
      }
      
      return await res.json();
    },
    onSuccess: (data) => {
      let description = t('templates.sync_summary', 'Created: {{created}}, Updated: {{updated}}, Skipped: {{skipped}}', {
        created: data.summary.created,
        updated: data.summary.updated,
        skipped: data.summary.skipped
      });


      if (data.fetchMethod === 'business') {
        description += ' (Business-level templates)';
      } else if (data.fetchMethod === 'waba') {
        description += ' (WABA-level templates)';
      }

      toast({
        title: t('templates.synced_from_meta', 'Templates Synced'),
        description,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp-templates'] });
    },
    onError: (error: any) => {

      let errorMessage = error.message || 'Failed to sync templates';
      let errorDetails = '';
      let actionableGuidance = '';
      

      if (error.response?.data) {
        const errorData = error.response.data;
        

        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (errorData.details) {
          errorMessage = errorData.details;
        }
        

        if (errorData.errorCode || errorData.errorType) {
          errorDetails = `Error Code: ${errorData.errorCode || 'N/A'}, Type: ${errorData.errorType || 'N/A'}`;
        }
        

        if (errorData.partnerManaged && errorData.fetchMethod === 'business') {
          actionableGuidance = 'Business-level template fetch failed. This may indicate the business ID is invalid or the access token lacks permissions to access business-level templates. The system fell back to WABA-level templates.';
        } else if (errorData.partnerManaged && errorData.fetchMethod === 'waba') {
          actionableGuidance = 'Fetching WABA-level templates. If you expected to see all business templates, verify that the business ID was captured during signup.';
        } else if (errorData.partnerManaged) {
          actionableGuidance = 'This is an embedded signup connection. Please verify that the partner configuration has a valid system-level access token with template management permissions.';
        } else if (error.response.status === 401) {
          actionableGuidance = 'Access token may be invalid or expired. Try reconnecting the WhatsApp account.';
        } else if (error.response.status === 403) {
          actionableGuidance = 'Access token may lack template permissions. Verify the connection has whatsapp_business_management permission scope.';
        } else if (error.response.status === 404) {
          actionableGuidance = 'WhatsApp Business Account not found. Please verify the connection configuration.';
        }
      }
      

      const connectionName = connections.find((c: any) => c.id === error.connectionId)?.accountName 
        || connections.find((c: any) => c.id === error.connectionId)?.phoneNumber
        || `Connection ${error.connectionId || 'unknown'}`;
      

      const debugMode = localStorage.getItem('debug-mode') === 'true' || 
                       new URLSearchParams(window.location.search).get('debug') === 'true';
      if (debugMode) {
        console.error('Template sync error details:', {
          error,
          response: error.response?.data,
          status: error.response?.status,
          connectionId: error.connectionId,
          connectionName
        });
      }
      

      let fullErrorMessage = errorMessage;
      if (errorDetails) {
        fullErrorMessage += ` (${errorDetails})`;
      }
      if (actionableGuidance) {
        fullErrorMessage += ` ${actionableGuidance}`;
      }
      
      toast({
        title: t('common.error', 'Error'),
        description: fullErrorMessage,
        variant: 'destructive',
        duration: 8000, // Show longer for detailed errors
      });
    },
  });

  const handleSyncFromConnection = (connectionId: number) => {
    syncFromMetaMutation.mutate(connectionId);
  };


  const filteredTemplates = templates.filter(template => 
    template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleView = (template: WhatsAppTemplate) => {
    setSelectedTemplate(template);
    setShowViewModal(true);
  };

  const handleEdit = (template: WhatsAppTemplate) => {
    setSelectedTemplate(template);
    setShowEditModal(true);
  };

  const handleDelete = (template: WhatsAppTemplate) => {
    setSelectedTemplate(template);
    setShowDeleteAlert(true);
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3 mr-1" />{t('templates.status.approved', 'Approved')}</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />{t('templates.status.pending', 'Pending')}</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />{t('templates.status.rejected', 'Rejected')}</Badge>;
      case 'disabled':
        return <Badge className="bg-muted text-muted-foreground"><AlertTriangle className="h-3 w-3 mr-1" />{t('templates.status.disabled', 'Disabled')}</Badge>;
      default:
        return <Badge variant="outline">{t('templates.status.draft', 'Draft')}</Badge>;
    }
  };

  const getCategoryBadge = (category?: string) => {
    switch (category) {
      case 'marketing':
        return <Badge variant="secondary">{t('templates.category.marketing', 'Marketing')}</Badge>;
      case 'utility':
        return <Badge variant="default">{t('templates.category.utility', 'Utility')}</Badge>;
      case 'authentication':
        return <Badge variant="outline">{t('templates.category.authentication', 'Authentication')}</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden font-sans text-foreground">
      <Header />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        
        <div className="flex-1 overflow-y-auto p-3 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
            <div>
              <h1 className="text-2xl font-semibold">{t('templates.title', 'WhatsApp Templates')}</h1>
              <p className="text-muted-foreground text-sm sm:text-base mt-1">
                {t('templates.description', 'Manage WhatsApp Business API message templates')}
              </p>
            </div>
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={syncFromMetaMutation.isPending || isLoadingConnections || connections.length === 0}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncFromMetaMutation.isPending ? 'animate-spin' : ''}`} />
                    {isLoadingConnections
                      ? t('common.loading', 'Loading...')
                      : t('templates.sync_from_meta', 'Sync from Meta')
                    }
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {isLoadingConnections ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                      {t('common.loading', 'Loading...')}
                    </div>
                  ) : connections.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                      {t('templates.no_connections', 'No active WhatsApp connections found')}
                    </div>
                  ) : (
                    connections.map((connection: any) => (
                      <DropdownMenuItem
                        key={connection.id}
                        onClick={() => handleSyncFromConnection(connection.id)}
                        disabled={syncFromMetaMutation.isPending}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {connection.accountName || connection.phoneNumber || `Connection ${connection.id}`}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button onClick={() => setShowCreateModal(true)} className="btn-brand-primary">
                <Plus className="h-4 w-4 mr-2" />
                {t('templates.create', 'Create Template')}
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div>
                  <CardTitle>{t('templates.list_title', 'Templates')}</CardTitle>
                  <CardDescription>
                    {t('templates.list_description', 'View and manage your WhatsApp message templates')}
                  </CardDescription>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('templates.search', 'Search templates...')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">
                    {searchQuery 
                      ? t('templates.no_results', 'No templates found matching your search')
                      : t('templates.empty', 'No templates yet. Create your first template to get started.')}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('templates.table.name', 'Name')}</TableHead>
                        <TableHead>{t('templates.table.category', 'Category')}</TableHead>
                        <TableHead>{t('templates.table.status', 'Status')}</TableHead>
                        <TableHead>{t('templates.table.language', 'Language')}</TableHead>
                        <TableHead>{t('templates.table.usage', 'Usage')}</TableHead>
                        <TableHead className="text-right">{t('templates.table.actions', 'Actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTemplates.map((template) => (
                        <TableRow key={template.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{template.name}</div>
                              {template.description && (
                                <div className="text-sm text-muted-foreground truncate max-w-xs">
                                  {template.description}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {getCategoryBadge(template.whatsappTemplateCategory)}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(template.whatsappTemplateStatus)}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm uppercase">
                              {template.whatsappTemplateLanguage || 'en'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-foreground">
                              {template.usageCount || 0}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleView(template)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  {t('common.view', 'View')}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleEdit(template)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  {t('common.edit', 'Edit')}
                                </DropdownMenuItem>
                                {template.whatsappTemplateStatus === 'pending' && (
                                  <DropdownMenuItem
                                    onClick={() => syncStatusMutation.mutate(template.id)}
                                    disabled={syncStatusMutation.isPending}
                                  >
                                    <RefreshCw className={`h-4 w-4 mr-2 ${syncStatusMutation.isPending ? 'animate-spin' : ''}`} />
                                    {t('templates.refresh_status', 'Refresh Status')}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() => handleDelete(template)}
                                  className="text-red-600"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  {t('common.delete', 'Delete')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modals */}
      <CreateTemplateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />

      {selectedTemplate && (
        <>
          <EditTemplateModal
            isOpen={showEditModal}
            onClose={() => {
              setShowEditModal(false);
              setSelectedTemplate(null);
            }}
            template={selectedTemplate}
          />

          <ViewTemplateModal
            isOpen={showViewModal}
            onClose={() => {
              setShowViewModal(false);
              setSelectedTemplate(null);
            }}
            template={selectedTemplate}
          />
        </>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('templates.delete_confirm_title', 'Delete Template')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('templates.delete_confirm_message', 'Are you sure you want to delete this template? This action cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedTemplate && deleteTemplateMutation.mutate(selectedTemplate.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteTemplateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


    </div>
  );
}

