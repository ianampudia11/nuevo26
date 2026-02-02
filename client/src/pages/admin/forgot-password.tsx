import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Mail, Loader2, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/use-translation";
import { useBranding } from "@/contexts/branding-context";
import { useAuthBackgroundStyles } from "@/hooks/use-branding-styles";
import { useTheme } from "next-themes";
import { apiRequest } from "@/lib/queryClient";

interface AdminForgotPasswordResponse {
  success: boolean;
  message: string;
  error?: string;
}

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();
  const { branding } = useBranding();
  const { theme } = useTheme();
  const authBackgroundStyles = useAuthBackgroundStyles('admin');
  const [backgroundImageError, setBackgroundImageError] = useState(false);

  const forgotPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/admin/auth/forgot-password", { email });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to send reset email");
      }
      return await res.json() as AdminForgotPasswordResponse;
    },
    onSuccess: (data) => {
      setIsSubmitted(true);
      toast({
        title: "Reset email sent",
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (branding.adminAuthBackgroundUrl) {
      const img = new Image();
      img.src = branding.adminAuthBackgroundUrl;
      img.onerror = () => setBackgroundImageError(true);
      img.onload = () => setBackgroundImageError(false);
    }
  }, [branding.adminAuthBackgroundUrl]);

  const finalBackgroundStyles = useMemo(() => {
    const isDark = theme === 'dark';
    
    if (backgroundImageError) {

      const config = branding.authBackgroundConfig?.adminAuthBackground;
      if (!config) {

        return isDark ? {} : { backgroundColor: '#f3f4f6' }; // Default gray-100
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

          return isDark ? {} : { backgroundColor: '#f3f4f6' }; // Default gray-100
      }
    }
    

    if (isDark) return {};
    
    return Object.keys(authBackgroundStyles).length > 0
      ? authBackgroundStyles
      : { backgroundColor: '#f3f4f6' }; // Default gray-100
  }, [authBackgroundStyles, backgroundImageError, branding.authBackgroundConfig, theme]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast({
        title: "Error",
        description: "Please enter your email address",
        variant: "destructive",
      });
      return;
    }
    forgotPasswordMutation.mutate(email.trim());
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 dark:bg-background" style={finalBackgroundStyles}>
        {/* Dark overlay for custom backgrounds in dark mode */}
        <div className="absolute inset-0 bg-black/40 dark:bg-black/60 z-0"></div>
        <div className="max-w-md w-full space-y-8 relative z-10">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30">
                <Mail className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="mt-4">Check your email</CardTitle>
              <CardDescription>
                We've sent an admin password reset link to <strong>{email}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  This is an admin password reset request. If you don't see the email in your inbox, 
                  please check your spam folder. The reset link will expire in 1 hour for security reasons.
                </AlertDescription>
              </Alert>
              
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Didn't receive the email?
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsSubmitted(false);
                    forgotPasswordMutation.mutate(email);
                  }}
                  disabled={forgotPasswordMutation.isPending}
                >
                  {forgotPasswordMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Resend email
                </Button>
              </div>

              <div className="text-center">
                <Link
                  to="/admin/login"
                  className="inline-flex items-center text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Back to admin login
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
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/30">
              <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <CardTitle className="mt-4">{t('admin.forgot_password_title', 'Admin Password Reset')}</CardTitle>
            <CardDescription>
              {t('admin.forgot_password_description', "Enter your admin email address and we'll send you a secure link to reset your password.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Admin Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your admin email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={forgotPasswordMutation.isPending}
                />
              </div>

              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  This form is for admin accounts only. Regular user password resets should use the main login page.
                </AlertDescription>
              </Alert>

              <Button
                type="submit"
                className="w-full btn-brand-primary"
                variant="brand"
                disabled={forgotPasswordMutation.isPending}
              >
                {forgotPasswordMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Send admin reset link
              </Button>
            </form>

            <div className="mt-6 text-center">
              <Link
                to="/admin/login"
                className="inline-flex items-center text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back to admin login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
