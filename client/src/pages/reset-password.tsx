import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Eye, EyeOff, Loader2, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/use-translation";
import { useBranding } from "@/contexts/branding-context";
import { useAuthBackgroundStyles } from "@/hooks/use-branding-styles";
import { useTheme } from "next-themes";
import { apiRequest } from "@/lib/queryClient";

interface ResetPasswordResponse {
  success: boolean;
  message: string;
  error?: string;
}

interface TokenValidationResponse {
  valid: boolean;
  message: string;
}

export default function ResetPasswordPage() {
  const [location, setLocation] = useLocation();
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");
  
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();
  const { branding } = useBranding();
  const { theme } = useTheme();
  const authBackgroundStyles = useAuthBackgroundStyles('user');
  const [backgroundImageError, setBackgroundImageError] = useState(false);


  const { data: tokenValidation, isLoading: isValidatingToken, error: tokenError } = useQuery({
    queryKey: ["validate-reset-token", token],
    queryFn: async () => {
      if (!token) throw new Error("No token provided");
      const res = await apiRequest("GET", `/api/auth/reset-password/${token}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to validate token");
      }
      return await res.json() as TokenValidationResponse;
    },
    enabled: !!token,
    retry: false
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: { token: string; newPassword: string; confirmPassword: string }) => {
      const res = await apiRequest("POST", "/api/auth/reset-password", data);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to reset password");
      }
      return await res.json() as ResetPasswordResponse;
    },
    onSuccess: (data) => {
      setIsSuccess(true);
      toast({
        title: t('auth.password_reset_successful', 'Password reset successful'),
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('auth.error', 'Error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token) {
      toast({
        title: t('auth.error', 'Error'),
        description: t('auth.invalid_reset_token', 'Invalid reset token'),
        variant: "destructive",
      });
      return;
    }

    if (!newPassword.trim() || !confirmPassword.trim()) {
      toast({
        title: t('auth.error', 'Error'),
        description: t('auth.fill_all_fields', 'Please fill in all fields'),
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: t('auth.error', 'Error'),
        description: t('auth.passwords_do_not_match', 'Passwords do not match'),
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: t('auth.error', 'Error'),
        description: t('auth.password_min_length', 'Password must be at least 6 characters long'),
        variant: "destructive",
      });
      return;
    }

    resetPasswordMutation.mutate({
      token,
      newPassword,
      confirmPassword
    });
  };


  useEffect(() => {
    if (!token) {
      setLocation("/auth");
    }
  }, [token, setLocation]);

  useEffect(() => {
    if (branding.userAuthBackgroundUrl) {
      const img = new Image();
      img.src = branding.userAuthBackgroundUrl;
      img.onerror = () => setBackgroundImageError(true);
      img.onload = () => setBackgroundImageError(false);
    }
  }, [branding.userAuthBackgroundUrl]);

  const finalBackgroundStyles = useMemo(() => {
    const isDark = theme === 'dark';
    
    if (backgroundImageError) {

      const config = branding.authBackgroundConfig?.userAuthBackground;
      if (!config) {

        return isDark ? {} : { background: 'linear-gradient(to bottom right, rgb(248, 250, 252), rgb(239, 246, 255))' };
      }


      const gradientCss = config.gradientConfig
        ? (config.gradientConfig.mode === 'simple'
          ? (() => {
              const { startColor, endColor, direction } = config.gradientConfig!.simple;
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
              const cssDirection = directionMap[direction] || 'to bottom';
              return `linear-gradient(${cssDirection}, ${startColor}, ${endColor})`;
            })()
          : (() => {
              const { stops, angle } = config.gradientConfig!.advanced;
              const stopsCss = stops
                .map(stop => `${stop.color} ${stop.position}%`)
                .join(', ');
              return `linear-gradient(${angle}deg, ${stopsCss})`;
            })())
        : undefined;


      switch (config.priority) {
        case 'image':
        case 'layer':


          if (isDark) return {};
          return {
            backgroundImage: gradientCss || undefined,
            backgroundColor: !gradientCss ? config.backgroundColor : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          };
        
        case 'color':


          if (isDark) return {};
          return {
            backgroundImage: gradientCss || undefined,
            backgroundColor: !gradientCss ? config.backgroundColor : undefined
          };
        
        default:

          return isDark ? {} : { background: 'linear-gradient(to bottom right, rgb(248, 250, 252), rgb(239, 246, 255))' };
      }
    }
    

    if (isDark) return {};
    
    return Object.keys(authBackgroundStyles).length > 0
      ? authBackgroundStyles
      : { background: 'linear-gradient(to bottom right, rgb(248, 250, 252), rgb(239, 246, 255))' };
  }, [authBackgroundStyles, backgroundImageError, branding.authBackgroundConfig, theme]);

  if (!token) {
    return null;
  }

  if (isValidatingToken) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 dark:bg-background" style={finalBackgroundStyles}>
        {/* Dark overlay for custom backgrounds in dark mode */}
        <div className="absolute inset-0 bg-black/40 dark:bg-black/60 z-0"></div>
        <div className="max-w-md w-full space-y-8 relative z-10">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
                <p className="mt-2 text-sm text-muted-foreground">{t('auth.validating_token', 'Validating reset token...')}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (tokenError || !tokenValidation?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 dark:bg-background" style={finalBackgroundStyles}>
        {/* Dark overlay for custom backgrounds in dark mode */}
        <div className="absolute inset-0 bg-black/40 dark:bg-black/60 z-0"></div>
        <div className="max-w-md w-full space-y-8 relative z-10">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30">
                <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <CardTitle className="mt-4 text-red-600 dark:text-red-400">{t('auth.invalid_reset_link', 'Invalid Reset Link')}</CardTitle>
              <CardDescription>
                {t('auth.reset_link_expired', 'This password reset link is invalid or has expired.')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  {tokenError?.message || tokenValidation?.message || t('auth.reset_link_invalid', 'The reset link is no longer valid.')}
                </AlertDescription>
              </Alert>

              <div className="text-center space-y-2">
                <Link to="/forgot-password">
                  <Button className="w-full">
                    {t('auth.request_new_reset_link', 'Request new reset link')}
                  </Button>
                </Link>

                <Link
                  to="/auth"
                  className="inline-flex items-center text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  {t('auth.back_to_login', 'Back to login')}
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 dark:bg-background" style={finalBackgroundStyles}>
        {/* Dark overlay for custom backgrounds in dark mode */}
        <div className="absolute inset-0 bg-black/40 dark:bg-black/60 z-0"></div>
        <div className="max-w-md w-full space-y-8 relative z-10">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="mt-4 text-green-600 dark:text-green-400">{t('auth.password_reset_success_title', 'Password Reset Successful')}</CardTitle>
              <CardDescription>
                {t('auth.password_reset_success_desc', 'Your password has been successfully reset. You can now log in with your new password.')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  {t('auth.password_reset_success_message', 'Your password has been updated successfully. For security reasons, you\'ll need to log in again.')}
                </AlertDescription>
              </Alert>

              <div className="text-center">
                <Link to="/auth">
                  <Button className="w-full">
                    {t('auth.continue_to_login', 'Continue to login')}
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 dark:bg-background" style={finalBackgroundStyles}>
      {/* Dark overlay for custom backgrounds in dark mode */}
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 z-0"></div>
      <div className="max-w-md w-full space-y-8 relative z-10">
        <Card>
          <CardHeader className="text-center">
            <CardTitle>{t('auth.reset_your_password', 'Reset your password')}</CardTitle>
            <CardDescription>
              {t('auth.enter_new_password', 'Enter your new password below. Make sure it\'s at least 6 characters long.')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">{t('auth.new_password', 'New password')}</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder={t('auth.new_password_placeholder', 'Enter your new password')}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    disabled={resetPasswordMutation.isPending}
                    minLength={6}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={resetPasswordMutation.isPending}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('auth.confirm_new_password', 'Confirm new password')}</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder={t('auth.confirm_new_password_placeholder', 'Confirm your new password')}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={resetPasswordMutation.isPending}
                    minLength={6}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    disabled={resetPasswordMutation.isPending}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>
                    {t('auth.passwords_do_not_match', 'Passwords do not match')}
                  </AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={resetPasswordMutation.isPending || newPassword !== confirmPassword}
              >
                {resetPasswordMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t('auth.reset_password_button', 'Reset password')}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <Link
                to="/auth"
                className="inline-flex items-center text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                {t('auth.back_to_login', 'Back to login')}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
