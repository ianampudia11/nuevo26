import { useState, useEffect, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useBranding } from '@/contexts/branding-context';
import { useTranslation } from '@/hooks/use-translation';
import { useAuthBackgroundStyles } from '@/hooks/use-branding-styles';
import { useTheme } from 'next-themes';

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Users, DollarSign, TrendingUp, Globe, Building, CheckCircle, User } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";

const createAffiliateApplicationSchema = (t: (key: string, fallback: string) => string) => z.object({
  firstName: z.string().min(2, t('affiliate.application.validation.first_name_min', 'First name must be at least 2 characters')).max(50),
  lastName: z.string().min(2, t('affiliate.application.validation.last_name_min', 'Last name must be at least 2 characters')).max(50),
  email: z.string().email(t('affiliate.application.validation.email_invalid', 'Please enter a valid email address')),
  phone: z.string().optional(),
  company: z.string().optional(),
  website: z.string().url(t('affiliate.application.validation.website_invalid', 'Please enter a valid website URL')).optional().or(z.literal("")),
  country: z.string().min(1, t('affiliate.application.validation.country_required', 'Please select your country')),
  marketingChannels: z.array(z.string()).min(1, t('affiliate.application.validation.marketing_channels_required', 'Please select at least one marketing channel')),
  expectedMonthlyReferrals: z.string().min(1, t('affiliate.application.validation.expected_referrals_required', 'Please select expected monthly referrals')),
  experience: z.string().min(50, t('affiliate.application.validation.experience_min', 'Please provide at least 50 characters describing your experience')),
  motivation: z.string().min(50, t('affiliate.application.validation.motivation_min', 'Please provide at least 50 characters describing your motivation')),
  agreeToTerms: z.boolean().refine(val => val === true, t('affiliate.application.validation.terms_required', 'You must agree to the terms and conditions')),
});

type AffiliateApplicationForm = z.infer<ReturnType<typeof createAffiliateApplicationSchema>>;

