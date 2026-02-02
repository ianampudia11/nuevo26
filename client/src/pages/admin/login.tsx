import { useState, useEffect, useMemo } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/use-translation";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useBranding } from "@/contexts/branding-context";
import { useAuthBackgroundStyles } from "@/hooks/use-branding-styles";
import { useTheme } from "next-themes";
import { BrandingLogo } from "@/components/auth/BrandingLogo";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function AdminLoginPage() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [_, navigate] = useLocation();
  const { branding } = useBranding();
  const { theme } = useTheme();
  const authBackgroundStyles = useAuthBackgroundStyles('admin');
  const [backgroundImageError, setBackgroundImageError] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginFormValues) => {
      const res = await apiRequest("POST", "/api/admin/login", credentials);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Invalid credentials");
      }
      return await res.json();
    },
    onSuccess: (user) => {
      toast({
        title: t('auth.login_success', 'Login successful'),
        description: t('auth.welcome_back', 'Welcome back, {{name}}!', { name: user.fullName }),
      });

      setTimeout(() => {
        window.location.href = "/admin/dashboard";
      }, 500);
    },
    onError: (error: Error) => {
      toast({
        title: t('auth.login_failed', 'Login failed'),
        description: error.message || t('auth.invalid_credentials', 'Invalid username or password'),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: LoginFormValues) => {
    loginMutation.mutate(values);
  };

  useEffect(() => {
    if (branding.adminAuthBackgroundUrl) {
      const img = new Image();
      img.src = branding.adminAuthBackgroundUrl;
      img.onerror = () => setBackgroundImageError(true);
      img.onload = () => setBackgroundImageError(false);
    }
  }, [branding.adminAuthBackgroundUrl]);

  const finalBackgroundStyles = useMemo(() => {

    if (backgroundImageError) {

      const config = branding.authBackgroundConfig?.adminAuthBackground;
      if (!config) {
        return { backgroundColor: '#f3f4f6' }; // Default gray-100
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

          return {
            backgroundImage: gradientCss || undefined,
            backgroundColor: !gradientCss ? config.backgroundColor : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          };
        
        case 'color':

          return {
            backgroundImage: gradientCss || undefined,
            backgroundColor: !gradientCss ? config.backgroundColor : undefined
          };
        
        default:
          return { backgroundColor: '#f3f4f6' }; // Default gray-100
      }
    }
    

    return Object.keys(authBackgroundStyles).length > 0
      ? authBackgroundStyles
      : { backgroundColor: '#f3f4f6' }; // Default gray-100
  }, [authBackgroundStyles, backgroundImageError, branding.authBackgroundConfig]);

  return (
    <div className="min-h-screen flex items-center justify-center dark:bg-background" style={finalBackgroundStyles}>
      {/* Dark overlay for custom backgrounds in dark mode - only show overlay, don't override background */}
      {theme === 'dark' && <div className="absolute inset-0 bg-black/40 z-0"></div>}
      <div className="w-full max-w-md p-4 relative z-10">
        <Card>
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <BrandingLogo logoHeight="h-[60px]" />
            </div>
            <CardTitle className="text-2xl">{t('admin.login_title', 'Admin Login')}</CardTitle>
            <CardDescription>
              {t('admin.login_description', 'Enter your credentials to access the admin panel')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('auth.username_or_email', 'Username or Email')}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t('auth.admin_login_placeholder', 'Enter your username or email')}
                          {...field}
                          autoComplete="username"
                          disabled={loginMutation.isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('auth.password', 'Password')}</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder={t('auth.password_placeholder', '••••••••')}
                          {...field}
                          autoComplete="current-password"
                          disabled={loginMutation.isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Forgot password link */}
                <div className="flex justify-end">
                  <a href="/admin/forgot-password" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline">
                    {t('auth.forgot_password', 'Forgot password?')}
                  </a>
                </div>

                <Button
                  type="submit"
                  className="w-full btn-brand-primary"
                  variant="brand"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('auth.logging_in', 'Logging in...')}
                    </>
                  ) : (
                    t('auth.login', 'Login')
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex justify-center">
            <p className="text-sm text-muted-foreground">
              {t('admin.restricted_area', 'This area is restricted to administrators only')}
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
