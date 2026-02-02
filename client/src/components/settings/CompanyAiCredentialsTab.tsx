import { useState, useEffect } from 'react';
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
  Settings,
  Building
} from 'lucide-react';

interface CompanyAiCredential {
  id: number;
  provider: string;
  displayName?: string;
  description?: string;
  isActive: boolean;
  usageLimitMonthly?: number;
  usageCountCurrent: number;
  validationStatus: 'pending' | 'valid' | 'invalid' | 'expired';
  validationError?: string;
  lastValidatedAt?: string;
  apiKeyPreview: string;
  createdAt: string;
  updatedAt: string;
}

interface CompanyAiPreferences {
  defaultProvider: string;
  credentialPreference: 'company' | 'system' | 'auto';
  fallbackEnabled: boolean;
  usageAlertsEnabled: boolean;
  usageAlertThreshold: number;
}

const AI_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', icon: <OpenAIIcon className="w-4 h-4" /> },
  { id: 'openrouter', name: 'OpenRouter', icon: <Bot className="w-4 h-4" /> }
];

export default function CompanyAiCredentialsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCredential, setSelectedCredential] = useState<CompanyAiCredential | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTestingCredential, setIsTestingCredential] = useState<number | null>(null);

  const [createForm, setCreateForm] = useState({
    provider: '',
    apiKey: '',
    displayName: '',
    description: '',
    isActive: true,
    usageLimitMonthly: ''
  });

  const [editForm, setEditForm] = useState({
    provider: '',
    apiKey: '',
    displayName: '',
    description: '',
    isActive: true,
    usageLimitMonthly: ''
  });

  const [preferencesForm, setPreferencesForm] = useState<CompanyAiPreferences>({
    defaultProvider: 'openai',
    credentialPreference: 'auto',
    fallbackEnabled: true,
    usageAlertsEnabled: true,
    usageAlertThreshold: 80
  });


  const { data: credentials, isLoading } = useQuery({
    queryKey: ['company-ai-credentials'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/company/ai-credentials');
      const result = await response.json();
      return result.data as CompanyAiCredential[];
    }
  });


  const { data: preferences } = useQuery({
    queryKey: ['company-ai-preferences'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/company/ai-credentials/preferences');
      const result = await response.json();
      return result.data as CompanyAiPreferences;
    }
  });


  useEffect(() => {
    if (preferences) {
      setPreferencesForm(preferences);
    }
  }, [preferences]);


  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/company/ai-credentials', data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-ai-credentials'] });
      setIsCreateModalOpen(false);
      setCreateForm({
        provider: '',
        apiKey: '',
        displayName: '',
        description: '',
        isActive: true,
        usageLimitMonthly: ''
      });
      toast({
        title: t('settings.ai_credentials.create_success', 'Success'),
        description: t('settings.ai_credentials.create_success_desc', 'AI credential created successfully'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('settings.ai_credentials.create_error', 'Error'),
        description: error.message || t('settings.ai_credentials.create_error_desc', 'Failed to create AI credential'),
        variant: 'destructive',
      });
    }
  });


  const updatePreferencesMutation = useMutation({
    mutationFn: async (data: Partial<CompanyAiPreferences>) => {
      const response = await apiRequest('PUT', '/api/company/ai-credentials/preferences', data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-ai-preferences'] });
      setIsPreferencesModalOpen(false);
      toast({
        title: t('settings.ai_credentials.preferences_success', 'Success'),
        description: t('settings.ai_credentials.preferences_success_desc', 'AI preferences updated successfully'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('settings.ai_credentials.preferences_error', 'Error'),
        description: error.message || t('settings.ai_credentials.preferences_error_desc', 'Failed to update AI preferences'),
        variant: 'destructive',
      });
    }
  });


  const validateMutation = useMutation({
    mutationFn: async (data: { provider: string; apiKey: string }) => {
      const response = await apiRequest('POST', '/api/company/ai-credentials/validate', data);
      const result = await response.json();
      return result.data;
    }
  });


  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await apiRequest('PUT', `/api/company/ai-credentials/${id}`, data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-ai-credentials'] });
      setIsEditModalOpen(false);
      setSelectedCredential(null);
      toast({
        title: t('company.ai_credentials.update_success', 'Success'),
        description: t('company.ai_credentials.update_success_desc', 'AI credential updated successfully'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('company.ai_credentials.update_error', 'Error'),
        description: error.message || t('company.ai_credentials.update_error_desc', 'Failed to update AI credential'),
        variant: 'destructive',
      });
    }
  });


  const testMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('POST', `/api/company/ai-credentials/${id}/test`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-ai-credentials'] });
      toast({
        title: t('company.ai_credentials.test_success', 'Test Successful'),
        description: t('company.ai_credentials.test_success_desc', 'AI credentials test completed.'),
      });
      setIsTestingCredential(null);
    },
    onError: (error: any) => {
      toast({
        title: t('company.ai_credentials.test_error', 'Test Failed'),
        description: error.message || t('company.ai_credentials.test_error_desc', 'AI credentials test failed. Please check your API key and try again.'),
        variant: 'destructive',
      });
      setIsTestingCredential(null);
    }
  });


  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('DELETE', `/api/company/ai-credentials/${id}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-ai-credentials'] });
      setIsDeleteDialogOpen(false);
      setSelectedCredential(null);
      toast({
        title: t('company.ai_credentials.delete_success', 'Success'),
        description: t('company.ai_credentials.delete_success_desc', 'AI credential deleted successfully'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('company.ai_credentials.delete_error', 'Error'),
        description: error.message || t('company.ai_credentials.delete_error_desc', 'Failed to delete AI credential'),
        variant: 'destructive',
      });
    }
  });

  const handleCreateSubmit = async () => {
    if (!createForm.provider || !createForm.apiKey) {
      toast({
        title: t('settings.ai_credentials.validation_error', 'Validation Error'),
        description: t('settings.ai_credentials.provider_key_required', 'Provider and API key are required'),
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
        title: t('settings.ai_credentials.validation_error', 'Validation Error'),
        description: t('settings.ai_credentials.provider_key_required', 'Provider and API key are required'),
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
          title: t('settings.ai_credentials.validation_success', 'Valid API Key'),
          description: t('settings.ai_credentials.validation_success_desc', 'The API key is valid and working'),
        });
      } else {
        toast({
          title: t('settings.ai_credentials.validation_failed', 'Invalid API Key'),
          description: result.error || t('settings.ai_credentials.validation_failed_desc', 'The API key is not valid'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('settings.ai_credentials.validation_error', 'Validation Error'),
        description: t('settings.ai_credentials.validation_error_desc', 'Failed to validate API key'),
        variant: 'destructive',
      });
    }
  };

  const handleUpdatePreferences = () => {
    updatePreferencesMutation.mutate(preferencesForm);
  };

  const getStatusBadge = (credential: CompanyAiCredential) => {
    switch (credential.validationStatus) {
      case 'valid':
        return <Badge variant="default" className="bg-primary/10 text-primary border-primary/20"><CheckCircle className="w-3 h-3 mr-1" />Valid</Badge>;
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

  const handleEdit = (credential: CompanyAiCredential) => {
    setSelectedCredential(credential);
    setEditForm({
      provider: credential.provider,
      apiKey: '', // Don't pre-fill API key for security
      displayName: credential.displayName || '',
      description: credential.description || '',
      isActive: credential.isActive,
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

  const handleTest = (credential: CompanyAiCredential) => {
    setIsTestingCredential(credential.id);
    testMutation.mutate(credential.id);
  };

  const handleDelete = (credential: CompanyAiCredential) => {
    setSelectedCredential(credential);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedCredential) {
      deleteMutation.mutate(selectedCredential.id);
    }
  };

  const getCredentialPreferenceLabel = (preference: string) => {
    switch (preference) {
      case 'company':
        return t('settings.ai_credentials.preference_company', 'Company credentials only');
      case 'system':
        return t('settings.ai_credentials.preference_system', 'System credentials only');
      case 'auto':
        return t('settings.ai_credentials.preference_auto', 'Company first, fallback to system');
      default:
        return preference;
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
      {/* AI Preferences Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-foreground" />
                {t('settings.ai_credentials.preferences_title', 'AI Preferences')}
              </CardTitle>
              <CardDescription>
                {t('settings.ai_credentials.preferences_description', 'Configure how your company uses AI credentials')}
              </CardDescription>
            </div>
            <Button variant="outline" onClick={() => setIsPreferencesModalOpen(true)}>
              <Settings className="w-4 h-4 mr-2 text-foreground" />
              {t('settings.ai_credentials.configure', 'Configure')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {preferences ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-foreground">
                  {t('settings.ai_credentials.default_provider', 'Default Provider')}
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {getProviderInfo(preferences.defaultProvider).name}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium text-foreground">
                  {t('settings.ai_credentials.credential_preference', 'Credential Preference')}
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {getCredentialPreferenceLabel(preferences.credentialPreference)}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium text-foreground">
                  {t('settings.ai_credentials.fallback_enabled', 'Fallback Enabled')}
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {preferences.fallbackEnabled ? t('common.yes', 'Yes') : t('common.no', 'No')}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium text-foreground">
                  {t('settings.ai_credentials.usage_alerts', 'Usage Alerts')}
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {preferences.usageAlertsEnabled
                    ? `${t('common.enabled', 'Enabled')} (${preferences.usageAlertThreshold}%)`
                    : t('common.disabled', 'Disabled')
                  }
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              {t('settings.ai_credentials.loading_preferences', 'Loading preferences...')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Company Credentials Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building className="w-5 h-5 text-foreground" />
                {t('settings.ai_credentials.company_title', 'Company AI Credentials')}
              </CardTitle>
              <CardDescription>
                {t('settings.ai_credentials.company_description', 'Manage your company-specific OpenAI and OpenRouter API keys')}
              </CardDescription>
            </div>
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {t('settings.ai_credentials.add_credential', 'Add Credential')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!credentials || credentials.length === 0 ? (
            <div className="text-center py-8">
              <Key className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                {t('settings.ai_credentials.no_credentials', 'No company credentials configured')}
              </h3>
              <p className="text-muted-foreground mb-4">
                {t('settings.ai_credentials.no_credentials_desc', 'Add your own OpenAI or OpenRouter credentials for better control and billing')}
              </p>
              <Button onClick={() => setIsCreateModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                {t('settings.ai_credentials.add_first_credential', 'Add Your First Credential')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {credentials.map((credential) => {
                const providerInfo = getProviderInfo(credential.provider);
                return (
                  <div key={credential.id} className="border border-border rounded-lg p-4 bg-card">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{providerInfo.icon}</span>
                        <div>
                          <h4 className="font-medium text-foreground">
                            {credential.displayName || providerInfo.name}
                          </h4>
                          <p className="text-sm text-muted-foreground">{credential.apiKeyPreview}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(credential)}
                        <Switch checked={credential.isActive} disabled />
                      </div>
                    </div>
                    
                    {credential.description && (
                      <p className="text-sm text-muted-foreground mb-3">{credential.description}</p>
                    )}
                    
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
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
                          <Edit className="w-3 h-3 mr-1 text-foreground" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTest(credential)}
                          disabled={isTestingCredential === credential.id}
                        >
                          <RefreshCw className={`w-3 h-3 mr-1 text-foreground ${isTestingCredential === credential.id ? 'animate-spin' : ''}`} />
                          Test
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDelete(credential)}>
                          <Trash2 className="w-3 h-3 mr-1 text-foreground" />
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
            <DialogTitle>{t('settings.ai_credentials.create_title', 'Add Company AI Credential')}</DialogTitle>
            <DialogDescription>
              {t('settings.ai_credentials.create_desc', 'Add OpenAI or OpenRouter API credentials for your company')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>{t('settings.ai_credentials.provider', 'Provider')}</Label>
              <Select value={createForm.provider} onValueChange={(value) => setCreateForm(prev => ({ ...prev, provider: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder={t('settings.ai_credentials.select_provider', 'Select a provider')} />
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
              <Label>{t('settings.ai_credentials.api_key', 'API Key')}</Label>
              <div className="relative">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={createForm.apiKey}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder={t('settings.ai_credentials.api_key_placeholder', 'Enter your API key')}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
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
                    <RefreshCw className="w-3 h-3 mr-1 animate-spin text-foreground" />
                  ) : (
                    <CheckCircle className="w-3 h-3 mr-1 text-foreground" />
                  )}
                  {t('settings.ai_credentials.validate', 'Validate')}
                </Button>
              </div>
            </div>

            <div>
              <Label>{t('settings.ai_credentials.display_name', 'Display Name')} ({t('common.optional', 'Optional')})</Label>
              <Input
                value={createForm.displayName}
                onChange={(e) => setCreateForm(prev => ({ ...prev, displayName: e.target.value }))}
                placeholder={t('settings.ai_credentials.display_name_placeholder', 'e.g., Production OpenAI')}
              />
            </div>

            <div>
              <Label>{t('settings.ai_credentials.description', 'Description')} ({t('common.optional', 'Optional')})</Label>
              <Textarea
                value={createForm.description}
                onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('settings.ai_credentials.description_placeholder', 'Brief description of this credential')}
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
                <Label htmlFor="is-active">{t('settings.ai_credentials.is_active', 'Active')}</Label>
              </div>
            </div>

            <div>
              <Label>{t('settings.ai_credentials.usage_limit', 'Monthly Usage Limit')} ({t('common.optional', 'Optional')})</Label>
              <Input
                type="number"
                value={createForm.usageLimitMonthly}
                onChange={(e) => setCreateForm(prev => ({ ...prev, usageLimitMonthly: e.target.value }))}
                placeholder={t('settings.ai_credentials.usage_limit_placeholder', 'e.g., 10000')}
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
              {t('settings.ai_credentials.create', 'Create Credential')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Credential Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('settings.ai_credentials.edit_title', 'Edit AI Credential')}</DialogTitle>
            <DialogDescription>
              {t('settings.ai_credentials.edit_desc', 'Update the OpenAI or OpenRouter credential settings')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>{t('settings.ai_credentials.provider', 'Provider')}</Label>
              <Select value={editForm.provider} onValueChange={(value) => setEditForm(prev => ({ ...prev, provider: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder={t('settings.ai_credentials.select_provider', 'Select a provider')} />
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
              <Label>{t('settings.ai_credentials.api_key', 'API Key')}</Label>
              <Input
                type="password"
                value={editForm.apiKey}
                onChange={(e) => setEditForm(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder={t('settings.ai_credentials.api_key_placeholder', 'Enter new API key (leave empty to keep current)')}
              />
            </div>

            <div>
              <Label>{t('settings.ai_credentials.display_name', 'Display Name (Optional)')}</Label>
              <Input
                value={editForm.displayName}
                onChange={(e) => setEditForm(prev => ({ ...prev, displayName: e.target.value }))}
                placeholder={t('settings.ai_credentials.display_name_placeholder', 'e.g., Production OpenAI')}
              />
            </div>

            <div>
              <Label>{t('settings.ai_credentials.description', 'Description (Optional)')}</Label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('settings.ai_credentials.description_placeholder', 'Brief description of this credential')}
                rows={3}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-active"
                checked={editForm.isActive}
                onCheckedChange={(checked: boolean) => setEditForm(prev => ({ ...prev, isActive: checked }))}
              />
              <Label htmlFor="edit-active">{t('settings.ai_credentials.is_active', 'Active')}</Label>
            </div>

            <div>
              <Label>{t('settings.ai_credentials.usage_limit', 'Monthly Usage Limit (Optional)')}</Label>
              <Input
                type="number"
                value={editForm.usageLimitMonthly}
                onChange={(e) => setEditForm(prev => ({ ...prev, usageLimitMonthly: e.target.value }))}
                placeholder={t('settings.ai_credentials.usage_limit_placeholder', 'e.g., 10000')}
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
              {t('settings.ai_credentials.update', 'Update Credential')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preferences Modal */}
      <Dialog open={isPreferencesModalOpen} onOpenChange={setIsPreferencesModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('settings.ai_credentials.preferences_title', 'AI Preferences')}</DialogTitle>
            <DialogDescription>
              {t('settings.ai_credentials.preferences_modal_desc', 'Configure how your company uses AI credentials')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>{t('settings.ai_credentials.default_provider', 'Default Provider')}</Label>
              <Select value={preferencesForm.defaultProvider} onValueChange={(value) => setPreferencesForm(prev => ({ ...prev, defaultProvider: value }))}>
                <SelectTrigger>
                  <SelectValue />
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
              <Label>{t('settings.ai_credentials.credential_preference', 'Credential Preference')}</Label>
              <Select value={preferencesForm.credentialPreference} onValueChange={(value: any) => setPreferencesForm(prev => ({ ...prev, credentialPreference: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">{t('settings.ai_credentials.preference_company', 'Company credentials only')}</SelectItem>
                  <SelectItem value="system">{t('settings.ai_credentials.preference_system', 'System credentials only')}</SelectItem>
                  <SelectItem value="auto">{t('settings.ai_credentials.preference_auto', 'Company first, fallback to system')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {t('settings.ai_credentials.preference_help', 'Choose how to prioritize credential sources')}
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>{t('settings.ai_credentials.fallback_enabled', 'Enable Fallback')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('settings.ai_credentials.fallback_help', 'Allow fallback to system credentials if company credentials fail')}
                </p>
              </div>
              <Switch
                checked={preferencesForm.fallbackEnabled}
                onCheckedChange={(checked) => setPreferencesForm(prev => ({ ...prev, fallbackEnabled: checked }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>{t('settings.ai_credentials.usage_alerts', 'Usage Alerts')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('settings.ai_credentials.usage_alerts_help', 'Get notified when approaching usage limits')}
                </p>
              </div>
              <Switch
                checked={preferencesForm.usageAlertsEnabled}
                onCheckedChange={(checked) => setPreferencesForm(prev => ({ ...prev, usageAlertsEnabled: checked }))}
              />
            </div>

            {preferencesForm.usageAlertsEnabled && (
              <div>
                <Label>{t('settings.ai_credentials.alert_threshold', 'Alert Threshold (%)')}</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={preferencesForm.usageAlertThreshold}
                  onChange={(e) => setPreferencesForm(prev => ({ ...prev, usageAlertThreshold: parseInt(e.target.value) || 80 }))}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPreferencesModalOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleUpdatePreferences} disabled={updatePreferencesMutation.isPending}>
              {updatePreferencesMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Settings className="w-4 h-4 mr-2" />
              )}
              {t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.ai_credentials.delete_title', 'Delete AI Credential')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.ai_credentials.delete_desc', 'Are you sure you want to delete this AI credential? This action cannot be undone.')}
              {selectedCredential && (
                <div className="mt-2 p-2 bg-muted rounded text-sm">
                  <strong className="text-foreground">{selectedCredential.displayName || getProviderInfo(selectedCredential.provider).name}</strong>
                  <br />
                  <span className="text-muted-foreground">{selectedCredential.apiKeyPreview}</span>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin text-destructive-foreground" />
              ) : null}
              {t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
