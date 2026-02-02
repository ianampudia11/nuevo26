import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Lock, Mail, Eye, EyeOff } from "lucide-react";
import { generateBackgroundStyle } from "@/lib/auth-background-utils";
import { useTranslation } from "@/hooks/use-translation";

interface AuthBackgroundConfig {
  backgroundColor: string;
  gradientMode: 'simple' | 'advanced';
  simpleGradient: { startColor: string; endColor: string; direction: string };
  advancedGradient: { stops: Array<{ color: string; position: number }>; angle: number };
  priority: 'image' | 'color' | 'layer';
}

interface AuthBackgroundPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  adminConfig: AuthBackgroundConfig;
  adminBgImageUrl: string | null;
  userConfig: AuthBackgroundConfig;
  userBgImageUrl: string | null;
  brandingData: { appName: string; logoUrl: string; primaryColor: string };
}

export function AuthBackgroundPreviewModal({
  isOpen,
  onClose,
  adminConfig,
  adminBgImageUrl,
  userConfig,
  userBgImageUrl,
  brandingData,
}: AuthBackgroundPreviewModalProps) {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);

  const adminBackgroundStyle = generateBackgroundStyle(adminConfig, adminBgImageUrl);
  const userBackgroundStyle = generateBackgroundStyle(userConfig, userBgImageUrl);

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'image':
        return 'Image Only';
      case 'color':
        return 'Color/Gradient Only';
      case 'layer':
        return 'Layered';
      default:
        return priority;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Auth Background Preview</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="admin" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="admin">Admin Login Preview</TabsTrigger>
            <TabsTrigger value="user">User Login Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="admin" className="mt-4">
            <div className="relative min-h-[500px] flex items-center justify-center overflow-y-auto rounded-lg border">
              <div
                className="absolute inset-0 w-full h-full"
                style={adminBackgroundStyle}
              />
              <div className="relative z-10 w-full max-w-md p-4">
                <Card>
                  <CardHeader className="space-y-1 text-center">
                    <div className="flex justify-center mb-4">
                      <svg viewBox="0 0 24 24" width={60} height={60} fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8.18164 10.7027C8.18164 10.7027 8.18168 8.13513 8.18164 6.59459C8.1816 4.74571 9.70861 3 11.9998 3C14.291 3 15.8179 4.74571 15.8179 6.59459C15.8179 8.13513 15.8179 10.7027 15.8179 10.7027" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path fillRule="evenodd" clipRule="evenodd" d="M4.50005 11.3932C4.50001 13.1319 4.49995 16.764 4.50007 19.1988C4.5002 21.8911 8.66375 22.5 12.0001 22.5C15.3364 22.5 19.5 21.8911 19.5 19.1988L19.5 11.3932C19.5 10.8409 19.0523 10.3957 18.5 10.3957H5.50004C4.94777 10.3957 4.50006 10.8409 4.50005 11.3932ZM10.5 16.0028C10.5 16.4788 10.7069 16.9065 11.0357 17.2008V18.7529C11.0357 19.3051 11.4834 19.7529 12.0357 19.7529H12.1786C12.7309 19.7529 13.1786 19.3051 13.1786 18.7529V17.2008C13.5074 16.9065 13.7143 16.4788 13.7143 16.0028C13.7143 15.1152 12.9948 14.3957 12.1072 14.3957C11.2195 14.3957 10.5 15.1152 10.5 16.0028Z" fill="#000000"/>
                      </svg>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <CardTitle className="text-2xl">{t('admin.login_title', 'Admin Login')}</CardTitle>
                      <Badge variant="outline" className="ml-2">
                        {getPriorityLabel(adminConfig.priority)}
                      </Badge>
                    </div>
                    <CardDescription>
                      {t('admin.login_description', 'Enter your credentials to access the admin panel')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">
                          {t('auth.username_or_email', 'Username or Email')}
                        </label>
                        <Input
                          placeholder={t('auth.admin_login_placeholder', 'Enter your username or email')}
                          disabled
                          className="bg-gray-50"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">
                          {t('auth.password', 'Password')}
                        </label>
                        <Input
                          type="password"
                          placeholder={t('auth.password_placeholder', '••••••••')}
                          disabled
                          className="bg-gray-50"
                        />
                      </div>
                      <div className="flex justify-end">
                        <a href="#" className="text-sm text-blue-600 hover:text-blue-800 hover:underline" onClick={(e) => e.preventDefault()}>
                          {t('auth.forgot_password', 'Forgot password?')}
                        </a>
                      </div>
                      <Button
                        type="button"
                        className="w-full btn-brand-primary"
                        variant="brand"
                        disabled
                      >
                        {t('auth.login', 'Login')}
                      </Button>
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-center">
                    <p className="text-sm text-gray-500">
                      {t('admin.restricted_area', 'This area is restricted to administrators only')}
                    </p>
                  </CardFooter>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="user" className="mt-4">
            <div className="relative min-h-[500px] flex items-center justify-center overflow-y-auto rounded-lg border">
              <div
                className="absolute inset-0 w-full h-full"
                style={userBackgroundStyle}
              />
              {/* Background decorative elements */}
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-100/30 rounded-full blur-3xl"></div>
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-100/30 rounded-full blur-3xl"></div>
              </div>

              {/* Main auth card */}
              <div className="relative z-10 w-full max-w-md p-4">
                <div className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-xl border border-border/20 p-8">
                  {/* Logo icon */}
                  <div className="flex justify-center mb-6">
                    <div className="w-auto h-12 flex items-center justify-center">
                      {brandingData.logoUrl ? (
                        <img src={brandingData.logoUrl} alt={brandingData.appName} className="h-12 w-auto" />
                      ) : (
                        <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center">
                          <span className="text-white font-bold text-lg">{brandingData.appName.charAt(0)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Title and description */}
                  <div className="text-center mb-8">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <h1 className="text-2xl font-semibold text-gray-900">
                        {t('auth.signin_title', 'Access like a shadow')}
                      </h1>
                      <Badge variant="outline" className="ml-2">
                        {getPriorityLabel(userConfig.priority)}
                      </Badge>
                    </div>
                    <p className="text-gray-500 text-sm">
                      {t('auth.signin_description', 'Unite your customer conversations across all channels in one powerful CRM.')}
                    </p>
                  </div>

                  {/* Login form */}
                  <div className="space-y-4">
                    <div>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <Input
                          placeholder={t('auth.email_placeholder', 'Email')}
                          className="pl-10 h-12 bg-gray-50 border-gray-200 rounded-lg"
                          disabled
                        />
                      </div>
                    </div>

                    <div>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder={t('auth.password_placeholder', 'Password')}
                          className="pl-10 pr-10 h-12 bg-gray-50 border-gray-200 rounded-lg"
                          disabled
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          disabled
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>

                    {/* Forgot password link */}
                    <div className="flex justify-end">
                      <a href="#" className="text-sm text-blue-600 hover:text-blue-800 hover:underline" onClick={(e) => e.preventDefault()}>
                        {t('auth.forgot_password', 'Forgot password?')}
                      </a>
                    </div>

                    {/* Submit button */}
                    <Button
                      type="button"
                      className="w-full h-12 btn-brand-primary text-white rounded-lg font-medium"
                      disabled
                    >
                      {t('auth.get_started', 'Login')}
                    </Button>
                  </div>

                  {/* Register link */}
                  <div className="mt-4 text-center">
                    <p className="text-sm text-gray-600">
                      {t('auth.new_to_platform', 'New to the platform?')}{' '}
                      <a
                        href="#"
                        className="text-blue-600 hover:text-blue-800 font-medium hover:underline"
                        onClick={(e) => e.preventDefault()}
                      >
                        {t('auth.register_company', 'Register for a new Company')}
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <p className="text-sm text-muted-foreground">
              This is a preview. Changes are not saved yet.
            </p>
            <Button onClick={onClose}>Close</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

