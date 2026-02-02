import React from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Home, ArrowLeft } from 'lucide-react';
import { useSubdomain, buildMainDomainUrl } from '@/contexts/subdomain-context';
import { useTranslation } from '@/hooks/use-translation';

interface SubdomainErrorProps {
  errorType?: 'not_found' | 'inactive' | 'invalid' | 'network';
  subdomain?: string;
  message?: string;
}

export default function SubdomainErrorPage({
  errorType = 'not_found',
  subdomain,
  message
}: SubdomainErrorProps) {
  const [, setLocation] = useLocation();
  const { subdomainInfo } = useSubdomain();
  const { t } = useTranslation();

  const getErrorContent = () => {
    switch (errorType) {
      case 'not_found':
        return {
          title: t('subdomain.company_not_found', 'Company Not Found'),
          description: t('subdomain.no_company_found', 'No company found for subdomain "{{subdomain}}"', { subdomain: subdomain || 'unknown' }),
          details: t('subdomain.company_not_exist', 'The company you\'re trying to access either doesn\'t exist or has been removed.'),
          icon: <AlertTriangle className="h-6 w-6 text-amber-500" />
        };
      case 'inactive':
        return {
          title: t('subdomain.account_inactive', 'Company Account Inactive'),
          description: t('subdomain.account_inactive_desc', 'This company account is currently inactive'),
          details: t('subdomain.account_disabled', 'The company account has been temporarily disabled. Please contact support for assistance.'),
          icon: <AlertTriangle className="h-6 w-6 text-red-500" />
        };
      case 'invalid':
        return {
          title: t('subdomain.invalid_subdomain', 'Invalid Subdomain'),
          description: t('subdomain.invalid_subdomain_desc', '"{{subdomain}}" is not a valid subdomain', { subdomain: subdomain || 'unknown' }),
          details: t('subdomain.subdomain_rules', 'Subdomains can only contain letters, numbers, and hyphens.'),
          icon: <AlertTriangle className="h-6 w-6 text-red-500" />
        };
      case 'network':
        return {
          title: t('subdomain.connection_error', 'Connection Error'),
          description: t('subdomain.unable_verify', 'Unable to verify company information'),
          details: message || t('subdomain.server_problem', 'There was a problem connecting to the server. Please try again.'),
          icon: <AlertTriangle className="h-6 w-6 text-orange-500" />
        };
      default:
        return {
          title: t('subdomain.access_error', 'Access Error'),
          description: t('subdomain.unable_access', 'Unable to access this company'),
          details: message || t('subdomain.unexpected_error', 'An unexpected error occurred.'),
          icon: <AlertTriangle className="h-6 w-6 text-red-500" />
        };
    }
  };

  const errorContent = getErrorContent();

  const handleGoToMainSite = () => {
    window.location.href = buildMainDomainUrl('/');
  };

  const handleGoBack = () => {
    window.history.back();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-lg">
          <CardHeader className="text-center pb-4">
            <div className="flex justify-center mb-4">
              {errorContent.icon}
            </div>
            <CardTitle className="text-xl font-semibold text-foreground">
              {errorContent.title}
            </CardTitle>
            <CardDescription className="text-gray-600">
              {errorContent.description}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <Alert>
              <AlertDescription className="text-sm">
                {errorContent.details}
              </AlertDescription>
            </Alert>

            {subdomain && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">
                  <strong>{t('subdomain.subdomain_label', 'Subdomain:')}</strong> {subdomain}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>{t('subdomain.url_label', 'URL:')}</strong> {window.location.href}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Button
                onClick={handleGoToMainSite}
                className="w-full"
                variant="default"
              >
                <Home className="mr-2 h-4 w-4" />
                {t('subdomain.go_to_main_site', 'Go to Main Site')}
              </Button>

              <Button
                onClick={handleGoBack}
                variant="outline"
                className="w-full"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('subdomain.go_back', 'Go Back')}
              </Button>
            </div>

            {errorType === 'not_found' && (
              <div className="mt-6 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500 text-center">
                  {t('subdomain.different_company_help', 'Looking for a different company? Make sure you have the correct subdomain URL.')}
                </p>
              </div>
            )}

            {errorType === 'inactive' && (
              <div className="mt-6 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500 text-center">
                  {t('subdomain.admin_contact_help', 'If you\'re a company administrator, please contact support to reactivate your account.')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
