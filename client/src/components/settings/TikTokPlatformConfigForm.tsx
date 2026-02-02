import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface TikTokPlatformConfigFormData {
  clientKey: string;
  clientSecret: string;
  webhookUrl: string;
  webhookVerifyToken: string;
  redirectUrl: string;
  companyName: string;
  logoUrl: string;
  allowedScopes: string[];
}

export function TikTokPlatformConfigForm({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [existingConfig, setExistingConfig] = useState<any>(null);
  
  const [formData, setFormData] = useState<TikTokPlatformConfigFormData>({
    clientKey: '',
    clientSecret: '',
    webhookUrl: `${window.location.origin}/api/webhooks/tiktok`,
    webhookVerifyToken: '',
    redirectUrl: `${window.location.origin}/api/tiktok/oauth/callback`,
    companyName: '',
    logoUrl: '',
    allowedScopes: ['user.info.basic']
  });

  useEffect(() => {
    if (isOpen) {
      loadExistingConfiguration();
    }
  }, [isOpen]);

  const loadExistingConfiguration = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/partner-configurations/tiktok');
      if (response.ok) {
        const config = await response.json();
        setExistingConfig(config);
        

        const APPROVED_SCOPES = [
          'user.info.basic',      // Minimum required - always approved
          'user.info.profile',    // Optional - only if app is approved for this scope
        ];
        
        const existingScopes = config.publicProfile?.allowedScopes || ['user.info.basic'];

        const filteredScopes = existingScopes.filter((scope: string) => APPROVED_SCOPES.includes(scope));
        const allowedScopes = filteredScopes.includes('user.info.basic')
          ? filteredScopes
          : ['user.info.basic', ...filteredScopes];
        
        setFormData({
          clientKey: config.partnerApiKey || '',
          clientSecret: config.partnerId || '',
          webhookUrl: config.partnerWebhookUrl || `${window.location.origin}/api/webhooks/tiktok`,
          webhookVerifyToken: config.webhookVerifyToken || '',
          redirectUrl: config.redirectUrl || `${window.location.origin}/api/tiktok/oauth/callback`,
          companyName: config.publicProfile?.companyName || '',
          logoUrl: config.publicProfile?.logoUrl || '',
          allowedScopes: allowedScopes
        });
      }
    } catch (error) {
      console.error('Error loading TikTok platform configuration:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const resetForm = () => {
    setFormData({
      clientKey: '',
      clientSecret: '',
      webhookUrl: `${window.location.origin}/api/webhooks/tiktok`,
      webhookVerifyToken: '',
      redirectUrl: `${window.location.origin}/api/tiktok/oauth/callback`,
      companyName: '',
      logoUrl: '',
      allowedScopes: ['user.info.basic']
    });
    setExistingConfig(null);
    setIsSubmitting(false);
    setIsValidating(false);
  };

  const validateTikTokCredentials = async () => {
    if (!formData.clientKey || !formData.clientSecret) {
      toast({
        title: "Validation Error",
        description: "Client Key and Client Secret are required for validation.",
        variant: "destructive"
      });
      return false;
    }

    setIsValidating(true);
    try {
      const response = await fetch('/api/admin/partner-configurations/tiktok/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientKey: formData.clientKey,
          clientSecret: formData.clientSecret
        })
      });

      const result = await response.json();

      if (response.ok && result.valid) {
        toast({
          title: "Validation Successful",
          description: "TikTok API credentials are valid and working.",
        });
        return true;
      } else {
        toast({
          title: "Validation Failed",
          description: result.error || "Invalid TikTok API credentials. Please check your Client Key and Client Secret.",
          variant: "destructive"
        });
        return false;
      }
    } catch (error) {
      console.error('Error validating TikTok credentials:', error);
      toast({
        title: "Validation Error",
        description: "Failed to validate credentials. Please try again.",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.clientKey || !formData.clientSecret) {
      toast({
        title: "Validation Error",
        description: "Client Key and Client Secret are required.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {

      const APPROVED_SCOPES = [
        'user.info.basic',      // Minimum required - always approved
        'user.info.profile',    // Optional - only if app is approved for this scope
      ];
      

      const filteredScopes = formData.allowedScopes.filter(scope => APPROVED_SCOPES.includes(scope));
      

      const allowedScopes = filteredScopes.includes('user.info.basic')
        ? filteredScopes
        : ['user.info.basic', ...filteredScopes];

      const payload = {
        provider: 'tiktok',
        partnerApiKey: formData.clientKey,
        partnerId: formData.clientSecret,
        partnerWebhookUrl: formData.webhookUrl,
        webhookVerifyToken: formData.webhookVerifyToken,
        redirectUrl: formData.redirectUrl,
        publicProfile: {
          companyName: formData.companyName,
          logoUrl: formData.logoUrl,
          allowedScopes: allowedScopes
        },
        isActive: true
      };

      const response = await fetch('/api/admin/partner-configurations/tiktok', {
        method: existingConfig ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: existingConfig 
            ? "TikTok platform configuration updated successfully." 
            : "TikTok platform configuration created successfully.",
        });
        resetForm();
        onSuccess();
        onClose();
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.message || "Failed to save TikTok platform configuration.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error saving TikTok platform configuration:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!existingConfig) return;
    
    if (!confirm('Are you sure you want to delete the TikTok platform configuration? This will disconnect all company TikTok channels.')) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/admin/partner-configurations/tiktok', {
        method: 'DELETE'
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "TikTok platform configuration deleted successfully.",
        });
        resetForm();
        onSuccess();
        onClose();
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.message || "Failed to delete TikTok platform configuration.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error deleting TikTok platform configuration:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <i className="ri-tiktok-line text-2xl"></i>
            TikTok Platform Configuration
          </DialogTitle>
        </DialogHeader>

        <Alert className="bg-yellow-50 border-yellow-200">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-sm text-yellow-800">
            <strong>Partner API Access Required:</strong> TikTok Business Messaging API is only available to approved messaging partners. 
            You must apply for the TikTok Messaging Partner Program at{' '}
            <a 
              href="https://www.tiktok.com/business/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="underline inline-flex items-center gap-1"
            >
              tiktok.com/business
              <ExternalLink className="h-3 w-3" />
            </a>
          </AlertDescription>
        </Alert>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* TikTok App Credentials */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">TikTok App Credentials</h3>
              <p className="text-sm text-gray-600">
                Obtain these credentials from your TikTok for Developers app at{' '}
                <a 
                  href="https://developers.tiktok.com/apps" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  developers.tiktok.com/apps
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>

              <div>
                <Label htmlFor="clientKey">Client Key *</Label>
                <Input
                  id="clientKey"
                  name="clientKey"
                  type="text"
                  value={formData.clientKey}
                  onChange={handleInputChange}
                  placeholder="Enter TikTok App Client Key"
                  required
                  disabled={isSubmitting || isValidating}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Your TikTok app's unique client key (also called App ID)
                </p>
              </div>

              <div>
                <Label htmlFor="clientSecret">Client Secret *</Label>
                <Input
                  id="clientSecret"
                  name="clientSecret"
                  type="password"
                  value={formData.clientSecret}
                  onChange={handleInputChange}
                  placeholder="Enter TikTok App Client Secret"
                  required
                  disabled={isSubmitting || isValidating}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Your TikTok app's client secret (keep this secure)
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={validateTikTokCredentials}
                disabled={isSubmitting || isValidating || !formData.clientKey || !formData.clientSecret}
                className="w-full"
              >
                {isValidating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900 mr-2"></div>
                    Validating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Validate Credentials
                  </>
                )}
              </Button>
            </div>

            {/* Webhook & OAuth Configuration */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Webhook & OAuth Configuration</h3>
              
              <div>
                <Label htmlFor="webhookUrl">Webhook URL</Label>
                <Input
                  id="webhookUrl"
                  name="webhookUrl"
                  type="url"
                  value={formData.webhookUrl}
                  onChange={handleInputChange}
                  placeholder="https://yourdomain.com/api/webhooks/tiktok"
                  disabled={isSubmitting || isValidating}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Configure this URL in your TikTok app's webhook settings
                </p>
              </div>

              <div>
                <Label htmlFor="webhookVerifyToken">Webhook Verify Token *</Label>
                <Input
                  id="webhookVerifyToken"
                  name="webhookVerifyToken"
                  type="text"
                  value={formData.webhookVerifyToken}
                  onChange={handleInputChange}
                  placeholder="Enter webhook verify token"
                  required
                  disabled={isSubmitting || isValidating}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Token used to verify webhook requests from TikTok. This must match the token configured in your TikTok app's webhook settings.
                </p>
              </div>

              <div>
                <Label htmlFor="redirectUrl">OAuth Redirect URL</Label>
                <Input
                  id="redirectUrl"
                  name="redirectUrl"
                  type="url"
                  value={formData.redirectUrl}
                  onChange={handleInputChange}
                  placeholder="https://yourdomain.com/api/tiktok/oauth/callback"
                  disabled={isSubmitting || isValidating}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Register this URL in your TikTok app's Login Kit redirect URIs
                </p>
              </div>
            </div>

            {/* OAuth Scopes Configuration */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">OAuth Scopes</h3>
              <p className="text-sm text-gray-600">
                Select the OAuth scopes that are approved for your TikTok app. Only approved scopes will be requested during OAuth.
              </p>
              
              <Alert className="bg-blue-50 border-blue-200">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-sm text-blue-800">
                  <strong>Important:</strong> Only include scopes that are approved for your TikTok app. Requesting unapproved scopes will cause OAuth to fail.
                  The minimum required scope <code className="bg-blue-100 px-1 rounded">user.info.basic</code> is always included.
                  Video scopes (video.list, video.upload) are not available unless your app is whitelisted by TikTok.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                {[
                  { value: 'user.info.basic', label: 'User Info Basic', required: true, description: 'Basic user information (required)' },
                  { value: 'user.info.profile', label: 'User Info Profile', required: false, description: 'Extended user profile information' }
                ].map((scope) => (
                  <div key={scope.value} className="flex items-start space-x-2">
                    <input
                      type="checkbox"
                      id={`scope-${scope.value}`}
                      checked={formData.allowedScopes.includes(scope.value)}
                      onChange={(e) => {
                        if (scope.required) return; // Prevent unchecking required scope
                        const newScopes = e.target.checked
                          ? [...formData.allowedScopes, scope.value]
                          : formData.allowedScopes.filter(s => s !== scope.value);
                        setFormData(prev => ({ ...prev, allowedScopes: newScopes }));
                      }}
                      disabled={isSubmitting || isValidating || scope.required}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <Label htmlFor={`scope-${scope.value}`} className={scope.required ? 'font-semibold' : ''}>
                        {scope.label} {scope.required && <span className="text-red-500">*</span>}
                      </Label>
                      <p className="text-xs text-gray-500">{scope.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Branding (Optional) */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Branding (Optional)</h3>
              
              <div>
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  name="companyName"
                  type="text"
                  value={formData.companyName}
                  onChange={handleInputChange}
                  placeholder="Your Company Name"
                  disabled={isSubmitting || isValidating}
                />
              </div>

              <div>
                <Label htmlFor="logoUrl">Logo URL</Label>
                <Input
                  id="logoUrl"
                  name="logoUrl"
                  type="url"
                  value={formData.logoUrl}
                  onChange={handleInputChange}
                  placeholder="https://yourdomain.com/logo.png"
                  disabled={isSubmitting || isValidating}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between pt-4 border-t">
              <div>
                {existingConfig && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={isSubmitting || isValidating}
                  >
                    Delete Configuration
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    resetForm();
                    onClose();
                  }}
                  disabled={isSubmitting || isValidating}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || isValidating}
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    existingConfig ? 'Update Configuration' : 'Save Configuration'
                  )}
                </Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

