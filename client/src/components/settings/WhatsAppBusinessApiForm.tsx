import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';

interface BusinessApiFormData {
  accountName: string;
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  appId: string;
  appSecret: string;
  webhookUrl: string;
  verifyToken: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function WhatsAppBusinessApiForm({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  const [formData, setFormData] = useState<BusinessApiFormData>({
    accountName: '',
    phoneNumberId: '',
    businessAccountId: '',
    accessToken: '',
    appId: '',
    appSecret: '',
    webhookUrl: '',
    verifyToken: 'default_verify_token'
  });

  const [testPhone, setTestPhone] = useState('');
  const [isTestingTemplate, setIsTestingTemplate] = useState(false);



  const generateWebhookUrl = () => {
    const currentDomain = window.location.origin;
    const webhookUrl = `${currentDomain}/api/webhooks/whatsapp`;
    setFormData(prev => ({ ...prev, webhookUrl }));
  };

  React.useEffect(() => {
    if (isOpen) {
      generateWebhookUrl();
    }
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const resetForm = () => {
    const currentDomain = window.location.origin;
    const webhookUrl = `${currentDomain}/api/webhooks/whatsapp`;
    setFormData({
      accountName: '',
      phoneNumberId: '',
      businessAccountId: '',
      accessToken: '',
      appId: '',
      appSecret: '',
      webhookUrl: webhookUrl,
      verifyToken: 'default_verify_token'
    });
    setIsSubmitting(false);
    setIsValidating(false);
  };

  const validateCredentials = async () => {
    if (!formData.accessToken || !formData.phoneNumberId) {
      toast({
        title: t('whatsapp_business.validation_error', 'Validation Error'),
        description: t('whatsapp_business.required_fields', 'Access Token and Phone Number ID are required for validation.'),
        variant: "destructive"
      });
      return false;
    }

    setIsValidating(true);
    try {

      const response = await fetch(`https://graph.facebook.com/v24.0/${formData.phoneNumberId}?access_token=${formData.accessToken}`);

      if (response.ok) {
        const data = await response.json();
        toast({
          title: t('whatsapp_business.credentials_valid', 'Credentials Valid'),
          description: t('whatsapp_business.validation_success', 'Successfully validated phone number: {{phoneNumber}}', { phoneNumber: data.display_phone_number || formData.phoneNumberId }),
        });
        return true;
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || t('whatsapp_business.invalid_credentials', 'Invalid credentials'));
      }
    } catch (error: any) {
      toast({
        title: t('whatsapp_business.validation_failed', 'Validation Failed'),
        description: error.message || t('whatsapp_business.validation_failed_desc', 'Failed to validate WhatsApp Business API credentials.'),
        variant: "destructive"
      });
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const testWebhookConnection = async () => {
    if (!formData.webhookUrl || !formData.verifyToken) {
      toast({
        title: "Test Error",
        description: "Webhook URL and verify token are required for testing.",
        variant: "destructive"
      });
      return;
    }

    setIsValidating(true);
    try {
      const response = await fetch('/api/whatsapp/test-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          webhookUrl: formData.webhookUrl,
          verifyToken: formData.verifyToken
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        toast({
          title: "Webhook Test Successful!",
          description: "Your webhook configuration is working correctly. You can now configure it in Meta Developer Console.",
        });
      } else {
        toast({
          title: "Webhook Test Failed",
          description: result.message || "Please check your webhook configuration and try again.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Webhook test error:', error);
      toast({
        title: "Test Failed",
        description: "Network error. Please check your connection and try again.",
        variant: "destructive"
      });
    } finally {
      setIsValidating(false);
    }
  };

  const testTemplate = async () => {
    if (!testPhone) {
      toast({
        title: "Test Error",
        description: "Please enter a phone number to test the template message.",
        variant: "destructive"
      });
      return;
    }

    if (!formData.accessToken || !formData.phoneNumberId) {
      toast({
        title: "Test Error",
        description: "Please save the connection first before testing.",
        variant: "destructive"
      });
      return;
    }

    setIsTestingTemplate(true);
    try {

      const tempConnectionResponse = await fetch('/api/channel-connections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channelType: 'whatsapp_official',
          accountId: formData.phoneNumberId,
          accountName: `${formData.accountName} (Test)`,
          accessToken: formData.accessToken,
          connectionData: {
            phoneNumberId: formData.phoneNumberId,
            businessAccountId: formData.businessAccountId,
            accessToken: formData.accessToken,
            appId: formData.appId,
            appSecret: formData.appSecret,
            wabaId: formData.businessAccountId,
            webhookUrl: formData.webhookUrl,
            verifyToken: formData.verifyToken
          }
        })
      });

      if (!tempConnectionResponse.ok) {
        throw new Error('Failed to create temporary connection for testing');
      }

      const tempConnection = await tempConnectionResponse.json();

      try {

        const testResponse = await fetch(`/api/whatsapp/test-template/${tempConnection.id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            phoneNumber: testPhone,
            templateName: 'hello_world',
            languageCode: 'en_US'
          })
        });

        if (testResponse.ok) {
          const result = await testResponse.json();
          toast({
            title: "Template Test Successful",
            description: `Template message sent successfully to ${testPhone}. Message ID: ${result.messageId}`,
          });
        } else {
          const errorData = await testResponse.json();
          let errorMessage = errorData.error || 'Failed to send template message';


          if (errorMessage.includes('131030') || errorMessage.includes('not in allowed list')) {
            errorMessage = 'Phone number not in allowed list. Please add this number to your Meta for Developers dashboard under "Phone numbers" section, or use a number that\'s already approved.';
          } else if (errorMessage.includes('131026') || errorMessage.includes('template')) {
            errorMessage = 'Template message error. Make sure the "hello_world" template is approved in your WhatsApp Business Manager.';
          }

          throw new Error(errorMessage);
        }
      } finally {

        await fetch(`/api/channel-connections/${tempConnection.id}`, {
          method: 'DELETE'
        });
      }
    } catch (error: any) {
      toast({
        title: "Template Test Failed",
        description: error.message || "Failed to send template message.",
        variant: "destructive"
      });
    } finally {
      setIsTestingTemplate(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSubmitting(true);

    try {

      const isValid = await validateCredentials();
      if (!isValid) {
        setIsSubmitting(false);
        return;
      }
      const response = await fetch('/api/channel-connections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channelType: 'whatsapp_official',
          accountId: formData.phoneNumberId,
          accountName: formData.accountName,
          accessToken: formData.accessToken, // Store in main accessToken field
          connectionData: {
            phoneNumberId: formData.phoneNumberId,
            businessAccountId: formData.businessAccountId,
            accessToken: formData.accessToken, // Also store in connectionData for compatibility
            appId: formData.appId,
            appSecret: formData.appSecret,
            wabaId: formData.businessAccountId, // Add wabaId for consistency
            webhookUrl: formData.webhookUrl,
            verifyToken: formData.verifyToken
          }
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create WhatsApp Business API connection');
      }
      
      onClose();
      
      toast({
        title: "WhatsApp Business API Connected",
        description: "Your WhatsApp Business API account has been connected successfully!",
      });
      
      resetForm();
      
      onSuccess();
      
    } catch (error: any) {
      console.error('Error connecting to WhatsApp Business API:', error);
      toast({
        title: "Connection Error",
        description: error.message || "Failed to connect to WhatsApp Business API",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Connect WhatsApp Business API</DialogTitle>
          <DialogDescription>
            Connect your existing WhatsApp Business API account.
            You'll need your Meta for Developers credentials.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="accountName">{t('whatsapp_business.account_name', 'Account Name')}</Label>
              <Input
                id="accountName"
                name="accountName"
                value={formData.accountName}
                onChange={handleInputChange}
                placeholder={t('whatsapp_business.account_name_placeholder', 'e.g. My Business')}
                required
              />
              <p className="text-sm text-gray-500">
                {t('whatsapp_business.account_name_help', 'A name to identify this connection')}
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="phoneNumberId">{t('whatsapp_business.phone_number_id', 'Phone Number ID')}</Label>
              <Input
                id="phoneNumberId"
                name="phoneNumberId"
                value={formData.phoneNumberId}
                onChange={handleInputChange}
                placeholder="1234567890"
                required
              />
              <p className="text-sm text-gray-500">
                {t('whatsapp_business.phone_number_id_help', 'From Meta for Developers dashboard')}
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="businessAccountId">Business Account ID</Label>
              <Input
                id="businessAccountId"
                name="businessAccountId"
                value={formData.businessAccountId}
                onChange={handleInputChange}
                placeholder="1234567890"
                required
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="accessToken">Access Token</Label>
              <div className="flex gap-2">
                <Input
                  id="accessToken"
                  name="accessToken"
                  value={formData.accessToken}
                  onChange={handleInputChange}
                  placeholder="EAAxxxxx..."
                  required
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={validateCredentials}
                  disabled={isValidating || !formData.accessToken || !formData.phoneNumberId}
                  className="whitespace-nowrap"
                >
                  {isValidating ? t('whatsapp_business.validating', 'Validating...') : t('whatsapp_business.test', 'Test')}
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                Long-lived or permanent access token from Meta for Developers
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="appId">App ID</Label>
              <Input
                id="appId"
                name="appId"
                value={formData.appId}
                onChange={handleInputChange}
                placeholder="1234567890"
                required
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="appSecret">App Secret</Label>
              <Input
                id="appSecret"
                name="appSecret"
                type="password"
                value={formData.appSecret}
                onChange={handleInputChange}
                placeholder="••••••••"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="webhookUrl">Webhook URL</Label>
              <div className="flex gap-2">
                <Input
                  id="webhookUrl"
                  name="webhookUrl"
                  value={formData.webhookUrl}
                  onChange={handleInputChange}
                  placeholder={`${window.location.origin}/api/webhooks/whatsapp`}
                  required
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(formData.webhookUrl)}
                  className="whitespace-nowrap"
                >
                  {t('whatsapp_business.copy', 'Copy')}
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                Enter your webhook URL or use the auto-generated one. Copy this URL and paste it in your Meta for Developers dashboard under Webhooks configuration.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="verifyToken">Webhook Verify Token</Label>
              <div className="flex gap-2">
                <Input
                  id="verifyToken"
                  name="verifyToken"
                  value={formData.verifyToken}
                  onChange={handleInputChange}
                  placeholder="default_verify_token"
                  required
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(formData.verifyToken)}
                  className="whitespace-nowrap"
                >
                  Copy
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                This token must match the WHATSAPP_WEBHOOK_VERIFY_TOKEN environment variable on your server.
                Copy this token and paste it in the "Verify token" field in your Meta for Developers webhook configuration.
              </p>
              <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-800">
                  <strong>✅ Connection-Specific Token:</strong> This verify token will be stored with your WhatsApp Business API connection:
                  <code className="bg-green-100 px-1 rounded font-mono">{formData.verifyToken}</code>
                </p>
                <p className="text-sm text-green-800 mt-1">
                  Enter this exact token in your Meta Developer Console webhook configuration. Each WhatsApp Business API connection can have its own unique verify token.
                </p>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Test Webhook Configuration</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={testWebhookConnection}
                  disabled={isValidating || !formData.webhookUrl || !formData.verifyToken}
                  className="whitespace-nowrap"
                >
                  {isValidating ? 'Testing...' : 'Test Webhook'}
                </Button>
                <div className="flex-1 text-sm text-gray-600 flex items-center">
                  Test your webhook configuration before submitting to Meta
                </div>
              </div>
              <p className="text-sm text-gray-500">
                This will verify that your webhook URL is accessible and responds correctly to Meta's verification requests.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="testPhone">Test Template Message (Optional)</Label>
              <div className="flex gap-2">
                <Input
                  id="testPhone"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="+1234567890"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={testTemplate}
                  disabled={isTestingTemplate || !formData.accessToken || !formData.phoneNumberId}
                  className="whitespace-nowrap"
                >
                  {isTestingTemplate ? 'Testing...' : 'Test'}
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                Send a test "hello_world" template message to verify your connection is working.
                Enter a phone number with country code (e.g., +1234567890).
              </p>
              <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-sm text-amber-800">
                  <strong>Note:</strong> If your WhatsApp Business API is in development mode, you can only send messages to phone numbers that are added to the "allowed list" in your Meta for Developers dashboard.
                  <a
                    href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started#add-recipient-phone-numbers"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-amber-900"
                  >
                    Learn how to add phone numbers →
                  </a>
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="outline"
              className="btn-brand-primary"
              disabled={isSubmitting || isValidating}
            >
              {isSubmitting ? t('whatsapp_business.connecting', 'Connecting...') : t('whatsapp_business.connect', 'Connect')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}