import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { useBranding } from "@/contexts/branding-context";
import { useSubdomain } from "@/contexts/subdomain-context";
import { useAuthBackgroundStyles } from "@/hooks/use-branding-styles";
import { useTheme } from "next-themes";
import { Redirect } from "wouter";
import { BrandingLogo } from "@/components/auth/BrandingLogo";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Mail, Lock, Eye, EyeOff } from "lucide-react";

const loginSchema = z.object({
  username: z.string().min(2, "Username or email must be at least 2 characters"),
  password: z.string().min(1, "Password is required"),
});

type LoginData = z.infer<typeof loginSchema>;



export default function AuthPage() {
  const { user, isLoading, loginMutation } = useAuth();
  const { t } = useTranslation();
  const { branding } = useBranding();
  const { subdomainInfo } = useSubdomain();
  const { theme } = useTheme();
  const [showPassword, setShowPassword] = useState(false);
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);
  const [backgroundImageError, setBackgroundImageError] = useState(false);
  const authBackgroundStyles = useAuthBackgroundStyles('user');

  useEffect(() => {

    if (isLoading && !hasInitiallyLoaded) {
      const timeoutId = setTimeout(() => {
        document.cookie = "connect.sid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        window.location.reload();
      }, 3000);

      return () => clearTimeout(timeoutId);
    } else if (!isLoading) {

      setHasInitiallyLoaded(true);
    }
  }, [isLoading, hasInitiallyLoaded]);

  useEffect(() => {
    if (branding.userAuthBackgroundUrl) {
      const img = new Image();
      img.src = branding.userAuthBackgroundUrl;
      img.onerror = () => setBackgroundImageError(true);
      img.onload = () => setBackgroundImageError(false);
    }
  }, [branding.userAuthBackgroundUrl]);

  const finalBackgroundStyles = useMemo(() => {

    if (backgroundImageError) {

      const config = branding.authBackgroundConfig?.userAuthBackground;
      if (!config) {
        return { background: 'linear-gradient(to bottom right, rgb(248, 250, 252), rgb(239, 246, 255))' };
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
          return { background: 'linear-gradient(to bottom right, rgb(248, 250, 252), rgb(239, 246, 255))' };
      }
    }
    

    return Object.keys(authBackgroundStyles).length > 0
      ? authBackgroundStyles
      : { background: 'linear-gradient(to bottom right, rgb(248, 250, 252), rgb(239, 246, 255))' };
  }, [authBackgroundStyles, backgroundImageError, branding.authBackgroundConfig]);

  const loginForm = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onLoginSubmit = (data: LoginData) => {
    loginMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Redirect to="/" />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 dark:bg-background" style={finalBackgroundStyles}>
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-100/30 dark:bg-blue-900/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-100/30 dark:bg-indigo-900/20 rounded-full blur-3xl"></div>
      </div>

      {/* Dark overlay for custom backgrounds in dark mode - only show overlay, don't override background */}
      {theme === 'dark' && <div className="absolute inset-0 bg-black/40 z-0"></div>}

      {/* Main auth card */}
      <div className="relative z-10 w-full max-w-md">
        <div className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-xl border border-border/20 p-8">
          {/* Logo icon */}
          <div className="flex justify-center mb-6">
            <BrandingLogo />
          </div>

          {/* Title and description */}
          <div className="text-center mb-8">
            {subdomainInfo?.isSubdomainMode && subdomainInfo?.company ? (
              <>
                <h1 className="text-2xl font-semibold text-foreground mb-2">
                  {t('auth.signin_company_title', 'Sign in to {{companyName}}', { companyName: subdomainInfo.company.name })}
                </h1>
                <p className="text-muted-foreground text-sm">
                  {t('auth.signin_company_description', 'Access your company workspace on {{appName}}', { appName: branding.appName })}
                </p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-semibold text-foreground mb-2">
                  {t('auth.signin_title', 'Access like a shadow')}
                </h1>
                <p className="text-muted-foreground text-sm">
                  {t('auth.signin_description', 'Unite your customer conversations across all channels in one powerful CRM.')}
                </p>
              </>
            )}
          </div>

          {/* Login form */}
          <Form {...loginForm}>
            <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
              <FormField
                control={loginForm.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                        <Input
                          placeholder={t('auth.email_placeholder', 'Email')}
                          className="pl-10 h-12 bg-muted border-border rounded-lg placeholder:text-muted-foreground"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={loginForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder={t('auth.password_placeholder', 'Password')}
                          className="pl-10 pr-10 h-12 bg-muted border-border rounded-lg placeholder:text-muted-foreground"
                          {...field}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Forgot password link */}
              <div className="flex justify-end">
                <a href="/forgot-password" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline">
                  {t('auth.forgot_password', 'Forgot password?')}
                </a>
              </div>

              {/* Submit button */}
              <Button
                type="submit"
                className="w-full h-12 btn-brand-primary text-white rounded-lg font-medium"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('auth.logging_in', 'Logging in...')}
                  </>
                ) : (
                  t('auth.get_started', 'Login')
                )}
              </Button>
            </form>
          </Form>

          {/* Register link */}
          <div className="mt-4 text-center">
            <p className="text-sm text-muted-foreground">
              {t('auth.new_to_platform', 'New to the platform?')}{' '}
              <a
                href="/register"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium hover:underline"
              >
                {t('auth.register_company', 'Register for a new Company')}
              </a>
            </p>
          </div>


        </div>
      </div>
    </div>
  );
}