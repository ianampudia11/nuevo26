import { storage } from './storage.js';

const englishTranslations = {

  'common.error': 'Error',
  'common.success': 'Success',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.close': 'Close',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.search': 'Search',
  'common.search_placeholder': 'Search...',
  'common.loading': 'Loading...',
  'common.something_went_wrong': 'Something went wrong',
  'common.please_wait': 'Please wait',
  'common.active': 'Active',
  'common.inactive': 'Inactive',
  

  'admin.affiliate.title': 'Affiliate Management',
  'admin.affiliate.description': 'Manage affiliate partners, track referrals, and process payouts',
  

  'admin.affiliate.create.button': 'Add Affiliate',
  'admin.affiliate.create.short': 'Add',
  'admin.affiliate.create.title': 'Add New Affiliate',
  'admin.affiliate.create.description': 'Create a new affiliate partner account',
  'admin.affiliate.create.submit': 'Create Affiliate',
  'admin.affiliate.create.success': 'Affiliate created successfully',
  
  'admin.affiliate.edit.title': 'Edit Affiliate',
  'admin.affiliate.edit.description': 'Update affiliate partner information',
  'admin.affiliate.edit.submit': 'Update Affiliate',
  'admin.affiliate.update.success': 'Affiliate updated successfully',
  
  'admin.affiliate.delete.success': 'Affiliate deleted successfully',
  'admin.affiliate.delete.confirm_title': 'Delete Affiliate',
  'admin.affiliate.delete.confirm_button': 'Delete',
  
  'admin.affiliate.approve.success': 'Affiliate approved successfully',
  'admin.affiliate.suspend.success': 'Affiliate suspended successfully',
  

  'admin.affiliate.export.title': 'Export Data',
  'admin.affiliate.export.button': 'Export Data',
  'admin.affiliate.export.short': 'Export',
  

  'admin.affiliate.dashboard.title': 'Dashboard',
  'admin.affiliate.dashboard.short': 'Dashboard',
  'admin.affiliate.analytics.title': 'Performance Analytics',
  

  'admin.affiliate.applications.title': 'Applications',
  'admin.affiliate.applications.short': 'Apps',
  'admin.affiliate.applications.empty.title': 'No Applications Yet',
  'admin.affiliate.applications.empty.description': 'Affiliate applications will appear here when people apply to become partners.',
  'admin.affiliate.applications.preview_form': 'Preview Application Form',
  

  'admin.affiliate.affiliates.title': 'Affiliates',
  'admin.affiliate.affiliates.short': 'Affiliates',
  'admin.affiliate.affiliates.search_placeholder': 'Search affiliates...',
  'admin.affiliate.affiliates.filter.all_statuses': 'All Statuses',
  'admin.affiliate.affiliates.table.code': 'Code',
  'admin.affiliate.affiliates.table.name': 'Name',
  'admin.affiliate.affiliates.table.email': 'Email',
  'admin.affiliate.affiliates.table.status': 'Status',
  'admin.affiliate.affiliates.table.referrals': 'Referrals',
  'admin.affiliate.affiliates.table.earnings': 'Earnings',
  'admin.affiliate.affiliates.table.commission': 'Commission',
  'admin.affiliate.affiliates.table.referral_url': 'Referral URL',
  'admin.affiliate.affiliates.table.joined': 'Joined',
  'admin.affiliate.affiliates.table.actions': 'Actions',
  

  'admin.affiliate.status.active': 'Active',
  'admin.affiliate.status.pending': 'Pending',
  'admin.affiliate.status.suspended': 'Suspended',
  'admin.affiliate.status.rejected': 'Rejected',
  

  'admin.affiliate.charts.performance_trends': 'Performance Trends',
  'admin.affiliate.charts.status_distribution': 'Affiliate Status',
  'admin.affiliate.charts.top_performers': 'Top Performers',
  'admin.affiliate.charts.conversion_funnel': 'Conversion Funnel',
  

  'admin.affiliate.metrics.total_affiliates': 'Total Affiliates',
  'admin.affiliate.metrics.active': 'Active',
  'admin.affiliate.metrics.total_referrals': 'Total Referrals',
  'admin.affiliate.metrics.conversion_rate': 'Conversion Rate',
  'admin.affiliate.metrics.total_commission': 'Total Commission',
  'admin.affiliate.metrics.from_conversions': 'From {{count}} conversions',
  'admin.affiliate.metrics.conversions': 'conversions',
  'admin.affiliate.metrics.avg_commission': 'Avg Commission',
  'admin.affiliate.metrics.per_affiliate': 'per affiliate',
  'admin.affiliate.metrics.pending_payouts': 'Pending Payouts',
  'admin.affiliate.metrics.pending_requests': 'pending requests',
  

  'admin.affiliate.pagination.showing': 'Showing',
  'admin.affiliate.pagination.to': 'to',
  'admin.affiliate.pagination.of': 'of',
  'admin.affiliate.pagination.records': 'records',
  'admin.affiliate.pagination.previous': 'Previous',
  'admin.affiliate.pagination.page': 'Page',
  'admin.affiliate.pagination.next': 'Next',
  

  'admin.affiliate.referrals.title': 'Referrals',
  'admin.affiliate.referrals.short': 'Referrals',
  'admin.affiliate.referrals.table.code': 'Referral Code',
  'admin.affiliate.referrals.table.affiliate': 'Affiliate',
  'admin.affiliate.referrals.table.referred_email': 'Referred Email',
  'admin.affiliate.referrals.table.status': 'Status',
  'admin.affiliate.referrals.table.value': 'Value',
  'admin.affiliate.referrals.table.commission': 'Commission',
  'admin.affiliate.referrals.table.date': 'Date',
  'admin.affiliate.referrals.status.converted': 'Converted',
  'admin.affiliate.referrals.status.pending': 'Pending',
  'admin.affiliate.referrals.status.expired': 'Expired',
  

  'admin.affiliate.payouts.title': 'Payouts',
  'admin.affiliate.payouts.short': 'Payouts',
  'admin.affiliate.payouts.table.affiliate': 'Affiliate',
  'admin.affiliate.payouts.table.amount': 'Amount',
  'admin.affiliate.payouts.table.status': 'Status',
  'admin.affiliate.payouts.table.method': 'Method',
  'admin.affiliate.payouts.table.period': 'Period',
  'admin.affiliate.payouts.table.processed': 'Processed',
  'admin.affiliate.payouts.status.completed': 'Completed',
  'admin.affiliate.payouts.status.processing': 'Processing',
  'admin.affiliate.payouts.status.failed': 'Failed',
  

  'admin.affiliate.view.title': 'Affiliate Details',
  'admin.affiliate.view.basic_info': 'Basic Information',
  'admin.affiliate.view.performance': 'Performance',
  'admin.affiliate.view.commission_settings': 'Commission Settings',
  'admin.affiliate.view.referral_url': 'Referral URL',
  

  'admin.affiliate.form.name': 'Full Name',
  'admin.affiliate.form.email': 'Email Address',
  'admin.affiliate.form.phone': 'Phone Number',
  'admin.affiliate.form.website': 'Website',
  'admin.affiliate.form.business_name': 'Business Name',
  'admin.affiliate.form.commission_rate': 'Commission Rate',
  'admin.affiliate.form.commission_type': 'Commission Type',
  'admin.affiliate.form.notes': 'Notes',
  

  'admin.affiliate.commission_type.percentage': 'Percentage',
  'admin.affiliate.commission_type.fixed': 'Fixed Amount',
  'admin.affiliate.commission_type.tiered': 'Tiered',
};

