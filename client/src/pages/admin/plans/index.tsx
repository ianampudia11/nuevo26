import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Check, Edit, Trash2, Bot, Zap, DollarSign, AlertTriangle, Settings, HardDrive } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PriceDisplay } from "@/components/ui/price-display";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import AiProviderConfigManager from "@/components/admin/AiProviderConfigManager";

interface Plan {
  id: number;
  name: string;
  description: string;
  price: number;
  maxUsers: number;
  maxContacts: number;
  maxChannels: number;
  maxFlows: number;
  maxCampaigns: number;
  maxCampaignRecipients: number;
  campaignFeatures: string[];
  isActive: boolean;
  isFree: boolean;
  hasTrialPeriod: boolean;
  trialDays: number;
  features: string[];

  aiTokensIncluded?: number;
  aiTokensMonthlyLimit?: number | null;
  aiTokensDailyLimit?: number | null;
  aiOverageEnabled?: boolean;
  aiOverageRate?: string;
  aiOverageBlockEnabled?: boolean;
  aiBillingEnabled?: boolean;

  discountType?: "none" | "percentage" | "fixed_amount";
  discountValue?: number;
  discountDuration?: "permanent" | "first_month" | "first_year" | "limited_time";
  discountStartDate?: string;
  discountEndDate?: string;
  originalPrice?: number;


  storageLimit?: number; // in MB
  bandwidthLimit?: number; // monthly bandwidth in MB
  fileUploadLimit?: number; // max file size per upload in MB
  totalFilesLimit?: number; // max number of files

  createdAt: string;
  updatedAt: string;
}


const formatPlanDuration = (billingInterval: string, customDurationDays?: number | null): string => {
  switch (billingInterval) {
    case 'lifetime':
      return 'Lifetime';
    case 'daily':
      return '24 hours';
    case 'weekly':
      return '7 days';
    case 'biweekly':
      return '14 days';
    case 'monthly':
      return '30 days';
    case 'quarterly':
      return '3 months';
    case 'semi_annual':
      return '6 months';
    case 'annual':
      return '12 months';
    case 'biennial':
      return '2 years';
    case 'custom':
      return customDurationDays ? `${customDurationDays} days` : 'Custom';

    case 'month':
      return '30 days';
    case 'quarter':
      return '3 months';
    case 'year':
      return '12 months';
    default:
      return '30 days';
  }
};

