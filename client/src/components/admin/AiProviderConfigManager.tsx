import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Edit, Trash2, Settings } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { OpenAIIcon } from "@/components/ui/openai-icon";
import { Bot } from "lucide-react";

interface AiProviderConfig {
  id: number;
  planId: number;
  provider: string;
  tokensMonthlyLimit?: number | null;
  tokensDailyLimit?: number | null;
  customPricingEnabled: boolean;
  inputTokenRate?: string | null;
  outputTokenRate?: string | null;
  enabled: boolean;
  priority: number;
  metadata: any;
  createdAt: string;
  updatedAt: string;
}

interface AiProviderConfigManagerProps {
  planId: number;
  planName: string;
}

const AI_PROVIDERS = [
  { value: 'openai', label: 'OpenAI', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', icon: <OpenAIIcon className="w-4 h-4" /> },
  { value: 'openrouter', label: 'OpenRouter', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300', icon: <Bot className="w-4 h-4" /> }
];

export default function AiProviderConfigManager({ planId, planName }: AiProviderConfigManagerProps) {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<AiProviderConfig | null>(null);

  const [formData, setFormData] = useState({
    provider: "",
    tokensMonthlyLimit: null as number | null,
    tokensDailyLimit: null as number | null,
    customPricingEnabled: false,
    inputTokenRate: null as string | null,
    outputTokenRate: null as string | null,
    enabled: true,
    priority: 0
  });


  const { data: configs, isLoading } = useQuery<AiProviderConfig[]>({
    queryKey: [`/api/admin/plans/${planId}/ai-providers`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/plans/${planId}/ai-providers`);
      if (!res.ok) throw new Error("Failed to fetch AI provider configs");
      return res.json();
    }
  });


  const createConfigMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", `/api/admin/plans/${planId}/ai-providers`, {
        ...data,
        planId
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create provider config");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/plans/${planId}/ai-providers`] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({
        title: "Provider Config Created",
        description: "AI provider configuration has been created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create provider config",
        variant: "destructive",
      });
    }
  });


  const updateConfigMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: Partial<typeof formData> }) => {
      const res = await apiRequest("PUT", `/api/admin/plans/${planId}/ai-providers/${id}`, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update provider config");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/plans/${planId}/ai-providers`] });
      setIsEditDialogOpen(false);
      setSelectedConfig(null);
      toast({
        title: "Provider Config Updated",
        description: "AI provider configuration has been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update provider config",
        variant: "destructive",
      });
    }
  });


  const deleteConfigMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/plans/${planId}/ai-providers/${id}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete provider config");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/plans/${planId}/ai-providers`] });
      toast({
        title: "Provider Config Deleted",
        description: "AI provider configuration has been deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete provider config",
        variant: "destructive",
      });
    }
  });

  const handleCreateConfig = () => {
    createConfigMutation.mutate(formData);
  };

  const handleUpdateConfig = () => {
    if (!selectedConfig) return;
    updateConfigMutation.mutate({ id: selectedConfig.id, data: formData });
  };

  const handleEditConfig = (config: AiProviderConfig) => {
    setSelectedConfig(config);
    setFormData({
      provider: config.provider,
      tokensMonthlyLimit: config.tokensMonthlyLimit ?? null,
      tokensDailyLimit: config.tokensDailyLimit ?? null,
      customPricingEnabled: config.customPricingEnabled,
      inputTokenRate: config.inputTokenRate ?? null,
      outputTokenRate: config.outputTokenRate ?? null,
      enabled: config.enabled,
      priority: config.priority
    });
    setIsEditDialogOpen(true);
  };

  const handleDeleteConfig = (id: number) => {
    deleteConfigMutation.mutate(id);
  };

  const resetForm = () => {
    setFormData({
      provider: "",
      tokensMonthlyLimit: null,
      tokensDailyLimit: null,
      customPricingEnabled: false,
      inputTokenRate: null,
      outputTokenRate: null,
      enabled: true,
      priority: 0
    });
  };

  const getProviderInfo = (provider: string) => {
    return AI_PROVIDERS.find(p => p.value === provider) || { value: provider, label: provider, color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300', icon: '🔧' };
  };

  const getUsedProviders = () => {
    return configs?.map(config => config.provider) || [];
  };

  const getAvailableProviders = () => {
    const usedProviders = getUsedProviders();
    return AI_PROVIDERS.filter(provider => !usedProviders.includes(provider.value));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              AI Provider Configurations
            </CardTitle>
            <CardDescription>
              Configure provider-specific limits and pricing for {planName}
            </CardDescription>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={getAvailableProviders().length === 0}>
                <Plus className="mr-2 h-4 w-4" />
                Add Provider
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Add AI Provider Configuration</DialogTitle>
                <DialogDescription>
                  Configure provider-specific settings for this plan.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="provider">AI Provider</Label>
                  <Select value={formData.provider} onValueChange={(value) => setFormData({ ...formData, provider: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an AI provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableProviders().map((provider) => (
                        <SelectItem key={provider.value} value={provider.value}>
                          <div className="flex items-center gap-2">
                            {provider.icon}
                            <span>{provider.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="tokensMonthlyLimit">Monthly Token Limit</Label>
                    <Input
                      id="tokensMonthlyLimit"
                      type="number"
                      min="0"
                      value={formData.tokensMonthlyLimit || ''}
                      onChange={(e) => setFormData({ ...formData, tokensMonthlyLimit: e.target.value ? parseInt(e.target.value) : null })}
                      placeholder="Leave empty for unlimited"
                    />
                  </div>
                  <div>
                    <Label htmlFor="tokensDailyLimit">Daily Token Limit</Label>
                    <Input
                      id="tokensDailyLimit"
                      type="number"
                      min="0"
                      value={formData.tokensDailyLimit || ''}
                      onChange={(e) => setFormData({ ...formData, tokensDailyLimit: e.target.value ? parseInt(e.target.value) : null })}
                      placeholder="Leave empty for unlimited"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="customPricingEnabled"
                    checked={formData.customPricingEnabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, customPricingEnabled: checked })}
                  />
                  <Label htmlFor="customPricingEnabled">Enable Custom Pricing</Label>
                </div>

                {formData.customPricingEnabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="inputTokenRate">Input Token Rate ($/token)</Label>
                      <Input
                        id="inputTokenRate"
                        type="number"
                        step="0.00000001"
                        min="0"
                        value={formData.inputTokenRate || ''}
                        onChange={(e) => setFormData({ ...formData, inputTokenRate: e.target.value || null })}
                        placeholder="0.00000000"
                      />
                    </div>
                    <div>
                      <Label htmlFor="outputTokenRate">Output Token Rate ($/token)</Label>
                      <Input
                        id="outputTokenRate"
                        type="number"
                        step="0.00000001"
                        min="0"
                        value={formData.outputTokenRate || ''}
                        onChange={(e) => setFormData({ ...formData, outputTokenRate: e.target.value || null })}
                        placeholder="0.00000000"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <Switch
                    id="enabled"
                    checked={formData.enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                  />
                  <Label htmlFor="enabled">Enable this provider</Label>
                </div>

                <div>
                  <Label htmlFor="priority">Priority (0 = highest)</Label>
                  <Input
                    id="priority"
                    type="number"
                    min="0"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateConfig}
                  disabled={createConfigMutation.isPending || !formData.provider}
                >
                  {createConfigMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Configuration
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit Dialog */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Edit AI Provider Configuration</DialogTitle>
                <DialogDescription>
                  Update provider-specific settings for {selectedConfig ? getProviderInfo(selectedConfig.provider).label : ''}.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-tokensMonthlyLimit">Monthly Token Limit</Label>
                    <Input
                      id="edit-tokensMonthlyLimit"
                      type="number"
                      min="0"
                      value={formData.tokensMonthlyLimit || ''}
                      onChange={(e) => setFormData({ ...formData, tokensMonthlyLimit: e.target.value ? parseInt(e.target.value) : null })}
                      placeholder="Leave empty for unlimited"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-tokensDailyLimit">Daily Token Limit</Label>
                    <Input
                      id="edit-tokensDailyLimit"
                      type="number"
                      min="0"
                      value={formData.tokensDailyLimit || ''}
                      onChange={(e) => setFormData({ ...formData, tokensDailyLimit: e.target.value ? parseInt(e.target.value) : null })}
                      placeholder="Leave empty for unlimited"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="edit-customPricingEnabled"
                    checked={formData.customPricingEnabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, customPricingEnabled: checked })}
                  />
                  <Label htmlFor="edit-customPricingEnabled">Enable Custom Pricing</Label>
                </div>

                {formData.customPricingEnabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="edit-inputTokenRate">Input Token Rate ($/token)</Label>
                      <Input
                        id="edit-inputTokenRate"
                        type="number"
                        step="0.00000001"
                        min="0"
                        value={formData.inputTokenRate || ''}
                        onChange={(e) => setFormData({ ...formData, inputTokenRate: e.target.value || null })}
                        placeholder="0.00000000"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-outputTokenRate">Output Token Rate ($/token)</Label>
                      <Input
                        id="edit-outputTokenRate"
                        type="number"
                        step="0.00000001"
                        min="0"
                        value={formData.outputTokenRate || ''}
                        onChange={(e) => setFormData({ ...formData, outputTokenRate: e.target.value || null })}
                        placeholder="0.00000000"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <Switch
                    id="edit-enabled"
                    checked={formData.enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                  />
                  <Label htmlFor="edit-enabled">Enable this provider</Label>
                </div>

                <div>
                  <Label htmlFor="edit-priority">Priority (0 = highest)</Label>
                  <Input
                    id="edit-priority"
                    type="number"
                    min="0"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdateConfig}
                  disabled={updateConfigMutation.isPending}
                >
                  {updateConfigMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update Configuration
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : configs?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No AI provider configurations found. Add a provider to get started.
          </div>
        ) : (
          <div className="space-y-4">
            {configs?.map((config) => {
              const providerInfo = getProviderInfo(config.provider);
              return (
                <div key={config.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <Badge className={providerInfo.color}>
                        <div className="flex items-center gap-1">
                          {providerInfo.icon}
                          <span>{providerInfo.label}</span>
                        </div>
                      </Badge>
                      {!config.enabled && (
                        <Badge variant="secondary">Disabled</Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditConfig(config)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteConfig(config.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Monthly Limit:</span>
                      <span className="ml-2 font-medium">
                        {config.tokensMonthlyLimit ? config.tokensMonthlyLimit.toLocaleString() : 'Unlimited'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Daily Limit:</span>
                      <span className="ml-2 font-medium">
                        {config.tokensDailyLimit ? config.tokensDailyLimit.toLocaleString() : 'Unlimited'}
                      </span>
                    </div>
                    {config.customPricingEnabled && (
                      <>
                        <div>
                          <span className="text-muted-foreground">Input Rate:</span>
                          <span className="ml-2 font-medium">
                            ${parseFloat(config.inputTokenRate || '0').toFixed(8)}/token
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Output Rate:</span>
                          <span className="ml-2 font-medium">
                            ${parseFloat(config.outputTokenRate || '0').toFixed(8)}/token
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
