import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { initFacebookSDK, launchMessengerSignup, FacebookLoginResponse } from '@/lib/facebook-sdk';
import { fetchMetaPartnerConfig, validateFacebookConfig, clearConfigCache } from '@/lib/facebook-config';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
}

export function MessengerEmbeddedSignup({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const [sdkInitialized, setSdkInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [configValid, setConfigValid] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [partnerConfig, setPartnerConfig] = useState<any>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [connectionName, setConnectionName] = useState('');
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>('');
  const [loadingPages, setLoadingPages] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadPartnerConfiguration();
      setPages([]);
      setSelectedPageId('');
    }
  }, [isOpen]);

  const loadPartnerConfiguration = async () => {
    try {
      setConfigLoading(true);
      const config = await fetchMetaPartnerConfig();
      
      if (!config) {
        setConfigError('Meta Partner Configuration is not available');
        setConfigValid(false);
        toast({
          title: "Configuration Error",
          description: "Meta Partner API is not configured. Please contact your administrator.",
          variant: "destructive"
        });
        return;
      }

      const validation = await validateFacebookConfig(config);
      if (!validation.isValid) {
        setConfigError(`Missing configuration: ${validation.missingFields.join(', ')}`);
        setConfigValid(false);
        toast({
          title: "Configuration Error",
          description: `Missing configuration: ${validation.missingFields.join(', ')}. Please contact your administrator.`,
          variant: "destructive"
        });
        return;
      }

      setPartnerConfig(config);
      setConfigValid(true);
      setConfigError(null);

      await initFacebookSDK(config.partnerApiKey, config.apiVersion || 'v24.0');
      setSdkInitialized(true);
    } catch (error) {
      setConfigError('Failed to load partner configuration');
      toast({
        title: "Integration Error",
        description: "Failed to initialize the Messenger signup process. Please try again later.",
        variant: "destructive"
      });
    } finally {
      setConfigLoading(false);
    }
  };

  const handleRefreshConfiguration = async () => {
    clearConfigCache();
    await loadPartnerConfiguration();
    toast({
      title: "Configuration Refreshed",
      description: "Configuration has been refreshed successfully.",
    });
  };

  const handleFacebookLoginResponse = async (response: FacebookLoginResponse) => {
    if (!response.authResponse || !response.authResponse.accessToken) {
      setLoading(false);
      toast({
        title: "Login Cancelled",
        description: "The Facebook login process was cancelled or encountered an error.",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoadingPages(true);

      const pagesResponse = await fetch('/api/channel-connections/meta-messenger-embedded-signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          accessToken: response.authResponse.accessToken,
          action: 'fetch_pages'
        })
      });

      if (!pagesResponse.ok) {
        const error = await pagesResponse.json();
        throw new Error(error.message || 'Failed to fetch Facebook Pages');
      }

      const data = await pagesResponse.json();
      if (data.pages && data.pages.length > 0) {
        setPages(data.pages);
        if (data.pages.length === 1) {
          setSelectedPageId(data.pages[0].id);
        }
      } else {
        toast({
          title: "No Pages Found",
          description: "You don't have any Facebook Pages that can be connected. Please create a Page first or ensure you have the necessary permissions.",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch your Facebook Pages.",
        variant: "destructive"
      });
    } finally {
      setLoadingPages(false);
      setLoading(false);
    }
  };

  const launchSignup = () => {
    if (!connectionName.trim()) {
      toast({
        title: "Connection Name Required",
        description: "Please enter a connection name to continue.",
        variant: "destructive"
      });
      return;
    }

    if (!configValid) {
      toast({
        title: "Configuration Error",
        description: configError || "Meta Partner API is not properly configured.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    if (!sdkInitialized) {
      toast({
        title: "Please Wait",
        description: "The signup process is still initializing. Please try again in a moment.",
      });
      setLoading(false);
      return;
    }

    try {
      launchMessengerSignup(handleFacebookLoginResponse);
    } catch (error: any) {
      toast({
        title: "Launch Error",
        description: error.message || "Failed to launch Messenger signup flow.",
        variant: "destructive"
      });
      setLoading(false);
    }
  };

  const handleConnectPage = async () => {
    if (!selectedPageId) {
      toast({
        title: "Page Required",
        description: "Please select a Facebook Page to connect.",
        variant: "destructive"
      });
      return;
    }

    const selectedPage = pages.find(p => p.id === selectedPageId);
    if (!selectedPage) {
      toast({
        title: "Invalid Page",
        description: "Selected page not found.",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/channel-connections/meta-messenger-embedded-signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          connectionName: connectionName.trim() || `Messenger - ${selectedPage.name}`,
          pageId: selectedPage.id,
          pageName: selectedPage.name,
          pageAccessToken: selectedPage.access_token,
          action: 'create_connection'
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: "Connection Successful",
          description: `Messenger connection for "${selectedPage.name}" has been created successfully.`,
        });
        onSuccess();
        onClose();
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create Messenger connection');
      }
    } catch (error: any) {
      toast({
        title: "Connection Error",
        description: error.message || "Failed to create Messenger connection.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Facebook Messenger - Easy Setup</DialogTitle>
          <DialogDescription>
            Connect your Facebook Page to enable Messenger conversations. You'll be asked to log in with Facebook and grant permissions.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 mb-4">
            <h3 className="text-sm font-medium mb-2">How it works:</h3>
            <ol className="list-decimal pl-5 text-sm text-gray-600 space-y-1">
              <li>Click "Connect with Facebook" to log in with your Facebook account</li>
              <li>Grant permissions to access your Facebook Pages</li>
              <li>Select the Page you want to connect</li>
              <li>Your Messenger connection will be created automatically</li>
            </ol>

            {!configLoading && !configValid && configError && (
              <div className="mt-3 flex flex-col p-2 text-red-800 bg-red-50 rounded border border-red-200">
                <div className="flex items-start">
                  <i className="ri-error-warning-line mt-0.5 mr-2"></i>
                  <div className="flex-1">
                    <p className="text-xs font-medium">
                      <strong>Configuration Error:</strong> {configError}
                    </p>
                    <p className="text-xs mt-1">
                      Contact your administrator to configure the Meta Partner API credentials.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 text-xs"
                  onClick={handleRefreshConfiguration}
                >
                  <i className="ri-refresh-line mr-1"></i>
                  Refresh Configuration
                </Button>
              </div>
            )}

            {!configLoading && !configValid && !configError && (
              <div className="mt-3 flex p-2 text-amber-800 bg-amber-50 rounded border border-amber-200">
                <i className="ri-error-warning-line mt-0.5 mr-2"></i>
                <p className="text-xs">
                  <strong>Note:</strong> This feature requires configuration of a Meta Partner App with Pages permissions.
                  Contact your administrator to set up the app credentials.
                </p>
              </div>
            )}
          </div>
          
          <div className="space-y-4 pt-2">
            <div>
              <Label htmlFor="connectionName">Connection Name</Label>
              <Input
                id="connectionName"
                value={connectionName}
                onChange={(e) => setConnectionName(e.target.value)}
                placeholder="e.g. My Messenger Page"
                className="mt-1"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Give your Messenger connection a name to easily identify it
              </p>
            </div>

            {pages.length > 0 && (
              <div>
                <Label htmlFor="pageSelect">Select Facebook Page</Label>
                <select
                  id="pageSelect"
                  value={selectedPageId}
                  onChange={(e) => setSelectedPageId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Select a Page...</option>
                  {pages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.name} {page.category ? `(${page.category})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Choose which Facebook Page to connect for Messenger
                </p>
              </div>
            )}
          </div>
        </div>
        
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading || loadingPages}
          >
            Cancel
          </Button>
          {pages.length === 0 ? (
            <Button
              onClick={launchSignup}
              disabled={loading || !sdkInitialized || !configValid || configLoading || !connectionName.trim() || loadingPages}
            >
              {loading || loadingPages ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {loadingPages ? 'Loading Pages...' : 'Connecting...'}
                </>
              ) : (
                <>
                  <i className="ri-facebook-fill w-4 h-4 mr-2"></i>
                  Connect with Facebook
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleConnectPage}
              disabled={loading || !selectedPageId}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <i className="ri-check-line w-4 h-4 mr-2"></i>
                  Connect Page
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

