import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Eye, EyeOff, Loader2, CheckCircle, XCircle, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBranding } from "@/contexts/branding-context";
import { useAuthBackgroundStyles } from "@/hooks/use-branding-styles";
import { useTheme } from "next-themes";
import { apiRequest } from "@/lib/queryClient";

interface AdminResetPasswordResponse {
  success: boolean;
  message: string;
  error?: string;
}

interface AdminTokenValidationResponse {
  valid: boolean;
  message: string;
}

export default function AdminResetPasswordPage() {
  const [location, setLocation] = useLocation();
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");
  
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { toast } = useToast();
  const { branding } = useBranding();
  const { theme } = useTheme();
  const authBackgroundStyles = useAuthBackgroundStyles('admin');
  const [backgroundImageError, setBackgroundImageError] = useState(false);


  const { data: tokenValidation, isLoading: isValidatingToken, error: tokenError } = useQuery({
    queryKey: ["validate-admin-reset-token", token],
    queryFn: async () => {
      if (!token) throw new Error("No token provided");
      const res = await apiRequest("GET", `/api/admin/auth/reset-password/${token}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to validate token");
      }
      return await res.json() as AdminTokenValidationResponse;
    },
    enabled: !!token,
    retry: false
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: { token: string; newPassword: string; confirmPassword: string }) => {
      const res = await apiRequest("POST", "/api/admin/auth/reset-password", data);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to reset password");
      }
      return await res.json() as AdminResetPasswordResponse;
    },
    onSuccess: (data) => {
      setIsSuccess(true);
      toast({
        title: "Admin password reset successful",
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token) {
      toast({
        title: "Error",
        description: "Invalid reset token",
        variant: "destructive",
      });
      return;
    }

    if (!newPassword.trim() || !confirmPassword.trim()) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters long",
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
      setLocation("/admin/login");
    }
  }, [token, setLocation]);

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
                <p className="mt-2 text-sm text-muted-foreground">Validating admin reset token...</p>
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
              <CardTitle className="mt-4 text-red-600 dark:text-red-400">Invalid Admin Reset Link</CardTitle>
              <CardDescription>
                This admin password reset link is invalid or has expired.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  {tokenError?.message || tokenValidation?.message || "The admin reset link is no longer valid."}
                </AlertDescription>
              </Alert>

              <div className="text-center space-y-2">
                <Link to="/admin/forgot-password">
                  <Button className="w-full btn-brand-primary" variant="brand">
                    Request new admin reset link
                  </Button>
                </Link>
                
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
              <CardTitle className="mt-4 text-green-600 dark:text-green-400">Admin Password Reset Successful</CardTitle>
              <CardDescription>
                Your admin password has been successfully reset. You can now log in with your new password.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  Your admin password has been updated successfully. For security reasons, you'll need to log in again.
                </AlertDescription>
              </Alert>

              <div className="text-center">
                <Link to="/admin/login">
                  <Button className="w-full btn-brand-primary" variant="brand">
                    Continue to admin login
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
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/30">
              <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <CardTitle className="mt-4">Reset Admin Password</CardTitle>
            <CardDescription>
              Enter your new admin password below. Make sure it's at least 6 characters long.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New admin password</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your new admin password"
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
                <Label htmlFor="confirmPassword">Confirm new admin password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm your new admin password"
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
                    Passwords do not match
                  </AlertDescription>
                </Alert>
              )}

              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  This will reset your admin account password. Make sure to use a strong, secure password.
                </AlertDescription>
              </Alert>

              <Button
                type="submit"
                className="w-full btn-brand-primary"
                variant="brand"
                disabled={resetPasswordMutation.isPending || newPassword !== confirmPassword}
              >
                {resetPasswordMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Reset admin password
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
