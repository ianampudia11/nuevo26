import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';
import { OpenAIIcon } from "@/components/ui/openai-icon";
import { Bot } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Eye, 
  EyeOff, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  RefreshCw,
  Key,
  Zap
} from 'lucide-react';

interface SystemAiCredential {
  id: number;
  provider: string;
  displayName?: string;
  description?: string;
  isActive: boolean;
  isDefault: boolean;
  usageLimitMonthly?: number;
  usageCountCurrent: number;
  validationStatus: 'pending' | 'valid' | 'invalid' | 'expired';
  validationError?: string;
  lastValidatedAt?: string;
  apiKeyPreview: string;
  createdAt: string;
  updatedAt: string;
}

const AI_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', icon: <OpenAIIcon className="w-4 h-4" /> },
  { id: 'openrouter', name: 'OpenRouter', icon: <Bot className="w-4 h-4" /> }
];

export default function AiCredentialsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCredential, setSelectedCredential] = useState<SystemAiCredential | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTestingCredential, setIsTestingCredential] = useState<number | null>(null);

  const [createForm, setCreateForm] = useState({
    provider: '',
    apiKey: '',
    displayName: '',
    description: '',
    isActive: true,
    isDefault: false,
    usageLimitMonthly: ''
  });

  const [editForm, setEditForm] = useState({
    provider: '',
    apiKey: '',
    displayName: '',
    description: '',
    isActive: true,
    isDefault: false,
    usageLimitMonthly: ''
  });


  const { data: credentials, isLoading } = useQuery({
    queryKey: ['admin-ai-credentials'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/admin/ai-credentials');
      return response.json() as Promise<{ data: SystemAiCredential[] }>;
    },
    select: (data) => data.data
  });


  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/admin/ai-credentials', data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ai-credentials'] });
      setIsCreateModalOpen(false);
      setCreateForm({
        provider: '',
        apiKey: '',
        displayName: '',
        description: '',
        isActive: true,
        isDefault: false,
        usageLimitMonthly: ''
      });
      toast({
        title: t('admin.ai_credentials.create_success', 'Success'),
        description: t('admin.ai_credentials.create_success_desc', 'AI credential created successfully'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.ai_credentials.create_error', 'Error'),
        description: error.message || t('admin.ai_credentials.create_error_desc', 'Failed to create AI credential'),
        variant: 'destructive',
      });
    }
  });


  const validateMutation = useMutation({
    mutationFn: async (data: { provider: string; apiKey: string }) => {
      const response = await apiRequest('POST', '/api/admin/ai-credentials/validate', data);
      const result = await response.json();
      return result.data;
    }
  });


  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await apiRequest('PUT', `/api/admin/ai-credentials/${id}`, data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ai-credentials'] });
      setIsEditModalOpen(false);
      setSelectedCredential(null);
      toast({
        title: t('admin.ai_credentials.update_success', 'Success'),
        description: t('admin.ai_credentials.update_success_desc', 'AI credential updated successfully'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.ai_credentials.update_error', 'Error'),
        description: error.message || t('admin.ai_credentials.update_error_desc', 'Failed to update AI credential'),
        variant: 'destructive',
      });
    }
  });


  const testMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('POST', `/api/admin/ai-credentials/${id}/test`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ai-credentials'] });
      toast({
        title: t('admin.ai_credentials.test_success', 'Test Successful'),
        description: t('admin.ai_credentials.test_success_desc', 'AI credentials test completed.'),
      });
      setIsTestingCredential(null);
    },
    onError: (error: any) => {
      toast({
        title: t('admin.ai_credentials.test_error', 'Test Failed'),
        description: error.message || t('admin.ai_credentials.test_error_desc', 'AI credentials test failed. Please check your API key and try again.'),
        variant: 'destructive',
      });
      setIsTestingCredential(null);
    }
  });


  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('DELETE', `/api/admin/ai-credentials/${id}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ai-credentials'] });
      setIsDeleteDialogOpen(false);
      setSelectedCredential(null);
      toast({
        title: t('admin.ai_credentials.delete_success', 'Success'),
        description: t('admin.ai_credentials.delete_success_desc', 'AI credential deleted successfully'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.ai_credentials.delete_error', 'Error'),
        description: error.message || t('admin.ai_credentials.delete_error_desc', 'Failed to delete AI credential'),
        variant: 'destructive',
      });
    }
  });

  const handleCreateSubmit = async () => {
    if (!createForm.provider || !createForm.apiKey) {
      toast({
        title: t('admin.ai_credentials.validation_error', 'Validation Error'),
        description: t('admin.ai_credentials.provider_key_required', 'Provider and API key are required'),
        variant: 'destructive',
      });
      return;
    }

    const submitData = {
      ...createForm,
      usageLimitMonthly: createForm.usageLimitMonthly ? parseInt(createForm.usageLimitMonthly) : undefined
    };

    createMutation.mutate(submitData);
  };

  const handleValidateKey = async () => {
    if (!createForm.provider || !createForm.apiKey) {
      toast({
        title: t('admin.ai_credentials.validation_error', 'Validation Error'),
        description: t('admin.ai_credentials.provider_key_required', 'Provider and API key are required'),
        variant: 'destructive',
      });
      return;
    }

    try {
      const result = await validateMutation.mutateAsync({
        provider: createForm.provider,
        apiKey: createForm.apiKey
      });

      if (result.isValid) {
        toast({
          title: t('admin.ai_credentials.validation_success', 'Valid API Key'),
          description: t('admin.ai_credentials.validation_success_desc', 'The API key is valid and working'),
        });
      } else {
        toast({
          title: t('admin.ai_credentials.validation_failed', 'Invalid API Key'),
          description: result.error || t('admin.ai_credentials.validation_failed_desc', 'The API key is not valid'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('admin.ai_credentials.validation_error', 'Validation Error'),
        description: t('admin.ai_credentials.validation_error_desc', 'Failed to validate API key'),
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (credential: SystemAiCredential) => {
    switch (credential.validationStatus) {
      case 'valid':
        return <Badge variant="success"><CheckCircle className="w-3 h-3 mr-1" />Valid</Badge>;
      case 'invalid':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Invalid</Badge>;
      case 'expired':
        return <Badge variant="secondary"><AlertTriangle className="w-3 h-3 mr-1" />Expired</Badge>;
      default:
        return <Badge variant="outline"><RefreshCw className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  const getProviderInfo = (providerId: string) => {
    return AI_PROVIDERS.find(p => p.id === providerId) || { id: providerId, name: providerId, icon: '🔧' };
  };

  const handleEdit = (credential: SystemAiCredential) => {
    setSelectedCredential(credential);
    setEditForm({
      provider: credential.provider,
      apiKey: '', // Don't pre-fill API key for security
      displayName: credential.displayName || '',
      description: credential.description || '',
      isActive: credential.isActive,
      isDefault: credential.isDefault,
      usageLimitMonthly: credential.usageLimitMonthly?.toString() || ''
    });
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!selectedCredential) return;

    const submitData = {
      ...editForm,
      usageLimitMonthly: editForm.usageLimitMonthly ? parseInt(editForm.usageLimitMonthly) : undefined
    };

    updateMutation.mutate({ id: selectedCredential.id, data: submitData });
  };

  const handleTest = (credential: SystemAiCredential) => {
    setIsTestingCredential(credential.id);
    testMutation.mutate(credential.id);
  };

  const handleDelete = (credential: SystemAiCredential) => {
    setSelectedCredential(credential);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedCredential) {
      deleteMutation.mutate(selectedCredential.id);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 animate-spin mr-2" />
          {t('common.loading', 'Loading...')}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                {t('admin.ai_credentials.title', 'OpenAI & OpenRouter Credentials')}
              </CardTitle>
              <CardDescription>
                {t('admin.ai_credentials.description', 'Manage system-wide OpenAI and OpenRouter API keys for all companies')}
              </CardDescription>
            </div>
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {t('admin.ai_credentials.add_credential', 'Add Credential')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!credentials || credentials.length === 0 ? (
            <div className="text-center py-8">
              <Zap className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {t('admin.ai_credentials.no_credentials', 'No AI credentials configured')}
              </h3>
              <p className="text-gray-500 mb-4">
                {t('admin.ai_credentials.no_credentials_desc', 'Add OpenAI or OpenRouter credentials to enable AI features across all companies')}
              </p>
              <Button onClick={() => setIsCreateModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                {t('admin.ai_credentials.add_first_credential', 'Add Your First Credential')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {credentials.map((credential) => {
                const providerInfo = getProviderInfo(credential.provider);
                return (
                  <div key={credential.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{providerInfo.icon}</span>
                        <div>
                          <h4 className="font-medium">
                            {credential.displayName || providerInfo.name}
                            {credential.isDefault && (
                              <Badge variant="secondary" className="ml-2">Default</Badge>
                            )}
                          </h4>
                          <p className="text-sm text-gray-500">{credential.apiKeyPreview}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(credential)}
                        <Switch checked={credential.isActive} disabled />
                      </div>
                    </div>
                    
                    {credential.description && (
                      <p className="text-sm text-gray-600 mb-3">{credential.description}</p>
                    )}
                    
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <div className="flex items-center gap-4">
                        {credential.usageLimitMonthly && (
                          <span>
                            Usage: {credential.usageCountCurrent}/{credential.usageLimitMonthly}
                          </span>
                        )}
                        {credential.lastValidatedAt && (
                          <span>
                            Last validated: {new Date(credential.lastValidatedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(credential)}>
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTest(credential)}
                          disabled={isTestingCredential === credential.id}
                        >
                          <RefreshCw className={`w-3 h-3 mr-1 ${isTestingCredential === credential.id ? 'animate-spin' : ''}`} />
                          Test
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDelete(credential)}>
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Credential Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('admin.ai_credentials.create_title', 'Add AI Credential')}</DialogTitle>
            <DialogDescription>
              {t('admin.ai_credentials.create_desc', 'Add OpenAI or OpenRouter API credentials for system-wide use')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>{t('admin.ai_credentials.provider', 'Provider')}</Label>
              <Select value={createForm.provider} onValueChange={(value) => setCreateForm(prev => ({ ...prev, provider: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder={t('admin.ai_credentials.select_provider', 'Select a provider')} />
                </SelectTrigger>
                <SelectContent>
                  {AI_PROVIDERS.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      <div className="flex items-center gap-2">
                        <span>{provider.icon}</span>
                        <span>{provider.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('admin.ai_credentials.api_key', 'API Key')}</Label>
              <div className="relative">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={createForm.apiKey}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder={t('admin.ai_credentials.api_key_placeholder', 'Enter your API key')}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleValidateKey}
                  disabled={validateMutation.isPending}
                >
                  {validateMutation.isPending ? (
                    <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle className="w-3 h-3 mr-1" />
                  )}
                  {t('admin.ai_credentials.validate', 'Validate')}
                </Button>
              </div>
            </div>

            <div>
              <Label>{t('admin.ai_credentials.display_name', 'Display Name')} ({t('common.optional', 'Optional')})</Label>
              <Input
                value={createForm.displayName}
                onChange={(e) => setCreateForm(prev => ({ ...prev, displayName: e.target.value }))}
                placeholder={t('admin.ai_credentials.display_name_placeholder', 'e.g., Production OpenAI')}
              />
            </div>

            <div>
              <Label>{t('admin.ai_credentials.description', 'Description')} ({t('common.optional', 'Optional')})</Label>
              <Textarea
                value={createForm.description}
                onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('admin.ai_credentials.description_placeholder', 'Brief description of this credential')}
                rows={2}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Switch
                  id="is-active"
                  checked={createForm.isActive}
                  onCheckedChange={(checked) => setCreateForm(prev => ({ ...prev, isActive: checked }))}
                />
                <Label htmlFor="is-active">{t('admin.ai_credentials.is_active', 'Active')}</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="is-default"
                  checked={createForm.isDefault}
                  onCheckedChange={(checked) => setCreateForm(prev => ({ ...prev, isDefault: checked }))}
                />
                <Label htmlFor="is-default">{t('admin.ai_credentials.is_default', 'Default for provider')}</Label>
              </div>
            </div>

            <div>
              <Label>{t('admin.ai_credentials.usage_limit', 'Monthly Usage Limit')} ({t('common.optional', 'Optional')})</Label>
              <Input
                type="number"
                value={createForm.usageLimitMonthly}
                onChange={(e) => setCreateForm(prev => ({ ...prev, usageLimitMonthly: e.target.value }))}
                placeholder={t('admin.ai_credentials.usage_limit_placeholder', 'e.g., 10000')}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleCreateSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              {t('admin.ai_credentials.create', 'Create Credential')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Credential Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('admin.ai_credentials.edit_title', 'Edit AI Credential')}</DialogTitle>
            <DialogDescription>
              {t('admin.ai_credentials.edit_desc', 'Update the OpenAI or OpenRouter credential settings')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>{t('admin.ai_credentials.provider', 'Provider')}</Label>
              <Select value={editForm.provider} onValueChange={(value) => setEditForm(prev => ({ ...prev, provider: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder={t('admin.ai_credentials.select_provider', 'Select a provider')} />
                </SelectTrigger>
                <SelectContent>
                  {AI_PROVIDERS.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      <div className="flex items-center gap-2">
                        <span>{provider.icon}</span>
                        <span>{provider.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('admin.ai_credentials.api_key', 'API Key')}</Label>
              <Input
                type="password"
                value={editForm.apiKey}
                onChange={(e) => setEditForm(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder={t('admin.ai_credentials.api_key_placeholder', 'Enter new API key (leave empty to keep current)')}
              />
            </div>

            <div>
              <Label>{t('admin.ai_credentials.display_name', 'Display Name (Optional)')}</Label>
              <Input
                value={editForm.displayName}
                onChange={(e) => setEditForm(prev => ({ ...prev, displayName: e.target.value }))}
                placeholder={t('admin.ai_credentials.display_name_placeholder', 'e.g., Production OpenAI')}
              />
            </div>

            <div>
              <Label>{t('admin.ai_credentials.description', 'Description (Optional)')}</Label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('admin.ai_credentials.description_placeholder', 'Brief description of this credential')}
                rows={3}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-active"
                checked={editForm.isActive}
                onCheckedChange={(checked: boolean) => setEditForm(prev => ({ ...prev, isActive: checked }))}
              />
              <Label htmlFor="edit-active">{t('admin.ai_credentials.is_active', 'Active')}</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-default"
                checked={editForm.isDefault}
                onCheckedChange={(checked: boolean) => setEditForm(prev => ({ ...prev, isDefault: checked }))}
              />
              <Label htmlFor="edit-default">{t('admin.ai_credentials.is_default', 'Set as default for this provider')}</Label>
            </div>

            <div>
              <Label>{t('admin.ai_credentials.usage_limit', 'Monthly Usage Limit (Optional)')}</Label>
              <Input
                type="number"
                value={editForm.usageLimitMonthly}
                onChange={(e) => setEditForm(prev => ({ ...prev, usageLimitMonthly: e.target.value }))}
                placeholder={t('admin.ai_credentials.usage_limit_placeholder', 'e.g., 10000')}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleEditSubmit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Edit className="w-4 h-4 mr-2" />
              )}
              {t('admin.ai_credentials.update', 'Update Credential')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin.ai_credentials.delete_title', 'Delete AI Credential')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin.ai_credentials.delete_desc', 'Are you sure you want to delete this AI credential? This action cannot be undone and may affect companies using this credential.')}
              {selectedCredential && (
                <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                  <strong>{selectedCredential.displayName || getProviderInfo(selectedCredential.provider).name}</strong>
                  <br />
                  <span className="text-gray-500">{selectedCredential.apiKeyPreview}</span>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              {t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
