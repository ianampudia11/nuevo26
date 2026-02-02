import React, { useState, useEffect } from 'react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Info, TestTube, ExternalLink, Loader2, Eye, EyeOff } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  connectionId: number;
}

interface FormData {
  accountName: string;
  accountSid: string;
  authToken: string;
  fromNumber: string;
  webhookUrl: string;
  statusCallbackUrl: string;
}

export function EditTwilioSmsConnectionForm({ isOpen, onClose, onSuccess, connectionId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [form, setForm] = useState<FormData>({
    accountName: '',
    accountSid: '',
    authToken: '',
    fromNumber: '',
    webhookUrl: `${window.location.origin}/api/webhooks/twilio/sms`,
    statusCallbackUrl: `${window.location.origin}/api/webhooks/twilio/sms-status`
  });

  useEffect(() => {
    if (isOpen && connectionId) {
      loadConfiguration();
    }
  }, [isOpen, connectionId]);

  const loadConfiguration = async () => {
    setIsLoadingData(true);
    try {
      const response = await fetch(`/api/channel-connections/${connectionId}`, {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to load Twilio SMS configuration');
      }

      const connection = await response.json();
 
      if (connection.channelType !== 'twilio_sms') {
        throw new Error('Invalid channel type');
      }


      let connectionData = connection.connectionData;
      if (typeof connectionData === 'string') {
        try {
          connectionData = JSON.parse(connectionData);
        } catch (e) {
          connectionData = {};
        }
      }

      const formData = {
        accountName: connection.accountName || '',
        accountSid: connectionData?.accountSid || '',
        authToken: connectionData?.authToken || '',
        fromNumber: connectionData?.fromNumber || connection.accountId || '',
        webhookUrl: `${window.location.origin}/api/webhooks/twilio/sms`,
        statusCallbackUrl: connectionData?.statusCallbackUrl || `${window.location.origin}/api/webhooks/twilio/sms-status`
      };

      setForm(formData);
    } catch (error: any) {
      console.error('Error loading Twilio SMS configuration:', error);
      toast({
        title: 'Load Failed',
        description: error.message || 'Failed to load Twilio SMS configuration',
        variant: 'destructive'
      });
    } finally {
      setIsLoadingData(false);
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const validate = (): string | null => {
    if (!form.accountName || !form.accountSid || !form.authToken || !form.fromNumber) {
      return 'Please fill all required fields.';
    }
    if (!/^\+\d{6,15}$/.test(form.fromNumber.trim())) {
      return 'From Number must be in E.164 format (e.g., +15551234567).';
    }
    try {
      const w = new URL(form.webhookUrl);
      const s = new URL(form.statusCallbackUrl);
     
    } catch {
      return 'Webhook URLs are invalid.';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast({ title: 'Validation Error', description: err, variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/channel-connections/${connectionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName: form.accountName,
          accountId: form.fromNumber,
          connectionData: {
            accountSid: form.accountSid,
            authToken: form.authToken,
            fromNumber: form.fromNumber,
            statusCallbackUrl: form.statusCallbackUrl
          }
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to update Twilio SMS connection');
      }
      toast({ 
        title: 'Twilio SMS Updated', 
        description: 'Your Twilio SMS channel has been updated successfully.' 
      });
      onSuccess();
      onClose();
    } catch (error: any) {
      toast({ 
        title: 'Update Failed', 
        description: error.message || 'Failed to update Twilio SMS connection.', 
        variant: 'destructive' 
      });
    } finally {
      setLoading(false);
    }
  };

  const testWebhookHint = () => {
    toast({
      title: 'Webhook Test Tip',
      description: 'Use Twilio Console "Try It Out" or send a real SMS to your From Number to test inbound webhooks.',
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Edit Twilio SMS Connection</DialogTitle>
          <DialogDescription>
            Update your Twilio Programmable Messaging configuration.
          </DialogDescription>
        </DialogHeader>

        {isLoadingData ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="accountName">Account Name *</Label>
              <Input 
                id="accountName" 
                name="accountName" 
                value={form.accountName} 
                onChange={onChange} 
                placeholder="e.g. Main Support Number" 
                required 
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="accountSid">Twilio Account SID *</Label>
              <Input 
                id="accountSid" 
                name="accountSid" 
                value={form.accountSid} 
                onChange={onChange} 
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" 
                required 
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="authToken">Twilio Auth Token *</Label>
              <div className="relative">
                <Input 
                  id="authToken" 
                  name="authToken" 
                  type={showAuthToken ? "text" : "password"} 
                  value={form.authToken} 
                  onChange={onChange} 
                  placeholder="Your Twilio Auth Token" 
                  required 
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowAuthToken(!showAuthToken)}
                >
                  {showAuthToken ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="fromNumber">From Number (E.164) *</Label>
              <Input 
                id="fromNumber" 
                name="fromNumber" 
                value={form.fromNumber} 
                onChange={onChange} 
                placeholder="+15551234567" 
                required 
              />
            </div>

            <div className="border-t pt-4 grid gap-3">
              <div className="flex items-center justify-between">
                <Label>Webhook URLs</Label>
                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setShowDocs(true)} 
                    className="flex items-center gap-2"
                  >
                    <Info className="h-4 w-4" />
                    Setup Instructions
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={testWebhookHint} 
                    className="flex items-center gap-2"
                  >
                    <TestTube className="h-4 w-4" />
                    Test Webhook
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="webhookUrl">Inbound Webhook URL</Label>
                <Input 
                  id="webhookUrl" 
                  name="webhookUrl" 
                  value={form.webhookUrl} 
                  onChange={onChange} 
                  placeholder={`${window.location.origin}/api/webhooks/twilio/sms`} 

                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="statusCallbackUrl">Status Callback URL</Label>
                <Input 
                  id="statusCallbackUrl" 
                  name="statusCallbackUrl" 
                  value={form.statusCallbackUrl} 
                  onChange={onChange} 
                  placeholder={`${window.location.origin}/api/webhooks/twilio/sms-status`} 
                />
              </div>

              <Alert>
                <AlertDescription>
                  Ensure both URLs are publicly accessible via HTTPS. We verify Twilio requests with X-Twilio-Signature.
                </AlertDescription>
              </Alert>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="btn-brand-primary" 
                variant="outline" 
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Connection'
                )}
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* In-app setup instructions popup */}
        <Dialog open={showDocs} onOpenChange={setShowDocs}>
          <DialogContent className="sm:max-w-[720px]">
            <DialogHeader>
              <DialogTitle>Twilio SMS Setup Instructions</DialogTitle>
              <DialogDescription>
                Follow these steps to complete the integration.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <ol className="list-decimal list-inside space-y-2">
                <li>Buy or select a Twilio phone number enabled for SMS.</li>
                <li>In Twilio Console, set the Messaging webhook to:
                  <div className="mt-1 p-2 bg-muted rounded text-xs select-all break-all">
                    {form.webhookUrl}
                  </div>
                </li>
                <li>Set the Status Callback URL to:
                  <div className="mt-1 p-2 bg-muted rounded text-xs select-all break-all">
                    {form.statusCallbackUrl}
                  </div>
                </li>
                <li>Paste your Account SID and Auth Token here, and the From Number in E.164 format (e.g., +15551234567).</li>
                <li>Save. Inbound SMS will appear in Inbox under the Twilio SMS channel. Delivery updates will set message status to delivered/failed.</li>
                <li>STOP/START/HELP: When customers send STOP, we opt them out automatically and block outbound sends until START/UNSTOP.</li>
              </ol>
              <div className="pt-2">
                <a
                  href="https://www.twilio.com/docs/sms"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" /> Twilio SMS Docs (external)
                </a>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
