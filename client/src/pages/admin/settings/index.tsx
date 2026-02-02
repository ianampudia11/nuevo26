import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useLocation } from 'wouter';
import { settingsEvents, SETTINGS_EVENTS } from '@/lib/settings-events';

import { useBranding } from '@/contexts/branding-context';
import { useCurrency } from '@/contexts/currency-context';
import { useTranslation } from '@/hooks/use-translation';
import AdminLayout from '@/components/admin/AdminLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { Loader2, Upload, Check, CreditCard, Palette, Globe, FileImage, UserPlus, Mail, Database, RefreshCw, Settings, Key, Code, Copy, Eye, EyeOff, Trash2, Plus, Paintbrush, Minus } from 'lucide-react';
import BackupManagement from '@/components/admin/BackupManagement';
import SystemUpdatesTab from '@/components/settings/SystemUpdatesTab';

import { MetaPartnerConfigurationForm } from '@/components/settings/MetaPartnerConfigurationForm';
import { TikTokPlatformConfigForm } from '@/components/settings/TikTokPlatformConfigForm';
import AiCredentialsTab from '@/components/admin/AiCredentialsTab';
import SystemUsageAnalytics from '@/components/admin/SystemUsageAnalytics';
import { AuthBackgroundPreviewModal } from '@/components/admin/AuthBackgroundPreviewModal';


const BUILT_IN_CURRENCY_OPTIONS = [
  { code: 'ARS', label: 'ARS - Argentine Peso' },
  { code: 'BRL', label: 'BRL - Brazilian Real' },
  { code: 'MXN', label: 'MXN - Mexican Peso' },
  { code: 'CLP', label: 'CLP - Chilean Peso' },
  { code: 'COP', label: 'COP - Colombian Peso' },
  { code: 'PEN', label: 'PEN - Peruvian Sol' },
  { code: 'UYU', label: 'UYU - Uruguayan Peso' },
  { code: 'PYG', label: 'PYG - Paraguayan Guarani' },
  { code: 'BOB', label: 'BOB - Bolivian Boliviano' },
  { code: 'VEF', label: 'VEF - Venezuelan Bolívar' },
  { code: 'PKR', label: 'PKR - Pakistani Rupee' },
  { code: 'INR', label: 'INR - Indian Rupee' },
  { code: 'USD', label: 'USD - US Dollar' },
  { code: 'EUR', label: 'EUR - Euro' },
] as const;


const BUILT_IN_CURRENCY_CODES: string[] = BUILT_IN_CURRENCY_OPTIONS.map(opt => opt.code);

interface GradientConfigProps {
  mode: 'simple' | 'advanced';
  simpleConfig: { startColor: string; endColor: string; direction: string };
  advancedConfig: { stops: Array<{ color: string; position: number }>; angle: number };
  onModeChange: (mode: 'simple' | 'advanced') => void;
  onSimpleChange: (config: any) => void;
  onAdvancedChange: (config: any) => void;
  idPrefix?: string;
}

