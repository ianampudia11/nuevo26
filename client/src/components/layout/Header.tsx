import { useState, useRef, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LogOut, User, Settings, HelpCircle, Building, ArrowLeft, Globe, Search, X, Wifi, WifiOff } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useBranding } from '@/contexts/branding-context';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { ProfileLanguageSelector } from '@/components/ui/profile-language-selector';
import ThemeToggle from '@/components/ui/theme-toggle';
import { usePermissions, PermissionGate } from '@/hooks/usePermissions';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { SearchDropdown } from '@/components/ui/search-dropdown';
import { useConversations } from '@/context/ConversationContext';
import { useTheme } from 'next-themes';

function adjustColor(color: string, amount: number): string {
  try {
    color = color.replace('#', '');

    let r = parseInt(color.substring(0, 2), 16);
    let g = parseInt(color.substring(2, 4), 16);
    let b = parseInt(color.substring(4, 6), 16);

    r = Math.max(0, Math.min(255, r + amount));
    g = Math.max(0, Math.min(255, g + amount));
    b = Math.max(0, Math.min(255, b + amount));

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  } catch (error) {
    return '#1f2937';
  }
}

function getInitials(name: string): string {
  return name
    ?.split(' ')
    .map((part: string) => part[0])
    .join('')
    .toUpperCase()
    .substring(0, 2) || 'JD';
}

