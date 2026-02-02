import { useState, useEffect, useRef, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from '@/hooks/use-translation';
import { useBranding } from '@/contexts/branding-context';
import { useCurrency } from '@/contexts/currency-context';
import { useAuthBackgroundStyles } from '@/hooks/use-branding-styles';
import { useTheme } from 'next-themes';

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Building, User, CreditCard, AlertCircle, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

const createCompanyRegistrationSchema = (t: (key: string, fallback: string) => string) => z.object({
  companyName: z.string().min(2, t('registration.validation.company_name_min', "Company name must be at least 2 characters")).max(100),
  companySlug: z.string()
    .min(3, t('registration.validation.company_slug_min', "Company slug must be at least 3 characters"))
    .max(50)
    .regex(/^[a-z0-9-]+$/, t('registration.validation.company_slug_format', "Slug can only contain lowercase letters, numbers, and hyphens")),
  










  adminFullName: z.string().min(2, t('registration.validation.admin_name_min', "Full name must be at least 2 characters")).max(100),
  adminEmail: z.string().email(t('registration.validation.admin_email_invalid', "Please enter a valid email address")),
  adminUsername: z.string().min(3, t('registration.validation.admin_username_min', "Username must be at least 3 characters")).max(50),
  adminPassword: z.string().min(6, t('registration.validation.admin_password_min', "Password must be at least 6 characters")),
  confirmPassword: z.string().min(1, t('registration.validation.confirm_password_required', "Please confirm your password")),

  planId: z.number().int().min(1, t('registration.validation.plan_required', "Please select a plan")),
  referralCode: z.string().optional(),
}).refine((data) => data.adminPassword === data.confirmPassword, {
  message: t('registration.validation.passwords_no_match', "Passwords don't match"),
  path: ["confirmPassword"],
});

export default function CompanyRegistrationPage() {
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { branding } = useBranding();
  const { formatCurrency } = useCurrency();
  const { theme } = useTheme();
  const [isSlugChecking, setIsSlugChecking] = useState(false);
  const [isSlugAvailable, setIsSlugAvailable] = useState<boolean | null>(null);
  const currentSlugRef = useRef<string>('');
  const [backgroundImageError, setBackgroundImageError] = useState(false);
  const authBackgroundStyles = useAuthBackgroundStyles('user');


  const [referralCode, setReferralCode] = useState<string | null>(null);

  const companyRegistrationSchema = createCompanyRegistrationSchema(t);
  type CompanyRegistrationData = z.infer<typeof companyRegistrationSchema>;

  const { data: registrationStatus, isLoading: isLoadingStatus } = useQuery({
    queryKey: ['/api/registration/status'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/registration/status');
      if (!res.ok) throw new Error(t('registration.error.status_check_failed', 'Failed to check registration status'));
      return res.json();
    }
  });

  const { data: plans, isLoading: isLoadingPlans } = useQuery({
    queryKey: ['/api/plans/registration'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/plans/registration');
      if (!res.ok) throw new Error(t('registration.error.plans_fetch_failed', 'Failed to fetch plans'));
      return res.json();
    }
  });

  const form = useForm<CompanyRegistrationData>({
    resolver: zodResolver(companyRegistrationSchema),
    defaultValues: {
      companyName: "",
      companySlug: "",





      adminFullName: "",
      adminEmail: "",
      adminUsername: "",
      adminPassword: "",
      confirmPassword: "",
      planId: 1,
      referralCode: "",
    },
  });


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

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    if (refCode) {
      setReferralCode(refCode);
      form.setValue('referralCode', refCode);
    }
  }, [form, setReferralCode]);

  const watchCompanyName = form.watch("companyName");
  useEffect(() => {
    if (watchCompanyName) {
      const slug = watchCompanyName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
      form.setValue("companySlug", slug);
    }
  }, [watchCompanyName, form]);

  const checkSlugMutation = useMutation({
    mutationFn: async (slug: string) => {
      currentSlugRef.current = slug;

      const res = await apiRequest('POST', '/api/company/check-slug', { slug });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || t('registration.error.slug_check_failed', 'Failed to check slug availability'));
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      if (currentSlugRef.current === variables) {
        setIsSlugAvailable(data.available);
        if (!data.available) {
          form.setError("companySlug", { message: t('registration.validation.slug_taken', "This slug is already taken") });
        } else {
          form.clearErrors("companySlug");
        }
      }
    },
    onError: (error: Error, variables) => {
      if (currentSlugRef.current === variables) {
        setIsSlugAvailable(false);
        form.setError("companySlug", { message: error.message });
      }
    },
    onSettled: (_, __, variables) => {
      if (currentSlugRef.current === variables) {
        setIsSlugChecking(false);
      }
    }
  });

  const watchSlug = form.watch("companySlug");
  useEffect(() => {
    form.clearErrors("companySlug");
    setIsSlugChecking(false);
    setIsSlugAvailable(null);

    if (watchSlug && watchSlug.length >= 3 && watchSlug.trim() !== '') {
      setIsSlugChecking(true);

      const timer = setTimeout(() => {
        checkSlugMutation.mutate(watchSlug.trim());
      }, 500);

      return () => {
        clearTimeout(timer);
        setIsSlugChecking(false);
      };
    }
  }, [watchSlug, form]);

  const registerCompanyMutation = useMutation({
    mutationFn: async (data: CompanyRegistrationData) => {

      const submissionData = {
        ...data,





      };
      
      const res = await apiRequest('POST', '/api/company/register', submissionData);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || t('registration.error.register_failed', 'Failed to register company'));
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: t('registration.success_title', 'Registration successful!'),
        description: data.requiresApproval
          ? t('registration.approval_required', 'Your company registration has been submitted for approval. You will receive an email once approved.')
          : t('registration.success_desc', 'Your company has been registered successfully. You can now log in.'),
      });

      setTimeout(() => {
        navigate('/auth');
      }, 2000);
    },
    onError: (error: Error) => {
      toast({
        title: t('registration.failed_title', 'Registration failed'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CompanyRegistrationData) => {
    registerCompanyMutation.mutate(data);
  };

  if (isLoadingStatus || isLoadingPlans) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!registrationStatus?.enabled) {
    return (
      <div className="relative min-h-screen flex items-center justify-center p-4 dark:bg-gray-900" style={finalBackgroundStyles}>
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-100/30 dark:bg-blue-900/20 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-100/30 dark:bg-indigo-900/20 rounded-full blur-3xl"></div>
        </div>

        {/* Dark overlay for custom backgrounds in dark mode - only show overlay, don't override background */}
        {theme === 'dark' && <div className="absolute inset-0 bg-black/40 z-0"></div>}

        <div className="relative z-10 w-full max-w-md">
          <div className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-xl border border-border/20 p-8">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 flex items-center justify-center">
                {branding.logoUrl ? (
                  <img src={branding.logoUrl} alt={branding.appName} className="h-10 w-auto max-w-10" />
                ) : (
                  <div className="w-10 h-10  rounded-lg flex items-center justify-center">
                    <span className="text-secondary-foreground font-bold text-lg">{branding.appName.charAt(0)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-center mb-6">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
            </div>

            <div className="text-center mb-8">
              <h1 className="text-2xl font-semibold text-foreground mb-2">
                {t('registration.unavailable_title', 'Registration Unavailable')}
              </h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                {t('registration.unavailable_desc', 'Company registration is currently disabled. Please contact the administrator for more information.')}
              </p>
            </div>

            <Button
              variant="outline"
              className="w-full h-12 rounded-lg font-medium"
              onClick={() => navigate('/auth')}
            >
              {t('auth.back_to_login', 'Back to Login')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 dark:bg-gray-900" style={finalBackgroundStyles}>
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-100/30 dark:bg-blue-900/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-100/30 dark:bg-indigo-900/20 rounded-full blur-3xl"></div>
      </div>

      {/* Dark overlay for custom backgrounds in dark mode - only show overlay, don't override background */}
      {theme === 'dark' && <div className="absolute inset-0 bg-black/40 z-0"></div>}

      <div className="relative z-10 w-full max-w-2xl">
        <div className="bg-white/80 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/50 p-8">
          <div className="flex justify-center mb-6">
            <div className="w-auto h-12 flex items-center justify-center">
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt={branding.appName} className="h-12 w-auto" />
              ) : (
                <div className="w-10 h-10 bg-gray-800 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                  <span className="text-white dark:text-gray-100 font-bold text-lg">{branding.appName.charAt(0)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {t('registration.page_title', 'Register Your Company')}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {t('registration.page_subtitle', 'Create your company account and manage all your channels in one place!')}
            </p>
          </div>
          {registrationStatus?.requireApproval && (
            <Alert className="mb-6 dark:bg-gray-800 dark:border-gray-700">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {t('registration.approval_notice', 'New registrations require admin approval. You will receive an email once your registration is approved.')}
              </AlertDescription>
            </Alert>
          )}

          {referralCode && (
            <Alert className="mb-6 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertDescription className="text-green-800 dark:text-green-300">
                {t('registration.referral_detected', 'Great! You\'re signing up through a referral from affiliate {{code}}.', { code: referralCode })} {t('registration.referral_benefit', 'You may be eligible for special benefits or discounts.')}
              </AlertDescription>
            </Alert>
          )}

          <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 pb-2">
                      <Building className="h-4 w-4" />
                      {t('registration.company_info', 'Company Information')}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="companyName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('registration.company_name', 'Company Name')} *</FormLabel>
                            <FormControl>
                              <Input
                                placeholder={t('registration.company_name_placeholder', 'Your Company Name')}
                                className="h-12 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 rounded-lg placeholder:text-gray-400 dark:placeholder:text-gray-500"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="companySlug"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('registration.company_slug', 'Company Slug')} *</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  placeholder={t('registration.company_slug_placeholder', 'your-company')}
                                  className="h-12 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 rounded-lg placeholder:text-gray-400 dark:placeholder:text-gray-500"
                                  {...field}
                                />
                                {isSlugChecking && (
                                  <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-gray-400 dark:text-gray-500" />
                                )}
                                {!isSlugChecking && isSlugAvailable === true && field.value && field.value.length >= 3 && (
                                  <Check className="absolute right-3 top-3 h-4 w-4 text-green-500 dark:text-green-400" />
                                )}
                                {!isSlugChecking && isSlugAvailable === false && field.value && field.value.length >= 3 && (
                                  <AlertCircle className="absolute right-3 top-3 h-4 w-4 text-red-500 dark:text-red-400" />
                                )}
                              </div>
                            </FormControl>
                            <FormDescription>
                              {t('registration.company_slug_description', 'This will be your unique identifier (e.g., your-company.app.com)')}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* For Kaif Ahmad - Commented out fields that are not needed anymore */}
                    {/* 
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="companyRegisterNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('registration.company_register_number', 'Commercial Registration Number (KSA)')} *</FormLabel>
                            <FormControl>
                              <Input
                                placeholder={t('registration.company_register_number_placeholder', '1234567890')}
                                className="h-12 bg-gray-50 border-gray-200 rounded-lg font-mono"
                                maxLength={10}
                                onChange={(e) => {

                                  const value = e.target.value.replace(/\D/g, '');
                                  field.onChange(value);
                                }}
                                onBlur={field.onBlur}
                                name={field.name}
                                ref={field.ref}
                                value={field.value || ''}
                              />
                            </FormControl>
                            <FormDescription>
                              {t('registration.company_register_number_description', 'Your company\'s 10-digit Commercial Registration Number (CR) issued by the KSA Ministry of Commerce')}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="companyEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('registration.company_email', 'Company Email Address')} *</FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                placeholder={t('registration.company_email_placeholder', 'info@yourcompany.com')}
                                className="h-12 bg-gray-50 border-gray-200 rounded-lg"
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              {t('registration.company_email_description', 'Official email address for your company')}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="companyContactPerson"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('registration.company_contact_person', 'Company Contact Person')} *</FormLabel>
                            <FormControl>
                              <Input
                                placeholder={t('registration.company_contact_person_placeholder', 'Jane Smith')}
                                className="h-12 bg-gray-50 border-gray-200 rounded-lg"
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              {t('registration.company_contact_person_description', 'Main contact person for your company')}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="companyIban"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('registration.company_iban', 'Company IBAN Number')} *</FormLabel>
                            <FormControl>
                              <Input
                                placeholder={t('registration.company_iban_placeholder', 'SA03 8000 0000 6080 1016 7519')}
                                className="h-12 bg-gray-50 border-gray-200 rounded-lg font-mono"
                                style={{ textTransform: 'uppercase' }}
                                maxLength={29} // SA03 8000 0000 6080 1016 7519 (with spaces)
                                onChange={(e) => {

                                  const value = e.target.value.replace(/\s/g, '').toUpperCase();

                                  const limitedValue = value.slice(0, 24);

                                  const formatted = limitedValue.replace(/^(SA\d{0,2})(\d{0,4})(\d{0,4})(\d{0,4})(\d{0,4})(\d{0,4})$/,
                                    (_match, p1, p2, p3, p4, p5, p6) => {
                                      let result = p1;
                                      if (p2) result += ' ' + p2;
                                      if (p3) result += ' ' + p3;
                                      if (p4) result += ' ' + p4;
                                      if (p5) result += ' ' + p5;
                                      if (p6) result += ' ' + p6;
                                      return result;
                                    });
                                  e.target.value = formatted;
                                  field.onChange(limitedValue); // Store without spaces for validation
                                }}
                                onBlur={field.onBlur}
                                name={field.name}
                                ref={field.ref}
                              />
                            </FormControl>
                            <FormDescription>
                              {t('registration.company_iban_description', 'Your company\'s official IBAN for financial transactions')}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    */}

                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 pb-2">
                      <User className="h-4 w-4" />
                      {t('registration.admin_details', 'Admin User Details')}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="adminFullName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('registration.admin_full_name', 'Full Name')} *</FormLabel>
                            <FormControl>
                              <Input
                                placeholder={t('registration.admin_full_name_placeholder', 'John Doe')}
                                className="h-12 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 rounded-lg placeholder:text-gray-400 dark:placeholder:text-gray-500"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="adminEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('registration.admin_email', 'Email Address')} *</FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                placeholder={t('registration.admin_email_placeholder', 'john@yourcompany.com')}
                                className="h-12 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 rounded-lg placeholder:text-gray-400 dark:placeholder:text-gray-500"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="adminUsername"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('registration.admin_username', 'Username')} *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder={t('registration.admin_username_placeholder', 'johndoe')}
                              className="h-12 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 rounded-lg placeholder:text-gray-400 dark:placeholder:text-gray-500"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            {t('registration.admin_username_description', 'This will be used to log in to your account')}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="adminPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('registration.admin_password', 'Password')} *</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder={t('registration.admin_password_placeholder', 'Create a strong password')}
                                className="h-12 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 rounded-lg placeholder:text-gray-400 dark:placeholder:text-gray-500"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('registration.admin_confirm_password', 'Confirm Password')} *</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder={t('registration.admin_confirm_password_placeholder', 'Confirm your password')}
                                className="h-12 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 rounded-lg placeholder:text-gray-400 dark:placeholder:text-gray-500"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {plans && plans.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 pb-2">
                        <CreditCard className="h-4 w-4" />
                        {t('registration.plan_selection', 'Plan Selection')}
                      </div>

                      <FormField
                        control={form.control}
                        name="planId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('registration.select_plan', 'Select Plan')} *</FormLabel>
                            <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={field.value?.toString()}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={t('registration.select_plan_placeholder', 'Choose a plan')} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {plans.map((plan: any) => (
                                  <SelectItem key={plan.id} value={plan.id.toString()}>
                                    <div className="flex items-center justify-between w-full">
                                      <div className="flex flex-col">
                                        <span>{plan.name}</span>
                                        {plan.hasTrialPeriod && plan.trialDays > 0 && (
                                          <span className="text-xs text-blue-600">
                                            {t('registration.plan.trial_days', '{{days}} day trial', { days: plan.trialDays })}
                                          </span>
                                        )}
                                        {plan.isFree && (
                                          <span className="text-xs text-green-600">
                                            {t('registration.plan.free_plan', 'Free plan')}
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                                        {formatCurrency(plan.price)}{t('registration.plan.monthly_suffix', '/month')}
                                      </span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              {t('registration.plan_change_note', 'You can change your plan later from the settings')}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  <div className="flex gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 h-12 rounded-lg font-medium"
                      onClick={() => navigate('/auth')}
                    >
                      {t('auth.back_to_login', 'Back to Login')}
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 h-12 btn-brand-primary text-white rounded-lg font-medium"
                      disabled={registerCompanyMutation.isPending || isSlugChecking}
                    >
                      {registerCompanyMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t('registration.registering', 'Registering...')}
                        </>
                      ) : (
                        t('registration.register_button', 'Register Company')
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
              {/* For Kaif Ahmad */}
              {/* Become a Partner Section */}
              <div className="mt-8 p-6 bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl border border-purple-200">
                <div className="text-center">
                  <div className="flex items-center justify-center mb-3">
                    <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {t('registration.affiliate.cta_title', 'Interested in Earning Commissions?')}
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    {t('registration.affiliate.cta_description', 'Join our affiliate program and earn up to 30% commission by referring businesses to {{appName}}', { appName: branding.appName })}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="bg-white hover:bg-gray-50 border-purple-300 text-purple-700 hover:text-purple-800 font-medium px-6"
                    onClick={() => window.location.href = '/become-partner'}
                  >
                    <User className="mr-2 h-4 w-4" />
                    {t('registration.affiliate.button_text', 'Become a Partner & Earn Commissions')}
                  </Button>
                </div>
              </div>

              <div className="mt-6 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {t('registration.already_have_account', 'Already have an account?')}{' '}
                  <a
                    href="/auth"
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium hover:underline"
                  >
                    {t('registration.sign_in', 'Sign in')}
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      );
}