const GradientConfigUI = ({ mode, simpleConfig, advancedConfig, onModeChange, onSimpleChange, onAdvancedChange, idPrefix = 'gradient' }: GradientConfigProps) => {
  const gradientDirections = [
    { value: 'to-top', label: 'To Top' },
    { value: 'to-tr', label: 'To Top Right' },
    { value: 'to-right', label: 'To Right' },
    { value: 'to-br', label: 'To Bottom Right' },
    { value: 'to-bottom', label: 'To Bottom' },
    { value: 'to-bl', label: 'To Bottom Left' },
    { value: 'to-left', label: 'To Left' },
    { value: 'to-tl', label: 'To Top Left' }
  ];


  const convertDirectionToCSS = (direction: string): string => {
    const directionMap: Record<string, string> = {
      'to-right': 'to right',
      'to-left': 'to left',
      'to-top': 'to top',
      'to-bottom': 'to bottom',
      'to-br': 'to bottom right',
      'to-bl': 'to bottom left',
      'to-tr': 'to top right',
      'to-tl': 'to top left'
    };
    return directionMap[direction] || direction;
  };

  const getGradientPreview = () => {
    if (mode === 'simple') {
      const cssDirection = convertDirectionToCSS(simpleConfig.direction);
      return `linear-gradient(${cssDirection}, ${simpleConfig.startColor}, ${simpleConfig.endColor})`;
    } else {
      const stops = advancedConfig.stops.map(s => `${s.color} ${s.position}%`).join(', ');
      return `linear-gradient(${advancedConfig.angle}deg, ${stops})`;
    }
  };


  const startColorInputRef = useRef<HTMLInputElement>(null);
  const endColorInputRef = useRef<HTMLInputElement>(null);
  const stopColorInputRefs = useRef<Record<number, HTMLInputElement>>({});

  const addColorStop = () => {
    const newStop = {
      color: '#7C3AED',
      position: advancedConfig.stops.length > 0
        ? Math.min(100, advancedConfig.stops[advancedConfig.stops.length - 1].position + 20)
        : 50
    };
    onAdvancedChange({
      ...advancedConfig,
      stops: [...advancedConfig.stops, newStop]
    });
  };

  const removeColorStop = (index: number) => {
    if (advancedConfig.stops.length <= 2) return;
    onAdvancedChange({
      ...advancedConfig,
      stops: advancedConfig.stops.filter((_, i) => i !== index)
    });
  };

  const updateColorStop = (index: number, field: 'color' | 'position', value: string | number) => {
    const newStops = [...advancedConfig.stops];
    newStops[index] = { ...newStops[index], [field]: value };
    onAdvancedChange({
      ...advancedConfig,
      stops: newStops
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Gradient Mode</Label>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-muted-foreground">Simple</span>
          <Switch
            checked={mode === 'advanced'}
            onCheckedChange={(checked) => onModeChange(checked ? 'advanced' : 'simple')}
          />
          <span className="text-sm text-muted-foreground">Advanced</span>
        </div>
      </div>

      {/* Gradient Preview */}
      <div className="border rounded-md p-4 bg-muted">
        <div
          className="w-full h-24 rounded"
          style={{ background: getGradientPreview() }}
        />
      </div>

      {mode === 'simple' ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Start Color</Label>
            <div className="flex items-center space-x-2">
              <div
                className="w-10 h-10 rounded border cursor-pointer"
                style={{ backgroundColor: simpleConfig.startColor }}
                onClick={() => startColorInputRef.current?.click()}
              />
              <Input
                ref={startColorInputRef}
                id={`${idPrefix}-start-color`}
                type="color"
                value={simpleConfig.startColor}
                onChange={(e) => onSimpleChange({ ...simpleConfig, startColor: e.target.value })}
                className="w-16 h-10 p-1"
              />
              <Input
                type="text"
                value={simpleConfig.startColor}
                onChange={(e) => onSimpleChange({ ...simpleConfig, startColor: e.target.value })}
                placeholder="#4F46E5"
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>End Color</Label>
            <div className="flex items-center space-x-2">
              <div
                className="w-10 h-10 rounded border cursor-pointer"
                style={{ backgroundColor: simpleConfig.endColor }}
                onClick={() => endColorInputRef.current?.click()}
              />
              <Input
                ref={endColorInputRef}
                id={`${idPrefix}-end-color`}
                type="color"
                value={simpleConfig.endColor}
                onChange={(e) => onSimpleChange({ ...simpleConfig, endColor: e.target.value })}
                className="w-16 h-10 p-1"
              />
              <Input
                type="text"
                value={simpleConfig.endColor}
                onChange={(e) => onSimpleChange({ ...simpleConfig, endColor: e.target.value })}
                placeholder="#7C3AED"
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Direction</Label>
            <Select
              value={simpleConfig.direction}
              onValueChange={(value) => onSimpleChange({ ...simpleConfig, direction: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {gradientDirections.map((dir) => (
                  <SelectItem key={dir.value} value={dir.value}>
                    {dir.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Color Stops</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addColorStop}
                disabled={advancedConfig.stops.length >= 10}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Stop
              </Button>
            </div>
            {advancedConfig.stops.map((stop, index) => (
              <div key={index} className="flex items-center space-x-2">
                <div
                  className="w-10 h-10 rounded border cursor-pointer"
                  style={{ backgroundColor: stop.color }}
                  onClick={() => stopColorInputRefs.current[index]?.click()}
                />
                <Input
                  ref={(el) => {
                    if (el) stopColorInputRefs.current[index] = el;
                  }}
                  id={`${idPrefix}-stop-color-${index}`}
                  type="color"
                  value={stop.color}
                  onChange={(e) => updateColorStop(index, 'color', e.target.value)}
                  className="w-16 h-10 p-1"
                />
                <Input
                  type="text"
                  value={stop.color}
                  onChange={(e) => updateColorStop(index, 'color', e.target.value)}
                  placeholder="#4F46E5"
                  className="flex-1"
                />
                <div className="flex items-center space-x-2 flex-1">
                  <Slider
                    value={[stop.position]}
                    onValueChange={(values) => updateColorStop(index, 'position', values[0])}
                    min={0}
                    max={100}
                    step={1}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    value={stop.position}
                    onChange={(e) => updateColorStop(index, 'position', parseInt(e.target.value) || 0)}
                    min={0}
                    max={100}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeColorStop(index)}
                  disabled={advancedConfig.stops.length <= 2}
                >
                  <Minus className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label>Angle: {advancedConfig.angle}°</Label>
            <div className="flex items-center space-x-2">
              <Slider
                value={[advancedConfig.angle]}
                onValueChange={(values) => onAdvancedChange({ ...advancedConfig, angle: values[0] })}
                min={0}
                max={360}
                step={1}
                className="flex-1"
              />
              <Input
                type="number"
                value={advancedConfig.angle}
                onChange={(e) => onAdvancedChange({ ...advancedConfig, angle: parseInt(e.target.value) || 0 })}
                min={0}
                max={360}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">°</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { refreshBranding } = useBranding();
  const { formatCurrency } = useCurrency();
  const [location] = useLocation();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  

  const [adminAuthBgFile, setAdminAuthBgFile] = useState<File | null>(null);
  const [adminAuthBgPreview, setAdminAuthBgPreview] = useState<string | null>(null);
  const [adminAuthBgConfig, setAdminAuthBgConfig] = useState({
    backgroundColor: '',
    gradientMode: 'simple' as 'simple' | 'advanced',
    simpleGradient: {
      startColor: '#4F46E5',
      endColor: '#7C3AED',
      direction: 'to-br' as const
    },
    advancedGradient: {
      stops: [
        { color: '#4F46E5', position: 0 },
        { color: '#7C3AED', position: 100 }
      ],
      angle: 135
    },
    priority: 'image' as 'image' | 'color' | 'layer'
  });


  const [userAuthBgFile, setUserAuthBgFile] = useState<File | null>(null);
  const [userAuthBgPreview, setUserAuthBgPreview] = useState<string | null>(null);
  const [userAuthBgConfig, setUserAuthBgConfig] = useState({
    backgroundColor: '',
    gradientMode: 'simple' as 'simple' | 'advanced',
    simpleGradient: {
      startColor: '#4F46E5',
      endColor: '#7C3AED',
      direction: 'to-br' as const
    },
    advancedGradient: {
      stops: [
        { color: '#4F46E5', position: 0 },
        { color: '#7C3AED', position: 100 }
      ],
      angle: 135
    },
    priority: 'image' as 'image' | 'color' | 'layer'
  });
  
  const [showPartnerConfigModal, setShowPartnerConfigModal] = useState(false);
  const [showMetaPartnerConfigModal, setShowMetaPartnerConfigModal] = useState(false);
  const [showTikTokPlatformConfigModal, setShowTikTokPlatformConfigModal] = useState(false);
  const [showAuthPreviewModal, setShowAuthPreviewModal] = useState(false);
  const [brandingUpdateKey, setBrandingUpdateKey] = useState(0);

  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const tabFromUrl = urlParams.get('tab') || 'branding';
  const [activeTab, setActiveTab] = useState(tabFromUrl);

  useEffect(() => {
    const newUrlParams = new URLSearchParams(location.split('?')[1] || '');
    const newTabFromUrl = newUrlParams.get('tab') || 'branding';
    setActiveTab(newTabFromUrl);
  }, [location]);


  useEffect(() => {
    const handleBrandingUpdate = () => {
      setBrandingUpdateKey(prev => prev + 1);
    };

    window.addEventListener('brandingUpdated', handleBrandingUpdate);
    return () => window.removeEventListener('brandingUpdated', handleBrandingUpdate);
  }, []);

  const [brandingForm, setBrandingForm] = useState({
    appName: 'PowerChat',
    primaryColor: '#333235',
    secondaryColor: '#4F46E5',
    defaultTheme: '' as 'dark' | 'light' | ''
  });

  const [stripeForm, setStripeForm] = useState({
    publishableKey: '',
    secretKey: '',
    webhookSecret: '',
    testMode: true,
    enabled: false
  });

  const [paystackForm, setPaystackForm] = useState({
    publicKey: '',
    secretKey: '',
    subaccount: '',
    webhookSecret: '',
    testMode: true,
    enabled: false
  });


  const [embedSettings, setEmbedSettings] = useState({
    width: '100%',
    height: '600px',
    showHeader: true,
    allowFullscreen: true,
    borderRadius: '8px',
    boxShadow: true
  });
  const [embedCode, setEmbedCode] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [showEmbedPreview, setShowEmbedPreview] = useState(false);

  const [registrationSettings, setRegistrationSettings] = useState({
    enabled: true,
    requireApproval: false,
    defaultPlan: ''
  });





  const [googleCalendarOAuthForm, setGoogleCalendarOAuthForm] = useState({
    enabled: false,
    client_id: '',
    client_secret: '',
    redirect_uri: ''
  });

  const [zohoCalendarOAuthForm, setZohoCalendarOAuthForm] = useState({
    enabled: false,
    client_id: '',
    client_secret: '',
    redirect_uri: ''
  });

  const [calendlyOAuthForm, setCalendlyOAuthForm] = useState({
    enabled: false,
    client_id: '',
    client_secret: '',
    webhook_signing_key: '',
    redirect_uri: ''
  });


  const [googleSheetsOAuthForm, setGoogleSheetsOAuthForm] = useState({
    enabled: false,
    client_id: '',
    client_secret: '',
    redirect_uri: ''
  });

  const [googleMapsApiKey, setGoogleMapsApiKey] = useState('');

  const [mercadoPagoForm, setMercadoPagoForm] = useState({
    clientId: '',
    clientSecret: '',
    accessToken: '',
    testMode: true,
    enabled: false
  });

  const [paypalForm, setPaypalForm] = useState({
    clientId: '',
    clientSecret: '',
    testMode: true,
    enabled: false
  });

  const [moyasarForm, setMoyasarForm] = useState({
    publishableKey: '',
    secretKey: '',
    testMode: true,
    enabled: false
  });

  const [mpesaForm, setMpesaForm] = useState({
    consumerKey: '',
    consumerSecret: '',
    businessShortcode: '',
    passkey: '',
    shortcodeType: 'paybill',
    callbackUrl: '',
    testMode: true,
    enabled: false
  });

  const [bankTransferForm, setBankTransferForm] = useState({
    accountName: '',
    accountNumber: '',
    bankName: '',
    routingNumber: '',
    swiftCode: '',
    instructions: '',
    enabled: false
  });

  const [generalSettingsForm, setGeneralSettingsForm] = useState({
    defaultCurrency: 'USD',
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    subdomainAuthentication: false,
    frontendWebsiteEnabled: false,
    planRenewalEnabled: true,
    helpSupportUrl: '',
    customCurrencies: [] as Array<{ code: string; name: string; symbol: string }>
  });

  const [smtpForm, setSmtpForm] = useState({
    enabled: false,
    host: '',
    port: 465,
    security: 'ssl',
    username: '',
    password: '',
    fromName: '',
    fromEmail: '',
    testEmail: ''
  });
  const [isSmtpPasswordVisible, setIsSmtpPasswordVisible] = useState(false);
  const [storedSmtpPassword, setStoredSmtpPassword] = useState('');

  const [customScriptsForm, setCustomScriptsForm] = useState({
    enabled: false,
    scripts: '',
    lastModified: ''
  });

  const [customCssForm, setCustomCssForm] = useState({
    enabled: false,
    css: '',
    lastModified: ''
  });

  const [showCustomCurrencyDialog, setShowCustomCurrencyDialog] = useState(false);
  const [customCurrencyForm, setCustomCurrencyForm] = useState({
    code: '',
    name: '',
    symbol: ''
  });



  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['/api/admin/settings'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/settings');
      if (!res.ok) throw new Error('Failed to fetch settings');
      return res.json();
    }
  });



  const { data: plans, isLoading: isLoadingPlans } = useQuery({
    queryKey: ['/api/admin/plans'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/plans');
      if (!res.ok) throw new Error('Failed to fetch plans');
      return res.json();
    }
  });





  const { data: googleCalendarOAuthSettings } = useQuery({
    queryKey: ['/api/admin/settings/integrations/google-calendar'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/settings/integrations/google-calendar');
      if (!res.ok) throw new Error('Failed to fetch Google Calendar OAuth settings');
      return res.json();
    }
  });

  const { data: zohoCalendarOAuthSettings } = useQuery({
    queryKey: ['/api/admin/settings/integrations/zoho-calendar'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/settings/integrations/zoho-calendar');
      if (!res.ok) throw new Error('Failed to fetch Zoho Calendar OAuth settings');
      return res.json();
    }
  });

  const { data: calendlyOAuthSettings } = useQuery({
    queryKey: ['/api/admin/settings/integrations/calendly'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/settings/integrations/calendly');
      if (!res.ok) throw new Error('Failed to fetch Calendly OAuth settings');
      return res.json();
    }
  });


  const { data: googleSheetsOAuthSettings } = useQuery({
    queryKey: ['/api/admin/settings/integrations/google-sheets'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/settings/integrations/google-sheets');
      if (!res.ok) throw new Error('Failed to fetch Google Sheets OAuth settings');
      return res.json();
    }
  });

  const { data: googleMapsSettings } = useQuery({
    queryKey: ['/api/company-settings/google-maps'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company-settings/google-maps');
      if (!res.ok) throw new Error('Failed to fetch Google Maps API key');
      return res.json();
    }
  });



  useEffect(() => {
    if (settings) {
      const brandingSetting = settings.find((s: any) => s.key === 'branding');
      if (brandingSetting) {
        setBrandingForm(brandingSetting.value);
      }

      const logoSetting = settings.find((s: any) => s.key === 'branding_logo');
      if (logoSetting) {
        setLogoPreview(logoSetting.value);
      }

      const faviconSetting = settings.find((s: any) => s.key === 'branding_favicon');
      if (faviconSetting) {
        setFaviconPreview(faviconSetting.value);
      }


      const adminAuthBgSetting = settings.find((s: any) => s.key === 'branding_admin_auth_background');
      if (adminAuthBgSetting) {
        setAdminAuthBgPreview(adminAuthBgSetting.value);
      }


      const userAuthBgSetting = settings.find((s: any) => s.key === 'branding_user_auth_background');
      if (userAuthBgSetting) {
        setUserAuthBgPreview(userAuthBgSetting.value);
      }


      const authBgConfigSetting = settings.find((s: any) => s.key === 'auth_background_config');
      if (authBgConfigSetting?.value) {
        const config = authBgConfigSetting.value;

        if (config.adminAuthBackground) {
          const adminConfig = config.adminAuthBackground;
          setAdminAuthBgConfig(prev => ({
            ...prev,
            backgroundColor: adminConfig.backgroundColor || '',
            priority: adminConfig.priority || 'image',
            gradientMode: adminConfig.gradientConfig?.mode === 'advanced' ? 'advanced' : 'simple',
            simpleGradient: adminConfig.gradientConfig?.mode === 'simple' && adminConfig.gradientConfig?.simple
              ? adminConfig.gradientConfig.simple
              : prev.simpleGradient,
            advancedGradient: adminConfig.gradientConfig?.mode === 'advanced' && adminConfig.gradientConfig?.advanced
              ? adminConfig.gradientConfig.advanced
              : prev.advancedGradient
          }));
        }

        if (config.userAuthBackground) {
          const userConfig = config.userAuthBackground;
          setUserAuthBgConfig(prev => ({
            ...prev,
            backgroundColor: userConfig.backgroundColor || '',
            priority: userConfig.priority || 'image',
            gradientMode: userConfig.gradientConfig?.mode === 'advanced' ? 'advanced' : 'simple',
            simpleGradient: userConfig.gradientConfig?.mode === 'simple' && userConfig.gradientConfig?.simple
              ? userConfig.gradientConfig.simple
              : prev.simpleGradient,
            advancedGradient: userConfig.gradientConfig?.mode === 'advanced' && userConfig.gradientConfig?.advanced
              ? userConfig.gradientConfig.advanced
              : prev.advancedGradient
          }));
        }
      }

      const registrationSetting = settings.find((s: any) => s.key === 'registration_settings');
      if (registrationSetting) {
        setRegistrationSettings(registrationSetting.value);
      }

      const stripeSetting = settings.find((s: any) => s.key === 'payment_stripe');
      if (stripeSetting) {
        setStripeForm({
          ...stripeSetting.value,
          secretKey: stripeSetting.value.secretKey ? '••••••••' : ''
        });
      }

      const mercadoPagoSetting = settings.find((s: any) => s.key === 'payment_mercadopago');
      if (mercadoPagoSetting) {
        setMercadoPagoForm({
          ...mercadoPagoSetting.value,
          clientSecret: mercadoPagoSetting.value.clientSecret ? '••••••••' : '',
          accessToken: mercadoPagoSetting.value.accessToken ? '••••••••' : ''
        });
      }

      const paypalSetting = settings.find((s: any) => s.key === 'payment_paypal');
      if (paypalSetting) {
        setPaypalForm({
          ...paypalSetting.value,
          clientSecret: paypalSetting.value.clientSecret ? '••••••••' : ''
        });
      }

      const paystackSetting = settings.find((s: any) => s.key === 'payment_paystack');
      if (paystackSetting) {
        setPaystackForm({
          ...paystackSetting.value,
          secretKey: paystackSetting.value.secretKey ? '••••••••' : ''
        });
      }

      const moyasarSetting = settings.find((s: any) => s.key === 'payment_moyasar');
      if (moyasarSetting) {
        setMoyasarForm({
          ...moyasarSetting.value,
          secretKey: moyasarSetting.value.secretKey ? '••••••••' : ''
        });
      }

      const mpesaSetting = settings.find((s: any) => s.key === 'payment_mpesa');
      if (mpesaSetting) {
        setMpesaForm({
          ...mpesaSetting.value
        });
      }

      const bankTransferSetting = settings.find((s: any) => s.key === 'payment_bank_transfer');
      if (bankTransferSetting) {
        setBankTransferForm(bankTransferSetting.value);
      }

      const generalSetting = settings.find((s: any) => s.key === 'general_settings');
      if (generalSetting && generalSetting.value) {
        const settingsValue = generalSetting.value as any;
        setGeneralSettingsForm({
          defaultCurrency: settingsValue.defaultCurrency || 'USD',
          dateFormat: settingsValue.dateFormat || 'MM/DD/YYYY',
          timeFormat: settingsValue.timeFormat || '12h',
          subdomainAuthentication: settingsValue.subdomainAuthentication || false,
          frontendWebsiteEnabled: settingsValue.frontendWebsiteEnabled !== undefined ? settingsValue.frontendWebsiteEnabled : false,
          planRenewalEnabled: settingsValue.planRenewalEnabled !== undefined ? settingsValue.planRenewalEnabled : true,
          helpSupportUrl: settingsValue.helpSupportUrl || '',
          customCurrencies: settingsValue.customCurrencies || []
        });
      }

      const smtpSetting = settings.find((s: any) => s.key === 'smtp_config');
      if (smtpSetting) {
        setStoredSmtpPassword(smtpSetting.value.password || '');
        setSmtpForm({
          ...smtpSetting.value,
          password: '' // Clear password field for security
        });
      }

      const customScriptsSetting = settings.find((s: any) => s.key === 'custom_scripts');
      if (customScriptsSetting) {
        setCustomScriptsForm({
          enabled: customScriptsSetting.value.enabled || false,
          scripts: customScriptsSetting.value.scripts || '',
          lastModified: customScriptsSetting.value.lastModified || ''
        });
      }

      const customCssSetting = settings.find((s: any) => s.key === 'custom_css');
      if (customCssSetting) {
        setCustomCssForm({
          enabled: customCssSetting.value.enabled || false,
          css: customCssSetting.value.css || '',
          lastModified: customCssSetting.value.lastModified || ''
        });
      }

    }
  }, [settings]);




  useEffect(() => {
    if (googleCalendarOAuthSettings) {

      const dynamicRedirectUri = `${window.location.origin}/api/google/calendar/callback`;

      setGoogleCalendarOAuthForm({
        ...googleCalendarOAuthSettings,
        client_secret: googleCalendarOAuthSettings.client_secret ? '••••••••' : '',
        redirect_uri: dynamicRedirectUri
      });
    }
  }, [googleCalendarOAuthSettings]);

  useEffect(() => {
    if (zohoCalendarOAuthSettings) {

      const dynamicRedirectUri = `${window.location.origin}/api/zoho/calendar/callback`;

      setZohoCalendarOAuthForm({
        ...zohoCalendarOAuthSettings,
        client_secret: zohoCalendarOAuthSettings.client_secret ? '••••••••' : '',
        redirect_uri: dynamicRedirectUri
      });
    }
  }, [zohoCalendarOAuthSettings]);

  useEffect(() => {
    if (calendlyOAuthSettings) {

      const dynamicRedirectUri = `${window.location.origin}/api/calendly/callback`;

      setCalendlyOAuthForm({
        ...calendlyOAuthSettings,
        client_secret: calendlyOAuthSettings.client_secret ? '••••••••' : '',
        webhook_signing_key: calendlyOAuthSettings.webhook_signing_key ? '••••••••' : '',
        redirect_uri: dynamicRedirectUri
      });
    }
  }, [calendlyOAuthSettings]);

  useEffect(() => {
    if (googleSheetsOAuthSettings) {

      const dynamicRedirectUri = `${window.location.origin}/api/google/sheets/callback`;

      setGoogleSheetsOAuthForm({
        ...googleSheetsOAuthSettings,
        client_secret: googleSheetsOAuthSettings.client_secret ? '••••••••' : '',
        redirect_uri: dynamicRedirectUri
      });
    }
  }, [googleSheetsOAuthSettings]);

  useEffect(() => {
    if (googleMapsSettings) {


      if (!googleMapsSettings.configured) {
        setGoogleMapsApiKey('');
      }
    }
  }, [googleMapsSettings]);



  useEffect(() => {
    if (plans && plans.length > 0 && !registrationSettings.defaultPlan) {
      const defaultPlan = plans.find((plan: any) => plan.isActive) || plans[0];
      if (defaultPlan) {
        setRegistrationSettings(prev => ({
          ...prev,
          defaultPlan: defaultPlan.id.toString()
        }));
      }
    }
  }, [plans, registrationSettings.defaultPlan]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleFaviconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFaviconFile(file);
      setFaviconPreview(URL.createObjectURL(file));
    }
  };

  const handleAdminAuthBgChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAdminAuthBgFile(file);
      setAdminAuthBgPreview(URL.createObjectURL(file));
    }
  };

  const handleUserAuthBgChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUserAuthBgFile(file);
      setUserAuthBgPreview(URL.createObjectURL(file));
    }
  };

  const uploadLogoMutation = useMutation({
    mutationFn: async () => {
      if (!logoFile) throw new Error(t('admin.settings.no_logo_file_selected', 'No logo file selected'));

      const formData = new FormData();
      formData.append('logo', logoFile);

      const res = await fetch('/api/admin/settings/branding/logo', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || t('admin.settings.failed_upload_logo', 'Failed to upload logo'));
      }

      return res.json();
    },
    onSuccess: async (data) => {

      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/branding'] });


      await refreshBranding();


      setBrandingUpdateKey(prev => prev + 1);


      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('brandingUpdated', {
          detail: { logoUrl: data.logoUrl }
        }));
      }, 100);

      toast({
        title: t('admin.settings.logo_uploaded', 'Logo uploaded'),
        description: t('admin.settings.logo_uploaded_desc', 'The logo has been uploaded successfully.')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.settings.error_uploading_logo', 'Error uploading logo'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const uploadFaviconMutation = useMutation({
    mutationFn: async () => {
      if (!faviconFile) throw new Error(t('admin.settings.no_favicon_file_selected', 'No favicon file selected'));

      const formData = new FormData();
      formData.append('favicon', faviconFile);

      const res = await fetch('/api/admin/settings/branding/favicon', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || t('admin.settings.failed_upload_favicon', 'Failed to upload favicon'));
      }

      return res.json();
    },
    onSuccess: async (data) => {

      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/branding'] });


      await refreshBranding();


      setBrandingUpdateKey(prev => prev + 1);


      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('brandingUpdated', {
          detail: { faviconUrl: data.faviconUrl }
        }));
      }, 100);

      toast({
        title: t('admin.settings.favicon_uploaded', 'Favicon uploaded'),
        description: t('admin.settings.favicon_uploaded_desc', 'The favicon has been uploaded successfully.')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.settings.error_uploading_favicon', 'Error uploading favicon'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const uploadAdminAuthBgMutation = useMutation({
    mutationFn: async () => {
      if (!adminAuthBgFile) throw new Error('No admin auth background file selected');

      const formData = new FormData();
      formData.append('adminAuthBackground', adminAuthBgFile);

      const res = await fetch('/api/admin/settings/branding/admin-auth-background', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to upload admin auth background');
      }

      return res.json();
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/branding'] });
      await refreshBranding();

      toast({
        title: 'Admin auth background uploaded',
        description: 'The admin authentication background has been uploaded successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error uploading admin auth background',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const uploadUserAuthBgMutation = useMutation({
    mutationFn: async () => {
      if (!userAuthBgFile) throw new Error('No user auth background file selected');

      const formData = new FormData();
      formData.append('userAuthBackground', userAuthBgFile);

      const res = await fetch('/api/admin/settings/branding/user-auth-background', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to upload user auth background');
      }

      return res.json();
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/branding'] });
      await refreshBranding();

      toast({
        title: 'User auth background uploaded',
        description: 'The user authentication background has been uploaded successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error uploading user auth background',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const deleteAdminAuthBgMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', '/api/admin/settings/branding/admin-auth-background');
      if (!res.ok) throw new Error('Failed to delete admin auth background');
      return res.json();
    },
    onSuccess: () => {
      setAdminAuthBgPreview(null);
      setAdminAuthBgFile(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({ title: 'Admin auth background deleted' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  const deleteUserAuthBgMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', '/api/admin/settings/branding/user-auth-background');
      if (!res.ok) throw new Error('Failed to delete user auth background');
      return res.json();
    },
    onSuccess: () => {
      setUserAuthBgPreview(null);
      setUserAuthBgFile(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({ title: 'User auth background deleted' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  const validateAuthBackgroundConfig = (config: typeof adminAuthBgConfig) => {

    if (config.backgroundColor) {
      const hexPattern = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
      const rgbPattern = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+)?\s*\)$/;
      if (!hexPattern.test(config.backgroundColor) && !rgbPattern.test(config.backgroundColor)) {
        throw new Error('Invalid color format');
      }
    }


    if (config.gradientMode === 'advanced') {
      if (config.advancedGradient.stops.length < 2) {
        throw new Error('Advanced gradient must have at least 2 color stops');
      }
    }

    return true;
  };

  const saveAuthBackgroundConfigMutation = useMutation({
    mutationFn: async () => {

      validateAuthBackgroundConfig(adminAuthBgConfig);
      validateAuthBackgroundConfig(userAuthBgConfig);


      const buildGradientConfig = (config: typeof adminAuthBgConfig) => {
        if (config.gradientMode === 'simple') {
          return {
            mode: 'simple',
            simple: config.simpleGradient
          };
        } else {
          return {
            mode: 'advanced',
            advanced: config.advancedGradient
          };
        }
      };

      const payload = {
        adminAuthBackground: {
          backgroundColor: adminAuthBgConfig.backgroundColor || undefined,
          gradientConfig: adminAuthBgConfig.backgroundColor || adminAuthBgConfig.gradientMode
            ? buildGradientConfig(adminAuthBgConfig)
            : undefined,
          priority: adminAuthBgConfig.priority
        },
        userAuthBackground: {
          backgroundColor: userAuthBgConfig.backgroundColor || undefined,
          gradientConfig: userAuthBgConfig.backgroundColor || userAuthBgConfig.gradientMode
            ? buildGradientConfig(userAuthBgConfig)
            : undefined,
          priority: userAuthBgConfig.priority
        }
      };

      const res = await apiRequest('POST', '/api/admin/settings/branding/auth-backgrounds', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save auth background configuration');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: 'Auth background settings saved',
        description: 'Authentication background settings have been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveBrandingMutation = useMutation({
    mutationFn: async () => {
      if (!brandingForm.appName) {
        throw new Error(t('admin.settings.app_name_required', 'Application name is required'));
      }

      const res = await apiRequest('POST', '/api/admin/settings/branding', brandingForm);

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || t('admin.settings.failed_save_branding', 'Failed to save branding settings'));
      }
      return res.json();
    },
    onSuccess: async (data) => {

      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/branding'] });


      await refreshBranding();


      setBrandingUpdateKey(prev => prev + 1);


      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('brandingUpdated', {
          detail: data.settings
        }));
      }, 100);

      toast({
        title: t('admin.settings.branding_saved', 'Branding settings saved'),
        description: t('admin.settings.branding_saved_desc', 'The branding settings have been saved successfully.')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.settings.error_saving_branding', 'Error saving branding settings'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveStripeMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...stripeForm,
        secretKey: stripeForm.secretKey === '••••••••' ? undefined : stripeForm.secretKey
      };

      const res = await apiRequest('POST', '/api/admin/settings/payment/stripe', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || t('admin.settings.failed_save_stripe', 'Failed to save Stripe settings'));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: t('admin.settings.stripe_saved', 'Stripe settings saved'),
        description: t('admin.settings.stripe_saved_desc', 'The Stripe settings have been saved successfully.')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.settings.error_saving_stripe', 'Error saving Stripe settings'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const savePaystackMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...paystackForm,
        secretKey: paystackForm.secretKey === '••••••••' ? undefined : paystackForm.secretKey
      };

      const res = await apiRequest('POST', '/api/admin/settings/payment/paystack', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save Paystack settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: 'Paystack settings saved',
        description: 'The Paystack settings have been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving Paystack settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const testPaystackMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/settings/payment/paystack/test');
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to test Paystack connection');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Paystack connection successful',
        description: data.testMode ? 'Connected in test mode' : 'Connected in live mode'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error connecting to Paystack',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const testStripeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/settings/payment/stripe/test');
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || t('admin.settings.failed_test_stripe', 'Failed to test Stripe connection'));
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: t('admin.settings.stripe_connection_successful', 'Stripe connection successful'),
        description: t('admin.settings.connected_to_stripe_account', 'Connected to Stripe account: {{email}}', { email: data.account.email })
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.settings.error_connecting_stripe', 'Error connecting to Stripe'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveMercadoPagoMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...mercadoPagoForm,
        clientSecret: mercadoPagoForm.clientSecret === '••••••••' ? undefined : mercadoPagoForm.clientSecret,
        accessToken: mercadoPagoForm.accessToken === '••••••••' ? undefined : mercadoPagoForm.accessToken
      };

      const res = await apiRequest('POST', '/api/admin/settings/payment/mercadopago', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save Mercado Pago settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: 'Mercado Pago settings saved',
        description: 'The Mercado Pago settings have been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving Mercado Pago settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const testMercadoPagoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/settings/payment/mercadopago/test');
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to test Mercado Pago connection');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Mercado Pago connection successful',
        description: `Connected to Mercado Pago account: ${data.account.email || data.account.nickname}`
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error connecting to Mercado Pago',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const savePaypalMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...paypalForm,
        clientSecret: paypalForm.clientSecret === '••••••••' ? undefined : paypalForm.clientSecret
      };

      const res = await apiRequest('POST', '/api/admin/settings/payment/paypal', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save PayPal settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: 'PayPal settings saved',
        description: 'The PayPal settings have been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving PayPal settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const testPaypalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/settings/payment/paypal/test');
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to test PayPal connection');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'PayPal connection successful',
        description: `Connected to PayPal ${data.account.environment} environment`
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error connecting to PayPal',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveMoyasarMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...moyasarForm,
        secretKey: moyasarForm.secretKey === '••••••••' ? undefined : moyasarForm.secretKey
      };
      const res = await apiRequest('POST', '/api/admin/settings/payment/moyasar', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save Moyasar settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: 'Moyasar settings saved',
        description: 'Your Moyasar payment settings have been updated successfully'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving Moyasar settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const testMoyasarMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/settings/payment/moyasar/test');
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to test Moyasar connection');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Moyasar connection successful',
        description: `Connected to Moyasar API successfully`
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error connecting to Moyasar',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveMpesaMutation = useMutation({
    mutationFn: async () => {
      const { _showConsumerSecret, _showPasskey, ...cleanForm } = mpesaForm as any;
      const payload = {
        ...cleanForm
      };
      const res = await apiRequest('POST', '/api/admin/settings/payment/mpesa', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save MPESA settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: 'MPESA settings saved',
        description: 'Your MPESA payment settings have been updated successfully'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to save MPESA settings',
        description: error.message || 'An error occurred while saving MPESA settings',
        variant: 'destructive'
      });
    }
  });

  const testMpesaMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/settings/payment/mpesa/test', {
        consumerKey: mpesaForm.consumerKey,
        consumerSecret: mpesaForm.consumerSecret === '••••••••' ? undefined : mpesaForm.consumerSecret,
        businessShortcode: mpesaForm.businessShortcode,
        testMode: mpesaForm.testMode
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to test MPESA connection');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'MPESA connection successful',
        description: `Connected to MPESA API successfully`
      });
    },
    onError: (error: any) => {
      toast({
        title: 'MPESA connection failed',
        description: error.message || 'Failed to connect to MPESA API',
        variant: 'destructive'
      });
    }
  });

  const saveBankTransferMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/settings/payment/bank-transfer', bankTransferForm);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save bank transfer settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: 'Bank transfer settings saved',
        description: 'The bank transfer settings have been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving bank transfer settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const handleAddCustomCurrency = () => {
    const code = customCurrencyForm.code.trim().toUpperCase();
    const name = customCurrencyForm.name.trim();
    const symbol = customCurrencyForm.symbol.trim();


    if (!code || !name || !symbol) {
      toast({
        title: 'Validation error',
        description: 'All fields are required',
        variant: 'destructive'
      });
      return;
    }

    if (!/^[A-Z]{3}$/.test(code)) {
      toast({
        title: 'Validation error',
        description: 'Currency code must be exactly 3 uppercase letters (ISO 4217 format)',
        variant: 'destructive'
      });
      return;
    }


    if (generalSettingsForm.customCurrencies.some(c => c.code === code)) {
      toast({
        title: 'Validation error',
        description: 'This currency code already exists in custom currencies',
        variant: 'destructive'
      });
      return;
    }


    if (BUILT_IN_CURRENCY_CODES.includes(code)) {
      toast({
        title: 'Validation error',
        description: 'This currency code already exists in default currencies',
        variant: 'destructive'
      });
      return;
    }


    try {
      new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(1);
    } catch (error) {
      toast({
        title: 'Validation error',
        description: `Currency code ${code} is not supported by the browser's Intl API. Please use a valid ISO 4217 currency code.`,
        variant: 'destructive'
      });
      return;
    }


    setGeneralSettingsForm({
      ...generalSettingsForm,
      customCurrencies: [...generalSettingsForm.customCurrencies, { code, name, symbol }]
    });


    setCustomCurrencyForm({ code: '', name: '', symbol: '' });
    setShowCustomCurrencyDialog(false);

    toast({
      title: 'Custom currency added',
      description: `${code} - ${name} has been added successfully.`
    });
  };

  const handleRemoveCustomCurrency = (code: string) => {

    const needsDefaultCurrencyUpdate = generalSettingsForm.defaultCurrency === code;
    

    const updatedForm = {
      ...generalSettingsForm,
      customCurrencies: generalSettingsForm.customCurrencies.filter(c => c.code !== code),
      ...(needsDefaultCurrencyUpdate && { defaultCurrency: 'USD' })
    };

    setGeneralSettingsForm(updatedForm);

    toast({
      title: 'Custom currency removed',
      description: needsDefaultCurrencyUpdate 
        ? `Currency ${code} has been removed. Default currency has been switched to USD.`
        : `Currency ${code} has been removed.`
    });
  };

  const saveGeneralSettingsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/settings/general', generalSettingsForm);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save general settings');
      }
      return res.json();
    },
    onSuccess: (data) => {

      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      queryClient.invalidateQueries({ queryKey: ['website-enabled'] });
      

      queryClient.removeQueries({ queryKey: ['website-enabled'] });
      

      settingsEvents.emit(SETTINGS_EVENTS.FRONTEND_WEBSITE_TOGGLED, {
        enabled: generalSettingsForm.frontendWebsiteEnabled
      });
      
      toast({
        title: 'General settings saved',
        description: 'The general settings have been saved successfully.'
      });
    },
    onError: (error: any) => {
      console.error('Error saving general settings:', error);
      toast({
        title: 'Error saving general settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveSmtpMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...smtpForm,

        password: smtpForm.password || storedSmtpPassword
      };

      const res = await apiRequest('POST', '/api/admin/settings/smtp', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save SMTP settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: 'SMTP settings saved',
        description: 'The SMTP settings have been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving SMTP settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const testSmtpMutation = useMutation({
    mutationFn: async () => {
      if (!smtpForm.testEmail) {
        throw new Error(t('admin.settings.test_email_required', 'Test email address is required'));
      }

      const res = await apiRequest('POST', '/api/admin/settings/smtp/test', {
        testEmail: smtpForm.testEmail
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || t('admin.settings.failed_test_smtp', 'Failed to test SMTP connection'));
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: t('admin.settings.smtp_connection_successful', 'SMTP connection successful'),
        description: data.message || t('admin.settings.smtp_test_passed', 'SMTP connection test passed')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.settings.error_testing_smtp', 'Error testing SMTP connection'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveRegistrationMutation = useMutation({
    mutationFn: async () => {
      try {
        const payload = {
          enabled: Boolean(registrationSettings.enabled),
          requireApproval: Boolean(registrationSettings.requireApproval),
          defaultPlan: registrationSettings.defaultPlan || (plans && plans.length > 0 ? plans[0].id.toString() : '1')
        };

        if (payload.enabled && !payload.defaultPlan) {
          throw new Error(t('admin.settings.default_plan_required', 'Default plan is required when registration is enabled'));
        }

        const res = await apiRequest('POST', '/api/admin/settings/registration', payload);

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || t('admin.settings.failed_save_registration', 'Failed to save registration settings'));
        }

        const result = await res.json();
        return result;
      } catch (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: t('admin.settings.registration_saved', 'Registration settings saved'),
        description: t('admin.settings.registration_saved_desc', 'The registration settings have been saved successfully.')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.settings.error_saving_registration', 'Error saving registration settings'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });





  const saveGoogleCalendarOAuthMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...googleCalendarOAuthForm,
        client_secret: googleCalendarOAuthForm.client_secret === '••••••••' ? undefined : googleCalendarOAuthForm.client_secret
      };
      const res = await apiRequest('POST', '/api/admin/settings/integrations/google-calendar', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save Google Calendar OAuth settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings/integrations/google-calendar'] });
      toast({
        title: 'Google Calendar OAuth settings saved',
        description: 'Google Calendar OAuth configuration has been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving Google Calendar OAuth settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveZohoCalendarOAuthMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...zohoCalendarOAuthForm,
        client_secret: zohoCalendarOAuthForm.client_secret === '••••••••' ? undefined : zohoCalendarOAuthForm.client_secret
      };
      const res = await apiRequest('POST', '/api/admin/settings/integrations/zoho-calendar', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save Zoho Calendar OAuth settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings/integrations/zoho-calendar'] });
      toast({
        title: 'Zoho Calendar OAuth settings saved',
        description: 'Zoho Calendar OAuth configuration has been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving Zoho Calendar OAuth settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveCalendlyOAuthMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...calendlyOAuthForm,
        client_secret: calendlyOAuthForm.client_secret === '••••••••' ? undefined : calendlyOAuthForm.client_secret,
        webhook_signing_key: calendlyOAuthForm.webhook_signing_key === '••••••••' ? undefined : calendlyOAuthForm.webhook_signing_key
      };
      const res = await apiRequest('POST', '/api/admin/settings/integrations/calendly', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save Calendly OAuth settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings/integrations/calendly'] });
      toast({
        title: 'Calendly OAuth settings saved',
        description: 'Calendly OAuth configuration has been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving Calendly OAuth settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });


  const saveGoogleSheetsOAuthMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...googleSheetsOAuthForm,
        client_secret: googleSheetsOAuthForm.client_secret === '••••••••' ? undefined : googleSheetsOAuthForm.client_secret
      };
      const res = await apiRequest('POST', '/api/admin/settings/integrations/google-sheets', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save Google Sheets OAuth settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings/integrations/google-sheets'] });
      toast({
        title: 'Google Sheets OAuth settings saved',
        description: 'Google Sheets OAuth configuration has been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving Google Sheets OAuth settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveGoogleMapsApiKeyMutation = useMutation({
    mutationFn: async () => {
      if (!googleMapsApiKey.trim()) {
        throw new Error('API key is required');
      }
      const res = await apiRequest('POST', '/api/company-settings/google-maps', {
        apiKey: googleMapsApiKey.trim()
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save Google Maps API key');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company-settings/google-maps'] });
      setGoogleMapsApiKey('');
      toast({
        title: 'Google Maps API key saved',
        description: 'Google Maps API key has been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving Google Maps API key',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveCustomScriptsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/settings/custom-scripts', customScriptsForm);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save custom scripts settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: 'Custom scripts settings saved',
        description: 'Custom scripts configuration has been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving custom scripts settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveCustomCssMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/settings/custom-css', customCssForm);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save custom CSS settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: 'Custom CSS settings saved',
        description: 'Custom CSS configuration has been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving custom CSS settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });


  const getIframeProps = () => {
    const currentUrl = window.location.origin;
    const width = embedSettings.width || '100%';
    const height = embedSettings.height || '600px';

    const brandingSetting = settings?.find((s: any) => s.key === 'branding');
    const appTitle = brandingForm.appName || brandingSetting?.value?.appName || 'PowerChat Application';

    const styles: React.CSSProperties = {
      border: 'none',
    };
    if (embedSettings.borderRadius) {
      styles.borderRadius = embedSettings.borderRadius;
    }
    if (embedSettings.boxShadow) {
      styles.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
    }

    const embedUrl = new URL(currentUrl);
    embedUrl.searchParams.set('embed', 'true');
    if (!embedSettings.showHeader) {
      embedUrl.searchParams.set('hideHeader', 'true');
    }

    return {
      src: embedUrl.toString(),
      width: width,
      height: height,
      frameBorder: 0,
      allow: `camera; microphone; geolocation; encrypted-media${embedSettings.allowFullscreen ? '; fullscreen' : ''}`,
      allowFullScreen: embedSettings.allowFullscreen || false,
      sandbox: 'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-top-navigation-by-user-activation',
      loading: 'lazy' as const,
      title: `${appTitle} - Embedded Application`,
      style: styles,
    };
  };

  const generateEmbedCode = () => {
    const currentUrl = window.location.origin;
    const width = embedSettings.width || '100%';
    const height = embedSettings.height || '600px';

    const brandingSetting = settings?.find((s: any) => s.key === 'branding');
    const appTitle = brandingForm.appName || brandingSetting?.value?.appName || 'PowerChat Application';


    const styles = [];
    styles.push('border: none');
    if (embedSettings.borderRadius) {
      styles.push(`border-radius: ${embedSettings.borderRadius}`);
    }
    if (embedSettings.boxShadow) {
      styles.push('box-shadow: 0 4px 12px rgba(0,0,0,0.1)');
    }


    const embedUrl = new URL(currentUrl);
    embedUrl.searchParams.set('embed', 'true');
    if (!embedSettings.showHeader) {
      embedUrl.searchParams.set('hideHeader', 'true');
    }

    const code = `<iframe
  src="${embedUrl.toString()}"
  width="${width}"
  height="${height}"
  frameborder="0"
  allow="camera; microphone; geolocation; encrypted-media${embedSettings.allowFullscreen ? '; fullscreen' : ''}"
  ${embedSettings.allowFullscreen ? 'allowfullscreen' : ''}
  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-top-navigation-by-user-activation"
  loading="lazy"
  title="${appTitle} - Embedded Application"
  style="${styles.join('; ')};">
  <p>Your browser does not support iframes. Please visit <a href="${currentUrl}" target="_blank">${appTitle}</a> directly.</p>
</iframe>`;

    setEmbedCode(code);
  };

  const copyEmbedCode = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopySuccess(true);
      toast({
        title: t('admin.settings.embed_code_copied', 'Embed code copied'),
        description: t('admin.settings.embed_code_copied_desc', 'The embed code has been copied to your clipboard.'),
        variant: 'default'
      });


      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      toast({
        title: t('admin.settings.copy_failed', 'Copy failed'),
        description: t('admin.settings.copy_failed_desc', 'Failed to copy embed code to clipboard. Please copy manually.'),
        variant: 'destructive'
      });
    }
  };

  if (isLoadingSettings) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl">{t('admin.settings.title', 'Settings')}</h1>
            <p className="text-muted-foreground text-sm sm:text-base mt-1">
              {t('admin.settings.description', 'Configure system settings, payment gateways, and application preferences')}
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="mb-6">
            <TabsList className="flex flex-wrap justify-start gap-1 h-auto p-1 bg-muted rounded-lg w-full">
              <TabsTrigger value="branding" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
                <Palette className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden md:inline">{t('admin.settings.branding', 'Branding')}</span>
                <span className="md:hidden">Brand</span>
              </TabsTrigger>

              <TabsTrigger value="integrations" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
                <Settings className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden lg:inline">{t('admin.settings.integrations', 'Other Integrations')}</span>
                <span className="lg:hidden">Integrations</span>
              </TabsTrigger>
              <TabsTrigger value="payment" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
                <CreditCard className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden lg:inline">{t('admin.settings.payment_gateways', 'Payment Gateways')}</span>
                <span className="lg:hidden">Payment</span>
              </TabsTrigger>
              <TabsTrigger value="email" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
                <Mail className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden lg:inline">{t('admin.settings.email', 'Email Settings')}</span>
                <span className="lg:hidden">Email</span>
              </TabsTrigger>
              <TabsTrigger value="general" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
                <Globe className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden md:inline">{t('admin.settings.general', 'General')}</span>
                <span className="md:hidden">General</span>
              </TabsTrigger>
              <TabsTrigger value="platform" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
                <Settings className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden lg:inline">{t('admin.settings.partnerapi', 'Partner API')}</span>
                <span className="lg:hidden">Partner</span>
              </TabsTrigger>
              <TabsTrigger value="registration" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
                <UserPlus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden lg:inline">{t('admin.settings.registration', 'Registration')}</span>
                <span className="lg:hidden">Register</span>
              </TabsTrigger>
              <TabsTrigger value="backup" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
                <Database className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden lg:inline">{t('admin.settings.backup', 'Database Backup')}</span>
                <span className="lg:hidden">Backup</span>
              </TabsTrigger>
              {/* <TabsTrigger value="updates" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
                <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden lg:inline">{t('admin.settings.updates', 'System Updates')}</span>
                <span className="lg:hidden">Updates</span>
              </TabsTrigger> */}
              <TabsTrigger value="ai-credentials" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
                <Key className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden lg:inline">{t('admin.settings.ai_credentials', 'AI Credentials')}</span>
                <span className="lg:hidden">AI Keys</span>
              </TabsTrigger>
              <TabsTrigger value="ai-usage" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
                <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden md:inline">{t('admin.settings.ai_usage', 'AI Usage')}</span>
                <span className="md:hidden">Usage</span>
              </TabsTrigger>
              <TabsTrigger value="custom-scripts" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
                <Code className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden md:inline">{t('admin.settings.custom_scripts', 'Custom Scripts')}</span>
                <span className="md:hidden">Scripts</span>
              </TabsTrigger>
              <TabsTrigger value="custom-css" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
                <Paintbrush className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden md:inline">{t('admin.settings.custom_css', 'Custom CSS')}</span>
                <span className="md:hidden">CSS</span>
              </TabsTrigger>

            </TabsList>
          </div>


          <TabsContent value="branding">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('admin.settings.branding', 'Application Branding')}</CardTitle>
                  <CardDescription>
                    {t('admin.settings.branding_description', 'Customize the appearance of your application')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="appName">{t('admin.settings.app_name', 'Application Name')}</Label>
                    <Input
                      id="appName"
                      value={brandingForm.appName}
                      onChange={(e) => setBrandingForm({...brandingForm, appName: e.target.value})}
                      placeholder=""
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="defaultTheme">{t('admin.settings.default_theme', 'Default Theme')}</Label>
                    <Select
                      value={brandingForm.defaultTheme || 'none'}
                      onValueChange={(value) => setBrandingForm({...brandingForm, defaultTheme: value === 'none' ? '' : value as 'dark' | 'light' | ''})}
                    >
                      <SelectTrigger id="defaultTheme">
                        <SelectValue placeholder={t('admin.settings.select_theme', 'Select default theme')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('admin.settings.theme_none', 'None (System Default)')}</SelectItem>
                        <SelectItem value="light">{t('admin.settings.theme_light', 'Light')}</SelectItem>
                        <SelectItem value="dark">{t('admin.settings.theme_dark', 'Dark')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="primaryColor" className="text-sm">{t('admin.settings.primary_color', 'Primary Color')}</Label>
                      <div className="flex items-center space-x-2">
                        <div
                          className="w-6 h-6 rounded-full border cursor-pointer flex-shrink-0"
                          style={{ backgroundColor: brandingForm.primaryColor }}
                          onClick={() => {
                            const colorInput = document.getElementById('primaryColor') as HTMLInputElement;
                            if (colorInput) colorInput.click();
                          }}
                        />
                        <Input
                          id="primaryColor"
                          type="color"
                          value={brandingForm.primaryColor}
                          onChange={(e) => setBrandingForm({...brandingForm, primaryColor: e.target.value})}
                          className="w-12 sm:w-16 h-8 sm:h-10 p-1 border rounded cursor-pointer flex-shrink-0"
                        />
                        <Input
                          type="text"
                          value={brandingForm.primaryColor}
                          onChange={(e) => setBrandingForm({...brandingForm, primaryColor: e.target.value})}
                          placeholder="#333235"
                          className="flex-1 min-w-0"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="secondaryColor" className="text-sm">{t('admin.settings.secondary_color', 'Secondary Color')}</Label>
                      <div className="flex items-center space-x-2">
                        <div
                          className="w-6 h-6 rounded-full border cursor-pointer flex-shrink-0"
                          style={{ backgroundColor: brandingForm.secondaryColor }}
                          onClick={() => {
                            const colorInput = document.getElementById('secondaryColor') as HTMLInputElement;
                            if (colorInput) colorInput.click();
                          }}
                        />
                        <Input
                          id="secondaryColor"
                          type="color"
                          value={brandingForm.secondaryColor}
                          onChange={(e) => setBrandingForm({...brandingForm, secondaryColor: e.target.value})}
                          className="w-12 sm:w-16 h-8 sm:h-10 p-1 border rounded cursor-pointer flex-shrink-0"
                        />
                        <Input
                          type="text"
                          value={brandingForm.secondaryColor}
                          onChange={(e) => setBrandingForm({...brandingForm, secondaryColor: e.target.value})}
                          placeholder="#4F46E5"
                          className="flex-1 min-w-0"
                        />
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="brand"
                    onClick={() => saveBrandingMutation.mutate()}
                    disabled={saveBrandingMutation.isPending}
                    className="btn-brand-primary"
                  >
                    {saveBrandingMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {t('admin.settings.save_branding', 'Save Branding Settings')}
                  </Button>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('admin.settings.logo', 'Logo')}</CardTitle>
                    <CardDescription>
                      {t('admin.settings.logo_description', 'Upload your company logo (recommended size: 200x50px)')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {logoPreview && (
                      <div className="border rounded-md p-4 flex items-center justify-center bg-gray-50 dark:bg-muted">
                        <img
                          src={logoPreview}
                          alt={t('admin.settings.logo_preview_alt', 'Logo Preview')}
                          className="max-h-16 max-w-full object-contain"
                        />
                      </div>
                    )}

                    <div className="flex items-center space-x-2">
                      <Input
                        id="logo"
                        type="file"
                        accept="image/*"
                        onChange={handleLogoChange}
                        className="hidden"
                      />
                      <Label
                        htmlFor="logo"
                        className="cursor-pointer flex items-center justify-center border rounded-md px-4 py-2 hover:bg-muted"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {t('admin.settings.choose_logo', 'Choose Logo')}
                      </Label>

                      {logoFile && (
                        <Button
                          onClick={() => uploadLogoMutation.mutate()}
                          disabled={uploadLogoMutation.isPending}
                        >
                          {uploadLogoMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="mr-2 h-4 w-4" />
                          )}
                          {t('admin.settings.upload', 'Upload')}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('admin.settings.favicon', 'Favicon')}</CardTitle>
                    <CardDescription>
                      {t('admin.settings.favicon_description', 'Upload your favicon (recommended size: 32x32px)')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {faviconPreview && (
                      <div className="border rounded-md p-4 flex items-center justify-center bg-gray-50 dark:bg-muted">
                        <img
                          src={faviconPreview}
                          alt="Favicon Preview"
                          className="max-h-8 max-w-full object-contain"
                        />
                      </div>
                    )}

                    <div className="flex items-center space-x-2">
                      <Input
                        id="favicon"
                        type="file"
                        accept="image/*"
                        onChange={handleFaviconChange}
                        className="hidden"
                      />
                      <Label
                        htmlFor="favicon"
                        className="cursor-pointer flex items-center justify-center border rounded-md px-4 py-2 hover:bg-muted"
                      >
                        <FileImage className="h-4 w-4 mr-2" />
                        Choose Favicon
                      </Label>

                      {faviconFile && (
                        <Button
                          onClick={() => uploadFaviconMutation.mutate()}
                          disabled={uploadFaviconMutation.isPending}
                        >
                          {uploadFaviconMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="mr-2 h-4 w-4" />
                          )}
                          Upload
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Auth Backgrounds Section */}
              <div className="col-span-1 lg:col-span-2 mt-6">
                <h3 className="text-lg font-semibold mb-4">Authentication Page Backgrounds</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Admin Auth Background Card */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Admin Auth Background</CardTitle>
                      <CardDescription>
                        Customize the background for admin login page (/admin/login)
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Image Upload Section */}
                      {adminAuthBgPreview && (
                        <div className="border rounded-md p-4 bg-gray-50 dark:bg-muted relative">
                          <img src={adminAuthBgPreview} alt="Admin Auth Background" className="w-full h-32 object-cover rounded" />
                          <Button
                            variant="destructive"
                            size="sm"
                            className="absolute top-2 right-2"
                            onClick={() => deleteAdminAuthBgMutation.mutate()}
                            disabled={deleteAdminAuthBgMutation.isPending}
                          >
                            {deleteAdminAuthBgMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      )}

                      <div className="flex items-center space-x-2">
                        <Input
                          id="admin-auth-bg"
                          type="file"
                          accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml"
                          onChange={handleAdminAuthBgChange}
                          className="hidden"
                        />
                        <Label htmlFor="admin-auth-bg" className="cursor-pointer flex items-center justify-center border rounded-md px-4 py-2 hover:bg-gray-50 dark:bg-muted">
                          <Upload className="h-4 w-4 mr-2" />
                          Choose Background Image
                        </Label>

                        {adminAuthBgFile && (
                          <Button onClick={() => uploadAdminAuthBgMutation.mutate()} disabled={uploadAdminAuthBgMutation.isPending}>
                            {uploadAdminAuthBgMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                            Upload
                          </Button>
                        )}
                      </div>

                      {/* Background Color Picker */}
                      <div className="space-y-2">
                        <Label>Background Color (Optional)</Label>
                        <div className="flex items-center space-x-2">
                          <div
                            className="w-10 h-10 rounded border cursor-pointer"
                            style={{ backgroundColor: adminAuthBgConfig.backgroundColor || '#ffffff' }}
                            onClick={() => document.getElementById('admin-bg-color')?.click()}
                          />
                          <Input
                            id="admin-bg-color"
                            type="color"
                            value={adminAuthBgConfig.backgroundColor || '#ffffff'}
                            onChange={(e) => setAdminAuthBgConfig({ ...adminAuthBgConfig, backgroundColor: e.target.value })}
                            className="w-16 h-10 p-1"
                          />
                          <Input
                            type="text"
                            value={adminAuthBgConfig.backgroundColor}
                            onChange={(e) => setAdminAuthBgConfig({ ...adminAuthBgConfig, backgroundColor: e.target.value })}
                            placeholder="#ffffff or rgb(255,255,255)"
                            className="flex-1"
                          />
                        </div>
                      </div>

                      {/* Gradient Configuration */}
                      <div className="space-y-2">
                        <Label>Background Gradient (Optional)</Label>
                        <GradientConfigUI
                          mode={adminAuthBgConfig.gradientMode}
                          simpleConfig={adminAuthBgConfig.simpleGradient}
                          advancedConfig={adminAuthBgConfig.advancedGradient}
                          onModeChange={(mode) => setAdminAuthBgConfig({ ...adminAuthBgConfig, gradientMode: mode })}
                          onSimpleChange={(simple) => setAdminAuthBgConfig({ ...adminAuthBgConfig, simpleGradient: simple })}
                          onAdvancedChange={(advanced) => setAdminAuthBgConfig({ ...adminAuthBgConfig, advancedGradient: advanced })}
                          idPrefix="admin-auth-gradient"
                        />
                      </div>

                      {/* Priority Selector */}
                      <div className="space-y-2">
                        <Label>Background Priority</Label>
                        <Select
                          value={adminAuthBgConfig.priority}
                          onValueChange={(value) => setAdminAuthBgConfig({ ...adminAuthBgConfig, priority: value as any })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="image">Image Priority (color/gradient as fallback)</SelectItem>
                            <SelectItem value="color">Color/Gradient Priority (ignore image)</SelectItem>
                            <SelectItem value="layer">Layer (color/gradient behind image)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>

                  {/* User Auth Background Card */}
                  <Card>
                    <CardHeader>
                      <CardTitle>User Auth Background</CardTitle>
                      <CardDescription>
                        Customize the background for user login page (/login)
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Image Upload Section */}
                      {userAuthBgPreview && (
                        <div className="border rounded-md p-4 bg-gray-50 dark:bg-muted relative">
                          <img src={userAuthBgPreview} alt="User Auth Background" className="w-full h-32 object-cover rounded" />
                          <Button
                            variant="destructive"
                            size="sm"
                            className="absolute top-2 right-2"
                            onClick={() => deleteUserAuthBgMutation.mutate()}
                            disabled={deleteUserAuthBgMutation.isPending}
                          >
                            {deleteUserAuthBgMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      )}

                      <div className="flex items-center space-x-2">
                        <Input
                          id="user-auth-bg"
                          type="file"
                          accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml"
                          onChange={handleUserAuthBgChange}
                          className="hidden"
                        />
                        <Label htmlFor="user-auth-bg" className="cursor-pointer flex items-center justify-center border rounded-md px-4 py-2 hover:bg-gray-50 dark:bg-muted">
                          <Upload className="h-4 w-4 mr-2" />
                          Choose Background Image
                        </Label>

                        {userAuthBgFile && (
                          <Button onClick={() => uploadUserAuthBgMutation.mutate()} disabled={uploadUserAuthBgMutation.isPending}>
                            {uploadUserAuthBgMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                            Upload
                          </Button>
                        )}
                      </div>

                      {/* Background Color Picker */}
                      <div className="space-y-2">
                        <Label>Background Color (Optional)</Label>
                        <div className="flex items-center space-x-2">
                          <div
                            className="w-10 h-10 rounded border cursor-pointer"
                            style={{ backgroundColor: userAuthBgConfig.backgroundColor || '#ffffff' }}
                            onClick={() => document.getElementById('user-bg-color')?.click()}
                          />
                          <Input
                            id="user-bg-color"
                            type="color"
                            value={userAuthBgConfig.backgroundColor || '#ffffff'}
                            onChange={(e) => setUserAuthBgConfig({ ...userAuthBgConfig, backgroundColor: e.target.value })}
                            className="w-16 h-10 p-1"
                          />
                          <Input
                            type="text"
                            value={userAuthBgConfig.backgroundColor}
                            onChange={(e) => setUserAuthBgConfig({ ...userAuthBgConfig, backgroundColor: e.target.value })}
                            placeholder="#ffffff or rgb(255,255,255)"
                            className="flex-1"
                          />
                        </div>
                      </div>

                      {/* Gradient Configuration */}
                      <div className="space-y-2">
                        <Label>Background Gradient (Optional)</Label>
                        <GradientConfigUI
                          mode={userAuthBgConfig.gradientMode}
                          simpleConfig={userAuthBgConfig.simpleGradient}
                          advancedConfig={userAuthBgConfig.advancedGradient}
                          onModeChange={(mode) => setUserAuthBgConfig({ ...userAuthBgConfig, gradientMode: mode })}
                          onSimpleChange={(simple) => setUserAuthBgConfig({ ...userAuthBgConfig, simpleGradient: simple })}
                          onAdvancedChange={(advanced) => setUserAuthBgConfig({ ...userAuthBgConfig, advancedGradient: advanced })}
                          idPrefix="user-auth-gradient"
                        />
                      </div>

                      {/* Priority Selector */}
                      <div className="space-y-2">
                        <Label>Background Priority</Label>
                        <Select
                          value={userAuthBgConfig.priority}
                          onValueChange={(value) => setUserAuthBgConfig({ ...userAuthBgConfig, priority: value as any })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="image">Image Priority (color/gradient as fallback)</SelectItem>
                            <SelectItem value="color">Color/Gradient Priority (ignore image)</SelectItem>
                            <SelectItem value="layer">Layer (color/gradient behind image)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Save Configuration Button */}
                <div className="mt-4 space-y-2">
                  <Button
                    variant="brand"
                    onClick={() => saveAuthBackgroundConfigMutation.mutate()}
                    disabled={saveAuthBackgroundConfigMutation.isPending}
                    className="w-full"
                  >
                    {saveAuthBackgroundConfigMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Auth Background Settings
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowAuthPreviewModal(true)}
                    className="w-full"
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Preview Changes
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>








          <TabsContent value="integrations">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Google Calendar Integration</CardTitle>
                  <CardDescription>
                    Configure Google OAuth for Calendar integration across all companies
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="google-calendar-enabled"
                      checked={googleCalendarOAuthForm.enabled}
                      onCheckedChange={(checked) => setGoogleCalendarOAuthForm(prev => ({ ...prev, enabled: checked }))}
                    />
                    <Label htmlFor="google-calendar-enabled">Enable Google Calendar Integration</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="google-calendar-client-id">Client ID</Label>
                    <Input
                      id="google-calendar-client-id"
                      placeholder="Enter Google OAuth Client ID"
                      value={googleCalendarOAuthForm.client_id}
                      onChange={(e) => setGoogleCalendarOAuthForm(prev => ({ ...prev, client_id: e.target.value }))}
                      disabled={!googleCalendarOAuthForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="google-calendar-client-secret">Client Secret</Label>
                    <Input
                      id="google-calendar-client-secret"
                      type="password"
                      placeholder="Enter Google OAuth Client Secret"
                      value={googleCalendarOAuthForm.client_secret}
                      onChange={(e) => setGoogleCalendarOAuthForm(prev => ({ ...prev, client_secret: e.target.value }))}
                      disabled={!googleCalendarOAuthForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="google-calendar-redirect-uri">Redirect URI</Label>
                    <Input
                      id="google-calendar-redirect-uri"
                      placeholder="Auto-generated redirect URI"
                      value={googleCalendarOAuthForm.redirect_uri}
                      onChange={(e) => setGoogleCalendarOAuthForm(prev => ({ ...prev, redirect_uri: e.target.value }))}
                      disabled={!googleCalendarOAuthForm.enabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      This redirect URI must be added to your Google Cloud Console OAuth configuration.
                    </p>
                  </div>

                  <div className="pt-4 border-t">
                    <Button
                      onClick={() => saveGoogleCalendarOAuthMutation.mutate()}
                      disabled={saveGoogleCalendarOAuthMutation.isPending || !googleCalendarOAuthForm.enabled}
                      className="w-full"
                    >
                      {saveGoogleCalendarOAuthMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Save Google Calendar Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Setup Instructions</CardTitle>
                  <CardDescription>
                    How to configure Google Calendar integration
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3 text-sm">
                    <div>
                      <h4 className="font-medium mb-2">1. Create Google Cloud Project</h4>
                      <p className="text-muted-foreground">
                        Go to Google Cloud Console and create a new project or select an existing one.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">2. Enable Calendar API</h4>
                      <p className="text-muted-foreground">
                        Enable the Google Calendar API in the APIs & Services section.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">3. Create OAuth Credentials</h4>
                      <p className="text-muted-foreground">
                        Create OAuth 2.0 Client ID credentials and add the redirect URI shown above.
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                      <h4 className="font-medium text-blue-700 mb-1">Multi-Tenant Architecture</h4>
                      <p className="text-xs text-blue-600">
                        These credentials will be used by all companies on your platform.
                        Individual users will authenticate with their own Google accounts using these application credentials.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Zoho Calendar Integration</CardTitle>
                  <CardDescription>
                    Configure Zoho OAuth for Calendar integration across all companies
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="zoho-calendar-enabled"
                      checked={zohoCalendarOAuthForm.enabled}
                      onCheckedChange={(checked) => setZohoCalendarOAuthForm(prev => ({ ...prev, enabled: checked }))}
                    />
                    <Label htmlFor="zoho-calendar-enabled">Enable Zoho Calendar Integration</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="zoho-calendar-client-id">Client ID</Label>
                    <Input
                      id="zoho-calendar-client-id"
                      placeholder="Enter Zoho OAuth Client ID"
                      value={zohoCalendarOAuthForm.client_id}
                      onChange={(e) => setZohoCalendarOAuthForm(prev => ({ ...prev, client_id: e.target.value }))}
                      disabled={!zohoCalendarOAuthForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="zoho-calendar-client-secret">Client Secret</Label>
                    <Input
                      id="zoho-calendar-client-secret"
                      type="password"
                      placeholder="Enter Zoho OAuth Client Secret"
                      value={zohoCalendarOAuthForm.client_secret}
                      onChange={(e) => setZohoCalendarOAuthForm(prev => ({ ...prev, client_secret: e.target.value }))}
                      disabled={!zohoCalendarOAuthForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="zoho-calendar-redirect-uri">Redirect URI</Label>
                    <Input
                      id="zoho-calendar-redirect-uri"
                      placeholder="Auto-generated redirect URI"
                      value={zohoCalendarOAuthForm.redirect_uri}
                      onChange={(e) => setZohoCalendarOAuthForm(prev => ({ ...prev, redirect_uri: e.target.value }))}
                      disabled={!zohoCalendarOAuthForm.enabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      This redirect URI must be added to your Zoho Developer Console OAuth configuration.
                    </p>
                  </div>

                  <div className="pt-4 border-t">
                    <Button
                      onClick={() => saveZohoCalendarOAuthMutation.mutate()}
                      disabled={saveZohoCalendarOAuthMutation.isPending || !zohoCalendarOAuthForm.enabled}
                      className="w-full"
                    >
                      {saveZohoCalendarOAuthMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Save Zoho Calendar Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Setup Instructions</CardTitle>
                  <CardDescription>
                    How to configure Zoho Calendar integration
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3 text-sm">
                    <div>
                      <h4 className="font-medium mb-2">1. Create Zoho Developer Account</h4>
                      <p className="text-muted-foreground">
                        Go to Zoho Developer Console (https://accounts.zoho.com/developerconsole) and create a new client application.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">2. Configure OAuth Application</h4>
                      <p className="text-muted-foreground">
                        Set the application type to "Web-based" and add the redirect URI shown above.
                      </p>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">4. Copy Credentials</h4>
                      <p className="text-muted-foreground">
                        Copy the Client ID and Client Secret from your Zoho application and paste them above.
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                      <h4 className="font-medium text-blue-700 mb-1">Multi-Tenant Architecture</h4>
                      <p className="text-xs text-blue-600">
                        These credentials will be used by all companies on your platform.
                        Individual users will authenticate with their own Zoho accounts using these application credentials.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Calendly Integration</CardTitle>
                  <CardDescription>
                    Configure Calendly OAuth for Calendar integration across all companies
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="calendly-enabled"
                      checked={calendlyOAuthForm.enabled}
                      onCheckedChange={(checked) => setCalendlyOAuthForm(prev => ({ ...prev, enabled: checked }))}
                    />
                    <Label htmlFor="calendly-enabled">Enable Calendly Integration</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="calendly-client-id">Client ID</Label>
                    <Input
                      id="calendly-client-id"
                      placeholder="Enter Calendly OAuth Client ID"
                      value={calendlyOAuthForm.client_id}
                      onChange={(e) => setCalendlyOAuthForm(prev => ({ ...prev, client_id: e.target.value }))}
                      disabled={!calendlyOAuthForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="calendly-client-secret">Client Secret</Label>
                    <Input
                      id="calendly-client-secret"
                      type="password"
                      placeholder="Enter Calendly OAuth Client Secret"
                      value={calendlyOAuthForm.client_secret}
                      onChange={(e) => setCalendlyOAuthForm(prev => ({ ...prev, client_secret: e.target.value }))}
                      disabled={!calendlyOAuthForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="calendly-webhook-signing-key">Webhook Signing Key</Label>
                    <Input
                      id="calendly-webhook-signing-key"
                      type="password"
                      placeholder="Enter Calendly Webhook Signing Key"
                      value={calendlyOAuthForm.webhook_signing_key}
                      onChange={(e) => setCalendlyOAuthForm(prev => ({ ...prev, webhook_signing_key: e.target.value }))}
                      disabled={!calendlyOAuthForm.enabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      A unique key shared between your app and Calendly that's used to verify events sent to your endpoints.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="calendly-redirect-uri">Redirect URI</Label>
                    <Input
                      id="calendly-redirect-uri"
                      placeholder="Auto-generated redirect URI"
                      value={calendlyOAuthForm.redirect_uri}
                      onChange={(e) => setCalendlyOAuthForm(prev => ({ ...prev, redirect_uri: e.target.value }))}
                      disabled={!calendlyOAuthForm.enabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      This redirect URI must be added to your Calendly Developer Console OAuth configuration.
                    </p>
                  </div>

                  <div className="pt-4 border-t">
                    <Button
                      onClick={() => saveCalendlyOAuthMutation.mutate()}
                      disabled={saveCalendlyOAuthMutation.isPending || !calendlyOAuthForm.enabled}
                      className="w-full"
                    >
                      {saveCalendlyOAuthMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Save Calendly Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Setup Instructions</CardTitle>
                  <CardDescription>
                    How to configure Calendly integration
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3 text-sm">
                    <div>
                      <h4 className="font-medium mb-2">1. Create Calendly Developer Account</h4>
                      <p className="text-muted-foreground">
                        Go to Calendly Developer Console (https://developer.calendly.com) and create a new OAuth application.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">2. Configure OAuth Application</h4>
                      <p className="text-muted-foreground">
                        Set the application type to "Web Application" and add the redirect URI shown above.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">4. Copy Credentials</h4>
                      <p className="text-muted-foreground">
                        Copy the Client ID, Client Secret, and Webhook Signing Key from your Calendly application and paste them above.
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                      <h4 className="font-medium text-blue-700 mb-1">Multi-Tenant Architecture</h4>
                      <p className="text-xs text-blue-600">
                        These credentials will be used by all companies on your platform.
                        Individual users will authenticate with their own Calendly accounts using these application credentials.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Google Sheets Integration</CardTitle>
                  <CardDescription>
                    Configure Google OAuth for Sheets integration across all companies
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="google-sheets-enabled"
                      checked={googleSheetsOAuthForm.enabled}
                      onCheckedChange={(checked) => setGoogleSheetsOAuthForm(prev => ({ ...prev, enabled: checked }))}
                    />
                    <Label htmlFor="google-sheets-enabled">Enable Google Sheets Integration</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="google-sheets-client-id">Client ID</Label>
                    <Input
                      id="google-sheets-client-id"
                      placeholder="Enter Google OAuth Client ID"
                      value={googleSheetsOAuthForm.client_id}
                      onChange={(e) => setGoogleSheetsOAuthForm(prev => ({ ...prev, client_id: e.target.value }))}
                      disabled={!googleSheetsOAuthForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="google-sheets-client-secret">Client Secret</Label>
                    <Input
                      id="google-sheets-client-secret"
                      type="password"
                      placeholder="Enter Google OAuth Client Secret"
                      value={googleSheetsOAuthForm.client_secret}
                      onChange={(e) => setGoogleSheetsOAuthForm(prev => ({ ...prev, client_secret: e.target.value }))}
                      disabled={!googleSheetsOAuthForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="google-sheets-redirect-uri">Redirect URI</Label>
                    <Input
                      id="google-sheets-redirect-uri"
                      placeholder="Auto-generated redirect URI"
                      value={googleSheetsOAuthForm.redirect_uri}
                      onChange={(e) => setGoogleSheetsOAuthForm(prev => ({ ...prev, redirect_uri: e.target.value }))}
                      disabled={!googleSheetsOAuthForm.enabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      This redirect URI must be added to your Google Cloud Console OAuth configuration.
                    </p>
                  </div>

                  <div className="pt-4 border-t">
                    <Button
                      onClick={() => saveGoogleSheetsOAuthMutation.mutate()}
                      disabled={saveGoogleSheetsOAuthMutation.isPending || !googleSheetsOAuthForm.enabled}
                      className="w-full"
                    >
                      {saveGoogleSheetsOAuthMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Save Google Sheets Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Google Sheets Setup</CardTitle>
                  <CardDescription>
                    How to configure Google Sheets integration
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3 text-sm">
                    <div>
                      <h4 className="font-medium mb-2">1. Use Same Google Cloud Project</h4>
                      <p className="text-muted-foreground">
                        You can use the same Google Cloud project and OAuth credentials as Google Calendar.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">2. Enable APIs</h4>
                      <p className="text-muted-foreground">
                        Enable the Google Drive API and Google Sheets API from Google Cloud Console.
                      </p>
                    </div>



                    <div>
                      <h4 className="font-medium mb-2">4. User Authentication</h4>
                      <p className="text-muted-foreground">
                        Users will authenticate with their personal Google accounts to access their own spreadsheets.
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <div className="bg-green-50 border border-green-200 rounded-md p-3">
                      <h4 className="font-medium text-green-700 mb-1">Simplified Setup</h4>
                      <p className="text-xs text-green-600">
                        Users simply connect their Google accounts
                        and can immediately access their own spreadsheets.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Google Maps Integration</CardTitle>
                  <CardDescription>
                    Configure your Google Maps API key to enable scraping business contacts from Google Maps.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="google-maps-api-key">API Key</Label>
                    <Input
                      id="google-maps-api-key"
                      type="text"
                      placeholder="AIzaSy..."
                      value={googleMapsApiKey}
                      onChange={(e) => setGoogleMapsApiKey(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter your Google Maps API key. Get one from{' '}
                      <a
                        href="https://console.cloud.google.com/google/maps-apis"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Google Cloud Console
                      </a>
                    </p>
                    <p className="text-xs text-amber-600 mt-1">
                      Note: Only super admins can configure this app-level setting.
                    </p>
                    {googleMapsSettings?.configured && (
                      <div className="text-xs text-green-600 mt-1">
                        Status: Configured ({googleMapsSettings.apiKey})
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t">
                    <Button
                      onClick={() => saveGoogleMapsApiKeyMutation.mutate()}
                      disabled={saveGoogleMapsApiKeyMutation.isPending || !googleMapsApiKey.trim()}
                      className="w-full"
                    >
                      {saveGoogleMapsApiKeyMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Save Google Maps API Key
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="payment">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Stripe Integration</CardTitle>
                  <CardDescription>
                    {t('admin.settings.configure_stripe_gateway', 'Configure Stripe payment gateway')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="stripe-enabled"
                      checked={stripeForm.enabled}
                      onCheckedChange={(checked) => setStripeForm({...stripeForm, enabled: checked})}
                    />
                    <Label htmlFor="stripe-enabled">Enable Stripe Payments</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="publishableKey">Publishable Key</Label>
                    <Input
                      id="publishableKey"
                      value={stripeForm.publishableKey}
                      onChange={(e) => setStripeForm({...stripeForm, publishableKey: e.target.value})}
                      placeholder="pk_test_..."
                      disabled={!stripeForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="secretKey">Secret Key</Label>
                    <Input
                      id="secretKey"
                      type="password"
                      value={stripeForm.secretKey}
                      onChange={(e) => setStripeForm({...stripeForm, secretKey: e.target.value})}
                      placeholder="sk_test_..."
                      disabled={!stripeForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="webhookSecret">Webhook Secret</Label>
                    <Input
                      id="webhookSecret"
                      value={stripeForm.webhookSecret}
                      onChange={(e) => setStripeForm({...stripeForm, webhookSecret: e.target.value})}
                      placeholder="whsec_..."
                      disabled={!stripeForm.enabled}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="stripe-test-mode"
                      checked={stripeForm.testMode}
                      onCheckedChange={(checked) => setStripeForm({...stripeForm, testMode: checked})}
                      disabled={!stripeForm.enabled}
                    />
                    <Label htmlFor="stripe-test-mode">Test Mode</Label>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:space-x-2">
                    <Button
                      variant="brand"
                      onClick={() => saveStripeMutation.mutate()}
                      disabled={saveStripeMutation.isPending || !stripeForm.enabled}
                      className="btn-brand-primary w-full sm:w-auto"
                    >
                      {saveStripeMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      <span className="hidden sm:inline">Save Stripe Settings</span>
                      <span className="sm:hidden">Save Settings</span>
                    </Button>

                    <Button
                      variant="brand"
                      onClick={() => testStripeMutation.mutate()}
                      disabled={testStripeMutation.isPending || !stripeForm.enabled || !stripeForm.secretKey}
                      className="w-full sm:w-auto"
                    >
                      {testStripeMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      {t('admin.settings.test_connection', 'Test Connection')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Paystack Integration</CardTitle>
                  <CardDescription>
                    Configure Paystack payment gateway
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="paystack-enabled"
                      checked={paystackForm.enabled}
                      onCheckedChange={(checked) => setPaystackForm({ ...paystackForm, enabled: checked })}
                    />
                    <Label htmlFor="paystack-enabled">Enable Paystack Payments</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="paystack-publicKey">Public Key</Label>
                    <Input
                      id="paystack-publicKey"
                      value={paystackForm.publicKey}
                      onChange={(e) => setPaystackForm({ ...paystackForm, publicKey: e.target.value })}
                      placeholder="pk_test_xxxxx"
                      disabled={!paystackForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="paystack-secretKey">Secret Key</Label>
                    <Input
                      id="paystack-secretKey"
                      type="password"
                      value={paystackForm.secretKey}
                      onChange={(e) => setPaystackForm({ ...paystackForm, secretKey: e.target.value })}
                      placeholder="sk_test_xxxxx"
                      disabled={!paystackForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="paystack-subaccount">Subaccount (optional)</Label>
                    <Input
                      id="paystack-subaccount"
                      value={paystackForm.subaccount}
                      onChange={(e) => setPaystackForm({ ...paystackForm, subaccount: e.target.value })}
                      placeholder="ACCT_xxxxx"
                      disabled={!paystackForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="paystack-webhookSecret">Webhook Secret (optional)</Label>
                    <Input
                      id="paystack-webhookSecret"
                      value={paystackForm.webhookSecret}
                      onChange={(e) => setPaystackForm({ ...paystackForm, webhookSecret: e.target.value })}
                      placeholder="whsec_xxxxx"
                      disabled={!paystackForm.enabled}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="paystack-test-mode"
                      checked={paystackForm.testMode}
                      onCheckedChange={(checked) => setPaystackForm({ ...paystackForm, testMode: checked })}
                      disabled={!paystackForm.enabled}
                    />
                    <Label htmlFor="paystack-test-mode">Test Mode</Label>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:space-x-2">
                    <Button
                      variant="brand"
                      onClick={() => savePaystackMutation.mutate()}
                      disabled={savePaystackMutation.isPending || !paystackForm.enabled}
                      className="btn-brand-primary w-full sm:w-auto"
                    >
                      {savePaystackMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      <span className="hidden sm:inline">Save Paystack Settings</span>
                      <span className="sm:hidden">Save Settings</span>
                    </Button>

                    <Button
                      variant="brand"
                      onClick={() => testPaystackMutation.mutate()}
                      disabled={testPaystackMutation.isPending || !paystackForm.enabled || !paystackForm.secretKey}
                      className="w-full sm:w-auto"
                    >
                      {testPaystackMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      {t('admin.settings.test_connection', 'Test Connection')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Mercado Pago Integration</CardTitle>
                  <CardDescription>
                    Configure Mercado Pago payment gateway
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="mercadopago-enabled"
                      checked={mercadoPagoForm.enabled}
                      onCheckedChange={(checked) => setMercadoPagoForm({...mercadoPagoForm, enabled: checked})}
                    />
                    <Label htmlFor="mercadopago-enabled">Enable Mercado Pago Payments</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mercadopago-clientId">Client ID</Label>
                    <Input
                      id="mercadopago-clientId"
                      value={mercadoPagoForm.clientId}
                      onChange={(e) => setMercadoPagoForm({...mercadoPagoForm, clientId: e.target.value})}
                      placeholder="2740017016616699"
                      disabled={!mercadoPagoForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mercadopago-clientSecret">Client Secret</Label>
                    <Input
                      id="mercadopago-clientSecret"
                      type="password"
                      value={mercadoPagoForm.clientSecret}
                      onChange={(e) => setMercadoPagoForm({...mercadoPagoForm, clientSecret: e.target.value})}
                      placeholder="9JUknDFhkXkuyEBuEnvWiXrpVFnYdtLc"
                      disabled={!mercadoPagoForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mercadopago-accessToken">Access Token</Label>
                    <Input
                      id="mercadopago-accessToken"
                      type="password"
                      value={mercadoPagoForm.accessToken}
                      onChange={(e) => setMercadoPagoForm({...mercadoPagoForm, accessToken: e.target.value})}
                      placeholder="APP_USR-2740017016616699-021517-c5d115a0e393d32ec81f16ec2dc15e7e-221745631"
                      disabled={!mercadoPagoForm.enabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      This is the Production Access Token from your Mercado Pago Developer Dashboard.
                      Make sure to use the correct token for test or production mode.
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="mercadopago-test-mode"
                      checked={mercadoPagoForm.testMode}
                      onCheckedChange={(checked) => setMercadoPagoForm({...mercadoPagoForm, testMode: checked})}
                      disabled={!mercadoPagoForm.enabled}
                    />
                    <Label htmlFor="mercadopago-test-mode">Test Mode</Label>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:space-x-2">
                    <Button
                      variant="brand"
                      onClick={() => saveMercadoPagoMutation.mutate()}
                      disabled={saveMercadoPagoMutation.isPending || !mercadoPagoForm.enabled}
                      className="btn-brand-primary w-full sm:w-auto"
                    >
                      {saveMercadoPagoMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      <span className="hidden sm:inline">Save Mercado Pago Settings</span>
                      <span className="sm:hidden">Save Settings</span>
                    </Button>

                    <Button
                      variant="brand"
                      onClick={() => testMercadoPagoMutation.mutate()}
                      disabled={testMercadoPagoMutation.isPending || !mercadoPagoForm.enabled || !mercadoPagoForm.accessToken}
                      className="w-full sm:w-auto"
                    >
                      {testMercadoPagoMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      {t('admin.settings.test_connection', 'Test Connection')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>PayPal Integration</CardTitle>
                  <CardDescription>
                    {t('admin.settings.configure_paypal_gateway', 'Configure PayPal payment gateway')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="paypal-enabled"
                      checked={paypalForm.enabled}
                      onCheckedChange={(checked) => setPaypalForm({...paypalForm, enabled: checked})}
                    />
                    <Label htmlFor="paypal-enabled">Enable PayPal Payments</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="clientId">Client ID</Label>
                    <Input
                      id="clientId"
                      value={paypalForm.clientId}
                      onChange={(e) => setPaypalForm({...paypalForm, clientId: e.target.value})}
                      placeholder="Your PayPal Client ID"
                      disabled={!paypalForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="clientSecret">Client Secret</Label>
                    <Input
                      id="clientSecret"
                      type="password"
                      value={paypalForm.clientSecret}
                      onChange={(e) => setPaypalForm({...paypalForm, clientSecret: e.target.value})}
                      placeholder="Your PayPal Client Secret"
                      disabled={!paypalForm.enabled}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="paypal-test-mode"
                      checked={paypalForm.testMode}
                      onCheckedChange={(checked) => setPaypalForm({...paypalForm, testMode: checked})}
                      disabled={!paypalForm.enabled}
                    />
                    <Label htmlFor="paypal-test-mode">Sandbox Mode</Label>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:space-x-2">
                    <Button
                      variant="brand"
                      onClick={() => savePaypalMutation.mutate()}
                      disabled={savePaypalMutation.isPending || !paypalForm.enabled}
                      className="btn-brand-primary w-full sm:w-auto"
                    >
                      {savePaypalMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      <span className="hidden sm:inline">Save PayPal Settings</span>
                      <span className="sm:hidden">Save Settings</span>
                    </Button>

                    <Button
                      variant="brand"
                      onClick={() => testPaypalMutation.mutate()}
                      disabled={testPaypalMutation.isPending || !paypalForm.enabled || !paypalForm.clientSecret}
                      className="w-full sm:w-auto"
                    >
                      {testPaypalMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      {t('admin.settings.test_connection', 'Test Connection')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Moyasar Integration</CardTitle>
                  <CardDescription>
                    Configure Moyasar payment gateway for Saudi Arabia
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="moyasar-enabled"
                      checked={moyasarForm.enabled}
                      onCheckedChange={(checked) => setMoyasarForm({...moyasarForm, enabled: checked})}
                    />
                    <Label htmlFor="moyasar-enabled">Enable Moyasar Payments</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="publishableKey">Publishable Key</Label>
                    <Input
                      id="publishableKey"
                      value={moyasarForm.publishableKey}
                      onChange={(e) => setMoyasarForm({...moyasarForm, publishableKey: e.target.value})}
                      placeholder="Your Moyasar Publishable Key"
                      disabled={!moyasarForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="secretKey">Secret Key</Label>
                    <Input
                      id="secretKey"
                      type="password"
                      value={moyasarForm.secretKey}
                      onChange={(e) => setMoyasarForm({...moyasarForm, secretKey: e.target.value})}
                      placeholder="Your Moyasar Secret Key"
                      disabled={!moyasarForm.enabled}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="moyasar-test-mode"
                      checked={moyasarForm.testMode}
                      onCheckedChange={(checked) => setMoyasarForm({...moyasarForm, testMode: checked})}
                      disabled={!moyasarForm.enabled}
                    />
                    <Label htmlFor="moyasar-test-mode">Test Mode</Label>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:space-x-2">
                    <Button
                      variant="brand"
                      onClick={() => saveMoyasarMutation.mutate()}
                      disabled={saveMoyasarMutation.isPending || !moyasarForm.enabled}
                      className="btn-brand-primary w-full sm:w-auto"
                    >
                      {saveMoyasarMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      <span className="hidden sm:inline">Save Moyasar Settings</span>
                      <span className="sm:hidden">Save Settings</span>
                    </Button>

                    <Button
                      variant="brand"
                      onClick={() => testMoyasarMutation.mutate()}
                      disabled={testMoyasarMutation.isPending || !moyasarForm.enabled || !moyasarForm.secretKey}
                      className="w-full sm:w-auto"
                    >
                      {testMoyasarMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      {t('admin.settings.test_connection', 'Test Connection')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>MPESA Integration</CardTitle>
                  <CardDescription>
                    Configure MPESA payment gateway for Kenya
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="mpesa-enabled"
                      checked={mpesaForm.enabled}
                      onCheckedChange={(checked) => setMpesaForm({...mpesaForm, enabled: checked})}
                    />
                    <Label htmlFor="mpesa-enabled">Enable MPESA Payments</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="consumerKey">Consumer Key</Label>
                    <Input
                      id="consumerKey"
                      value={mpesaForm.consumerKey}
                      onChange={(e) => setMpesaForm({...mpesaForm, consumerKey: e.target.value})}
                      placeholder="Your MPESA Consumer Key"
                      disabled={!mpesaForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="consumerSecret">Consumer Secret</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="consumerSecret"
                        type={mpesaForm as any && (mpesaForm as any)._showConsumerSecret ? 'text' : 'password'}
                        value={mpesaForm.consumerSecret}
                        onChange={(e) => setMpesaForm({...mpesaForm, consumerSecret: e.target.value})}
                        placeholder="Your MPESA Consumer Secret"
                        disabled={!mpesaForm.enabled}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setMpesaForm({
                          ...mpesaForm,
                          _showConsumerSecret: !(mpesaForm as any)._showConsumerSecret
                        } as any)}
                        aria-label={(mpesaForm as any)._showConsumerSecret ? 'Hide Consumer Secret' : 'Show Consumer Secret'}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="businessShortcode">Business Shortcode</Label>
                    <Input
                      id="businessShortcode"
                      value={mpesaForm.businessShortcode}
                      onChange={(e) => setMpesaForm({...mpesaForm, businessShortcode: e.target.value})}
                      placeholder="Your MPESA Business Shortcode"
                      disabled={!mpesaForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="shortcodeType">Shortcode Type</Label>
                    <Select
                      value={mpesaForm.shortcodeType}
                      onValueChange={(value) => setMpesaForm({...mpesaForm, shortcodeType: value as any})}
                      disabled={!mpesaForm.enabled}
                    >
                      <SelectTrigger id="shortcodeType">
                        <SelectValue placeholder="Select shortcode type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paybill">PayBill</SelectItem>
                        <SelectItem value="buygoods">BuyGoods (Till)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="passkey">Passkey</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="passkey"
                        type={(mpesaForm as any)._showPasskey ? 'text' : 'password'}
                        value={mpesaForm.passkey}
                        onChange={(e) => setMpesaForm({...mpesaForm, passkey: e.target.value})}
                        placeholder="Your MPESA Passkey"
                        disabled={!mpesaForm.enabled}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setMpesaForm({
                          ...mpesaForm,
                          _showPasskey: !(mpesaForm as any)._showPasskey
                        } as any)}
                        aria-label={(mpesaForm as any)._showPasskey ? 'Hide Passkey' : 'Show Passkey'}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="callbackUrl">Callback URL</Label>
                    <Input
                      id="callbackUrl"
                      value={mpesaForm.callbackUrl}
                      onChange={(e) => setMpesaForm({...mpesaForm, callbackUrl: e.target.value})}
                      placeholder="https://your-domain.com/api/webhooks/mpesa"
                      disabled={!mpesaForm.enabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      Must be a publicly reachable HTTPS URL that accepts MPESA STK callbacks.
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="mpesa-test-mode"
                      checked={mpesaForm.testMode}
                      onCheckedChange={(checked) => setMpesaForm({...mpesaForm, testMode: checked})}
                      disabled={!mpesaForm.enabled}
                    />
                    <Label htmlFor="mpesa-test-mode">Test Mode (Sandbox)</Label>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:space-x-2">
                    <Button
                      variant="brand"
                      onClick={() => saveMpesaMutation.mutate()}
                      disabled={saveMpesaMutation.isPending || !mpesaForm.enabled}
                      className="btn-brand-primary w-full sm:w-auto"
                    >
                      {saveMpesaMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      <span className="hidden sm:inline">Save MPESA Settings</span>
                      <span className="sm:hidden">Save Settings</span>
                    </Button>

                    <Button
                      variant="brand"
                      onClick={() => testMpesaMutation.mutate()}
                      disabled={testMpesaMutation.isPending || !mpesaForm.enabled || !mpesaForm.consumerSecret}
                      className="w-full sm:w-auto"
                    >
                      {testMpesaMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      {t('admin.settings.test_connection', 'Test Connection')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Bank Transfer</CardTitle>
                  <CardDescription>
                    Configure offline payment via bank transfer
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="bank-transfer-enabled"
                      checked={bankTransferForm.enabled}
                      onCheckedChange={(checked) => setBankTransferForm({...bankTransferForm, enabled: checked})}
                    />
                    <Label htmlFor="bank-transfer-enabled">Enable Bank Transfer</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="accountName">Account Name</Label>
                    <Input
                      id="accountName"
                      value={bankTransferForm.accountName}
                      onChange={(e) => setBankTransferForm({...bankTransferForm, accountName: e.target.value})}
                      placeholder={t('admin.settings.company_name_placeholder', 'Company Name')}
                      disabled={!bankTransferForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="accountNumber">Account Number</Label>
                    <Input
                      id="accountNumber"
                      value={bankTransferForm.accountNumber}
                      onChange={(e) => setBankTransferForm({...bankTransferForm, accountNumber: e.target.value})}
                      placeholder="123456789"
                      disabled={!bankTransferForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bankName">Bank Name</Label>
                    <Input
                      id="bankName"
                      value={bankTransferForm.bankName}
                      onChange={(e) => setBankTransferForm({...bankTransferForm, bankName: e.target.value})}
                      placeholder="Bank of Example"
                      disabled={!bankTransferForm.enabled}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="routingNumber">Routing Number</Label>
                      <Input
                        id="routingNumber"
                        value={bankTransferForm.routingNumber}
                        onChange={(e) => setBankTransferForm({...bankTransferForm, routingNumber: e.target.value})}
                        placeholder="Optional"
                        disabled={!bankTransferForm.enabled}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="swiftCode">SWIFT Code</Label>
                      <Input
                        id="swiftCode"
                        value={bankTransferForm.swiftCode}
                        onChange={(e) => setBankTransferForm({...bankTransferForm, swiftCode: e.target.value})}
                        placeholder="Optional"
                        disabled={!bankTransferForm.enabled}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="instructions">Payment Instructions</Label>
                    <Input
                      id="instructions"
                      value={bankTransferForm.instructions}
                      onChange={(e) => setBankTransferForm({...bankTransferForm, instructions: e.target.value})}
                      placeholder="Include payment reference in transfer details"
                      disabled={!bankTransferForm.enabled}
                    />
                  </div>

                  <Button
                    variant="brand"
                    onClick={() => saveBankTransferMutation.mutate()}
                    disabled={saveBankTransferMutation.isPending || !bankTransferForm.enabled}
                    className="btn-brand-primary"
                  >
                    {saveBankTransferMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Save Bank Transfer Settings
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="email">
            <Card>
              <CardHeader>
                <CardTitle>SMTP Email Configuration</CardTitle>
                <CardDescription>
                  {t('admin.settings.configure_smtp_settings', 'Configure SMTP settings for sending system emails, notifications, and password resets')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="smtp-enabled"
                    checked={smtpForm.enabled}
                    onCheckedChange={(checked) => setSmtpForm({...smtpForm, enabled: checked})}
                  />
                  <Label htmlFor="smtp-enabled">Enable SMTP Email</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  When enabled, the system will use SMTP to send emails for password resets, notifications, and other system communications.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="smtp-host">SMTP Host</Label>
                    <Input
                      id="smtp-host"
                      value={smtpForm.host}
                      onChange={(e) => setSmtpForm({...smtpForm, host: e.target.value})}
                      placeholder="smtp.example.com"
                      disabled={!smtpForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="smtp-username">SMTP Username</Label>
                    <Input
                      id="smtp-username"
                      value={smtpForm.username}
                      onChange={(e) => setSmtpForm({...smtpForm, username: e.target.value})}
                      placeholder="username@example.com"
                      disabled={!smtpForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="smtp-port">SMTP Port</Label>
                    <Input
                      id="smtp-port"
                      type="number"
                      value={smtpForm.port}
                      onChange={(e) => {
                        const port = parseInt(e.target.value) || 465;
                        let suggestedSecurity = smtpForm.security;

                        if (port === 465) {
                          suggestedSecurity = 'ssl';
                        } else if (port === 465) {
                          suggestedSecurity = 'ssl';
                        } else if (port === 25) {
                          suggestedSecurity = 'none';
                        }

                        setSmtpForm({...smtpForm, port, security: suggestedSecurity});
                      }}
                      placeholder="465"
                      disabled={!smtpForm.enabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      Common ports: 465 (SSL), 25 (No encryption)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="smtp-password">SMTP Password</Label>
                    <Input
                      id="smtp-password"
                      type="password"
                      value={smtpForm.password}
                      onChange={(e) => setSmtpForm({...smtpForm, password: e.target.value})}
                      placeholder={storedSmtpPassword ? "Leave empty to keep current password" : "Enter password"}
                      disabled={!smtpForm.enabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      {storedSmtpPassword ? "Password is set. Leave empty to keep it unchanged, or enter new password." : "For Gmail, use an App Password instead of your regular password"}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="smtp-security">Security</Label>
                    <Select
                      value={smtpForm.security}
                      onValueChange={(value) => setSmtpForm({...smtpForm, security: value})}
                      disabled={!smtpForm.enabled}
                    >
                      <SelectTrigger id="smtp-security">
                        <SelectValue placeholder="Select security" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ssl">SSL/TLS (Port 465)</SelectItem>
                        <SelectItem value="none">None (Port 25)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="smtp-from-email">From Email Address</Label>
                    <Input
                      id="smtp-from-email"
                      type="email"
                      value={smtpForm.fromEmail}
                      onChange={(e) => setSmtpForm({...smtpForm, fromEmail: e.target.value})}
                      placeholder="noreply@example.com"
                      disabled={!smtpForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="smtp-from-name">From Name</Label>
                    <Input
                      id="smtp-from-name"
                      value={smtpForm.fromName}
                      onChange={(e) => setSmtpForm({...smtpForm, fromName: e.target.value})}
                      placeholder="PowerChat Support"
                      disabled={!smtpForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="smtp-test-email">Test Email Address</Label>
                    <Input
                      id="smtp-test-email"
                      type="email"
                      value={smtpForm.testEmail}
                      onChange={(e) => setSmtpForm({...smtpForm, testEmail: e.target.value})}
                      placeholder="test@example.com"
                      disabled={!smtpForm.enabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      Email address to send test emails to
                    </p>
                  </div>
                </div>

                <div className="flex space-x-2">
                  <Button
                    variant="brand"
                    onClick={() => saveSmtpMutation.mutate()}
                    disabled={saveSmtpMutation.isPending || !smtpForm.enabled}
                    className="btn-brand-primary"
                  >
                    {saveSmtpMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Save SMTP Settings
                  </Button>

                  <Button
                    variant="brand"
                    onClick={() => testSmtpMutation.mutate()}
                    disabled={testSmtpMutation.isPending || !smtpForm.enabled || !smtpForm.host || !smtpForm.testEmail}
                  >
                    {testSmtpMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    {t('admin.settings.test_connection', 'Test Connection')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>General Settings</CardTitle>
                <CardDescription>
                  {t('admin.settings.configure_general_settings', 'Configure general application settings')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="defaultCurrency">Default Currency</Label>
                    
                    {/* Custom Currency Management Section */}
                    <div className="mb-3 space-y-2">
                      <Dialog open={showCustomCurrencyDialog} onOpenChange={setShowCustomCurrencyDialog}>
                        <DialogTrigger asChild>
                          <Button type="button" variant="outline" size="sm" className="w-full">
                            <Plus className="mr-2 h-4 w-4" />
                            Add Custom Currency
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Add Custom Currency</DialogTitle>
                            <DialogDescription>
                              Add a custom currency with a 3-letter ISO 4217 code, name, and symbol.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label htmlFor="currency-code">Currency Code (ISO 4217)</Label>
                              <Input
                                id="currency-code"
                                placeholder="USD"
                                value={customCurrencyForm.code}
                                onChange={(e) => setCustomCurrencyForm({...customCurrencyForm, code: e.target.value.toUpperCase()})}
                                maxLength={3}
                              />
                              <p className="text-xs text-muted-foreground">
                                3 uppercase letters (e.g., USD, EUR, GBP)
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="currency-name">Currency Name</Label>
                              <Input
                                id="currency-name"
                                placeholder="US Dollar"
                                value={customCurrencyForm.name}
                                onChange={(e) => setCustomCurrencyForm({...customCurrencyForm, name: e.target.value})}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="currency-symbol">Currency Symbol</Label>
                              <Input
                                id="currency-symbol"
                                placeholder="$"
                                value={customCurrencyForm.symbol}
                                onChange={(e) => setCustomCurrencyForm({...customCurrencyForm, symbol: e.target.value})}
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => {
                              setShowCustomCurrencyDialog(false);
                              setCustomCurrencyForm({ code: '', name: '', symbol: '' });
                            }}>
                              Cancel
                            </Button>
                            <Button onClick={handleAddCustomCurrency}>
                              Add Currency
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      {generalSettingsForm.customCurrencies.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Custom Currencies:</p>
                          <div className="space-y-1">
                            {generalSettingsForm.customCurrencies.map((currency) => (
                              <div key={currency.code} className="flex items-center justify-between p-2 border rounded-md">
                                <span className="text-sm">
                                  {currency.code} - {currency.name} ({currency.symbol})
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveCustomCurrency(currency.code)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <Select
                      value={generalSettingsForm.defaultCurrency}
                      onValueChange={(value) => setGeneralSettingsForm({...generalSettingsForm, defaultCurrency: value})}
                    >
                      <SelectTrigger id="defaultCurrency">
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                      <SelectContent>
                        {BUILT_IN_CURRENCY_OPTIONS.map((currency) => (
                          <SelectItem key={currency.code} value={currency.code}>
                            {currency.label}
                          </SelectItem>
                        ))}
                        {generalSettingsForm.customCurrencies.length > 0 && (
                          <>
                            <SelectSeparator />
                            {generalSettingsForm.customCurrencies.map((currency) => (
                              <SelectItem key={currency.code} value={currency.code}>
                                {currency.code} - {currency.name} ({currency.symbol})
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dateFormat">Date Format</Label>
                    <Select
                      value={generalSettingsForm.dateFormat}
                      onValueChange={(value) => setGeneralSettingsForm({...generalSettingsForm, dateFormat: value})}
                    >
                      <SelectTrigger id="dateFormat">
                        <SelectValue placeholder="Select date format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                        <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                        <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="timeFormat">Time Format</Label>
                    <Select
                      value={generalSettingsForm.timeFormat}
                      onValueChange={(value) => setGeneralSettingsForm({...generalSettingsForm, timeFormat: value})}
                    >
                      <SelectTrigger id="timeFormat">
                        <SelectValue placeholder="Select time format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="12h">12-hour (AM/PM)</SelectItem>
                        <SelectItem value="24h">24-hour</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator className="my-6" />

                {/* Application Embedding Section */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium">Application Embedding</h3>
                    <p className="text-sm text-muted-foreground">
                      Generate HTML embed code to integrate {brandingForm.appName || 'app'} into external websites or platforms
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="embedWidth">Embed Width</Label>
                      <Input
                        id="embedWidth"
                        type="text"
                        placeholder="100% or 800px"
                        value={embedSettings.width}
                        onChange={(e) => setEmbedSettings({...embedSettings, width: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="embedHeight">Embed Height</Label>
                      <Input
                        id="embedHeight"
                        type="text"
                        placeholder="600px or 100vh"
                        value={embedSettings.height}
                        onChange={(e) => setEmbedSettings({...embedSettings, height: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="borderRadius">Border Radius</Label>
                      <Input
                        id="borderRadius"
                        type="text"
                        placeholder="8px"
                        value={embedSettings.borderRadius}
                        onChange={(e) => setEmbedSettings({...embedSettings, borderRadius: e.target.value})}
                      />
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="showHeader"
                          checked={embedSettings.showHeader}
                          onChange={(e) => setEmbedSettings({...embedSettings, showHeader: e.target.checked})}
                          className="rounded"
                        />
                        <Label htmlFor="showHeader">Show Header</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="allowFullscreen"
                          checked={embedSettings.allowFullscreen}
                          onChange={(e) => setEmbedSettings({...embedSettings, allowFullscreen: e.target.checked})}
                          className="rounded"
                        />
                        <Label htmlFor="allowFullscreen">Allow Fullscreen</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="boxShadow"
                          checked={embedSettings.boxShadow}
                          onChange={(e) => setEmbedSettings({...embedSettings, boxShadow: e.target.checked})}
                          className="rounded"
                        />
                        <Label htmlFor="boxShadow">Box Shadow</Label>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={generateEmbedCode}
                      className="flex items-center gap-2"
                    >
                      <Code className="h-4 w-4" />
                      Generate Embed Code
                    </Button>
                    {embedCode && (
                      <>
                        <Button
                          variant="outline"
                          onClick={copyEmbedCode}
                          className="flex items-center gap-2"
                        >
                          {copySuccess ? (
                            <>
                              <Check className="h-4 w-4 text-green-600" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4" />
                              Copy to Clipboard
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setShowEmbedPreview(!showEmbedPreview)}
                          className="flex items-center gap-2"
                        >
                          <Eye className="h-4 w-4" />
                          {showEmbedPreview ? 'Hide Preview' : 'Preview Embed'}
                        </Button>
                      </>
                    )}
                  </div>

                  {embedCode && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="embedCode">Generated Embed Code</Label>
                        <div className="relative">
                          <textarea
                            id="embedCode"
                            readOnly
                            value={embedCode}
                            className="w-full h-32 p-3 text-sm font-mono bg-gray-50 dark:bg-muted border border-gray-200 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Generated embed code will appear here..."
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Copy this HTML code and paste it into your website where you want PowerChat to appear.
                        </p>
                      </div>

                      {showEmbedPreview && embedCode && (
                        <div className="space-y-2">
                          <Label>Embed Preview</Label>
                          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 dark:bg-muted">
                            <div
                              className="bg-white rounded border"
                              style={{
                                width: embedSettings.width === '100%' ? '100%' : embedSettings.width,
                                height: embedSettings.height,
                                maxWidth: '100%',
                                maxHeight: '700px',
                                overflow: 'hidden'
                              }}
                            >
                              <iframe {...getIframeProps()} />
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            This is how the embedded application will appear on external websites.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start space-x-2">
                      <div className="text-blue-600 mt-0.5">
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="text-sm">
                        <p className="font-medium text-blue-900">Embedding Guidelines</p>
                        <ul className="text-blue-700 mt-1 space-y-1">
                          <li>• The embed code points directly to the main application with embed context</li>
                          <li>• Users will authenticate within the embedded application with full functionality</li>
                          <li>• The iframe includes proper security sandboxing and permission controls</li>
                          <li>• Responsive design automatically adapts to the container size</li>
                          <li>• HTTPS is recommended for secure embedding on external websites</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator className="my-6" />

                {/* <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium">Authentication Settings</h3>
                    <p className="text-sm text-muted-foreground">
                      Configure how companies and users access the platform
                    </p>
                  </div>

                  <div className="flex items-center justify-between space-x-2">
                    <div className="space-y-0.5">
                      <Label htmlFor="subdomain-auth" className="text-base">
                        Subdomain-Based Authentication
                      </Label>
                      <div className="text-sm text-muted-foreground">
                        Enable company-specific subdomains (e.g., company.yourdomain.com/auth)
                        <br />
                        <span className="text-amber-600">
                          ⚠️ Requires DNS configuration for wildcard subdomains
                        </span>
                      </div>
                    </div>
                    <Switch
                      id="subdomain-auth"
                      checked={generalSettingsForm.subdomainAuthentication}
                      onCheckedChange={(checked) =>
                        setGeneralSettingsForm({...generalSettingsForm, subdomainAuthentication: checked})
                      }
                    />
                  </div>

                  {generalSettingsForm.subdomainAuthentication && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start space-x-2">
                        <div className="text-blue-600 mt-0.5">
                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="text-sm">
                          <p className="font-medium text-blue-900">DNS Configuration Required</p>
                          <p className="text-blue-700 mt-1">
                            To use subdomain authentication, configure a wildcard DNS record:
                            <br />
                            <code className="bg-blue-100 px-1 rounded">*.yourdomain.com → your-server-ip</code>
                          </p>
                          <p className="text-blue-700 mt-2">
                            Companies will access their accounts at: <code className="bg-blue-100 px-1 rounded">{'{company-slug}'}.yourdomain.com</code>
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div> */}

                <Separator />

                {/* Frontend Website Toggle */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="frontend-website">{t('admin.settings.frontend_website', 'Frontend Website')}</Label>
                      <div className="text-sm text-muted-foreground">
                        {t('admin.settings.frontend_website_description', 'Enable or disable the public landing page at /landing')}
                      </div>
                    </div>
                    <Switch
                      id="frontend-website"
                      checked={generalSettingsForm.frontendWebsiteEnabled}
                      onCheckedChange={(checked) =>
                        setGeneralSettingsForm({...generalSettingsForm, frontendWebsiteEnabled: checked})
                      }
                    />
                  </div>

                  {!generalSettingsForm.frontendWebsiteEnabled && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <div className="flex items-start space-x-2">
                        <div className="text-yellow-600 mt-0.5">
                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-yellow-800">{t('admin.settings.website_disabled', 'Website Disabled')}</h4>
                          <p className="text-sm text-yellow-700 mt-1">
                            {t('admin.settings.website_disabled_description', 'The public landing page is currently disabled. Visitors to /landing will see a "not found" page.')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <Separator className="my-6" />

                {/* Plan Renewal Section */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium">Plan Renewal Settings</h3>
                    <p className="text-sm text-muted-foreground">
                      Control whether companies can have automatic plan renewals
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="plan-renewal-enabled" className="text-base">
                        Enable Plan Renewal
                      </Label>
                      <div className="text-sm text-muted-foreground">
                        {generalSettingsForm.planRenewalEnabled ? (
                          <span className="text-green-600">
                            Plan renewal is enabled. Companies can set up automatic renewals.
                          </span>
                        ) : (
                          <span className="text-blue-600">
                            Plan renewal is disabled. Companies can use their plans indefinitely without expiry.
                          </span>
                        )}
                      </div>
                    </div>
                    <Switch
                      id="plan-renewal-enabled"
                      checked={generalSettingsForm.planRenewalEnabled}
                      onCheckedChange={(checked) =>
                        setGeneralSettingsForm({...generalSettingsForm, planRenewalEnabled: checked})
                      }
                    />
                  </div>

                  {!generalSettingsForm.planRenewalEnabled && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start space-x-2">
                        <div className="text-blue-600 mt-0.5">
                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-blue-800">Unlimited Plan Usage</h4>
                          <p className="text-sm text-blue-700 mt-1">
                            When plan renewal is disabled, companies can use their plans indefinitely without any expiry dates or renewal requirements. Plans will never expire and no renewal dialogs will be shown.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <Separator className="my-6" />

                {/* Help & Support URL Section */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium">Help & Support</h3>
                    <p className="text-sm text-muted-foreground">
                      Configure the Help & Support URL that appears in the company sidebar
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="help-support-url">Help & Support URL</Label>
                    <Input
                      id="help-support-url"
                      type="url"
                      value={generalSettingsForm.helpSupportUrl}
                      onChange={(e) => setGeneralSettingsForm({...generalSettingsForm, helpSupportUrl: e.target.value})}
                      placeholder="https://docs.yourdomain.com"
                    />
                    <p className="text-xs text-muted-foreground">
                      This URL will be used for the "Help & Support" link in the company sidebar.
                      If left empty, it will default to https://docs.{'{domain}'}.
                    </p>
                  </div>
                </div>

                <Button
                  variant="brand"
                  onClick={() => saveGeneralSettingsMutation.mutate()}
                  disabled={saveGeneralSettingsMutation.isPending}
                  className="btn-brand-primary"
                >
                  {saveGeneralSettingsMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save General Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="registration">
            <Card>
              <CardHeader>
                <CardTitle>Company Registration Settings</CardTitle>
                <CardDescription>
                  Control how new companies can register for your platform
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="registration-enabled"
                    checked={registrationSettings.enabled}
                    onCheckedChange={(checked) => setRegistrationSettings({...registrationSettings, enabled: checked})}
                  />
                  <Label htmlFor="registration-enabled" className="text-sm font-medium">
                    {t('admin.settings.enable_company_registration', 'Enable Company Registration')}
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('admin.settings.registration_description', 'When enabled, new companies can register for accounts. When disabled, the registration page will show a message that registration is currently unavailable.')}
                </p>

                <Separator />

                <div className="flex items-center space-x-2">
                  <Switch
                    id="registration-approval"
                    checked={registrationSettings.requireApproval}
                    onCheckedChange={(checked) => setRegistrationSettings({...registrationSettings, requireApproval: checked})}
                    disabled={!registrationSettings.enabled}
                  />
                  <Label htmlFor="registration-approval" className="text-sm font-medium">
                    Require Admin Approval
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('admin.settings.approval_description', 'When enabled, new company registrations will require super admin approval before they can access the platform.')}
                </p>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="default-plan">Default Plan for New Companies</Label>
                  <Select
                    value={registrationSettings.defaultPlan}
                    onValueChange={(value) => setRegistrationSettings({...registrationSettings, defaultPlan: value})}
                    disabled={!registrationSettings.enabled || isLoadingPlans}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select default plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {isLoadingPlans ? (
                        <SelectItem value="loading" disabled>
                          <div className="flex items-center">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Loading plans...
                          </div>
                        </SelectItem>
                      ) : plans && plans.length > 0 ? (
                        plans
                          .filter((plan: any) => plan.isActive)
                          .map((plan: any) => (
                            <SelectItem key={plan.id} value={plan.id.toString()}>
                              {plan.name} ({formatCurrency(plan.price)}/month) - {plan.maxUsers} users
                            </SelectItem>
                          ))
                      ) : (
                        <SelectItem value="none" disabled>
                          No plans available
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    New companies will be automatically assigned to this plan upon registration.
                  </p>
                </div>

                <Button
                  variant="brand"
                  onClick={() => {
                    try {
                      const payload = {
                        enabled: Boolean(registrationSettings.enabled),
                        requireApproval: Boolean(registrationSettings.requireApproval),
                        defaultPlan: registrationSettings.defaultPlan || (plans && plans.length > 0 ? plans[0].id.toString() : '1')
                      };

                      if (payload.enabled && !payload.defaultPlan) {
                        toast({
                          title: 'Validation Error',
                          description: 'Default plan is required when registration is enabled',
                          variant: 'destructive'
                        });
                        return;
                      }

                      saveRegistrationMutation.mutate();
                    } catch (error) {
                      toast({
                        title: 'Error',
                        description: 'An unexpected error occurred',
                        variant: 'destructive'
                      });
                    }
                  }}
                  disabled={saveRegistrationMutation.isPending}
                  className="btn-brand-primary"
                >
                  {saveRegistrationMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save Registration Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="backup">
            <BackupManagement />
          </TabsContent>

          <TabsContent value="updates">
            <SystemUpdatesTab />
          </TabsContent>

          <TabsContent value="ai-credentials">
            <AiCredentialsTab />
          </TabsContent>

          <TabsContent value="ai-usage">
            <SystemUsageAnalytics />
          </TabsContent>

          <TabsContent value="platform">
            <Card>
              <CardHeader>
                <CardTitle>Platform Configuration</CardTitle>
                <CardDescription>
                  Configure platform-wide integrations and partner API settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Meta WhatsApp Business API Partner Configuration */}
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-medium">Meta Partner API</h3>
                        <p className="text-sm text-gray-500">
                          Configure Meta Tech Provider credentials for embedded signup across WhatsApp, Messenger, and Instagram
                        </p>
                      </div>
                      <Button
                        onClick={() => setShowMetaPartnerConfigModal(true)}
                        variant="outline"
                        className="btn-brand-primary"
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        {t('admin.settings.configure', 'Configure')}
                      </Button>
                    </div>

                    <div className="text-sm text-gray-600">
                      <p>• Tech Provider embedded signup integration</p>
                      <p>• Streamlined WhatsApp Business account onboarding</p>
                      <p>• Easy setup for Messenger via Facebook Pages</p>
                      <p>• Easy setup for Instagram Business accounts</p>
                      <p>• Automatic phone number provisioning (WhatsApp)</p>
                    </div>
                  </div>

                  {/* TikTok Business Messaging API Configuration */}
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-medium flex items-center gap-2">
                          <i className="ri-tiktok-line text-xl"></i>
                          TikTok Business Messaging API
                        </h3>
                        <p className="text-sm text-gray-500">
                          Configure TikTok Partner credentials for company messaging integration
                        </p>
                      </div>
                      <Button
                        onClick={() => setShowTikTokPlatformConfigModal(true)}
                        variant="outline"
                        className="btn-brand-primary"
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        {t('admin.settings.configure', 'Configure')}
                      </Button>
                    </div>

                    <div className="text-sm text-gray-600">
                      <p>• Platform-wide TikTok Business Messaging integration</p>
                      <p>• OAuth 2.0 authentication for company accounts</p>
                      <p>• Direct messaging with TikTok users</p>
                      <p>• Requires TikTok Messaging Partner approval</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="custom-scripts">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  Custom Scripts
                </CardTitle>
                <CardDescription>
                  Inject custom HTML and JavaScript code globally across your application.
                  This feature allows you to integrate third-party services like translation tools, analytics, or other widgets.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Security Warning */}
                <Alert className="border-yellow-200 bg-yellow-50">
                  <AlertDescription className="text-yellow-800">
                    <strong>Security Warning:</strong> Only add scripts from trusted sources.
                    Malicious scripts can compromise your application's security and user data.
                    Scripts are validated against a whitelist of common CDNs and services.
                  </AlertDescription>
                </Alert>

                {/* Enable/Disable Toggle */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <Label className="text-base font-medium">Enable Custom Scripts</Label>
                    <p className="text-sm text-muted-foreground">
                      Toggle to enable or disable custom script injection globally
                    </p>
                  </div>
                  <Switch
                    checked={customScriptsForm.enabled}
                    onCheckedChange={(checked) =>
                      setCustomScriptsForm(prev => ({ ...prev, enabled: checked }))
                    }
                  />
                </div>

                {/* Scripts Input */}
                <div className="space-y-3">
                  <Label htmlFor="custom-scripts" className="text-base font-medium">
                    Custom Scripts
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Paste your HTML/JavaScript code here. Scripts will be injected into the &lt;head&gt; section of all pages.
                  </p>
                  <Textarea
                    id="custom-scripts"
                    placeholder={`Example:
<script type="text/javascript" src="https://cdn.weglot.com/weglot.min.js"></script>
<script>
    Weglot.initialize({
        api_key: 'your_api_key_here'
    });
</script>`}
                    value={customScriptsForm.scripts}
                    onChange={(e) =>
                      setCustomScriptsForm(prev => ({ ...prev, scripts: e.target.value }))
                    }
                    className="min-h-[200px] font-mono text-sm"
                    disabled={!customScriptsForm.enabled}
                  />
                  <p className="text-xs text-muted-foreground">
                    Supported domains include: cdn.jsdelivr.net, cdnjs.cloudflare.com, unpkg.com,
                    googleapis.com, facebook.net, stripe.com, paypal.com, weglot.com, and more.
                  </p>
                </div>

                {/* Last Modified Info */}
                {customScriptsForm.lastModified && (
                  <div className="text-sm text-muted-foreground">
                    Last modified: {new Date(customScriptsForm.lastModified).toLocaleString()}
                  </div>
                )}

                {/* Save Button */}
                <div className="flex justify-end">
                  <Button
                    onClick={() => saveCustomScriptsMutation.mutate()}
                    disabled={saveCustomScriptsMutation.isPending}
                    className="btn-brand-primary"
                  >
                    {saveCustomScriptsMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Save Custom Scripts
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="custom-css">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Paintbrush className="h-5 w-5" />
                  Custom CSS
                </CardTitle>
                <CardDescription>
                  Inject custom CSS styles globally across your application.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
              

                {/* Enable/Disable Toggle */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <Label className="text-base font-medium">Enable Custom CSS</Label>
                    <p className="text-sm text-muted-foreground">
                      Toggle to enable or disable custom CSS injection globally
                    </p>
                  </div>
                  <Switch
                    checked={customCssForm.enabled}
                    onCheckedChange={(checked) =>
                      setCustomCssForm(prev => ({ ...prev, enabled: checked }))
                    }
                  />
                </div>

                {/* CSS Input */}
                <div className="space-y-3">
                  <Label htmlFor="custom-css" className="text-base font-medium">
                    Custom CSS
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Paste your CSS code here. Styles will be injected into the &lt;head&gt; section of all pages.
                  </p>
                  <Textarea
                    id="custom-css"
                    placeholder={`Example:
/* Custom button styles */
.btn-brand-primary {
  border-radius: 8px;
  font-weight: 600;
}

/* Custom header styles */
header {
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

/* Custom sidebar styles (use !important to override inline styles) */
aside {
  background-color: #f5f5f5 !important;
}

/* Or target admin sidebar specifically */
div.flex.flex-1.relative > aside {
  background-color: #f5f5f5 !important;
}`}
                    value={customCssForm.css}
                    onChange={(e) =>
                      setCustomCssForm(prev => ({ ...prev, css: e.target.value }))
                    }
                    className="min-h-[200px] font-mono text-sm"
                    disabled={!customCssForm.enabled}
                  />
                  <p className="text-xs text-muted-foreground">
                    CSS will be applied globally. Use specific selectors to target elements without affecting the entire application.
                  </p>
                </div>

                {/* Last Modified Info */}
                {customCssForm.lastModified && (
                  <div className="text-sm text-muted-foreground">
                    Last modified: {new Date(customCssForm.lastModified).toLocaleString()}
                  </div>
                )}

                {/* Save Button */}
                <div className="flex justify-end">
                  <Button
                    onClick={() => saveCustomCssMutation.mutate()}
                    disabled={saveCustomCssMutation.isPending}
                    className="btn-brand-primary"
                  >
                    {saveCustomCssMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Save Custom CSS
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>


        </Tabs>

        {/* Partner Configuration Modals */}
        <MetaPartnerConfigurationForm
          isOpen={showMetaPartnerConfigModal}
          onClose={() => setShowMetaPartnerConfigModal(false)}
          onSuccess={() => {
            toast({
              title: "Success",
              description: "Meta Partner configuration updated successfully",
            });
            setShowMetaPartnerConfigModal(false);
          }}
        />

        <TikTokPlatformConfigForm
          isOpen={showTikTokPlatformConfigModal}
          onClose={() => setShowTikTokPlatformConfigModal(false)}
          onSuccess={() => {
            toast({
              title: "Success",
              description: "TikTok platform configuration updated successfully",
            });
            setShowTikTokPlatformConfigModal(false);
          }}
        />
        <AuthBackgroundPreviewModal
          isOpen={showAuthPreviewModal}
          onClose={() => setShowAuthPreviewModal(false)}
          adminConfig={adminAuthBgConfig}
          adminBgImageUrl={adminAuthBgPreview}
          userConfig={userAuthBgConfig}
          userBgImageUrl={userAuthBgPreview}
          brandingData={{ appName: brandingForm.appName, logoUrl: logoPreview || '', primaryColor: brandingForm.primaryColor }}
        />
      </div>
    </AdminLayout>
  );
}