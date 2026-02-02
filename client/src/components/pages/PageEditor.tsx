import { useState, useEffect } from 'react';
import { ArrowLeft, Save, Eye, Globe, Settings, Code, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from '@/hooks/use-translation';
import { WysiwygEditor } from '../ui/wysiwyg-editor';

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

interface PageEditorProps {
  page?: CompanyPage | null;
  onSave: (pageData: Partial<CompanyPage>) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const PAGE_TEMPLATES = [
  { value: 'privacy-policy', label: 'Privacy Policy' },
  { value: 'terms-of-service', label: 'Terms of Service' },
  { value: 'about-us', label: 'About Us' }
];

const TEMPLATE_CONTENT = {
  'privacy-policy': {
    title: 'Privacy Policy',
    content: `<div class="container" style="max-width: 800px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; line-height: 1.6;">
    <h1 style="color: #333; border-bottom: 2px solid #007cba; padding-bottom: 10px;">Privacy Policy</h1>
    <p>Effective Date: ${new Date().toLocaleDateString()}</p>

    <p>This Privacy Policy describes how we collect, use, and share information when you interact with our WhatsApp Business API services.</p>

    <h2>1. Information We Collect</h2>
    <p>We may collect the following types of information when you use our services:</p>
    <ul>
      <li>Business information (company name, business address, business phone number)</li>
      <li>WhatsApp Business Account details</li>
      <li>Message content and metadata</li>
      <li>Customer contact details (only when consent is given by the customer)</li>
    </ul>

    <h2>2. How We Use Your Information</h2>
    <p>We use the collected information to:</p>
    <ul>
      <li>Provide, operate, and maintain our WhatsApp Business API services</li>
      <li>Support customer communication via WhatsApp</li>
      <li>Ensure compliance with WhatsApp policies and applicable laws</li>
      <li>Improve our services and user experience</li>
    </ul>

    <h2>3. Data Sharing</h2>
    <p>We do not sell or rent your data. We may share your data with:</p>
    <ul>
      <li>WhatsApp/Facebook (Meta) for service provisioning and compliance</li>
      <li>Our infrastructure providers (e.g., cloud hosting, analytics) under strict confidentiality agreements</li>
      <li>Authorities, when legally required to do so</li>
    </ul>

    <h2>4. Data Retention</h2>
    <p>We retain your data only for as long as necessary to fulfill the purposes outlined in this policy or as required by law.</p>

    <h2>5. Security</h2>
    <p>We implement appropriate technical and organizational measures to protect your data against unauthorized access, alteration, disclosure, or destruction.</p>

    <h2>6. Your Rights</h2>
    <p>You have the right to access, correct, or delete your personal data. To make a request, please contact us at <a href="mailto:support@example.com">support@example.com</a>.</p>

    <h2>7. Changes to This Policy</h2>
    <p>We may update this Privacy Policy from time to time. We encourage you to review this page periodically for any changes.</p>

    <h2>8. Contact</h2>
    <p>If you have any questions or concerns about this policy, you can contact us at <a href="mailto:support@example.com">support@example.com</a>.</p>
  </div>`,
    metaTitle: 'Privacy Policy - Your Company Name',
    metaDescription: 'Learn how we collect, use, and protect your personal information when you use our WhatsApp Business API services.',
    metaKeywords: 'privacy policy, data protection, WhatsApp Business, personal information, data security'
  },
  'terms-of-service': {
    title: 'Terms of Service',
    content: `<div class="container" style="max-width: 800px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; line-height: 1.6;">
    <h1 style="color: #333; border-bottom: 2px solid #007cba; padding-bottom: 10px;">Terms of Service</h1>
    <p>Effective Date: ${new Date().toLocaleDateString()}</p>

    <p>Welcome to our WhatsApp Business API service. By using our services, you agree to these terms.</p>

    <h2>1. Acceptance of Terms</h2>
    <p>By accessing and using our WhatsApp Business API services, you accept and agree to be bound by the terms and provision of this agreement.</p>

    <h2>2. Service Description</h2>
    <p>We provide WhatsApp Business API integration services that enable businesses to communicate with their customers through WhatsApp.</p>

    <h2>3. User Responsibilities</h2>
    <ul>
      <li>Comply with WhatsApp's Business Policy and Commerce Policy</li>
      <li>Obtain proper consent from customers before messaging</li>
      <li>Use the service only for legitimate business purposes</li>
      <li>Maintain the security of your account credentials</li>
    </ul>

    <h2>4. Prohibited Uses</h2>
    <p>You may not use our service to:</p>
    <ul>
      <li>Send spam or unsolicited messages</li>
      <li>Violate any applicable laws or regulations</li>
      <li>Infringe on intellectual property rights</li>
      <li>Transmit harmful or malicious content</li>
    </ul>

    <h2>5. Service Availability</h2>
    <p>We strive to maintain high service availability but do not guarantee uninterrupted service. Maintenance and updates may cause temporary disruptions.</p>

    <h2>6. Limitation of Liability</h2>
    <p>Our liability is limited to the maximum extent permitted by law. We are not responsible for indirect, incidental, or consequential damages.</p>

    <h2>7. Termination</h2>
    <p>We reserve the right to terminate or suspend access to our services for violations of these terms or for any other reason at our discretion.</p>

    <h2>8. Changes to Terms</h2>
    <p>We may modify these terms at any time. Continued use of the service constitutes acceptance of the modified terms.</p>

    <h2>9. Contact Information</h2>
    <p>For questions about these terms, contact us at <a href="mailto:legal@example.com">legal@example.com</a>.</p>
  </div>`,
    metaTitle: 'Terms of Service - Your Company Name',
    metaDescription: 'Read our terms of service for WhatsApp Business API services, including user responsibilities and service guidelines.',
    metaKeywords: 'terms of service, WhatsApp Business, API terms, service agreement, user agreement'
  },
  'about-us': {
    title: 'About Us',
    content: `<div class="container" style="max-width: 800px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; line-height: 1.6;">
    <h1 style="color: #333; border-bottom: 2px solid #007cba; padding-bottom: 10px;">About Us</h1>

    <p>Welcome to [Your Company Name], your trusted partner for WhatsApp Business API solutions.</p>

    <h2>Our Mission</h2>
    <p>We empower businesses to connect with their customers through seamless WhatsApp communication, enabling better customer relationships and improved business outcomes.</p>

    <h2>What We Do</h2>
    <p>We specialize in providing comprehensive WhatsApp Business API services, including:</p>
    <ul>
      <li>WhatsApp Business API integration and setup</li>
      <li>Message automation and chatbot development</li>
      <li>Customer support solutions</li>
      <li>Marketing campaign management</li>
      <li>Analytics and reporting tools</li>
    </ul>

    <h2>Why Choose Us</h2>
    <ul>
      <li><strong>Expertise:</strong> Years of experience in WhatsApp Business solutions</li>
      <li><strong>Reliability:</strong> 99.9% uptime and robust infrastructure</li>
      <li><strong>Support:</strong> 24/7 customer support and technical assistance</li>
      <li><strong>Compliance:</strong> Full compliance with WhatsApp policies and regulations</li>
      <li><strong>Innovation:</strong> Cutting-edge features and continuous improvements</li>
    </ul>

    <h2>Our Team</h2>
    <p>Our team consists of experienced developers, customer success managers, and WhatsApp specialists dedicated to helping your business succeed.</p>

    <h2>Get Started</h2>
    <p>Ready to transform your customer communication? <a href="mailto:sales@example.com">Contact us today</a> to learn how we can help your business grow with WhatsApp.</p>

    <h2>Contact Information</h2>
    <p>
      <strong>Email:</strong> <a href="mailto:info@example.com">info@example.com</a><br>
      <strong>Phone:</strong> +1 (555) 123-4567<br>
      <strong>Address:</strong> 123 Business Street, City, State 12345
    </p>
  </div>`,
    metaTitle: 'About Us - Your Company Name',
    metaDescription: 'Learn about our company and how we help businesses succeed with WhatsApp Business API solutions and customer communication tools.',
    metaKeywords: 'about us, WhatsApp Business, API solutions, customer communication, business messaging'
  }
};

export function PageEditor({ page, onSave, onCancel, isLoading = false }: PageEditorProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    content: '',
    metaTitle: '',
    metaDescription: '',
    metaKeywords: '',
    isPublished: false,
    isFeatured: false,
    template: 'default',
    customCss: '',
    customJs: ''
  });

  const [activeTab, setActiveTab] = useState('content');
  const [showTemplateConfirm, setShowTemplateConfirm] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);

  useEffect(() => {
    if (page) {
      setFormData({
        title: page.title || '',
        slug: page.slug || '',
        content: page.content || '',
        metaTitle: page.metaTitle || '',
        metaDescription: page.metaDescription || '',
        metaKeywords: page.metaKeywords || '',
        isPublished: page.isPublished || false,
        isFeatured: page.isFeatured || false,
        template: page.template || 'default',
        customCss: page.customCss || '',
        customJs: page.customJs || ''
      });
    }
  }, [page]);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));


    if (field === 'title' && typeof value === 'string') {
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
      setFormData(prev => ({
        ...prev,
        slug: slug
      }));
    }


    if (field === 'template' && typeof value === 'string') {
      const templateData = TEMPLATE_CONTENT[value as keyof typeof TEMPLATE_CONTENT];
      if (templateData) {

        const hasContent = formData.title.trim() || formData.content.trim();
        if (hasContent && !page) {

          setPendingTemplate(value);
          setShowTemplateConfirm(true);
          return; // Don't update template value yet
        } else {

          loadTemplate(value);
        }
      }
    }
  };

  const handleSave = () => {
    onSave(formData);
  };

  const loadTemplate = (templateKey: string) => {
    const templateData = TEMPLATE_CONTENT[templateKey as keyof typeof TEMPLATE_CONTENT];
    if (templateData) {
      setFormData(prev => ({
        ...prev,
        title: templateData.title,
        content: templateData.content,
        metaTitle: templateData.metaTitle,
        metaDescription: templateData.metaDescription,
        metaKeywords: templateData.metaKeywords,
        slug: templateData.title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim()
      }));
    }
  };

  const handleTemplateConfirm = () => {
    if (pendingTemplate) {
      loadTemplate(pendingTemplate);
      setPendingTemplate(null);
    }
    setShowTemplateConfirm(false);
  };

  const handleTemplateCancel = () => {

    setFormData(prev => ({
      ...prev,
      template: prev.template
    }));
    setPendingTemplate(null);
    setShowTemplateConfirm(false);
  };

  const isFormValid = formData.title.trim() && formData.slug.trim() && formData.content.trim();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={onCancel}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('common.back', 'Back')}
          </Button>
          <div>
            <h1 className="text-2xl">
              {page ? t('pages.edit_page', 'Edit Page') : t('pages.create_page', 'Create Page')}
            </h1>
            <p className="text-muted-foreground mt-1">
              {page ? t('pages.edit_description', 'Update your page content and settings') : t('pages.create_description', 'Create a new public-facing page')}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            onClick={() => setActiveTab('preview')}
          >
            <Eye className="w-4 h-4 mr-2" />
            {t('pages.preview', 'Preview')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isFormValid || isLoading}
          >
            <Save className="w-4 h-4 mr-2" />
            {isLoading ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="content">
            <Globe className="w-4 h-4 mr-2" />
            {t('pages.content', 'Content')}
          </TabsTrigger>
          <TabsTrigger value="seo">
            <Settings className="w-4 h-4 mr-2" />
            {t('pages.seo', 'SEO')}
          </TabsTrigger>
          <TabsTrigger value="advanced">
            <Code className="w-4 h-4 mr-2" />
            {t('pages.advanced', 'Advanced')}
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye className="w-4 h-4 mr-2" />
            {t('pages.preview', 'Preview')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('pages.basic_info', 'Basic Information')}</CardTitle>
                  <CardDescription>
                    {t('pages.basic_info_description', 'Configure the basic details of your page')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="title">{t('pages.title', 'Page Title')}</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => handleInputChange('title', e.target.value)}
                      placeholder={t('pages.title_placeholder', 'Enter page title')}
                    />
                  </div>
                  <div>
                    <Label htmlFor="slug">{t('pages.slug', 'URL Slug')}</Label>
                    <Input
                      id="slug"
                      value={formData.slug}
                      onChange={(e) => handleInputChange('slug', e.target.value)}
                      placeholder={t('pages.slug_placeholder', 'page-url-slug')}
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      {t('pages.slug_help', 'This will be the URL path for your page')}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('pages.content', 'Page Content')}</CardTitle>
                  <CardDescription>
                    {t('pages.content_description', 'Create your page content using the rich text editor')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <WysiwygEditor
                    value={formData.content}
                    onChange={(value: string) => handleInputChange('content', value)}
                    placeholder={t('pages.content_placeholder', 'Start writing your page content...')}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('pages.settings', 'Page Settings')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="template">{t('pages.template', 'Template')}</Label>
                    <Select
                      value={formData.template}
                      onValueChange={(value) => handleInputChange('template', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_TEMPLATES.map((template) => (
                          <SelectItem key={template.value} value={template.value}>
                            {template.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="published"
                      checked={formData.isPublished}
                      onCheckedChange={(checked) => handleInputChange('isPublished', checked)}
                    />
                    <Label htmlFor="published">{t('pages.published', 'Published')}</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="featured"
                      checked={formData.isFeatured}
                      onCheckedChange={(checked) => handleInputChange('isFeatured', checked)}
                    />
                    <Label htmlFor="featured">{t('pages.featured', 'Featured')}</Label>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="seo" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('pages.seo_settings', 'SEO Settings')}</CardTitle>
              <CardDescription>
                {t('pages.seo_description', 'Optimize your page for search engines')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="metaTitle">{t('pages.meta_title', 'Meta Title')}</Label>
                <Input
                  id="metaTitle"
                  value={formData.metaTitle}
                  onChange={(e) => handleInputChange('metaTitle', e.target.value)}
                  placeholder={t('pages.meta_title_placeholder', 'SEO title for search engines')}
                />
                <p className="text-sm text-gray-500 mt-1">
                  {t('pages.meta_title_help', 'Recommended length: 50-60 characters')}
                </p>
              </div>
              <div>
                <Label htmlFor="metaDescription">{t('pages.meta_description', 'Meta Description')}</Label>
                <Textarea
                  id="metaDescription"
                  value={formData.metaDescription}
                  onChange={(e) => handleInputChange('metaDescription', e.target.value)}
                  placeholder={t('pages.meta_description_placeholder', 'Brief description for search results')}
                  rows={3}
                />
                <p className="text-sm text-gray-500 mt-1">
                  {t('pages.meta_description_help', 'Recommended length: 150-160 characters')}
                </p>
              </div>
              <div>
                <Label htmlFor="metaKeywords">{t('pages.meta_keywords', 'Meta Keywords')}</Label>
                <Input
                  id="metaKeywords"
                  value={formData.metaKeywords}
                  onChange={(e) => handleInputChange('metaKeywords', e.target.value)}
                  placeholder={t('pages.meta_keywords_placeholder', 'keyword1, keyword2, keyword3')}
                />
                <p className="text-sm text-gray-500 mt-1">
                  {t('pages.meta_keywords_help', 'Separate keywords with commas')}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('pages.advanced_settings', 'Advanced Settings')}</CardTitle>
              <CardDescription>
                {t('pages.advanced_description', 'Custom CSS and JavaScript for advanced customization')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="customCss">{t('pages.custom_css', 'Custom CSS')}</Label>
                <Textarea
                  id="customCss"
                  value={formData.customCss}
                  onChange={(e) => handleInputChange('customCss', e.target.value)}
                  placeholder={t('pages.custom_css_placeholder', '/* Add your custom CSS here */')}
                  rows={8}
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <Label htmlFor="customJs">{t('pages.custom_js', 'Custom JavaScript')}</Label>
                <Textarea
                  id="customJs"
                  value={formData.customJs}
                  onChange={(e) => handleInputChange('customJs', e.target.value)}
                  placeholder={t('pages.custom_js_placeholder', '// Add your custom JavaScript here')}
                  rows={8}
                  className="font-mono text-sm"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('pages.preview', 'Page Preview')}</CardTitle>
              <CardDescription>
                {t('pages.preview_description', 'Preview how your page will look to visitors')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg p-6 bg-card min-h-96">
                <h1 className="text-3xl font-bold mb-4">{formData.title || t('pages.untitled', 'Untitled Page')}</h1>
                <div 
                  className="prose max-w-none"
                  dangerouslySetInnerHTML={{ __html: formData.content || '<p>No content yet...</p>' }}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Template Confirmation Dialog */}
      <Dialog open={showTemplateConfirm} onOpenChange={setShowTemplateConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Load Template
            </DialogTitle>
            <DialogDescription>
              You have existing content in this page. Loading a template will replace your current title, content, and SEO settings. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleTemplateCancel}>
              Cancel
            </Button>
            <Button onClick={handleTemplateConfirm}>
              Load Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