async function initializeTranslations() {
  try {

    let englishLanguage = await storage.getLanguageByCode('en');

    if (!englishLanguage) {
      englishLanguage = await storage.createLanguage({
        code: 'en',
        name: 'English',
        nativeName: 'English',
        flagIcon: '🇺🇸',
        isActive: true,
        isDefault: true,
        direction: 'ltr'
      });
    }

    let defaultNamespace = await storage.getNamespaceByName('default');

    if (!defaultNamespace) {
      defaultNamespace = await storage.createNamespace({
        name: 'default',
        description: 'Default namespace for application translations'
      });
    }


    for (const [key, value] of Object.entries(englishTranslations)) {
      try {
        const existingKey = await storage.getKeyByNameAndKey(defaultNamespace.id, key);

        let translationKey;
        if (!existingKey) {
          translationKey = await storage.createKey({
            namespaceId: defaultNamespace.id,
            key: key,
            description: `Translation key for ${key}`
          });
        } else {
          translationKey = existingKey;
        }

        const existingTranslation = await storage.getTranslationByKeyAndLanguage(
          translationKey.id,
          englishLanguage.id
        );

        if (!existingTranslation) {
          await storage.createTranslation({
            keyId: translationKey.id,
            languageId: englishLanguage.id,
            value: value
          });
        } else {
        }
      } catch (error) {
        console.error(`Error adding translation for key ${key}:`, error);
      }
    }

  } catch (error) {
    console.error('Error initializing translations:', error);
  }
}

initializeTranslations();
