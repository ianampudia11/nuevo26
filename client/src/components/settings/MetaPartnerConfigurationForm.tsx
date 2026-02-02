import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, TestTube, CheckCircle, AlertCircle, Copy, RefreshCw, ChevronDown, ChevronUp, ExternalLink, Activity } from 'lucide-react';
import { MetaWhatsAppIntegratedOnboarding } from './MetaWhatsAppIntegratedOnboarding';
import { MetaConfigurationStatusDashboard } from './MetaConfigurationStatusDashboard';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface MetaPartnerConfigFormData {
  appId: string;
  appSecret: string;
  businessManagerId: string;
  webhookVerifyToken: string;
  accessToken: string;
  configId: string;
  webhookUrl: string;
  companyName: string;
  logoUrl: string;
}

interface ValidationErrors {
  appId?: string;
  businessManagerId?: string;
  configId?: string;
  webhookUrl?: string;
}

export function MetaPartnerConfigurationForm({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [existingConfig, setExistingConfig] = useState<any>(null);
  const [showTestOnboarding, setShowTestOnboarding] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showStatusDashboard, setShowStatusDashboard] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [configStatus, setConfigStatus] = useState<any>(null);

  const [formData, setFormData] = useState<MetaPartnerConfigFormData>({
    appId: '',
    appSecret: '',
    businessManagerId: '',
    webhookVerifyToken: '',
    accessToken: '',
    configId: '',
    webhookUrl: '',
    companyName: '',
    logoUrl: ''
  });

  useEffect(() => {
    if (isOpen) {
      loadExistingConfiguration();
      loadConfigurationStatus();
    }
  }, [isOpen]);


  useEffect(() => {
    if (isOpen && !formData.webhookUrl) {
      const webhookUrl = `${window.location.origin}/api/webhooks/meta-whatsapp`;
      setFormData(prev => ({ ...prev, webhookUrl }));
    }
  }, [isOpen]);

  const loadExistingConfiguration = async () => {
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/admin/partner-configurations/meta');
      
      if (response.ok) {
        const config = await response.json();
        setExistingConfig(config);
        
        const loadedWebhookUrl = config.partnerWebhookUrl || `${window.location.origin}/api/webhooks/meta-whatsapp`;
        
        
        setFormData({
          appId: config.partnerApiKey || '',
          appSecret: config.partnerSecret || '',
          businessManagerId: config.partnerId || '',
          webhookVerifyToken: config.webhookVerifyToken || '',
          accessToken: config.accessToken || '',
          configId: config.configId || '',
          webhookUrl: loadedWebhookUrl,
          companyName: config.publicProfile?.companyName || '',
          logoUrl: config.publicProfile?.logoUrl || ''
        });
      } else if (response.status !== 404) {
        throw new Error('Failed to load configuration');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load existing configuration",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadConfigurationStatus = async () => {
    try {
      const response = await fetch('/api/admin/partner-configurations/meta/health');
      if (response.ok) {
        const status = await response.json();
        setConfigStatus(status);
      }
    } catch (error) {

    }
  };

  const generateWebhookVerifyToken = async () => {
    try {
      

      const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
      let token = '';
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      for (let i = 0; i < array.length; i++) {
        token += chars[array[i] % chars.length];
      }
      
      setFormData(prev => ({ ...prev, webhookVerifyToken: token }));
      toast({
        title: "Token Generated",
        description: "A new webhook verify token has been generated",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate token",
        variant: "destructive"
      });
    }
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(formData.webhookUrl);
    toast({
      title: "Copied",
      description: "Webhook URL copied to clipboard",
    });
  };

  const validateField = (name: string, value: string) => {
    const errors: ValidationErrors = { ...validationErrors };

    switch (name) {
      case 'appId':
        if (value && !/^\d+$/.test(value)) {
          errors.appId = 'App ID must be numeric';
        } else {
          delete errors.appId;
        }
        break;
      case 'businessManagerId':
        if (value && !/^\d+$/.test(value)) {
          errors.businessManagerId = 'Business Manager ID must be numeric';
        } else {
          delete errors.businessManagerId;
        }
        break;
      case 'configId':
        if (value && value.length < 10) {
          errors.configId = 'Configuration ID appears to be too short';
        } else {
          delete errors.configId;
        }
        break;
      case 'webhookUrl':
        if (value && !value.startsWith('https://')) {
          errors.webhookUrl = 'Webhook URL must use HTTPS';
        } else {
          delete errors.webhookUrl;
        }
        break;
    }

    setValidationErrors(errors);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    validateField(name, value);
  };


  const testWebhook = async () => {
    if (!formData.webhookUrl) {
      toast({
        title: "Error",
        description: "Webhook URL is required",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsTestingWebhook(true);
      
      const response = await fetch('/api/admin/partner-configurations/test-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          webhookUrl: formData.webhookUrl,
          webhookVerifyToken: formData.webhookVerifyToken
        })
      });

      const result = await response.json();

      if (result.success) {
        
        toast({
          title: "Success",
          description: "Webhook test was successful",
        });
      } else {
        toast({
          title: "Webhook Test Failed",
          description: result.error || "Webhook is not reachable",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to test webhook",
        variant: "destructive"
      });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const validateConfiguration = async () => {
    try {
      setIsValidating(true);
      
      const response = await fetch('/api/admin/partner-configurations/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: 'meta',
          appId: formData.appId,
          appSecret: formData.appSecret,
          businessManagerId: formData.businessManagerId,
          accessToken: formData.accessToken,
          webhookUrl: formData.webhookUrl,
          webhookVerifyToken: formData.webhookVerifyToken
        })
      });

      const result = await response.json();

      if (response.ok && result.valid) {
        toast({
          title: "Success",
          description: result.message || "Meta Partner API credentials are valid! Opening test signup flow...",
        });
        setShowTestOnboarding(true);
        await loadConfigurationStatus();
        return true;
      } else {
        const errorDetails = result.details ? JSON.stringify(result.details, null, 2) : result.error;
        toast({
          title: "Validation Failed",
          description: errorDetails || "Invalid Meta Partner API credentials",
          variant: "destructive"
        });
        return false;
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to validate configuration",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.appId || !formData.appSecret || !formData.businessManagerId) {
      toast({
        title: "Error",
        description: "App ID, App Secret, and Business Manager ID are required",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsSubmitting(true);


      let webhookVerifyToken = formData.webhookVerifyToken;
      if (!webhookVerifyToken) {
        
        const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
        let token = '';
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        for (let i = 0; i < array.length; i++) {
          token += chars[array[i] % chars.length];
        }
        webhookVerifyToken = token;
      }

      const configData = {
        provider: 'meta',
        partnerApiKey: formData.appId.trim(),
        partnerSecret: formData.appSecret.trim(), // Trim whitespace to prevent verification issues
        partnerId: formData.businessManagerId.trim(),
        webhookVerifyToken: webhookVerifyToken,
        accessToken: formData.accessToken?.trim() || undefined,
        configId: formData.configId?.trim() || undefined,
        partnerWebhookUrl: formData.webhookUrl.trim(),
        redirectUrl: `${window.location.origin}/settings/channels/meta/callback`,
        publicProfile: {
          companyName: formData.companyName?.trim() || undefined,
          logoUrl: formData.logoUrl?.trim() || undefined
        },
        isActive: true,
        apiVersion: 'v24.0'
      };

      const url = existingConfig 
        ? `/api/admin/partner-configurations/${existingConfig.id}`
        : '/api/admin/partner-configurations';
      
      const method = existingConfig ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(configData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save configuration');
      }

      const savedConfig = await response.json();

      toast({
        title: "Success",
        description: existingConfig 
          ? "Meta Partner API configuration updated successfully"
          : "Meta Partner API configuration created successfully"
      });

      await loadConfigurationStatus();
      onSuccess();
      onClose();

    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save configuration",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting && !isValidating) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Meta WhatsApp Business API Partner Configuration</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Loading configuration...</span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Configuration Status Dashboard */}
            {existingConfig && (
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium flex items-center">
                    <Activity className="w-5 h-5 mr-2" />
                    Configuration Status
                  </h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      loadConfigurationStatus();
                      setShowStatusDashboard(!showStatusDashboard);
                    }}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh Status
                  </Button>
                </div>
                {showStatusDashboard && configStatus ? (
                  <MetaConfigurationStatusDashboard configStatus={configStatus} />
                ) : (
                  <div className="text-sm text-gray-600">
                    Click "Refresh Status" to view detailed health information
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Expandable Instructions */}
              <div className="border rounded-lg">
                <button
                  type="button"
                  onClick={() => setShowInstructions(!showInstructions)}
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <h3 className="text-lg font-medium">Meta App Setup Instructions</h3>
                  {showInstructions ? <ChevronUp /> : <ChevronDown />}
                </button>
                {showInstructions && (
                  <div className="p-4 border-t space-y-3 text-sm text-gray-600">
                    <ol className="list-decimal pl-5 space-y-2">
                      <li>Go to <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Meta for Developers</a> and create or select your app</li>
                      <li>Add the WhatsApp Business API product to your app</li>
                      <li>Navigate to WhatsApp → Configuration and create a Configuration ID</li>
                      <li>In Business Settings, note your Business Manager ID</li>
                      <li>Create a System User with WhatsApp Business Management permissions</li>
                      <li>Generate a System User Access Token with required permissions</li>
                      <li>Configure webhook URL and verify token in your app settings</li>
                    </ol>
                    <p className="mt-3 text-xs text-gray-500">
                      For detailed documentation, visit{' '}
                      <a href="https://developers.facebook.com/docs/whatsapp/business-management-api" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                        Meta's WhatsApp Business Management API documentation
                      </a>
                    </p>
                  </div>
                )}
              </div>

              {/* Tech Provider Credentials */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Tech Provider Credentials</h3>
                <p className="text-sm text-gray-600">
                  Configure your Meta Tech Provider credentials for embedded signup
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="appId">App ID *</Label>
                    <Input
                      id="appId"
                      name="appId"
                      value={formData.appId}
                      onChange={handleInputChange}
                      placeholder="Your Meta App ID"
                      required
                      className={validationErrors.appId ? 'border-red-500' : ''}
                    />
                    {validationErrors.appId && (
                      <p className="text-sm text-red-500 mt-1">{validationErrors.appId}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="appSecret">App Secret *</Label>
                    <Input
                      id="appSecret"
                      name="appSecret"
                      type="password"
                      value={formData.appSecret}
                      onChange={handleInputChange}
                      placeholder="Your Meta App Secret"
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="businessManagerId">Business Manager ID *</Label>
                  <Input
                    id="businessManagerId"
                    name="businessManagerId"
                    value={formData.businessManagerId}
                    onChange={handleInputChange}
                    placeholder="Your Business Manager ID"
                    required
                    className={validationErrors.businessManagerId ? 'border-red-500' : ''}
                  />
                  {validationErrors.businessManagerId && (
                    <p className="text-sm text-red-500 mt-1">{validationErrors.businessManagerId}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="webhookVerifyToken">Webhook Verify Token</Label>
                    <div className="flex gap-2">
                      <Input
                        id="webhookVerifyToken"
                        name="webhookVerifyToken"
                        value={formData.webhookVerifyToken}
                        onChange={handleInputChange}
                        placeholder="Webhook verification token"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={generateWebhookVerifyToken}
                        title="Generate secure random token"
                      >
                        {formData.webhookVerifyToken ? <RefreshCw className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {formData.webhookVerifyToken ? 'Token generated. Click to regenerate.' : 'Click to generate a secure random token'}
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="accessToken">System User Access Token</Label>
                    <Input
                      id="accessToken"
                      name="accessToken"
                      type="password"
                      value={formData.accessToken}
                      onChange={handleInputChange}
                      placeholder="System user access token"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="configId">WhatsApp Configuration ID</Label>
                  <Input
                    id="configId"
                    name="configId"
                    value={formData.configId}
                    onChange={handleInputChange}
                    placeholder="WhatsApp Configuration ID for embedded signup"
                    className={validationErrors.configId ? 'border-red-500' : ''}
                  />
                  {validationErrors.configId && (
                    <p className="text-sm text-red-500 mt-1">{validationErrors.configId}</p>
                  )}
                  <p className="text-sm text-gray-500 mt-1">
                    This is the Configuration ID from your Meta App's WhatsApp Business API settings
                  </p>
                </div>

                <div>
                  <Label htmlFor="webhookUrl">Webhook URL</Label>
                  <div className="flex gap-2">
                    <Input
                      id="webhookUrl"
                      name="webhookUrl"
                      value={formData.webhookUrl}
                      onChange={handleInputChange}
                      placeholder="https://yourdomain.com/api/webhooks/meta-whatsapp"
                      className={validationErrors.webhookUrl ? 'border-red-500' : ''}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={copyWebhookUrl}
                      title="Copy webhook URL"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  {validationErrors.webhookUrl && (
                    <p className="text-sm text-red-500 mt-1">{validationErrors.webhookUrl}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Auto-generated from current origin. Make sure this URL is accessible from the internet.
                  </p>
                </div>

              </div>

              {/* Company Profile */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Company Profile</h3>
                <p className="text-sm text-gray-600">
                  This information will be shown to companies during onboarding
                </p>

                <div>
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    name="companyName"
                    value={formData.companyName}
                    onChange={handleInputChange}
                    placeholder="Your company name"
                  />
                </div>

                <div>
                  <Label htmlFor="logoUrl">Logo URL</Label>
                  <Input
                    id="logoUrl"
                    name="logoUrl"
                    value={formData.logoUrl}
                    onChange={handleInputChange}
                    placeholder="https://example.com/logo.png"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={validateConfiguration}
                  disabled={isValidating || isSubmitting || !formData.appId || !formData.appSecret}
                  className="flex-1"
                >
                  {isValidating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <TestTube className="w-4 h-4 mr-2" />
                  )}
                  Test Configuration
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={testWebhook}
                  disabled={isTestingWebhook || !formData.webhookUrl}
                  className="flex-1"
                >
                  {isTestingWebhook ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ExternalLink className="w-4 h-4 mr-2" />
                  )}
                  Test Webhook
                </Button>

                <Button
                  type="submit"
                  disabled={isSubmitting || isValidating}
                  className="flex-1"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  {existingConfig ? 'Update Configuration' : 'Save Configuration'}
                </Button>
              </div>
            </form>
          </div>
        )}
      </DialogContent>

      {/* Test Onboarding Modal */}
      <MetaWhatsAppIntegratedOnboarding
        isOpen={showTestOnboarding}
        onClose={() => setShowTestOnboarding(false)}
        onSuccess={() => {
          setShowTestOnboarding(false);
          toast({
            title: "Test Successful",
            description: "The embedded signup flow is working correctly!",
          });
        }}
      />
    </Dialog>
  );
}
