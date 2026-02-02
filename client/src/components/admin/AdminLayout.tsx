import { ReactNode, useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { useBranding } from "@/contexts/branding-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { ProfileLanguageSelector } from "@/components/ui/profile-language-selector";
import ThemeToggle from "@/components/ui/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { LogOut, User, Settings, HelpCircle, Home, Building, Users, Package, BarChart, Globe, Menu, X, CreditCard, UserCheck, Layout, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTheme } from "next-themes";

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { branding } = useBranding();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [brandingUpdateKey, setBrandingUpdateKey] = useState(0);

  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [location, isMobile]);

  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    } else {
      setSidebarOpen(true);
    }
  }, [isMobile]);


  useEffect(() => {
    const handleBrandingUpdate = () => {
      setBrandingUpdateKey(prev => prev + 1);
    };

    window.addEventListener('brandingUpdated', handleBrandingUpdate);
    return () => window.removeEventListener('brandingUpdated', handleBrandingUpdate);
  }, []);

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/logout');
      if (!response.ok) {
        throw new Error('Failed to logout');
      }
      return response;
    },
    onSuccess: () => {
      queryClient.setQueryData(['/api/user'], null);
      toast({
        title: t('auth.logged_out', 'Logged out'),
        description: t('auth.logged_out_success', 'You have been successfully logged out'),
      });

      setTimeout(() => {
        navigate('/admin');
      }, 500);
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('auth.logout_failed', 'Failed to logout: {{error}}', { error: error.message }),
        variant: "destructive",
      });
    }
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="text-white px-6 py-3 flex justify-between items-center relative z-50"
              style={{ backgroundColor: isDark ? 'hsl(var(--card))' : (branding.primaryColor || '#1f2937') }}>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden mr-2 text-white hover:bg-white/10"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>

          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={branding.appName}
              className="h-10 w-auto max-w-md object-contain"
            />
          ) : (
            <>
              <svg className="h-8 w-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12,2C6.48,2,2,6.48,2,12s4.48,10,10,10s10-4.48,10-10S17.52,2,12,2z M12,20c-4.41,0-8-3.59-8-8s3.59-8,8-8s8,3.59,8,8
                S16.41,20,12,20z M14.59,8.59L16,10l-6,6l-4-4l1.41-1.41L10,13.17L14.59,8.59z"></path>
              </svg>
              <span className="ml-2 text-xl font-bold">{branding.appName}</span>
            </>
          )}
        </div>

        <div className="flex items-center space-x-4">
          <ThemeToggle variant="compact" className="flex items-center justify-center h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 text-white" />
          <LanguageSwitcher variant="compact" />
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center cursor-pointer hover:opacity-80">
              <div className="h-8 w-8 rounded-full bg-primary-800 flex items-center justify-center text-white font-medium">
                {user?.fullName?.split(' ').map((name: string) => name[0]).join('') || 'SA'}
              </div>
              <span className="ml-2 hidden md:block">{user?.fullName || 'Super Admin'}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5 text-sm font-medium">
                <div>{user?.fullName || 'Super Admin'}</div>
                <div className="text-xs text-muted-foreground">{user?.email || 'admin@example.com'}</div>
              </div>
              <DropdownMenuSeparator />

              <DropdownMenuItem className="p-0">
                <ProfileLanguageSelector className="w-full justify-start p-2" />
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-red-600 focus:text-red-600"
                onClick={handleLogout}
                disabled={logoutMutation.isPending}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>{logoutMutation.isPending ? t('auth.logging_out', 'Logging out...') : t('auth.logout', 'Logout')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex flex-1 relative">
        {isMobile && sidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
          className={`
            ${isMobile ? 'fixed' : 'relative'}
            ${isMobile && !sidebarOpen ? '-translate-x-full' : 'translate-x-0'}
            w-64 text-white transition-transform duration-300 ease-in-out z-50
            ${isMobile ? 'h-full' : 'h-auto'}
          `}
          style={{ backgroundColor: isDark ? 'hsl(var(--card))' : (branding.primaryColor || '#1f2937') }}
        >
          {false && !isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute -right-3 top-6 text-white p-1 rounded-full border z-50 shadow-lg transition-colors hover:bg-white/10"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{ backgroundColor: branding.primaryColor }}
            >
              {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          )}

          <nav className="p-4 space-y-2">
            <Link href="/admin/dashboard">
              <Button
                variant="ghost"
                className={`w-full justify-start text-white transition-colors ${
                  location === '/admin/dashboard'
                    ? 'bg-white/20 text-white'
                    : 'hover:bg-white/10 text-white/80 hover:text-white'
                }`}
              >
                <Home className="mr-2 h-5 w-5" />
                {t('admin.nav.dashboard', 'Dashboard')}
              </Button>
            </Link>

            <Link href="/admin/companies">
              <Button
                variant="ghost"
                className={`w-full justify-start text-white transition-colors ${
                  location.startsWith('/admin/companies')
                    ? 'bg-white/20 text-white'
                    : 'hover:bg-white/10 text-white/80 hover:text-white'
                }`}
              >
                <Building className="mr-2 h-5 w-5" />
                {t('admin.nav.companies', 'Companies')}
              </Button>
            </Link>

            <Link href="/admin/users">
              <Button
                variant="ghost"
                className={`w-full justify-start text-white transition-colors ${
                  location.startsWith('/admin/users')
                    ? 'bg-white/20 text-white'
                    : 'hover:bg-white/10 text-white/80 hover:text-white'
                }`}
              >
                <Users className="mr-2 h-5 w-5" />
                {t('admin.nav.users', 'Users')}
              </Button>
            </Link>

            <Link href="/admin/plans">
              <Button
                variant="ghost"
                className={`w-full justify-start text-white transition-colors ${
                  location.startsWith('/admin/plans')
                    ? 'bg-white/20 text-white'
                    : 'hover:bg-white/10 text-white/80 hover:text-white'
                }`}
              >
                <Package className="mr-2 h-5 w-5" />
                {t('admin.nav.plans', 'Plans')}
              </Button>
            </Link>

            <Link href="/admin/coupons">
              <Button
                variant="ghost"
                className={`w-full justify-start text-white transition-colors ${
                  location.startsWith('/admin/coupons')
                    ? 'bg-white/20 text-white'
                    : 'hover:bg-white/10 text-white/80 hover:text-white'
                }`}
              >
                <Tag className="mr-2 h-5 w-5" />
                {t('admin.nav.coupons', 'Coupons')}
              </Button>
            </Link>

            <Link href="/admin/payments">
              <Button
                variant="ghost"
                className={`w-full justify-start text-white transition-colors ${
                  location.startsWith('/admin/payments')
                    ? 'bg-white/20 text-white'
                    : 'hover:bg-white/10 text-white/80 hover:text-white'
                }`}
              >
                <CreditCard className="mr-2 h-5 w-5" />
                {t('admin.payments.title', 'Payment Management')}
              </Button>
            </Link>
            {/* For Kaif Ahmad */}
            <Link href="/admin/affiliate">
              <Button
                variant="ghost"
                className={`w-full justify-start text-white transition-colors ${
                  location.startsWith('/admin/affiliate')
                    ? 'bg-white/20 text-white'
                    : 'hover:bg-white/10 text-white/80 hover:text-white'
                }`}
              >
                <UserCheck className="mr-2 h-5 w-5" />
                {t('admin.affiliate.title', 'Affiliate Management')}
              </Button>
            </Link>

            <Link href="/admin/analytics">
              <Button
                variant="ghost"
                className={`w-full justify-start text-white transition-colors ${
                  location.startsWith('/admin/analytics')
                    ? 'bg-white/20 text-white'
                    : 'hover:bg-white/10 text-white/80 hover:text-white'
                }`}
              >
                <BarChart className="mr-2 h-5 w-5" />
                {t('admin.nav.analytics', 'Analytics')}
              </Button>
            </Link>

            <Link href="/admin/translations">
              <Button
                variant="ghost"
                className={`w-full justify-start text-white transition-colors ${
                  location.startsWith('/admin/translations')
                    ? 'bg-white/20 text-white'
                    : 'hover:bg-white/10 text-white/80 hover:text-white'
                }`}
              >
                <Globe className="mr-2 h-5 w-5" />
                {t('admin.nav.translations', 'Translations')}
              </Button>
            </Link>

            {/* For Kaif Ahmad */}

            {/* <Link href="/admin/website-builder">
              <Button
                variant="ghost"
                className={`w-full justify-start text-white transition-colors ${
                  location.startsWith('/admin/website-builder')
                    ? 'bg-white/20 text-white'
                    : 'hover:bg-white/10 text-white/80 hover:text-white'
                }`}
              >
                <Layout className="mr-2 h-5 w-5" />
                Website Builder
              </Button>
            </Link> */}

            <Link href="/admin/settings">
              <Button
                variant="ghost"
                className={`w-full justify-start text-white transition-colors ${
                  location.startsWith('/admin/settings')
                    ? 'bg-white/20 text-white'
                    : 'hover:bg-white/10 text-white/80 hover:text-white'
                }`}
              >
                <Settings className="mr-2 h-5 w-5" />
                {t('admin.nav.settings', 'Settings')}
              </Button>
            </Link>
          </nav>


        </aside>

        <main className={`flex-1 bg-gray-50 dark:bg-gray-900 overflow-auto transition-all duration-300 ${
          isMobile ? 'w-full' : sidebarOpen ? 'ml-0' : 'ml-0'
        }`}>
          {children}
        </main>
      </div>
    </div>
  );
}