export default function AffiliateApplicationPage() {
  const { branding } = useBranding();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { theme } = useTheme();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [backgroundImageError, setBackgroundImageError] = useState(false);
  const authBackgroundStyles = useAuthBackgroundStyles('user');


  useEffect(() => {
    document.title = t('affiliate.application.page_title', 'Become a Partner - {{appName}}', { appName: branding.appName });
    return () => {
      document.title = branding.appName; // Reset to default
    };
  }, [branding.appName, t]);

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

  const affiliateApplicationSchema = createAffiliateApplicationSchema(t);

  const form = useForm<AffiliateApplicationForm>({
    resolver: zodResolver(affiliateApplicationSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      company: '',
      website: '',
      country: '',
      marketingChannels: [],
      expectedMonthlyReferrals: '',
      experience: '',
      motivation: '',
      agreeToTerms: false,
    },
  });

  const submitApplicationMutation = useMutation({
    mutationFn: async (data: AffiliateApplicationForm) => {
      const res = await apiRequest('POST', '/api/affiliate/apply', data);
      if (!res.ok) throw new Error(t('affiliate.application.toast.submit_failed_error', 'Failed to submit application'));
      return res.json();
    },
    onSuccess: () => {
      setIsSubmitted(true);
      toast({
        title: t('affiliate.application.toast.submitted_title', 'Application Submitted!'),
        description: t('affiliate.application.toast.submitted_description', "Thank you for your interest. We'll review your application and get back to you soon."),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('affiliate.application.toast.failed_title', 'Submission Failed'),
        description: error.message || t('affiliate.application.toast.failed_description', "There was an error submitting your application. Please try again."),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AffiliateApplicationForm) => {
    submitApplicationMutation.mutate(data);
  };

  const marketingChannelOptions = [
    { value: 'social_media', label: t('affiliate.application.marketing_channels.social_media', 'Social Media (Facebook, Instagram, Twitter)') },
    { value: 'content_marketing', label: t('affiliate.application.marketing_channels.content_marketing', 'Content Marketing (Blog, YouTube, Podcast)') },
    { value: 'email_marketing', label: t('affiliate.application.marketing_channels.email_marketing', 'Email Marketing') },
    { value: 'paid_advertising', label: t('affiliate.application.marketing_channels.paid_advertising', 'Paid Advertising (Google Ads, Facebook Ads)') },
    { value: 'seo', label: t('affiliate.application.marketing_channels.seo', 'SEO & Organic Search') },
    { value: 'influencer', label: t('affiliate.application.marketing_channels.influencer', 'Influencer Marketing') },
    { value: 'networking', label: t('affiliate.application.marketing_channels.networking', 'Networking & Events') },
    { value: 'referrals', label: t('affiliate.application.marketing_channels.referrals', 'Word of Mouth & Referrals') },
    { value: 'other', label: t('affiliate.application.marketing_channels.other', 'Other') },
  ];

  const expectedReferralOptions = [
    { value: '1-5', label: t('affiliate.application.expected_referrals.1_5', '1-5 referrals per month') },
    { value: '6-15', label: t('affiliate.application.expected_referrals.6_15', '6-15 referrals per month') },
    { value: '16-30', label: t('affiliate.application.expected_referrals.16_30', '16-30 referrals per month') },
    { value: '31-50', label: t('affiliate.application.expected_referrals.31_50', '31-50 referrals per month') },
    { value: '50+', label: t('affiliate.application.expected_referrals.50_plus', '50+ referrals per month') },
  ];

  const countries = [
    { value: 'United States', label: t('affiliate.application.countries.united_states', 'United States') },
    { value: 'Canada', label: t('affiliate.application.countries.canada', 'Canada') },
    { value: 'United Kingdom', label: t('affiliate.application.countries.united_kingdom', 'United Kingdom') },
    { value: 'Australia', label: t('affiliate.application.countries.australia', 'Australia') },
    { value: 'Germany', label: t('affiliate.application.countries.germany', 'Germany') },
    { value: 'France', label: t('affiliate.application.countries.france', 'France') },
    { value: 'Spain', label: t('affiliate.application.countries.spain', 'Spain') },
    { value: 'Italy', label: t('affiliate.application.countries.italy', 'Italy') },
    { value: 'Netherlands', label: t('affiliate.application.countries.netherlands', 'Netherlands') },
    { value: 'Sweden', label: t('affiliate.application.countries.sweden', 'Sweden') },
    { value: 'Norway', label: t('affiliate.application.countries.norway', 'Norway') },
    { value: 'Denmark', label: t('affiliate.application.countries.denmark', 'Denmark') },
    { value: 'Finland', label: t('affiliate.application.countries.finland', 'Finland') },
    { value: 'Switzerland', label: t('affiliate.application.countries.switzerland', 'Switzerland') },
    { value: 'Austria', label: t('affiliate.application.countries.austria', 'Austria') },
    { value: 'Belgium', label: t('affiliate.application.countries.belgium', 'Belgium') },
    { value: 'Portugal', label: t('affiliate.application.countries.portugal', 'Portugal') },
    { value: 'Ireland', label: t('affiliate.application.countries.ireland', 'Ireland') },
    { value: 'New Zealand', label: t('affiliate.application.countries.new_zealand', 'New Zealand') },
    { value: 'Japan', label: t('affiliate.application.countries.japan', 'Japan') },
    { value: 'South Korea', label: t('affiliate.application.countries.south_korea', 'South Korea') },
    { value: 'Singapore', label: t('affiliate.application.countries.singapore', 'Singapore') },
    { value: 'Hong Kong', label: t('affiliate.application.countries.hong_kong', 'Hong Kong') },
    { value: 'India', label: t('affiliate.application.countries.india', 'India') },
    { value: 'Brazil', label: t('affiliate.application.countries.brazil', 'Brazil') },
    { value: 'Mexico', label: t('affiliate.application.countries.mexico', 'Mexico') },
    { value: 'Argentina', label: t('affiliate.application.countries.argentina', 'Argentina') },
    { value: 'Chile', label: t('affiliate.application.countries.chile', 'Chile') },
    { value: 'Colombia', label: t('affiliate.application.countries.colombia', 'Colombia') },
    { value: 'South Africa', label: t('affiliate.application.countries.south_africa', 'South Africa') },
    { value: 'Other', label: t('affiliate.application.countries.other', 'Other') }
  ];

  if (isSubmitted) {
    return (
      <div className="relative min-h-screen flex items-center justify-center p-4 dark:bg-gray-900" style={finalBackgroundStyles}>
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-100/30 dark:bg-blue-900/20 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-100/30 dark:bg-indigo-900/20 rounded-full blur-3xl"></div>
        </div>

        {/* Dark overlay for custom backgrounds in dark mode - only show overlay, don't override background */}
        {theme === 'dark' && <div className="absolute inset-0 bg-black/40 z-0"></div>}

        <div className="relative z-10 w-full max-w-md">
          <div className="bg-card/80 backdrop-blur-sm rounded-2xl shadow-xl border border-border/20 p-8 text-center">
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
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-4">{t('affiliate.application.submitted.title', 'Application Submitted!')}</h1>
          <p className="text-foreground mb-6">
            {t('affiliate.application.submitted.message', 'Thank you for your interest in becoming a {{appName}} partner. We\'ve received your application and will review it within 2-3 business days.', { appName: branding.appName })}
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            {t('affiliate.application.submitted.follow_up', 'You\'ll receive an email confirmation shortly, and we\'ll contact you once your application has been reviewed.')}
          </p>
          <Button
            onClick={() => window.location.href = '/register'}
            className="w-full btn-brand-primary text-white"
          >
            {t('affiliate.application.submitted.continue_button', 'Continue to Registration')}
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

      <div className="relative z-10 w-full max-w-3xl">
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
            <h2 className="text-3xl font-bold text-foreground mb-4">{t('affiliate.application.form.title', 'Partner Application')}</h2>
            <p className="text-muted-foreground">
              {t('affiliate.application.form.description', 'Fill out the form below to apply for our affiliate program. We\'ll review your application and get back to you within 2-3 business days.')}
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Personal Information */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-lg font-semibold text-foreground border-b border-border pb-2">
                  <User className="h-5 w-5" />
                  {t('affiliate.application.sections.personal_info', 'Personal Information')}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('affiliate.application.fields.first_name', 'First Name')} *</FormLabel>
                        <FormControl>
                          <Input placeholder={t('affiliate.application.placeholders.first_name', 'John')} className="h-12" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('affiliate.application.fields.last_name', 'Last Name')} *</FormLabel>
                        <FormControl>
                          <Input placeholder={t('affiliate.application.placeholders.last_name', 'Doe')} className="h-12" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('affiliate.application.fields.email', 'Email Address')} *</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder={t('affiliate.application.placeholders.email', 'john@example.com')} className="h-12" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('affiliate.application.fields.phone', 'Phone Number')}</FormLabel>
                        <FormControl>
                          <Input placeholder={t('affiliate.application.placeholders.phone', '+1 (555) 123-4567')} className="h-12" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Business Information */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-lg font-semibold text-foreground border-b border-border pb-2">
                  <Building className="h-5 w-5" />
                  {t('affiliate.application.sections.business_info', 'Business Information')}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('affiliate.application.fields.company', 'Company/Organization')}</FormLabel>
                        <FormControl>
                          <Input placeholder={t('affiliate.application.placeholders.company', 'Your Company Name')} className="h-12" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('affiliate.application.fields.website', 'Website')}</FormLabel>
                        <FormControl>
                          <Input placeholder={t('affiliate.application.placeholders.website', 'https://yourwebsite.com')} className="h-12" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('affiliate.application.fields.country', 'Country')} *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-12">
                            <SelectValue placeholder={t('affiliate.application.placeholders.country', 'Select your country')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {countries.map((country) => (
                            <SelectItem key={country.value} value={country.value}>
                              {country.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Marketing Information */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-lg font-semibold text-foreground border-b border-border pb-2">
                  <Globe className="h-5 w-5" />
                  {t('affiliate.application.sections.marketing_info', 'Marketing Information')}
                </div>

                <FormField
                  control={form.control}
                  name="marketingChannels"
                  render={() => (
                    <FormItem>
                      <FormLabel>{t('affiliate.application.fields.marketing_channels', 'Marketing Channels')} *</FormLabel>
                      <FormDescription>
                        {t('affiliate.application.descriptions.marketing_channels', 'Select all marketing channels you plan to use (select at least one)')}
                      </FormDescription>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {marketingChannelOptions.map((option) => (
                          <FormField
                            key={option.value}
                            control={form.control}
                            name="marketingChannels"
                            render={({ field }) => {
                              return (
                                <FormItem
                                  key={option.value}
                                  className="flex flex-row items-start space-x-3 space-y-0"
                                >
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(option.value)}
                                      onCheckedChange={(checked) => {
                                        return checked
                                          ? field.onChange([...field.value, option.value])
                                          : field.onChange(
                                              field.value?.filter(
                                                (value) => value !== option.value
                                              )
                                            )
                                      }}
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal">
                                    {option.label}
                                  </FormLabel>
                                </FormItem>
                              )
                            }}
                          />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="expectedMonthlyReferrals"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('affiliate.application.fields.expected_referrals', 'Expected Monthly Referrals')} *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-12">
                            <SelectValue placeholder={t('affiliate.application.placeholders.expected_referrals', 'Select expected monthly referrals')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {expectedReferralOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="experience"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('affiliate.application.fields.experience', 'Marketing Experience')} *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t('affiliate.application.placeholders.experience', 'Describe your marketing experience, audience size, and relevant achievements...')}
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        {t('affiliate.application.descriptions.experience', 'Tell us about your marketing experience and how you plan to promote {{appName}} (minimum 50 characters)', { appName: branding.appName })}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="motivation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('affiliate.application.fields.motivation', 'Why do you want to become a partner?')} *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t('affiliate.application.placeholders.motivation', 'Tell us why you\'re interested in partnering with {{appName}}...', { appName: branding.appName })}
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        {t('affiliate.application.descriptions.motivation', 'Share your motivation for joining our affiliate program (minimum 50 characters)')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Terms and Conditions */}
              <FormField
                control={form.control}
                name="agreeToTerms"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        {t('affiliate.application.fields.agree_to_terms', 'I agree to the terms and conditions')} *
                      </FormLabel>
                      <FormDescription>
                        {t('affiliate.application.descriptions.terms', 'By checking this box, you agree to our affiliate program terms and conditions, privacy policy, and marketing guidelines.')}
                      </FormDescription>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-4 pt-6">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-12"
                  onClick={() => window.location.href = '/register'}
                >
                  {t('affiliate.application.buttons.back', 'Back to Registration')}
                </Button>
                <Button
                  type="submit"
                  className="flex-1 h-12 btn-brand-primary text-white"
                  disabled={submitApplicationMutation.isPending}
                >
                  {submitApplicationMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('affiliate.application.buttons.submitting', 'Submitting...')}
                    </>
                  ) : (
                    t('affiliate.application.buttons.submit', 'Submit Application')
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
