import { ArrowLeft, ExternalLink, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/hooks/use-translation';
import { useAuth } from '@/hooks/use-auth';

interface CompanyPage {
  id: number;
  companyId: number;
  title: string;
  slug: string;
  content: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  isPublished: boolean;
  isFeatured: boolean;
  template: string;
  customCss?: string;
  customJs?: string;
  authorId?: number;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface PagePreviewProps {
  page: CompanyPage;
  onClose: () => void;
}

export function PagePreview({ page, onClose }: PagePreviewProps) {
  const { t } = useTranslation();
  const { company } = useAuth();

  const getPublicUrl = () => {

    if (typeof window === 'undefined') {
      return '';
    }


    const subdomain = (company as any)?.subdomain || company?.slug;
    if (!subdomain) {
      return '';
    }

    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const port = window.location.port;

    if (hostname === 'localhost') {

      return `${protocol}//${hostname}${port ? `:${port}` : ''}/${page.slug}`;
    } else {

      const portSuffix = port && port !== '80' && port !== '443' ? `:${port}` : '';
      return `${protocol}//${subdomain}.${hostname}${portSuffix}/${page.slug}`;
    }
  };

  const getTemplateStyles = () => {
    switch (page.template) {
      case 'legal':
        return {
          container: 'max-w-4xl mx-auto px-6 py-12 bg-background',
          title: 'text-4xl font-bold text-foreground mb-8 text-center',
          content: 'prose prose-lg max-w-none text-foreground leading-relaxed'
        };
      case 'marketing':
        return {
          container: 'max-w-6xl mx-auto px-6 py-16 bg-gradient-to-br from-blue-50 to-indigo-100',
          title: 'text-5xl font-extrabold text-gray-900 mb-12 text-center bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent',
          content: 'prose prose-xl max-w-none text-gray-800'
        };
      case 'minimal':
        return {
          container: 'max-w-2xl mx-auto px-4 py-8 bg-white',
          title: 'text-2xl font-semibold text-gray-800 mb-6',
          content: 'prose prose-sm max-w-none text-gray-600'
        };
      case 'custom':
        return {
          container: 'w-full',
          title: '',
          content: 'w-full'
        };
      default:
        return {
          container: 'max-w-4xl mx-auto px-6 py-10 bg-white',
          title: 'text-3xl font-bold text-gray-900 mb-6',
          content: 'prose max-w-none text-gray-700'
        };
    }
  };

  const templateStyles = getTemplateStyles();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={onClose}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('common.back', 'Back')}
          </Button>
          <div>
            <h1 className="text-2xl">{t('pages.preview', 'Page Preview')}</h1>
            <p className="text-muted-foreground mt-1">
              {t('pages.preview_description', 'Preview how your page will appear to visitors')}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {page.isPublished && getPublicUrl() && (
            <Button
              variant="outline"
              onClick={() => window.open(getPublicUrl(), '_blank')}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              {t('pages.view_live', 'View Live')}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <Globe className="w-5 h-5" />
                <span>{page.title}</span>
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                /{page.slug}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              {page.isPublished ? (
                <Badge variant="default" className="bg-green-100 text-green-800">
                  Published
                </Badge>
              ) : (
                <Badge variant="secondary">
                  Draft
                </Badge>
              )}
              {page.isFeatured && (
                <Badge variant="outline" className="bg-yellow-50 text-yellow-800 border-yellow-200">
                  Featured
                </Badge>
              )}
              <Badge variant="outline">
                {page.template.charAt(0).toUpperCase() + page.template.slice(1)} Template
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-t">
            {/* SEO Preview */}
            {(page.metaTitle || page.metaDescription) && (
              <div className="p-6 bg-gray-50 border-b">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  {t('pages.seo_preview', 'SEO Preview')}
                </h3>
                <div className="bg-white p-4 rounded border">
                  <div className="text-blue-600 text-lg hover:underline cursor-pointer">
                    {page.metaTitle || page.title}
                  </div>
                  {getPublicUrl() && (
                    <div className="text-green-700 text-sm">
                      {getPublicUrl()}
                    </div>
                  )}
                  {page.metaDescription && (
                    <div className="text-gray-600 text-sm mt-1">
                      {page.metaDescription}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Page Content Preview */}
            <div className="min-h-96">
              <style>
                {page.customCss && `
                  .page-preview-content {
                    ${page.customCss}
                  }
                `}
              </style>
              
              <div className={`page-preview-content ${templateStyles.container}`}>
                {page.template !== 'custom' && (
                  <h1 className={templateStyles.title}>
                    {page.title}
                  </h1>
                )}
                
                <div 
                  className={templateStyles.content}
                  dangerouslySetInnerHTML={{ 
                    __html: page.content || '<p>No content available</p>' 
                  }}
                />
              </div>

              {page.customJs && (
                <script
                  dangerouslySetInnerHTML={{
                    __html: page.customJs
                  }}
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Page Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('pages.page_info', 'Page Information')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">{t('pages.template', 'Template')}:</span>
              <span className="font-medium">{page.template.charAt(0).toUpperCase() + page.template.slice(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t('pages.status', 'Status')}:</span>
              <span className="font-medium">
                {page.isPublished ? t('pages.published', 'Published') : t('pages.draft', 'Draft')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t('pages.featured', 'Featured')}:</span>
              <span className="font-medium">
                {page.isFeatured ? t('common.yes', 'Yes') : t('common.no', 'No')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t('pages.created', 'Created')}:</span>
              <span className="font-medium">{new Date(page.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t('pages.updated', 'Updated')}:</span>
              <span className="font-medium">{new Date(page.updatedAt).toLocaleDateString()}</span>
            </div>
            {page.publishedAt && (
              <div className="flex justify-between">
                <span className="text-gray-600">{t('pages.published_at', 'Published At')}:</span>
                <span className="font-medium">{new Date(page.publishedAt).toLocaleDateString()}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('pages.seo_info', 'SEO Information')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <span className="text-gray-600 block">{t('pages.meta_title', 'Meta Title')}:</span>
              <span className="font-medium">{page.metaTitle || t('common.not_set', 'Not set')}</span>
            </div>
            <div>
              <span className="text-gray-600 block">{t('pages.meta_description', 'Meta Description')}:</span>
              <span className="font-medium text-sm">
                {page.metaDescription || t('common.not_set', 'Not set')}
              </span>
            </div>
            <div>
              <span className="text-gray-600 block">{t('pages.meta_keywords', 'Meta Keywords')}:</span>
              <span className="font-medium text-sm">
                {page.metaKeywords || t('common.not_set', 'Not set')}
              </span>
            </div>
            {page.isPublished && getPublicUrl() && (
              <div>
                <span className="text-gray-600 block">{t('pages.public_url', 'Public URL')}:</span>
                <a
                  href={getPublicUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline text-sm break-all"
                >
                  {getPublicUrl()}
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
