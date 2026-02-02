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
import { ExternalLink, AlertCircle, Loader2, CheckCircle2, Info } from 'lucide-react';
import TikTokOnboardingWizard, { SCOPE_EXPLANATIONS, PREREQUISITES_CHECKLIST } from './TikTokOnboardingWizard';
import type { TikTokOnboardingStep } from './TikTokOnboardingWizard';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface TikTokPlatformConfig {
  clientKey: string;
  redirectUrl: string;
  webhookUrl: string;
  allowedScopes?: string[];
  partnerId?: string;
  partnerName?: string;
}

export function TikTokConnectionForm({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [checkingConfig, setCheckingConfig] = useState(false);
  const [platformConfigured, setPlatformConfigured] = useState(false);
  const [platformConfig, setPlatformConfig] = useState<TikTokPlatformConfig | null>(null);
  const [accountName, setAccountName] = useState('');
  const [authorizationUrl, setAuthorizationUrl] = useState('');
  const [codeChallenge, setCodeChallenge] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState<TikTokOnboardingStep>('requirements');


  useEffect(() => {
    if (isOpen) {
      checkPlatformConfiguration();
    }
  }, [isOpen]);


  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'tiktok_oauth_success') {
        toast({
          title: "Success",
          description: "TikTok account connected successfully!",
        });
        handleClose();
        onSuccess();
      } else if (event.data.type === 'tiktok_oauth_error') {
        toast({
          title: "Connection Failed",
          description: event.data.error || "Failed to connect TikTok account",
          variant: "destructive"
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSuccess, toast]);

  const checkPlatformConfiguration = async () => {
    setCheckingConfig(true);
    try {
      const response = await fetch('/api/partner-configurations/tiktok');
      
      if (response.ok) {
        const config = await response.json();
        if (config && config.isActive) {

          const isPartnerConfigured = config.partnerId && config.partnerName;
          
          if (!isPartnerConfigured) {
            toast({
              title: "Configuration Warning",
              description: "TikTok Partner configuration incomplete. Messaging features require TikTok Marketing Partner approval. Contact your administrator.",
              variant: "default"
            });
          }
          
          setPlatformConfigured(true);
          setPlatformConfig({
            clientKey: config.clientKey,
            redirectUrl: config.redirectUrl,
            webhookUrl: '', // Not returned by tenant-safe endpoint
            allowedScopes: config.allowedScopes || ['user.info.basic'],
            partnerId: config.partnerId,
            partnerName: config.partnerName
          });
        } else {
          setPlatformConfigured(false);
        }
      } else if (response.status === 404) {

        setPlatformConfigured(false);
      } else {
        setPlatformConfigured(false);
      }
    } catch (error) {
      console.error('Error checking platform configuration:', error);
      setPlatformConfigured(false);
    } finally {
      setCheckingConfig(false);
    }
  };

  const generateAuthorizationUrl = async () => {
    if (!platformConfig) return;



    const APPROVED_SCOPES = [
      'user.info.basic',      // Minimum required - always approved
      'im.chat',              // Business Messaging API - chat access
      'business.management',  // Business Messaging API - business account management
      'user.info.profile',    // Optional - only if app is approved for this scope
    ];


    const allowedScopes = platformConfig.allowedScopes || ['user.info.basic'];
    const minimumRequiredScope = 'user.info.basic';
    
    if (!allowedScopes.includes(minimumRequiredScope)) {
      toast({
        title: "Configuration Error",
        description: `TikTok app configuration is invalid. The minimum required scope '${minimumRequiredScope}' is not approved for this app. Please contact your administrator to update the TikTok platform configuration.`,
        variant: "destructive"
      });
      return;
    }


    const REQUIRED_SCOPES = [
      'user.info.basic',      // Minimum required - always approved
      'im.chat',              // Business Messaging API - chat access (REQUIRED)
      'business.management'   // Business Messaging API - business account management (REQUIRED)
    ];
    


    const scopesToRequest = allowedScopes.filter(scope => APPROVED_SCOPES.includes(scope));
    

    const filteredScopes = allowedScopes.filter(scope => !APPROVED_SCOPES.includes(scope));
    



    for (const requiredScope of REQUIRED_SCOPES) {
      if (!scopesToRequest.includes(requiredScope)) {
        scopesToRequest.push(requiredScope);
      }
    }
    

    if (filteredScopes.length > 0) {
      toast({
        title: "Scopes Filtered",
        description: `The following scopes were skipped as they are not approved for this TikTok app: ${filteredScopes.join(', ')}. Only approved scopes will be requested.`,
        variant: "default"
      });
    }

    const csrfState = Math.random().toString(36).substring(7);

    try {
      const prepareResponse = await fetch('/api/tiktok/oauth/prepare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          state: csrfState,
          accountName: accountName
        })
      });

      if (!prepareResponse.ok) {
        throw new Error('Failed to prepare OAuth');
      }

      const prepareData = await prepareResponse.json();
      
      if (!prepareData.code_challenge) {
        throw new Error('Code challenge not received from server');
      }


      setCodeChallenge(prepareData.code_challenge);

      const scopes = scopesToRequest.join(',');

      const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
      authUrl.searchParams.append('client_key', platformConfig.clientKey);
      authUrl.searchParams.append('scope', scopes);
      authUrl.searchParams.append('response_type', 'code');
      authUrl.searchParams.append('redirect_uri', platformConfig.redirectUrl);
      authUrl.searchParams.append('state', csrfState);
      authUrl.searchParams.append('code_challenge', prepareData.code_challenge);
      authUrl.searchParams.append('code_challenge_method', 'S256');

      setAuthorizationUrl(authUrl.toString());
      setWizardStep('authorize');
    } catch (error) {
      console.error('Error preparing OAuth:', error);
      toast({
        title: "OAuth Preparation Failed",
        description: error instanceof Error ? error.message : "Failed to prepare OAuth flow. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleConnectClick = () => {
    if (!accountName.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter an account name.",
        variant: "destructive"
      });
      return;
    }

    generateAuthorizationUrl();
  };

  const handleOAuthRedirect = () => {
    if (authorizationUrl && codeChallenge) {
      window.location.href = authorizationUrl;
    } else {
      toast({
        title: "Not Ready",
        description: "OAuth flow is not ready. Please wait for preparation to complete.",
        variant: "destructive"
      });
    }
  };

  const handleClose = () => {
    setAccountName('');
    setAuthorizationUrl('');
    setCodeChallenge(null);
    setWizardStep('requirements');
    onClose();
  };

  if (checkingConfig) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <i className="ri-tiktok-line text-2xl"></i>
              Connect TikTok Account
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!platformConfigured) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <i className="ri-tiktok-line text-2xl"></i>
              Connect TikTok Account
            </DialogTitle>
            <DialogDescription>
              TikTok platform configuration required
            </DialogDescription>
          </DialogHeader>

          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Platform Not Configured</strong>
              <p className="mt-2">
                TikTok Business Messaging API integration has not been configured by your system administrator.
                Please contact your administrator to set up the TikTok platform configuration first.
              </p>
            </AlertDescription>
          </Alert>

          <div className="space-y-3 text-sm text-gray-600">
            <p className="font-medium">Required Setup:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Super admin must configure TikTok platform credentials</li>
              <li>TikTok App Client Key and Client Secret required</li>
              <li>TikTok Messaging Partner approval required</li>
            </ul>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <i className="ri-tiktok-line text-2xl"></i>
            Connect TikTok Account
          </DialogTitle>
          <DialogDescription>
            Connect your TikTok Business account to receive and send messages
          </DialogDescription>
        </DialogHeader>

        {!authorizationUrl ? (
          <>
            <TikTokOnboardingWizard currentStep={wizardStep === 'requirements' ? 'requirements' : 'verify_account'}>
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>TikTok Business Account Required</strong>
                  <p className="mt-2">
                    TikTok Business Messaging is only available for Business Accounts. Personal and Creator accounts are not supported.
                    <br />
                    <a 
                      href="https://www.tiktok.com/business/en-US" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="underline text-blue-600 hover:text-blue-800 mt-1 inline-block"
                    >
                      Learn how to convert to a Business Account →
                    </a>
                  </p>
                </AlertDescription>
              </Alert>

              <div className="rounded-lg border border-border p-3 mt-3 space-y-2 bg-muted/30">
                <h4 className="text-sm font-medium">Before you start</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {PREREQUISITES_CHECKLIST.map((item, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-border p-3 mt-3 space-y-2">
                <h4 className="text-sm font-medium">Permissions we will request</h4>
                <p className="text-xs text-muted-foreground">The following scopes will be requested from TikTok:</p>
                <ul className="space-y-2 mt-2">
                  {SCOPE_EXPLANATIONS.map(({ scope, label, description }) => (
                    <li key={scope} className="flex gap-2 text-sm">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{scope}</code>
                      <span className="text-muted-foreground">— {label}: {description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </TikTokOnboardingWizard>

            <div className="space-y-4 mt-4">
              {platformConfig?.partnerId && platformConfig?.partnerName && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-xs">
                    <strong>Partner Configuration:</strong> {platformConfig.partnerName}
                    <br />
                    <span className="text-gray-600">Business Messaging API enabled</span>
                  </AlertDescription>
                </Alert>
              )}
              
              {platformConfig && (!platformConfig.partnerId || !platformConfig.partnerName) && (
                <Alert variant="default">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    <strong>Basic Configuration:</strong> Platform configured for Login Kit only
                    <br />
                    <span className="text-gray-600">Messaging features require TikTok Marketing Partner approval</span>
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="accountName">
                  Account Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="accountName"
                  name="accountName"
                  placeholder="e.g., My TikTok Business"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  disabled={loading}
                />
                <p className="text-xs text-gray-500">
                  A friendly name to identify this TikTok connection
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <i className="ri-information-line"></i>
                  What happens next?
                </h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
                  <li>You'll be redirected to TikTok to authorize access</li>
                  <li>Log in with your TikTok Business account</li>
                  <li>Grant permissions for messaging and business management</li>
                  <li>Your Business Account will be verified automatically</li>
                  <li>You'll be redirected back to complete setup</li>
                </ol>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <strong>Required Permissions:</strong> User profile, business messaging access, business management
                  <br />
                  <strong>Note:</strong> TikTok Business Messaging API requires partner approval
                </AlertDescription>
              </Alert>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button
                onClick={handleConnectClick}
                disabled={loading || !accountName.trim()}
                className="btn-brand-primary"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Continue with TikTok
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <TikTokOnboardingWizard currentStep="authorize">
              <Alert>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  <strong>Ready to Connect</strong>
                  <p className="mt-2">
                    Click the button below to authorize PowerChat to access your TikTok Business account.
                  </p>
                </AlertDescription>
              </Alert>

              <div className="border rounded-lg p-4 bg-blue-50 space-y-2 mt-3">
                <p className="text-sm font-medium text-blue-900">
                  <i className="ri-shield-check-line mr-2"></i>
                  Secure OAuth 2.0 Authentication
                </p>
                <p className="text-xs text-blue-700">
                  Your credentials are never stored. We only receive a secure access token from TikTok.
                </p>
              </div>
            </TikTokOnboardingWizard>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleOAuthRedirect}
                className="btn-brand-primary"
                disabled={!authorizationUrl || !codeChallenge}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Authorize with TikTok
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

