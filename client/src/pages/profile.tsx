import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/use-translation';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Loader2, User, Mail, Key, Check, Save, Upload, Calendar, Globe, Bell, BellOff } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';

interface UserProfile {
  id: number;
  username: string;
  fullName: string;
  email: string;
  avatarUrl?: string;
  role: string;
  companyId?: number;
  isSuperAdmin?: boolean;
  languagePreference?: string;
  createdAt?: string;
  updatedAt?: string;
  company?: {
    id: number;
    name: string;
    slug: string;
    plan?: string;
    registerNumber?: string;
    companyEmail?: string;
    contactPerson?: string;
    iban?: string;
    logo?: string;
    primaryColor?: string;
    createdAt?: string;
    updatedAt?: string;
  };
}

interface NotificationSettings {
  emailNotifications: boolean;
  pushNotifications: boolean;
  marketingEmails: boolean;
  securityAlerts: boolean;
}

const profileFormSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  languagePreference: z.string().optional(),
});

const notificationFormSchema = z.object({
  emailNotifications: z.boolean(),
  pushNotifications: z.boolean(),
  marketingEmails: z.boolean(),
  securityAlerts: z.boolean(),
});


const validateIBAN = (iban: string): boolean => {
  if (!iban) return true; // Allow empty IBAN (optional field)


  const cleanIban = iban.replace(/\s/g, '').toUpperCase();



  if (cleanIban.length !== 24) {
    return false;
  }


  if (!/^SA[0-9]{2}/.test(cleanIban)) {
    return false;
  }


  if (!/^SA[0-9]{22}$/.test(cleanIban)) {
    return false;
  }


  try {

    const rearranged = cleanIban.slice(4) + cleanIban.slice(0, 4);


    const numericString = rearranged.replace(/[A-Z]/g, (char) =>
      (char.charCodeAt(0) - 55).toString()
    );


    let remainder = 0;
    for (let i = 0; i < numericString.length; i++) {
      remainder = (remainder * 10 + parseInt(numericString[i])) % 97;
    }

    return remainder === 1;
  } catch {
    return false;
  }
};


const formatSaudiIBAN = (iban: string): string => {
  if (!iban) return '';
  const clean = iban.replace(/\s/g, '').toUpperCase();
  if (clean.length <= 4) return clean;


  return clean.replace(/^(SA\d{2})(\d{4})(\d{4})(\d{4})(\d{4})(\d{4})$/, '$1 $2 $3 $4 $5 $6');
};

const companyFormSchema = z.object({
  name: z.string().min(2, "Company name must be at least 2 characters"),















  primaryColor: z.string().optional(),
});

