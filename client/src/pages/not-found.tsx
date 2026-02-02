import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  Home,
  ArrowLeft,
  MessageSquare,
  Search,
  HelpCircle,
  Mail,
  RefreshCw
} from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { useBranding } from "@/contexts/branding-context";
import { useAuth } from "@/hooks/use-auth";

export default function NotFound() {
  const { t } = useTranslation();
  const { branding } = useBranding();
  const { user } = useAuth();
  const [_, setLocation] = useLocation();
  const [brandingUpdateKey, setBrandingUpdateKey] = useState(0);


  useEffect(() => {
    const handleBrandingUpdate = () => {
      setBrandingUpdateKey(prev => prev + 1);
    };

    window.addEventListener('brandingUpdated', handleBrandingUpdate);
    return () => window.removeEventListener('brandingUpdated', handleBrandingUpdate);
  }, []);


  const handleGoBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation('/');
    }
  };

  const handleGoHome = () => {
    setLocation('/');
  };

  const handleGoToInbox = () => {
    setLocation('/inbox');
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  const quickLinks = [
    {
      label: t('navigation.inbox', 'Inbox'),
      icon: MessageSquare,
      path: '/inbox',
      description: t('errors.404_quick_links.inbox_desc', 'Access your conversations and messages')
    },
    {
      label: t('navigation.dashboard', 'Dashboard'),
      icon: Home,
      path: '/',
      description: t('errors.404_quick_links.dashboard_desc', 'View your main dashboard')
    },
    {
      label: t('navigation.contacts', 'Contacts'),
      icon: Search,
      path: '/contacts',
      description: t('errors.404_quick_links.contacts_desc', 'Manage your contacts')
    }
  ];

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 px-4 py-8">
      <div className="w-full max-w-4xl mx-auto">
        <Card className="w-full shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
          <CardContent className="p-8 md:p-12">
            <div className="text-center space-y-8">
              <div className="relative">
                <h1
                  className="text-8xl md:text-9xl font-bold opacity-20 select-none"
                  style={{ color: branding.primaryColor }}
                >
                  404
                </h1>
                <div className="absolute inset-0 flex items-center justify-center">
                  <AlertCircle
                    className="h-16 w-16 md:h-20 md:w-20"
                    style={{ color: branding.primaryColor }}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <Badge
                  variant="outline"
                  className="text-sm px-4 py-2"
                  style={{
                    borderColor: branding.primaryColor,
                    color: branding.primaryColor
                  }}
                >
                  {t('errors.404_badge', 'Page Not Found')}
                </Badge>

                <h2 className="text-3xl md:text-4xl font-bold text-foreground">
                  {t('errors.404_title', 'Oops! Page Not Found')}
                </h2>

                <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                  {t('errors.404_description', 'The page you\'re looking for doesn\'t exist or has been moved. Don\'t worry, it happens to the best of us!')}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
                <Button
                  onClick={handleGoBack}
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto min-w-[140px]"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t('errors.404_go_back', 'Go Back')}
                </Button>

                <Button
                  onClick={handleGoHome}
                  variant="brand"
                  size="lg"
                  className="w-full sm:w-auto min-w-[140px]"
                >
                  <Home className="h-4 w-4 mr-2" />
                  {t('errors.404_go_home', 'Go Home')}
                </Button>

                <Button
                  onClick={handleRefresh}
                  variant="ghost"
                  size="lg"
                  className="w-full sm:w-auto min-w-[140px]"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t('errors.404_refresh', 'Refresh')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {user && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            {quickLinks.map((link, index) => {
              const IconComponent = link.icon;
              return (
                <Card
                  key={index}
                  className="group hover:shadow-lg transition-all duration-300 cursor-pointer border-0 bg-card/60 backdrop-blur-sm hover:bg-card/80"
                  onClick={() => setLocation(link.path)}
                >
                  <CardContent className="p-6 text-center space-y-3">
                    <div
                      className="w-12 h-12 rounded-full mx-auto flex items-center justify-center group-hover:scale-110 transition-transform duration-300"
                      style={{ backgroundColor: `${branding.primaryColor}20` }}
                    >
                      <IconComponent
                        className="h-6 w-6"
                        style={{ color: branding.primaryColor }}
                      />
                    </div>
                    <h3 className="font-semibold text-foreground">
                      {link.label}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {link.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Card className="mt-8 border-0 bg-card/60 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center space-x-2">
                <HelpCircle className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold text-foreground">
                  {t('errors.404_need_help', 'Need Help?')}
                </h3>
              </div>

              <p className="text-gray-600 dark:text-gray-300">
                {t('errors.404_help_description', 'If you believe this is an error or need assistance, please contact our support team.')}
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open('mailto:support@powerchatapp.net', '_blank')}
                  className="w-full sm:w-auto"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  {t('errors.404_contact_support', 'Contact Support')}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open('/help', '_blank')}
                  className="w-full sm:w-auto"
                >
                  <HelpCircle className="h-4 w-4 mr-2" />
                  {t('errors.404_help_center', 'Help Center')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('errors.404_footer', 'Powered by')} {branding.appName}
          </p>
        </div>
      </div>
    </div>
  );
}
