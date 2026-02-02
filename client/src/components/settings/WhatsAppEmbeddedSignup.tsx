import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { initFacebookSDK, setupWhatsAppSignupListener, launchWhatsAppSignup, FacebookLoginResponse } from '@/lib/facebook-sdk';
import { fetchMetaPartnerConfig, validateFacebookConfig, clearConfigCache } from '@/lib/facebook-config';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface TermsState {
  acceptTerms: boolean;
  acceptPrivacyPolicy: boolean;
}

export function WhatsAppEmbeddedSignup({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const [sdkInitialized, setSdkInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [configValid, setConfigValid] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [partnerConfig, setPartnerConfig] = useState<any>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [connectionName, setConnectionName] = useState('');
  const [signupMode, setSignupMode] = useState<'standard' | 'coexistence'>('standard');
  const [enableHistorySync, setEnableHistorySync] = useState(false);
  const signupProcessedRef = useRef(false); // Track if signup was processed via message listener (use ref for immediate updates)

  const [terms, setTerms] = useState<TermsState>({
    acceptTerms: false,
    acceptPrivacyPolicy: false
  });

  useEffect(() => {
    if (signupMode === 'standard' && enableHistorySync) {
      setEnableHistorySync(false);
    }
  }, [signupMode, enableHistorySync]);

  useEffect(() => {
    if (isOpen) {
      signupProcessedRef.current = false; // Reset flag when dialog opens
      loadPartnerConfiguration();
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
          description: "Meta WhatsApp Business API is not configured. Please contact your administrator.",
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

      setupWhatsAppSignupListener((data) => {
   
        
        let signupData = data;
        if (data.data && typeof data.data === 'object' && !data.business_account_id && !data.wabaId) {
          const nestedData = data.data;
          signupData = {
            ...data,
            ...nestedData,

            business_account_id: nestedData.waba_id || nestedData.business_account_id,
            wabaId: nestedData.waba_id,
            businessId: nestedData.business_id || data.businessId, // Preserve businessId for business-level template fetching
            phoneNumberId: nestedData.phone_number_id,
            phone_numbers: nestedData.phone_numbers || (nestedData.phone_number_id ? [{
              phone_number_id: nestedData.phone_number_id,
              phone_number: nestedData.phone_number || '',
              display_name: nestedData.display_name || ''
            }] : [])
          };
        }

   


        const isCoexistenceOnboarding = signupData.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING';
        
     


        const hasWaba = !!(
          signupData.business_account_id || 
          signupData.wabaId || 
          signupData.waba_id ||
          signupData.businessAccountId || // Alternative camelCase format
          (signupData.data && (signupData.data.business_account_id || signupData.data.waba_id || signupData.data.wabaId))
        );
        


        const hasPhoneNumber = !!(
          signupData.phoneNumberId || 
          signupData.phone_number_id || 
          (signupData.phone_numbers && signupData.phone_numbers.length > 0) ||
          (signupData.phoneNumbers && signupData.phoneNumbers.length > 0) || // Alternative camelCase format
          (signupData.data && (
            signupData.data.phone_number_id || 
            signupData.data.phoneNumberId ||
            (signupData.data.phone_numbers && signupData.data.phone_numbers.length > 0) ||
            (signupData.data.phoneNumbers && signupData.data.phoneNumbers.length > 0)
          ))
        );
        

        if (isCoexistenceOnboarding && hasWaba) {
        
          signupProcessedRef.current = true;
          handleSuccessfulSignup(signupData);
        } else if (hasWaba && hasPhoneNumber) {
       
          signupProcessedRef.current = true; // Mark that signup is being processed via message listener (use ref for immediate update)
          handleSuccessfulSignup(signupData);
        } else if (signupData.screen) {
          toast({
            title: "Signup Incomplete",
            description: `Signup was abandoned at the ${signupData.screen} screen. Please try again.`,
            variant: "destructive"
          });
        } else {
          toast({
            title: "Signup Error",
            description: "Received incomplete signup data. Please check the console for details.",
            variant: "destructive"
          });
        }
      });
      
      

    } catch (error) {
      setConfigError('Failed to load partner configuration');
      toast({
        title: "Integration Error",
        description: "Failed to initialize the WhatsApp Business signup process. Please try again later.",
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

  const handleTermsChange = (checked: boolean) => {
    setTerms({
      ...terms,
      acceptTerms: checked
    });
  };

  const handlePrivacyPolicyChange = (checked: boolean) => {
    setTerms({
      ...terms,
      acceptPrivacyPolicy: checked
    });
  };

  const handleFacebookLoginResponse = (response: FacebookLoginResponse) => {
    
    

    if (signupProcessedRef.current) {
      
      return;
    }
    
    if (response.authResponse && response.authResponse.code) {
      
      
      exchangeCodeForWhatsAppConnection(response.authResponse.code);
    } else {
      setLoading(false);
      toast({
        title: "Signup Cancelled",
        description: "The WhatsApp Business signup process was cancelled or encountered an error.",
        variant: "destructive"
      });
    }
  };

  const exchangeCodeForWhatsAppConnection = async (code: string) => {
    try {
      const response = await fetch('/api/channel-connections/whatsapp-embedded-signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code: code,
          connectionName: connectionName.trim() || undefined
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        
        toast({
          title: "Connection Successful",
          description: "Your WhatsApp Business account has been connected successfully.",
        });
        
        
        onSuccess();
        onClose();
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Failed to connect WhatsApp Business account');
      }
    } catch (error: any) {
      toast({
        title: "Connection Error",
        description: error.message || "Failed to connect your WhatsApp Business account.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSuccessfulSignup = async (signupData: any) => {
    const finalConnectionName = connectionName.trim() || 
      `WhatsApp Business - ${signupData.business_account_name || signupData.wabaId || 'Account'}`;


    let normalizedSignupData = signupData;
    

    if (signupData.wabaId && signupData.phoneNumberId && !signupData.business_account_id) {
      
      normalizedSignupData = {
        business_account_id: signupData.wabaId,
        business_account_name: 'WhatsApp Business Account',
        businessId: signupData.businessId, // Preserve businessId for business-level template fetching
        phone_numbers: [{
          phone_number_id: signupData.phoneNumberId,
          phone_number: '', // Will be fetched from API if needed
          display_name: 'WhatsApp Business'
        }]
      };
    }


    const hasBusinessId = !!(normalizedSignupData.businessId || normalizedSignupData.data?.business_id);
    if (normalizedSignupData.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' && !hasBusinessId) {
      console.warn('⚠️ [WHATSAPP EMBEDDED SIGNUP] businessId missing in coexistence mode payload:', {
        event: normalizedSignupData.event,
        availableKeys: Object.keys(normalizedSignupData),
        hasNestedData: !!normalizedSignupData.data,
        nestedDataKeys: normalizedSignupData.data ? Object.keys(normalizedSignupData.data) : [],
        impact: 'Backend will not enable business-level template fetching'
      });
    }

    try {
      setLoading(true);

      const historySyncEnabledForRequest = signupMode === 'coexistence' ? enableHistorySync : false;

      const response = await fetch('/api/channel-connections/meta-whatsapp-embedded-signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          connectionName: finalConnectionName,
          signupData: normalizedSignupData,
          signupMode: signupMode,
          enableHistorySync: historySyncEnabledForRequest
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        

        if (result.connections?.length === 0) {
          

          if (signupMode === 'coexistence') {
            toast({
              title: "Connection Issue",
              description: "WhatsApp Business Account connected, but no phone numbers found. Please verify your WABA has registered phone numbers and try again.",
              variant: "destructive"
            });
          } else {
            toast({
              title: "Connection Created with Warnings",
              description: "WhatsApp Business account was connected, but phone number details are being configured. Please refresh the page in a moment.",
              variant: "default"
            });
          }
        } else {

          if (signupMode === 'coexistence') {
            toast({
              title: "Connection Successful",
              description: `WhatsApp Business Account connected successfully. ${result.phoneNumbers?.length || 0} phone number(s) added.`,
            });
          } else {
            toast({
              title: "Connection Successful",
              description: `WhatsApp Business Account created successfully. ${result.phoneNumbers?.length || 0} phone number(s) added.`,
            });
          }
        }
        
        onSuccess();
        onClose();
      } else {
        const error = await response.json();

        console.error('❌ [WHATSAPP EMBEDDED SIGNUP] API error response:', {
          status: response.status,
          statusText: response.statusText,
          error: error,
          fullError: error
        });
        throw new Error(error.message || 'Failed to connect WhatsApp Business account');
      }
    } catch (error: any) {

      console.error('❌ [WHATSAPP EMBEDDED SIGNUP] Error in handleSuccessfulSignup:', {
        error: error.message,
        stack: error.stack,
        fullError: error
      });
      toast({
        title: "Connection Error",
        description: error.message || "Failed to connect your WhatsApp Business account.",
        variant: "destructive"
      });
    } finally {
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

    if (!terms.acceptTerms || !terms.acceptPrivacyPolicy) {
      toast({
        title: "Terms Required",
        description: "Please accept both the terms and privacy policy to continue.",
        variant: "destructive"
      });
      return;
    }

    if (!configValid) {
      toast({
        title: "Configuration Error",
        description: configError || "WhatsApp Business API is not properly configured.",
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

    if (!partnerConfig?.configId) {
      toast({
        title: "Configuration Error",
        description: "WhatsApp Configuration ID is not set in partner configuration",
        variant: "destructive"
      });
      return;
    }

    
    try {
      launchWhatsAppSignup(
        partnerConfig.configId,
        handleFacebookLoginResponse,
        signupMode
      );
      
    } catch (error: any) {
      toast({
        title: "Launch Error",
        description: error.message || "Failed to launch WhatsApp Business signup flow.",
        variant: "destructive"
      });
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>WhatsApp Business API - Easy Setup</DialogTitle>
          <DialogDescription>
            Connect your WhatsApp Business account to the Cloud API. Choose between creating a new account or connecting an existing WhatsApp Business app.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 mb-4">
            <h3 className="text-sm font-medium mb-2">How it works:</h3>
            <ol className="list-decimal pl-5 text-sm text-gray-600 space-y-1">
            {signupMode === 'standard' ? (
              <>
                <li>A signup form will open from Meta to connect your business account</li>
                <li>Select an existing Facebook Business Manager account or create a new one</li>
                <li>Enter your business details and verify your phone number</li>
                <li>Once the signup is complete, a WhatsApp Business API connection will be created for you to use in the app</li>
              </>
            ) : (
              <>
                <li>A signup form will open from Meta to connect your existing WhatsApp Business app</li>
                <li>Select your existing Facebook Business Manager account</li>
                <li>Choose the WhatsApp Business app you want to connect</li>
                <li>Once connected, your app will sync with the Cloud API and messages will be available in both places</li>
              </>
            )}
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
                  <strong>Note:</strong> This feature requires configuration of a Meta Partner App with WhatsApp Business permissions.
                  Contact your administrator to set up the app credentials.
                </p>
              </div>
            )}
          </div>
          
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-sm font-medium mb-3 block">Select Signup Mode</Label>
              <RadioGroup
                value={signupMode}
                onValueChange={(value) => setSignupMode(value as 'standard' | 'coexistence')}
                className="space-y-3"
              >
                <div className="flex items-start space-x-3 p-3 rounded-lg border border-gray-200 hover:border-primary transition-colors">
                  <RadioGroupItem value="standard" id="mode-standard" className="mt-1" />
                  <label
                    htmlFor="mode-standard"
                    className="flex-1 cursor-pointer"
                  >
                    <div className="font-medium text-sm">New WhatsApp Business Account</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Create a new WhatsApp Business API account through Meta's embedded signup
                    </div>
                  </label>
                </div>
                <div className="flex items-start space-x-3 p-3 rounded-lg border border-gray-200 hover:border-primary transition-colors">
                  <RadioGroupItem value="coexistence" id="mode-coexistence" className="mt-1" />
                  <label
                    htmlFor="mode-coexistence"
                    className="flex-1 cursor-pointer"
                  >
                    <div className="font-medium text-sm">Existing WhatsApp Business App</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Connect your existing WhatsApp Business app (Coexistence mode). Your app will sync with the Cloud API.
                    </div>
                  </label>
                </div>
              </RadioGroup>
              {signupMode === 'coexistence' && (
                <div className="mt-3 space-y-2">
                  <div className="flex p-2 text-amber-800 bg-amber-50 rounded border border-amber-200">
                    <i className="ri-information-line mt-0.5 mr-2"></i>
                    <p className="text-xs">
                      <strong>Note:</strong> When using Coexistence mode, some features like disappearing messages, broadcast lists, and message edit/revoke will be disabled.
                    </p>
                  </div>
                  <div className="flex items-start space-x-2 p-3 rounded-lg border border-gray-200">
                    <Checkbox 
                      id="enableHistorySync" 
                      checked={enableHistorySync}
                      onCheckedChange={(checked) => setEnableHistorySync(checked === true)}
                    />
                    <div className="flex-1">
                      <label
                        htmlFor="enableHistorySync"
                        className="text-sm font-medium leading-none cursor-pointer"
                      >
                        Sync existing message history (up to 6 months)
                      </label>
                      <p className="text-xs text-gray-500 mt-1">
                        This will import up to 6 months of chat history from your WhatsApp Business app. Sync may take 4-6 hours depending on message volume.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div>
              <Label htmlFor="connectionName">Connection Name</Label>
              <Input
                id="connectionName"
                value={connectionName}
                onChange={(e) => setConnectionName(e.target.value)}
                placeholder="e.g. My WhatsApp Business"
                className="mt-1"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Give your WhatsApp connection a name to easily identify it
              </p>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="terms" 
                checked={terms.acceptTerms}
                onCheckedChange={(checked) => handleTermsChange(checked === true)}
              />
              <label
                htmlFor="terms"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                I agree to the <a href="https://www.whatsapp.com/legal/business-terms" target="_blank" rel="noopener noreferrer" className="text-blue underline">WhatsApp Business API Terms of Service</a>
              </label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="privacy" 
                checked={terms.acceptPrivacyPolicy}
                onCheckedChange={(checked) => handlePrivacyPolicyChange(checked === true)}
              />
              <label
                htmlFor="privacy"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                I agree to the <a href="https://www.facebook.com/privacy/policy/" target="_blank" rel="noopener noreferrer" className="text-blue underline">Meta Privacy Policy</a>
              </label>
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={launchSignup}
            disabled={loading || !sdkInitialized || !configValid || configLoading || !connectionName.trim()}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <i className="ri-facebook-fill w-4 h-4 mr-2 text-white-600"></i>
                Easy Signup
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}