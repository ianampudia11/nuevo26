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
import { initFacebookSDK, launchInstagramSignup, FacebookLoginResponse } from '@/lib/facebook-sdk';
import { fetchMetaPartnerConfig, validateFacebookConfig, clearConfigCache } from '@/lib/facebook-config';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface InstagramAccount {
  id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
  account_type?: string;
}

export function InstagramEmbeddedSignup({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const [sdkInitialized, setSdkInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [configValid, setConfigValid] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [partnerConfig, setPartnerConfig] = useState<any>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [connectionName, setConnectionName] = useState('');
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [userAccessToken, setUserAccessToken] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      loadPartnerConfiguration();
      setAccounts([]);
      setSelectedAccountId('');
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
        description: "Failed to initialize the Instagram signup process. Please try again later.",
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
      setLoadingAccounts(true);

      const accountsResponse = await fetch('/api/channel-connections/meta-instagram-embedded-signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          accessToken: response.authResponse.accessToken,
          action: 'fetch_accounts'
        })
      });

      if (!accountsResponse.ok) {
        const error = await accountsResponse.json();
        throw new Error(error.message || 'Failed to fetch Instagram accounts');
      }

      const data = await accountsResponse.json();
      if (data.accounts && data.accounts.length > 0) {
        setAccounts(data.accounts);
        setUserAccessToken(response.authResponse.accessToken);
        if (data.accounts.length === 1) {
          setSelectedAccountId(data.accounts[0].id);
        }
      } else {
        toast({
          title: "No Instagram Accounts Found",
          description: "You don't have any Instagram Business accounts that can be connected. Please ensure your Instagram account is converted to a Business account and linked to a Facebook Page.",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch your Instagram accounts.",
        variant: "destructive"
      });
    } finally {
      setLoadingAccounts(false);
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
      launchInstagramSignup(handleFacebookLoginResponse);
    } catch (error: any) {
      toast({
        title: "Launch Error",
        description: error.message || "Failed to launch Instagram signup flow.",
        variant: "destructive"
      });
      setLoading(false);
    }
  };

  const handleConnectAccount = async () => {
    if (!selectedAccountId) {
      toast({
        title: "Account Required",
        description: "Please select an Instagram account to connect.",
        variant: "destructive"
      });
      return;
    }

    const selectedAccount = accounts.find(a => a.id === selectedAccountId);
    if (!selectedAccount) {
      toast({
        title: "Invalid Account",
        description: "Selected account not found.",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/channel-connections/meta-instagram-embedded-signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          connectionName: connectionName.trim() || `Instagram - ${selectedAccount.username}`,
          instagramAccountId: selectedAccount.id,
          username: selectedAccount.username,
          accessToken: userAccessToken,
          action: 'create_connection'
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: "Connection Successful",
          description: `Instagram connection for "@${selectedAccount.username}" has been created successfully.`,
        });
        onSuccess();
        onClose();
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create Instagram connection');
      }
    } catch (error: any) {
      toast({
        title: "Connection Error",
        description: error.message || "Failed to create Instagram connection.",
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
          <DialogTitle>Instagram - Easy Setup</DialogTitle>
          <DialogDescription>
            Connect your Instagram Business account to enable Instagram Direct messages. You'll be asked to log in with Facebook and grant permissions.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 mb-4">
            <h3 className="text-sm font-medium mb-2">How it works:</h3>
            <ol className="list-decimal pl-5 text-sm text-gray-600 space-y-1">
              <li>Click "Connect with Facebook" to log in with your Facebook account</li>
              <li>Grant permissions to access your Instagram Business accounts</li>
              <li>Select the Instagram account you want to connect</li>
              <li>Your Instagram connection will be created automatically</li>
            </ol>

            <div className="mt-3 flex p-2 text-amber-800 bg-amber-50 rounded border border-amber-200">
              <i className="ri-information-line mt-0.5 mr-2"></i>
              <p className="text-xs">
                <strong>Note:</strong> Your Instagram account must be a Business account and linked to a Facebook Page.
              </p>
            </div>

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
                  <strong>Note:</strong> This feature requires configuration of a Meta Partner App with Instagram permissions.
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
                placeholder="e.g. My Instagram Account"
                className="mt-1"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Give your Instagram connection a name to easily identify it
              </p>
            </div>

            {accounts.length > 0 && (
              <div>
                <Label htmlFor="accountSelect">Select Instagram Account</Label>
                <select
                  id="accountSelect"
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Select an account...</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      @{account.username} {account.name ? `(${account.name})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Choose which Instagram Business account to connect
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
            disabled={loading || loadingAccounts}
          >
            Cancel
          </Button>
          {accounts.length === 0 ? (
            <Button
              onClick={launchSignup}
              disabled={loading || !sdkInitialized || !configValid || configLoading || !connectionName.trim() || loadingAccounts}
            >
              {loading || loadingAccounts ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {loadingAccounts ? 'Loading Accounts...' : 'Connecting...'}
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
              onClick={handleConnectAccount}
              disabled={loading || !selectedAccountId}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <i className="ri-check-line w-4 h-4 mr-2"></i>
                  Connect Account
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