export default function Header() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [_, navigate] = useLocation();
  const { user, company, logoutMutation, isImpersonating, returnFromImpersonationMutation } = useAuth();
  const { branding } = useBranding();
  const { PERMISSIONS } = usePermissions();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [brandingUpdateKey, setBrandingUpdateKey] = useState(0);

  let isWebSocketConnected = true;
  try {
    const { isWebSocketConnected: wsConnected } = useConversations();
    isWebSocketConnected = wsConnected;
  } catch {
  }

  const {
    searchQuery,
    isOpen,
    isLoading,
    results,
    handleSearch,
    clearSearch,
    closeDropdown,
    openDropdown,
  } = useDebouncedSearch(300);

  const handleLogout = () => {
    sessionStorage.removeItem('isImpersonating');
    localStorage.removeItem('isImpersonating');
    localStorage.removeItem('originalSuperAdminId');

    logoutMutation.mutate();
  };

  const handleReturnToAdmin = async () => {
    try {
      toast({
        title: t('admin.returning_to_admin', 'Returning to admin account'),
        description: t('common.please_wait', 'Please wait...'),
      });

      returnFromImpersonationMutation.mutate();
    } catch (error) {
      toast({
        title: t('admin.error_returning', 'Error returning to admin'),
        description: t('admin.trying_fallback', 'Trying fallback method...'),
        variant: "destructive",
      });

      sessionStorage.removeItem('isImpersonating');
      localStorage.removeItem('isImpersonating');
      localStorage.removeItem('originalSuperAdminId');

      try {
        await fetch('/api/clear-session', { method: 'POST' });
      } catch (clearError) {
        
      }

      setTimeout(() => {
        window.location.replace('/admin/login');
      }, 1000);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        closeDropdown();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeDropdown]);


  useEffect(() => {
    const handleBrandingUpdate = () => {
      setBrandingUpdateKey(prev => prev + 1);
    };

    window.addEventListener('brandingUpdated', handleBrandingUpdate);
    return () => window.removeEventListener('brandingUpdated', handleBrandingUpdate);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const headerStyle = isDark ? {
    headerBg: { backgroundColor: 'hsl(var(--card))' },
    borderColor: { borderColor: 'hsl(var(--border))' }
  } : company ? {
    headerBg: { backgroundColor: adjustColor(company.primaryColor ?? '#1f2937', -40) },
    borderColor: { borderColor: adjustColor(company.primaryColor ?? '#1f2937', -30) }
  } : {
    headerBg: { backgroundColor: '#1f2937' },
    borderColor: { borderColor: '#374151' }
  };

  return (
    <header
      className="sticky top-0 z-10 text-white border-b px-4 py-2 grid grid-cols-3 items-center"
      style={{
        ...headerStyle.headerBg,
        ...headerStyle.borderColor
      }}
    >
      <div className="flex items-center">
        {isImpersonating && (
          <Button
            variant="brand"

            size="sm"
            className="btn-brand-primary mr-4 text-amber-600 border-amber-600 hover:bg-amber-50"
            onClick={handleReturnToAdmin}
            disabled={returnFromImpersonationMutation.isPending}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            {returnFromImpersonationMutation.isPending ? t('admin.returning', 'Returning...') : t('admin.return_to_admin', 'Return to Admin')}
          </Button>
        )}
        <div className="flex items-center">
          {company?.logo || branding.logoUrl ? (
            <img
              src={company?.logo || branding.logoUrl}
              alt={company?.name || branding.appName}
              className="h-10 w-auto max-w-md object-contain"
            />
          ) : (
            <>
              <svg className="h-8 w-8 text-primary-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12,2C6.48,2,2,6.48,2,12s4.48,10,10,10s10-4.48,10-10S17.52,2,12,2z M12,20c-4.41,0-8-3.59-8-8s3.59-8,8-8s8,3.59,8,8
                S16.41,20,12,20z M14.59,8.59L16,10l-6,6l-4-4l1.41-1.41L10,13.17L14.59,8.59z"></path>
              </svg>
              <span className="ml-2 text-xl text-white">
                {company?.name || branding.appName}
                {isImpersonating && (
                  <span className="ml-2 text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded-full">
                    {t('admin.impersonating', 'Impersonating')}
                  </span>
                )}
              </span>
            </>
          )}
        </div>

      </div>

      <div className="flex justify-center">
        <div className="relative w-[400px] max-w-full hidden md:block" ref={searchContainerRef}>
          <form onSubmit={handleSearchSubmit}>
            <div className="relative">
              <input
                type="search"
                placeholder={t('common.search_placeholder', 'Search conversations, contacts, templates...')}
                className="w-full px-4 py-2 pr-10 rounded-lg bg-background/20 border border-input/50 text-white placeholder-muted-foreground focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={openDropdown}
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <Search className="h-4 w-4 absolute right-3 top-2.5 text-muted-foreground" />
              )}
            </div>
          </form>

          <SearchDropdown
            isOpen={isOpen}
            isLoading={isLoading}
            results={results}
            onClose={closeDropdown}
            onSelect={clearSearch}
            query={searchQuery}
          />
        </div>
      </div>

      <div className="flex items-center justify-end space-x-4">
        <button
          className="md:hidden flex items-center justify-center h-8 w-8 rounded-full bg-background/20 hover:bg-background/30"
          onClick={() => setIsMobileSearchOpen(true)}
        >
          <Search className="h-4 w-4 text-white" />
        </button>

        <ThemeToggle variant="compact" className="flex items-center justify-center h-8 w-8 rounded-full bg-background/20 hover:bg-background/30 text-white" />

        <LanguageSwitcher variant="compact" />

        <PermissionGate permissions={[PERMISSIONS.VIEW_SETTINGS, PERMISSIONS.MANAGE_SETTINGS]}>
          <button
            className="flex items-center justify-center h-8 w-8 rounded-full bg-background/20 hover:bg-background/30"
            onClick={() => navigate('/settings')}
          >
            <i className="ri-settings-3-line text-white"></i>
          </button>
        </PermissionGate>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center cursor-pointer hover:opacity-80">
            <Avatar className="h-8 w-8">
              {user?.avatarUrl ? (
                <AvatarImage src={user.avatarUrl} alt={user.fullName || 'User'} />
              ) : null}
              <AvatarFallback
                className="text-white font-medium text-sm"
                style={{ backgroundColor: company?.primaryColor || branding.primaryColor }}
              >
                {getInitials(user?.fullName || '')}
              </AvatarFallback>
            </Avatar>
            <span className="ml-2 hidden md:block text-white">{user?.fullName || 'John Doe'}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5 text-sm font-medium">
              <div>{user?.fullName || 'John Doe'}</div>
              <div className="text-xs text-muted-foreground">{user?.email || 'email@example.com'}</div>
              {company && (
                <div className="text-xs flex items-center mt-1 text-primary">
                  <Building className="h-3 w-3 mr-1" />
                  {company.name}
                </div>
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => navigate('/profile')}
            >
              <User className="mr-2 h-4 w-4" />
              <span>{t('nav.profile', 'Profile')}</span>
            </DropdownMenuItem>

            <PermissionGate permissions={[PERMISSIONS.VIEW_SETTINGS, PERMISSIONS.MANAGE_SETTINGS]}>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => navigate('/settings')}
              >
                <Settings className="mr-2 h-4 w-4" />
                <span>{t('nav.settings', 'Settings')}</span>
              </DropdownMenuItem>
            </PermissionGate>

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

      {isMobileSearchOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsMobileSearchOpen(false)} />
          <div
            className="fixed top-0 left-0 right-0 border-b p-4"
            style={{
              ...headerStyle.headerBg,
              ...headerStyle.borderColor
            }}
          >
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setIsMobileSearchOpen(false)}
                className="flex items-center justify-center h-8 w-8 rounded-full bg-background/20 hover:bg-background/30"
              >
                <X className="h-4 w-4 text-white" />
              </button>
              <div className="flex-1 relative">
                <input
                  type="search"
                  placeholder={t('common.search_placeholder', 'Search conversations, contacts, templates...')}
                  className="w-full px-4 py-2 pr-10 rounded-lg bg-background/20 border border-input/50 text-white placeholder-muted-foreground focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  autoFocus
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="absolute right-3 top-2.5 text-muted-foreground hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : (
                  <Search className="h-4 w-4 absolute right-3 top-2.5 text-muted-foreground" />
                )}
              </div>
            </div>

            <div className="mt-4 max-h-96 overflow-y-auto">
              <SearchDropdown
                isOpen={true}
                isLoading={isLoading}
                results={results}
                onClose={() => setIsMobileSearchOpen(false)}
                onSelect={() => {
                  clearSearch();
                  setIsMobileSearchOpen(false);
                }}
                query={searchQuery}
              />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