export default function PlansPage() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAiConfigDialogOpen, setIsAiConfigDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: 0,
    maxUsers: 5,
    maxContacts: 1000,
    maxChannels: 3,
    maxFlows: 1,
    maxCampaigns: 5,
    maxCampaignRecipients: 1000,
    campaignFeatures: ["basic_campaigns"],
    isActive: true,
    isFree: false,
    hasTrialPeriod: false,
    trialDays: 0,
    features: ["Basic chat", "Contact management", "1 flow"],

    aiTokensIncluded: 0,
    aiTokensMonthlyLimit: null as number | null,
    aiTokensDailyLimit: null as number | null,
    aiOverageEnabled: false,
    aiOverageRate: "0.000000",
    aiOverageBlockEnabled: false,
    aiBillingEnabled: false,


    discountType: "none" as "none" | "percentage" | "fixed_amount",
    discountValue: 0,
    discountDuration: "permanent" as "permanent" | "first_month" | "first_year" | "limited_time",
    discountStartDate: "",
    discountEndDate: "",
    originalPrice: undefined as number | undefined,


    storageLimit: 1024, // 1GB default
    bandwidthLimit: 10240, // 10GB default
    fileUploadLimit: 25, // 25MB default
    totalFilesLimit: 1000, // 1000 files default
    

    billingInterval: 'monthly' as 'lifetime' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'biennial' | 'custom',
    customDurationDays: null as number | null
  });

  useEffect(() => {
    if (!isLoading && user && !user.isSuperAdmin) {
      window.location.href = "/";
    }
  }, [user, isLoading]);

  const { data: plans, isLoading: isLoadingPlans } = useQuery<Plan[]>({
    queryKey: ['/api/admin/plans'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/plans");
      if (!res.ok) throw new Error("Failed to fetch plans");
      return res.json();
    },
    enabled: !!user?.isSuperAdmin
  });

  const createPlanMutation = useMutation({
    mutationFn: async (data: Omit<Plan, 'id' | 'createdAt' | 'updatedAt'>) => {
      const res = await apiRequest("POST", "/api/admin/plans", data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create plan");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plans'] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({
        title: "Plan Created",
        description: "The plan has been created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create plan",
        variant: "destructive",
      });
    }
  });

  const updatePlanMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: Partial<Plan> }) => {
      const res = await apiRequest("PUT", `/api/admin/plans/${id}`, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update plan");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plans'] });
      setIsEditDialogOpen(false);
      setSelectedPlan(null);
      toast({
        title: "Plan Updated",
        description: "The plan has been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update plan",
        variant: "destructive",
      });
    }
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/plans/${id}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete plan");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plans'] });
      toast({
        title: "Plan Deleted",
        description: "The plan has been deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete plan",
        variant: "destructive",
      });
    }
  });

  const handleCreatePlan = () => {
    createPlanMutation.mutate(formData);
  };

  const handleUpdatePlan = () => {
    if (!selectedPlan) return;
    updatePlanMutation.mutate({ id: selectedPlan.id, data: formData });
  };

  const handleDeletePlan = (id: number) => {
    deletePlanMutation.mutate(id);
  };

  const handleConfigureAiProviders = (plan: Plan) => {
    setSelectedPlan(plan);
    setIsAiConfigDialogOpen(true);
  };

  const handleEditPlan = (plan: Plan) => {
    setSelectedPlan(plan);
    setFormData({
      name: plan.name,
      description: plan.description,
      price: plan.price,
      maxUsers: plan.maxUsers,
      maxContacts: plan.maxContacts,
      maxChannels: plan.maxChannels,
      maxFlows: plan.maxFlows || 1,
      maxCampaigns: plan.maxCampaigns || 5,
      maxCampaignRecipients: plan.maxCampaignRecipients || 1000,
      campaignFeatures: [...(plan.campaignFeatures || ["basic_campaigns"])],
      isActive: plan.isActive,
      isFree: plan.isFree || false,
      hasTrialPeriod: plan.hasTrialPeriod || false,
      trialDays: plan.trialDays || 0,
      features: [...plan.features],

      aiTokensIncluded: plan.aiTokensIncluded || 0,
      aiTokensMonthlyLimit: plan.aiTokensMonthlyLimit || null,
      aiTokensDailyLimit: plan.aiTokensDailyLimit || null,
      aiOverageEnabled: plan.aiOverageEnabled || false,
      aiOverageRate: plan.aiOverageRate || "0.000000",
      aiOverageBlockEnabled: plan.aiOverageBlockEnabled || false,
      aiBillingEnabled: plan.aiBillingEnabled || false,


      discountType: (plan as any).discountType || "none",
      discountValue: (plan as any).discountValue || 0,
      discountDuration: (plan as any).discountDuration || "permanent",
      discountStartDate: (plan as any).discountStartDate ? new Date((plan as any).discountStartDate).toISOString().split('T')[0] : "",
      discountEndDate: (plan as any).discountEndDate ? new Date((plan as any).discountEndDate).toISOString().split('T')[0] : "",
      originalPrice: (plan as any).originalPrice || undefined,


      storageLimit: (plan as any).storageLimit || 1024,
      bandwidthLimit: (plan as any).bandwidthLimit || 10240,
      fileUploadLimit: (plan as any).fileUploadLimit || 25,
      totalFilesLimit: (plan as any).totalFilesLimit || 1000,
      

      billingInterval: (plan as any).billingInterval || 'monthly',
      customDurationDays: (plan as any).customDurationDays || null
    });
    setIsEditDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      price: 0,
      maxUsers: 5,
      maxContacts: 1000,
      maxChannels: 3,
      maxFlows: 1,
      maxCampaigns: 5,
      maxCampaignRecipients: 1000,
      campaignFeatures: ["basic_campaigns"],
      isActive: true,
      isFree: false,
      hasTrialPeriod: false,
      trialDays: 0,
      features: ["Basic chat", "Contact management", "1 flow"],

      aiTokensIncluded: 0,
      aiTokensMonthlyLimit: null,
      aiTokensDailyLimit: null,
      aiOverageEnabled: false,
      aiOverageRate: "0.000000",
      aiOverageBlockEnabled: false,
      aiBillingEnabled: false,


      discountType: "none",
      discountValue: 0,
      discountDuration: "permanent",
      discountStartDate: "",
      discountEndDate: "",
      originalPrice: undefined,


      storageLimit: 1024,
      bandwidthLimit: 10240,
      fileUploadLimit: 25,
      totalFilesLimit: 1000,
      

      billingInterval: 'monthly',
      customDurationDays: null
    });
  };

  const handleFeatureChange = (index: number, value: string) => {
    const newFeatures = [...formData.features];
    newFeatures[index] = value;
    setFormData({ ...formData, features: newFeatures });
  };

  const addFeature = () => {
    setFormData({ ...formData, features: [...formData.features, ""] });
  };

  const removeFeature = (index: number) => {
    const newFeatures = [...formData.features];
    newFeatures.splice(index, 1);
    setFormData({ ...formData, features: newFeatures });
  };

  const handleCampaignFeatureChange = (index: number, value: string) => {
    const newCampaignFeatures = [...formData.campaignFeatures];
    newCampaignFeatures[index] = value;
    setFormData({ ...formData, campaignFeatures: newCampaignFeatures });
  };

  const addCampaignFeature = () => {
    setFormData({ ...formData, campaignFeatures: [...formData.campaignFeatures, ""] });
  };

  const removeCampaignFeature = (index: number) => {
    const newCampaignFeatures = [...formData.campaignFeatures];
    newCampaignFeatures.splice(index, 1);
    setFormData({ ...formData, campaignFeatures: newCampaignFeatures });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user?.isSuperAdmin) {
    return null;
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl">Subscription Plans</h1>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="brand"
                className="btn-brand-primary"
              >
                <Plus className="mr-2 h-4 w-4" />
                New Plan
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>Create New Plan</DialogTitle>
                <DialogDescription>
                  Create a new subscription plan for your customers.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="sm:text-right">
                    Name
                  </Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="sm:col-span-3"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="description" className="sm:text-right">
                    Description
                  </Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="sm:col-span-3"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="price" className="sm:text-right">
                    Price ($)
                  </Label>
                  <Input
                    id="price"
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                    className="sm:col-span-3"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="maxUsers" className="sm:text-right">
                    Max Users
                  </Label>
                  <Input
                    id="maxUsers"
                    type="number"
                    value={formData.maxUsers}
                    onChange={(e) => setFormData({ ...formData, maxUsers: parseInt(e.target.value) })}
                    className="sm:col-span-3"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="maxContacts" className="sm:text-right">
                    Max Contacts
                  </Label>
                  <Input
                    id="maxContacts"
                    type="number"
                    value={formData.maxContacts}
                    onChange={(e) => setFormData({ ...formData, maxContacts: parseInt(e.target.value) })}
                    className="sm:col-span-3"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="maxChannels" className="sm:text-right">
                    Max Channels
                  </Label>
                  <Input
                    id="maxChannels"
                    type="number"
                    value={formData.maxChannels}
                    onChange={(e) => setFormData({ ...formData, maxChannels: parseInt(e.target.value) })}
                    className="sm:col-span-3"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="maxFlows" className="sm:text-right">
                    Max Flows
                  </Label>
                  <Input
                    id="maxFlows"
                    type="number"
                    value={formData.maxFlows}
                    onChange={(e) => setFormData({ ...formData, maxFlows: parseInt(e.target.value) })}
                    className="sm:col-span-3"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="maxCampaigns" className="sm:text-right">
                    Max Campaigns
                  </Label>
                  <Input
                    id="maxCampaigns"
                    type="number"
                    value={formData.maxCampaigns}
                    onChange={(e) => setFormData({ ...formData, maxCampaigns: parseInt(e.target.value) })}
                    className="sm:col-span-3"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="maxCampaignRecipients" className="sm:text-right">
                    Max Recipients
                  </Label>
                  <Input
                    id="maxCampaignRecipients"
                    type="number"
                    value={formData.maxCampaignRecipients}
                    onChange={(e) => setFormData({ ...formData, maxCampaignRecipients: parseInt(e.target.value) })}
                    className="sm:col-span-3"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="isActive" className="sm:text-right">
                    Active
                  </Label>
                  <div className="sm:col-span-3 flex items-center space-x-2">
                    <Switch
                      id="isActive"
                      checked={formData.isActive}
                      onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                    />
                    <Label htmlFor="isActive">{formData.isActive ? "Active" : "Inactive"}</Label>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="isFree" className="sm:text-right">
                    Free Plan
                  </Label>
                  <div className="sm:col-span-3 flex items-center space-x-2">
                    <Switch
                      id="isFree"
                      checked={formData.isFree}
                      onCheckedChange={(checked) => setFormData({ ...formData, isFree: checked })}
                    />
                    <Label htmlFor="isFree">{formData.isFree ? "Free" : "Paid"}</Label>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                  <Label htmlFor="hasTrialPeriod" className="sm:text-right">
                    Trial Period
                  </Label>
                  <div className="sm:col-span-3 flex items-center space-x-2">
                    <Switch
                      id="hasTrialPeriod"
                      checked={formData.hasTrialPeriod}
                      onCheckedChange={(checked) => setFormData({ ...formData, hasTrialPeriod: checked })}
                    />
                    <Label htmlFor="hasTrialPeriod">{formData.hasTrialPeriod ? "Has Trial" : "No Trial"}</Label>
                  </div>
                </div>
                {formData.hasTrialPeriod && (
                  <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                    <Label htmlFor="trialDays" className="sm:text-right">
                      Trial Days
                    </Label>
                    <Input
                      id="trialDays"
                      type="number"
                      min="1"
                      max="365"
                      value={formData.trialDays}
                      onChange={(e) => setFormData({ ...formData, trialDays: parseInt(e.target.value) || 0 })}
                      className="sm:col-span-3"
                      placeholder="Number of trial days (e.g., 7, 14, 30)"
                    />
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <Label className="sm:text-right pt-2">Features</Label>
                  <div className="sm:col-span-3 space-y-2">
                    {formData.features.map((feature, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={feature}
                          onChange={(e) => handleFeatureChange(index, e.target.value)}
                          placeholder="Feature description"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFeature(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="brand"
                      size="sm"
                      onClick={addFeature}
                      className="mt-2 border-primary/30 hover:border-primary"
                    >
                      Add Feature
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <Label className="sm:text-right pt-2">Campaign Features</Label>
                  <div className="sm:col-span-3 space-y-2">
                    {formData.campaignFeatures.map((feature, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={feature}
                          onChange={(e) => handleCampaignFeatureChange(index, e.target.value)}
                          placeholder="Campaign feature (e.g., basic_campaigns, templates, segments)"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeCampaignFeature(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="brand"
                      size="sm"
                      onClick={addCampaignFeature}
                      className="mt-2 border-primary/30 hover:border-primary"
                    >
                      Add Campaign Feature
                    </Button>
                  </div>
                </div>

                {/* AI Token Billing Configuration */}
                <div className="border-t pt-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Bot className="w-4 h-4 text-primary" />
                    <Label className="text-sm font-semibold text-gray-800">AI Token Billing</Label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                    <Label htmlFor="aiBillingEnabled" className="sm:text-right">
                      Enable AI Billing
                    </Label>
                    <div className="sm:col-span-3 flex items-center space-x-2">
                      <Switch
                        id="aiBillingEnabled"
                        checked={formData.aiBillingEnabled}
                        onCheckedChange={(checked) => setFormData({ ...formData, aiBillingEnabled: checked })}
                      />
                      <Label htmlFor="aiBillingEnabled">{formData.aiBillingEnabled ? "Enabled" : "Disabled"}</Label>
                    </div>
                  </div>

                  {formData.aiBillingEnabled && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                        <Label htmlFor="aiTokensIncluded" className="sm:text-right">
                          <div className="flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            Included Tokens
                          </div>
                        </Label>
                        <Input
                          id="aiTokensIncluded"
                          type="number"
                          min="0"
                          value={formData.aiTokensIncluded}
                          onChange={(e) => setFormData({ ...formData, aiTokensIncluded: parseInt(e.target.value) || 0 })}
                          className="sm:col-span-3"
                          placeholder="Number of tokens included in base price"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <div>
                          <Label htmlFor="aiTokensMonthlyLimit" className="text-xs font-medium text-gray-700">
                            Monthly Token Limit
                          </Label>
                          <Input
                            id="aiTokensMonthlyLimit"
                            type="number"
                            min="0"
                            value={formData.aiTokensMonthlyLimit || ''}
                            onChange={(e) => setFormData({ ...formData, aiTokensMonthlyLimit: e.target.value ? parseInt(e.target.value) : null })}
                            className="mt-1"
                            placeholder="Leave empty for unlimited"
                          />
                        </div>
                        <div>
                          <Label htmlFor="aiTokensDailyLimit" className="text-xs font-medium text-gray-700">
                            Daily Token Limit
                          </Label>
                          <Input
                            id="aiTokensDailyLimit"
                            type="number"
                            min="0"
                            value={formData.aiTokensDailyLimit || ''}
                            onChange={(e) => setFormData({ ...formData, aiTokensDailyLimit: e.target.value ? parseInt(e.target.value) : null })}
                            className="mt-1"
                            placeholder="Leave empty for unlimited"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                        <Label htmlFor="aiOverageEnabled" className="sm:text-right">
                          <div className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            Allow Overages
                          </div>
                        </Label>
                        <div className="sm:col-span-3 flex items-center space-x-2">
                          <Switch
                            id="aiOverageEnabled"
                            checked={formData.aiOverageEnabled}
                            onCheckedChange={(checked) => setFormData({ ...formData, aiOverageEnabled: checked })}
                          />
                          <Label htmlFor="aiOverageEnabled">{formData.aiOverageEnabled ? "Enabled" : "Disabled"}</Label>
                        </div>
                      </div>

                      {formData.aiOverageEnabled && (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                            <Label htmlFor="aiOverageRate" className="sm:text-right">
                              Overage Rate ($/token)
                            </Label>
                            <Input
                              id="aiOverageRate"
                              type="number"
                              step="0.000001"
                              min="0"
                              value={formData.aiOverageRate}
                              onChange={(e) => setFormData({ ...formData, aiOverageRate: e.target.value || "0.000000" })}
                              className="sm:col-span-3"
                              placeholder="Cost per token for usage beyond limits"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                            <Label htmlFor="aiOverageBlockEnabled" className="sm:text-right">
                              <div className="flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Block on Exceed
                              </div>
                            </Label>
                            <div className="sm:col-span-3 flex items-center space-x-2">
                              <Switch
                                id="aiOverageBlockEnabled"
                                checked={formData.aiOverageBlockEnabled}
                                onCheckedChange={(checked) => setFormData({ ...formData, aiOverageBlockEnabled: checked })}
                              />
                              <Label htmlFor="aiOverageBlockEnabled">
                                {formData.aiOverageBlockEnabled ? "Block usage when limits exceeded" : "Allow usage with overage charges"}
                              </Label>
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {/* Plan Duration Section */}
                  <div className="border-t pt-6 mt-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Settings className="w-4 h-4 text-primary" />
                      <Label className="text-sm font-semibold text-gray-800">Plan Duration</Label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                      <Label htmlFor="billingInterval" className="sm:text-right">
                        Duration Type
                      </Label>
                      <div className="sm:col-span-3">
                        <Select
                          value={formData.billingInterval}
                          onValueChange={(value: any) => setFormData({ ...formData, billingInterval: value, customDurationDays: value === 'custom' ? formData.customDurationDays : null })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select duration type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="lifetime">One-time payment / Lifetime</SelectItem>
                            <SelectItem value="daily">Daily (24 hours)</SelectItem>
                            <SelectItem value="weekly">Weekly (7 days)</SelectItem>
                            <SelectItem value="biweekly">Bi-weekly (14 days)</SelectItem>
                            <SelectItem value="monthly">Monthly (30 days)</SelectItem>
                            <SelectItem value="quarterly">Quarterly (3 months)</SelectItem>
                            <SelectItem value="semi_annual">Semi-annual (6 months)</SelectItem>
                            <SelectItem value="annual">Annual (12 months)</SelectItem>
                            <SelectItem value="biennial">Biennial (2 years)</SelectItem>
                            <SelectItem value="custom">Custom duration</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {formData.billingInterval === 'custom' && (
                      <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                        <Label htmlFor="customDurationDays" className="sm:text-right">
                          Custom Days
                        </Label>
                        <div className="sm:col-span-3">
                          <Input
                            id="customDurationDays"
                            type="number"
                            min="1"
                            value={formData.customDurationDays || ''}
                            onChange={(e) => setFormData({ ...formData, customDurationDays: parseInt(e.target.value) || null })}
                            placeholder="Enter number of days"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Enter the number of days for this plan duration
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Storage & Data Limits Section */}
                  <div className="border-t pt-6 mt-6">
                    <div className="flex items-center gap-2 mb-4">
                      <HardDrive className="w-4 h-4 text-primary" />
                      <Label className="text-sm font-semibold text-gray-800">Storage & Data Limits</Label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                      <Label htmlFor="storageLimit" className="sm:text-right">
                        Storage Limit (MB)
                      </Label>
                      <div className="sm:col-span-3">
                        <Input
                          id="storageLimit"
                          type="number"
                          min="0"
                          value={formData.storageLimit}
                          onChange={(e) => setFormData({ ...formData, storageLimit: parseInt(e.target.value) || 0 })}
                          placeholder="1024"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {formData.storageLimit ? `${(formData.storageLimit / 1024).toFixed(2)} GB` : '0 GB'}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                      <Label htmlFor="bandwidthLimit" className="sm:text-right">
                        Monthly Bandwidth (MB)
                      </Label>
                      <div className="sm:col-span-3">
                        <Input
                          id="bandwidthLimit"
                          type="number"
                          min="0"
                          value={formData.bandwidthLimit}
                          onChange={(e) => setFormData({ ...formData, bandwidthLimit: parseInt(e.target.value) || 0 })}
                          placeholder="10240"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {formData.bandwidthLimit ? `${(formData.bandwidthLimit / 1024).toFixed(2)} GB` : '0 GB'}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                      <Label htmlFor="fileUploadLimit" className="sm:text-right">
                        Max File Upload (MB)
                      </Label>
                      <div className="sm:col-span-3">
                        <Input
                          id="fileUploadLimit"
                          type="number"
                          min="0"
                          value={formData.fileUploadLimit}
                          onChange={(e) => setFormData({ ...formData, fileUploadLimit: parseInt(e.target.value) || 0 })}
                          placeholder="25"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                      <Label htmlFor="totalFilesLimit" className="sm:text-right">
                        Total Files Limit
                      </Label>
                      <div className="sm:col-span-3">
                        <Input
                          id="totalFilesLimit"
                          type="number"
                          min="0"
                          value={formData.totalFilesLimit}
                          onChange={(e) => setFormData({ ...formData, totalFilesLimit: parseInt(e.target.value) || 0 })}
                          placeholder="1000"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Plan Discount Section */}
                  <div className="border-t pt-6 mt-6">
                    <div className="flex items-center gap-2 mb-4">
                      <DollarSign className="w-4 h-4 text-primary" />
                      <Label className="text-sm font-semibold text-gray-800">Plan Discount</Label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                      <Label htmlFor="discountType" className="sm:text-right">
                        Discount Type
                      </Label>
                      <div className="sm:col-span-3">
                        <select
                          id="discountType"
                          value={formData.discountType}
                          onChange={(e) => setFormData({ ...formData, discountType: e.target.value as any })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        >
                          <option value="none">No Discount</option>
                          <option value="percentage">Percentage Discount</option>
                          <option value="fixed_amount">Fixed Amount Discount</option>
                        </select>
                      </div>
                    </div>

                    {formData.discountType !== "none" && (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                          <Label htmlFor="discountValue" className="sm:text-right">
                            Discount Value
                          </Label>
                          <div className="sm:col-span-3">
                            <div className="relative">
                              {formData.discountType === "percentage" && (
                                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                              )}
                              {formData.discountType === "fixed_amount" && (
                                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                              )}
                              <Input
                                id="discountValue"
                                type="number"
                                min="0"
                                max={formData.discountType === "percentage" ? "100" : undefined}
                                step={formData.discountType === "percentage" ? "1" : "0.01"}
                                value={formData.discountValue}
                                onChange={(e) => setFormData({ ...formData, discountValue: parseFloat(e.target.value) || 0 })}
                                className={formData.discountType === "fixed_amount" ? "pl-8" : "pr-8"}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                          <Label htmlFor="discountDuration" className="sm:text-right">
                            Duration
                          </Label>
                          <div className="sm:col-span-3">
                            <select
                              id="discountDuration"
                              value={formData.discountDuration}
                              onChange={(e) => setFormData({ ...formData, discountDuration: e.target.value as any })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            >
                              <option value="permanent">Permanent</option>
                              <option value="first_month">First Month Only</option>
                              <option value="first_year">First Year Only</option>
                              <option value="limited_time">Limited Time</option>
                            </select>
                          </div>
                        </div>

                        {formData.discountDuration === "limited_time" && (
                          <>
                            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                              <Label htmlFor="discountStartDate" className="sm:text-right">
                                Start Date
                              </Label>
                              <div className="sm:col-span-3">
                                <Input
                                  id="discountStartDate"
                                  type="date"
                                  value={formData.discountStartDate}
                                  onChange={(e) => setFormData({ ...formData, discountStartDate: e.target.value })}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                              <Label htmlFor="discountEndDate" className="sm:text-right">
                                End Date
                              </Label>
                              <div className="sm:col-span-3">
                                <Input
                                  id="discountEndDate"
                                  type="date"
                                  value={formData.discountEndDate}
                                  onChange={(e) => setFormData({ ...formData, discountEndDate: e.target.value })}
                                />
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreatePlan}
                  disabled={createPlanMutation.isPending}
                  variant="brand"
                  className="btn-brand-primary"
                >
                  {createPlanMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Plan"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoadingPlans ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : plans?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No plans found. Create your first plan to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans?.map((plan) => (
              <Card
                key={plan.id}
                className={`overflow-hidden border-2 ${!plan.isActive ? "opacity-60" : "border-primary/20 hover:border-primary/50 transition-all"}`}
              >
                {!plan.isActive && (
                  <div className="bg-muted/80 text-muted-foreground text-xs font-medium py-1 px-3 text-center">
                    Inactive Plan
                  </div>
                )}
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl">{plan.name}</CardTitle>
                      <CardDescription className="mt-1">{plan.description}</CardDescription>
                      <div className="flex gap-2 mt-2">
                        {plan.isFree && (
                          <span className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 text-xs font-medium py-1 px-2 rounded-full">
                            Free
                          </span>
                        )}
                        {plan.hasTrialPeriod && plan.trialDays > 0 && (
                          <span className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 text-xs font-medium py-1 px-2 rounded-full">
                            {plan.trialDays} day trial
                          </span>
                        )}
                      </div>
                    </div>
                    {plan.isActive && (
                      <div className="bg-primary/10 text-secondry text-xs font-medium py-1 px-3 rounded-full">
                        Active
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pb-6">
                  <div className="mb-6">
                    <PriceDisplay
                      plan={plan}
                      size="lg"
                      showDiscountBadge={true}
                      showSavings={true}
                      layout="vertical"
                    />
                    <div className="text-center mt-2">
                      <span className="text-sm text-muted-foreground">
                        Duration: {formatPlanDuration((plan as any).billingInterval || 'monthly', (plan as any).customDurationDays)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-muted/30 p-3 rounded-lg text-center">
                      <div className="text-lg font-semibold">{plan.maxUsers}</div>
                      <div className="text-xs text-muted-foreground">Users</div>
                    </div>
                    <div className="bg-muted/30 p-3 rounded-lg text-center">
                      <div className="text-lg font-semibold">{plan.maxContacts.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">Contacts</div>
                    </div>
                    <div className="bg-muted/30 p-3 rounded-lg text-center">
                      <div className="text-lg font-semibold">{plan.maxChannels}</div>
                      <div className="text-xs text-muted-foreground">Channels</div>
                    </div>
                    <div className="bg-muted/30 p-3 rounded-lg text-center">
                      <div className="text-lg font-semibold">{plan.maxFlows}</div>
                      <div className="text-xs text-muted-foreground">Flows</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-primary/10 p-3 rounded-lg text-center">
                      <div className="text-lg font-semibold">{plan.maxCampaigns || 0}</div>
                      <div className="text-xs text-muted-foreground">Campaigns</div>
                    </div>
                    <div className="bg-primary/10 p-3 rounded-lg text-center">
                      <div className="text-lg font-semibold">{(plan.maxCampaignRecipients || 0).toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">Recipients</div>
                    </div>
                  </div>

                  {/* Storage & Data Limits */}
                  <div className="bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-lg mb-6 border border-green-200">
                    <div className="flex items-center gap-2 mb-3">
                      <HardDrive className="w-4 h-4 text-green-600" />
                      <h4 className="font-medium text-sm text-green-800">Storage & Data Limits</h4>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="bg-white/60 p-2 rounded text-center">
                        <div className="text-sm font-semibold text-green-700">
                          {plan.storageLimit ? `${(plan.storageLimit / 1024).toFixed(1)} GB` : '1 GB'}
                        </div>
                        <div className="text-xs text-green-600">Storage</div>
                      </div>
                      <div className="bg-white/60 p-2 rounded text-center">
                        <div className="text-sm font-semibold text-green-700">
                          {plan.bandwidthLimit ? `${(plan.bandwidthLimit / 1024).toFixed(1)} GB` : '10 GB'}
                        </div>
                        <div className="text-xs text-green-600">Bandwidth/Month</div>
                      </div>
                      <div className="bg-white/60 p-2 rounded text-center">
                        <div className="text-sm font-semibold text-green-700">
                          {plan.fileUploadLimit || 25} MB
                        </div>
                        <div className="text-xs text-green-600">Max File Size</div>
                      </div>
                      <div className="bg-white/60 p-2 rounded text-center">
                        <div className="text-sm font-semibold text-green-700">
                          {(plan.totalFilesLimit || 1000).toLocaleString()}
                        </div>
                        <div className="text-xs text-green-600">Total Files</div>
                      </div>
                    </div>
                  </div>

                  {/* AI Token Billing Information */}
                  {plan.aiBillingEnabled && (
                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg mb-6 border border-blue-200">
                      <div className="flex items-center gap-2 mb-3">
                        <Bot className="w-4 h-4 text-blue-600" />
                        <h4 className="font-medium text-sm text-blue-800">AI Token Billing</h4>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="bg-white/60 p-2 rounded text-center">
                          <div className="text-sm font-semibold text-blue-700">
                            {plan.aiTokensIncluded?.toLocaleString() || 0}
                          </div>
                          <div className="text-xs text-blue-600">Included Tokens</div>
                        </div>
                        <div className="bg-white/60 p-2 rounded text-center">
                          <div className="text-sm font-semibold text-blue-700">
                            {plan.aiTokensMonthlyLimit ? plan.aiTokensMonthlyLimit.toLocaleString() : '∞'}
                          </div>
                          <div className="text-xs text-blue-600">Monthly Limit</div>
                        </div>
                      </div>

                      {plan.aiOverageEnabled && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-blue-600">Overage Rate:</span>
                          <span className="font-medium text-blue-700">
                            ${parseFloat(plan.aiOverageRate || "0").toFixed(6)}/token
                          </span>
                        </div>
                      )}

                      {plan.aiOverageBlockEnabled && (
                        <div className="flex items-center gap-1 mt-2">
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                          <span className="text-xs text-amber-600">Usage blocked when limits exceeded</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-3 text-sm text-muted-foreground uppercase tracking-wide">Features</h4>
                      <ul className="space-y-2">
                        {plan.features.map((feature, index) => (
                          <li key={index} className="flex items-start">
                            <Check className="h-4 w-4 text-green-500 mr-2 mt-1 flex-shrink-0" />
                            <span className="text-sm">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {plan.campaignFeatures && plan.campaignFeatures.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-3 text-sm text-muted-foreground uppercase tracking-wide">Campaign Features</h4>
                        <ul className="space-y-2">
                          {plan.campaignFeatures.map((feature, index) => (
                            <li key={index} className="flex items-start">
                              <Check className="h-4 w-4 text-blue-500 mr-2 mt-1 flex-shrink-0" />
                              <span className="text-sm capitalize">{feature.replace(/_/g, ' ')}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between bg-muted/20 pt-4 pb-4">
                  <div className="flex gap-2">
                    <Button
                      variant="brand"
                      size="sm"
                      onClick={() => handleEditPlan(plan)}
                      className="border-primary/30 hover:border-primary"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    {plan.aiBillingEnabled && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleConfigureAiProviders(plan)}
                        className="border-blue-200 hover:border-blue-400 text-blue-700 hover:text-blue-800"
                      >
                        <Settings className="h-4 w-4 mr-2" />
                        AI Config
                      </Button>
                    )}
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="max-w-md max-h-[90vh]">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete the
                          plan and remove it from our servers.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="mt-4">
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDeletePlan(plan.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Edit Plan</DialogTitle>
            <DialogDescription>
              Update the subscription plan details.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-name" className="sm:text-right">
                Name
              </Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="sm:col-span-3"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-description" className="sm:text-right">
                Description
              </Label>
              <Input
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="sm:col-span-3"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-price" className="sm:text-right">
                Price ($)
              </Label>
              <Input
                id="edit-price"
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                className="sm:col-span-3"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-maxUsers" className="sm:text-right">
                Max Users
              </Label>
              <Input
                id="edit-maxUsers"
                type="number"
                value={formData.maxUsers}
                onChange={(e) => setFormData({ ...formData, maxUsers: parseInt(e.target.value) })}
                className="sm:col-span-3"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-maxContacts" className="sm:text-right">
                Max Contacts
              </Label>
              <Input
                id="edit-maxContacts"
                type="number"
                value={formData.maxContacts}
                onChange={(e) => setFormData({ ...formData, maxContacts: parseInt(e.target.value) })}
                className="sm:col-span-3"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-maxChannels" className="sm:text-right">
                Max Channels
              </Label>
              <Input
                id="edit-maxChannels"
                type="number"
                value={formData.maxChannels}
                onChange={(e) => setFormData({ ...formData, maxChannels: parseInt(e.target.value) })}
                className="sm:col-span-3"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-maxFlows" className="sm:text-right">
                Max Flows
              </Label>
              <Input
                id="edit-maxFlows"
                type="number"
                value={formData.maxFlows}
                onChange={(e) => setFormData({ ...formData, maxFlows: parseInt(e.target.value) })}
                className="sm:col-span-3"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-maxCampaigns" className="sm:text-right">
                Max Campaigns
              </Label>
              <Input
                id="edit-maxCampaigns"
                type="number"
                value={formData.maxCampaigns}
                onChange={(e) => setFormData({ ...formData, maxCampaigns: parseInt(e.target.value) })}
                className="sm:col-span-3"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-maxCampaignRecipients" className="sm:text-right">
                Max Recipients
              </Label>
              <Input
                id="edit-maxCampaignRecipients"
                type="number"
                value={formData.maxCampaignRecipients}
                onChange={(e) => setFormData({ ...formData, maxCampaignRecipients: parseInt(e.target.value) })}
                className="sm:col-span-3"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-isActive" className="sm:text-right">
                Active
              </Label>
              <div className="sm:col-span-3 flex items-center space-x-2">
                <Switch
                  id="edit-isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
                <Label htmlFor="edit-isActive">{formData.isActive ? "Active" : "Inactive"}</Label>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-isFree" className="sm:text-right">
                Free Plan
              </Label>
              <div className="sm:col-span-3 flex items-center space-x-2">
                <Switch
                  id="edit-isFree"
                  checked={formData.isFree}
                  onCheckedChange={(checked) => setFormData({ ...formData, isFree: checked })}
                />
                <Label htmlFor="edit-isFree">{formData.isFree ? "Free" : "Paid"}</Label>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-hasTrialPeriod" className="sm:text-right">
                Trial Period
              </Label>
              <div className="sm:col-span-3 flex items-center space-x-2">
                <Switch
                  id="edit-hasTrialPeriod"
                  checked={formData.hasTrialPeriod}
                  onCheckedChange={(checked) => setFormData({ ...formData, hasTrialPeriod: checked })}
                />
                <Label htmlFor="edit-hasTrialPeriod">{formData.hasTrialPeriod ? "Has Trial" : "No Trial"}</Label>
              </div>
            </div>
            {formData.hasTrialPeriod && (
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-trialDays" className="sm:text-right">
                  Trial Days
                </Label>
                <Input
                  id="edit-trialDays"
                  type="number"
                  min="1"
                  max="365"
                  value={formData.trialDays}
                  onChange={(e) => setFormData({ ...formData, trialDays: parseInt(e.target.value) || 0 })}
                  className="sm:col-span-3"
                  placeholder="Number of trial days (e.g., 7, 14, 30)"
                />
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <Label className="sm:text-right pt-2">Features</Label>
              <div className="sm:col-span-3 space-y-2">
                {formData.features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={feature}
                      onChange={(e) => handleFeatureChange(index, e.target.value)}
                      placeholder="Feature description"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFeature(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="brand"
                  size="sm"
                  onClick={addFeature}
                  className="mt-2 border-primary/30 hover:border-primary"
                >
                  Add Feature
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <Label className="sm:text-right pt-2">Campaign Features</Label>
              <div className="sm:col-span-3 space-y-2">
                {formData.campaignFeatures.map((feature, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={feature}
                      onChange={(e) => handleCampaignFeatureChange(index, e.target.value)}
                      placeholder="Campaign feature (e.g., basic_campaigns, templates, segments)"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCampaignFeature(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="brand"
                  size="sm"
                  onClick={addCampaignFeature}
                  className="mt-2 border-primary/30 hover:border-primary"
                >
                  Add Campaign Feature
                </Button>
              </div>
            </div>

            {/* AI Token Billing Configuration */}
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-4">
                <Bot className="w-4 h-4 text-primary" />
                <Label className="text-sm font-semibold text-gray-800">AI Token Billing</Label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                <Label htmlFor="edit-aiBillingEnabled" className="sm:text-right">
                  Enable AI Billing
                </Label>
                <div className="sm:col-span-3 flex items-center space-x-2">
                  <Switch
                    id="edit-aiBillingEnabled"
                    checked={formData.aiBillingEnabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, aiBillingEnabled: checked })}
                  />
                  <Label htmlFor="edit-aiBillingEnabled">{formData.aiBillingEnabled ? "Enabled" : "Disabled"}</Label>
                </div>
              </div>

              {formData.aiBillingEnabled && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                    <Label htmlFor="edit-aiTokensIncluded" className="sm:text-right">
                      <div className="flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        Included Tokens
                      </div>
                    </Label>
                    <Input
                      id="edit-aiTokensIncluded"
                      type="number"
                      min="0"
                      value={formData.aiTokensIncluded}
                      onChange={(e) => setFormData({ ...formData, aiTokensIncluded: parseInt(e.target.value) || 0 })}
                      className="sm:col-span-3"
                      placeholder="Number of tokens included in base price"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <Label htmlFor="edit-aiTokensMonthlyLimit" className="text-xs font-medium text-gray-700">
                        Monthly Token Limit
                      </Label>
                      <Input
                        id="edit-aiTokensMonthlyLimit"
                        type="number"
                        min="0"
                        value={formData.aiTokensMonthlyLimit || ''}
                        onChange={(e) => setFormData({ ...formData, aiTokensMonthlyLimit: e.target.value ? parseInt(e.target.value) : null })}
                        className="mt-1"
                        placeholder="Leave empty for unlimited"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-aiTokensDailyLimit" className="text-xs font-medium text-gray-700">
                        Daily Token Limit
                      </Label>
                      <Input
                        id="edit-aiTokensDailyLimit"
                        type="number"
                        min="0"
                        value={formData.aiTokensDailyLimit || ''}
                        onChange={(e) => setFormData({ ...formData, aiTokensDailyLimit: e.target.value ? parseInt(e.target.value) : null })}
                        className="mt-1"
                        placeholder="Leave empty for unlimited"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                    <Label htmlFor="edit-aiOverageEnabled" className="sm:text-right">
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        Allow Overages
                      </div>
                    </Label>
                    <div className="sm:col-span-3 flex items-center space-x-2">
                      <Switch
                        id="edit-aiOverageEnabled"
                        checked={formData.aiOverageEnabled}
                        onCheckedChange={(checked) => setFormData({ ...formData, aiOverageEnabled: checked })}
                      />
                      <Label htmlFor="edit-aiOverageEnabled">{formData.aiOverageEnabled ? "Enabled" : "Disabled"}</Label>
                    </div>
                  </div>

                  {formData.aiOverageEnabled && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                        <Label htmlFor="edit-aiOverageRate" className="sm:text-right">
                          Overage Rate ($/token)
                        </Label>
                        <Input
                          id="edit-aiOverageRate"
                          type="number"
                          step="0.000001"
                          min="0"
                          value={formData.aiOverageRate}
                          onChange={(e) => setFormData({ ...formData, aiOverageRate: e.target.value || "0.000000" })}
                          className="sm:col-span-3"
                          placeholder="Cost per token for usage beyond limits"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                        <Label htmlFor="edit-aiOverageBlockEnabled" className="sm:text-right">
                          <div className="flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Block on Exceed
                          </div>
                        </Label>
                        <div className="sm:col-span-3 flex items-center space-x-2">
                          <Switch
                            id="edit-aiOverageBlockEnabled"
                            checked={formData.aiOverageBlockEnabled}
                            onCheckedChange={(checked) => setFormData({ ...formData, aiOverageBlockEnabled: checked })}
                          />
                          <Label htmlFor="edit-aiOverageBlockEnabled">
                            {formData.aiOverageBlockEnabled ? "Block usage when limits exceeded" : "Allow usage with overage charges"}
                          </Label>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Plan Duration Section */}
              <div className="border-t pt-6 mt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Settings className="w-4 h-4 text-primary" />
                  <Label className="text-sm font-semibold text-gray-800">Plan Duration</Label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                  <Label htmlFor="edit-billingInterval" className="sm:text-right">
                    Duration Type
                  </Label>
                  <div className="sm:col-span-3">
                    <Select
                      value={formData.billingInterval}
                      onValueChange={(value: any) => setFormData({ ...formData, billingInterval: value, customDurationDays: value === 'custom' ? formData.customDurationDays : null })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select duration type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lifetime">One-time payment / Lifetime</SelectItem>
                        <SelectItem value="daily">Daily (24 hours)</SelectItem>
                        <SelectItem value="weekly">Weekly (7 days)</SelectItem>
                        <SelectItem value="biweekly">Bi-weekly (14 days)</SelectItem>
                        <SelectItem value="monthly">Monthly (30 days)</SelectItem>
                        <SelectItem value="quarterly">Quarterly (3 months)</SelectItem>
                        <SelectItem value="semi_annual">Semi-annual (6 months)</SelectItem>
                        <SelectItem value="annual">Annual (12 months)</SelectItem>
                        <SelectItem value="biennial">Biennial (2 years)</SelectItem>
                        <SelectItem value="custom">Custom duration</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {formData.billingInterval === 'custom' && (
                  <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                    <Label htmlFor="edit-customDurationDays" className="sm:text-right">
                      Custom Days
                    </Label>
                    <div className="sm:col-span-3">
                      <Input
                        id="edit-customDurationDays"
                        type="number"
                        min="1"
                        value={formData.customDurationDays || ''}
                        onChange={(e) => setFormData({ ...formData, customDurationDays: parseInt(e.target.value) || null })}
                        placeholder="Enter number of days"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Enter the number of days for this plan duration
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Storage & Data Limits Section */}
              <div className="border-t pt-6 mt-6">
                <div className="flex items-center gap-2 mb-4">
                  <HardDrive className="w-4 h-4 text-primary" />
                  <Label className="text-sm font-semibold text-gray-800">Storage & Data Limits</Label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                  <Label htmlFor="edit-storageLimit" className="sm:text-right">
                    Storage Limit (MB)
                  </Label>
                  <div className="sm:col-span-3">
                    <Input
                      id="edit-storageLimit"
                      type="number"
                      min="0"
                      value={formData.storageLimit}
                      onChange={(e) => setFormData({ ...formData, storageLimit: parseInt(e.target.value) || 0 })}
                      placeholder="1024"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {formData.storageLimit ? `${(formData.storageLimit / 1024).toFixed(2)} GB` : '0 GB'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                  <Label htmlFor="edit-bandwidthLimit" className="sm:text-right">
                    Monthly Bandwidth (MB)
                  </Label>
                  <div className="sm:col-span-3">
                    <Input
                      id="edit-bandwidthLimit"
                      type="number"
                      min="0"
                      value={formData.bandwidthLimit}
                      onChange={(e) => setFormData({ ...formData, bandwidthLimit: parseInt(e.target.value) || 0 })}
                      placeholder="10240"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {formData.bandwidthLimit ? `${(formData.bandwidthLimit / 1024).toFixed(2)} GB` : '0 GB'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                  <Label htmlFor="edit-fileUploadLimit" className="sm:text-right">
                    Max File Upload (MB)
                  </Label>
                  <div className="sm:col-span-3">
                    <Input
                      id="edit-fileUploadLimit"
                      type="number"
                      min="0"
                      value={formData.fileUploadLimit}
                      onChange={(e) => setFormData({ ...formData, fileUploadLimit: parseInt(e.target.value) || 0 })}
                      placeholder="25"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                  <Label htmlFor="edit-totalFilesLimit" className="sm:text-right">
                    Total Files Limit
                  </Label>
                  <div className="sm:col-span-3">
                    <Input
                      id="edit-totalFilesLimit"
                      type="number"
                      min="0"
                      value={formData.totalFilesLimit}
                      onChange={(e) => setFormData({ ...formData, totalFilesLimit: parseInt(e.target.value) || 0 })}
                      placeholder="1000"
                    />
                  </div>
                </div>
              </div>

              {/* Plan Discount Section */}
              <div className="border-t pt-6 mt-6">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign className="w-4 h-4 text-primary" />
                  <Label className="text-sm font-semibold text-gray-800">Plan Discount</Label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                  <Label htmlFor="edit-discountType" className="sm:text-right">
                    Discount Type
                  </Label>
                  <div className="sm:col-span-3">
                    <select
                      id="edit-discountType"
                      value={formData.discountType}
                      onChange={(e) => setFormData({ ...formData, discountType: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                      <option value="none">No Discount</option>
                      <option value="percentage">Percentage Discount</option>
                      <option value="fixed_amount">Fixed Amount Discount</option>
                    </select>
                  </div>
                </div>

                {formData.discountType !== "none" && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                      <Label htmlFor="edit-discountValue" className="sm:text-right">
                        Discount Value
                      </Label>
                      <div className="sm:col-span-3">
                        <div className="relative">
                          {formData.discountType === "percentage" && (
                            <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                          )}
                          {formData.discountType === "fixed_amount" && (
                            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                          )}
                          <Input
                            id="edit-discountValue"
                            type="number"
                            min="0"
                            max={formData.discountType === "percentage" ? "100" : undefined}
                            step={formData.discountType === "percentage" ? "1" : "0.01"}
                            value={formData.discountValue}
                            onChange={(e) => setFormData({ ...formData, discountValue: parseFloat(e.target.value) || 0 })}
                            className={formData.discountType === "fixed_amount" ? "pl-8" : "pr-8"}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                      <Label htmlFor="edit-discountDuration" className="sm:text-right">
                        Duration
                      </Label>
                      <div className="sm:col-span-3">
                        <select
                          id="edit-discountDuration"
                          value={formData.discountDuration}
                          onChange={(e) => setFormData({ ...formData, discountDuration: e.target.value as any })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        >
                          <option value="permanent">Permanent</option>
                          <option value="first_month">First Month Only</option>
                          <option value="first_year">First Year Only</option>
                          <option value="limited_time">Limited Time</option>
                        </select>
                      </div>
                    </div>

                    {formData.discountDuration === "limited_time" && (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                          <Label htmlFor="edit-discountStartDate" className="sm:text-right">
                            Start Date
                          </Label>
                          <div className="sm:col-span-3">
                            <Input
                              id="edit-discountStartDate"
                              type="date"
                              value={formData.discountStartDate}
                              onChange={(e) => setFormData({ ...formData, discountStartDate: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                          <Label htmlFor="edit-discountEndDate" className="sm:text-right">
                            End Date
                          </Label>
                          <div className="sm:col-span-3">
                            <Input
                              id="edit-discountEndDate"
                              type="date"
                              value={formData.discountEndDate}
                              onChange={(e) => setFormData({ ...formData, discountEndDate: e.target.value })}
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdatePlan}
              disabled={updatePlanMutation.isPending}
              variant="brand"
              className="btn-brand-primary"
            >
              {updatePlanMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Plan"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Provider Configuration Dialog */}
      <Dialog open={isAiConfigDialogOpen} onOpenChange={setIsAiConfigDialogOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI Provider Configuration</DialogTitle>
            <DialogDescription>
              Configure AI provider-specific settings for {selectedPlan?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {selectedPlan && (
              <AiProviderConfigManager
                planId={selectedPlan.id}
                planName={selectedPlan.name}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAiConfigDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
