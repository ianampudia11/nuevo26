import { useQuery } from '@tanstack/react-query';
import LandingPage from '@/pages/landing';
import { Redirect } from 'wouter';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { settingsEvents, SETTINGS_EVENTS } from '@/lib/settings-events';

export default function ProtectedLandingPage() {
  const { data: settings, isLoading, error, refetch } = useQuery({
    queryKey: ['website-enabled'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/public/website-enabled');
        if (!res.ok) {
          return { enabled: false };
        }
        const data = await res.json();
        return data;
      } catch (error) {
        return { enabled: false };
      }
    },
    retry: false,
    staleTime: 0, // Always consider data stale to ensure fresh fetches
    gcTime: 30 * 1000, // Keep in cache for 30 seconds only
    refetchOnMount: 'always', // Always refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window regains focus
    refetchOnReconnect: true, // Refetch when network reconnects
  });


  useEffect(() => {
    const unsubscribe = settingsEvents.subscribe(SETTINGS_EVENTS.FRONTEND_WEBSITE_TOGGLED, (data) => {

      refetch();
    });

    return unsubscribe;
  }, [refetch]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-foreground">Loading...</p>
        </div>
      </div>
    );
  }


  if (!settings?.enabled) {
    return <Redirect to="/auth" />;
  }


  return <LandingPage />;
}
