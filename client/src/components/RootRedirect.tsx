import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { settingsEvents, SETTINGS_EVENTS } from '@/lib/settings-events';
import { preserveEmbedParam, isEmbeddedContext } from '@/utils/embed-context';

export default function RootRedirect() {
  const { user, isLoading: authLoading } = useAuth();
  const [_, setLocation] = useLocation();

  const { data: websiteSettings, isLoading: websiteLoading, refetch } = useQuery({
    queryKey: ['website-enabled'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/public/website-enabled');
        if (!res.ok) {
          return { enabled: true };
        }
        const data = await res.json();
        return data;
      } catch (error) {
        return { enabled: true };
      }
    },
    retry: false,
    staleTime: 0, // Always consider data stale
    gcTime: 30 * 1000, // Keep in cache for 30 seconds only
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });


  useEffect(() => {
    const unsubscribe = settingsEvents.subscribe(SETTINGS_EVENTS.FRONTEND_WEBSITE_TOGGLED, (data) => {
      refetch();
    });

    return unsubscribe;
  }, [refetch]);

  useEffect(() => {
    if (authLoading || websiteLoading) return;

    const preserveEmbed = (path: string) => {
      if (isEmbeddedContext()) {
        const urlWithEmbed = preserveEmbedParam(path);
        return urlWithEmbed.replace(window.location.origin, '');
      }
      return path;
    };

    if (user) {
      if (user.isSuperAdmin) {
        setLocation(preserveEmbed('/admin/dashboard'));
      } else {
        setLocation(preserveEmbed('/inbox'));
      }
      return;
    }


    if (websiteSettings?.enabled) {
      setLocation(preserveEmbed('/landing'));
      return;
    }


    setLocation(preserveEmbed('/auth'));
  }, [user, authLoading, websiteSettings, websiteLoading, setLocation]);


  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
        <p className="text-foreground">Loading...</p>
      </div>
    </div>
  );
}