const passwordFormSchema = z.object({
  currentPassword: z.string().min(6, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;
type PasswordFormValues = z.infer<typeof passwordFormSchema>;
type NotificationFormValues = z.infer<typeof notificationFormSchema>;
type CompanyFormValues = z.infer<typeof companyFormSchema>;

export default function ProfilePage() {
  const { toast } = useToast();
  const { t, languages, currentLanguage } = useTranslation();
  const [activeTab, setActiveTab] = useState("account");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    data: user,
    isLoading: isLoadingUser,
    error: userError
  } = useQuery<UserProfile>({
    queryKey: ['/api/users/me'],
    refetchOnWindowFocus: false,
  });

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      fullName: "",
      email: "",
      username: "",
      languagePreference: "",
    },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const notificationForm = useForm<NotificationFormValues>({
    resolver: zodResolver(notificationFormSchema),
    defaultValues: {
      emailNotifications: true,
      pushNotifications: false,
      marketingEmails: false,
      securityAlerts: true,
    },
  });

  const companyForm = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: {
      name: "",





      primaryColor: "#333235",
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      const response = await apiRequest('PATCH', '/api/users/me', data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update profile');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Profile Updated",
        description: "Your profile information has been updated successfully.",
      });

      queryClient.invalidateQueries({ queryKey: ['/api/users/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Failed to update profile: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await fetch('/api/users/me/avatar', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to upload avatar');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Avatar Updated",
        description: "Your profile picture has been updated successfully.",
      });

      queryClient.invalidateQueries({ queryKey: ['/api/users/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      setIsUploadingAvatar(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Failed to upload avatar: ${error.message}`,
        variant: "destructive",
      });
      setIsUploadingAvatar(false);
    }
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: PasswordFormValues) => {
      const response = await apiRequest('POST', '/api/users/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to change password');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Password Changed",
        description: "Your password has been changed successfully.",
      });
      passwordForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Failed to change password: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  const updateNotificationsMutation = useMutation({
    mutationFn: async (data: NotificationFormValues) => {
      const response = await apiRequest('PATCH', '/api/users/me/notifications', data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update notification settings');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Notifications Updated",
        description: "Your notification preferences have been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Failed to update notifications: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  const updateCompanyMutation = useMutation({
    mutationFn: async (data: CompanyFormValues) => {
      const response = await apiRequest('PATCH', '/api/companies/me', data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update company information');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Company Updated",
        description: "Your company information has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/users/me'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Failed to update company: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  useEffect(() => {
    if (user) {
      profileForm.reset({
        fullName: user.fullName,
        email: user.email,
        username: user.username,
        languagePreference: user.languagePreference || currentLanguage?.code || 'en',
      });

      if (user.company) {
        companyForm.reset({
          name: user.company.name || "",





          primaryColor: user.company.primaryColor || "#333235",
        });
      }
    }
  }, [user, profileForm, companyForm, currentLanguage]);

  const onProfileSubmit = (data: ProfileFormValues) => {
    updateProfileMutation.mutate(data);
  };

  const onPasswordSubmit = (data: PasswordFormValues) => {
    changePasswordMutation.mutate(data);
  };

  const onNotificationSubmit = (data: NotificationFormValues) => {
    updateNotificationsMutation.mutate(data);
  };

  const onCompanySubmit = (data: CompanyFormValues) => {
    updateCompanyMutation.mutate(data);
  };

  const handleAvatarUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {

      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const maxSize = 5 * 1024 * 1024; // 5MB

      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid File Type",
          description: "Please select a valid image file (JPEG, PNG, GIF, or WebP).",
          variant: "destructive",
        });

        event.target.value = '';
        return;
      }

      if (file.size > maxSize) {
        toast({
          title: "File Too Large",
          description: "Please select an image smaller than 5MB.",
          variant: "destructive",
        });

        event.target.value = '';
        return;
      }

      setIsUploadingAvatar(true);
      uploadAvatarMutation.mutate(file);
    }

    event.target.value = '';
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getInitials = (name: string) => {
    return name?.split(' ').map((n) => n[0]).join('') || 'U';
  };

  if (isLoadingUser) {
    return (
      <div className="min-h-screen flex flex-col font-sans text-foreground">
        <Header />
        <div className="flex flex-1">
          <Sidebar />
          <main className="flex-1 p-6">
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
                <p className="text-muted-foreground">Loading your profile...</p>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (userError) {
    return (
      <div className="min-h-screen flex flex-col font-sans text-foreground">
        <Header />
        <div className="flex flex-1">
          <Sidebar />
          <main className="flex-1 p-6">
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Error loading profile</h2>
                <p className="text-muted-foreground mb-4">{(userError as Error).message}</p>
                <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/users/me'] })}>
                  Try Again
                </Button>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col font-sans text-foreground">
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-6">
          <div className="space-y-6">
            <div className="flex items-center">
              <h1 className="text-2xl font-semibold">Account Settings</h1>
            </div>
            
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-6">
                <TabsTrigger value="account">Account</TabsTrigger>
                <TabsTrigger value="company">Company</TabsTrigger>
                <TabsTrigger value="security">Security</TabsTrigger>
                <TabsTrigger value="notifications">Notifications</TabsTrigger>
              </TabsList>
              
              <TabsContent value="account">
                <Card>
                  <CardHeader>
                    <CardTitle>Profile Information</CardTitle>
                    <CardDescription>
                      Update your account details and public profile.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center space-x-6 mb-6">
                      <Avatar className="h-20 w-20">
                        {user?.avatarUrl ? (
                          <AvatarImage src={user.avatarUrl} alt={user.fullName} />
                        ) : null}
                        <AvatarFallback className="text-lg ">
                          {getInitials(user?.fullName || '')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <h3 className="text-lg font-medium">{user?.fullName}</h3>
                        <p className="text-sm text-muted-foreground">{user?.email}</p>
                        <p className="text-sm text-muted-foreground capitalize">{user?.role}</p>
                        {user?.company && (
                          <p className="text-sm text-muted-foreground">
                            {user.company.name} {user.company.plan && `(${user.company.plan})`}
                          </p>
                        )}
                        <div className="flex gap-2 mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleAvatarUpload}
                            disabled={isUploadingAvatar}
                          >
                            {isUploadingAvatar ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Uploading...
                              </>
                            ) : (
                              <>
                                <Upload className="mr-2 h-4 w-4" />
                                Change Avatar
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Account Information */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 bg-muted/30 rounded-lg">
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">Account Created</Label>
                        <p className="text-sm">{formatDate(user?.createdAt)}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">Last Updated</Label>
                        <p className="text-sm">{formatDate(user?.updatedAt)}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">User ID</Label>
                        <p className="text-sm font-mono">{user?.id}</p>
                      </div>
                      {user?.isSuperAdmin && (
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">Admin Status</Label>
                          <p className="text-sm text-primary font-medium">Super Administrator</p>
                        </div>
                      )}
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    
                    <Separator className="my-6" />
                    
                    <Form {...profileForm}>
                      <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-6">
                        <FormField
                          control={profileForm.control}
                          name="fullName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Full Name</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                  <Input className="pl-9" placeholder="Your full name" {...field} />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={profileForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email Address</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                  <Input className="pl-9" placeholder="your.email@example.com" {...field} />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={profileForm.control}
                          name="username"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Username</FormLabel>
                              <FormControl>
                                <Input placeholder="username" {...field} />
                              </FormControl>
                              <FormDescription>
                                This is your public display name. It can be your real name or a pseudonym.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={profileForm.control}
                          name="languagePreference"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                <Globe className="inline mr-2 h-4 w-4" />
                                Language Preference
                              </FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select a language" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {languages.map((language) => (
                                    <SelectItem key={language.code} value={language.code}>
                                      <span className="mr-2">{language.flagIcon}</span>
                                      {language.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Choose your preferred language for the interface.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <Button 
                          type="submit" 
                          className="w-full md:w-auto btn-brand-primary"
                          disabled={updateProfileMutation.isPending}
                        >
                          {updateProfileMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Saving Changes
                            </>
                          ) : (
                            <>
                              <Save className="mr-2 h-4 w-4" />
                              Save Changes
                            </>
                          )}
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="company">
                <Card>
                  <CardHeader>
                    <CardTitle>Company Information</CardTitle>
                    <CardDescription>
                      Manage your company details and settings.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* Company Overview - Read Only Information */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-muted/30 rounded-lg">
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">Company Slug</Label>
                        <p className="text-sm font-mono">{user?.company?.slug}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">Plan</Label>
                        <p className="text-sm capitalize">{user?.company?.plan || 'Free'}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">Company Created</Label>
                        <p className="text-sm">{formatDate(user?.company?.createdAt)}</p>
                      </div>
                    </div>

                    <Form {...companyForm}>
                      <form onSubmit={companyForm.handleSubmit(onCompanySubmit)} className="space-y-6">
                        <div className="grid gap-6 sm:grid-cols-2">
                          <FormField
                            control={companyForm.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Company Name</FormLabel>
                                <FormControl>
                                  <Input placeholder="Your Company Name" {...field} />
                                </FormControl>
                                <FormDescription>
                                  The official name of your company.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          {/* For Kaif Ahmad - Commented out fields that are not needed anymore
                          <FormField
                            control={companyForm.control}
                            name="companyEmail"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Company Email</FormLabel>
                                <FormControl>
                                  <Input
                                    type="email"
                                    placeholder="info@yourcompany.com"
                                    {...field}
                                  />
                                </FormControl>
                                <FormDescription>
                                  Official email address for your company.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          */}
                          <FormField
                            control={companyForm.control}
                            name="primaryColor"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Primary Color</FormLabel>
                                <FormControl>
                                  <div className="flex items-center space-x-2">
                                    <Input
                                      type="color"
                                      className="w-12 h-10 p-1 border rounded"
                                      {...field}
                                    />
                                    <Input
                                      type="text"
                                      placeholder="#333235"
                                      className="flex-1"
                                      {...field}
                                    />
                                  </div>
                                </FormControl>
                                <FormDescription>
                                  Primary brand color for your company.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        {/* For Kaif Ahmad - Commented out fields that are not needed anymore  
                        <div className="grid gap-6 sm:grid-cols-2">
                          <FormField
                            control={companyForm.control}
                            name="contactPerson"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Contact Person</FormLabel>
                                <FormControl>
                                  <Input placeholder="Jane Smith" {...field} />
                                </FormControl>
                                <FormDescription>
                                  Main contact person for your company.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        */}
                        {/* For Kaif Ahmad - Commented out fields that are not needed anymore
                        <div className="grid gap-6 sm:grid-cols-2">
                          <FormField
                            control={companyForm.control}
                            name="registerNumber"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Commercial Registration Number (KSA)</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="1234567890"
                                    className="font-mono"
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
                                  Your company's 10-digit Commercial Registration Number (CR) issued by the KSA Ministry of Commerce.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={companyForm.control}
                            name="iban"
                            render={({ field }) => {
                              const isValidIban = field.value ? validateIBAN(field.value) : true;
                              const displayValue = field.value ? formatSaudiIBAN(field.value) : '';

                              return (
                                <FormItem>
                                  <FormLabel>Company IBAN Number (KSA)</FormLabel>
                                  <FormControl>
                                    <div className="relative">
                                      <Input
                                        placeholder="SA03 8000 0000 6080 1016 7519"
                                        className={`font-mono pr-10 ${
                                          field.value && !isValidIban
                                            ? 'border-red-500 focus:border-red-500'
                                            : field.value && isValidIban
                                            ? 'border-green-500 focus:border-green-500'
                                            : ''
                                        }`}
                                        style={{ textTransform: 'uppercase' }}
                                        value={displayValue}
                                        onChange={(e) => {

                                          const cleanValue = e.target.value.replace(/\s/g, '').toUpperCase();

                                          if (cleanValue.length <= 24) {
                                            field.onChange(cleanValue);
                                          }
                                        }}
                                        onBlur={field.onBlur}
                                        name={field.name}
                                        ref={field.ref}
                                        maxLength={29} // Allow for spaces in display: SA03 8000 0000 6080 1016 7519
                                      />
                                      {field.value && (
                                        <div className="absolute right-3 top-2.5">
                                          {isValidIban ? (
                                            <Check className="h-4 w-4 text-green-500" />
                                          ) : (
                                            <span className="h-4 w-4 text-red-500 text-xs">✕</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </FormControl>
                                  <FormDescription>
                                    Your company's official KSA IBAN (24 characters: SA + 22 digits).
                                    {field.value && !isValidIban && (
                                      <span className="text-red-500 block mt-1">
                                        Please enter a valid KSA IBAN (e.g., SA0380000000608010167519)
                                      </span>
                                    )}
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              );
                            }}
                          />
                        </div>
                        */}
                        <Button
                          type="submit"
                          className="w-full md:w-auto"
                          disabled={updateCompanyMutation.isPending}
                        >
                          {updateCompanyMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Saving Changes
                            </>
                          ) : (
                            <>
                              <Save className="mr-2 h-4 w-4" />
                              Save Company Information
                            </>
                          )}
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="security">
                <Card>
                  <CardHeader>
                    <CardTitle>Password</CardTitle>
                    <CardDescription>
                      Change your password to keep your account secure.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...passwordForm}>
                      <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-6">
                        <FormField
                          control={passwordForm.control}
                          name="currentPassword"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Current Password</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Key className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                  <Input 
                                    className="pl-9" 
                                    type="password" 
                                    placeholder="••••••••" 
                                    {...field} 
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="grid gap-6 sm:grid-cols-2">
                          <FormField
                            control={passwordForm.control}
                            name="newPassword"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>New Password</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="password" 
                                    placeholder="••••••••" 
                                    {...field} 
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={passwordForm.control}
                            name="confirmPassword"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Confirm New Password</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="password" 
                                    placeholder="••••••••" 
                                    {...field} 
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <Button 
                          type="submit" 
                          className="w-full md:w-auto"
                          disabled={changePasswordMutation.isPending}
                        >
                          {changePasswordMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Changing Password
                            </>
                          ) : (
                            <>
                              <Check className="mr-2 h-4 w-4" />
                              Change Password
                            </>
                          )}
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="notifications">
                <Card>
                  <CardHeader>
                    <CardTitle>Notification Settings</CardTitle>
                    <CardDescription>
                      Configure how you want to be notified about important events.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...notificationForm}>
                      <form onSubmit={notificationForm.handleSubmit(onNotificationSubmit)} className="space-y-6">
                        <FormField
                          control={notificationForm.control}
                          name="emailNotifications"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                              <div className="space-y-0.5">
                                <FormLabel className="text-base flex items-center gap-2">
                                  <Mail className="h-4 w-4" />
                                  Email Notifications
                                </FormLabel>
                                <FormDescription>
                                  Receive email notifications for important updates and messages.
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={notificationForm.control}
                          name="pushNotifications"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                              <div className="space-y-0.5">
                                <FormLabel className="text-base flex items-center gap-2">
                                  {field.value ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                                  Push Notifications
                                </FormLabel>
                                <FormDescription>
                                  Receive browser push notifications for real-time updates.
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={notificationForm.control}
                          name="marketingEmails"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                              <div className="space-y-0.5">
                                <FormLabel className="text-base">
                                  Marketing Communications
                                </FormLabel>
                                <FormDescription>
                                  Receive emails about new features, tips, and promotional content.
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={notificationForm.control}
                          name="securityAlerts"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                              <div className="space-y-0.5">
                                <FormLabel className="text-base">
                                  Security Alerts
                                </FormLabel>
                                <FormDescription>
                                  Receive notifications about security-related events and login attempts.
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <Button
                          type="submit"
                          className="w-full md:w-auto"
                          disabled={updateNotificationsMutation.isPending}
                        >
                          {updateNotificationsMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Saving Settings
                            </>
                          ) : (
                            <>
                              <Save className="mr-2 h-4 w-4" />
                              Save Notification Settings
                            </>
                          )}
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}