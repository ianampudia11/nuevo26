import {
  users, type User, type InsertUser,
  contacts, type Contact, type InsertContact,
  contactDocuments, type ContactDocument, type InsertContactDocument,
  contactAppointments, type ContactAppointment, type InsertContactAppointment,
  contactTasks, type ContactTask, type InsertContactTask,
  taskCategories, type TaskCategory, type InsertTaskCategory,
  contactAuditLogs, type ContactAuditLog, type InsertContactAuditLog,
  conversations, type Conversation, type InsertConversation,
  groupParticipants, type GroupParticipant, type InsertGroupParticipant,
  messages, type Message, type InsertMessage,
  notes, type Note, type InsertNote,
  channelConnections, type ChannelConnection, type InsertChannelConnection,
  historySyncBatches, type HistorySyncBatch, type InsertHistorySyncBatch,
  partnerConfigurations, type PartnerConfiguration, type InsertPartnerConfiguration,
  metaWhatsappClients, type MetaWhatsappClient, type InsertMetaWhatsappClient,
  metaWhatsappPhoneNumbers, type MetaWhatsappPhoneNumber, type InsertMetaWhatsappPhoneNumber,
  apiKeys, type ApiKey, type InsertApiKey,
  apiUsage, type ApiUsage, type InsertApiUsage,
  apiRateLimits, type ApiRateLimit, type InsertApiRateLimit,
  // apiWebhooks, type ApiWebhook, type InsertApiWebhook, // REMOVED: table doesn't exist
  flows, type Flow, type InsertFlow,
  flowAssignments, type FlowAssignment, type InsertFlowAssignment,
  flowExecutions, flowStepExecutions,
  flowSessions, flowSessionVariables, flowSessionCursors,
  followUpSchedules, followUpTemplates, followUpExecutionLog,
  googleCalendarTokens, zohoCalendarTokens, calendlyCalendarTokens,
  // calendarBookings, type CalendarBooking, type InsertCalendarBooking, // REMOVED: table doesn't exist
  teamInvitations, type TeamInvitation, type InsertTeamInvitation,
  deals, type Deal, type InsertDeal,
  dealActivities, type DealActivity, type InsertDealActivity,
  // pipelines, type Pipeline, type InsertPipeline, // REMOVED: table doesn't exist
  pipelineStages, type PipelineStage, type InsertPipelineStage,
  // pipelineStageReverts, type PipelineStageRevert, type InsertPipelineStageRevert, // REMOVED: table doesn't exist
  // pipelineStageRevertLogs, type PipelineStageRevertLog, type InsertPipelineStageRevertLog, // REMOVED: table doesn't exist
  companies, type Company, type InsertCompany,
  rolePermissions,
  companyPages, type CompanyPage, type InsertCompanyPage,
  plans, type Plan, type InsertPlan,
  planAiProviderConfigs, type PlanAiProviderConfig, type InsertPlanAiProviderConfig,
  planAiUsageTracking, type PlanAiUsageTracking, type InsertPlanAiUsageTracking,
  planAiBillingEvents, type PlanAiBillingEvent, type InsertPlanAiBillingEvent,
  appSettings,
  companySettings,
  // companyCustomFields, // REMOVED: table doesn't exist
  paymentTransactions,
  languages,
  translationNamespaces,
  translationKeys,
  translations,
  whatsappProxyServers,
  systemUpdates, type SystemUpdate, type InsertSystemUpdate,
  scheduledMessages, type ScheduledMessage, type InsertScheduledMessage,

  userSocialAccounts, type UserSocialAccount, type InsertUserSocialAccount, type SocialProvider,
  emailConfigs, type EmailConfig, type InsertEmailConfig,
  emailAttachments, type EmailAttachment, type InsertEmailAttachment,
  emailTemplates, type EmailTemplate, type InsertEmailTemplate,
  emailSignatures, type EmailSignature, type InsertEmailSignature,

  affiliateApplications,
  affiliates,
  affiliateCommissionStructures,
  affiliateReferrals,
  affiliatePayouts,
  affiliateAnalytics,
  affiliateClicks,
  affiliateRelationships,
  affiliateEarningsBalance,
  affiliateEarningsTransactions,
  couponCodes,
  couponUsage,

  websites, type Website, type InsertWebsite,
  websiteAssets, type WebsiteAsset, type InsertWebsiteAsset,

  databaseBackups, type DatabaseBackup, type InsertDatabaseBackup,
  databaseBackupLogs, type DatabaseBackupLog, type InsertDatabaseBackupLog,

  type DealStatus, type DealPriority,
  type CompanySetting
} from "@shared/schema";

// Import stub definitions for missing tables
import {
  apiWebhooks, type ApiWebhook, type InsertApiWebhook,
  calendarBookings, type CalendarBooking, type InsertCalendarBooking,
  pipelines, type Pipeline, type InsertPipeline,
  pipelineStageReverts, type PipelineStageRevert, type InsertPipelineStageRevert,
  pipelineStageRevertLogs, type PipelineStageRevertLog, type InsertPipelineStageRevertLog,
  companyCustomFields
} from "@shared/schema-stubs";

import session from "express-session";
import { eq, and, desc, asc, or, sql, count, isNull, isNotNull, gt, gte, lt, lte, inArray, ne, not, SQL } from "drizzle-orm";
import { filterGroupChatsFromConversations, isWhatsAppGroupChatId } from "./utils/whatsapp-group-filter";
import { validatePhoneNumber as validatePhoneNumberUtil } from "./utils/phone-validation";


export interface AppSetting {
  id: number;
  key: string;
  value: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentTransaction {
  id: number;
  companyId: number | null;
  planId: number | null;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded' | 'cancelled';
  paymentMethod: 'stripe' | 'bank_transfer' | 'other' | 'mercadopago' | 'paypal' | 'moyasar' | 'mpesa' | 'paystack';
  paymentIntentId?: string | null;
  externalTransactionId?: string | null;
  receiptUrl?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertPaymentTransaction {
  companyId: number | null;
  planId?: number | null;
  amount: string;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded' | 'cancelled';
  paymentMethod: 'stripe' | 'bank_transfer' | 'other' | 'mercadopago' | 'paypal' | 'moyasar' | 'mpesa' | 'paystack';
  paymentIntentId?: string | null;
  externalTransactionId?: string | null;
  receiptUrl?: string | null;
  metadata?: Record<string, unknown>;
}

export interface Language {
  id: number;
  code: string;
  name: string;
  nativeName: string;
  flagIcon?: string | null;
  isActive: boolean | null;
  isDefault: boolean | null;
  direction: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface InsertLanguage {
  code: string;
  name: string;
  nativeName: string;
  flagIcon?: string;
  isActive?: boolean;
  isDefault?: boolean;
  direction?: string;
}

export interface TranslationNamespace {
  id: number;
  name: string;
  description?: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface InsertTranslationNamespace {
  name: string;
  description?: string | null;
}

export interface TranslationKey {
  id: number;
  namespaceId: number | null;
  key: string;
  description?: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface InsertTranslationKey {
  namespaceId: number | null;
  key: string;
  description?: string | null;
}

export interface Translation {
  id: number;
  keyId: number;
  languageId: number;
  value: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface InsertTranslation {
  keyId: number;
  languageId: number;
  value: string;
}

export interface RolePermission {
  id: number;
  companyId: number;
  role: 'super_admin' | 'admin' | 'agent';
  permissions: Record<string, boolean>;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface InsertRolePermission {
  companyId: number;
  role: 'admin' | 'agent';
  permissions: Record<string, boolean>;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type?: string;
  expiry_date?: number;
  scope?: string;
}

export interface ZohoTokens {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  updatedAt?: Date;
}

export interface CalendlyTokens {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  updatedAt?: Date;
}


export interface WhatsAppProxyConfig {
  enabled: boolean;
  type: 'http' | 'https' | 'socks5';
  host: string;
  port: number; // 1-65535
  username: string | null;
  password: string | null;
  testStatus: 'untested' | 'working' | 'failed';
  lastTested: Date | null;
}

export interface DataRetentionPolicyConfig {
  enabled: boolean;
  retentionDays: number;
  autoAnonymize: boolean;
  deleteInactiveConversations: boolean;
  inactivityThresholdDays: number;
  notifyBeforeDeletion?: boolean;
  notificationDays?: number;
}

export interface IStorage {
  getAllCompanies(): Promise<Company[]>;
  getCompany(id: number): Promise<Company | undefined>;
  getCompanyBySlug(slug: string): Promise<Company | undefined>;
  getCompanyBySubdomain(subdomain: string): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: number, updates: Partial<InsertCompany>): Promise<Company>;

  getAllUsers(): Promise<User[]>;
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsernameOrEmail(credential: string): Promise<User | undefined>;
  getUserByUsernameCaseInsensitive(username: string): Promise<User | undefined>;
  getUsersByCompany(companyId: number): Promise<User[]>;
  getCompanyUserSummaries(companyId: number): Promise<Array<{ id: number; fullName: string; email: string; role: string; avatarUrl: string | null; username: string; isSuperAdmin: boolean }>>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<InsertUser>): Promise<User>;
  updateUserPassword(id: number, newPassword: string, isAlreadyHashed?: boolean): Promise<boolean>;
  deleteUser(id: number): Promise<boolean>;

  getAllPlans(): Promise<Plan[]>;
  getPlan(id: number): Promise<Plan | undefined>;
  createPlan(plan: InsertPlan): Promise<Plan>;
  updatePlan(id: number, updates: Partial<InsertPlan>): Promise<Plan>;
  deletePlan(id: number): Promise<boolean>;

  getPlanAiProviderConfigs(planId: number): Promise<PlanAiProviderConfig[]>;
  createPlanAiProviderConfig(config: InsertPlanAiProviderConfig): Promise<PlanAiProviderConfig>;
  updatePlanAiProviderConfig(id: number, updates: Partial<InsertPlanAiProviderConfig>): Promise<PlanAiProviderConfig>;
  deletePlanAiProviderConfig(id: number): Promise<boolean>;
  getPlanAiUsageStats(companyId: number, planId: number, startDate?: Date, endDate?: Date): Promise<any>;
  getAggregatedPlanAiUsageStats(planId: number, startDate?: Date, endDate?: Date): Promise<any>;
  getSystemAiUsageOverview(startDate?: Date, endDate?: Date): Promise<any>;

  getAppSetting(key: string): Promise<AppSetting | undefined>;
  getAllAppSettings(): Promise<AppSetting[]>;
  saveAppSetting(key: string, value: unknown): Promise<AppSetting>;
  deleteAppSetting(key: string): Promise<boolean>;

  getAllPaymentTransactions(): Promise<PaymentTransaction[]>;
  getPaymentTransactionsByCompany(companyId: number): Promise<PaymentTransaction[]>;
  getPaymentTransaction(id: number): Promise<PaymentTransaction | undefined>;
  createPaymentTransaction(transaction: InsertPaymentTransaction): Promise<PaymentTransaction>;
  updatePaymentTransaction(id: number, updates: Partial<InsertPaymentTransaction>): Promise<PaymentTransaction>;

  getActiveSubscriptionsCount(): Promise<number>;
  getPaymentTransactionsSince(startDate: Date): Promise<PaymentTransaction[]>;
  getCompaniesWithPaymentDetails(filters: Record<string, unknown>): Promise<unknown>;
  getPaymentTransactionsWithFilters(filters: Record<string, unknown>): Promise<{ data: PaymentTransaction[], total: number }>;
  getPendingPayments(offset: number, limit: number): Promise<{ data: PaymentTransaction[], total: number }>;
  updatePaymentTransactionStatus(id: number, status: string, notes?: string): Promise<PaymentTransaction | null>;
  createPaymentReminder(reminder: Record<string, unknown>): Promise<unknown>;
  getPaymentMethodPerformance(filters: Record<string, unknown>): Promise<unknown>;
  getPaymentTransactionsForExport(filters: Record<string, unknown>): Promise<PaymentTransaction[]>;
  generatePaymentCSV(transactions: PaymentTransaction[]): Promise<string>;
  updateCompanySubscription(companyId: number, subscription: Record<string, unknown>): Promise<unknown>;
  startCompanyTrial(companyId: number, planId: number, trialDays: number): Promise<Company>;
  endCompanyTrial(companyId: number): Promise<Company>;
  getCompaniesWithExpiredTrials(): Promise<Company[]>;
  getCompaniesWithExpiringTrials(daysBeforeExpiry: number): Promise<Company[]>;

  getAllLanguages(): Promise<Language[]>;
  getLanguage(id: number): Promise<Language | undefined>;
  getLanguageByCode(code: string): Promise<Language | undefined>;
  getDefaultLanguage(): Promise<Language | undefined>;
  createLanguage(language: InsertLanguage): Promise<Language>;
  updateLanguage(id: number, updates: Partial<InsertLanguage>): Promise<Language>;
  deleteLanguage(id: number): Promise<boolean>;
  setDefaultLanguage(id: number): Promise<boolean>;

  getAllNamespaces(): Promise<TranslationNamespace[]>;
  getNamespace(id: number): Promise<TranslationNamespace | undefined>;
  getNamespaceByName(name: string): Promise<TranslationNamespace | undefined>;
  createNamespace(namespace: InsertTranslationNamespace): Promise<TranslationNamespace>;
  updateNamespace(id: number, updates: Partial<InsertTranslationNamespace>): Promise<TranslationNamespace>;
  deleteNamespace(id: number): Promise<boolean>;

  getAllKeys(namespaceId?: number): Promise<TranslationKey[]>;
  getKey(id: number): Promise<TranslationKey | undefined>;
  getKeyByNameAndKey(namespaceId: number, key: string): Promise<TranslationKey | undefined>;
  createKey(key: InsertTranslationKey): Promise<TranslationKey>;
  updateKey(id: number, updates: Partial<InsertTranslationKey>): Promise<TranslationKey>;
  deleteKey(id: number): Promise<boolean>;

  getAllTranslations(languageId?: number, keyId?: number): Promise<Translation[]>;
  getTranslation(id: number): Promise<Translation | undefined>;
  getTranslationByKeyAndLanguage(keyId: number, languageId: number): Promise<Translation | undefined>;
  createTranslation(translation: InsertTranslation): Promise<Translation>;
  updateTranslation(id: number, updates: Partial<InsertTranslation>): Promise<Translation>;
  deleteTranslation(id: number): Promise<boolean>;

  getTranslationsForLanguage(languageCode: string): Promise<Array<{ id: number, key: string, value: string }>>;
  getTranslationsForLanguageByNamespace(languageCode: string): Promise<Record<string, Record<string, string>>>;
  getTranslationsForLanguageAsArray(languageCode: string): Promise<Array<{ key: string, value: string }>>;
  convertArrayToNestedFormat(arrayData: Array<{ key: string, value: string }>): Promise<Record<string, Record<string, string>>>;
  importTranslations(languageId: number, translations: Record<string, Record<string, string>>): Promise<boolean>;

  getRolePermissions(companyId?: number): Promise<RolePermission[]>;
  getRolePermissionsByRole(companyId: number, role: 'admin' | 'agent'): Promise<RolePermission | undefined>;
  createRolePermissions(rolePermission: InsertRolePermission): Promise<RolePermission>;
  updateRolePermissions(role: 'admin' | 'agent', permissions: Record<string, boolean>, companyId?: number): Promise<RolePermission>;

  getCompanyPages(companyId: number, options?: { published?: boolean; featured?: boolean }): Promise<CompanyPage[]>;
  getCompanyPage(id: number): Promise<CompanyPage | undefined>;
  getCompanyPageBySlug(companyId: number, slug: string): Promise<CompanyPage | undefined>;
  createCompanyPage(page: InsertCompanyPage): Promise<CompanyPage>;
  updateCompanyPage(id: number, page: Partial<InsertCompanyPage>): Promise<CompanyPage>;
  deleteCompanyPage(id: number): Promise<boolean>;
  publishCompanyPage(id: number): Promise<CompanyPage>;
  unpublishCompanyPage(id: number): Promise<CompanyPage>;

  getChannelConnections(userId: number | null, companyId?: number): Promise<ChannelConnection[]>;
  getChannelConnectionsByCompany(companyId: number): Promise<ChannelConnection[]>;
  getChannelConnectionsByType(channelType: string): Promise<ChannelConnection[]>;
  getTikTokConnectionIdsNeedingTokenRefresh(thresholdMs: number): Promise<number[]>;
  getChannelConnection(id: number): Promise<ChannelConnection | undefined>;
  createChannelConnection(connection: InsertChannelConnection): Promise<ChannelConnection>;
  updateChannelConnectionStatus(id: number, status: string): Promise<ChannelConnection>;
  updateChannelConnectionName(id: number, accountName: string): Promise<ChannelConnection>;
  updateChannelConnection(id: number, updates: Partial<InsertChannelConnection>): Promise<ChannelConnection>;
  deleteChannelConnection(id: number): Promise<boolean>;

  ensureInstagramChannelsActive(): Promise<number>;

  getSmtpConfig(companyId?: number): Promise<Record<string, unknown> | null>;
  saveSmtpConfig(config: Record<string, unknown>, companyId?: number): Promise<boolean>;

  getCompanySetting(companyId: number, key: string): Promise<CompanySetting | undefined>;
  getAllCompanySettings(companyId: number): Promise<CompanySetting[]>;
  saveCompanySetting(companyId: number, key: string, value: unknown): Promise<CompanySetting>;
  deleteCompanySetting(companyId: number, key: string): Promise<boolean>;

  getDataRetentionPolicy(companyId: number, platform: string): Promise<DataRetentionPolicyConfig | null>;
  setDataRetentionPolicy(companyId: number, platform: string, policyConfig: DataRetentionPolicyConfig): Promise<CompanySetting>;

  getWhatsAppProxyConfig(companyId: number): Promise<WhatsAppProxyConfig | null>;
  saveWhatsAppProxyConfig(companyId: number, config: WhatsAppProxyConfig): Promise<WhatsAppProxyConfig>;


  getWhatsappProxyServers(companyId: number): Promise<any[]>;
  getWhatsappProxyServer(id: number): Promise<any | null>;
  createWhatsappProxyServer(data: any): Promise<any>;
  updateWhatsappProxyServer(id: number, updates: any): Promise<any>;
  deleteWhatsappProxyServer(id: number): Promise<boolean>;

  getGoogleTokens(userId: number, companyId: number): Promise<GoogleTokens | null>;
  saveGoogleTokens(userId: number, companyId: number, tokens: GoogleTokens): Promise<boolean>;
  deleteGoogleTokens(userId: number, companyId: number): Promise<boolean>;
  getGoogleCalendarCredentials(companyId: number): Promise<Record<string, unknown> | null>;
  saveGoogleCalendarCredentials(companyId: number, credentials: Record<string, unknown>): Promise<boolean>;

  getZohoTokens(userId: number, companyId: number): Promise<ZohoTokens | null>;
  saveZohoTokens(userId: number, companyId: number, tokens: ZohoTokens): Promise<boolean>;
  deleteZohoTokens(userId: number, companyId: number): Promise<boolean>;

  getCalendlyTokens(userId: number, companyId: number): Promise<CalendlyTokens | null>;
  saveCalendlyTokens(userId: number, companyId: number, tokens: CalendlyTokens): Promise<boolean>;
  deleteCalendlyTokens(userId: number, companyId: number): Promise<boolean>;

  createCalendarBooking(bookingData: { userId: number; companyId: number; calendarType: string; startDateTime: Date; endDateTime: Date; eventId?: string; eventLink?: string }): Promise<{ success: boolean; bookingId?: number; error?: string }>;
  getCalendarBookingByEventLink(userId: number, companyId: number, calendarType: string, eventLink: string): Promise<CalendarBooking | null>;
  getCalendarBookings(userId: number, companyId: number, calendarType: string, startDateTime: Date, endDateTime: Date): Promise<CalendarBooking[]>;
  deleteCalendarBooking(userId: number, companyId: number, calendarType: string, eventId: string): Promise<boolean>;
  getCalendarBookingByEventId(userId: number, companyId: number, calendarType: string, eventId: string): Promise<CalendarBooking | null>;
  getRecentCalendarBookings(userId: number, companyId: number, calendarType: string, limit?: number): Promise<CalendarBooking[]>;
  extractEventIdFromLink(eventLink: string): string | null;
  checkBookingConflict(userId: number, companyId: number, calendarType: string, startDateTime: Date, endDateTime: Date): Promise<boolean>;

  getContacts(options?: { page?: number; limit?: number; search?: string; channel?: string; tags?: string[]; companyId?: number; includeArchived?: boolean; archivedOnly?: boolean; dateRange?: string; userId?: number; contactScope?: 'own' | 'assigned' | 'company' }): Promise<{ contacts: Contact[]; total: number }>;
  getContact(id: number): Promise<Contact | undefined>;
  getContactByIdentifier(identifier: string, identifierType: string): Promise<Contact | undefined>;
  getContactByEmail(email: string, companyId: number): Promise<Contact | undefined>;
  getContactByPhone(phone: string, companyId: number): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  getOrCreateContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: number, contact: Partial<InsertContact>): Promise<Contact>;
  deleteContact(id: number): Promise<{ success: boolean; mediaFiles?: string[]; error?: string }>;

  getConversations(options?: { companyId?: number; page?: number; limit?: number; search?: string; assignedToUserId?: number }): Promise<{ conversations: Conversation[]; total: number }>;
  getGroupConversations(options?: { companyId?: number; page?: number; limit?: number; search?: string }): Promise<{ conversations: Conversation[]; total: number }>;
  getConversation(id: number): Promise<Conversation | undefined>;
  getConversationsByContact(contactId: number): Promise<Conversation[]>;
  getConversationByContactAndChannel(contactId: number, channelId: number): Promise<Conversation | undefined>;
  getConversationByGroupJid(groupJid: string): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: number, updates: Partial<InsertConversation>): Promise<Conversation>;

  upsertGroupParticipant(data: {
    conversationId: number;
    contactId?: number;
    participantJid: string;
    participantName?: string;
    isAdmin?: boolean;
    isSuperAdmin?: boolean;
    isActive?: boolean;
  }): Promise<GroupParticipant>;

  syncGroupParticipantsFromMetadata(conversationId: number, groupMetadata: any): Promise<void>;
  getGroupParticipants(conversationId: number): Promise<any[]>;

  getMessagesByConversation(conversationId: number): Promise<Message[]>;
  getMessagesByConversationPaginated(conversationId: number, limit: number, offset: number): Promise<Message[]>;
  getMessagesCountByConversation(conversationId: number): Promise<number>;

  getMessagesByConversationWithCompanyValidation(conversationId: number, companyId: number): Promise<Message[]>;
  getMessagesByConversationPaginatedWithCompanyValidation(conversationId: number, companyId: number, limit: number, offset: number): Promise<Message[]>;
  getMessagesCountByConversationWithCompanyValidation(conversationId: number, companyId: number): Promise<number>;
  getMessageById(id: number): Promise<Message | undefined>;
  getMessageByExternalId(externalId: string, companyId?: number): Promise<Message | undefined>;
  createMessage(message: InsertMessage): Promise<Message>;
  updateMessage(id: number, updates: Partial<InsertMessage>): Promise<Message>;
  deleteMessage(id: number): Promise<boolean>;
  deleteConversation(id: number): Promise<boolean>;
  clearConversationHistory(conversationId: number): Promise<{ success: boolean; deletedCount: number; mediaFiles: string[] }>;


  getAffiliatesByCompany(companyId: number): Promise<any[]>;
  getAffiliateEarningsBalance(companyId: number, affiliateId: number): Promise<any>;
  updateAffiliateEarningsBalance(companyId: number, affiliateId: number, balanceData: any): Promise<any>;
  createAffiliateEarningsTransaction(transactionData: any): Promise<any>;
  getAffiliateEarningsTransactions(affiliateId: number, limit?: number): Promise<any[]>;
  applyAffiliateCreditsToPayment(companyId: number, affiliateId: number, amount: number, paymentTransactionId: number): Promise<boolean>;


  getAllCoupons(): Promise<any[]>;
  getCouponById(id: number): Promise<any>;
  getCouponByCode(code: string): Promise<any>;
  createCoupon(couponData: any): Promise<any>;
  updateCoupon(id: number, updates: any): Promise<any>;
  deleteCoupon(id: number): Promise<boolean>;
  validateCoupon(code: string, planId: number, amount: number, userId?: number): Promise<any>;
  getCouponUsageStats(couponId: number): Promise<any>;


  clearCompanyContacts(companyId: number): Promise<{ success: boolean; deletedCount: number }>;
  clearCompanyConversations(companyId: number): Promise<{ success: boolean; deletedCount: number }>;
  clearCompanyMessages(companyId: number): Promise<{ success: boolean; deletedCount: number }>;
  clearCompanyTemplates(companyId: number): Promise<{ success: boolean; deletedCount: number }>;
  clearCompanyCampaigns(companyId: number): Promise<{ success: boolean; deletedCount: number }>;
  clearCompanyMedia(companyId: number): Promise<{ success: boolean; deletedCount: number }>;
  clearCompanyAnalytics(companyId: number): Promise<{ success: boolean; deletedCount: number }>;

  getConversationsCount(): Promise<number>;
  getConversationsCountByCompany(companyId: number): Promise<number>;
  getConversationsCountByCompanyAndDateRange(companyId: number, startDate: Date, endDate: Date): Promise<number>;
  getMessagesCount(): Promise<number>;
  getMessagesCountByCompany(companyId: number): Promise<number>;
  getMessagesCountByCompanyAndDateRange(companyId: number, startDate: Date, endDate: Date): Promise<number>;
  getContactsCountByCompanyAndDateRange(companyId: number, startDate: Date, endDate: Date): Promise<number>;
  getConversationsByDay(days: number): Promise<Record<string, unknown>[]>;
  getConversationsByDayByCompany(companyId: number, days: number): Promise<Record<string, unknown>[]>;
  getConversationsByDayByCompanyAndDateRange(companyId: number, startDate: Date, endDate: Date): Promise<Record<string, unknown>[]>;
  getMessagesByChannel(): Promise<Record<string, unknown>[]>;
  getMessagesByChannelByCompany(companyId: number): Promise<Record<string, unknown>[]>;





  createFlowSession(session: Record<string, unknown>): Promise<unknown>;
  updateFlowSession(sessionId: string, updates: Record<string, unknown>): Promise<unknown>;
  getFlowSession(sessionId: string): Promise<unknown>;
  getActiveFlowSessionsForConversation(conversationId: number): Promise<Record<string, unknown>[]>;
  expireFlowSession(sessionId: string): Promise<unknown>;

  createFlowSessionVariable(variable: Record<string, unknown>): Promise<unknown>;
  upsertFlowSessionVariable(variable: Record<string, unknown>): Promise<unknown>;
  getFlowSessionVariables(sessionId: string): Promise<Record<string, unknown>[]>;
  getFlowSessionVariable(sessionId: string, variableKey: string): Promise<unknown>;
  deleteFlowSessionVariable(sessionId: string, variableKey: string): Promise<unknown>;

  createFlowSessionCursor(cursor: Record<string, unknown>): Promise<unknown>;
  updateFlowSessionCursor(sessionId: string, updates: Record<string, unknown>): Promise<unknown>;
  getFlowSessionCursor(sessionId: string): Promise<unknown>;

  createFollowUpSchedule(schedule: Record<string, unknown>): Promise<unknown>;
  updateFollowUpSchedule(scheduleId: string, updates: Record<string, unknown>): Promise<unknown>;
  getFollowUpSchedule(scheduleId: string): Promise<unknown>;
  getFollowUpSchedulesByConversation(conversationId: number): Promise<Record<string, unknown>[]>;
  getFollowUpSchedulesByContact(contactId: number): Promise<Record<string, unknown>[]>;
  getScheduledFollowUps(limit?: number): Promise<Record<string, unknown>[]>;
  cancelFollowUpSchedule(scheduleId: string): Promise<unknown>;

  createFollowUpTemplate(template: Record<string, unknown>): Promise<unknown>;
  updateFollowUpTemplate(id: number, updates: Record<string, unknown>): Promise<unknown>;
  getFollowUpTemplate(id: number): Promise<unknown>;
  getFollowUpTemplatesByCompany(companyId: number): Promise<Record<string, unknown>[]>;
  deleteFollowUpTemplate(id: number): Promise<boolean>;

  createFollowUpExecutionLog(log: Record<string, unknown>): Promise<unknown>;
  getFollowUpExecutionLogs(scheduleId: string): Promise<Record<string, unknown>[]>;

  createPipelineStageRevert(data: InsertPipelineStageRevert): Promise<PipelineStageRevert>;
  getPipelineStageRevert(scheduleId: string): Promise<PipelineStageRevert | undefined>;
  getScheduledPipelineStageReverts(limit?: number): Promise<PipelineStageRevert[]>;
  getPipelineStageRevertsByDeal(dealId: number, companyId: number): Promise<PipelineStageRevert[]>;
  getPipelineStageRevertsStats(companyId: number): Promise<{ totalScheduled: number; totalExecuted: number; totalFailed: number; totalSkipped: number; totalCancelled: number }>;
  updatePipelineStageRevert(scheduleId: string, updates: Partial<PipelineStageRevert>): Promise<PipelineStageRevert>;
  cancelPipelineStageRevert(scheduleId: string): Promise<void>;
  createPipelineStageRevertLog(data: InsertPipelineStageRevertLog): Promise<PipelineStageRevertLog>;
  getPipelineStageRevertLogs(scheduleId: string): Promise<PipelineStageRevertLog[]>;
  getDealActivitiesSince(dealId: number, sinceDate: Date): Promise<DealActivity[]>;



  createFlowExecution(data: {
    executionId: string;
    flowId: number;
    conversationId: number;
    contactId: number;
    companyId?: number;
    triggerNodeId: string;
    contextData?: Record<string, unknown>;
  }): Promise<number>;

  updateFlowExecution(executionId: string, data: {
    status?: string;
    currentNodeId?: string;
    executionPath?: string[];
    contextData?: Record<string, unknown>;
    completedAt?: Date;
    totalDurationMs?: number;
    completionRate?: number;
    errorMessage?: string;
  }): Promise<void>;

  createFlowStepExecution(data: {
    flowExecutionId: number;
    nodeId: string;
    nodeType: string;
    stepOrder: number;
    inputData?: Record<string, unknown>;
  }): Promise<number>;

  updateFlowStepExecution(stepId: number, data: {
    status?: string;
    completedAt?: Date;
    durationMs?: number;
    outputData?: Record<string, unknown>;
    errorMessage?: string;
  }): Promise<void>;

  getFlowDropoffAnalysis(flowId: number, companyId?: number): Promise<Array<{
    nodeId: string;
    nodeType: string;
    dropoffCount: number;
    dropoffRate: number;
  }>>;

  getNotesByContact(contactId: number): Promise<Note[]>;
  createNote(note: InsertNote): Promise<Note>;

  getFlows(userId: number): Promise<Flow[]>;
  getFlow(id: number): Promise<Flow | undefined>;
  createFlow(flow: InsertFlow): Promise<Flow>;
  updateFlow(id: number, updates: Partial<InsertFlow>): Promise<Flow>;
  deleteFlow(id: number): Promise<boolean>;

  getFlowAssignments(channelId?: number, flowId?: number): Promise<FlowAssignment[]>;
  getFlowAssignment(id: number): Promise<FlowAssignment | undefined>;
  createFlowAssignment(assignment: InsertFlowAssignment): Promise<FlowAssignment>;
  updateFlowAssignmentStatus(id: number, isActive: boolean): Promise<FlowAssignment>;
  deleteFlowAssignment(id: number): Promise<boolean>;

  getAllTeamMembers(): Promise<User[]>;
  getActiveTeamMembers(): Promise<User[]>;
  getTeamMembersByCompany(companyId: number): Promise<User[]>;
  getActiveTeamMembersByCompany(companyId: number): Promise<User[]>;

  getTeamInvitations(companyId?: number): Promise<TeamInvitation[]>;
  getTeamInvitationByEmail(email: string): Promise<TeamInvitation | undefined>;
  getTeamInvitationByToken(token: string): Promise<TeamInvitation | undefined>;
  createTeamInvitation(invitation: InsertTeamInvitation): Promise<TeamInvitation>;
  updateTeamInvitationStatus(id: number, status: string): Promise<TeamInvitation>;
  deleteTeamInvitation(id: number): Promise<boolean>;

  getPipelineStages(): Promise<PipelineStage[]>;
  getPipelineStage(id: number): Promise<PipelineStage | undefined>;
  createPipelineStage(stage: InsertPipelineStage): Promise<PipelineStage>;
  updatePipelineStage(id: number, updates: Partial<PipelineStage>): Promise<PipelineStage>;
  deletePipelineStage(id: number, moveDealsToStageId?: number): Promise<boolean>;
  reorderPipelineStages(stageIds: number[]): Promise<boolean>;


  getPipelines(): Promise<Pipeline[]>;
  getPipelinesByCompany(companyId: number): Promise<Pipeline[]>;
  getPipeline(id: number): Promise<Pipeline | undefined>;
  createPipeline(pipeline: InsertPipeline): Promise<Pipeline>;
  updatePipeline(id: number, updates: Partial<InsertPipeline>): Promise<Pipeline>;
  deletePipeline(id: number, moveDealsToStageId?: number): Promise<boolean>;
  duplicatePipeline(id: number, newName: string): Promise<Pipeline>;
  reorderPipelines(companyId: number, pipelineIds: number[]): Promise<boolean>;
  createPipelineFromTemplate(templateId: string, companyId: number, customName?: string, description?: string, icon?: string, color?: string): Promise<{ pipeline: Pipeline; stages: PipelineStage[] }>;
  getPipelineWithStages(id: number): Promise<{ pipeline: Pipeline; stages: PipelineStage[] } | null>;
  getPipelineStagesByPipeline(pipelineId: number): Promise<PipelineStage[]>;

  getDeals(filter?: {
    companyId?: number;
    generalSearch?: string;
    pipelineId?: number;
    stageIds?: number[];
    priorities?: ('low' | 'medium' | 'high')[];
    minValue?: number;
    maxValue?: number;
    dueDateFrom?: string;
    dueDateTo?: string;
    assignedUserIds?: number[];
    includeUnassigned?: boolean;
    tags?: string[];
    status?: string;
    createdFrom?: string;
    createdTo?: string;
  }): Promise<Deal[]>;
  getDealsByStage(stage: DealStatus): Promise<Deal[]>;
  getDealsByStageId(stageId: number): Promise<Deal[]>;
  getDeal(id: number): Promise<Deal | undefined>;
  getDealsByContact(contactId: number): Promise<Deal[]>;
  getActiveDealByContact(contactId: number, companyId?: number, pipelineId?: number): Promise<Deal | null>;
  getDealsByAssignedUser(userId: number): Promise<Deal[]>;
  getDealTags(companyId: number): Promise<string[]>;
  getContactTags(companyId: number): Promise<string[]>;
  getContactsForExport(options: {
    companyId: number;
    exportScope?: 'all' | 'filtered';
    tags?: string[];
    createdAfter?: string;
    createdBefore?: string;
    search?: string;
    channel?: string;
    userId?: number;
    contactScope?: 'own' | 'assigned' | 'company';
  }): Promise<Contact[]>;


  getContactDocuments(contactId: number): Promise<ContactDocument[]>;
  getContactDocument(documentId: number): Promise<ContactDocument | undefined>;
  createContactDocument(document: InsertContactDocument): Promise<ContactDocument>;
  deleteContactDocument(documentId: number): Promise<void>;


  getContactAppointments(contactId: number): Promise<ContactAppointment[]>;
  getContactAppointment(appointmentId: number): Promise<ContactAppointment | undefined>;
  createContactAppointment(appointment: InsertContactAppointment): Promise<ContactAppointment>;
  updateContactAppointment(appointmentId: number, appointment: Partial<InsertContactAppointment>): Promise<ContactAppointment>;
  deleteContactAppointment(appointmentId: number): Promise<void>;


  getContactTasks(contactId: number, companyId: number, options?: { status?: string; priority?: string; search?: string }): Promise<ContactTask[]>;
  getContactTask(taskId: number, companyId: number): Promise<ContactTask | undefined>;
  createContactTask(task: InsertContactTask): Promise<ContactTask>;
  updateContactTask(taskId: number, companyId: number, updates: Partial<InsertContactTask>): Promise<ContactTask>;
  deleteContactTask(taskId: number, companyId: number): Promise<void>;
  bulkUpdateContactTasks(taskIds: number[], companyId: number, updates: Partial<InsertContactTask>): Promise<ContactTask[]>;


  getCompanyTasks(companyId: number, options?: {
    status?: string;
    priority?: string;
    assignedTo?: string;
    contactId?: number;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ tasks: ContactTask[]; total: number }>;
  getTask(taskId: number, companyId: number): Promise<ContactTask | undefined>;
  createTask(task: InsertContactTask): Promise<ContactTask>;
  updateTask(taskId: number, companyId: number, updates: Partial<InsertContactTask>): Promise<ContactTask>;
  deleteTask(taskId: number, companyId: number): Promise<void>;
  bulkUpdateTasks(taskIds: number[], companyId: number, updates: Partial<InsertContactTask>): Promise<ContactTask[]>;

  getContactActivity(contactId: number, options?: { type?: string; limit?: number }): Promise<any[]>;


  createContactAuditLog(auditLog: InsertContactAuditLog): Promise<ContactAuditLog>;
  getContactAuditLogs(contactId: number, options?: { page?: number; limit?: number; actionType?: string }): Promise<{ logs: ContactAuditLog[]; total: number }>;
  getCompanyDeletionAuditLogs(companyId: number, options?: { page?: number; limit?: number }): Promise<{ logs: ContactAuditLog[]; total: number }>;
  logContactActivity(params: {
    companyId: number;
    contactId: number;
    userId?: number;
    actionType: string;
    actionCategory?: string;
    description: string;
    oldValues?: any;
    newValues?: any;
    metadata?: any;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void>;


  archiveContact(contactId: number): Promise<Contact>;
  unarchiveContact(contactId: number): Promise<Contact>;
  createDeal(deal: InsertDeal): Promise<Deal>;
  updateDeal(id: number, updates: Partial<InsertDeal>): Promise<Deal>;
  updateDealStage(id: number, stage: DealStatus): Promise<Deal>;
  updateDealStageId(id: number, stageId: number): Promise<Deal>;
  updateDealPipelineAndStage(id: number, pipelineId: number, stageId: number): Promise<Deal>;
  deleteDeal(id: number, companyId?: number): Promise<{ success: boolean; reason?: string }>;

  getDealActivities(dealId: number): Promise<DealActivity[]>;
  createDealActivity(activity: InsertDealActivity): Promise<DealActivity>;

  createSystemUpdate(update: InsertSystemUpdate): Promise<SystemUpdate>;
  updateSystemUpdate(id: number, updates: Partial<InsertSystemUpdate>): Promise<SystemUpdate>;
  getSystemUpdate(id: number): Promise<SystemUpdate | undefined>;
  getAllSystemUpdates(): Promise<SystemUpdate[]>;
  getLatestSystemUpdate(): Promise<SystemUpdate | undefined>;
  deleteSystemUpdate(id: number): Promise<boolean>;



  createDatabaseBackup(name: string): Promise<string>;


  getAffiliateMetrics(): Promise<Record<string, unknown>>;
  getAffiliates(params: Record<string, unknown>): Promise<{ data: unknown[], total: number, page: number, limit: number, totalPages: number }>;
  getAffiliate(id: number): Promise<unknown | undefined>;
  createAffiliate(affiliate: Record<string, unknown>): Promise<unknown>;
  updateAffiliate(id: number, updates: Record<string, unknown>): Promise<unknown | undefined>;
  deleteAffiliate(id: number): Promise<boolean>;
  generateAffiliateCode(name: string): Promise<string>;


  createAffiliateApplication(application: Record<string, unknown>): Promise<unknown>;
  getAffiliateApplications(): Promise<unknown[]>;
  getAffiliateApplication(id: number): Promise<unknown | undefined>;
  getAffiliateApplicationByEmail(email: string): Promise<unknown | undefined>;
  updateAffiliateApplication(id: number, updates: Record<string, unknown>): Promise<unknown | undefined>;
  getAffiliateByEmail(email: string): Promise<unknown | undefined>;

  getAffiliateCommissionStructures(affiliateId: number): Promise<unknown[]>;
  createCommissionStructure(structure: Record<string, unknown>): Promise<unknown>;
  updateCommissionStructure(id: number, updates: Record<string, unknown>): Promise<unknown | undefined>;
  deleteCommissionStructure(id: number): Promise<boolean>;

  getAffiliateReferrals(params: Record<string, unknown>): Promise<{ data: unknown[], total: number, page: number, limit: number, totalPages: number }>;
  updateAffiliateReferral(id: number, updates: Record<string, unknown>): Promise<unknown | undefined>;

  getAffiliatePayouts(params: Record<string, unknown>): Promise<{ data: unknown[], total: number, page: number, limit: number, totalPages: number }>;
  createAffiliatePayout(payout: Record<string, unknown>): Promise<unknown>;
  updateAffiliatePayout(id: number, updates: Record<string, unknown>): Promise<unknown | undefined>;

  getAffiliateAnalytics(params: Record<string, unknown>): Promise<unknown[]>;
  getAffiliatePerformance(params: Record<string, unknown>): Promise<unknown[]>;
  exportAffiliateData(params: Record<string, unknown>): Promise<string>;


  setFlowVariable(data: {
    sessionId: string;
    variableKey: string;
    variableValue: any;
    variableType?: 'string' | 'number' | 'boolean' | 'object' | 'array';
    scope?: 'global' | 'flow' | 'node' | 'user' | 'session';
    nodeId?: string;
    expiresAt?: Date;
  }): Promise<void>;
  getFlowVariable(sessionId: string, variableKey: string): Promise<any>;
  getFlowVariables(sessionId: string, scope?: string): Promise<Record<string, any>>;
  deleteFlowVariable(sessionId: string, variableKey: string): Promise<void>;
  clearFlowVariables(sessionId: string, scope?: string): Promise<void>;
  getFlowVariablesByScope(sessionId: string, scope: 'global' | 'flow' | 'node' | 'user' | 'session'): Promise<Array<{
    variableKey: string;
    variableValue: any;
    variableType: string;
    nodeId?: string;
    createdAt: Date;
    updatedAt: Date;
  }>>;
  getFlowVariablesPaginated(sessionId: string, options: {
    scope?: 'global' | 'flow' | 'node' | 'user' | 'session';
    limit: number;
    offset: number;
  }): Promise<{
    variables: Array<{
      variableKey: string;
      variableValue: any;
      variableType: string;
      nodeId?: string;
      createdAt: Date;
      updatedAt: Date;
    }>;
    totalCount: number;
  }>;
  getRecentFlowSessions(flowId: number, limit?: number, offset?: number): Promise<Array<{
    sessionId: string;
    status: string;
    startedAt: Date;
    lastActivityAt: Date;
    completedAt?: Date;
    contactName?: string;
    contactPhone?: string;
    conversationId: number;
    variableCount: number;
  }>>;
  deleteAllFlowSessions(flowId: number): Promise<number>;

  sessionStore: session.Store;
}

import { getDb } from "./db";



const db = new Proxy({} as any, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  },
  set(_target, prop, value) {
    (getDb() as any)[prop] = value;
    return true;
  }
});
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import { PgColumn } from "drizzle-orm/pg-core";

const PostgresSessionStore = connectPg(session);

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;
  public db = db;
  public pool = pool;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true
    });
  }

  private mapToPaymentTransaction(transaction: any): PaymentTransaction {
    return {
      ...transaction,
      amount: Number(transaction.amount),
      metadata: transaction.metadata as Record<string, unknown> | undefined
    };
  }

  async getAllCompanies(): Promise<Company[]> {
    try {
      return await db.select().from(companies).orderBy(companies.name);
    } catch (error) {
      console.error("Error getting all companies:", error);
      return [];
    }
  }

  async getCompany(id: number): Promise<Company | undefined> {
    try {
      const [company] = await db.select().from(companies).where(eq(companies.id, id));
      return company || undefined;
    } catch (error) {
      console.error(`Error getting company with ID ${id}:`, error);
      return undefined;
    }
  }

  async getCompanyBySlug(slug: string): Promise<Company | undefined> {
    try {
      const [company] = await db.select().from(companies).where(eq(companies.slug, slug));
      return company || undefined;
    } catch (error) {
      console.error(`Error getting company with slug ${slug}:`, error);
      return undefined;
    }
  }

  async getCompanyBySubdomain(subdomain: string): Promise<Company | undefined> {
    try {
      const [company] = await db.select().from(companies).where(eq(companies.subdomain, subdomain));
      return company || undefined;
    } catch (error) {
      console.error(`Error getting company with subdomain ${subdomain}:`, error);
      return undefined;
    }
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    try {
      const [newCompany] = await db.insert(companies).values({
        ...company,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      return newCompany;
    } catch (error) {
      console.error("Error creating company:", error);
      throw error;
    }
  }

  async updateCompany(id: number, updates: Partial<InsertCompany>): Promise<Company> {
    try {
      const [updatedCompany] = await db
        .update(companies)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(companies.id, id))
        .returning();

      if (!updatedCompany) {
        throw new Error(`Company with ID ${id} not found`);
      }

      return updatedCompany;
    } catch (error) {
      console.error("Error updating company:", error);
      throw error;
    }
  }

  async getAllUsers(): Promise<User[]> {
    try {
      return await db
        .select()
        .from(users)
        .orderBy(users.fullName);
    } catch (error) {
      console.error("Error getting all users:", error);
      return [];
    }
  }

  async getUsersByCompany(companyId: number): Promise<User[]> {
    try {
      return await db
        .select()
        .from(users)
        .where(eq(users.companyId, companyId))
        .orderBy(users.fullName);
    } catch (error) {
      console.error(`Error getting users for company ${companyId}:`, error);
      return [];
    }
  }

  async getCompanyUserSummaries(companyId: number): Promise<Array<{ id: number; fullName: string; email: string; role: string; avatarUrl: string | null; username: string; isSuperAdmin: boolean }>> {
    try {
      return await db
        .select({
          id: users.id,
          fullName: users.fullName,
          email: users.email,
          role: users.role,
          avatarUrl: users.avatarUrl,
          username: users.username,
          isSuperAdmin: users.isSuperAdmin,
        })
        .from(users)
        .where(eq(users.companyId, companyId))
        .orderBy(users.fullName);
    } catch (error) {
      console.error(`Error getting user summaries for company ${companyId}:`, error);
      return [];
    }
  }

  async deleteUser(id: number): Promise<boolean> {
    try {
      await db
        .delete(users)
        .where(eq(users.id, id));
      return true;
    } catch (error) {
      console.error(`Error deleting user with ID ${id}:`, error);
      return false;
    }
  }

  async getAllPlans(): Promise<Plan[]> {
    try {
      const result = await db
        .select()
        .from(plans)
        .orderBy(plans.name);

      return result.map((plan: Plan) => ({
        ...plan,
        features: Array.isArray(plan.features) ? plan.features : [],
        campaignFeatures: Array.isArray(plan.campaignFeatures) ? plan.campaignFeatures : ["basic_campaigns"],
        trialDays: plan.trialDays || 0
      }));
    } catch (error) {
      console.error("Error getting all plans:", error);
      return [];
    }
  }

  async getPlan(id: number): Promise<Plan | undefined> {
    try {
      const [plan] = await db
        .select()
        .from(plans)
        .where(eq(plans.id, id));

      if (!plan) return undefined;

      return {
        ...plan,
        features: Array.isArray(plan.features) ? plan.features : [],
        campaignFeatures: Array.isArray(plan.campaignFeatures) ? plan.campaignFeatures : ["basic_campaigns"],
        trialDays: plan.trialDays || 0
      };
    } catch (error) {
      console.error(`Error getting plan with ID ${id}:`, error);
      return undefined;
    }
  }

  async createPlan(plan: InsertPlan): Promise<Plan> {
    try {
      const [newPlan] = await db
        .insert(plans)
        .values({
          ...plan,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      return {
        ...newPlan,
        features: Array.isArray(newPlan.features) ? newPlan.features : [],
        campaignFeatures: Array.isArray(newPlan.campaignFeatures) ? newPlan.campaignFeatures : ["basic_campaigns"],
        trialDays: newPlan.trialDays || 0
      };
    } catch (error) {
      console.error("Error creating plan:", error);
      throw error;
    }
  }

  async updatePlan(id: number, updates: Partial<InsertPlan>): Promise<Plan> {
    try {
      const [updatedPlan] = await db
        .update(plans)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(plans.id, id))
        .returning();

      if (!updatedPlan) {
        throw new Error(`Plan with ID ${id} not found`);
      }

      return {
        ...updatedPlan,
        features: Array.isArray(updatedPlan.features) ? updatedPlan.features : [],
        campaignFeatures: Array.isArray(updatedPlan.campaignFeatures) ? updatedPlan.campaignFeatures : ["basic_campaigns"],
        trialDays: updatedPlan.trialDays || 0
      };
    } catch (error) {
      console.error("Error updating plan:", error);
      throw error;
    }
  }

  async deletePlan(id: number): Promise<boolean> {
    try {
      await db
        .delete(plans)
        .where(eq(plans.id, id));

      return true;
    } catch (error) {
      console.error(`Error deleting plan with ID ${id}:`, error);
      return false;
    }
  }

  async getPlanAiProviderConfigs(planId: number): Promise<PlanAiProviderConfig[]> {
    try {
      const configs = await db
        .select()
        .from(planAiProviderConfigs)
        .where(eq(planAiProviderConfigs.planId, planId))
        .orderBy(planAiProviderConfigs.priority, planAiProviderConfigs.provider);

      return configs;
    } catch (error) {
      console.error(`Error getting AI provider configs for plan ${planId}:`, error);
      return [];
    }
  }

  async createPlanAiProviderConfig(config: InsertPlanAiProviderConfig): Promise<PlanAiProviderConfig> {
    try {
      const [newConfig] = await db
        .insert(planAiProviderConfigs)
        .values({
          ...config,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      return newConfig;
    } catch (error) {
      console.error("Error creating AI provider config:", error);
      throw error;
    }
  }

  async updatePlanAiProviderConfig(id: number, updates: Partial<InsertPlanAiProviderConfig>): Promise<PlanAiProviderConfig> {
    try {
      const [updatedConfig] = await db
        .update(planAiProviderConfigs)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(planAiProviderConfigs.id, id))
        .returning();

      if (!updatedConfig) {
        throw new Error(`AI provider config with ID ${id} not found`);
      }

      return updatedConfig;
    } catch (error) {
      console.error("Error updating AI provider config:", error);
      throw error;
    }
  }

  async deletePlanAiProviderConfig(id: number): Promise<boolean> {
    try {
      await db
        .delete(planAiProviderConfigs)
        .where(eq(planAiProviderConfigs.id, id));

      return true;
    } catch (error) {
      console.error(`Error deleting AI provider config with ID ${id}:`, error);
      return false;
    }
  }

  async getPlanAiUsageStats(companyId: number, planId: number, startDate?: Date, endDate?: Date): Promise<any> {
    try {
      const whereConditions = [
        eq(planAiUsageTracking.companyId, companyId),
        eq(planAiUsageTracking.planId, planId)
      ];

      if (startDate) {
        whereConditions.push(sql`${planAiUsageTracking.usageDate} >= ${startDate.toISOString().split('T')[0]}`);
      }
      if (endDate) {
        whereConditions.push(sql`${planAiUsageTracking.usageDate} <= ${endDate.toISOString().split('T')[0]}`);
      }

      const usageData = await db
        .select()
        .from(planAiUsageTracking)
        .where(and(...whereConditions))
        .orderBy(planAiUsageTracking.usageDate);

      let totalTokens = 0;
      let totalCost = 0;
      let totalRequests = 0;
      const byProvider: Record<string, { tokens: number; cost: number; requests: number }> = {};

      usageData.forEach((usage: PlanAiUsageTracking) => {
        const tokens = usage.tokensUsedMonthly || 0;
        const cost = parseFloat(usage.costMonthly || '0');
        const requests = usage.requestsMonthly || 0;

        totalTokens += tokens;
        totalCost += cost;
        totalRequests += requests;

        if (!byProvider[usage.provider]) {
          byProvider[usage.provider] = { tokens: 0, cost: 0, requests: 0 };
        }
        byProvider[usage.provider].tokens += tokens;
        byProvider[usage.provider].cost += cost;
        byProvider[usage.provider].requests += requests;
      });

      return {
        totalTokens,
        totalCost: Math.round(totalCost * 1000000) / 1000000,
        totalRequests,
        byProvider,
        rawData: usageData
      };
    } catch (error) {
      console.error(`Error getting AI usage stats for company ${companyId}, plan ${planId}:`, error);
      return {
        totalTokens: 0,
        totalCost: 0,
        totalRequests: 0,
        byProvider: {},
        rawData: []
      };
    }
  }

  async getAggregatedPlanAiUsageStats(planId: number, startDate?: Date, endDate?: Date): Promise<any> {
    try {
      const whereConditions = [
        eq(planAiUsageTracking.planId, planId)
      ];

      if (startDate) {
        whereConditions.push(sql`${planAiUsageTracking.usageDate} >= ${startDate.toISOString().split('T')[0]}`);
      }
      if (endDate) {
        whereConditions.push(sql`${planAiUsageTracking.usageDate} <= ${endDate.toISOString().split('T')[0]}`);
      }

      const usageData = await db
        .select()
        .from(planAiUsageTracking)
        .where(and(...whereConditions))
        .orderBy(planAiUsageTracking.usageDate);

      let totalTokens = 0;
      let totalCost = 0;
      let totalRequests = 0;
      const byProvider: Record<string, { tokens: number; cost: number; requests: number; companies: number }> = {};
      const byCompany: Record<number, { tokens: number; cost: number; requests: number }> = {};

      usageData.forEach((usage: PlanAiUsageTracking) => {
        const tokens = usage.tokensUsedMonthly || 0;
        const cost = parseFloat(usage.costMonthly || '0');
        const requests = usage.requestsMonthly || 0;

        totalTokens += tokens;
        totalCost += cost;
        totalRequests += requests;

        if (!byProvider[usage.provider]) {
          byProvider[usage.provider] = { tokens: 0, cost: 0, requests: 0, companies: 0 };
        }
        byProvider[usage.provider].tokens += tokens;
        byProvider[usage.provider].cost += cost;
        byProvider[usage.provider].requests += requests;

        if (!byCompany[usage.companyId]) {
          byCompany[usage.companyId] = { tokens: 0, cost: 0, requests: 0 };
          byProvider[usage.provider].companies += 1;
        }
        byCompany[usage.companyId].tokens += tokens;
        byCompany[usage.companyId].cost += cost;
        byCompany[usage.companyId].requests += requests;
      });

      return {
        totalTokens,
        totalCost: Math.round(totalCost * 1000000) / 1000000,
        totalRequests,
        totalCompanies: Object.keys(byCompany).length,
        byProvider,
        byCompany,
        rawData: usageData
      };
    } catch (error) {
      console.error(`Error getting aggregated AI usage stats for plan ${planId}:`, error);
      return {
        totalTokens: 0,
        totalCost: 0,
        totalRequests: 0,
        totalCompanies: 0,
        byProvider: {},
        byCompany: {},
        rawData: []
      };
    }
  }

  async getSystemAiUsageOverview(startDate?: Date, endDate?: Date): Promise<any> {
    try {
      const whereConditions = [];

      if (startDate) {
        whereConditions.push(sql`${planAiUsageTracking.usageDate} >= ${startDate.toISOString().split('T')[0]}`);
      }
      if (endDate) {
        whereConditions.push(sql`${planAiUsageTracking.usageDate} <= ${endDate.toISOString().split('T')[0]}`);
      }

      const usageData = await db
        .select()
        .from(planAiUsageTracking)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
        .orderBy(planAiUsageTracking.usageDate);

      let totalTokens = 0;
      let totalCost = 0;
      let totalRequests = 0;
      const byProvider: Record<string, { tokens: number; cost: number; requests: number; companies: Set<number>; plans: Set<number> }> = {};
      const byPlan: Record<number, { tokens: number; cost: number; requests: number; companies: Set<number> }> = {};
      const companies = new Set<number>();
      const plans = new Set<number>();

      usageData.forEach((usage: PlanAiUsageTracking) => {
        const tokens = usage.tokensUsedMonthly || 0;
        const cost = parseFloat(usage.costMonthly || '0');
        const requests = usage.requestsMonthly || 0;

        totalTokens += tokens;
        totalCost += cost;
        totalRequests += requests;
        companies.add(usage.companyId);
        plans.add(usage.planId);

        if (!byProvider[usage.provider]) {
          byProvider[usage.provider] = {
            tokens: 0,
            cost: 0,
            requests: 0,
            companies: new Set(),
            plans: new Set()
          };
        }
        byProvider[usage.provider].tokens += tokens;
        byProvider[usage.provider].cost += cost;
        byProvider[usage.provider].requests += requests;
        byProvider[usage.provider].companies.add(usage.companyId);
        byProvider[usage.provider].plans.add(usage.planId);

        if (!byPlan[usage.planId]) {
          byPlan[usage.planId] = {
            tokens: 0,
            cost: 0,
            requests: 0,
            companies: new Set()
          };
        }
        byPlan[usage.planId].tokens += tokens;
        byPlan[usage.planId].cost += cost;
        byPlan[usage.planId].requests += requests;
        byPlan[usage.planId].companies.add(usage.companyId);
      });

      const providerStats = Object.entries(byProvider).reduce((acc, [provider, stats]) => {
        acc[provider] = {
          tokens: stats.tokens,
          cost: Math.round(stats.cost * 1000000) / 1000000,
          requests: stats.requests,
          companies: stats.companies.size,
          plans: stats.plans.size
        };
        return acc;
      }, {} as Record<string, any>);

      const planStats = Object.entries(byPlan).reduce((acc, [planId, stats]) => {
        acc[planId] = {
          tokens: stats.tokens,
          cost: Math.round(stats.cost * 1000000) / 1000000,
          requests: stats.requests,
          companies: stats.companies.size
        };
        return acc;
      }, {} as Record<string, any>);

      return {
        totalTokens,
        totalCost: Math.round(totalCost * 1000000) / 1000000,
        totalRequests,
        totalCompanies: companies.size,
        totalPlans: plans.size,
        byProvider: providerStats,
        byPlan: planStats
      };
    } catch (error) {
      console.error('Error getting system AI usage overview:', error);
      return {
        totalTokens: 0,
        totalCost: 0,
        totalRequests: 0,
        totalCompanies: 0,
        totalPlans: 0,
        byProvider: {},
        byPlan: {}
      };
    }
  }

  async getGoogleTokens(userId: number, companyId: number): Promise<GoogleTokens | null> {
    try {
      const [tokens] = await db
        .select()
        .from(googleCalendarTokens)
        .where(
          and(
            eq(googleCalendarTokens.userId, userId),
            eq(googleCalendarTokens.companyId, companyId)
          )
        );

      if (!tokens) return null;

      return {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken || undefined,
        id_token: tokens.idToken || undefined,
        token_type: tokens.tokenType || undefined,
        expiry_date: tokens.expiryDate ? tokens.expiryDate.getTime() : undefined,
        scope: tokens.scope || undefined
      };
    } catch (error) {
      console.error('Error getting Google tokens:', error);
      return null;
    }
  }

  async saveGoogleTokens(userId: number, companyId: number, tokens: GoogleTokens): Promise<boolean> {
    try {
      const existingTokens = await this.getGoogleTokens(userId, companyId);

      if (existingTokens) {
        await db
          .update(googleCalendarTokens)
          .set({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || null,
            idToken: tokens.id_token || null,
            tokenType: tokens.token_type || null,
            expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            scope: tokens.scope || null,
            updatedAt: new Date()
          })
          .where(
            and(
              eq(googleCalendarTokens.userId, userId),
              eq(googleCalendarTokens.companyId, companyId)
            )
          );
      } else {
        await db
          .insert(googleCalendarTokens)
          .values({
            userId,
            companyId,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || null,
            idToken: tokens.id_token || null,
            tokenType: tokens.token_type || null,
            expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            scope: tokens.scope || null
          });
      }

      return true;
    } catch (error) {
      console.error('Error saving Google tokens:', error);
      return false;
    }
  }

  async deleteGoogleTokens(userId: number, companyId: number): Promise<boolean> {
    try {
      await db
        .delete(googleCalendarTokens)
        .where(
          and(
            eq(googleCalendarTokens.userId, userId),
            eq(googleCalendarTokens.companyId, companyId)
          )
        );

      return true;
    } catch (error) {
      console.error('Error deleting Google tokens:', error);
      return false;
    }
  }

  async getGoogleCalendarCredentials(companyId: number): Promise<any | null> {
    try {
      const setting = await this.getCompanySetting(companyId, 'google_calendar_credentials');
      return setting?.value || null;
    } catch (error) {
      console.error('Error getting Google Calendar credentials:', error);
      return null;
    }
  }

  async saveGoogleCalendarCredentials(companyId: number, credentials: any): Promise<boolean> {
    try {
      await this.saveCompanySetting(companyId, 'google_calendar_credentials', credentials);
      return true;
    } catch (error) {
      console.error('Error saving Google Calendar credentials:', error);
      return false;
    }
  }


  async getWhatsAppProxyConfig(companyId: number): Promise<WhatsAppProxyConfig | null> {
    try {
      const setting = await this.getCompanySetting(companyId, 'whatsapp_proxy_config');
      return (setting?.value as WhatsAppProxyConfig) || null;
    } catch (error) {
      console.error('Error getting WhatsApp proxy config:', { companyId, error });
      return null;
    }
  }

  async saveWhatsAppProxyConfig(companyId: number, config: WhatsAppProxyConfig): Promise<WhatsAppProxyConfig> {
    try {
      if (!companyId) throw new Error('companyId is required');
      if (!config) throw new Error('config is required');
      const saved = await this.saveCompanySetting(companyId, 'whatsapp_proxy_config', config);
      return saved.value as WhatsAppProxyConfig;
    } catch (error) {
      console.error('Error saving WhatsApp proxy config:', { companyId, error });
      throw error;
    }
  }

  async getWhatsappProxyServers(companyId: number): Promise<any[]> {
    try {
      const servers = await db
        .select()
        .from(whatsappProxyServers)
        .where(eq(whatsappProxyServers.companyId, companyId))
        .orderBy(desc(whatsappProxyServers.createdAt));
      return servers;
    } catch (error) {
      console.error('Error getting proxy servers:', error);
      return [];
    }
  }

  async getWhatsappProxyServer(id: number): Promise<any | null> {
    try {
      const [server] = await db
        .select()
        .from(whatsappProxyServers)
        .where(eq(whatsappProxyServers.id, id));
      return server || null;
    } catch (error) {
      console.error('Error getting proxy server:', error);
      return null;
    }
  }

  async createWhatsappProxyServer(data: any): Promise<any> {
    try {
      const [server] = await db
        .insert(whatsappProxyServers)
        .values({
          companyId: data.companyId,
          name: data.name,
          enabled: data.enabled ?? true,
          type: data.type,
          host: data.host,
          port: data.port,
          username: data.username || null,
          password: data.password || null,
          testStatus: data.testStatus || 'untested',
          lastTested: data.lastTested || null,
          description: data.description || null
        })
        .returning();
      return server;
    } catch (error) {
      console.error('Error creating proxy server:', error);
      throw error;
    }
  }

  async updateWhatsappProxyServer(id: number, updates: any): Promise<any> {
    try {
      const updateData: any = { updatedAt: new Date() };
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.enabled !== undefined) updateData.enabled = updates.enabled;
      if (updates.type !== undefined) updateData.type = updates.type;
      if (updates.host !== undefined) updateData.host = updates.host;
      if (updates.port !== undefined) updateData.port = updates.port;
      if (updates.username !== undefined) updateData.username = updates.username || null;
      if (updates.password !== undefined) updateData.password = updates.password || null;
      if (updates.testStatus !== undefined) updateData.testStatus = updates.testStatus;
      if (updates.lastTested !== undefined) updateData.lastTested = updates.lastTested;
      if (updates.description !== undefined) updateData.description = updates.description || null;

      const [server] = await db
        .update(whatsappProxyServers)
        .set(updateData)
        .where(eq(whatsappProxyServers.id, id))
        .returning();

      if (!server) {
        throw new Error('Proxy server not found');
      }
      return server;
    } catch (error) {
      console.error('Error updating proxy server:', error);
      throw error;
    }
  }

  async deleteWhatsappProxyServer(id: number): Promise<boolean> {
    try {
      await db
        .delete(whatsappProxyServers)
        .where(eq(whatsappProxyServers.id, id));
      return true;
    } catch (error) {
      console.error('Error deleting proxy server:', error);
      return false;
    }
  }

  async getZohoTokens(userId: number, companyId: number): Promise<ZohoTokens | null> {
    try {
      const [tokens] = await db
        .select()
        .from(zohoCalendarTokens)
        .where(
          and(
            eq(zohoCalendarTokens.userId, userId),
            eq(zohoCalendarTokens.companyId, companyId)
          )
        );

      if (!tokens) return null;

      return {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken || undefined,
        token_type: tokens.tokenType || undefined,
        expires_in: tokens.expiresIn || undefined,
        scope: tokens.scope || undefined,
        updatedAt: tokens.updatedAt
      };
    } catch (error) {
      console.error('Error getting Zoho tokens:', error);
      return null;
    }
  }

  async saveZohoTokens(userId: number, companyId: number, tokens: ZohoTokens): Promise<boolean> {
    try {
      const existingTokens = await this.getZohoTokens(userId, companyId);

      if (existingTokens) {
        await db
          .update(zohoCalendarTokens)
          .set({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || null,
            tokenType: tokens.token_type || null,
            expiresIn: tokens.expires_in || null,
            scope: tokens.scope || null,
            updatedAt: new Date()
          })
          .where(
            and(
              eq(zohoCalendarTokens.userId, userId),
              eq(zohoCalendarTokens.companyId, companyId)
            )
          );
      } else {
        await db
          .insert(zohoCalendarTokens)
          .values({
            userId,
            companyId,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || null,
            tokenType: tokens.token_type || null,
            expiresIn: tokens.expires_in || null,
            scope: tokens.scope || null
          });
      }

      return true;
    } catch (error) {
      console.error('Error saving Zoho tokens:', error);
      return false;
    }
  }

  async deleteZohoTokens(userId: number, companyId: number): Promise<boolean> {
    try {
      await db
        .delete(zohoCalendarTokens)
        .where(
          and(
            eq(zohoCalendarTokens.userId, userId),
            eq(zohoCalendarTokens.companyId, companyId)
          )
        );

      return true;
    } catch (error) {
      console.error('Error deleting Zoho tokens:', error);
      return false;
    }
  }

  async getCalendlyTokens(userId: number, companyId: number): Promise<CalendlyTokens | null> {
    try {
      const [tokens] = await db
        .select()
        .from(calendlyCalendarTokens)
        .where(
          and(
            eq(calendlyCalendarTokens.userId, userId),
            eq(calendlyCalendarTokens.companyId, companyId)
          )
        );

      if (!tokens) return null;

      return {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken || undefined,
        token_type: tokens.tokenType || undefined,
        expires_in: tokens.expiresIn || undefined,
        scope: tokens.scope || undefined,
        updatedAt: tokens.updatedAt
      };
    } catch (error) {
      console.error('Error getting Calendly tokens:', error);
      return null;
    }
  }

  async saveCalendlyTokens(userId: number, companyId: number, tokens: CalendlyTokens): Promise<boolean> {
    try {
      const existingTokens = await this.getCalendlyTokens(userId, companyId);

      if (existingTokens) {
        await db
          .update(calendlyCalendarTokens)
          .set({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || null,
            tokenType: tokens.token_type || null,
            expiresIn: tokens.expires_in || null,
            scope: tokens.scope || null,
            updatedAt: new Date()
          })
          .where(
            and(
              eq(calendlyCalendarTokens.userId, userId),
              eq(calendlyCalendarTokens.companyId, companyId)
            )
          );
      } else {
        await db.insert(calendlyCalendarTokens).values({
          userId,
          companyId,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || null,
          tokenType: tokens.token_type || null,
          expiresIn: tokens.expires_in || null,
          scope: tokens.scope || null
        });
      }

      return true;
    } catch (error) {
      console.error('Error saving Calendly tokens:', error);
      return false;
    }
  }

  async deleteCalendlyTokens(userId: number, companyId: number): Promise<boolean> {
    try {
      await db
        .delete(calendlyCalendarTokens)
        .where(
          and(
            eq(calendlyCalendarTokens.userId, userId),
            eq(calendlyCalendarTokens.companyId, companyId)
          )
        );

      return true;
    } catch (error) {
      console.error('Error deleting Calendly tokens:', error);
      return false;
    }
  }

  /**
   * Create a confirmed calendar booking record
   * @param bookingData Booking data including userId, companyId, calendarType, startDateTime, endDateTime, and optional eventId and eventLink
   * @returns Success status with bookingId or error message
   */
  async createCalendarBooking(bookingData: { userId: number; companyId: number; calendarType: string; startDateTime: Date; endDateTime: Date; eventId?: string; eventLink?: string }): Promise<{ success: boolean; bookingId?: number; error?: string }> {
    try {
      const [booking] = await db
        .insert(calendarBookings)
        .values({
          userId: bookingData.userId,
          companyId: bookingData.companyId,
          calendarType: bookingData.calendarType,
          startDateTime: bookingData.startDateTime,
          endDateTime: bookingData.endDateTime,
          eventId: bookingData.eventId || null,
          eventLink: bookingData.eventLink || null
        })
        .onConflictDoNothing()
        .returning();

      if (booking) {
        return { success: true, bookingId: booking.id };
      } else {
        return { success: false, error: 'Booking already exists or conflict detected' };
      }
    } catch (error: any) {

      if (error.code === '23505' || error.message?.includes('unique constraint') || error.message?.includes('duplicate key')) {
        return { success: false, error: 'Time slot is already booked' };
      }

      console.error('Error creating calendar booking:', error);
      return { success: false, error: error.message || 'Failed to create booking' };
    }
  }

  /**
   * Get all confirmed calendar bookings within a time range
   * @param userId The user ID
   * @param companyId The company ID
   * @param calendarType The calendar type ('google' or 'zoho')
   * @param startDateTime Start of the time range
   * @param endDateTime End of the time range
   * @returns Array of calendar bookings that overlap with the time range
   */
  async getCalendarBookings(userId: number, companyId: number, calendarType: string, startDateTime: Date, endDateTime: Date): Promise<CalendarBooking[]> {
    try {
      const bookings = await db
        .select()
        .from(calendarBookings)
        .where(
          and(
            eq(calendarBookings.userId, userId),
            eq(calendarBookings.companyId, companyId),
            eq(calendarBookings.calendarType, calendarType),


            lt(calendarBookings.startDateTime, endDateTime),
            gt(calendarBookings.endDateTime, startDateTime)
          )
        )
        .orderBy(calendarBookings.startDateTime);

      return bookings;
    } catch (error) {
      console.error('Error getting calendar bookings:', error);
      return [];
    }
  }

  /**
   * Delete a calendar booking by event ID
   * @param userId The user ID
   * @param companyId The company ID
   * @param calendarType The calendar type ('google' or 'zoho')
   * @param eventId The calendar provider's event ID
   * @returns True if deleted successfully, false otherwise
   */
  async deleteCalendarBooking(userId: number, companyId: number, calendarType: string, eventId: string): Promise<boolean> {
    try {
      await db
        .delete(calendarBookings)
        .where(
          and(
            eq(calendarBookings.userId, userId),
            eq(calendarBookings.companyId, companyId),
            eq(calendarBookings.calendarType, calendarType),
            eq(calendarBookings.eventId, eventId)
          )
        );

      return true;
    } catch (error) {
      console.error('Error deleting calendar booking:', error);
      return false;
    }
  }

  /**
   * Get a calendar booking by event ID
   * @param userId The user ID
   * @param companyId The company ID
   * @param calendarType The calendar type ('google' or 'zoho')
   * @param eventId The calendar provider's event ID
   * @returns The calendar booking if found, null otherwise
   */
  async getCalendarBookingByEventId(userId: number, companyId: number, calendarType: string, eventId: string): Promise<CalendarBooking | null> {
    try {
      const [booking] = await db
        .select()
        .from(calendarBookings)
        .where(
          and(
            eq(calendarBookings.userId, userId),
            eq(calendarBookings.companyId, companyId),
            eq(calendarBookings.calendarType, calendarType),
            eq(calendarBookings.eventId, eventId)
          )
        )
        .limit(1);

      return booking || null;
    } catch (error) {
      console.error('Error getting calendar booking by event ID:', error);
      return null;
    }
  }

  /**
   * Get a calendar booking by event link
   * @param userId The user ID
   * @param companyId The company ID
   * @param calendarType The calendar type ('google' or 'zoho')
   * @param eventLink The full calendar event link URL
   * @returns The calendar booking if found, null otherwise
   */
  async getCalendarBookingByEventLink(userId: number, companyId: number, calendarType: string, eventLink: string): Promise<CalendarBooking | null> {
    try {
      const [booking] = await db
        .select()
        .from(calendarBookings)
        .where(
          and(
            eq(calendarBookings.userId, userId),
            eq(calendarBookings.companyId, companyId),
            eq(calendarBookings.calendarType, calendarType),
            eq(calendarBookings.eventLink, eventLink)
          )
        )
        .limit(1);

      return booking || null;
    } catch (error) {
      console.error('Error getting calendar booking by event link:', error);
      return null;
    }
  }

  /**
   * Get recent calendar bookings ordered by creation date
   * @param userId The user ID
   * @param companyId The company ID
   * @param calendarType The calendar type ('google' or 'zoho')
   * @param limit Maximum number of bookings to return (default: 10)
   * @returns Array of recent calendar bookings
   */
  async getRecentCalendarBookings(userId: number, companyId: number, calendarType: string, limit: number = 10): Promise<CalendarBooking[]> {
    try {
      const bookings = await db
        .select()
        .from(calendarBookings)
        .where(
          and(
            eq(calendarBookings.userId, userId),
            eq(calendarBookings.companyId, companyId),
            eq(calendarBookings.calendarType, calendarType)
          )
        )
        .orderBy(desc(calendarBookings.createdAt))
        .limit(limit);

      return bookings;
    } catch (error) {
      console.error('Error getting recent calendar bookings:', error);
      return [];
    }
  }

  /**
   * Extract event ID from Google Calendar event link
   * @param eventLink The event link URL (e.g., https://www.google.com/calendar/event?eid=<eventId>)
   * @returns The extracted event ID or null if not found
   */
  extractEventIdFromLink(eventLink: string): string | null {
    try {
      if (!eventLink || typeof eventLink !== 'string') {
        return null;
      }


      const googleCalendarMatch = eventLink.match(/[?&]eid=([^&]+)/);
      if (googleCalendarMatch && googleCalendarMatch[1]) {
        let eidParam = decodeURIComponent(googleCalendarMatch[1]);



        try {

          let base64String = eidParam.replace(/-/g, '+').replace(/_/g, '/');


          const padding = base64String.length % 4;
          if (padding) {
            base64String += '='.repeat(4 - padding);
          }


          const decoded = Buffer.from(base64String, 'base64').toString('utf-8');


          const parts = decoded.split(' ');
          if (parts.length > 0 && parts[0]) {
            return parts[0];
          }
        } catch (decodeError) {


        }

        return eidParam;
      }


      const altGoogleMatch = eventLink.match(/calendar\.google\.com\/event\?eid=([^&]+)/);
      if (altGoogleMatch && altGoogleMatch[1]) {
        let eidParam = decodeURIComponent(altGoogleMatch[1]);


        try {
          let base64String = eidParam.replace(/-/g, '+').replace(/_/g, '/');
          const padding = base64String.length % 4;
          if (padding) {
            base64String += '='.repeat(4 - padding);
          }
          const decoded = Buffer.from(base64String, 'base64').toString('utf-8');
          const parts = decoded.split(' ');
          if (parts.length > 0 && parts[0]) {
            return parts[0];
          }
        } catch (decodeError) {

        }

        return eidParam;
      }


      if (eventLink.length > 0 && !eventLink.includes('http') && !eventLink.includes('/')) {
        return eventLink;
      }

      return null;
    } catch (error) {
      console.error('Error extracting event ID from link:', error);
      return null;
    }
  }

  /**
   * Check if a time slot conflicts with existing bookings
   * @param userId The user ID
   * @param companyId The company ID
   * @param calendarType The calendar type ('google' or 'zoho')
   * @param startDateTime Start of the time slot
   * @param endDateTime End of the time slot
   * @returns True if there's a conflict, false if the slot is available
   */
  async checkBookingConflict(userId: number, companyId: number, calendarType: string, startDateTime: Date, endDateTime: Date): Promise<boolean> {
    try {
      const conflictingBookings: CalendarBooking[] = await db
        .select()
        .from(calendarBookings)
        .where(
          and(
            eq(calendarBookings.userId, userId),
            eq(calendarBookings.companyId, companyId),
            eq(calendarBookings.calendarType, calendarType),


            lt(calendarBookings.startDateTime, endDateTime),
            gt(calendarBookings.endDateTime, startDateTime)
          )
        );

      if (conflictingBookings.length > 0) {
        return true;
      }

      return false;
    } catch (error: any) {
      console.error('Error checking booking conflict:', error.message);

      return true;
    }
  }

  /**
   * Generate a human-readable explanation of how two time ranges overlap
   * 
   * @param range1Start Start of first time range
   * @param range1End End of first time range
   * @param range2Start Start of second time range
   * @param range2End End of second time range
   * @returns String describing the overlap
   */
  private explainOverlap(range1Start: Date, range1End: Date, range2Start: Date, range2End: Date): string {
    const formatTime = (date: Date) => date.toISOString();

    const range1Str = `${formatTime(range1Start)} - ${formatTime(range1End)}`;
    const range2Str = `${formatTime(range2Start)} - ${formatTime(range2End)}`;


    const overlaps = range1Start.getTime() < range2End.getTime() && range1End.getTime() > range2Start.getTime();

    if (!overlaps) {
      return `Range 1 (${range1Str}) does not overlap with Range 2 (${range2Str})`;
    }


    if (range1Start.getTime() <= range2Start.getTime() && range1End.getTime() >= range2End.getTime()) {
      return `Range 1 (${range1Str}) fully contains Range 2 (${range2Str})`;
    } else if (range2Start.getTime() <= range1Start.getTime() && range2End.getTime() >= range1End.getTime()) {
      return `Range 2 (${range2Str}) fully contains Range 1 (${range1Str})`;
    } else if (range1Start.getTime() < range2Start.getTime()) {
      return `Range 1 (${range1Str}) overlaps with Range 2 (${range2Str}): Range 1 ends after Range 2 starts`;
    } else {
      return `Range 1 (${range1Str}) overlaps with Range 2 (${range2Str}): Range 2 ends after Range 1 starts`;
    }
  }

  async getUser(id: number): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user || undefined;
    } catch (error) {
      console.error("Error getting user by ID:", error);
      return undefined;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.username, username));
      return user || undefined;
    } catch (error) {
      console.error("Error getting user by username:", error);
      return undefined;
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.email, email));
      return user || undefined;
    } catch (error) {
      console.error("Error getting user by email:", error);
      return undefined;
    }
  }

  async getUserByUsernameOrEmail(credential: string): Promise<User | undefined> {
    try {
      const lowerCredential = credential.toLowerCase();

      const isEmail = lowerCredential.includes('@');

      if (isEmail) {
        const [user] = await db.select().from(users).where(
          sql`LOWER(${users.email}) = ${lowerCredential}`
        );
        return user || undefined;
      } else {
        const [user] = await db.select().from(users).where(
          sql`LOWER(${users.username}) = ${lowerCredential}`
        );
        return user || undefined;
      }
    } catch (error) {
      console.error("Error getting user by username or email:", error);
      return undefined;
    }
  }

  async getUserByUsernameCaseInsensitive(username: string): Promise<User | undefined> {
    try {
      const lowerUsername = username.toLowerCase();
      const [user] = await db.select().from(users).where(
        sql`LOWER(${users.username}) = ${lowerUsername}`
      );
      return user || undefined;
    } catch (error) {
      console.error("Error getting user by username (case-insensitive):", error);
      return undefined;
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    try {
      const [user] = await db.insert(users).values({
        ...insertUser,
        updatedAt: new Date()
      }).returning();

      return user;
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  }

  async updateUser(id: number, updates: Partial<InsertUser>): Promise<User> {
    try {
      const [updatedUser] = await db
        .update(users)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(users.id, id))
        .returning();

      if (!updatedUser) {
        throw new Error(`User with ID ${id} not found`);
      }

      return updatedUser;
    } catch (error) {
      console.error("Error updating user:", error);
      throw error;
    }
  }

  async updateUserPassword(id: number, newPassword: string, isAlreadyHashed: boolean = false): Promise<boolean> {
    try {
      let hashedPassword: string;

      if (isAlreadyHashed) {

        hashedPassword = newPassword;
      } else {

        const { hashPassword } = await import('./auth');
        hashedPassword = await hashPassword(newPassword);
      }

      const [updatedUser] = await db
        .update(users)
        .set({
          password: hashedPassword,
          updatedAt: new Date()
        })
        .where(eq(users.id, id))
        .returning();

      return !!updatedUser;
    } catch (error) {
      console.error("Error updating user password:", error);
      return false;
    }
  }

  async getChannelConnections(userId: number | null, companyId?: number): Promise<ChannelConnection[]> {
    if (userId === null && !companyId) {
      return db.select().from(channelConnections);
    }

    if (companyId) {
      if (userId) {
        return db.select().from(channelConnections).where(
          and(
            eq(channelConnections.companyId, companyId),
            eq(channelConnections.userId, userId)
          )
        );
      } else {
        return db.select().from(channelConnections).where(eq(channelConnections.companyId, companyId));
      }
    }

    return db.select().from(channelConnections).where(eq(channelConnections.userId, userId!));
  }

  async getChannelConnectionsByCompany(companyId: number): Promise<ChannelConnection[]> {
    const allConnections = await db.select().from(channelConnections);
    let result = await db.select().from(channelConnections).where(eq(channelConnections.companyId, companyId));

    const companyUsers = await db.select().from(users).where(eq(users.companyId, companyId));
    const userIds = companyUsers.map((u: User) => u.id);


    if (userIds.length > 0) {
      const legacyConnections = await db.select().from(channelConnections).where(
        and(
          inArray(channelConnections.userId, userIds),
          isNull(channelConnections.companyId)
        )
      );

      if (legacyConnections.length > 0) {

        for (const connection of legacyConnections) {
          await db.update(channelConnections)
            .set({ companyId: companyId, updatedAt: new Date() })
            .where(eq(channelConnections.id, connection.id));
        }

        result = [...result, ...legacyConnections.map((conn: ChannelConnection) => ({ ...conn, companyId }))];
      }
    }


    return result;
  }

  async getChannelConnectionsByType(channelType: string): Promise<ChannelConnection[]> {
    return db.select().from(channelConnections).where(eq(channelConnections.channelType, channelType));
  }

  async getTikTokConnectionIdsNeedingTokenRefresh(thresholdMs: number): Promise<number[]> {
    const rows = await db
      .select({ id: channelConnections.id })
      .from(channelConnections)
      .where(
        and(
          eq(channelConnections.channelType, 'tiktok'),
          inArray(channelConnections.status, ['active', 'connected']),
          sql`(connection_data->>'tokenExpiresAt')::bigint IS NOT NULL`,
          sql`(connection_data->>'tokenExpiresAt')::bigint < ${thresholdMs}`
        )
      );
    return rows.map((r: { id: number }) => r.id);
  }

  async getChannelConnection(id: number): Promise<ChannelConnection | undefined> {
    const [connection] = await db.select().from(channelConnections).where(eq(channelConnections.id, id));
    return connection;
  }

  async createChannelConnection(connection: InsertChannelConnection): Promise<ChannelConnection> {

    const connectionData = { ...connection };
    if (connectionData.channelType === 'messenger') {
      connectionData.status = 'active';
    }

    const [newConnection] = await db.insert(channelConnections).values(connectionData).returning();
    return newConnection;
  }

  async updateChannelConnectionStatus(id: number, status: string): Promise<ChannelConnection> {
    const [updatedConnection] = await db
      .update(channelConnections)
      .set({ status, updatedAt: new Date() })
      .where(eq(channelConnections.id, id))
      .returning();
    return updatedConnection;
  }

  /**
   * Ensure all existing Messenger channels are marked as active
   * This method is used to update existing Messenger channels that might be inactive
   */
  async ensureMessengerChannelsActive(): Promise<number> {
    const result = await db.update(channelConnections)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(channelConnections.channelType, 'messenger'));

    return result.rowCount || 0;
  }

  /**
   * Ensure all existing Instagram channels are marked as active
   * This method is used to update existing Instagram channels that might be inactive
   * Includes rows where status is null, connected, pending, or other non-error statuses
   */
  async ensureInstagramChannelsActive(): Promise<number> {
    const result = await db.update(channelConnections)
      .set({ status: 'active', updatedAt: new Date() })
      .where(
        and(
          eq(channelConnections.channelType, 'instagram'),
          or(
            isNull(channelConnections.status),
            not(inArray(channelConnections.status, ['error', 'disabled']))
          )
        )
      );

    return result.rowCount || 0;
  }

  async updateChannelConnectionName(id: number, accountName: string): Promise<ChannelConnection> {
    const [updatedConnection] = await db
      .update(channelConnections)
      .set({ accountName, updatedAt: new Date() })
      .where(eq(channelConnections.id, id))
      .returning();
    return updatedConnection;
  }

  async updateChannelConnection(id: number, updates: Partial<InsertChannelConnection>): Promise<ChannelConnection> {
    const [updatedConnection] = await db
      .update(channelConnections)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(channelConnections.id, id))
      .returning();
    return updatedConnection;
  }

  async deleteChannelConnection(id: number): Promise<boolean> {
    try {
      await db
        .delete(channelConnections)
        .where(eq(channelConnections.id, id));

      return true;
    } catch (error) {
      console.error('Error deleting channel connection:', error);
      return false;
    }
  }



  async getContacts(options?: { page?: number; limit?: number; search?: string; channel?: string; tags?: string[]; companyId?: number; includeArchived?: boolean; archivedOnly?: boolean; dateRange?: string; userId?: number; contactScope?: 'own' | 'assigned' | 'company' }): Promise<{ contacts: Contact[]; total: number }> {
    try {


      const page = options?.page || 1;
      const limit = options?.limit || 10;
      const offset = (page - 1) * limit;

      let whereConditions = undefined;

      const companyCondition = options?.companyId ? eq(contacts.companyId, options.companyId) : undefined;


      let scopeCondition = undefined;
      if (options?.contactScope && options?.userId && options?.companyId) {
        if (options.contactScope === 'own') {

          scopeCondition = eq(contacts.createdBy, options.userId);
        } else if (options.contactScope === 'assigned') {

          scopeCondition = sql`EXISTS (
            SELECT 1 FROM ${conversations}
            WHERE ${conversations.contactId} = ${contacts.id}
            AND ${conversations.companyId} = ${options.companyId}
            AND ${conversations.assignedToUserId} = ${options.userId}
          )`;
        }

      }


      let archiveCondition = undefined;
      if (options?.archivedOnly) {

        archiveCondition = eq(contacts.isArchived, true);
      } else if (!options?.includeArchived) {

        archiveCondition = eq(contacts.isArchived, false);
      }



      let dateRangeCondition = undefined;
      if (options?.dateRange && options.dateRange !== 'all') {
        const now = new Date();
        let startDate: Date | undefined;

        switch (options.dateRange) {
          case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case 'yesterday':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            dateRangeCondition = and(
              gte(contacts.createdAt, startDate),
              lte(contacts.createdAt, endOfYesterday)
            );
            break;
          case 'last7days':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'last30days':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case 'last90days':
            startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
          case 'thismonth':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          case 'lastmonth':
            const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
            dateRangeCondition = and(
              gte(contacts.createdAt, lastMonth),
              lte(contacts.createdAt, endOfLastMonth)
            );
            break;
        }


        if (startDate && !dateRangeCondition) {
          dateRangeCondition = gte(contacts.createdAt, startDate);
        }

        if (dateRangeCondition) {

        }
      }

      const phoneNumberFilter = and(
        or(
          isNull(contacts.phone),
          and(
            sql`${contacts.phone} NOT LIKE 'LID-%'`,
            sql`LENGTH(REGEXP_REPLACE(${contacts.phone}, '[^0-9]', '', 'g')) >= 7`,
            sql`LENGTH(REGEXP_REPLACE(${contacts.phone}, '[^0-9]', '', 'g')) <= 14`,
            sql`NOT (LENGTH(REGEXP_REPLACE(${contacts.phone}, '[^0-9]', '', 'g')) >= 15 AND REGEXP_REPLACE(${contacts.phone}, '[^0-9]', '', 'g') ~ '^120[0-9]+$')`
          )
        )
      );



      let tagCondition = null;
      if (options?.tags && options.tags.length > 0) {
        const validTags = options.tags
          .filter(tag => tag && typeof tag === 'string' && tag.trim().length > 0)
          .map(tag => tag.trim().toLowerCase());

        if (validTags.length > 0) {
          const tagConditions = validTags.map(filterTag =>
            sql`EXISTS (
              SELECT 1
              FROM unnest(${contacts.tags}) AS contact_tag
              WHERE lower(trim(coalesce(contact_tag, ''))) = ${filterTag}
            )`
          );

          if (tagConditions.length === 1) {
            tagCondition = tagConditions[0];
          } else {
            tagCondition = tagConditions.reduce((acc, condition, index) => {
              if (index === 0) return condition;
              return sql`${acc} OR ${condition}`;
            });
          }

          tagCondition = sql`
            ${contacts.tags} IS NOT NULL
            AND array_length(${contacts.tags}, 1) > 0
            AND (${tagCondition})
          `;
        }
      }

      if (options?.search) {
        const searchTerm = `%${options.search}%`;
        const searchCondition = or(
          sql`${contacts.name} ILIKE ${searchTerm}`,
          sql`${contacts.email} ILIKE ${searchTerm}`,
          sql`${contacts.phone} ILIKE ${searchTerm}`
        );


        const conditions = [];
        if (companyCondition) {

          conditions.push(companyCondition);
        }
        if (scopeCondition) {
          conditions.push(scopeCondition);
        }
        if (archiveCondition) {

          conditions.push(archiveCondition);
        }
        if (phoneNumberFilter) {

          conditions.push(phoneNumberFilter);
        }
        if (searchCondition) {

          conditions.push(searchCondition);
        }
        if (options?.channel) {


          if (options.channel === 'whatsapp_official' || options.channel === 'whatsapp_unofficial') {



            if (options.channel === 'whatsapp_official') {

              conditions.push(
                or(
                  eq(contacts.identifierType, 'whatsapp_official'),
                  and(
                    eq(contacts.identifierType, 'whatsapp'),
                    eq(contacts.source, 'whatsapp_official')
                  )
                )
              );
            } else if (options.channel === 'whatsapp_unofficial') {

              conditions.push(
                or(
                  eq(contacts.identifierType, 'whatsapp_unofficial'),
                  and(
                    eq(contacts.identifierType, 'whatsapp'),
                    or(
                      eq(contacts.source, 'whatsapp'),
                      isNull(contacts.source)
                    )
                  )
                )
              );
            }
          } else {

            conditions.push(eq(contacts.identifierType, options.channel));
          }
        }
        if (tagCondition) {

          conditions.push(tagCondition);
        }
        if (dateRangeCondition) {

          conditions.push(dateRangeCondition);
        }

        whereConditions = conditions.length > 0 ? and(...conditions) : undefined;
      } else {

        const conditions = [];
        if (companyCondition) {

          conditions.push(companyCondition);
        }
        if (scopeCondition) {
          conditions.push(scopeCondition);
        }
        if (archiveCondition) {

          conditions.push(archiveCondition);
        }
        if (phoneNumberFilter) {

          conditions.push(phoneNumberFilter);
        }
        if (options?.channel) {


          if (options.channel === 'whatsapp_official' || options.channel === 'whatsapp_unofficial') {



            if (options.channel === 'whatsapp_official') {

              conditions.push(
                or(
                  eq(contacts.identifierType, 'whatsapp_official'),
                  and(
                    eq(contacts.identifierType, 'whatsapp'),
                    eq(contacts.source, 'whatsapp_official')
                  )
                )
              );
            } else if (options.channel === 'whatsapp_unofficial') {

              conditions.push(
                or(
                  eq(contacts.identifierType, 'whatsapp_unofficial'),
                  and(
                    eq(contacts.identifierType, 'whatsapp'),
                    or(
                      eq(contacts.source, 'whatsapp'),
                      isNull(contacts.source)
                    )
                  )
                )
              );
            }
          } else {

            conditions.push(eq(contacts.identifierType, options.channel));
          }
        }
        if (tagCondition) {

          conditions.push(tagCondition);
        }
        if (dateRangeCondition) {

          conditions.push(dateRangeCondition);
        }

        whereConditions = conditions.length > 0 ? and(...conditions) : undefined;
      }

      let totalCount = 0;
      if (whereConditions) {
        const countResult = await db
          .select({ count: sql`COUNT(*)::int` })
          .from(contacts)
          .where(whereConditions);
        totalCount = Number(countResult[0]?.count || 0);
      } else {
        const countResult = await db
          .select({ count: sql`COUNT(*)::int` })
          .from(contacts);
        totalCount = Number(countResult[0]?.count || 0);
      }

      let contactsList: Contact[] = [];
      if (whereConditions) {

        contactsList = await db
          .select()
          .from(contacts)
          .where(whereConditions)
          .orderBy(desc(contacts.updatedAt))
          .limit(limit)
          .offset(offset);
      } else {

        contactsList = await db
          .select()
          .from(contacts)
          .orderBy(desc(contacts.updatedAt))
          .limit(limit)
          .offset(offset);
      }



      return {
        contacts: contactsList,
        total: totalCount
      };
    } catch (error) {
      console.error('[Storage] Error getting contacts:', error);
      return { contacts: [], total: 0 };
    }
  }

  async getContact(id: number): Promise<Contact | undefined> {
    try {
      if (!id || typeof id !== 'number' || id <= 0) {
        console.error(`Invalid contact ID: ${id}`);
        return undefined;
      }

      const result = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, id));

      const [contact] = result;
      return contact;
    } catch (error) {
      console.error(`Error fetching contact with ID ${id}:`, error);
      console.error("Error details:", error instanceof Error ? error.message : String(error));
      return undefined;
    }
  }

  async deleteContact(id: number): Promise<{ success: boolean; mediaFiles?: string[]; error?: string }> {
    try {
      const conversationList = await db.select().from(conversations).where(eq(conversations.contactId, id));
      const mediaFiles: string[] = [];


      for (const conversation of conversationList) {
        const messagesWithMedia = await db
          .select({
            id: messages.id,
            mediaUrl: messages.mediaUrl,
            metadata: messages.metadata
          })
          .from(messages)
          .where(eq(messages.conversationId, conversation.id));

        messagesWithMedia.forEach((msg: { id: number; mediaUrl: string | null; metadata: unknown }) => {
          if (msg.mediaUrl) {
            mediaFiles.push(msg.mediaUrl);
          }

          if (msg.metadata) {
            try {
              const metadata = typeof msg.metadata === 'string'
                ? JSON.parse(msg.metadata)
                : msg.metadata;

              if (metadata.mediaUrl) {
                mediaFiles.push(metadata.mediaUrl);
              }
            } catch (e) {

            }
          }
        });
      }

      await db.transaction(async (tx: any) => {
        for (const conversation of conversationList) {
          await tx.delete(messages).where(eq(messages.conversationId, conversation.id));
        }

        if (conversationList.length > 0) {
          await tx.delete(conversations).where(eq(conversations.contactId, id));
        }

        await tx.delete(notes).where(eq(notes.contactId, id));

        await tx.delete(deals).where(eq(deals.contactId, id));

        await tx.delete(contacts).where(eq(contacts.id, id));
      });

      return {
        success: true,
        mediaFiles: Array.from(new Set(mediaFiles)) // Remove duplicates
      };
    } catch (error) {
      console.error("Error deleting contact:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getContactByIdentifier(identifier: string, identifierType: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(
      and(
        eq(contacts.identifier, identifier),
        eq(contacts.identifierType, identifierType)
      )
    );
    return contact;
  }

  async getContactByEmail(email: string, companyId: number): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(
      and(
        eq(contacts.email, email),
        eq(contacts.companyId, companyId)
      )
    );
    return contact;
  }

  async getContactByPhone(phone: string, companyId: number): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(
      and(
        eq(contacts.phone, phone),
        eq(contacts.companyId, companyId)
      )
    );
    return contact;
  }

  async createContact(contact: InsertContact): Promise<Contact> {
    try {
      const [newContact] = await db.insert(contacts).values(contact).returning();
      return newContact;
    } catch (error: any) {

      if (error.code === '23505' && error.constraint === 'idx_contacts_unique_identifier_company') {

        const existingContact = await this.getContactByIdentifier(contact.identifier!, contact.identifierType!);
        if (existingContact && existingContact.companyId === contact.companyId) {
          return existingContact;
        }
      }
      throw error;
    }
  }

  async getOrCreateContact(contact: InsertContact): Promise<Contact> {

    if (contact.identifier && contact.identifierType && contact.companyId) {
      const existingByIdentifier = await this.getContactByIdentifier(contact.identifier, contact.identifierType);
      if (existingByIdentifier && existingByIdentifier.companyId === contact.companyId) {

        const updateData: Partial<InsertContact> = {};
        if (contact.phone && !existingByIdentifier.phone) {

          updateData.phone = contact.identifierType === 'messenger' ? contact.phone : (this.normalizePhoneNumber(contact.phone) || contact.phone);
        }
        if (contact.email && !existingByIdentifier.email) {
          updateData.email = contact.email;
        }
        if (contact.name && contact.name !== existingByIdentifier.phone && (!existingByIdentifier.name || existingByIdentifier.name === existingByIdentifier.phone)) {
          updateData.name = contact.name;
        }
        if (contact.avatarUrl && !existingByIdentifier.avatarUrl) {
          updateData.avatarUrl = contact.avatarUrl;
        }

        if (Object.keys(updateData).length > 0) {
          return await this.updateContact(existingByIdentifier.id, updateData);
        }
        return existingByIdentifier;
      }
    }


    if (contact.phone && contact.companyId) {

      const phoneToSearch = contact.identifierType === 'messenger' ? contact.phone : this.normalizePhoneNumber(contact.phone);

      if (phoneToSearch) {
        const existingByPhone = await this.getContactByPhone(phoneToSearch, contact.companyId);
        if (existingByPhone) {

          const shouldUpdate = (
            (contact.name && contact.name !== existingByPhone.phone && (!existingByPhone.name || existingByPhone.name === existingByPhone.phone)) ||
            (contact.email && !existingByPhone.email) ||
            (contact.avatarUrl && !existingByPhone.avatarUrl) ||
            (contact.identifier && !existingByPhone.identifier)
          );

          if (shouldUpdate) {
            const updateData: Partial<InsertContact> = {};
            if (contact.name && contact.name !== existingByPhone.phone && (!existingByPhone.name || existingByPhone.name === existingByPhone.phone)) {
              updateData.name = contact.name;
            }
            if (contact.email && !existingByPhone.email) {
              updateData.email = contact.email;
            }
            if (contact.avatarUrl && !existingByPhone.avatarUrl) {
              updateData.avatarUrl = contact.avatarUrl;
            }
            if (contact.identifier && !existingByPhone.identifier) {
              updateData.identifier = contact.identifier;
              updateData.identifierType = contact.identifierType;
            }

            if (Object.keys(updateData).length > 0) {
              return await this.updateContact(existingByPhone.id, updateData);
            }
          }
          return existingByPhone;
        }
      }
    }


    if (contact.email && contact.companyId) {
      const existingByEmail = await this.getContactByEmail(contact.email, contact.companyId);
      if (existingByEmail) {

        const updateData: Partial<InsertContact> = {};
        if (contact.phone && !existingByEmail.phone) {

          updateData.phone = contact.identifierType === 'messenger' ? contact.phone : (this.normalizePhoneNumber(contact.phone) || contact.phone);
        }
        if (contact.identifier && !existingByEmail.identifier) {
          updateData.identifier = contact.identifier;
          updateData.identifierType = contact.identifierType;
        }
        if (contact.name && contact.name !== existingByEmail.phone && (!existingByEmail.name || existingByEmail.name === existingByEmail.phone)) {
          updateData.name = contact.name;
        }
        if (contact.avatarUrl && !existingByEmail.avatarUrl) {
          updateData.avatarUrl = contact.avatarUrl;
        }

        if (Object.keys(updateData).length > 0) {
          return await this.updateContact(existingByEmail.id, updateData);
        }
        return existingByEmail;
      }
    }


    const contactToCreate = {
      ...contact,

      phone: contact.phone ? (
        contact.identifierType === 'messenger' ? contact.phone : (this.normalizePhoneNumber(contact.phone) || contact.phone)
      ) : contact.phone
    };


    try {
      return await this.createContact(contactToCreate);
    } catch (error: any) {
      console.error('Failed to create contact, attempting one more lookup:', error.message);


      if (contactToCreate.identifier && contactToCreate.identifierType && contactToCreate.companyId) {
        const finalCheck = await this.getContactByIdentifier(contactToCreate.identifier, contactToCreate.identifierType);
        if (finalCheck && finalCheck.companyId === contactToCreate.companyId) {

          return finalCheck;
        }
      }

      throw error;
    }
  }

  private normalizePhoneNumber(phone: string): string | null {
    if (!phone) return null;


    let normalized = phone.replace(/[^\d+]/g, '');


    if (normalized.startsWith('+')) {
      return normalized;
    }


    if (normalized.length > 10) {
      return '+' + normalized;
    }


    return normalized || null;
  }

  async updateContact(id: number, updates: Partial<InsertContact>): Promise<Contact> {
    const [updatedContact] = await db
      .update(contacts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(contacts.id, id))
      .returning();


    if (updates.tags !== undefined) {
      try {
        const contactDeals = await this.getDealsByContact(id);
        if (contactDeals.length > 0) {

          await db
            .update(deals)
            .set({
              tags: updates.tags || null,
              updatedAt: new Date()
            })
            .where(eq(deals.contactId, id));
        }
      } catch (error) {

        console.error(`Error syncing contact tags to deals for contact ${id}:`, error);
      }
    }

    return updatedContact;
  }

  async getConversations(options?: { companyId?: number; page?: number; limit?: number; search?: string; assignedToUserId?: number }): Promise<{ conversations: Conversation[]; total: number }> {
    try {
      const page = options?.page || 1;
      const limit = options?.limit || 50;
      const offset = (page - 1) * limit;

      const whereConditions = [];

      if (options?.companyId) {
        whereConditions.push(eq(conversations.companyId, options.companyId));
      }

      if (options?.assignedToUserId) {
        whereConditions.push(eq(conversations.assignedToUserId, options.assignedToUserId));
      }

      if (options?.search) {
        whereConditions.push(
          or(
            sql`${conversations.status} ILIKE ${`%${options.search}%`}`,
            sql`${conversations.channelType} ILIKE ${`%${options.search}%`}`
          )
        );
      }



      whereConditions.push(
        or(
          eq(conversations.isGroup, false),
          isNull(conversations.isGroup)
        )
      );


      whereConditions.push(isNull(conversations.groupJid));



      whereConditions.push(ne(conversations.channelType, 'email'));

      const totalQuery = db
        .select({ count: count() })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id));

      const totalResult = await totalQuery.where(
        and(
          ...whereConditions,

          or(
            isNull(contacts.phone),

            eq(conversations.channelType, 'instagram'),
            eq(conversations.channelType, 'messenger'),
            eq(conversations.channelType, 'facebook'),

            and(
              ne(conversations.channelType, 'instagram'),
              ne(conversations.channelType, 'messenger'),
              ne(conversations.channelType, 'facebook'),
              or(
                sql`NOT (LENGTH(REGEXP_REPLACE(${contacts.phone}, '[^0-9]', '', 'g')) >= 15 AND REGEXP_REPLACE(${contacts.phone}, '[^0-9]', '', 'g') ~ '^120[0-9]+$')`,
                sql`NOT (LENGTH(REGEXP_REPLACE(${contacts.identifier}, '[^0-9]', '', 'g')) >= 15 AND REGEXP_REPLACE(${contacts.identifier}, '[^0-9]', '', 'g') ~ '^120[0-9]+$')`
              )
            )
          )
        )
      );
      const [{ count: totalCount }] = totalResult;

      const conversationsQuery = db
        .select({
          id: conversations.id,
          contactId: conversations.contactId,
          channelId: conversations.channelId,
          channelType: conversations.channelType,
          companyId: conversations.companyId,
          status: conversations.status,
          lastMessageAt: conversations.lastMessageAt,
          isGroup: conversations.isGroup,
          groupJid: conversations.groupJid,
          groupName: conversations.groupName,
          groupDescription: conversations.groupDescription,
          groupParticipantCount: conversations.groupParticipantCount,
          groupCreatedAt: conversations.groupCreatedAt,
          groupMetadata: conversations.groupMetadata,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
          assignedToUserId: conversations.assignedToUserId,
          unreadCount: conversations.unreadCount,
          botDisabled: conversations.botDisabled,
          disabledAt: conversations.disabledAt,
          disableDuration: conversations.disableDuration,
          disableReason: conversations.disableReason,
          isHistorySync: conversations.isHistorySync,
          historySyncBatchId: conversations.historySyncBatchId,
          isStarred: conversations.isStarred,
          isArchived: conversations.isArchived,
          starredAt: conversations.starredAt,
          archivedAt: conversations.archivedAt
        })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(
          and(
            ...whereConditions,

            or(
              isNull(contacts.phone),

              eq(conversations.channelType, 'instagram'),
              eq(conversations.channelType, 'messenger'),
              eq(conversations.channelType, 'facebook'),

              and(
                ne(conversations.channelType, 'instagram'),
                ne(conversations.channelType, 'messenger'),
                ne(conversations.channelType, 'facebook'),
                or(
                  sql`NOT (LENGTH(REGEXP_REPLACE(${contacts.phone}, '[^0-9]', '', 'g')) >= 15 AND REGEXP_REPLACE(${contacts.phone}, '[^0-9]', '', 'g') ~ '^120[0-9]+$')`,
                  sql`NOT (LENGTH(REGEXP_REPLACE(${contacts.identifier}, '[^0-9]', '', 'g')) >= 15 AND REGEXP_REPLACE(${contacts.identifier}, '[^0-9]', '', 'g') ~ '^120[0-9]+$')`
                )
              )
            )
          )
        )
        .orderBy(desc(conversations.lastMessageAt))
        .limit(limit)
        .offset(offset);

      const conversationsList = await conversationsQuery;

      return {
        conversations: conversationsList,
        total: Number(totalCount)
      };
    } catch (error) {
      console.error('Error getting conversations:', error);
      return { conversations: [], total: 0 };
    }
  }

  async getConversation(id: number): Promise<Conversation | undefined> {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conversation;
  }

  async getConversationsByContact(contactId: number): Promise<Conversation[]> {

    const contact = await this.getContact(contactId);
    if (contact && (isWhatsAppGroupChatId(contact.phone) || isWhatsAppGroupChatId(contact.identifier))) {
      return [];
    }

    return db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.contactId, contactId),
          or(
            eq(conversations.isGroup, false),
            isNull(conversations.isGroup)
          ),
          isNull(conversations.groupJid)
        )
      )
      .orderBy(desc(conversations.lastMessageAt));
  }

  async getConversationByContactAndChannel(contactId: number, channelId: number): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.contactId, contactId),
          eq(conversations.channelId, channelId)
        )
      );
    return conversation;
  }

  async getGroupConversations(options?: { companyId?: number; page?: number; limit?: number; search?: string }): Promise<{ conversations: Conversation[]; total: number }> {
    try {
      const page = options?.page || 1;
      const limit = options?.limit || 50;
      const offset = (page - 1) * limit;

      const whereConditions = [];

      if (options?.companyId) {
        whereConditions.push(eq(conversations.companyId, options.companyId));
      }

      if (options?.search) {
        whereConditions.push(
          or(
            sql`${conversations.groupName} ILIKE ${`%${options.search}%`}`,
            sql`${conversations.groupDescription} ILIKE ${`%${options.search}%`}`,
            sql`${conversations.channelType} ILIKE ${`%${options.search}%`}`
          )
        );
      }

      whereConditions.push(eq(conversations.isGroup, true));
      whereConditions.push(sql`${conversations.groupJid} IS NOT NULL`);

      const totalQuery = db
        .select({ count: count() })
        .from(conversations)
        .where(and(...whereConditions));

      const [{ count: totalCount }] = await totalQuery;

      const conversationsQuery = db
        .select({
          id: conversations.id,
          contactId: conversations.contactId,
          channelId: conversations.channelId,
          channelType: conversations.channelType,
          companyId: conversations.companyId,
          status: conversations.status,
          lastMessageAt: conversations.lastMessageAt,
          isGroup: conversations.isGroup,
          groupJid: conversations.groupJid,
          groupName: conversations.groupName,
          groupDescription: conversations.groupDescription,
          groupParticipantCount: conversations.groupParticipantCount,
          groupCreatedAt: conversations.groupCreatedAt,
          groupMetadata: conversations.groupMetadata,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
          assignedToUserId: conversations.assignedToUserId,
          unreadCount: conversations.unreadCount,
          botDisabled: conversations.botDisabled,
          disabledAt: conversations.disabledAt,
          disableDuration: conversations.disableDuration,
          disableReason: conversations.disableReason,
          isHistorySync: conversations.isHistorySync,
          historySyncBatchId: conversations.historySyncBatchId,
          isStarred: conversations.isStarred,
          isArchived: conversations.isArchived,
          starredAt: conversations.starredAt,
          archivedAt: conversations.archivedAt
        })
        .from(conversations)
        .where(and(...whereConditions))
        .orderBy(desc(conversations.lastMessageAt))
        .limit(limit)
        .offset(offset);

      const conversationsList = await conversationsQuery;

      return {
        conversations: conversationsList,
        total: Number(totalCount)
      };
    } catch (error) {
      console.error('Error getting group conversations:', error);
      return { conversations: [], total: 0 };
    }
  }

  async createConversation(conversation: InsertConversation): Promise<Conversation> {
    const [newConversation] = await db.insert(conversations).values(conversation).returning();
    return newConversation;
  }

  async updateConversation(id: number, updates: Partial<InsertConversation>): Promise<Conversation> {
    const [updatedConversation] = await db
      .update(conversations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return updatedConversation;
  }

  async getConversationByGroupJid(groupJid: string): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.isGroup, true),
          eq(conversations.groupJid, groupJid)
        )
      );
    return conversation;
  }

  async upsertGroupParticipant(data: {
    conversationId: number;
    contactId?: number;
    participantJid: string;
    participantName?: string;
    isAdmin?: boolean;
    isSuperAdmin?: boolean;
    isActive?: boolean;
  }): Promise<GroupParticipant> {
    const [existing] = await db
      .select()
      .from(groupParticipants)
      .where(
        and(
          eq(groupParticipants.conversationId, data.conversationId),
          eq(groupParticipants.participantJid, data.participantJid)
        )
      );

    if (existing) {
      const [updated] = await db
        .update(groupParticipants)
        .set({
          contactId: data.contactId,
          participantName: data.participantName,
          isAdmin: data.isAdmin ?? false,
          isSuperAdmin: data.isSuperAdmin ?? false,
          isActive: data.isActive ?? true,
          updatedAt: new Date()
        })
        .where(eq(groupParticipants.id, existing.id))
        .returning();

      return updated;
    } else {
      const [created] = await db
        .insert(groupParticipants)
        .values({
          conversationId: data.conversationId,
          contactId: data.contactId,
          participantJid: data.participantJid,
          participantName: data.participantName,
          isAdmin: data.isAdmin ?? false,
          isSuperAdmin: data.isSuperAdmin ?? false,
          isActive: data.isActive ?? true
        })
        .returning();

      return created;
    }
  }

  async syncGroupParticipantsFromMetadata(conversationId: number, groupMetadata: any): Promise<void> {
    if (!groupMetadata?.participants) {
      return;
    }

    const conversation = await this.getConversation(conversationId);
    if (!conversation || !conversation.isGroup) {
      return;
    }


    for (const participant of groupMetadata.participants) {
      const participantJid = participant.id;
      const rawId = participantJid.split('@')[0];


      const isLidFormat = participantJid.includes('@lid');
      const isWhatsAppFormat = participantJid.includes('@s.whatsapp.net');


      let phoneNumber = rawId;
      if (isLidFormat) {
        phoneNumber = `LID-${rawId}`;
      }

      const isAdmin = participant.admin === 'admin';
      const isSuperAdmin = participant.admin === 'superadmin';


      const displayName = participant.displayName;
      const profilePictureUrl = participant.profilePictureUrl;
      const status = participant.status;


      let participantName = displayName && displayName !== rawId && displayName !== phoneNumber ? displayName : phoneNumber;


      let contact = await this.getContactByIdentifier(phoneNumber, 'whatsapp');

      if (contact) {

        const shouldUpdate = (
          (displayName && displayName !== phoneNumber && contact.name === contact.phone) ||
          (profilePictureUrl && !contact.avatarUrl)
        );

        if (shouldUpdate) {
          const updateData: any = {};
          if (displayName && displayName !== phoneNumber && contact.name === contact.phone) {
            updateData.name = displayName;
          }
          if (profilePictureUrl && !contact.avatarUrl) {
            updateData.avatarUrl = profilePictureUrl;
          }

          contact = await this.updateContact(contact.id, updateData);
        }


        participantName = contact.name;
      } else {

        const contactData: InsertContact = {
          companyId: conversation.companyId,
          name: participantName,
          phone: phoneNumber,
          email: null,
          avatarUrl: profilePictureUrl,
          identifier: phoneNumber,
          identifierType: 'whatsapp',
          source: 'whatsapp',
          notes: status ? `Status: ${status}` : null
        };
        contact = await this.getOrCreateContact(contactData);
      }


      await this.upsertGroupParticipant({
        conversationId: conversationId,
        contactId: contact.id,
        participantJid: participantJid,
        participantName: contact.name,
        isAdmin: isAdmin,
        isSuperAdmin: isSuperAdmin,
        isActive: true
      });
    }
  }

  async getGroupParticipants(conversationId: number): Promise<any[]> {
    return db
      .select({
        id: groupParticipants.id,
        conversationId: groupParticipants.conversationId,
        contactId: groupParticipants.contactId,
        participantJid: groupParticipants.participantJid,
        participantName: groupParticipants.participantName,
        isAdmin: groupParticipants.isAdmin,
        isSuperAdmin: groupParticipants.isSuperAdmin,
        joinedAt: groupParticipants.joinedAt,
        leftAt: groupParticipants.leftAt,
        isActive: groupParticipants.isActive,
        createdAt: groupParticipants.createdAt,
        updatedAt: groupParticipants.updatedAt,

        contact: {
          id: contacts.id,
          name: contacts.name,
          phone: contacts.phone,
          email: contacts.email,
          avatarUrl: contacts.avatarUrl,
          notes: contacts.notes
        }
      })
      .from(groupParticipants)
      .leftJoin(contacts, eq(groupParticipants.contactId, contacts.id))
      .where(
        and(
          eq(groupParticipants.conversationId, conversationId),
          eq(groupParticipants.isActive, true)
        )
      )
      .orderBy(
        desc(groupParticipants.isSuperAdmin),
        desc(groupParticipants.isAdmin),
        asc(groupParticipants.participantName)
      );
  }

  async getMessagesByConversation(conversationId: number): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.sentAt, messages.createdAt, messages.id);
  }

  async getMessagesByConversationPaginated(conversationId: number, limit: number, offset: number): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.sentAt), desc(messages.createdAt), desc(messages.id))
      .limit(limit)
      .offset(offset);
  }

  async getMessagesCountByConversation(conversationId: number): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));
    return Number(result[0]?.count || 0);
  }


  async getMessagesByConversationWithCompanyValidation(conversationId: number, companyId: number): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(conversations.companyId, companyId)
        )
      )
      .orderBy(messages.sentAt, messages.createdAt, messages.id)
      .then((results: Array<{ messages: Message; conversations: Conversation }>) => results.map((result: { messages: Message; conversations: Conversation }) => result.messages));
  }

  async getMessagesByConversationPaginatedWithCompanyValidation(conversationId: number, companyId: number, limit: number, offset: number): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(conversations.companyId, companyId)
        )
      )
      .orderBy(desc(messages.sentAt), desc(messages.createdAt), desc(messages.id))
      .limit(limit)
      .offset(offset)
      .then((results: Array<{ messages: Message; conversations: Conversation }>) => results.map((result: { messages: Message; conversations: Conversation }) => result.messages));
  }

  async getMessagesCountByConversationWithCompanyValidation(conversationId: number, companyId: number): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(conversations.companyId, companyId)
        )
      );
    return Number(result[0]?.count || 0);
  }

  async getMessageById(id: number): Promise<Message | undefined> {
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, id));
    return message;
  }

  async getMessageByExternalId(externalId: string, companyId?: number): Promise<Message | undefined> {
    if (companyId) {
      const result = await db
        .select()
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(
          and(
            eq(messages.externalId, externalId),
            eq(conversations.companyId, companyId)
          )
        )
        .limit(1);

      return result[0]?.messages;
    } else {
      const result = await db
        .select()
        .from(messages)
        .where(eq(messages.externalId, externalId))
        .limit(1);

      return result[0];
    }
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    try {
      const [newMessage] = await db.insert(messages).values(message).returning();

      await db
        .update(conversations)
        .set({
          lastMessageAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(conversations.id, message.conversationId));

      if (message.direction === 'inbound' && !message.isFromBot) {
        await this.updateConversationUnreadCount(message.conversationId);
      }

      return newMessage;
    } catch (error: any) {



      throw error;
    }
  }

  async updateMessage(id: number, updates: Partial<InsertMessage>): Promise<Message> {
    const [updatedMessage] = await db
      .update(messages)
      .set(updates)
      .where(eq(messages.id, id))
      .returning();
    return updatedMessage;
  }

  async deleteMessage(id: number): Promise<boolean> {
    try {
      await db.delete(messages).where(eq(messages.id, id));
      return true;
    } catch (error) {
      console.error('Error deleting message:', error);
      return false;
    }
  }

  async deleteConversation(id: number): Promise<boolean> {
    try {
      await db.transaction(async (tx: any) => {

        await tx.delete(messages).where(eq(messages.conversationId, id));


        await tx.delete(conversations).where(eq(conversations.id, id));
      });
      return true;
    } catch (error) {
      console.error('Error deleting conversation:', error);
      return false;
    }
  }


  async getAffiliatesByCompany(companyId: number): Promise<any[]> {
    try {
      const affiliateList = await db
        .select()
        .from(affiliates)
        .where(eq(affiliates.companyId, companyId));

      return affiliateList;
    } catch (error) {
      console.error('Error getting affiliates by company:', error);
      throw error;
    }
  }

  async getAffiliateEarningsBalance(companyId: number, affiliateId: number): Promise<any> {
    try {
      const [balance] = await db
        .select()
        .from(affiliateEarningsBalance)
        .where(and(
          eq(affiliateEarningsBalance.companyId, companyId),
          eq(affiliateEarningsBalance.affiliateId, affiliateId)
        ))
        .limit(1);

      if (!balance) {

        const [newBalance] = await db
          .insert(affiliateEarningsBalance)
          .values({
            companyId,
            affiliateId,
            totalEarned: "0.00",
            availableBalance: "0.00",
            appliedToPlans: "0.00",
            pendingPayout: "0.00",
            paidOut: "0.00"
          })
          .returning();
        return newBalance;
      }

      return balance;
    } catch (error) {
      console.error('Error getting affiliate earnings balance:', error);
      throw error;
    }
  }

  async updateAffiliateEarningsBalance(companyId: number, affiliateId: number, balanceData: any): Promise<any> {
    try {
      const [updatedBalance] = await db
        .update(affiliateEarningsBalance)
        .set({
          ...balanceData,
          lastUpdated: new Date()
        })
        .where(and(
          eq(affiliateEarningsBalance.companyId, companyId),
          eq(affiliateEarningsBalance.affiliateId, affiliateId)
        ))
        .returning();

      return updatedBalance;
    } catch (error) {
      console.error('Error updating affiliate earnings balance:', error);
      throw error;
    }
  }

  async createAffiliateEarningsTransaction(transactionData: any): Promise<any> {
    try {
      const [transaction] = await db
        .insert(affiliateEarningsTransactions)
        .values(transactionData)
        .returning();

      return transaction;
    } catch (error) {
      console.error('Error creating affiliate earnings transaction:', error);
      throw error;
    }
  }

  async getAffiliateEarningsTransactions(affiliateId: number, limit: number = 50): Promise<any[]> {
    try {
      const transactions = await db
        .select()
        .from(affiliateEarningsTransactions)
        .where(eq(affiliateEarningsTransactions.affiliateId, affiliateId))
        .orderBy(desc(affiliateEarningsTransactions.createdAt))
        .limit(limit);

      return transactions;
    } catch (error) {
      console.error('Error getting affiliate earnings transactions:', error);
      throw error;
    }
  }

  async applyAffiliateCreditsToPayment(
    companyId: number,
    affiliateId: number,
    amount: number,
    paymentTransactionId: number
  ): Promise<boolean> {
    try {
      return await db.transaction(async (tx: any) => {

        const [balance] = await tx
          .select()
          .from(affiliateEarningsBalance)
          .where(and(
            eq(affiliateEarningsBalance.companyId, companyId),
            eq(affiliateEarningsBalance.affiliateId, affiliateId)
          ))
          .limit(1);

        if (!balance || Number(balance.availableBalance) < amount) {
          throw new Error('Insufficient affiliate balance');
        }


        const newAvailableBalance = Number(balance.availableBalance) - amount;
        const newAppliedToPlans = Number(balance.appliedToPlans) + amount;

        await tx
          .update(affiliateEarningsBalance)
          .set({
            availableBalance: newAvailableBalance.toString(),
            appliedToPlans: newAppliedToPlans.toString(),
            lastUpdated: new Date()
          })
          .where(and(
            eq(affiliateEarningsBalance.companyId, companyId),
            eq(affiliateEarningsBalance.affiliateId, affiliateId)
          ));


        await tx
          .insert(affiliateEarningsTransactions)
          .values({
            companyId,
            affiliateId,
            transactionType: 'applied_to_plan',
            amount: amount.toString(),
            balanceAfter: newAvailableBalance.toString(),
            paymentTransactionId,
            description: `Applied $${amount} affiliate credits to plan purchase`
          });

        return true;
      });
    } catch (error) {
      console.error('Error applying affiliate credits to payment:', error);
      return false;
    }
  }

  async clearConversationHistory(conversationId: number): Promise<{ success: boolean; deletedCount: number; mediaFiles: string[] }> {
    try {
      const messagesWithMedia = await db
        .select({
          id: messages.id,
          mediaUrl: messages.mediaUrl,
          metadata: messages.metadata
        })
        .from(messages)
        .where(eq(messages.conversationId, conversationId));

      const mediaFiles: string[] = [];
      messagesWithMedia.forEach((msg: { id: number; mediaUrl: string | null; metadata: unknown }) => {
        if (msg.mediaUrl) {
          mediaFiles.push(msg.mediaUrl);
        }

        if (msg.metadata) {
          try {
            const metadata = typeof msg.metadata === 'string'
              ? JSON.parse(msg.metadata)
              : msg.metadata;

            if (metadata.mediaUrl) {
              mediaFiles.push(metadata.mediaUrl);
            }
          } catch (e) {
          }
        }
      });

      const deleteResult = await db
        .delete(messages)
        .where(eq(messages.conversationId, conversationId));

      await db
        .update(conversations)
        .set({
          unreadCount: 0,
          lastMessageAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(conversations.id, conversationId));

      return {
        success: true,
        deletedCount: deleteResult.rowCount || 0,
        mediaFiles: Array.from(new Set(mediaFiles))
      };
    } catch (error) {
      console.error('Error clearing conversation history:', error);
      return {
        success: false,
        deletedCount: 0,
        mediaFiles: []
      };
    }
  }

  async getMessageByWhatsAppId(conversationId: number, whatsappMessageId: string): Promise<Message | undefined> {
    const [message] = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.externalId, whatsappMessageId)
        )
      );
    return message;
  }

  async markConversationAsRead(conversationId: number): Promise<void> {
    const now = new Date();

    await db
      .update(messages)
      .set({ readAt: now })
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.direction, 'inbound'),
          isNull(messages.readAt)
        )
      );

    await db
      .update(conversations)
      .set({
        unreadCount: 0,
        updatedAt: now
      })
      .where(eq(conversations.id, conversationId));
  }

  async getUnreadCount(conversationId: number): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.direction, 'inbound'),
          isNull(messages.readAt),
          or(
            eq(messages.isFromBot, false),
            isNull(messages.isFromBot)
          )
        )
      );

    return result?.count || 0;
  }

  async getAllUnreadCounts(userId: number): Promise<{ conversationId: number; unreadCount: number }[]> {
    const results = await db
      .select({
        conversationId: conversations.id,
        unreadCount: conversations.unreadCount
      })
      .from(conversations)
      .leftJoin(channelConnections, eq(conversations.channelId, channelConnections.id))
      .where(
        and(
          eq(channelConnections.userId, userId),
          gt(conversations.unreadCount, 0)
        )
      );

    return results.map((result: { conversationId: number; unreadCount: number | null }) => ({
      ...result,
      unreadCount: result.unreadCount ?? 0
    }));
  }

  async updateConversationUnreadCount(conversationId: number): Promise<void> {
    const [result] = await db
      .select({ count: count() })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.direction, 'inbound'),
          isNull(messages.readAt),
          or(
            eq(messages.isFromBot, false),
            isNull(messages.isFromBot)
          )
        )
      );

    const unreadCount = result?.count || 0;

    await db
      .update(conversations)
      .set({
        unreadCount,
        updatedAt: new Date()
      })
      .where(eq(conversations.id, conversationId));
  }

  async getNotesByContact(contactId: number): Promise<Note[]> {
    return db
      .select()
      .from(notes)
      .where(eq(notes.contactId, contactId))
      .orderBy(desc(notes.createdAt));
  }

  async createNote(note: InsertNote): Promise<Note> {
    const [newNote] = await db.insert(notes).values(note).returning();
    return newNote;
  }

  async getFlows(userId: number): Promise<Flow[]> {
    return db
      .select()
      .from(flows)
      .where(eq(flows.userId, userId))
      .orderBy(desc(flows.updatedAt));
  }

  async getFlowsByCompany(companyId: number): Promise<Flow[]> {
    return db
      .select()
      .from(flows)
      .where(eq(flows.companyId, companyId))
      .orderBy(desc(flows.updatedAt));
  }

  async getFlow(id: number): Promise<Flow | undefined> {
    const [flow] = await db.select().from(flows).where(eq(flows.id, id));
    return flow;
  }

  async createFlow(flow: InsertFlow): Promise<Flow> {
    const [newFlow] = await db.insert(flows).values(flow).returning();
    return newFlow;
  }

  async updateFlow(id: number, updates: Partial<InsertFlow>): Promise<Flow> {
    const currentFlow = await this.getFlow(id);
    if (!currentFlow) {
      throw new Error(`Flow with id ${id} not found`);
    }

    const [updatedFlow] = await db
      .update(flows)
      .set({
        ...updates,
        updatedAt: new Date(),
        version: currentFlow.version + 1
      })
      .where(eq(flows.id, id))
      .returning();

    return updatedFlow;
  }

  async deleteFlow(id: number): Promise<boolean> {
    try {
      const assignments = await this.getFlowAssignments(undefined, id);
      for (const assignment of assignments) {
        await this.deleteFlowAssignment(assignment.id);
      }

      await db.delete(flows).where(eq(flows.id, id));
      return true;
    } catch (error) {
      console.error('Error deleting flow:', error);
      return false;
    }
  }

  async getFlowAssignments(channelId?: number, flowId?: number): Promise<FlowAssignment[]> {
    if (channelId !== undefined && flowId !== undefined) {
      return db
        .select()
        .from(flowAssignments)
        .where(
          and(
            eq(flowAssignments.channelId, channelId),
            eq(flowAssignments.flowId, flowId)
          )
        )
        .orderBy(flowAssignments.createdAt);
    } else if (channelId !== undefined) {
      return db
        .select()
        .from(flowAssignments)
        .where(eq(flowAssignments.channelId, channelId))
        .orderBy(flowAssignments.createdAt);
    } else if (flowId !== undefined) {
      return db
        .select()
        .from(flowAssignments)
        .where(eq(flowAssignments.flowId, flowId))
        .orderBy(flowAssignments.createdAt);
    } else {
      return db
        .select()
        .from(flowAssignments)
        .orderBy(flowAssignments.createdAt);
    }
  }

  async getFlowAssignment(id: number): Promise<FlowAssignment | undefined> {
    const [assignment] = await db
      .select()
      .from(flowAssignments)
      .where(eq(flowAssignments.id, id));

    return assignment;
  }

  async createFlowAssignment(assignment: InsertFlowAssignment): Promise<FlowAssignment> {
    const flow = await this.getFlow(assignment.flowId);
    if (!flow) {
      throw new Error(`Flow with id ${assignment.flowId} not found`);
    }

    const channel = await this.getChannelConnection(assignment.channelId);
    if (!channel) {
      throw new Error(`Channel with id ${assignment.channelId} not found`);
    }


    const existingAssignments = await this.getFlowAssignments(assignment.channelId, assignment.flowId);
    if (existingAssignments.length > 0) {
      throw new Error(`A flow assignment already exists for this channel and flow combination`);
    }


    const existingFlowAssignments = await this.getFlowAssignments(undefined, assignment.flowId);
    if (existingFlowAssignments.length > 0) {
      const existingChannel = await this.getChannelConnection(existingFlowAssignments[0].channelId);
      const existingChannelName = existingChannel ?
        `${existingChannel.accountName} (${existingChannel.channelType})` :
        `Channel ID ${existingFlowAssignments[0].channelId}`;
      throw new Error(`This flow is already assigned to ${existingChannelName}. A flow can only be assigned to one channel at a time.`);
    }

    const [newAssignment] = await db
      .insert(flowAssignments)
      .values(assignment)
      .returning();

    return newAssignment;
  }

  async updateFlowAssignmentStatus(id: number, isActive: boolean): Promise<FlowAssignment> {
    const assignment = await this.getFlowAssignment(id);
    if (!assignment) {
      throw new Error(`Flow assignment with id ${id} not found`);
    }

    if (isActive) {

      const otherActiveAssignments = await db
        .select()
        .from(flowAssignments)
        .where(
          and(
            eq(flowAssignments.channelId, assignment.channelId),
            eq(flowAssignments.isActive, true)
          )
        );

      for (const otherAssignment of otherActiveAssignments) {
        if (otherAssignment.id !== id) {

          await db
            .update(flowAssignments)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(flowAssignments.id, otherAssignment.id));
        }
      }


      const flowActiveOnOtherChannels = await db
        .select()
        .from(flowAssignments)
        .where(
          and(
            eq(flowAssignments.flowId, assignment.flowId),
            eq(flowAssignments.isActive, true),
            ne(flowAssignments.channelId, assignment.channelId)
          )
        );

      if (flowActiveOnOtherChannels.length > 0) {
        const otherChannel = await this.getChannelConnection(flowActiveOnOtherChannels[0].channelId);
        const otherChannelName = otherChannel ?
          `${otherChannel.accountName} (${otherChannel.channelType})` :
          `Channel ID ${flowActiveOnOtherChannels[0].channelId}`;
        throw new Error(`This flow is already active on ${otherChannelName}. A flow can only be active on one channel at a time.`);
      }
    }

    const [updatedAssignment] = await db
      .update(flowAssignments)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(flowAssignments.id, id))
      .returning();

    return updatedAssignment;
  }

  async deleteFlowAssignment(id: number): Promise<boolean> {
    try {
      await db
        .delete(flowAssignments)
        .where(eq(flowAssignments.id, id));

      return true;
    } catch (error) {
      console.error('Error deleting flow assignment:', error);
      return false;
    }
  }

  async getAllTeamMembers(): Promise<User[]> {
    try {
      return await db.select().from(users);
    } catch (error) {
      console.error('Error getting all team members:', error);
      return [];
    }
  }

  async getActiveTeamMembers(): Promise<User[]> {
    try {
      return await db
        .select()
        .from(users)
        .where(eq(users.active, true))
        .orderBy(users.fullName);
    } catch (error) {
      console.error('Error getting active team members:', error);
      return [];
    }
  }

  async getTeamMembersByCompany(companyId: number): Promise<User[]> {
    try {
      return await db
        .select()
        .from(users)
        .where(eq(users.companyId, companyId))
        .orderBy(users.fullName);
    } catch (error) {
      console.error(`Error getting team members for company ${companyId}:`, error);
      return [];
    }
  }

  async getActiveTeamMembersByCompany(companyId: number): Promise<User[]> {
    try {
      return await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.companyId, companyId),
            eq(users.active, true)
          )
        )
        .orderBy(users.fullName);
    } catch (error) {
      console.error(`Error getting active team members for company ${companyId}:`, error);
      return [];
    }
  }

  async getTeamInvitations(companyId?: number): Promise<TeamInvitation[]> {
    try {
      if (companyId) {
        return await db
          .select()
          .from(teamInvitations)
          .where(eq(teamInvitations.companyId, companyId))
          .orderBy(desc(teamInvitations.createdAt));
      } else {
        return await db
          .select()
          .from(teamInvitations)
          .orderBy(desc(teamInvitations.createdAt));
      }
    } catch (error) {
      console.error('Error getting team invitations:', error);
      return [];
    }
  }

  async getTeamInvitationByEmail(email: string): Promise<TeamInvitation | undefined> {
    try {
      const [invitation] = await db
        .select()
        .from(teamInvitations)
        .where(
          and(
            eq(teamInvitations.email, email),
            eq(teamInvitations.status, 'pending')
          )
        );
      return invitation;
    } catch (error) {
      console.error('Error getting team invitation by email:', error);
      return undefined;
    }
  }

  async getTeamInvitationByToken(token: string): Promise<TeamInvitation | undefined> {
    try {
      const [invitation] = await db
        .select()
        .from(teamInvitations)
        .where(eq(teamInvitations.token, token));
      return invitation;
    } catch (error) {
      console.error('Error getting team invitation by token:', error);
      return undefined;
    }
  }

  async createTeamInvitation(invitation: InsertTeamInvitation): Promise<TeamInvitation> {
    try {
      const [newInvitation] = await db
        .insert(teamInvitations)
        .values(invitation)
        .returning();
      return newInvitation;
    } catch (error) {
      console.error('Error creating team invitation:', error);
      throw error;
    }
  }

  async updateTeamInvitationStatus(id: number, status: 'pending' | 'accepted' | 'expired' | 'revoked'): Promise<TeamInvitation> {
    try {
      if (!['pending', 'accepted', 'expired', 'revoked'].includes(status)) {
        throw new Error(`Invalid invitation status: ${status}. Must be one of: pending, accepted, expired, revoked`);
      }

      const existingInvitation = await db
        .select()
        .from(teamInvitations)
        .where(eq(teamInvitations.id, id))
        .limit(1);

      if (!existingInvitation || existingInvitation.length === 0) {
        throw new Error(`Team invitation with id ${id} not found`);
      }

      const [updatedInvitation] = await db
        .update(teamInvitations)
        .set({
          status,
          updatedAt: new Date()
        })
        .where(eq(teamInvitations.id, id))
        .returning();

      if (!updatedInvitation) {
        throw new Error(`Failed to update team invitation with id ${id}`);
      }

      return updatedInvitation;
    } catch (error) {
      console.error('Error updating team invitation status:', error);
      throw error;
    }
  }

  async deleteDealActivity(id: number): Promise<boolean> {
    try {
      await db
        .delete(dealActivities)
        .where(eq(dealActivities.id, id));
      return true;
    } catch (error) {
      console.error(`Error deleting deal activity with ID ${id}:`, error);
      return false;
    }
  }

  async deleteTeamInvitation(id: number): Promise<boolean> {
    try {
      await db
        .delete(teamInvitations)
        .where(eq(teamInvitations.id, id));

      return true;
    } catch (error) {
      console.error('Error deleting team invitation:', error);
      return false;
    }
  }

  async getConversationsCount(): Promise<number> {
    try {
      const result = await db
        .select({ count: sql`count(*)` })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(
          and(
            or(
              eq(conversations.isGroup, false),
              isNull(conversations.isGroup)
            ),
            isNull(conversations.groupJid),

            ne(conversations.channelType, 'email'),
            or(
              isNull(contacts.phone),

              eq(conversations.channelType, 'instagram'),
              eq(conversations.channelType, 'messenger'),
              eq(conversations.channelType, 'facebook'),

              and(
                ne(conversations.channelType, 'instagram'),
                ne(conversations.channelType, 'messenger'),
                ne(conversations.channelType, 'facebook'),
                or(
                  sql`NOT (LENGTH(REGEXP_REPLACE(${contacts.phone}, '[^0-9]', '', 'g')) >= 15 AND REGEXP_REPLACE(${contacts.phone}, '[^0-9]', '', 'g') ~ '^120[0-9]+$')`,
                  sql`NOT (LENGTH(REGEXP_REPLACE(${contacts.identifier}, '[^0-9]', '', 'g')) >= 15 AND REGEXP_REPLACE(${contacts.identifier}, '[^0-9]', '', 'g') ~ '^120[0-9]+$')`
                )
              )
            )
          )
        );
      return parseInt(String(result[0].count));
    } catch (error) {
      console.error('Error getting conversations count:', error);
      return 0;
    }
  }

  async getConversationsCountByCompany(companyId: number): Promise<number> {
    try {
      const result = await db
        .select({ count: sql`count(*)` })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(
          and(
            eq(conversations.companyId, companyId),
            or(
              eq(conversations.isGroup, false),
              isNull(conversations.isGroup)
            ),
            isNull(conversations.groupJid),

            ne(conversations.channelType, 'email'),
            or(
              isNull(contacts.phone),

              eq(conversations.channelType, 'instagram'),
              eq(conversations.channelType, 'messenger'),
              eq(conversations.channelType, 'facebook'),

              and(
                ne(conversations.channelType, 'instagram'),
                ne(conversations.channelType, 'messenger'),
                ne(conversations.channelType, 'facebook'),
                or(
                  sql`NOT (LENGTH(REGEXP_REPLACE(${contacts.phone}, '[^0-9]', '', 'g')) >= 15 AND REGEXP_REPLACE(${contacts.phone}, '[^0-9]', '', 'g') ~ '^120[0-9]+$')`,
                  sql`NOT (LENGTH(REGEXP_REPLACE(${contacts.identifier}, '[^0-9]', '', 'g')) >= 15 AND REGEXP_REPLACE(${contacts.identifier}, '[^0-9]', '', 'g') ~ '^120[0-9]+$')`
                )
              )
            )
          )
        );
      return parseInt(String(result[0].count));
    } catch (error) {
      console.error('Error getting conversations count by company:', error);
      return 0;
    }
  }

  async getMessagesCount(): Promise<number> {
    try {
      const result = await db
        .select({ count: sql`count(*)` })
        .from(messages);
      return parseInt(String(result[0].count));
    } catch (error) {
      console.error('Error getting messages count:', error);
      return 0;
    }
  }

  async getMessagesCountByCompany(companyId: number): Promise<number> {
    try {
      const result = await db
        .select({ count: sql`count(*)` })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(eq(conversations.companyId, companyId));
      return parseInt(String(result[0].count));
    } catch (error) {
      console.error('Error getting messages count by company:', error);
      return 0;
    }
  }

  async getConversationsCountByCompanyAndDateRange(companyId: number, startDate: Date, endDate: Date): Promise<number> {
    try {
      const result = await db
        .select({ count: sql`count(*)` })
        .from(conversations)
        .leftJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(
          and(
            eq(conversations.companyId, companyId),
            gte(conversations.createdAt, startDate),
            lte(conversations.createdAt, endDate),
            or(
              eq(conversations.isGroup, false),
              isNull(conversations.isGroup)
            ),
            isNull(conversations.groupJid),
            ne(conversations.channelType, 'email'),
            or(
              isNull(contacts.phone),

              eq(conversations.channelType, 'instagram'),
              eq(conversations.channelType, 'messenger'),
              eq(conversations.channelType, 'facebook'),

              and(
                ne(conversations.channelType, 'instagram'),
                ne(conversations.channelType, 'messenger'),
                ne(conversations.channelType, 'facebook'),
                or(
                  sql`NOT (LENGTH(REGEXP_REPLACE(${contacts.phone}, '[^0-9]', '', 'g')) >= 15 AND REGEXP_REPLACE(${contacts.phone}, '[^0-9]', '', 'g') ~ '^120[0-9]+$')`,
                  sql`NOT (LENGTH(REGEXP_REPLACE(${contacts.identifier}, '[^0-9]', '', 'g')) >= 15 AND REGEXP_REPLACE(${contacts.identifier}, '[^0-9]', '', 'g') ~ '^120[0-9]+$')`
                )
              )
            )
          )
        );
      return parseInt(String(result[0].count));
    } catch (error) {
      console.error('Error getting conversations count by company and date range:', error);
      return 0;
    }
  }

  async getMessagesCountByCompanyAndDateRange(companyId: number, startDate: Date, endDate: Date): Promise<number> {
    try {
      const result = await db
        .select({ count: sql`count(*)` })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(
          and(
            eq(conversations.companyId, companyId),
            gte(messages.createdAt, startDate),
            lte(messages.createdAt, endDate)
          )
        );
      return parseInt(String(result[0].count));
    } catch (error) {
      console.error('Error getting messages count by company and date range:', error);
      return 0;
    }
  }

  async getContactsCountByCompanyAndDateRange(companyId: number, startDate: Date, endDate: Date): Promise<number> {
    try {
      const result = await db
        .select({ count: sql`count(*)` })
        .from(contacts)
        .where(
          and(
            eq(contacts.companyId, companyId),
            gte(contacts.createdAt, startDate),
            lte(contacts.createdAt, endDate)
          )
        );
      return parseInt(String(result[0].count));
    } catch (error) {
      console.error('Error getting contacts count by company and date range:', error);
      return 0;
    }
  }

  async getConversationsByDay(days: number): Promise<any[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const result = await db
        .select({
          date: sql`date_trunc('day', ${conversations.createdAt})`,
          channelType: conversations.channelType,
          count: sql`count(*)`
        })
        .from(conversations)
        .where(sql`${conversations.createdAt} >= ${startDate}`)
        .groupBy(sql`date_trunc('day', ${conversations.createdAt})`, conversations.channelType)
        .orderBy(sql`date_trunc('day', ${conversations.createdAt})`);

      const dateMap = new Map<string, Record<string, any>>();

      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - (days - 1 - i));
        date.setHours(0, 0, 0, 0);
        const dateStr = date.toISOString().split('T')[0];
        dateMap.set(dateStr, {
          name: dateStr,
          whatsapp_official: 0,
          whatsapp_unofficial: 0,
          messenger: 0,
          instagram: 0,
          email: 0
        });
      }

      result.forEach((row: { date: unknown; channelType: string | null; count: unknown }) => {
        if (row.date) {
          const date = new Date(String(row.date)).toISOString().split('T')[0];
          const channelType = String(row.channelType);
          const count = parseInt(String(row.count));

          if (dateMap.has(date)) {
            const dayData = dateMap.get(date);
            if (dayData) {
              dayData[channelType] = count;
            }
          }
        }
      });

      return Array.from(dateMap.values());
    } catch (error) {
      console.error('Error getting conversations by day:', error);
      return [];
    }
  }

  async getConversationsByDayByCompany(companyId: number, days: number): Promise<any[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const result = await db
        .select({
          date: sql`date_trunc('day', ${conversations.createdAt})`,
          channelType: conversations.channelType,
          count: sql`count(*)`
        })
        .from(conversations)
        .where(
          and(
            sql`${conversations.createdAt} >= ${startDate}`,
            eq(conversations.companyId, companyId)
          )
        )
        .groupBy(sql`date_trunc('day', ${conversations.createdAt})`, conversations.channelType)
        .orderBy(sql`date_trunc('day', ${conversations.createdAt})`);

      const dateMap = new Map<string, Record<string, any>>();

      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - (days - 1 - i));
        date.setHours(0, 0, 0, 0);
        const dateStr = date.toISOString().split('T')[0];
        dateMap.set(dateStr, {
          name: dateStr,
          whatsapp_official: 0,
          whatsapp_unofficial: 0,
          messenger: 0,
          instagram: 0,
          email: 0
        });
      }

      result.forEach((row: { date: unknown; channelType: string | null; count: unknown }) => {
        if (row.date) {
          const date = new Date(String(row.date)).toISOString().split('T')[0];
          const channelType = String(row.channelType);
          const count = parseInt(String(row.count));

          if (dateMap.has(date)) {
            const dayData = dateMap.get(date);
            if (dayData) {
              dayData[channelType] = count;
            }
          }
        }
      });

      return Array.from(dateMap.values());
    } catch (error) {
      console.error('Error getting conversations by day by company:', error);
      return [];
    }
  }

  async getConversationsByDayByCompanyAndDateRange(companyId: number, startDate: Date, endDate: Date): Promise<any[]> {
    try {
      const result = await db
        .select({
          date: sql`date_trunc('day', ${conversations.createdAt})`,
          channelType: conversations.channelType,
          count: sql`count(*)`
        })
        .from(conversations)
        .where(
          and(
            eq(conversations.companyId, companyId),
            gte(conversations.createdAt, startDate),
            lte(conversations.createdAt, endDate)
          )
        )
        .groupBy(sql`date_trunc('day', ${conversations.createdAt})`, conversations.channelType)
        .orderBy(sql`date_trunc('day', ${conversations.createdAt})`);


      const dateMap = new Map<string, Record<string, any>>();
      const currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        dateMap.set(dateStr, {
          name: dateStr,
          whatsapp_official: 0,
          whatsapp_unofficial: 0,
          messenger: 0,
          instagram: 0,
          email: 0
        });
        currentDate.setDate(currentDate.getDate() + 1);
      }


      result.forEach((row: { date: unknown; channelType: string | null; count: unknown }) => {
        if (row.date) {
          const date = new Date(String(row.date)).toISOString().split('T')[0];
          const channelType = String(row.channelType);
          const count = parseInt(String(row.count));

          if (dateMap.has(date)) {
            const dayData = dateMap.get(date);
            if (dayData) {
              dayData[channelType] = count;
            }
          }
        }
      });

      return Array.from(dateMap.values());
    } catch (error) {
      console.error('Error getting conversations by day by company and date range:', error);
      return [];
    }
  }

  async getMessagesByChannel(): Promise<any[]> {
    try {
      const result = await db
        .select({
          channelType: conversations.channelType,
          count: sql`count(*)`
        })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .groupBy(conversations.channelType);

      return result.map((row: { channelType: string | null; count: unknown }) => ({
        name: String(row.channelType),
        value: parseInt(String(row.count))
      }));
    } catch (error) {
      console.error('Error getting messages by channel:', error);
      return [];
    }
  }

  async getMessagesByChannelByCompany(companyId: number): Promise<any[]> {
    try {
      const result = await db
        .select({
          channelType: conversations.channelType,
          count: sql`count(*)`
        })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(eq(conversations.companyId, companyId))
        .groupBy(conversations.channelType);

      return result.map((row: { channelType: string | null; count: unknown }) => ({
        name: String(row.channelType),
        value: parseInt(String(row.count))
      }));
    } catch (error) {
      console.error('Error getting messages by channel by company:', error);
      return [];
    }
  }









  async createFlowSession(session: any) {
    try {
      return await db.insert(flowSessions).values(session).returning();
    } catch (error) {
      console.error('Error creating flow session:', error);
      throw error;
    }
  }

  async updateFlowSession(sessionId: string, updates: any) {
    try {
      return await db.update(flowSessions)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(flowSessions.sessionId, sessionId))
        .returning();
    } catch (error) {
      console.error('Error updating flow session:', error);
      throw error;
    }
  }

  async getFlowSession(sessionId: string) {
    try {
      const result = await db.select()
        .from(flowSessions)
        .where(eq(flowSessions.sessionId, sessionId))
        .limit(1);
      return result[0] || null;
    } catch (error) {
      console.error('Error getting flow session:', error);
      return null;
    }
  }

  async getActiveFlowSessionsForConversation(conversationId: number) {
    try {
      return await db.select()
        .from(flowSessions)
        .where(
          and(
            eq(flowSessions.conversationId, conversationId),
            sql`${flowSessions.status} IN ('active', 'waiting', 'paused')`
          )
        );
    } catch (error) {
      console.error('Error getting active flow sessions:', error);
      return [];
    }
  }

  async expireFlowSession(sessionId: string) {
    try {
      return await db.update(flowSessions)
        .set({ status: 'timeout', updatedAt: new Date() })
        .where(eq(flowSessions.sessionId, sessionId))
        .returning();
    } catch (error) {
      console.error('Error expiring flow session:', error);
      throw error;
    }
  }

  async createFlowSessionVariable(variable: any) {
    try {
      return await db.insert(flowSessionVariables).values(variable).returning();
    } catch (error) {
      console.error('Error creating flow session variable:', error);
      throw error;
    }
  }

  async upsertFlowSessionVariable(variable: any) {
    try {

      const session = await this.getFlowSession(variable.sessionId);
      if (!session) {
        console.warn(`Flow session ${variable.sessionId} does not exist, skipping variable upsert for key: ${variable.variableKey}`);
        return null;
      }

      return await db.insert(flowSessionVariables)
        .values(variable)
        .onConflictDoUpdate({
          target: [flowSessionVariables.sessionId, flowSessionVariables.variableKey],
          set: {
            variableValue: variable.variableValue,
            variableType: variable.variableType,
            scope: variable.scope,
            nodeId: variable.nodeId,
            isEncrypted: variable.isEncrypted,
            expiresAt: variable.expiresAt,
            updatedAt: new Date()
          }
        })
        .returning();
    } catch (error) {

      if (error && typeof error === 'object' && 'code' in error && error.code === '23503') {
        console.warn(`Flow session ${variable.sessionId} does not exist, skipping variable upsert for key: ${variable.variableKey}`);
        return null;
      }
      console.error('Error upserting flow session variable:', error);
      throw error;
    }
  }

  async getFlowSessionVariables(sessionId: string) {
    try {
      return await db.select()
        .from(flowSessionVariables)
        .where(eq(flowSessionVariables.sessionId, sessionId));
    } catch (error) {
      console.error('Error getting flow session variables:', error);
      return [];
    }
  }

  async getFlowSessionVariable(sessionId: string, variableKey: string) {
    try {
      const result = await db.select()
        .from(flowSessionVariables)
        .where(
          and(
            eq(flowSessionVariables.sessionId, sessionId),
            eq(flowSessionVariables.variableKey, variableKey)
          )
        )
        .limit(1);
      return result[0] || null;
    } catch (error) {
      console.error('Error getting flow session variable:', error);
      return null;
    }
  }

  async deleteFlowSessionVariable(sessionId: string, variableKey: string) {
    try {
      return await db.delete(flowSessionVariables)
        .where(
          and(
            eq(flowSessionVariables.sessionId, sessionId),
            eq(flowSessionVariables.variableKey, variableKey)
          )
        );
    } catch (error) {
      console.error('Error deleting flow session variable:', error);
      throw error;
    }
  }

  async createFlowSessionCursor(cursor: any) {
    try {
      return await db.insert(flowSessionCursors).values(cursor).returning();
    } catch (error) {
      console.error('Error creating flow session cursor:', error);
      throw error;
    }
  }

  async updateFlowSessionCursor(sessionId: string, updates: any) {
    try {
      return await db.update(flowSessionCursors)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(flowSessionCursors.sessionId, sessionId))
        .returning();
    } catch (error) {
      console.error('Error updating flow session cursor:', error);
      throw error;
    }
  }

  async getFlowSessionCursor(sessionId: string) {
    try {
      const result = await db.select()
        .from(flowSessionCursors)
        .where(eq(flowSessionCursors.sessionId, sessionId))
        .limit(1);
      return result[0] || null;
    } catch (error) {
      console.error('Error getting flow session cursor:', error);
      return null;
    }
  }

  async createFollowUpSchedule(schedule: any) {
    try {
      return await db.insert(followUpSchedules).values(schedule).returning();
    } catch (error) {
      console.error('Error creating follow-up schedule:', error);
      throw error;
    }
  }

  async updateFollowUpSchedule(scheduleId: string, updates: any) {
    try {
      return await db.update(followUpSchedules)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(followUpSchedules.scheduleId, scheduleId))
        .returning();
    } catch (error) {
      console.error('Error updating follow-up schedule:', error);
      throw error;
    }
  }

  async getFollowUpSchedule(scheduleId: string) {
    try {
      const result = await db.select()
        .from(followUpSchedules)
        .where(eq(followUpSchedules.scheduleId, scheduleId))
        .limit(1);
      return result[0] || null;
    } catch (error) {
      console.error('Error getting follow-up schedule:', error);
      return null;
    }
  }

  async getFollowUpSchedulesByConversation(conversationId: number) {
    try {
      return await db.select()
        .from(followUpSchedules)
        .where(eq(followUpSchedules.conversationId, conversationId))
        .orderBy(followUpSchedules.scheduledFor);
    } catch (error) {
      console.error('Error getting follow-up schedules by conversation:', error);
      return [];
    }
  }

  async getFollowUpSchedulesByContact(contactId: number) {
    try {
      return await db.select()
        .from(followUpSchedules)
        .where(eq(followUpSchedules.contactId, contactId))
        .orderBy(followUpSchedules.scheduledFor);
    } catch (error) {
      console.error('Error getting follow-up schedules by contact:', error);
      return [];
    }
  }

  async getScheduledFollowUps(limit: number = 100) {
    try {
      const results = await db.select()
        .from(followUpSchedules)
        .where(
          and(
            eq(followUpSchedules.status, 'scheduled'),
            sql`${followUpSchedules.scheduledFor} <= NOW()`
          )
        )
        .orderBy(followUpSchedules.scheduledFor)
        .limit(limit);

      const dueNow = results.filter((followUp: any) => {
        const scheduledTime = new Date(followUp.scheduledFor);
        const now = new Date();
        return scheduledTime.getTime() <= now.getTime();
      });

      return dueNow;
    } catch (error) {
      console.error('Error getting scheduled follow-ups:', error);
      return [];
    }
  }

  async cancelFollowUpSchedule(scheduleId: string) {
    try {
      return await db.update(followUpSchedules)
        .set({
          status: 'cancelled',
          updatedAt: new Date()
        })
        .where(eq(followUpSchedules.scheduleId, scheduleId))
        .returning();
    } catch (error) {
      console.error('Error cancelling follow-up schedule:', error);
      throw error;
    }
  }

  async createFollowUpTemplate(template: any) {
    try {
      return await db.insert(followUpTemplates).values(template).returning();
    } catch (error) {
      console.error('Error creating follow-up template:', error);
      throw error;
    }
  }

  async updateFollowUpTemplate(id: number, updates: any) {
    try {
      return await db.update(followUpTemplates)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(followUpTemplates.id, id))
        .returning();
    } catch (error) {
      console.error('Error updating follow-up template:', error);
      throw error;
    }
  }

  async getFollowUpTemplate(id: number) {
    try {
      const result = await db.select()
        .from(followUpTemplates)
        .where(eq(followUpTemplates.id, id))
        .limit(1);
      return result[0] || null;
    } catch (error) {
      console.error('Error getting follow-up template:', error);
      return null;
    }
  }

  async getFollowUpTemplatesByCompany(companyId: number) {
    try {
      return await db.select()
        .from(followUpTemplates)
        .where(eq(followUpTemplates.companyId, companyId))
        .orderBy(followUpTemplates.name);
    } catch (error) {
      console.error('Error getting follow-up templates by company:', error);
      return [];
    }
  }

  async deleteFollowUpTemplate(id: number): Promise<boolean> {
    try {
      await db.delete(followUpTemplates)
        .where(eq(followUpTemplates.id, id));
      return true;
    } catch (error) {
      console.error('Error deleting follow-up template:', error);
      return false;
    }
  }

  async createFollowUpExecutionLog(log: any) {
    try {
      return await db.insert(followUpExecutionLog).values(log).returning();
    } catch (error) {
      console.error('Error creating follow-up execution log:', error);
      throw error;
    }
  }

  async getFollowUpExecutionLogs(scheduleId: string) {
    try {
      return await db.select()
        .from(followUpExecutionLog)
        .where(eq(followUpExecutionLog.scheduleId, scheduleId))
        .orderBy(followUpExecutionLog.executedAt);
    } catch (error) {
      console.error('Error getting follow-up execution logs:', error);
      return [];
    }
  }


  async createPipelineStageRevert(data: InsertPipelineStageRevert): Promise<PipelineStageRevert> {
    try {
      const result = await db.insert(pipelineStageReverts).values(data).returning();
      return result[0];
    } catch (error) {
      console.error('Error creating pipeline stage revert:', error);
      throw error;
    }
  }

  async getPipelineStageRevert(scheduleId: string): Promise<PipelineStageRevert | undefined> {
    try {
      const result = await db.select()
        .from(pipelineStageReverts)
        .where(eq(pipelineStageReverts.scheduleId, scheduleId))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error('Error getting pipeline stage revert:', error);
      return undefined;
    }
  }

  async getScheduledPipelineStageReverts(limit: number = 100): Promise<PipelineStageRevert[]> {
    try {
      const results = await db.select()
        .from(pipelineStageReverts)
        .where(
          and(
            eq(pipelineStageReverts.status, 'scheduled'),
            sql`${pipelineStageReverts.scheduledFor} <= NOW()`
          )
        )
        .orderBy(asc(pipelineStageReverts.scheduledFor))
        .limit(limit);

      return results.filter((revert: any) => {
        const scheduledTime = new Date(revert.scheduledFor);
        const now = new Date();
        return scheduledTime.getTime() <= now.getTime();
      });
    } catch (error) {
      console.error('Error getting scheduled pipeline stage reverts:', error);
      return [];
    }
  }

  async updatePipelineStageRevert(scheduleId: string, updates: Partial<PipelineStageRevert>): Promise<PipelineStageRevert> {
    try {
      const result = await db.update(pipelineStageReverts)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(pipelineStageReverts.scheduleId, scheduleId))
        .returning();
      return result[0];
    } catch (error) {
      console.error('Error updating pipeline stage revert:', error);
      throw error;
    }
  }

  async cancelPipelineStageRevert(scheduleId: string): Promise<void> {
    try {
      await db.update(pipelineStageReverts)
        .set({
          status: 'cancelled',
          updatedAt: new Date()
        })
        .where(eq(pipelineStageReverts.scheduleId, scheduleId));
    } catch (error) {
      console.error('Error cancelling pipeline stage revert:', error);
      throw error;
    }
  }

  async createPipelineStageRevertLog(data: InsertPipelineStageRevertLog): Promise<PipelineStageRevertLog> {
    try {
      const result = await db.insert(pipelineStageRevertLogs).values(data).returning();
      return result[0];
    } catch (error) {
      console.error('Error creating pipeline stage revert log:', error);
      throw error;
    }
  }

  async getPipelineStageRevertLogs(scheduleId: string): Promise<PipelineStageRevertLog[]> {
    try {
      return await db.select()
        .from(pipelineStageRevertLogs)
        .where(eq(pipelineStageRevertLogs.scheduleId, scheduleId))
        .orderBy(desc(pipelineStageRevertLogs.createdAt));
    } catch (error) {
      console.error('Error getting pipeline stage revert logs:', error);
      return [];
    }
  }

  async getPipelineStageRevertsByDeal(dealId: number, companyId: number): Promise<PipelineStageRevert[]> {
    try {
      return await db.select()
        .from(pipelineStageReverts)
        .where(
          and(
            eq(pipelineStageReverts.dealId, dealId),
            eq(pipelineStageReverts.companyId, companyId)
          )
        )
        .orderBy(desc(pipelineStageReverts.createdAt));
    } catch (error) {
      console.error('Error getting pipeline stage reverts by deal:', error);
      return [];
    }
  }

  async getPipelineStageRevertsStats(companyId: number): Promise<{ totalScheduled: number; totalExecuted: number; totalFailed: number; totalSkipped: number; totalCancelled: number }> {
    try {
      const allReverts = await db.select()
        .from(pipelineStageReverts)
        .where(eq(pipelineStageReverts.companyId, companyId));

      return {
        totalScheduled: allReverts.filter((r: any) => r.status === 'scheduled').length,
        totalExecuted: allReverts.filter((r: any) => r.status === 'executed').length,
        totalFailed: allReverts.filter((r: any) => r.status === 'failed').length,
        totalSkipped: allReverts.filter((r: any) => r.status === 'skipped').length,
        totalCancelled: allReverts.filter((r: any) => r.status === 'cancelled').length
      };
    } catch (error) {
      console.error('Error getting pipeline stage reverts stats:', error);
      return {
        totalScheduled: 0,
        totalExecuted: 0,
        totalFailed: 0,
        totalSkipped: 0,
        totalCancelled: 0
      };
    }
  }

  async getDealActivitiesSince(dealId: number, sinceDate: Date): Promise<DealActivity[]> {
    try {
      return await db.select()
        .from(dealActivities)
        .where(
          and(
            eq(dealActivities.dealId, dealId),
            gt(dealActivities.createdAt, sinceDate)
          )
        )
        .orderBy(desc(dealActivities.createdAt));
    } catch (error) {
      console.error('Error getting deal activities since date:', error);
      return [];
    }
  }

  async createFlowExecution(data: {
    executionId: string;
    flowId: number;
    conversationId: number;
    contactId: number;
    companyId?: number;
    triggerNodeId: string;
    contextData?: any;
  }): Promise<number> {
    try {
      const [result] = await db.insert(flowExecutions).values({
        executionId: data.executionId,
        flowId: data.flowId,
        conversationId: data.conversationId,
        contactId: data.contactId,
        companyId: data.companyId,
        triggerNodeId: data.triggerNodeId,
        contextData: data.contextData || {},
        status: 'running',
        executionPath: [data.triggerNodeId],
        startedAt: new Date(),
        lastActivityAt: new Date()
      }).returning({ id: flowExecutions.id });


      return result.id;
    } catch (error) {
      console.error('Error creating flow execution:', error);
      throw error;
    }
  }

  async updateFlowExecution(executionId: string, data: {
    status?: string;
    currentNodeId?: string;
    executionPath?: string[];
    contextData?: any;
    completedAt?: Date;
    totalDurationMs?: number;
    completionRate?: number;
    errorMessage?: string;
  }): Promise<void> {
    try {
      const updateData: any = {
        lastActivityAt: new Date(),
        updatedAt: new Date()
      };

      if (data.status) updateData.status = data.status;
      if (data.currentNodeId) updateData.currentNodeId = data.currentNodeId;
      if (data.executionPath) updateData.executionPath = data.executionPath;
      if (data.contextData) updateData.contextData = data.contextData;
      if (data.completedAt) updateData.completedAt = data.completedAt;
      if (data.totalDurationMs) updateData.totalDurationMs = data.totalDurationMs;
      if (data.completionRate) updateData.completionRate = data.completionRate.toString();
      if (data.errorMessage) updateData.errorMessage = data.errorMessage;

      await db.update(flowExecutions)
        .set(updateData)
        .where(eq(flowExecutions.executionId, executionId));


    } catch (error) {
      console.error('Error updating flow execution:', error);
      throw error;
    }
  }

  async createFlowStepExecution(data: {
    flowExecutionId: number;
    nodeId: string;
    nodeType: string;
    stepOrder: number;
    inputData?: any;
  }): Promise<number> {
    try {
      const [result] = await db.insert(flowStepExecutions).values({
        flowExecutionId: data.flowExecutionId,
        nodeId: data.nodeId,
        nodeType: data.nodeType,
        stepOrder: data.stepOrder,
        inputData: data.inputData || {},
        status: 'running',
        startedAt: new Date()
      }).returning({ id: flowStepExecutions.id });


      return result.id;
    } catch (error) {
      console.error('Error creating flow step execution:', error);
      throw error;
    }
  }

  async updateFlowStepExecution(stepId: number, data: {
    status?: string;
    completedAt?: Date;
    durationMs?: number;
    outputData?: any;
    errorMessage?: string;
  }): Promise<void> {
    try {
      const updateData: any = {};

      if (data.status) updateData.status = data.status;
      if (data.completedAt) updateData.completedAt = data.completedAt;
      if (data.durationMs) updateData.durationMs = data.durationMs;
      if (data.outputData) updateData.outputData = data.outputData;
      if (data.errorMessage) updateData.errorMessage = data.errorMessage;

      await db.update(flowStepExecutions)
        .set(updateData)
        .where(eq(flowStepExecutions.id, stepId));


    } catch (error) {
      console.error('Error updating flow step execution:', error);
      throw error;
    }
  }



  async getFlowDropoffAnalysis(flowId: number, companyId?: number): Promise<Array<{
    nodeId: string;
    nodeType: string;
    dropoffCount: number;
    dropoffRate: number;
  }>> {
    try {
      const whereConditions = [eq(flowExecutions.flowId, flowId)];

      if (companyId) {
        whereConditions.push(eq(flowExecutions.companyId, companyId));
      }

      const query = db
        .select({
          nodeId: flowStepExecutions.nodeId,
          nodeType: flowStepExecutions.nodeType,
          dropoffCount: sql`COUNT(CASE WHEN ${flowStepExecutions.status} IN ('failed', 'skipped') THEN 1 END)`,
          totalCount: sql`COUNT(${flowStepExecutions.id})`
        })
        .from(flowStepExecutions)
        .innerJoin(flowExecutions, eq(flowStepExecutions.flowExecutionId, flowExecutions.id))
        .where(and(...whereConditions))
        .groupBy(flowStepExecutions.nodeId, flowStepExecutions.nodeType);

      const results = await query;

      return results.map((row: { nodeId: string | null; nodeType: string | null; dropoffCount: unknown; totalCount: unknown }) => {
        const dropoffCount = Number(row.dropoffCount);
        const totalCount = Number(row.totalCount);
        const dropoffRate = totalCount > 0 ? Math.round((dropoffCount / totalCount) * 100) : 0;

        return {
          nodeId: row.nodeId,
          nodeType: row.nodeType,
          dropoffCount,
          dropoffRate
        };
      });
    } catch (error) {
      console.error('Error getting flow dropoff analysis:', error);
      return [];
    }
  }



  async getAppSetting(key: string): Promise<AppSetting | undefined> {
    try {
      const [setting] = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, key));

      return setting;
    } catch (error) {
      console.error(`Error getting app setting with key ${key}:`, error);
      return undefined;
    }
  }

  async getAllAppSettings(): Promise<AppSetting[]> {
    try {
      return await db
        .select()
        .from(appSettings)
        .orderBy(appSettings.key);
    } catch (error) {
      console.error("Error getting all app settings:", error);
      return [];
    }
  }

  /**
   * Save an app setting to the database.
   * 
   * Auth Background Settings:
   * - branding_admin_auth_background: string (image URL) - Admin authentication page background image
   * - branding_user_auth_background: string (image URL) - User authentication page background image
   * - auth_background_config: JSON object - Configuration for auth backgrounds including:
   *   - adminAuthBackground: { backgroundColor?, gradientConfig?, priority: 'image'|'color'|'layer' }
   *   - userAuthBackground: { backgroundColor?, gradientConfig?, priority: 'image'|'color'|'layer' }
   */
  async saveAppSetting(key: string, value: unknown): Promise<AppSetting> {
    try {
      if (!key) {
        throw new Error('Setting key is required');
      }

      if (value === undefined || value === null) {
        throw new Error('Setting value is required');
      }

      const existingSetting = await this.getAppSetting(key);

      if (existingSetting) {
        const [updatedSetting] = await db
          .update(appSettings)
          .set({
            value,
            updatedAt: new Date()
          })
          .where(eq(appSettings.key, key))
          .returning();

        if (!updatedSetting) {
          throw new Error(`Failed to update setting with key ${key}`);
        }

        return updatedSetting;
      } else {
        const [newSetting] = await db
          .insert(appSettings)
          .values({
            key,
            value
          })
          .returning();

        if (!newSetting) {
          throw new Error(`Failed to create setting with key ${key}`);
        }

        return newSetting;
      }
    } catch (error) {
      console.error(`Error saving app setting with key ${key}:`, error);
      throw error;
    }
  }

  async deleteAppSetting(key: string): Promise<boolean> {
    try {
      await db
        .delete(appSettings)
        .where(eq(appSettings.key, key));

      return true;
    } catch (error) {
      console.error(`Error deleting app setting with key ${key}:`, error);
      return false;
    }
  }

  async getAllPaymentTransactions(): Promise<PaymentTransaction[]> {
    try {
      const result = await db
        .select()
        .from(paymentTransactions)
        .orderBy(desc(paymentTransactions.createdAt));

      return result.map((transaction: any) => ({
        ...transaction,
        amount: Number(transaction.amount),
        metadata: transaction.metadata as Record<string, unknown> | undefined
      })) as PaymentTransaction[];
    } catch (error) {
      console.error("Error getting all payment transactions:", error);
      return [];
    }
  }

  async getPaymentTransactionsByCompany(companyId: number): Promise<PaymentTransaction[]> {
    try {
      const result = await db
        .select()
        .from(paymentTransactions)
        .where(eq(paymentTransactions.companyId, companyId))
        .orderBy(desc(paymentTransactions.createdAt));

      return result.map((transaction: any) => this.mapToPaymentTransaction(transaction));
    } catch (error) {
      console.error(`Error getting payment transactions for company ${companyId}:`, error);
      return [];
    }
  }

  async getPaymentTransaction(id: number): Promise<PaymentTransaction | undefined> {
    try {
      const [transaction] = await db
        .select()
        .from(paymentTransactions)
        .where(eq(paymentTransactions.id, id));

      if (!transaction) return undefined;

      return this.mapToPaymentTransaction(transaction);
    } catch (error) {
      console.error(`Error getting payment transaction with ID ${id}:`, error);
      return undefined;
    }
  }

  async createPaymentTransaction(transaction: InsertPaymentTransaction): Promise<PaymentTransaction> {
    try {
      const [newTransaction] = await db
        .insert(paymentTransactions)
        .values(transaction)
        .returning();

      return this.mapToPaymentTransaction(newTransaction);
    } catch (error) {
      console.error("Error creating payment transaction:", error);
      throw error;
    }
  }

  async updatePaymentTransaction(id: number, updates: Partial<InsertPaymentTransaction>): Promise<PaymentTransaction> {
    try {
      const [updatedTransaction] = await db
        .update(paymentTransactions)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(paymentTransactions.id, id))
        .returning();

      if (!updatedTransaction) {
        throw new Error(`Payment transaction with ID ${id} not found`);
      }

      return this.mapToPaymentTransaction(updatedTransaction);
    } catch (error) {
      console.error(`Error updating payment transaction with ID ${id}:`, error);
      throw error;
    }
  }

  async getAllLanguages(): Promise<Language[]> {
    try {
      return await db
        .select()
        .from(languages)
        .orderBy(languages.name);
    } catch (error) {
      console.error("Error getting all languages:", error);
      return [];
    }
  }

  async getLanguage(id: number): Promise<Language | undefined> {
    try {
      const [language] = await db
        .select()
        .from(languages)
        .where(eq(languages.id, id));
      return language;
    } catch (error) {
      console.error(`Error getting language with ID ${id}:`, error);
      return undefined;
    }
  }

  async getLanguageByCode(code: string): Promise<Language | undefined> {
    try {
      const [language] = await db
        .select()
        .from(languages)
        .where(eq(languages.code, code));
      return language;
    } catch (error) {
      console.error(`Error getting language with code ${code}:`, error);
      return undefined;
    }
  }

  async getDefaultLanguage(): Promise<Language | undefined> {
    try {
      const [language] = await db
        .select()
        .from(languages)
        .where(eq(languages.isDefault, true));
      return language;
    } catch (error) {
      console.error("Error getting default language:", error);
      return undefined;
    }
  }

  async createLanguage(language: InsertLanguage): Promise<Language> {
    try {
      const [newLanguage] = await db
        .insert(languages)
        .values({
          ...language,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      return newLanguage;
    } catch (error) {
      console.error("Error creating language:", error);
      throw error;
    }
  }

  async updateLanguage(id: number, updates: Partial<InsertLanguage>): Promise<Language> {
    try {
      const [updatedLanguage] = await db
        .update(languages)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(languages.id, id))
        .returning();

      if (!updatedLanguage) {
        throw new Error(`Language with ID ${id} not found`);
      }

      return updatedLanguage;
    } catch (error) {
      console.error("Error updating language:", error);
      throw error;
    }
  }

  async deleteLanguage(id: number): Promise<boolean> {
    try {
      const language = await this.getLanguage(id);
      if (language?.isDefault) {
        throw new Error("Cannot delete the default language");
      }

      await db
        .delete(translations)
        .where(eq(translations.languageId, id));

      await db
        .delete(languages)
        .where(eq(languages.id, id));

      return true;
    } catch (error) {
      console.error(`Error deleting language with ID ${id}:`, error);
      return false;
    }
  }

  async setDefaultLanguage(id: number): Promise<boolean> {
    try {
      await db
        .update(languages)
        .set({ isDefault: false })
        .where(sql`true`);

      const [updatedLanguage] = await db
        .update(languages)
        .set({ isDefault: true })
        .where(eq(languages.id, id))
        .returning();

      if (!updatedLanguage) {
        throw new Error(`Language with ID ${id} not found`);
      }

      return true;
    } catch (error) {
      console.error(`Error setting language ${id} as default:`, error);
      return false;
    }
  }

  async getAllNamespaces(): Promise<TranslationNamespace[]> {
    try {
      return await db
        .select()
        .from(translationNamespaces)
        .orderBy(translationNamespaces.name);
    } catch (error) {
      console.error("Error getting all namespaces:", error);
      return [];
    }
  }

  async getNamespace(id: number): Promise<TranslationNamespace | undefined> {
    try {
      const [namespace] = await db
        .select()
        .from(translationNamespaces)
        .where(eq(translationNamespaces.id, id));
      return namespace;
    } catch (error) {
      console.error(`Error getting namespace with ID ${id}:`, error);
      return undefined;
    }
  }

  async getNamespaceByName(name: string): Promise<TranslationNamespace | undefined> {
    try {
      const [namespace] = await db
        .select()
        .from(translationNamespaces)
        .where(eq(translationNamespaces.name, name));
      return namespace;
    } catch (error) {
      console.error(`Error getting namespace with name ${name}:`, error);
      return undefined;
    }
  }

  async createNamespace(namespace: InsertTranslationNamespace): Promise<TranslationNamespace> {
    try {
      const [newNamespace] = await db
        .insert(translationNamespaces)
        .values({
          ...namespace,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      return newNamespace;
    } catch (error) {
      console.error("Error creating namespace:", error);
      throw error;
    }
  }

  async updateNamespace(id: number, updates: Partial<InsertTranslationNamespace>): Promise<TranslationNamespace> {
    try {
      const [updatedNamespace] = await db
        .update(translationNamespaces)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(translationNamespaces.id, id))
        .returning();

      if (!updatedNamespace) {
        throw new Error(`Namespace with ID ${id} not found`);
      }

      return updatedNamespace;
    } catch (error) {
      console.error("Error updating namespace:", error);
      throw error;
    }
  }

  async deleteNamespace(id: number): Promise<boolean> {
    try {
      const keys = await this.getAllKeys(id);

      for (const key of keys) {
        await db
          .delete(translations)
          .where(eq(translations.keyId, key.id));
      }

      await db
        .delete(translationKeys)
        .where(eq(translationKeys.namespaceId, id));

      await db
        .delete(translationNamespaces)
        .where(eq(translationNamespaces.id, id));

      return true;
    } catch (error) {
      console.error(`Error deleting namespace with ID ${id}:`, error);
      return false;
    }
  }

  async getAllKeys(namespaceId?: number): Promise<TranslationKey[]> {
    try {
      if (namespaceId) {
        return await db
          .select()
          .from(translationKeys)
          .where(eq(translationKeys.namespaceId, namespaceId))
          .orderBy(translationKeys.key);
      } else {
        return await db
          .select()
          .from(translationKeys)
          .orderBy(translationKeys.key);
      }
    } catch (error) {
      console.error("Error getting all keys:", error);
      return [];
    }
  }

  async getKey(id: number): Promise<TranslationKey | undefined> {
    try {
      const [key] = await db
        .select()
        .from(translationKeys)
        .where(eq(translationKeys.id, id));
      return key;
    } catch (error) {
      console.error(`Error getting key with ID ${id}:`, error);
      return undefined;
    }
  }

  async getKeyByNameAndKey(namespaceId: number, key: string): Promise<TranslationKey | undefined> {
    try {
      const [translationKey] = await db
        .select()
        .from(translationKeys)
        .where(
          and(
            eq(translationKeys.namespaceId, namespaceId),
            eq(translationKeys.key, key)
          )
        );
      return translationKey;
    } catch (error) {
      console.error(`Error getting key ${key} in namespace ${namespaceId}:`, error);
      return undefined;
    }
  }

  async createKey(key: InsertTranslationKey): Promise<TranslationKey> {
    try {
      const [newKey] = await db
        .insert(translationKeys)
        .values({
          ...key,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      return newKey;
    } catch (error) {
      console.error("Error creating key:", error);
      throw error;
    }
  }

  async updateKey(id: number, updates: Partial<InsertTranslationKey>): Promise<TranslationKey> {
    try {
      const [updatedKey] = await db
        .update(translationKeys)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(translationKeys.id, id))
        .returning();

      if (!updatedKey) {
        throw new Error(`Key with ID ${id} not found`);
      }

      return updatedKey;
    } catch (error) {
      console.error("Error updating key:", error);
      throw error;
    }
  }

  async deleteKey(id: number): Promise<boolean> {
    try {
      await db
        .delete(translations)
        .where(eq(translations.keyId, id));

      await db
        .delete(translationKeys)
        .where(eq(translationKeys.id, id));

      return true;
    } catch (error) {
      console.error(`Error deleting key with ID ${id}:`, error);
      return false;
    }
  }

  async getAllTranslations(languageId?: number, keyId?: number): Promise<Translation[]> {
    try {
      if (languageId && keyId) {
        return await db
          .select()
          .from(translations)
          .where(
            and(
              eq(translations.languageId, languageId),
              eq(translations.keyId, keyId)
            )
          );
      } else if (languageId) {
        return await db
          .select()
          .from(translations)
          .where(eq(translations.languageId, languageId));
      } else if (keyId) {
        return await db
          .select()
          .from(translations)
          .where(eq(translations.keyId, keyId));
      } else {
        return await db
          .select()
          .from(translations);
      }
    } catch (error) {
      console.error("Error getting translations:", error);
      return [];
    }
  }

  async getTranslation(id: number): Promise<Translation | undefined> {
    try {
      const [translation] = await db
        .select()
        .from(translations)
        .where(eq(translations.id, id));
      return translation;
    } catch (error) {
      console.error(`Error getting translation with ID ${id}:`, error);
      return undefined;
    }
  }

  async getTranslationByKeyAndLanguage(keyId: number, languageId: number): Promise<Translation | undefined> {
    try {
      const [translation] = await db
        .select()
        .from(translations)
        .where(
          and(
            eq(translations.keyId, keyId),
            eq(translations.languageId, languageId)
          )
        );
      return translation;
    } catch (error) {
      console.error(`Error getting translation for key ${keyId} and language ${languageId}:`, error);
      return undefined;
    }
  }

  async createTranslation(translation: InsertTranslation): Promise<Translation> {
    try {
      const existingTranslation = await this.getTranslationByKeyAndLanguage(
        translation.keyId,
        translation.languageId
      );

      if (existingTranslation) {
        return await this.updateTranslation(existingTranslation.id, { value: translation.value });
      }

      const [newTranslation] = await db
        .insert(translations)
        .values({
          ...translation,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      return newTranslation;
    } catch (error) {
      console.error("Error creating translation:", error);
      throw error;
    }
  }

  async updateTranslation(id: number, updates: Partial<InsertTranslation>): Promise<Translation> {
    try {
      const [updatedTranslation] = await db
        .update(translations)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(translations.id, id))
        .returning();

      if (!updatedTranslation) {
        throw new Error(`Translation with ID ${id} not found`);
      }

      return updatedTranslation;
    } catch (error) {
      console.error("Error updating translation:", error);
      throw error;
    }
  }

  async deleteTranslation(id: number): Promise<boolean> {
    try {
      await db
        .delete(translations)
        .where(eq(translations.id, id));

      return true;
    } catch (error) {
      console.error(`Error deleting translation with ID ${id}:`, error);
      return false;
    }
  }

  async getTranslationsForLanguage(languageCode: string): Promise<Array<{ id: number, key: string, value: string }>> {
    try {
      const language = await this.getLanguageByCode(languageCode);
      if (!language) {
        throw new Error(`Language with code ${languageCode} not found`);
      }

      const result = await db
        .select({
          id: translations.id,
          key: translationKeys.key,
          value: translations.value
        })
        .from(translations)
        .innerJoin(translationKeys, eq(translations.keyId, translationKeys.id))
        .where(eq(translations.languageId, language.id))
        .orderBy(translationKeys.key);

      return result;
    } catch (error) {
      console.error(`Error getting translations for language ${languageCode}:`, error);
      return [];
    }
  }

  async getTranslationsForLanguageByNamespace(languageCode: string): Promise<Record<string, Record<string, string>>> {
    try {
      const language = await this.getLanguageByCode(languageCode);
      if (!language) {
        throw new Error(`Language with code ${languageCode} not found`);
      }

      const result = await db
        .select({
          namespaceName: translationNamespaces.name,
          key: translationKeys.key,
          value: translations.value
        })
        .from(translations)
        .innerJoin(translationKeys, eq(translations.keyId, translationKeys.id))
        .innerJoin(translationNamespaces, eq(translationKeys.namespaceId, translationNamespaces.id))
        .where(eq(translations.languageId, language.id))
        .orderBy(translationNamespaces.name, translationKeys.key);

      const organized: Record<string, Record<string, string>> = {};
      for (const row of result) {
        if (!organized[row.namespaceName]) {
          organized[row.namespaceName] = {};
        }
        organized[row.namespaceName][row.key] = row.value;
      }

      return organized;
    } catch (error) {
      console.error(`Error getting organized translations for language ${languageCode}:`, error);
      return {};
    }
  }

  async getTranslationsForLanguageAsArray(languageCode: string): Promise<Array<{ key: string, value: string }>> {
    try {
      const language = await this.getLanguageByCode(languageCode);
      if (!language) {
        throw new Error(`Language with code ${languageCode} not found`);
      }

      const result = await db
        .select({
          namespaceName: translationNamespaces.name,
          key: translationKeys.key,
          value: translations.value
        })
        .from(translations)
        .innerJoin(translationKeys, eq(translations.keyId, translationKeys.id))
        .innerJoin(translationNamespaces, eq(translationKeys.namespaceId, translationNamespaces.id))
        .where(eq(translations.languageId, language.id))
        .orderBy(translationNamespaces.name, translationKeys.key);

      return result.map((row: { namespaceName: string; key: string; value: string }) => ({
        key: `${row.namespaceName}.${row.key}`,
        value: row.value
      }));
    } catch (error) {
      console.error(`Error getting array translations for language ${languageCode}:`, error);
      return [];
    }
  }

  async convertArrayToNestedFormat(arrayData: Array<{ key: string, value: string }>): Promise<Record<string, Record<string, string>>> {
    const nested: Record<string, Record<string, string>> = {};

    for (const item of arrayData) {
      const keyParts = item.key.split('.');
      if (keyParts.length < 2) {

        continue;
      }

      const namespaceName = keyParts[0];
      const keyName = keyParts.slice(1).join('.');

      if (!nested[namespaceName]) {
        nested[namespaceName] = {};
      }

      nested[namespaceName][keyName] = item.value;
    }

    return nested;
  }

  async importTranslations(languageId: number, translations: Record<string, Record<string, string>>): Promise<boolean> {
    try {
      const language = await this.getLanguage(languageId);
      if (!language) {
        throw new Error(`Language with ID ${languageId} not found`);
      }

      if (!translations || typeof translations !== 'object') {
        throw new Error('Invalid translations format. Expected nested object structure.');
      }

      let importedCount = 0;
      let skippedCount = 0;

      for (const namespaceName in translations) {
        if (!namespaceName || typeof namespaceName !== 'string') {

          continue;
        }

        const namespaceTranslations = translations[namespaceName];
        if (!namespaceTranslations || typeof namespaceTranslations !== 'object') {

          continue;
        }

        let namespace = await this.getNamespaceByName(namespaceName);
        if (!namespace) {
          namespace = await this.createNamespace({
            name: namespaceName,
            description: `Auto-created during import for language ${language.code}`
          });
        }

        for (const keyName in namespaceTranslations) {
          if (!keyName || typeof keyName !== 'string') {

            skippedCount++;
            continue;
          }

          const value = namespaceTranslations[keyName];
          if (typeof value !== 'string') {

            skippedCount++;
            continue;
          }

          let key = await this.getKeyByNameAndKey(namespace.id, keyName);
          if (!key) {
            key = await this.createKey({
              namespaceId: namespace.id,
              key: keyName,
              description: `Auto-created during import`
            });
          }

          await this.createTranslation({
            keyId: key.id,
            languageId: language.id,
            value: value
          });

          importedCount++;
        }
      }


      return true;
    } catch (error) {
      console.error(`Error importing translations for language ${languageId}:`, error);
      return false;
    }
  }

  async getSmtpConfig(companyId?: number): Promise<any | null> {
    try {
      if (companyId) {
        const setting = await this.getCompanySetting(companyId, 'smtp_config');
        return setting?.value || null;
      } else {
        const setting = await this.getAppSetting('smtp_config');
        return setting?.value || null;
      }
    } catch (error) {
      console.error('Error getting SMTP configuration:', error);
      return null;
    }
  }

  async saveSmtpConfig(config: any, companyId?: number): Promise<boolean> {
    try {
      if (companyId) {
        await this.saveCompanySetting(companyId, 'smtp_config', config);
        return true;
      } else {
        await this.saveAppSetting('smtp_config', config);
        return true;
      }
    } catch (error) {
      console.error('Error saving SMTP configuration:', error);
      return false;
    }
  }

  async getCompanySetting(companyId: number, key: string): Promise<CompanySetting | undefined> {
    try {
      const [setting] = await db
        .select()
        .from(companySettings)
        .where(
          and(
            eq(companySettings.companyId, companyId),
            eq(companySettings.key, key)
          )
        );

      return setting;
    } catch (error) {
      console.error(`Error getting company setting with key ${key} for company ${companyId}:`, error);
      return undefined;
    }
  }

  async getAllCompanySettings(companyId: number): Promise<CompanySetting[]> {
    try {
      return await db
        .select()
        .from(companySettings)
        .where(eq(companySettings.companyId, companyId))
        .orderBy(companySettings.key);
    } catch (error) {
      console.error(`Error getting all company settings for company ${companyId}:`, error);
      return [];
    }
  }

  async saveCompanySetting(companyId: number, key: string, value: any): Promise<CompanySetting> {
    try {
      if (!key) {
        throw new Error('Setting key is required');
      }

      if (value === undefined || value === null) {
        throw new Error('Setting value is required');
      }

      const existingSetting = await this.getCompanySetting(companyId, key);

      if (existingSetting) {
        const [updatedSetting] = await db
          .update(companySettings)
          .set({
            value,
            updatedAt: new Date()
          })
          .where(
            and(
              eq(companySettings.companyId, companyId),
              eq(companySettings.key, key)
            )
          )
          .returning();

        if (!updatedSetting) {
          throw new Error(`Failed to update company setting with key ${key} for company ${companyId}`);
        }

        return updatedSetting;
      } else {
        const [newSetting] = await db
          .insert(companySettings)
          .values({
            companyId,
            key,
            value
          })
          .returning();

        if (!newSetting) {
          throw new Error(`Failed to create company setting with key ${key} for company ${companyId}`);
        }

        return newSetting;
      }
    } catch (error) {
      console.error(`Error saving company setting with key ${key} for company ${companyId}:`, error);
      throw error;
    }
  }

  async deleteCompanySetting(companyId: number, key: string): Promise<boolean> {
    try {
      await db
        .delete(companySettings)
        .where(
          and(
            eq(companySettings.companyId, companyId),
            eq(companySettings.key, key)
          )
        );

      return true;
    } catch (error) {
      console.error(`Error deleting company setting with key ${key} for company ${companyId}:`, error);
      return false;
    }
  }

  async getDataRetentionPolicy(companyId: number, platform: string): Promise<DataRetentionPolicyConfig | null> {
    try {
      const key = `data_retention_policy_${platform}`;
      const setting = await this.getCompanySetting(companyId, key);
      const policy = (setting?.value as DataRetentionPolicyConfig) ?? null;
      if (!policy) return null;
      const retentionDays = typeof policy.retentionDays === 'number' && Number.isFinite(policy.retentionDays) && policy.retentionDays > 0
        ? policy.retentionDays
        : 0;
      return { ...policy, retentionDays };
    } catch (error) {
      console.error(`Error getting data retention policy for company ${companyId} platform ${platform}:`, error);
      return null;
    }
  }

  async setDataRetentionPolicy(companyId: number, platform: string, policyConfig: DataRetentionPolicyConfig): Promise<CompanySetting> {
    const key = `data_retention_policy_${platform}`;
    return this.saveCompanySetting(companyId, key, policyConfig);
  }



  async getDealsByStage(stage: DealStatus): Promise<Deal[]> {
    try {
      return db
        .select()
        .from(deals)
        .where(eq(deals.stage, stage))
        .orderBy(desc(deals.lastActivityAt));
    } catch (error) {
      console.error(`Error getting deals by stage ${stage}:`, error);
      return [];
    }
  }

  async getDeal(id: number): Promise<Deal | undefined> {
    try {
      const [deal] = await db
        .select()
        .from(deals)
        .where(eq(deals.id, id));
      return deal;
    } catch (error) {
      console.error(`Error getting deal with ID ${id}:`, error);
      return undefined;
    }
  }

  async getDealsByContact(contactId: number): Promise<Deal[]> {
    try {
      return db
        .select()
        .from(deals)
        .where(
          and(
            eq(deals.contactId, contactId),
            sql`${deals.status} != 'archived'`
          )
        )
        .orderBy(desc(deals.lastActivityAt));
    } catch (error) {
      console.error(`Error getting deals for contact ${contactId}:`, error);
      return [];
    }
  }

  async getActiveDealByContact(contactId: number, companyId?: number, pipelineId?: number): Promise<Deal | null> {
    try {
      const conditions = [
        eq(deals.contactId, contactId),
        eq(deals.status, 'active')
      ];

      if (companyId) {
        conditions.push(eq(deals.companyId, companyId));
      }

      if (pipelineId !== undefined) {
        conditions.push(eq(deals.pipelineId, pipelineId));
      }

      const result = await db
        .select()
        .from(deals)
        .where(and(...conditions))
        .orderBy(desc(deals.lastActivityAt))
        .limit(1);

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error(`Error getting active deal for contact ${contactId}:`, error);
      return null;
    }
  }

  async getDealsByAssignedUser(userId: number): Promise<Deal[]> {
    try {
      return db
        .select()
        .from(deals)
        .where(eq(deals.assignedToUserId, userId))
        .orderBy(desc(deals.lastActivityAt));
    } catch (error) {
      console.error(`Error getting deals for user ${userId}:`, error);
      return [];
    }
  }

  async getDealTags(companyId: number): Promise<string[]> {
    try {
      const result = await db
        .select({ tags: deals.tags })
        .from(deals)
        .where(
          and(
            eq(deals.companyId, companyId),
            sql`${deals.status} != 'archived'`,
            sql`${deals.tags} IS NOT NULL`,
            sql`array_length(${deals.tags}, 1) > 0`
          )
        );


      const allTags = new Set<string>();
      result.forEach((row: { tags: string[] | null }) => {
        if (row.tags && Array.isArray(row.tags)) {
          row.tags.forEach((tag: string) => {
            if (tag && tag.trim()) {
              allTags.add(tag.trim());
            }
          });
        }
      });

      return Array.from(allTags).sort();
    } catch (error) {
      console.error(`Error getting deal tags for company ${companyId}:`, error);
      return [];
    }
  }

  async getContactTags(companyId: number): Promise<string[]> {
    try {
      const result = await db
        .select({ tags: contacts.tags })
        .from(contacts)
        .where(
          and(
            eq(contacts.companyId, companyId),
            eq(contacts.isActive, true),
            sql`${contacts.tags} IS NOT NULL`,
            sql`array_length(${contacts.tags}, 1) > 0`
          )
        );

      const allTags = new Set<string>();
      result.forEach((row: { tags: string[] | null }) => {
        if (row.tags && Array.isArray(row.tags)) {
          row.tags.forEach((tag: string) => {
            if (tag && tag.trim()) {
              allTags.add(tag.trim());
            }
          });
        }
      });

      return Array.from(allTags).sort();
    } catch (error) {
      console.error(`Error getting contact tags for company ${companyId}:`, error);
      return [];
    }
  }

  async getContactsForExport(options: {
    companyId: number;
    exportScope?: 'all' | 'filtered';
    tags?: string[];
    createdAfter?: string;
    createdBefore?: string;
    search?: string;
    channel?: string;
    userId?: number;
    contactScope?: 'own' | 'assigned' | 'company';
  }): Promise<Contact[]> {
    try {
      let whereConditions = [
        eq(contacts.companyId, options.companyId),
        eq(contacts.isActive, true)
      ];


      if (options?.contactScope && options?.userId) {
        if (options.contactScope === 'own') {

          whereConditions.push(eq(contacts.createdBy, options.userId));
        } else if (options.contactScope === 'assigned') {

          whereConditions.push(sql`EXISTS (
          SELECT 1 FROM ${conversations}
          WHERE ${conversations.contactId} = ${contacts.id}
          AND ${conversations.companyId} = ${options.companyId}
          AND ${conversations.assignedToUserId} = ${options.userId}
        )`);
        }

      }



      const phoneNumberFilter = or(
        isNull(contacts.phone),
        and(
          sql`${contacts.phone} NOT LIKE 'LID-%'`,
          sql`NOT (LENGTH(REGEXP_REPLACE(${contacts.phone}, '[^0-9]', '', 'g')) >= 15 AND REGEXP_REPLACE(${contacts.phone}, '[^0-9]', '', 'g') ~ '^120[0-9]+$')`
        )
      );

      if (phoneNumberFilter) {
        whereConditions.push(phoneNumberFilter);
      }


      const shouldApplyFilters = options.exportScope === 'filtered';

      if (shouldApplyFilters) {
        if (options.tags && options.tags.length > 0) {
          const tagConditions = options.tags.map(tag =>
            sql`${contacts.tags} @> ARRAY[${tag}]::text[]`
          );
          const tagCondition = or(...tagConditions);
          if (tagCondition) {
            whereConditions.push(tagCondition);
          }
        }

        if (options.createdAfter) {
          whereConditions.push(gte(contacts.createdAt, new Date(options.createdAfter)));
        }

        if (options.createdBefore) {
          whereConditions.push(lte(contacts.createdAt, new Date(options.createdBefore)));
        }

        if (options.search) {
          const searchTerm = `%${options.search}%`;
          const searchCondition = or(
            sql`${contacts.name} ILIKE ${searchTerm}`,
            sql`${contacts.email} ILIKE ${searchTerm}`,
            sql`${contacts.phone} ILIKE ${searchTerm}`
          );
          if (searchCondition) {
            whereConditions.push(searchCondition);
          }
        }

        if (options.channel && options.channel !== 'all' && options.channel !== '') {
          whereConditions.push(eq(contacts.identifierType, options.channel));
        }
      }

      const contactsList = await db
        .select()
        .from(contacts)
        .where(and(...whereConditions))
        .orderBy(desc(contacts.createdAt));

      return contactsList;
    } catch (error) {
      console.error('Error getting contacts for export:', error);
      return [];
    }
  }

  /**
   * Get contacts without conversations for a company
   * These are contacts that can potentially have conversations created for them
   */
  async getContactsWithoutConversations(companyId: number, options?: {
    search?: string;
    limit?: number;
    offset?: number;
    userId?: number;
    contactScope?: 'own' | 'assigned' | 'company';
  }): Promise<{ contacts: Contact[]; total: number }> {
    let searchTerm = options?.search?.trim();


    const queryTimeout = 30000; // 30 seconds timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Query timeout')), queryTimeout);
    });

    try {
      const limit = Math.min(options?.limit || 50, 100); // Cap limit to prevent large queries
      const offset = Math.max(options?.offset || 0, 0); // Ensure non-negative offset

      let whereConditions = [
        eq(contacts.companyId, companyId),
        eq(contacts.isActive, true),
        isNotNull(contacts.identifierType),
        ne(contacts.identifierType, 'email')
      ];


      if (options?.contactScope && options.contactScope !== 'company') {
        if (options.contactScope === 'own' && options.userId) {

          whereConditions.push(eq(contacts.createdBy, options.userId));
        } else if (options.contactScope === 'assigned' && options.userId) {




          return { contacts: [], total: 0 };
        }

      }


      const phoneNumberFilter = and(
        or(
          isNull(contacts.phone),
          and(
            sql`${contacts.phone} NOT LIKE 'LID-%'`,
            sql`LENGTH(REGEXP_REPLACE(${contacts.phone}, '[^0-9]', '', 'g')) >= 7`,
            sql`LENGTH(REGEXP_REPLACE(${contacts.phone}, '[^0-9]', '', 'g')) <= 14`,
            sql`NOT (LENGTH(REGEXP_REPLACE(${contacts.phone}, '[^0-9]', '', 'g')) >= 15 AND REGEXP_REPLACE(${contacts.phone}, '[^0-9]', '', 'g') ~ '^120[0-9]+$')`
          )
        )
      );

      if (phoneNumberFilter) {
        whereConditions.push(phoneNumberFilter);
      }



      if (searchTerm && searchTerm.length > 0) {

        if (searchTerm.length > 100) {
          searchTerm = searchTerm.substring(0, 100);
        }


        const escapedSearchTerm = searchTerm.replace(/[%_\\]/g, '\\$&');
        const searchPattern = `%${escapedSearchTerm}%`;

        try {

          const searchCondition = or(

            sql`${contacts.name} ILIKE ${searchPattern}`,

            sql`${contacts.email} ILIKE ${searchPattern}`,
            sql`${contacts.phone} LIKE ${searchPattern}`,
            sql`${contacts.company} ILIKE ${searchPattern}`,

            sql`${contacts.identifier} LIKE ${searchPattern}`
          );

          if (searchCondition) {
            whereConditions.push(searchCondition);
          }
        } catch (searchError) {

        }
      }


      const contactsWithoutConversationsQuery = db
        .select({
          id: contacts.id,
          companyId: contacts.companyId,
          name: contacts.name,
          avatarUrl: contacts.avatarUrl,
          email: contacts.email,
          phone: contacts.phone,
          company: contacts.company,
          tags: contacts.tags,
          isActive: contacts.isActive,
          identifier: contacts.identifier,
          identifierType: contacts.identifierType,
          source: contacts.source,
          notes: contacts.notes,
          isHistorySync: contacts.isHistorySync,
          historySyncBatchId: contacts.historySyncBatchId,
          isArchived: contacts.isArchived,
          createdAt: contacts.createdAt,
          updatedAt: contacts.updatedAt
        })
        .from(contacts)
        .leftJoin(conversations, eq(conversations.contactId, contacts.id))
        .where(
          and(
            ...whereConditions,
            isNull(conversations.id) // No conversation exists for this contact
          )
        )
        .orderBy(desc(contacts.createdAt))
        .limit(limit)
        .offset(offset);


      const contactsList = await Promise.race([
        contactsWithoutConversationsQuery,
        timeoutPromise
      ]) as Contact[];


      let total = 0;
      try {
        const totalQuery = db
          .select({ count: sql`COUNT(*)::int` })
          .from(contacts)
          .leftJoin(conversations, eq(conversations.contactId, contacts.id))
          .where(
            and(
              ...whereConditions,
              isNull(conversations.id)
            )
          );

        const totalResult = await Promise.race([
          totalQuery,
          timeoutPromise
        ]) as any[];
        total = Number(totalResult[0]?.count || 0);
      } catch (totalError) {
        total = contactsList.length; // Fallback to result length
      }

      return {
        contacts: contactsList,
        total
      };
    } catch (error: any) {

      return { contacts: [], total: 0 };
    }
  }

  /**
   * Create a conversation for a contact based on their identifier type
   */
  async createConversationForContact(contactId: number, userId: number): Promise<Conversation | null> {
    try {
      const contact = await this.getContact(contactId);
      if (!contact) {
        throw new Error('Contact not found');
      }

      const user = await this.getUser(userId);
      if (!user || !user.companyId) {
        throw new Error('User or company not found');
      }


      const existingConversations = await this.getConversationsByContact(contactId);
      if (existingConversations.length > 0) {
        return existingConversations[0]; // Return existing conversation
      }


      const channelConnections = await this.getChannelConnectionsByCompany(user.companyId);

      let appropriateConnection = null;


      if (contact.identifierType) {
        appropriateConnection = channelConnections.find(conn =>
          conn.channelType === contact.identifierType && conn.status === 'active'
        );


        if (!appropriateConnection) {
          if (contact.identifierType === 'whatsapp_official') {
            appropriateConnection = channelConnections.find(conn =>
              conn.channelType === 'whatsapp_official' && conn.status === 'active'
            );
          } else if (contact.identifierType === 'whatsapp_unofficial' || contact.identifierType === 'whatsapp') {
            appropriateConnection = channelConnections.find(conn =>
              (conn.channelType === 'whatsapp_unofficial' || conn.channelType === 'whatsapp') && conn.status === 'active'
            );
          }
        }
      }

      if (!appropriateConnection) {
        throw new Error(`No active channel connection found for contact type: ${contact.identifierType}`);
      }


      const conversationData: InsertConversation = {
        companyId: user.companyId,
        contactId: contact.id,
        channelId: appropriateConnection.id,
        channelType: appropriateConnection.channelType,
        status: 'open',
        assignedToUserId: userId,
        lastMessageAt: new Date()
      };

      const conversation = await this.createConversation(conversationData);
      return conversation;
    } catch (error) {
      console.error('Error creating conversation for contact:', error);
      return null;
    }
  }

  async createDeal(deal: InsertDeal): Promise<Deal> {
    try {
      if (!deal.contactId) {
        throw new Error('Contact ID is required');
      }


      let pipelineId = deal.pipelineId;
      if (!pipelineId && deal.companyId) {
        const defaultPipeline = await this.getDefaultPipelineForCompany(deal.companyId);
        if (defaultPipeline) {
          pipelineId = defaultPipeline.id;
        }
      }

      const processedDeal = {
        ...deal,
        pipelineId,
        dueDate: deal.dueDate ? new Date(deal.dueDate) : undefined,
        lastActivityAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        stage: deal.stage || 'lead',
        status: deal.status || 'active',
        priority: deal.priority || 'medium'
      };

      const [newDeal] = await db
        .insert(deals)
        .values(processedDeal)
        .returning();


      if (deal.tags && deal.tags.length > 0 && deal.contactId) {
        try {
          await this.updateContact(deal.contactId, { tags: deal.tags });
        } catch (error) {

          console.error(`Error syncing deal tags to contact for new deal:`, error);
        }
      }

      return newDeal;
    } catch (error: any) {
      console.error('Error creating deal:', error);
      if (error.message === 'Contact ID is required') {
        throw error;
      }
      throw new Error('Failed to create deal');
    }
  }

  async updateDeal(id: number, updates: Partial<InsertDeal>): Promise<Deal> {
    try {

      const [existingDeal] = await db.select().from(deals).where(eq(deals.id, id));
      if (!existingDeal) {
        throw new Error(`Deal with ID ${id} not found`);
      }


      if (updates.pipelineId !== undefined || updates.stageId !== undefined) {
        let pipelineId = updates.pipelineId ?? existingDeal.pipelineId;
        let stageId = updates.stageId ?? existingDeal.stageId;

        if (stageId) {

          const [stage] = await db
            .select()
            .from(pipelineStages)
            .where(eq(pipelineStages.id, stageId));

          if (stage) {
            if (pipelineId && stage.pipelineId !== pipelineId) {
              pipelineId = stage.pipelineId;
              updates.pipelineId = pipelineId;
            } else if (!pipelineId) {

              pipelineId = stage.pipelineId;
              updates.pipelineId = pipelineId;
            }
          }
        } else if (pipelineId && !updates.stageId) {

          const [firstStage] = await db
            .select()
            .from(pipelineStages)
            .where(eq(pipelineStages.pipelineId, pipelineId))
            .orderBy(pipelineStages.order)
            .limit(1);

          if (firstStage) {
            updates.stageId = firstStage.id;
          }
        }
      }

      if (updates.stageId !== undefined) {
        const stageId = updates.stageId;
        const otherUpdates = { ...updates };
        delete otherUpdates.stageId;

        let dealWithNewStage = null;
        if (stageId !== null) {
          dealWithNewStage = await this.updateDealStageId(id, stageId);
        }

        if (Object.keys(otherUpdates).length > 0) {
          const processedUpdates = {
            ...otherUpdates,
            dueDate: otherUpdates.dueDate ? new Date(otherUpdates.dueDate) : undefined,
            updatedAt: new Date()
          };

          const [finalUpdatedDeal] = await db
            .update(deals)
            .set(processedUpdates)
            .where(eq(deals.id, id))
            .returning();

          const resultDeal = finalUpdatedDeal || dealWithNewStage;


          if (otherUpdates.tags !== undefined && existingDeal.contactId) {
            try {
              await this.updateContact(existingDeal.contactId, { tags: otherUpdates.tags || null });
            } catch (error) {

              console.error(`Error syncing deal tags to contact for deal ${id}:`, error);
            }
          }

          return resultDeal;
        }

        if (dealWithNewStage) {
          return dealWithNewStage;
        }

        const [currentDeal] = await db
          .select()
          .from(deals)
          .where(eq(deals.id, id));

        if (!currentDeal) {
          throw new Error(`Deal with ID ${id} not found`);
        }

        return currentDeal;
      }

      const processedUpdates = {
        ...updates,
        dueDate: updates.dueDate ? new Date(updates.dueDate) : undefined,
        updatedAt: new Date()
      };

      const [updatedDeal] = await db
        .update(deals)
        .set(processedUpdates)
        .where(eq(deals.id, id))
        .returning();

      if (!updatedDeal) {
        throw new Error(`Deal with ID ${id} not found`);
      }


      if (updates.tags !== undefined && existingDeal.contactId) {
        try {
          await this.updateContact(existingDeal.contactId, { tags: updates.tags || null });
        } catch (error) {

          console.error(`Error syncing deal tags to contact for deal ${id}:`, error);
        }
      }

      return updatedDeal;
    } catch (error) {
      console.error(`Error updating deal with ID ${id}:`, error);
      throw new Error('Failed to update deal');
    }
  }

  async updateDealStage(id: number, stage: DealStatus): Promise<Deal> {
    try {
      const [updatedDeal] = await db
        .update(deals)
        .set({
          stage,
          lastActivityAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(deals.id, id))
        .returning();

      if (!updatedDeal) {
        throw new Error(`Deal with ID ${id} not found`);
      }

      return updatedDeal;
    } catch (error) {
      console.error(`Error updating stage for deal with ID ${id}:`, error);
      throw new Error('Failed to update deal stage');
    }
  }

  async deleteDeal(id: number, companyId?: number): Promise<{ success: boolean; reason?: string }> {
    try {

      const whereConditions = companyId
        ? and(eq(deals.id, id), eq(deals.companyId, companyId))
        : eq(deals.id, id);

      const existingDeal = await db
        .select({ id: deals.id, status: deals.status, companyId: deals.companyId })
        .from(deals)
        .where(whereConditions)
        .limit(1);

      if (existingDeal.length === 0) {
        return { success: false, reason: 'Deal not found' };
      }


      if (existingDeal[0].status === 'archived') {
        return { success: true, reason: 'Already deleted' };
      }


      const [updatedDeal] = await db
        .update(deals)
        .set({
          status: 'archived',
          updatedAt: new Date()
        })
        .where(whereConditions)
        .returning();

      return { success: !!updatedDeal };
    } catch (error) {
      console.error(`Error deleting deal with ID ${id}:`, error);
      return { success: false, reason: 'Database error' };
    }
  }

  async getDealActivities(dealId: number): Promise<DealActivity[]> {
    try {
      return db
        .select()
        .from(dealActivities)
        .where(eq(dealActivities.dealId, dealId))
        .orderBy(desc(dealActivities.createdAt));
    } catch (error) {
      console.error(`Error getting activities for deal ${dealId}:`, error);
      return [];
    }
  }

  async createDealActivity(activity: InsertDealActivity): Promise<DealActivity> {
    try {
      const [newActivity] = await db
        .insert(dealActivities)
        .values({
          ...activity,
          createdAt: new Date()
        })
        .returning();

      await db
        .update(deals)
        .set({ lastActivityAt: new Date() })
        .where(eq(deals.id, activity.dealId));

      return newActivity;
    } catch (error) {
      console.error('Error creating deal activity:', error);
      throw new Error('Failed to create deal activity');
    }
  }

  async getPipelineStages(): Promise<PipelineStage[]> {

    console.warn('[DEPRECATED] getPipelineStages() is deprecated. Use getPipelineStagesByCompany() or getPipelineStagesByPipeline() instead.');
    try {
      return db
        .select()
        .from(pipelineStages)
        .orderBy(pipelineStages.order);
    } catch (error) {
      console.error('Error getting pipeline stages:', error);
      return [];
    }
  }

  async getPipelineStageById(id: number): Promise<PipelineStage | null> {
    try {
      const [stage] = await db
        .select()
        .from(pipelineStages)
        .where(eq(pipelineStages.id, id));

      return stage || null;
    } catch (error) {
      console.error(`Error getting pipeline stage with ID ${id}:`, error);
      return null;
    }
  }

  async getPipelineStagesByCompany(companyId: number, pipelineId?: number): Promise<PipelineStage[]> {
    try {

      if (!pipelineId) {
        const defaultPipeline = await this.getDefaultPipelineForCompany(companyId);
        if (defaultPipeline) {
          pipelineId = defaultPipeline.id;
        }
      }

      const conditions = [eq(pipelineStages.companyId, companyId)];
      if (pipelineId) {
        conditions.push(eq(pipelineStages.pipelineId, pipelineId));
      }
      return db
        .select()
        .from(pipelineStages)
        .where(and(...conditions))
        .orderBy(pipelineStages.order);
    } catch (error) {
      console.error(`Error getting pipeline stages for company ${companyId}:`, error);
      return [];
    }
  }

  async getPipelineStage(id: number): Promise<PipelineStage | undefined> {
    try {
      const [stage] = await db
        .select()
        .from(pipelineStages)
        .where(eq(pipelineStages.id, id));
      return stage;
    } catch (error) {
      console.error(`Error getting pipeline stage with ID ${id}:`, error);
      return undefined;
    }
  }

  async createPipelineStage(stage: InsertPipelineStage): Promise<PipelineStage> {
    try {
      if (!stage.pipelineId) {
        throw new Error('pipelineId is required to create a pipeline stage');
      }


      const maxOrderResult = await db
        .select({ maxOrder: sql`MAX(${pipelineStages.order})` })
        .from(pipelineStages)
        .where(and(
          eq(pipelineStages.pipelineId, stage.pipelineId),
          stage.companyId ? eq(pipelineStages.companyId, stage.companyId) : isNull(pipelineStages.companyId)
        ));

      const maxOrder = maxOrderResult[0]?.maxOrder || 0;
      const newOrder = stage.order || (maxOrder as number) + 1;

      const [newStage] = await db
        .insert(pipelineStages)
        .values({
          ...stage,
          order: newOrder,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      return newStage;
    } catch (error) {
      console.error('Error creating pipeline stage:', error);
      throw new Error('Failed to create pipeline stage');
    }
  }

  async updatePipelineStage(id: number, updates: Partial<InsertPipelineStage>): Promise<PipelineStage> {
    try {
      const [updatedStage] = await db
        .update(pipelineStages)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(pipelineStages.id, id))
        .returning();

      if (!updatedStage) {
        throw new Error(`Pipeline stage with ID ${id} not found`);
      }

      return updatedStage;
    } catch (error) {
      console.error(`Error updating pipeline stage with ID ${id}:`, error);
      throw new Error('Failed to update pipeline stage');
    }
  }

  async deletePipelineStage(id: number, moveDealsToStageId?: number): Promise<boolean> {
    try {
      return await db.transaction(async (tx: any) => {

        const [stageToDelete] = await tx
          .select()
          .from(pipelineStages)
          .where(eq(pipelineStages.id, id));

        if (!stageToDelete) {
          throw new Error(`Pipeline stage with ID ${id} not found`);
        }

        if (moveDealsToStageId) {

          const [targetStage] = await tx
            .select()
            .from(pipelineStages)
            .where(eq(pipelineStages.id, moveDealsToStageId));

          if (!targetStage) {
            throw new Error('Target stage not found');
          }

          if (targetStage.pipelineId !== stageToDelete.pipelineId) {
            throw new Error('Cannot move deals to a stage in a different pipeline');
          }

          await tx
            .update(deals)
            .set({
              stageId: moveDealsToStageId,
              updatedAt: new Date()
            })
            .where(eq(deals.stageId, id));
        }

        await tx
          .delete(pipelineStages)
          .where(eq(pipelineStages.id, id));


        const remainingStages = await tx
          .select()
          .from(pipelineStages)
          .where(eq(pipelineStages.pipelineId, stageToDelete.pipelineId))
          .orderBy(pipelineStages.order);

        for (let i = 0; i < remainingStages.length; i++) {
          await tx
            .update(pipelineStages)
            .set({ order: i + 1 })
            .where(eq(pipelineStages.id, remainingStages[i].id));
        }

        return true;
      });
    } catch (error) {
      console.error(`Error deleting pipeline stage with ID ${id}:`, error);
      return false;
    }
  }

  async reorderPipelineStages(stageIds: number[]): Promise<boolean> {
    try {
      return await db.transaction(async (tx: any) => {
        for (let i = 0; i < stageIds.length; i++) {
          await tx
            .update(pipelineStages)
            .set({
              order: i + 1,
              updatedAt: new Date()
            })
            .where(eq(pipelineStages.id, stageIds[i]));
        }
        return true;
      });
    } catch (error) {
      console.error('Error reordering pipeline stages:', error);
      return false;
    }
  }


  async getPipelines(): Promise<Pipeline[]> {
    try {
      return await db
        .select()
        .from(pipelines)
        .orderBy(pipelines.orderNum);
    } catch (error) {
      console.error('Error getting all pipelines:', error);
      return [];
    }
  }

  async getPipelinesByCompany(companyId: number): Promise<Pipeline[]> {
    try {
      return await db
        .select()
        .from(pipelines)
        .where(eq(pipelines.companyId, companyId))
        .orderBy(pipelines.orderNum);
    } catch (error) {
      console.error(`Error getting pipelines for company ${companyId}:`, error);
      return [];
    }
  }


  async getDefaultPipelineForCompany(companyId: number): Promise<Pipeline | null> {
    try {

      const [defaultPipeline] = await db
        .select()
        .from(pipelines)
        .where(and(
          eq(pipelines.companyId, companyId),
          eq(pipelines.isDefault, true)
        ))
        .limit(1);

      if (defaultPipeline) {
        return defaultPipeline;
      }


      const [firstPipeline] = await db
        .select()
        .from(pipelines)
        .where(eq(pipelines.companyId, companyId))
        .orderBy(pipelines.orderNum)
        .limit(1);

      if (firstPipeline) {
        return firstPipeline;
      }


      console.warn(`Company ${companyId} has no pipelines. Creating default pipeline.`);
      try {
        const newPipeline = await this.createPipeline({
          companyId,
          name: 'Sales Pipeline',
          description: 'Default sales pipeline',
          icon: 'trending-up',
          color: '#3a86ff',
          isDefault: true,
          isTemplate: false,
          orderNum: 1
        });


        const defaultStages = [
          { name: 'Lead', color: '#94a3b8', order: 1 },
          { name: 'Qualified', color: '#3b82f6', order: 2 },
          { name: 'Proposal', color: '#8b5cf6', order: 3 },
          { name: 'Negotiation', color: '#f59e0b', order: 4 },
          { name: 'Closed Won', color: '#10b981', order: 5 },
          { name: 'Closed Lost', color: '#ef4444', order: 6 }
        ];

        for (const stageData of defaultStages) {
          await this.createPipelineStage({
            pipelineId: newPipeline.id,
            companyId,
            name: stageData.name,
            color: stageData.color,
            order: stageData.order
          });
        }

        return newPipeline;
      } catch (createError) {
        console.error(`Error creating default pipeline for company ${companyId}:`, createError);
        return null;
      }
    } catch (error) {
      console.error(`Error getting default pipeline for company ${companyId}:`, error);
      return null;
    }
  }

  async getPipeline(id: number): Promise<Pipeline | undefined> {
    try {
      const [pipeline] = await db
        .select()
        .from(pipelines)
        .where(eq(pipelines.id, id));
      return pipeline;
    } catch (error) {
      console.error(`Error getting pipeline with ID ${id}:`, error);
      return undefined;
    }
  }

  async createPipeline(pipeline: InsertPipeline): Promise<Pipeline> {
    try {

      const maxOrderResult = await db
        .select({ maxOrder: sql`MAX(${pipelines.orderNum})` })
        .from(pipelines)
        .where(pipeline.companyId ? eq(pipelines.companyId, pipeline.companyId) : isNull(pipelines.companyId));

      const maxOrder = maxOrderResult[0]?.maxOrder || 0;
      const newOrderNum = pipeline.orderNum || (maxOrder as number) + 1;

      const [newPipeline] = await db
        .insert(pipelines)
        .values({
          ...pipeline,
          orderNum: newOrderNum,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      return newPipeline;
    } catch (error: any) {
      console.error('Error creating pipeline:', error);

      if (error.code === '23505' && (
        error.constraint === 'idx_pipelines_company_name_unique' ||
        error.message?.includes('idx_pipelines_company_name_unique')
      )) {
        const duplicateError = new Error('Pipeline name already exists');
        (duplicateError as any).isDuplicateName = true;
        throw duplicateError;
      }
      throw new Error('Failed to create pipeline');
    }
  }

  async updatePipeline(id: number, updates: Partial<InsertPipeline>): Promise<Pipeline> {
    try {


      if (updates.isDefault === true) {
        return await db.transaction(async (tx: any) => {

          const [existingPipeline] = await tx
            .select()
            .from(pipelines)
            .where(eq(pipelines.id, id));

          if (!existingPipeline) {
            throw new Error(`Pipeline with ID ${id} not found`);
          }

          const companyId = existingPipeline.companyId;


          if (companyId !== null) {
            await tx
              .update(pipelines)
              .set({
                isDefault: false,
                updatedAt: new Date()
              })
              .where(
                and(
                  eq(pipelines.companyId, companyId),
                  ne(pipelines.id, id)
                )
              );
          }


          const [updatedPipeline] = await tx
            .update(pipelines)
            .set({
              ...updates,
              updatedAt: new Date()
            })
            .where(eq(pipelines.id, id))
            .returning();

          if (!updatedPipeline) {
            throw new Error(`Pipeline with ID ${id} not found`);
          }

          return updatedPipeline;
        });
      }


      const [updatedPipeline] = await db
        .update(pipelines)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(pipelines.id, id))
        .returning();

      if (!updatedPipeline) {
        throw new Error(`Pipeline with ID ${id} not found`);
      }

      return updatedPipeline;
    } catch (error: any) {
      console.error(`Error updating pipeline with ID ${id}:`, error);

      if (error.code === '23505' && (
        error.constraint === 'idx_pipelines_company_name_unique' ||
        error.message?.includes('idx_pipelines_company_name_unique')
      )) {
        const duplicateError = new Error('Pipeline name already exists');
        (duplicateError as any).isDuplicateName = true;
        throw duplicateError;
      }
      throw new Error('Failed to update pipeline');
    }
  }

  async reorderPipelines(companyId: number, pipelineIds: number[]): Promise<boolean> {
    try {

      const companyPipelines = await this.getPipelinesByCompany(companyId);
      const companyPipelineIds = new Set(companyPipelines.map(p => p.id));


      const invalidIds = pipelineIds.filter(id => !companyPipelineIds.has(id));
      if (invalidIds.length > 0) {
        throw new Error(`Invalid pipeline IDs: ${invalidIds.join(', ')}. These pipelines do not belong to your company.`);
      }


      const uniqueIds = new Set(pipelineIds);
      if (uniqueIds.size !== pipelineIds.length) {
        throw new Error('Duplicate pipeline IDs found in reorder request');
      }


      const providedIds = new Set(pipelineIds);
      const missingIds = companyPipelines.filter(p => !providedIds.has(p.id)).map(p => p.id);
      if (missingIds.length > 0) {
        throw new Error(`Missing pipeline IDs: ${missingIds.join(', ')}. All pipelines must be included in the reorder.`);
      }


      return await db.transaction(async (tx: any) => {
        for (let i = 0; i < pipelineIds.length; i++) {
          await tx
            .update(pipelines)
            .set({
              orderNum: i + 1,
              updatedAt: new Date()
            })
            .where(eq(pipelines.id, pipelineIds[i]));
        }
        return true;
      });
    } catch (error) {
      console.error('Error reordering pipelines:', error);
      throw error;
    }
  }

  async deletePipeline(id: number, moveDealsToStageId?: number): Promise<boolean> {
    try {
      return await db.transaction(async (tx: any) => {

        const [pipelineToDelete] = await tx
          .select()
          .from(pipelines)
          .where(eq(pipelines.id, id));

        if (!pipelineToDelete) {
          throw new Error(`Pipeline with ID ${id} not found`);
        }

        const companyId = pipelineToDelete.companyId;


        if (moveDealsToStageId) {

          const targetStage = await tx
            .select()
            .from(pipelineStages)
            .where(eq(pipelineStages.id, moveDealsToStageId));

          if (targetStage.length === 0) {
            throw new Error('Target stage not found');
          }

          if (targetStage[0].pipelineId === id) {
            throw new Error('Cannot move deals to a stage in the same pipeline');
          }



          await tx
            .update(deals)
            .set({
              stageId: moveDealsToStageId,
              pipelineId: targetStage[0].pipelineId,
              updatedAt: new Date()
            })
            .where(eq(deals.pipelineId, id));
        }


        await tx
          .delete(pipelineStages)
          .where(eq(pipelineStages.pipelineId, id));


        await tx
          .delete(pipelines)
          .where(eq(pipelines.id, id));


        if (companyId) {
          const remainingPipelines = await tx
            .select()
            .from(pipelines)
            .where(eq(pipelines.companyId, companyId))
            .orderBy(pipelines.orderNum);

          for (let i = 0; i < remainingPipelines.length; i++) {
            await tx
              .update(pipelines)
              .set({ orderNum: i + 1 })
              .where(eq(pipelines.id, remainingPipelines[i].id));
          }
        }

        return true;
      });
    } catch (error) {
      console.error(`Error deleting pipeline with ID ${id}:`, error);
      return false;
    }
  }

  async duplicatePipeline(id: number, newName: string): Promise<Pipeline> {
    try {
      return await db.transaction(async (tx: any) => {

        const sourcePipeline = await tx
          .select()
          .from(pipelines)
          .where(eq(pipelines.id, id));

        if (sourcePipeline.length === 0) {
          throw new Error(`Pipeline with ID ${id} not found`);
        }

        const pipeline = sourcePipeline[0];


        const maxOrderResult = await tx
          .select({ maxOrder: sql`MAX(${pipelines.orderNum})` })
          .from(pipelines)
          .where(pipeline.companyId ? eq(pipelines.companyId, pipeline.companyId) : isNull(pipelines.companyId));

        const maxOrder = maxOrderResult[0]?.maxOrder || 0;
        const newOrderNum = (maxOrder as number) + 1;


        const [newPipeline] = await tx
          .insert(pipelines)
          .values({
            companyId: pipeline.companyId,
            name: newName,
            description: pipeline.description,
            icon: pipeline.icon,
            color: pipeline.color,
            isDefault: false, // Duplicated pipelines should not be default
            isTemplate: pipeline.isTemplate,
            templateCategory: pipeline.templateCategory,
            orderNum: newOrderNum,
            createdAt: new Date(),
            updatedAt: new Date()
          })
          .returning();


        const sourceStages = await tx
          .select()
          .from(pipelineStages)
          .where(eq(pipelineStages.pipelineId, id))
          .orderBy(pipelineStages.order);


        for (const stage of sourceStages) {
          await tx
            .insert(pipelineStages)
            .values({
              pipelineId: newPipeline.id,
              companyId: stage.companyId,
              name: stage.name,
              color: stage.color,
              order: stage.order,
              createdAt: new Date(),
              updatedAt: new Date()
            });
        }

        return newPipeline;
      });
    } catch (error: any) {
      console.error(`Error duplicating pipeline with ID ${id}:`, error);

      if (error.code === '23505' && (
        error.constraint === 'idx_pipelines_company_name_unique' ||
        error.message?.includes('idx_pipelines_company_name_unique')
      )) {
        const duplicateError = new Error('Pipeline name already exists');
        (duplicateError as any).isDuplicateName = true;
        throw duplicateError;
      }
      throw new Error('Failed to duplicate pipeline');
    }
  }

  async createPipelineFromTemplate(templateId: string, companyId: number, customName?: string, description?: string, icon?: string, color?: string): Promise<{ pipeline: Pipeline; stages: PipelineStage[] }> {
    try {

      if (!companyId) {
        throw new Error('Company ID is required for pipeline creation');
      }

      const { getTemplateById } = await import('@shared/pipeline-templates');
      const template = getTemplateById(templateId);

      if (!template) {
        throw new Error('Template not found');
      }

      return await db.transaction(async (tx: any) => {

        const maxOrderResult = await tx
          .select({ maxOrder: sql`MAX(${pipelines.orderNum})` })
          .from(pipelines)
          .where(eq(pipelines.companyId, companyId));

        const maxOrder = maxOrderResult[0]?.maxOrder || 0;
        const newOrderNum = (maxOrder as number) + 1;


        const [newPipeline] = await tx
          .insert(pipelines)
          .values({
            companyId,
            name: customName || template.name,
            description: description !== undefined ? description : template.description,
            icon: icon !== undefined ? icon : template.icon,
            color: color !== undefined ? color : template.color,
            isDefault: false,
            isTemplate: false,
            templateCategory: template.category,
            orderNum: newOrderNum,
            createdAt: new Date(),
            updatedAt: new Date()
          })
          .returning();


        const createdStages: PipelineStage[] = [];
        for (const stageData of template.stages) {
          const [stage] = await tx
            .insert(pipelineStages)
            .values({
              pipelineId: newPipeline.id,
              companyId,
              name: stageData.name,
              color: stageData.color,
              order: stageData.order,
              createdAt: new Date(),
              updatedAt: new Date()
            })
            .returning();
          createdStages.push(stage);
        }

        return { pipeline: newPipeline, stages: createdStages };
      });
    } catch (error: any) {
      console.error(`Error creating pipeline from template ${templateId}:`, error);

      if (error.code === '23505' && (
        error.constraint === 'idx_pipelines_company_name_unique' ||
        error.message?.includes('idx_pipelines_company_name_unique')
      )) {
        const duplicateError = new Error('Pipeline name already exists');
        (duplicateError as any).isDuplicateName = true;
        throw duplicateError;
      }
      throw error;
    }
  }

  async getPipelineWithStages(id: number): Promise<{ pipeline: Pipeline; stages: PipelineStage[] } | null> {
    try {
      const pipeline = await this.getPipeline(id);
      if (!pipeline) {
        return null;
      }

      const stages = await this.getPipelineStagesByPipeline(id);
      return { pipeline, stages };
    } catch (error) {
      console.error(`Error getting pipeline with stages for ID ${id}:`, error);
      return null;
    }
  }

  async getPipelineStagesByPipeline(pipelineId: number): Promise<PipelineStage[]> {
    try {
      return await db
        .select()
        .from(pipelineStages)
        .where(eq(pipelineStages.pipelineId, pipelineId))
        .orderBy(pipelineStages.order);
    } catch (error) {
      console.error(`Error getting pipeline stages for pipeline ${pipelineId}:`, error);
      return [];
    }
  }

  async getDeals(filter?: {
    companyId?: number;
    generalSearch?: string;
    pipelineId?: number;
    stageIds?: number[];
    priorities?: ('low' | 'medium' | 'high')[];
    minValue?: number;
    maxValue?: number;
    dueDateFrom?: string;
    dueDateTo?: string;
    assignedUserIds?: number[];
    includeUnassigned?: boolean;
    tags?: string[];
    status?: string;
    createdFrom?: string;
    createdTo?: string;
    customFields?: Record<string, { operator: 'equals' | 'contains' | 'gt' | 'lt' | 'inArray'; value: string | number | string[] }>;
  }): Promise<Deal[]> {
    try {
      const conditions = [sql`${deals.status} != 'archived'`];

      if (filter) {
        if (filter.companyId) {
          conditions.push(eq(deals.companyId, filter.companyId));
        }


        if (!filter.pipelineId && filter.companyId) {
          const defaultPipeline = await this.getDefaultPipelineForCompany(filter.companyId);
          if (defaultPipeline) {
            conditions.push(eq(deals.pipelineId, defaultPipeline.id));
          }
        } else if (filter.pipelineId) {
          conditions.push(eq(deals.pipelineId, filter.pipelineId));
        }

        if (filter.stageIds && filter.stageIds.length > 0) {
          conditions.push(inArray(deals.stageId, filter.stageIds));
        }

        if (filter.priorities && filter.priorities.length > 0) {
          conditions.push(inArray(deals.priority, filter.priorities));
        }

        if (filter.minValue !== undefined) {
          conditions.push(gte(deals.value, filter.minValue));
        }

        if (filter.maxValue !== undefined) {
          conditions.push(lte(deals.value, filter.maxValue));
        }

        if (filter.dueDateFrom) {
          conditions.push(gte(deals.dueDate, new Date(filter.dueDateFrom)));
        }

        if (filter.dueDateTo) {
          conditions.push(lte(deals.dueDate, new Date(filter.dueDateTo)));
        }

        if (filter.assignedUserIds && filter.assignedUserIds.length > 0) {
          if (filter.includeUnassigned) {
            conditions.push(
              or(
                inArray(deals.assignedToUserId, filter.assignedUserIds),
                isNull(deals.assignedToUserId)
              )!
            );
          } else {
            conditions.push(inArray(deals.assignedToUserId, filter.assignedUserIds));
          }
        } else if (filter.includeUnassigned) {
          conditions.push(isNull(deals.assignedToUserId));
        }

        if (filter.tags && filter.tags.length > 0) {
          const tagConditions = filter.tags.map(tag =>
            sql`EXISTS (
            SELECT 1 FROM unnest(${deals.tags}) AS deal_tag 
            WHERE deal_tag = ${tag}
          )`
          );
          conditions.push(or(...tagConditions)!);
        }

        if (filter.status) {
          conditions.push(eq(deals.status, filter.status));
        }

        if (filter.createdFrom) {
          conditions.push(gte(deals.createdAt, new Date(filter.createdFrom)));
        }

        if (filter.createdTo) {
          conditions.push(lte(deals.createdAt, new Date(filter.createdTo)));
        }

        if (filter.generalSearch) {
          const searchTerm = '%' + filter.generalSearch + '%';
          conditions.push(
            or(
              sql`${deals.title} ILIKE ${searchTerm}`,
              sql`${deals.description} ILIKE ${searchTerm}`,
              sql`${contacts.name} ILIKE ${searchTerm}`,
              sql`${contacts.phone} ILIKE ${searchTerm}`,
              sql`${contacts.email} ILIKE ${searchTerm}`,
              sql`EXISTS (
              SELECT 1 FROM unnest(${deals.tags}) AS tag 
              WHERE tag ILIKE ${searchTerm}
            )`
            )!
          );
        }


        if (filter.customFields && Object.keys(filter.customFields).length > 0) {
          const customFieldConditions = Object.entries(filter.customFields).map(([fieldName, filterConfig]) => {
            const { operator, value } = filterConfig;

            const escapedFieldName = fieldName.replace(/'/g, "''");
            const fieldPath = sql`${deals.customFields}->>${sql.raw(`'${escapedFieldName}'`)}`;

            switch (operator) {
              case 'equals':
                if (typeof value === 'number') {
                  return sql`(${fieldPath})::numeric = ${value}`;
                } else {
                  const escapedValue = String(value).replace(/'/g, "''");
                  return sql`${fieldPath} = ${sql.raw(`'${escapedValue}'`)}`;
                }
              case 'contains':
                const escapedContainsValue = String(value).replace(/'/g, "''");
                return sql`${fieldPath} ILIKE ${sql.raw(`'%${escapedContainsValue}%'`)}`;
              case 'gt':
                if (typeof value === 'number') {
                  return sql`(${fieldPath})::numeric > ${value}`;
                } else {
                  const escapedGtValue = String(value).replace(/'/g, "''");
                  return sql`${fieldPath} > ${sql.raw(`'${escapedGtValue}'`)}`;
                }
              case 'lt':
                if (typeof value === 'number') {
                  return sql`(${fieldPath})::numeric < ${value}`;
                } else {
                  const escapedLtValue = String(value).replace(/'/g, "''");
                  return sql`${fieldPath} < ${sql.raw(`'${escapedLtValue}'`)}`;
                }
              case 'inArray':
                if (Array.isArray(value) && value.length > 0) {

                  const valueList = value.map(v => {
                    const escaped = String(v).replace(/'/g, "''");
                    return `'${escaped}'`;
                  }).join(',');
                  return sql`${fieldPath} IN (${sql.raw(valueList)})`;
                }
                return sql`1=0`; // No match if empty array
              default:
                return sql`1=1`; // No filter
            }
          });

          if (customFieldConditions.length > 0) {
            conditions.push(and(...customFieldConditions)!);
          }
        }
      }

      const result = await db
        .select({
          id: deals.id,
          companyId: deals.companyId,
          contactId: deals.contactId,
          pipelineId: deals.pipelineId,
          title: deals.title,
          stageId: deals.stageId,
          stage: deals.stage,
          value: deals.value,
          priority: deals.priority,
          dueDate: deals.dueDate,
          assignedToUserId: deals.assignedToUserId,
          description: deals.description,
          tags: deals.tags,
          customFields: deals.customFields,
          status: deals.status,
          lastActivityAt: deals.lastActivityAt,
          createdAt: deals.createdAt,
          updatedAt: deals.updatedAt,
          contactName: contacts.name,
          contactPhone: contacts.phone,
          contactEmail: contacts.email
        })
        .from(deals)
        .leftJoin(contacts, eq(deals.contactId, contacts.id))
        .where(and(...conditions))
        .orderBy(desc(deals.lastActivityAt));

      return result.map(({ contactName, contactPhone, ...deal }: { contactName: string | null; contactPhone: string | null;[key: string]: any }) => deal);
    } catch (error) {
      console.error('Error getting deals with filter:', error);
      return [];
    }
  }

  async getDealsByStageId(stageId: number): Promise<Deal[]> {
    try {
      return db
        .select()
        .from(deals)
        .where(
          and(
            eq(deals.stageId, stageId),
            sql`${deals.status} != 'archived'`
          )
        )
        .orderBy(desc(deals.lastActivityAt));
    } catch (error) {
      console.error(`Error getting deals for stage ID ${stageId}:`, error);
      return [];
    }
  }

  async updateDealStageId(id: number, stageId: number): Promise<Deal> {
    try {
      return await db.transaction(async (tx: any) => {
        const [pipelineStage] = await tx
          .select()
          .from(pipelineStages)
          .where(eq(pipelineStages.id, stageId));

        if (!pipelineStage) {
          throw new Error(`Pipeline stage with ID ${stageId} not found`);
        }


        const [deal] = await tx.select().from(deals).where(eq(deals.id, id));
        if (!deal) {
          throw new Error(`Deal with ID ${id} not found`);
        }


        const previousStageId = deal.stageId;


        if (pipelineStage.pipelineId !== deal.pipelineId) {
          throw new Error(`Pipeline stage ${stageId} does not belong to deal's pipeline ${deal.pipelineId}`);
        }

        const stageEnumValue = this.mapPipelineStageToEnum(pipelineStage.name);

        const [updatedDeal] = await tx
          .update(deals)
          .set({
            stageId,
            stage: stageEnumValue as any,
            updatedAt: new Date(),
            lastActivityAt: new Date()
          })
          .where(eq(deals.id, id))
          .returning();

        if (!updatedDeal) {
          throw new Error(`Deal with ID ${id} not found`);
        }

        const stageName = pipelineStage.name;

        await tx
          .insert(dealActivities)
          .values({
            dealId: id,
            userId: updatedDeal.assignedToUserId || 1,
            type: 'stage_change',
            content: `Deal moved to ${stageName} stage`,
            metadata: {
              previousStageId: previousStageId,
              newStageId: stageId,
              pipelineId: deal.pipelineId
            },
            createdAt: new Date()
          });

        return updatedDeal;
      });
    } catch (error) {
      console.error(`Error updating stage for deal ${id}:`, error);
      throw new Error(`Failed to update deal stage: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private mapPipelineStageToEnum(stageName: string): string {
    const lowerStageName = stageName.toLowerCase();

    if (lowerStageName.includes('lead') || lowerStageName.includes('new')) {
      return 'lead';
    }
    if (lowerStageName.includes('qualified') || lowerStageName.includes('qualify')) {
      return 'qualified';
    }
    if (lowerStageName.includes('contact') || lowerStageName.includes('reach')) {
      return 'contacted';
    }
    if (lowerStageName.includes('demo') || lowerStageName.includes('presentation')) {
      return 'demo_scheduled';
    }
    if (lowerStageName.includes('proposal') || lowerStageName.includes('quote')) {
      return 'proposal';
    }
    if (lowerStageName.includes('negotiat') || lowerStageName.includes('discuss')) {
      return 'negotiation';
    }
    if (lowerStageName.includes('won') || lowerStageName.includes('closed') || lowerStageName.includes('success')) {
      return 'closed_won';
    }
    if (lowerStageName.includes('lost') || lowerStageName.includes('reject')) {
      return 'closed_lost';
    }

    return 'lead';
  }

  async updateDealPipelineAndStage(id: number, pipelineId: number, stageId: number): Promise<Deal> {
    try {
      return await db.transaction(async (tx: any) => {

        const [deal] = await tx.select().from(deals).where(eq(deals.id, id));
        if (!deal) {
          throw new Error(`Deal with ID ${id} not found`);
        }


        const [pipelineStage] = await tx
          .select()
          .from(pipelineStages)
          .where(eq(pipelineStages.id, stageId));

        if (!pipelineStage) {
          throw new Error(`Pipeline stage with ID ${stageId} not found`);
        }


        if (pipelineStage.pipelineId !== pipelineId) {
          throw new Error(`Pipeline stage ${stageId} does not belong to pipeline ${pipelineId}`);
        }

        const stageEnumValue = this.mapPipelineStageToEnum(pipelineStage.name);


        const [updatedDeal] = await tx
          .update(deals)
          .set({
            pipelineId,
            stageId,
            stage: stageEnumValue as any,
            updatedAt: new Date(),
            lastActivityAt: new Date()
          })
          .where(eq(deals.id, id))
          .returning();

        if (!updatedDeal) {
          throw new Error(`Deal with ID ${id} not found`);
        }

        return updatedDeal;
      });
    } catch (error) {
      console.error(`Error updating pipeline and stage for deal ${id}:`, error);


      const isUniqueConstraintError =
        (error as any)?.code === '23505' || // PostgreSQL unique violation error code
        (error instanceof Error && (
          error.message.includes('idx_unique_active_contact_deal_pipeline') ||
          error.message.includes('unique constraint') ||
          error.message.includes('duplicate key value')
        ));

      if (isUniqueConstraintError) {

        const conflictError = new Error('DUPLICATE_DEAL_CONFLICT: Contact already has an active deal in this pipeline');
        (conflictError as any).isConflictError = true;
        throw conflictError;
      }

      throw new Error(`Failed to update deal pipeline and stage: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getRolePermissions(companyId?: number): Promise<RolePermission[]> {
    try {
      const query = db.select().from(rolePermissions);

      if (companyId) {
        query.where(eq(rolePermissions.companyId, companyId));
      }

      const results = await query;

      return results.map((rp: RolePermission) => ({
        ...rp,
        permissions: rp.permissions as Record<string, boolean>
      }));
    } catch (error) {
      console.error(`Error getting role permissions for company ${companyId}:`, error);
      return [];
    }
  }

  async getRolePermissionsByRole(companyId: number, role: 'admin' | 'agent'): Promise<RolePermission | undefined> {
    try {
      const [rolePermission] = await db
        .select()
        .from(rolePermissions)
        .where(
          and(
            eq(rolePermissions.companyId, companyId),
            eq(rolePermissions.role, role)
          )
        );

      if (rolePermission) {
        return {
          ...rolePermission,
          permissions: rolePermission.permissions as Record<string, boolean>
        };
      }
      return undefined;
    } catch (error) {
      console.error(`Error getting role permissions for company ${companyId} and role ${role}:`, error);
      return undefined;
    }
  }

  async createRolePermissions(rolePermission: InsertRolePermission): Promise<RolePermission> {
    try {
      const [newRolePermission] = await db
        .insert(rolePermissions)
        .values({
          ...rolePermission,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      return {
        ...newRolePermission,
        permissions: newRolePermission.permissions as Record<string, boolean>
      };
    } catch (error) {
      console.error("Error creating role permissions:", error);
      throw error;
    }
  }

  async updateRolePermissions(role: 'admin' | 'agent', permissions: Record<string, boolean>, companyId?: number): Promise<RolePermission> {
    try {
      if (!companyId) {
        throw new Error('Company ID is required for updating role permissions');
      }

      const [updatedRolePermission] = await db
        .update(rolePermissions)
        .set({
          permissions,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(rolePermissions.companyId, companyId),
            eq(rolePermissions.role, role)
          )
        )
        .returning();

      if (updatedRolePermission) {
        return {
          ...updatedRolePermission,
          permissions: updatedRolePermission.permissions as Record<string, boolean>
        };
      }

      return await this.createRolePermissions({
        companyId,
        role,
        permissions
      });
    } catch (error) {
      console.error(`Error updating role permissions for company ${companyId} and role ${role}:`, error);
      throw error;
    }
  }

  async getActiveSubscriptionsCount(): Promise<number> {
    try {
      const result = await db
        .select({ count: sql`COUNT(*)` })
        .from(companies)
        .where(eq(companies.subscriptionStatus, 'active'));

      return Number(result[0]?.count || 0);
    } catch (error) {
      console.error("Error getting active subscriptions count:", error);
      return 0;
    }
  }

  async getPaymentTransactionsSince(startDate: Date): Promise<PaymentTransaction[]> {
    try {
      const result = await db
        .select()
        .from(paymentTransactions)
        .where(sql`${paymentTransactions.createdAt} >= ${startDate}`)
        .orderBy(desc(paymentTransactions.createdAt));

      return result.map((transaction: any) => this.mapToPaymentTransaction(transaction));
    } catch (error) {
      console.error("Error getting payment transactions since date:", error);
      return [];
    }
  }

  async getCompaniesWithPaymentDetails(filters: any): Promise<any> {
    try {
      const { offset, limit, search, status, paymentMethod: _paymentMethod } = filters;

      const conditions = [];

      if (search) {
        conditions.push(sql`${companies.name} ILIKE ${`%${search}%`}`);
      }

      if (status) {
        conditions.push(eq(companies.subscriptionStatus, status));
      }

      const baseQuery = db
        .select({
          id: companies.id,
          name: companies.name,
          subscriptionStatus: companies.subscriptionStatus,
          planId: companies.planId,
          subscriptionEndDate: companies.subscriptionEndDate,
          createdAt: companies.createdAt
        })
        .from(companies);

      const query = conditions.length > 0
        ? baseQuery.where(and(...conditions))
        : baseQuery;

      const baseCountQuery = db
        .select({ count: sql`COUNT(*)` })
        .from(companies);

      const countQuery = conditions.length > 0
        ? baseCountQuery.where(and(...conditions))
        : baseCountQuery;

      const [{ count: totalCount }] = await countQuery;

      const result = await query
        .offset(offset)
        .limit(limit)
        .orderBy(desc(companies.createdAt));

      const enhancedCompanies = await Promise.all(result.map(async (company: Company) => {
        const [lastPayment] = await db
          .select()
          .from(paymentTransactions)
          .where(eq(paymentTransactions.companyId, company.id))
          .orderBy(desc(paymentTransactions.createdAt))
          .limit(1);

        const plan = company.planId ? await this.getPlan(company.planId) : null;

        const totalPaid = await db
          .select({ total: sql`SUM(${paymentTransactions.amount})` })
          .from(paymentTransactions)
          .where(
            and(
              eq(paymentTransactions.companyId, company.id),
              eq(paymentTransactions.status, 'completed')
            )
          );

        return {
          ...company,
          planName: plan?.name || 'No Plan',
          lastPaymentDate: lastPayment?.createdAt || null,
          lastPaymentAmount: lastPayment ? Number(lastPayment.amount) : 0,
          lastPaymentMethod: lastPayment?.paymentMethod || null,
          totalPaid: Number(totalPaid[0]?.total || 0)
        };
      }));

      return {
        data: enhancedCompanies,
        total: Number(totalCount)
      };
    } catch (error) {
      console.error("Error getting companies with payment details:", error);
      return {
        data: [],
        total: 0
      };
    }
  }

  async getPaymentTransactionsWithFilters(filters: Record<string, unknown>): Promise<{ data: PaymentTransaction[], total: number }> {
    try {
      const {
        paymentMethod,
        status,
        startDate,
        endDate,
        companyId,
        offset,
        limit
      } = filters;

      const conditions = [];

      if (paymentMethod && typeof paymentMethod === 'string') {
        conditions.push(eq(paymentTransactions.paymentMethod, paymentMethod as any));
      }

      if (status && typeof status === 'string') {
        conditions.push(eq(paymentTransactions.status, status as any));
      }

      if (startDate) {
        conditions.push(sql`${paymentTransactions.createdAt} >= ${new Date(startDate as string)}`);
      }

      if (endDate) {
        conditions.push(sql`${paymentTransactions.createdAt} <= ${new Date(endDate as string)}`);
      }

      if (companyId && typeof companyId === 'number') {
        conditions.push(eq(paymentTransactions.companyId, companyId));
      }

      const baseCountQuery = db
        .select({ count: sql`COUNT(*)` })
        .from(paymentTransactions);

      const countQuery = conditions.length > 0
        ? baseCountQuery.where(and(...conditions))
        : baseCountQuery;

      const [{ count }] = await countQuery;

      const baseDataQuery = db
        .select()
        .from(paymentTransactions);

      const dataQuery = conditions.length > 0
        ? baseDataQuery.where(and(...conditions))
        : baseDataQuery;

      const data = await dataQuery
        .orderBy(desc(paymentTransactions.createdAt))
        .offset(Number(offset) || 0)
        .limit(Number(limit) || 10);

      return {
        data: data.map((transaction: any) => this.mapToPaymentTransaction(transaction)),
        total: Number(count)
      };
    } catch (error) {
      console.error("Error getting payment transactions with filters:", error);
      return { data: [], total: 0 };
    }
  }

  async getPendingPayments(offset: number, limit: number): Promise<{ data: PaymentTransaction[], total: number }> {
    try {
      const [{ count }] = await db
        .select({ count: sql`COUNT(*)` })
        .from(paymentTransactions)
        .where(eq(paymentTransactions.status, 'pending'));

      const data = await db
        .select()
        .from(paymentTransactions)
        .where(eq(paymentTransactions.status, 'pending'))
        .orderBy(desc(paymentTransactions.createdAt))
        .offset(offset)
        .limit(limit);

      return {
        data: data.map((transaction: any) => this.mapToPaymentTransaction(transaction)),
        total: Number(count)
      };
    } catch (error) {
      console.error("Error getting pending payments:", error);
      return { data: [], total: 0 };
    }
  }

  async updatePaymentTransactionStatus(id: number, status: string, notes?: string): Promise<PaymentTransaction | null> {
    try {
      const updates: Record<string, unknown> = {
        status,
        updatedAt: new Date()
      };

      if (notes) {
        updates.metadata = sql`COALESCE(${paymentTransactions.metadata}, '{}') || ${JSON.stringify({ notes })}`;
      }

      const [updatedTransaction] = await db
        .update(paymentTransactions)
        .set(updates)
        .where(eq(paymentTransactions.id, id))
        .returning();

      if (updatedTransaction) {
        return this.mapToPaymentTransaction(updatedTransaction);
      }

      return null;
    } catch (error) {
      console.error("Error updating payment transaction status:", error);
      return null;
    }
  }

  async createPaymentReminder(reminder: Record<string, unknown>): Promise<unknown> {
    try {
      return {
        id: Date.now(),
        ...reminder
      };
    } catch (error) {
      console.error("Error creating payment reminder:", error);
      throw error;
    }
  }

  async getPaymentMethodPerformance(filters: Record<string, unknown>): Promise<unknown> {
    try {
      const { startDate, endDate } = filters;

      const conditions = [];

      if (startDate) {
        conditions.push(sql`${paymentTransactions.createdAt} >= ${new Date(startDate as string)}`);
      }

      if (endDate) {
        conditions.push(sql`${paymentTransactions.createdAt} <= ${new Date(endDate as string)}`);
      }

      const baseQuery = db
        .select({
          paymentMethod: paymentTransactions.paymentMethod,
          totalTransactions: sql`COUNT(*)`,
          successfulTransactions: sql`COUNT(CASE WHEN ${paymentTransactions.status} = 'completed' THEN 1 END)`,
          totalRevenue: sql`SUM(CASE WHEN ${paymentTransactions.status} = 'completed' THEN ${paymentTransactions.amount} ELSE 0 END)`,
          averageAmount: sql`AVG(CASE WHEN ${paymentTransactions.status} = 'completed' THEN ${paymentTransactions.amount} ELSE NULL END)`
        })
        .from(paymentTransactions)
        .groupBy(paymentTransactions.paymentMethod);

      const query = conditions.length > 0
        ? baseQuery.where(and(...conditions))
        : baseQuery;

      const result = await query;

      return result.map((row: { paymentMethod: string; totalTransactions: unknown; successfulTransactions: unknown; totalRevenue: unknown; averageAmount: unknown }) => ({
        paymentMethod: row.paymentMethod,
        totalTransactions: Number(row.totalTransactions),
        successfulTransactions: Number(row.successfulTransactions),
        totalRevenue: Number(row.totalRevenue || 0),
        averageAmount: Number(row.averageAmount || 0),
        successRate: Number(row.totalTransactions) > 0
          ? (Number(row.successfulTransactions) / Number(row.totalTransactions)) * 100
          : 0
      }));
    } catch (error) {
      console.error("Error getting payment method performance:", error);
      return [];
    }
  }

  async getPaymentTransactionsForExport(filters: Record<string, unknown>): Promise<PaymentTransaction[]> {
    try {
      const { startDate, endDate, paymentMethod, status } = filters;

      const conditions = [];

      if (paymentMethod && typeof paymentMethod === 'string') {
        conditions.push(eq(paymentTransactions.paymentMethod, paymentMethod as any));
      }

      if (status && typeof status === 'string') {
        conditions.push(eq(paymentTransactions.status, status as any));
      }

      if (startDate) {
        conditions.push(sql`${paymentTransactions.createdAt} >= ${new Date(startDate as string)}`);
      }

      if (endDate) {
        conditions.push(sql`${paymentTransactions.createdAt} <= ${new Date(endDate as string)}`);
      }

      const baseQuery = db
        .select()
        .from(paymentTransactions);

      const query = conditions.length > 0
        ? baseQuery.where(and(...conditions))
        : baseQuery;

      const result = await query.orderBy(desc(paymentTransactions.createdAt));

      return result.map((transaction: any) => this.mapToPaymentTransaction(transaction));
    } catch (error) {
      console.error("Error getting payment transactions for export:", error);
      return [];
    }
  }

  async generatePaymentCSV(transactions: PaymentTransaction[]): Promise<string> {
    try {
      const headers = [
        'ID',
        'Company ID',
        'Plan ID',
        'Amount',
        'Currency',
        'Status',
        'Payment Method',
        'External Transaction ID',
        'Created At',
        'Updated At'
      ];

      const rows = transactions.map(transaction => [
        transaction.id,
        transaction.companyId,
        transaction.planId,
        transaction.amount,
        transaction.currency,
        transaction.status,
        transaction.paymentMethod,
        transaction.externalTransactionId || '',
        transaction.createdAt.toISOString(),
        transaction.updatedAt.toISOString()
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(field => `"${field}"`).join(','))
      ].join('\n');

      return csvContent;
    } catch (error) {
      console.error("Error generating payment CSV:", error);
      throw error;
    }
  }

  async updateCompanySubscription(companyId: number, subscription: Record<string, unknown>): Promise<unknown> {
    try {
      const { planId, status, startDate: _startDate, endDate } = subscription;

      const [updatedCompany] = await db
        .update(companies)
        .set({
          planId: planId as number | null,
          subscriptionStatus: status as "active" | "inactive" | "pending" | "cancelled" | "overdue" | "trial",
          subscriptionEndDate: endDate as Date | null,
          updatedAt: new Date()
        })
        .where(eq(companies.id, companyId))
        .returning();

      return updatedCompany;
    } catch (error) {
      console.error("Error updating company subscription:", error);
      throw error;
    }
  }

  async startCompanyTrial(companyId: number, planId: number, trialDays: number): Promise<Company> {
    try {
      const trialStartDate = new Date();
      const trialEndDate = new Date();
      trialEndDate.setDate(trialStartDate.getDate() + trialDays);

      const [updatedCompany] = await db
        .update(companies)
        .set({
          planId,
          subscriptionStatus: "trial",
          trialStartDate,
          trialEndDate,
          isInTrial: true,
          updatedAt: new Date()
        })
        .where(eq(companies.id, companyId))
        .returning();

      if (!updatedCompany) {
        throw new Error(`Company with ID ${companyId} not found`);
      }

      return updatedCompany;
    } catch (error) {
      console.error("Error starting company trial:", error);
      throw error;
    }
  }

  async endCompanyTrial(companyId: number): Promise<Company> {
    try {
      const [updatedCompany] = await db
        .update(companies)
        .set({
          subscriptionStatus: "inactive",
          isInTrial: false,
          updatedAt: new Date()
        })
        .where(eq(companies.id, companyId))
        .returning();

      if (!updatedCompany) {
        throw new Error(`Company with ID ${companyId} not found`);
      }

      return updatedCompany;
    } catch (error) {
      console.error("Error ending company trial:", error);
      throw error;
    }
  }

  async getCompaniesWithExpiredTrials(): Promise<Company[]> {
    try {
      const now = new Date();
      return await db
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.isInTrial, true),
            eq(companies.subscriptionStatus, "trial"),
            lt(companies.trialEndDate, now)
          )
        );
    } catch (error) {
      console.error("Error getting companies with expired trials:", error);
      return [];
    }
  }

  async getCompaniesWithExpiringTrials(daysBeforeExpiry: number): Promise<Company[]> {
    try {
      const now = new Date();
      const expiryThreshold = new Date();
      expiryThreshold.setDate(now.getDate() + daysBeforeExpiry);

      return await db
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.isInTrial, true),
            eq(companies.subscriptionStatus, "trial"),
            gte(companies.trialEndDate, now),
            lt(companies.trialEndDate, expiryThreshold)
          )
        );
    } catch (error) {
      console.error("Error getting companies with expiring trials:", error);
      return [];
    }
  }

  async createSystemUpdate(update: InsertSystemUpdate): Promise<SystemUpdate> {
    try {
      const [newUpdate] = await db.insert(systemUpdates).values({
        ...update,
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning();
      return newUpdate;
    } catch (error) {
      console.error("Error creating system update:", error);
      throw error;
    }
  }

  async updateSystemUpdate(id: number, updates: Partial<InsertSystemUpdate>): Promise<SystemUpdate> {
    try {
      const [updatedRecord] = await db.update(systemUpdates)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(systemUpdates.id, id))
        .returning();

      if (!updatedRecord) {
        throw new Error(`System update with ID ${id} not found`);
      }

      return updatedRecord;
    } catch (error) {
      console.error("Error updating system update:", error);
      throw error;
    }
  }

  async getSystemUpdate(id: number): Promise<SystemUpdate | undefined> {
    try {
      const [update] = await db.select().from(systemUpdates).where(eq(systemUpdates.id, id));
      return update || undefined;
    } catch (error) {
      console.error("Error getting system update:", error);
      return undefined;
    }
  }

  async getAllSystemUpdates(): Promise<SystemUpdate[]> {
    try {
      return await db.select().from(systemUpdates).orderBy(desc(systemUpdates.createdAt));
    } catch (error) {
      console.error("Error getting all system updates:", error);
      return [];
    }
  }

  async getLatestSystemUpdate(): Promise<SystemUpdate | undefined> {
    try {
      const [update] = await db.select().from(systemUpdates)
        .orderBy(desc(systemUpdates.createdAt))
        .limit(1);
      return update || undefined;
    } catch (error) {
      console.error("Error getting latest system update:", error);
      return undefined;
    }
  }

  async deleteSystemUpdate(id: number): Promise<boolean> {
    try {
      await db.delete(systemUpdates).where(eq(systemUpdates.id, id));
      return true;
    } catch (error) {
      console.error("Error deleting system update:", error);
      return false;
    }
  }



  async createDatabaseBackup(name: string): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `backups/updates/${name}-${timestamp}.sql`;


      return backupPath;
    } catch (error) {
      console.error("Error creating database backup:", error);
      throw error;
    }
  }

  async getPartnerConfiguration(provider: string): Promise<PartnerConfiguration | null> {
    try {
      const [config] = await db
        .select()
        .from(partnerConfigurations)
        .where(and(
          eq(partnerConfigurations.provider, provider),
          eq(partnerConfigurations.isActive, true)
        ))
        .limit(1);
      return config || null;
    } catch (error) {
      console.error("Error getting partner configuration:", error);
      throw error;
    }
  }

  async createPartnerConfiguration(data: InsertPartnerConfiguration): Promise<PartnerConfiguration> {
    try {
      const [config] = await db
        .insert(partnerConfigurations)
        .values(data)
        .returning();
      return config;
    } catch (error) {
      console.error("Error creating partner configuration:", error);
      throw error;
    }
  }

  async updatePartnerConfiguration(id: number, data: Partial<Omit<PartnerConfiguration, 'id' | 'createdAt'>>): Promise<PartnerConfiguration> {
    try {
      const [config] = await db
        .update(partnerConfigurations)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(partnerConfigurations.id, id))
        .returning();
      return config;
    } catch (error) {
      console.error("Error updating partner configuration:", error);
      throw error;
    }
  }

  async deletePartnerConfiguration(id: number): Promise<void> {
    try {
      await db
        .delete(partnerConfigurations)
        .where(eq(partnerConfigurations.id, id));
    } catch (error) {
      console.error("Error deleting partner configuration:", error);
      throw error;
    }
  }

  async getAllPartnerConfigurations(): Promise<PartnerConfiguration[]> {
    try {
      return await db
        .select()
        .from(partnerConfigurations)
        .orderBy(desc(partnerConfigurations.createdAt));
    } catch (error) {
      console.error("Error getting all partner configurations:", error);
      throw error;
    }
  }

  async createMetaWhatsappClient(data: InsertMetaWhatsappClient): Promise<MetaWhatsappClient> {
    try {
      const [client] = await db
        .insert(metaWhatsappClients)
        .values(data)
        .returning();
      return client;
    } catch (error) {
      console.error("Error creating Meta WhatsApp client:", error);
      throw error;
    }
  }

  async getMetaWhatsappClientByBusinessAccountId(businessAccountId: string): Promise<MetaWhatsappClient | null> {
    try {
      const [client] = await db
        .select()
        .from(metaWhatsappClients)
        .where(eq(metaWhatsappClients.businessAccountId, businessAccountId))
        .limit(1);
      return client || null;
    } catch (error) {
      console.error("Error getting Meta WhatsApp client:", error);
      throw error;
    }
  }

  async getMetaWhatsappClientByCompanyId(companyId: number): Promise<MetaWhatsappClient | null> {
    try {
      const [client] = await db
        .select()
        .from(metaWhatsappClients)
        .where(eq(metaWhatsappClients.companyId, companyId))
        .limit(1);
      return client || null;
    } catch (error) {
      console.error("Error getting Meta WhatsApp client by company:", error);
      throw error;
    }
  }

  async updateMetaWhatsappClient(id: number, data: Partial<Omit<MetaWhatsappClient, 'id' | 'createdAt'>>): Promise<MetaWhatsappClient> {
    try {
      const [client] = await db
        .update(metaWhatsappClients)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(metaWhatsappClients.id, id))
        .returning();
      return client;
    } catch (error) {
      console.error("Error updating Meta WhatsApp client:", error);
      throw error;
    }
  }

  async createMetaWhatsappPhoneNumber(data: InsertMetaWhatsappPhoneNumber): Promise<MetaWhatsappPhoneNumber> {
    try {
      const [phoneNumber] = await db
        .insert(metaWhatsappPhoneNumbers)
        .values(data)
        .returning();
      return phoneNumber;
    } catch (error: any) {

      const errorData: any = {
        error: error.message,
        code: error.code,
        constraint: error.constraint,
        data: {
          clientId: data.clientId,
          phoneNumberId: data.phoneNumberId,
          phoneNumber: data.phoneNumber,
          displayName: data.displayName,
          status: data.status,
          qualityRating: data.qualityRating,
          messagingLimit: data.messagingLimit

        }
      };


      if (error.constraint === 'meta_whatsapp_phone_numbers_quality_rating_check') {
        errorData.suggestion = 'Quality rating value not allowed. Valid values: green, yellow, red, UNKNOWN, GREEN, YELLOW, RED, unknown';
      }


      if (error.code === '23514') {
        errorData.errorType = 'CHECK constraint violation';
        errorData.constraintName = error.constraint;
      }

      console.error("Error creating Meta WhatsApp phone number:", errorData);
      throw error;
    }
  }

  async getMetaWhatsappPhoneNumbersByClientId(clientId: number): Promise<MetaWhatsappPhoneNumber[]> {
    try {
      return await db
        .select()
        .from(metaWhatsappPhoneNumbers)
        .where(eq(metaWhatsappPhoneNumbers.clientId, clientId))
        .orderBy(metaWhatsappPhoneNumbers.createdAt);
    } catch (error) {
      throw error;
    }
  }

  async getMetaWhatsappPhoneNumberByPhoneNumberId(phoneNumberId: string): Promise<MetaWhatsappPhoneNumber | null> {
    try {
      const [phoneNumber] = await db
        .select()
        .from(metaWhatsappPhoneNumbers)
        .where(eq(metaWhatsappPhoneNumbers.phoneNumberId, phoneNumberId))
        .limit(1);
      return phoneNumber || null;
    } catch (error) {
      throw error;
    }
  }

  async updateMetaWhatsappPhoneNumber(id: number, data: Partial<Omit<MetaWhatsappPhoneNumber, 'id' | 'createdAt'>>): Promise<MetaWhatsappPhoneNumber> {
    try {
      const [phoneNumber] = await db
        .update(metaWhatsappPhoneNumbers)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(metaWhatsappPhoneNumbers.id, id))
        .returning();
      return phoneNumber;
    } catch (error) {
      throw error;
    }
  }

  async getMetaWhatsappPhoneNumbersByCompanyId(companyId: number): Promise<MetaWhatsappPhoneNumber[]> {
    try {
      return await db
        .select({
          id: metaWhatsappPhoneNumbers.id,
          clientId: metaWhatsappPhoneNumbers.clientId,
          phoneNumberId: metaWhatsappPhoneNumbers.phoneNumberId,
          phoneNumber: metaWhatsappPhoneNumbers.phoneNumber,
          displayName: metaWhatsappPhoneNumbers.displayName,
          status: metaWhatsappPhoneNumbers.status,
          qualityRating: metaWhatsappPhoneNumbers.qualityRating,
          messagingLimit: metaWhatsappPhoneNumbers.messagingLimit,
          accessToken: metaWhatsappPhoneNumbers.accessToken,
          createdAt: metaWhatsappPhoneNumbers.createdAt,
          updatedAt: metaWhatsappPhoneNumbers.updatedAt
        })
        .from(metaWhatsappPhoneNumbers)
        .innerJoin(metaWhatsappClients, eq(metaWhatsappPhoneNumbers.clientId, metaWhatsappClients.id))
        .where(eq(metaWhatsappClients.companyId, companyId))
        .orderBy(metaWhatsappPhoneNumbers.createdAt);
    } catch (error) {
      throw error;
    }
  }

  async createApiKey(data: InsertApiKey): Promise<ApiKey> {
    try {
      const [apiKey] = await db
        .insert(apiKeys)
        .values(data)
        .returning();
      return apiKey;
    } catch (error) {
      throw error;
    }
  }

  async getApiKeysByCompanyId(companyId: number): Promise<ApiKey[]> {
    try {
      return await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.companyId, companyId))
        .orderBy(apiKeys.createdAt);
    } catch (error) {
      throw error;
    }
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
    try {
      const [apiKey] = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.keyHash, keyHash))
        .limit(1);
      return apiKey || null;
    } catch (error) {
      throw error;
    }
  }

  async getApiKeyById(id: number): Promise<ApiKey | null> {
    try {
      const [apiKey] = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.id, id))
        .limit(1);
      return apiKey || null;
    } catch (error) {
      throw error;
    }
  }

  async updateApiKey(id: number, data: Partial<InsertApiKey>): Promise<ApiKey> {
    try {
      const [apiKey] = await db
        .update(apiKeys)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(apiKeys.id, id))
        .returning();
      return apiKey;
    } catch (error) {
      console.error("Error updating API key:", error);
      throw error;
    }
  }

  async deleteApiKey(id: number): Promise<void> {
    try {
      await db
        .delete(apiKeys)
        .where(eq(apiKeys.id, id));
    } catch (error) {
      throw error;
    }
  }

  async updateApiKeyLastUsed(id: number): Promise<void> {
    try {
      await db
        .update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, id));
    } catch (error) {
      throw error;
    }
  }

  async createApiUsage(data: InsertApiUsage): Promise<ApiUsage> {
    try {
      const [usage] = await db
        .insert(apiUsage)
        .values(data)
        .returning();
      return usage;
    } catch (error) {
      throw error;
    }
  }

  async getApiUsageByKeyId(apiKeyId: number, limit: number = 100): Promise<ApiUsage[]> {
    try {
      return await db
        .select()
        .from(apiUsage)
        .where(eq(apiUsage.apiKeyId, apiKeyId))
        .orderBy(apiUsage.createdAt)
        .limit(limit);
    } catch (error) {
      throw error;
    }
  }

  async getApiUsageStats(companyId: number, startDate: Date, endDate: Date): Promise<any> {
    try {
      const stats = await db
        .select({
          totalRequests: sql<number>`count(*)`,
          successfulRequests: sql<number>`count(*) filter (where status_code < 400)`,
          failedRequests: sql<number>`count(*) filter (where status_code >= 400)`,
          avgDuration: sql<number>`avg(duration)`,
          totalDataTransfer: sql<number>`sum(request_size + response_size)`
        })
        .from(apiUsage)
        .where(
          and(
            eq(apiUsage.companyId, companyId),
            gte(apiUsage.createdAt, startDate),
            lte(apiUsage.createdAt, endDate)
          )
        );

      return stats[0] || {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        avgDuration: 0,
        totalDataTransfer: 0
      };
    } catch (error) {
      throw error;
    }
  }

  async getRateLimit(apiKeyId: number, windowType: string, windowStart: Date): Promise<ApiRateLimit | null> {
    try {
      const [rateLimit] = await db
        .select()
        .from(apiRateLimits)
        .where(
          and(
            eq(apiRateLimits.apiKeyId, apiKeyId),
            eq(apiRateLimits.windowType, windowType),
            eq(apiRateLimits.windowStart, windowStart)
          )
        )
        .limit(1);
      return rateLimit || null;
    } catch (error) {
      throw error;
    }
  }

  async createOrUpdateRateLimit(data: InsertApiRateLimit): Promise<ApiRateLimit> {
    try {
      const existing = await this.getRateLimit(data.apiKeyId, data.windowType, data.windowStart);

      if (existing) {
        const [updated] = await db
          .update(apiRateLimits)
          .set({
            requestCount: existing.requestCount + 1,
            updatedAt: new Date()
          })
          .where(eq(apiRateLimits.id, existing.id))
          .returning();
        return updated;
      } else {
        const [created] = await db
          .insert(apiRateLimits)
          .values({ ...data, requestCount: 1 })
          .returning();
        return created;
      }
    } catch (error) {
      throw error;
    }
  }

  async createApiWebhook(data: InsertApiWebhook): Promise<ApiWebhook> {
    try {
      const [webhook] = await db
        .insert(apiWebhooks)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      return webhook;
    } catch (error) {
      throw error;
    }
  }

  async updateApiWebhook(webhookId: number, updates: Partial<InsertApiWebhook>): Promise<ApiWebhook> {
    try {
      const [updated] = await db
        .update(apiWebhooks)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(apiWebhooks.id, webhookId))
        .returning();
      return updated;
    } catch (error) {
      throw error;
    }
  }

  async getApiWebhookById(webhookId: number): Promise<ApiWebhook | null> {
    try {
      const [webhook] = await db
        .select()
        .from(apiWebhooks)
        .where(eq(apiWebhooks.id, webhookId))
        .limit(1);
      return webhook || null;
    } catch (error) {
      throw error;
    }
  }

  async cleanupOldRateLimits(olderThan: Date): Promise<void> {
    try {
      await db
        .delete(apiRateLimits)
        .where(lt(apiRateLimits.windowStart, olderThan));
    } catch (error) {
      throw error;
    }
  }

  async getUserBySocialAccount(provider: SocialProvider, providerUserId: string): Promise<User | undefined> {
    try {
      const result = await db
        .select()
        .from(users)
        .innerJoin(userSocialAccounts, eq(users.id, userSocialAccounts.userId))
        .where(
          and(
            eq(userSocialAccounts.provider, provider),
            eq(userSocialAccounts.providerUserId, providerUserId)
          )
        )
        .limit(1);

      return result[0]?.users;
    } catch (error) {
      throw error;
    }
  }

  async createUserSocialAccount(socialAccount: InsertUserSocialAccount): Promise<UserSocialAccount> {
    try {
      const [newSocialAccount] = await db
        .insert(userSocialAccounts)
        .values({
          ...socialAccount,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      return newSocialAccount;
    } catch (error) {
      throw error;
    }
  }

  async createUserFromSocialLogin(userData: {
    email: string;
    fullName: string;
    avatarUrl?: string;
    provider: SocialProvider;
    providerUserId: string;
    providerData: any;
  }): Promise<User> {
    try {
      const baseUsername = userData.email.split('@')[0];
      let username = baseUsername;
      let counter = 1;

      while (await this.getUserByUsername(username)) {
        username = `${baseUsername}${counter}`;
        counter++;
      }

      const [newUser] = await db
        .insert(users)
        .values({
          username,
          email: userData.email,
          fullName: userData.fullName,
          avatarUrl: userData.avatarUrl,
          password: '',
          role: 'admin',
          isSuperAdmin: false,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      return newUser;
    } catch (error) {
      throw error;
    }
  }

  async getUserSocialAccounts(userId: number): Promise<UserSocialAccount[]> {
    try {
      return await db
        .select()
        .from(userSocialAccounts)
        .where(eq(userSocialAccounts.userId, userId));
    } catch (error) {
      throw error;
    }
  }

  async updateUserSocialAccount(
    userId: number,
    provider: SocialProvider,
    updates: Partial<InsertUserSocialAccount>
  ): Promise<UserSocialAccount | undefined> {
    try {
      const [updatedAccount] = await db
        .update(userSocialAccounts)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(userSocialAccounts.userId, userId),
            eq(userSocialAccounts.provider, provider)
          )
        )
        .returning();

      return updatedAccount;
    } catch (error) {
      throw error;
    }
  }

  async deleteUserSocialAccount(userId: number, provider: SocialProvider): Promise<boolean> {
    try {
      const result = await db
        .delete(userSocialAccounts)
        .where(
          and(
            eq(userSocialAccounts.userId, userId),
            eq(userSocialAccounts.provider, provider)
          )
        );

      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      throw error;
    }
  }




  async getMessagesByEmailMessageId(emailMessageId: string): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .where(eq(messages.emailMessageId, emailMessageId));
  }

  async getEmailConfigByConnectionId(connectionId: number): Promise<EmailConfig | undefined> {
    const [config] = await db
      .select()
      .from(emailConfigs)
      .where(eq(emailConfigs.channelConnectionId, connectionId));
    return config;
  }

  async createEmailAttachment(attachment: InsertEmailAttachment): Promise<EmailAttachment> {
    const [newAttachment] = await db.insert(emailAttachments).values(attachment).returning();
    return newAttachment;
  }

  async getEmailAttachmentsByMessageId(messageId: number): Promise<EmailAttachment[]> {
    const attachments = await db
      .select()
      .from(emailAttachments)
      .where(eq(emailAttachments.messageId, messageId))
      .orderBy(emailAttachments.createdAt);
    return attachments;
  }

  async createOrUpdateEmailConfig(connectionId: number, config: Partial<InsertEmailConfig>): Promise<EmailConfig> {
    const existingConfig = await this.getEmailConfigByConnectionId(connectionId);

    if (existingConfig) {
      const [updatedConfig] = await db
        .update(emailConfigs)
        .set({ ...config, updatedAt: new Date() })
        .where(eq(emailConfigs.channelConnectionId, connectionId))
        .returning();
      return updatedConfig;
    } else {
      const [newConfig] = await db.insert(emailConfigs).values({
        channelConnectionId: connectionId,
        ...config
      } as InsertEmailConfig).returning();
      return newConfig;
    }
  }

  async updateEmailConfigStatus(connectionId: number, status: string, errorMessage?: string): Promise<void> {
    await db
      .update(emailConfigs)
      .set({
        status,
        lastError: errorMessage || null,
        updatedAt: new Date()
      })
      .where(eq(emailConfigs.channelConnectionId, connectionId));
  }

  async updateEmailConfigLastSync(connectionId: number, lastSyncAt: Date): Promise<void> {
    await db
      .update(emailConfigs)
      .set({
        lastSyncAt,
        updatedAt: new Date()
      })
      .where(eq(emailConfigs.channelConnectionId, connectionId));
  }

  async getConversationsByChannel(channelId: number): Promise<any[]> {
    try {




      const basicConversations = await db
        .select()
        .from(conversations)
        .where(eq(conversations.channelId, channelId))
        .orderBy(desc(conversations.lastMessageAt));



      if (basicConversations.length === 0) {

        return [];
      }


      const contactIds = basicConversations
        .map((conv: Conversation) => conv.contactId)
        .filter((id: number | null): id is number => id !== null);

      let contactsMap = new Map();
      if (contactIds.length > 0) {
        const contactsList = await db
          .select()
          .from(contacts)
          .where(inArray(contacts.id, contactIds));

        contactsList.forEach((contact: Contact) => {
          contactsMap.set(contact.id, contact);
        });
      }


      const conversationsWithContacts = basicConversations.map((conv: Conversation) => ({
        ...conv,
        contact: conv.contactId ? contactsMap.get(conv.contactId) || null : null
      }));


      return conversationsWithContacts;
    } catch (error) {
      console.error('❌ Error querying conversations:', error);
      throw error;
    }
  }

  async markMessageAsRead(messageId: number): Promise<void> {
    await db
      .update(messages)
      .set({
        readAt: new Date()
      })
      .where(eq(messages.id, messageId));
  }

  async createEmailTemplate(templateData: InsertEmailTemplate): Promise<EmailTemplate> {
    const [template] = await db.insert(emailTemplates).values(templateData).returning();
    return template;
  }

  async getEmailTemplatesByCompany(companyId: number): Promise<EmailTemplate[]> {
    return await db.select().from(emailTemplates)
      .where(and(eq(emailTemplates.companyId, companyId), eq(emailTemplates.isActive, true)))
      .orderBy(emailTemplates.name);
  }

  async getEmailTemplateById(templateId: number): Promise<EmailTemplate | null> {
    const [template] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, templateId));
    return template || null;
  }

  async updateEmailTemplate(templateId: number, updates: Partial<InsertEmailTemplate>): Promise<EmailTemplate> {
    const [template] = await db.update(emailTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(emailTemplates.id, templateId))
      .returning();
    return template;
  }

  async deleteEmailTemplate(templateId: number): Promise<void> {
    await db.update(emailTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(emailTemplates.id, templateId));
  }

  async incrementEmailTemplateUsage(templateId: number): Promise<void> {
    await db.update(emailTemplates)
      .set({
        usageCount: sql`${emailTemplates.usageCount} + 1`,
        updatedAt: new Date()
      })
      .where(eq(emailTemplates.id, templateId));
  }

  async createEmailSignature(signatureData: InsertEmailSignature): Promise<EmailSignature> {
    if (signatureData.isDefault) {
      await db.update(emailSignatures)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(
          eq(emailSignatures.userId, signatureData.userId),
          eq(emailSignatures.isDefault, true)
        ));
    }

    const [signature] = await db.insert(emailSignatures).values(signatureData).returning();
    return signature;
  }

  async getEmailSignaturesByUser(userId: number): Promise<EmailSignature[]> {
    return await db.select().from(emailSignatures)
      .where(and(eq(emailSignatures.userId, userId), eq(emailSignatures.isActive, true)))
      .orderBy(desc(emailSignatures.isDefault), emailSignatures.name);
  }

  async getDefaultEmailSignature(userId: number): Promise<EmailSignature | null> {
    const [signature] = await db.select().from(emailSignatures)
      .where(and(
        eq(emailSignatures.userId, userId),
        eq(emailSignatures.isDefault, true),
        eq(emailSignatures.isActive, true)
      ));
    return signature || null;
  }

  async getEmailSignatureById(signatureId: number): Promise<EmailSignature | null> {
    const [signature] = await db.select().from(emailSignatures).where(eq(emailSignatures.id, signatureId));
    return signature || null;
  }

  async updateEmailSignature(signatureId: number, updates: Partial<InsertEmailSignature>): Promise<EmailSignature> {
    if (updates.isDefault) {
      const signature = await this.getEmailSignatureById(signatureId);
      if (signature) {
        await db.update(emailSignatures)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(
            eq(emailSignatures.userId, signature.userId),
            eq(emailSignatures.isDefault, true),
            ne(emailSignatures.id, signatureId)
          ));
      }
    }

    const [updatedSignature] = await db.update(emailSignatures)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(emailSignatures.id, signatureId))
      .returning();
    return updatedSignature;
  }

  async deleteEmailSignature(signatureId: number): Promise<void> {
    await db.update(emailSignatures)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(emailSignatures.id, signatureId));
  }



  async getAffiliateMetrics(): Promise<Record<string, unknown>> {
    try {

      const [totalAffiliatesResult] = await db
        .select({ count: sql`COUNT(*)` })
        .from(affiliates);


      const [activeAffiliatesResult] = await db
        .select({ count: sql`COUNT(*)` })
        .from(affiliates)
        .where(eq(affiliates.status, 'active'));


      const [pendingAffiliatesResult] = await db
        .select({ count: sql`COUNT(*)` })
        .from(affiliates)
        .where(eq(affiliates.status, 'pending'));


      const [totalReferralsResult] = await db
        .select({ count: sql`COUNT(*)` })
        .from(affiliateReferrals);


      const [convertedReferralsResult] = await db
        .select({ count: sql`COUNT(*)` })
        .from(affiliateReferrals)
        .where(eq(affiliateReferrals.status, 'converted'));


      const [totalCommissionResult] = await db
        .select({ total: sql`COALESCE(SUM(${affiliateReferrals.commissionAmount}), 0)` })
        .from(affiliateReferrals)
        .where(eq(affiliateReferrals.status, 'converted'));


      const [pendingPayoutsResult] = await db
        .select({
          count: sql`COUNT(*)`,
          total: sql`COALESCE(SUM(${affiliatePayouts.amount}), 0)`
        })
        .from(affiliatePayouts)
        .where(eq(affiliatePayouts.status, 'pending'));


      const totalReferrals = Number(totalReferralsResult.count);
      const convertedReferrals = Number(convertedReferralsResult.count);
      const conversionRate = totalReferrals > 0 ? (convertedReferrals / totalReferrals) * 100 : 0;

      return {
        totalAffiliates: Number(totalAffiliatesResult.count),
        activeAffiliates: Number(activeAffiliatesResult.count),
        pendingAffiliates: Number(pendingAffiliatesResult.count),
        totalReferrals: totalReferrals,
        convertedReferrals: convertedReferrals,
        conversionRate: Math.round(conversionRate * 100) / 100,
        totalCommissionEarned: Number(totalCommissionResult.total),
        pendingPayouts: {
          count: Number(pendingPayoutsResult.count),
          amount: Number(pendingPayoutsResult.total)
        }
      };
    } catch (error) {
      console.error("Error fetching affiliate metrics:", error);
      throw error;
    }
  }

  async getAffiliates(params: Record<string, unknown>): Promise<{ data: unknown[], total: number, page: number, limit: number, totalPages: number }> {
    try {
      const page = Number(params.page) || 1;
      const limit = Math.min(Number(params.limit) || 20, 100);
      const offset = (page - 1) * limit;
      const search = params.search as string;
      const status = params.status as string;
      const sortBy = params.sortBy as string || 'createdAt';
      const sortOrder = params.sortOrder as string || 'desc';

      const conditions = [];

      if (search) {
        conditions.push(
          or(
            sql`${affiliates.name} ILIKE ${'%' + search + '%'}`,
            sql`${affiliates.email} ILIKE ${'%' + search + '%'}`,
            sql`${affiliates.affiliateCode} ILIKE ${'%' + search + '%'}`
          )
        );
      }

      if (status && status !== 'all') {
        conditions.push(eq(affiliates.status, status as any));
      }


      const countQuery = conditions.length > 0
        ? db.select({ count: sql`COUNT(*)` }).from(affiliates).where(and(...conditions))
        : db.select({ count: sql`COUNT(*)` }).from(affiliates);

      const [{ count }] = await countQuery;


      const sortColumn = sortBy === 'name' ? affiliates.name :
        sortBy === 'email' ? affiliates.email :
          sortBy === 'status' ? affiliates.status :
            sortBy === 'totalEarnings' ? affiliates.totalEarnings :
              affiliates.createdAt;

      const orderBy = sortOrder === 'asc' ? sortColumn : desc(sortColumn);

      const dataQuery = conditions.length > 0
        ? db.select().from(affiliates).where(and(...conditions))
        : db.select().from(affiliates);

      const data = await dataQuery
        .orderBy(orderBy)
        .offset(offset)
        .limit(limit);

      const totalPages = Math.ceil(Number(count) / limit);

      return {
        data,
        total: Number(count),
        page,
        limit,
        totalPages
      };
    } catch (error) {
      console.error("Error fetching affiliates:", error);
      throw error;
    }
  }

  async getAffiliate(id: number): Promise<unknown | undefined> {
    try {
      const [affiliate] = await db
        .select()
        .from(affiliates)
        .where(eq(affiliates.id, id));

      return affiliate;
    } catch (error) {
      console.error("Error fetching affiliate:", error);
      throw error;
    }
  }

  async createAffiliate(affiliate: Record<string, unknown>): Promise<unknown> {
    try {
      const [newAffiliate] = await db
        .insert(affiliates)
        .values({
          ...affiliate,
          createdAt: new Date(),
          updatedAt: new Date()
        } as any)
        .returning();

      return newAffiliate;
    } catch (error) {
      console.error("Error creating affiliate:", error);
      throw error;
    }
  }

  async updateAffiliate(id: number, updates: Record<string, unknown>): Promise<unknown | undefined> {
    try {
      const [updatedAffiliate] = await db
        .update(affiliates)
        .set({
          ...updates,
          updatedAt: new Date()
        } as any)
        .where(eq(affiliates.id, id))
        .returning();

      return updatedAffiliate;
    } catch (error) {
      console.error("Error updating affiliate:", error);
      throw error;
    }
  }

  async deleteAffiliate(id: number): Promise<boolean> {
    try {
      const result = await db
        .delete(affiliates)
        .where(eq(affiliates.id, id));

      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error("Error deleting affiliate:", error);
      return false;
    }
  }

  async generateAffiliateCode(name: string): Promise<string> {
    try {

      const baseCode = name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 8);

      let code = baseCode;
      let counter = 1;


      while (true) {
        const [existing] = await db
          .select()
          .from(affiliates)
          .where(eq(affiliates.affiliateCode, code))
          .limit(1);

        if (!existing) {
          break;
        }

        code = `${baseCode}${counter}`;
        counter++;
      }

      return code.toUpperCase();
    } catch (error) {
      console.error("Error generating affiliate code:", error);
      throw error;
    }
  }


  async createAffiliateApplication(application: Record<string, unknown>): Promise<unknown> {
    try {
      const [newApplication] = await db
        .insert(affiliateApplications)
        .values({
          ...application,
          createdAt: new Date(),
          updatedAt: new Date()
        } as any)
        .returning();

      return newApplication;
    } catch (error) {
      console.error("Error creating affiliate application:", error);
      throw error;
    }
  }

  async getAffiliateApplicationByEmail(email: string): Promise<unknown | undefined> {
    try {
      const [application] = await db
        .select()
        .from(affiliateApplications)
        .where(eq(affiliateApplications.email, email))
        .limit(1);

      return application;
    } catch (error) {
      console.error("Error fetching affiliate application by email:", error);
      throw error;
    }
  }

  async getAffiliateApplications(): Promise<unknown[]> {
    try {
      const applications = await db
        .select()
        .from(affiliateApplications)
        .orderBy(desc(affiliateApplications.submittedAt));

      return applications;
    } catch (error) {
      console.error("Error fetching affiliate applications:", error);
      throw error;
    }
  }

  async getAffiliateApplication(id: number): Promise<unknown | undefined> {
    try {
      const [application] = await db
        .select()
        .from(affiliateApplications)
        .where(eq(affiliateApplications.id, id))
        .limit(1);

      return application;
    } catch (error) {
      console.error("Error fetching affiliate application:", error);
      throw error;
    }
  }

  async updateAffiliateApplication(id: number, updates: Record<string, unknown>): Promise<unknown | undefined> {
    try {
      const [updatedApplication] = await db
        .update(affiliateApplications)
        .set({
          ...updates,
          updatedAt: new Date()
        } as any)
        .where(eq(affiliateApplications.id, id))
        .returning();

      return updatedApplication;
    } catch (error) {
      console.error("Error updating affiliate application:", error);
      throw error;
    }
  }

  async getAffiliateByEmail(email: string): Promise<unknown | undefined> {
    try {
      const [affiliate] = await db
        .select()
        .from(affiliates)
        .where(eq(affiliates.email, email))
        .limit(1);

      return affiliate;
    } catch (error) {
      console.error("Error fetching affiliate by email:", error);
      throw error;
    }
  }

  async getAffiliateCommissionStructures(affiliateId: number): Promise<unknown[]> {
    try {
      return await db
        .select()
        .from(affiliateCommissionStructures)
        .where(eq(affiliateCommissionStructures.affiliateId, affiliateId))
        .orderBy(desc(affiliateCommissionStructures.createdAt));
    } catch (error) {
      console.error("Error fetching commission structures:", error);
      throw error;
    }
  }

  async createCommissionStructure(structure: Record<string, unknown>): Promise<unknown> {
    try {
      const [newStructure] = await db
        .insert(affiliateCommissionStructures)
        .values({
          ...structure,
          createdAt: new Date(),
          updatedAt: new Date()
        } as any)
        .returning();

      return newStructure;
    } catch (error) {
      console.error("Error creating commission structure:", error);
      throw error;
    }
  }

  async updateCommissionStructure(id: number, updates: Record<string, unknown>): Promise<unknown | undefined> {
    try {
      const [updatedStructure] = await db
        .update(affiliateCommissionStructures)
        .set({
          ...updates,
          updatedAt: new Date()
        } as any)
        .where(eq(affiliateCommissionStructures.id, id))
        .returning();

      return updatedStructure;
    } catch (error) {
      console.error("Error updating commission structure:", error);
      throw error;
    }
  }

  async deleteCommissionStructure(id: number): Promise<boolean> {
    try {
      const result = await db
        .delete(affiliateCommissionStructures)
        .where(eq(affiliateCommissionStructures.id, id));

      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error("Error deleting commission structure:", error);
      return false;
    }
  }

  async getAffiliateReferrals(params: Record<string, unknown>): Promise<{ data: unknown[], total: number, page: number, limit: number, totalPages: number }> {
    try {
      const page = Number(params.page) || 1;
      const limit = Math.min(Number(params.limit) || 20, 100);
      const offset = (page - 1) * limit;
      const affiliateId = params.affiliateId as number;
      const status = params.status as string;
      const search = params.search as string;

      const conditions = [];

      if (affiliateId) {
        conditions.push(eq(affiliateReferrals.affiliateId, affiliateId));
      }

      if (status && status !== 'all') {
        conditions.push(eq(affiliateReferrals.status, status as any));
      }

      if (search) {
        conditions.push(
          or(
            sql`${affiliateReferrals.referralCode} ILIKE ${'%' + search + '%'}`,
            sql`${affiliateReferrals.referredEmail} ILIKE ${'%' + search + '%'}`
          )
        );
      }


      const countQuery = conditions.length > 0
        ? db.select({ count: sql`COUNT(*)` }).from(affiliateReferrals).where(and(...conditions))
        : db.select({ count: sql`COUNT(*)` }).from(affiliateReferrals);

      const [{ count }] = await countQuery;


      const dataQuery = db
        .select({
          referral: affiliateReferrals,
          affiliateName: affiliates.name,
          affiliateCode: affiliates.affiliateCode
        })
        .from(affiliateReferrals)
        .leftJoin(affiliates, eq(affiliateReferrals.affiliateId, affiliates.id));

      const finalQuery = conditions.length > 0
        ? dataQuery.where(and(...conditions))
        : dataQuery;

      const data = await finalQuery
        .orderBy(desc(affiliateReferrals.createdAt))
        .offset(offset)
        .limit(limit);

      const totalPages = Math.ceil(Number(count) / limit);

      return {
        data: data.map((row: { referral: any; affiliateName: string | null; affiliateCode: string | null }) => ({
          ...row.referral,
          affiliateName: row.affiliateName,
          affiliateCode: row.affiliateCode
        })),
        total: Number(count),
        page,
        limit,
        totalPages
      };
    } catch (error) {
      console.error("Error fetching affiliate referrals:", error);
      throw error;
    }
  }

  async updateAffiliateReferral(id: number, updates: Record<string, unknown>): Promise<unknown | undefined> {
    try {
      const [updatedReferral] = await db
        .update(affiliateReferrals)
        .set({
          ...updates,
          updatedAt: new Date()
        } as any)
        .where(eq(affiliateReferrals.id, id))
        .returning();

      return updatedReferral;
    } catch (error) {
      console.error("Error updating affiliate referral:", error);
      throw error;
    }
  }

  async getAffiliatePayouts(params: Record<string, unknown>): Promise<{ data: unknown[], total: number, page: number, limit: number, totalPages: number }> {
    try {
      const page = Number(params.page) || 1;
      const limit = Math.min(Number(params.limit) || 20, 100);
      const offset = (page - 1) * limit;
      const affiliateId = params.affiliateId as number;
      const status = params.status as string;
      const startDate = params.startDate as string;
      const endDate = params.endDate as string;

      const conditions = [];

      if (affiliateId) {
        conditions.push(eq(affiliatePayouts.affiliateId, affiliateId));
      }

      if (status && status !== 'all') {
        conditions.push(eq(affiliatePayouts.status, status as any));
      }

      if (startDate) {
        conditions.push(gte(affiliatePayouts.createdAt, new Date(startDate)));
      }

      if (endDate) {
        conditions.push(lte(affiliatePayouts.createdAt, new Date(endDate)));
      }


      const countQuery = conditions.length > 0
        ? db.select({ count: sql`COUNT(*)` }).from(affiliatePayouts).where(and(...conditions))
        : db.select({ count: sql`COUNT(*)` }).from(affiliatePayouts);

      const [{ count }] = await countQuery;


      const dataQuery = db
        .select({
          payout: affiliatePayouts,
          affiliateName: affiliates.name,
          affiliateCode: affiliates.affiliateCode
        })
        .from(affiliatePayouts)
        .leftJoin(affiliates, eq(affiliatePayouts.affiliateId, affiliates.id));

      const finalQuery = conditions.length > 0
        ? dataQuery.where(and(...conditions))
        : dataQuery;

      const data = await finalQuery
        .orderBy(desc(affiliatePayouts.createdAt))
        .offset(offset)
        .limit(limit);

      const totalPages = Math.ceil(Number(count) / limit);

      return {
        data: data.map((row: { payout: any; affiliateName: string | null; affiliateCode: string | null }) => ({
          ...row.payout,
          affiliateName: row.affiliateName,
          affiliateCode: row.affiliateCode
        })),
        total: Number(count),
        page,
        limit,
        totalPages
      };
    } catch (error) {
      console.error("Error fetching affiliate payouts:", error);
      throw error;
    }
  }

  async createAffiliatePayout(payout: Record<string, unknown>): Promise<unknown> {
    try {
      const [newPayout] = await db
        .insert(affiliatePayouts)
        .values({
          ...payout,
          createdAt: new Date(),
          updatedAt: new Date()
        } as any)
        .returning();

      return newPayout;
    } catch (error) {
      console.error("Error creating affiliate payout:", error);
      throw error;
    }
  }

  async updateAffiliatePayout(id: number, updates: Record<string, unknown>): Promise<unknown | undefined> {
    try {
      const [updatedPayout] = await db
        .update(affiliatePayouts)
        .set({
          ...updates,
          updatedAt: new Date()
        } as any)
        .where(eq(affiliatePayouts.id, id))
        .returning();

      return updatedPayout;
    } catch (error) {
      console.error("Error updating affiliate payout:", error);
      throw error;
    }
  }


  async getAffiliateAnalytics(params: Record<string, unknown>): Promise<unknown[]> {
    try {
      const affiliateId = params.affiliateId as number | undefined;
      const startDate = params.startDate ? new Date(params.startDate as string) : undefined;
      const endDate = params.endDate ? new Date(params.endDate as string) : undefined;
      const periodType = (params.periodType as "daily" | "weekly" | "monthly") || "daily";
      const groupBy = params.groupBy as "affiliate" | "date" | "country" | "source" | undefined;

      const conditions = [];

      if (affiliateId) {
        conditions.push(eq(affiliateAnalytics.affiliateId, affiliateId));
      }

      if (startDate) {
        conditions.push(gte(affiliateAnalytics.date, startDate.toISOString().split('T')[0]));
      }

      if (endDate) {
        conditions.push(lte(affiliateAnalytics.date, endDate.toISOString().split('T')[0]));
      }

      if (periodType) {
        conditions.push(eq(affiliateAnalytics.periodType, periodType));
      }

      let query = db
        .select({
          id: affiliateAnalytics.id,
          affiliateId: affiliateAnalytics.affiliateId,
          affiliateName: affiliates.name,
          affiliateCode: affiliates.affiliateCode,
          companyId: affiliateAnalytics.companyId,
          date: affiliateAnalytics.date,
          periodType: affiliateAnalytics.periodType,
          clicks: affiliateAnalytics.clicks,
          uniqueClicks: affiliateAnalytics.uniqueClicks,
          impressions: affiliateAnalytics.impressions,
          referrals: affiliateAnalytics.referrals,
          conversions: affiliateAnalytics.conversions,
          conversionRate: affiliateAnalytics.conversionRate,
          revenue: affiliateAnalytics.revenue,
          commissionEarned: affiliateAnalytics.commissionEarned,
          averageOrderValue: affiliateAnalytics.averageOrderValue,
          topCountries: affiliateAnalytics.topCountries,
          topSources: affiliateAnalytics.topSources,
          createdAt: affiliateAnalytics.createdAt,
          updatedAt: affiliateAnalytics.updatedAt
        })
        .from(affiliateAnalytics)
        .leftJoin(affiliates, eq(affiliateAnalytics.affiliateId, affiliates.id));

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      if (groupBy === "affiliate") {
        query = query.groupBy(
          affiliateAnalytics.affiliateId,
          affiliates.name,
          affiliates.affiliateCode
        ) as typeof query;
      } else if (groupBy === "date") {
        query = query.groupBy(affiliateAnalytics.date) as typeof query;
      }

      query = query.orderBy(desc(affiliateAnalytics.date)) as typeof query;

      const results = await query;
      return results;
    } catch (error) {
      console.error("Error fetching affiliate analytics:", error);
      throw error;
    }
  }

  async getAffiliatePerformance(params: Record<string, unknown>): Promise<unknown[]> {
    try {
      const startDate = params.startDate ? new Date(params.startDate as string) : undefined;
      const endDate = params.endDate ? new Date(params.endDate as string) : undefined;
      const topN = (params.topN as number) || 10;

      const conditions = [eq(affiliates.status, 'active')];

      if (startDate) {
        conditions.push(gte(affiliateReferrals.convertedAt, startDate));
      }

      if (endDate) {
        conditions.push(lte(affiliateReferrals.convertedAt, endDate));
      }

      const results = await db
        .select({
          affiliateId: affiliates.id,
          affiliateName: affiliates.name,
          affiliateCode: affiliates.affiliateCode,
          email: affiliates.email,
          status: affiliates.status,
          totalReferrals: sql<number>`COUNT(${affiliateReferrals.id})::int`,
          convertedReferrals: sql<number>`COUNT(CASE WHEN ${affiliateReferrals.status} = 'converted' THEN 1 END)::int`,
          pendingReferrals: sql<number>`COUNT(CASE WHEN ${affiliateReferrals.status} = 'pending' THEN 1 END)::int`,
          expiredReferrals: sql<number>`COUNT(CASE WHEN ${affiliateReferrals.status} = 'expired' THEN 1 END)::int`,
          totalRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${affiliateReferrals.status} = 'converted' THEN ${affiliateReferrals.conversionValue} ELSE 0 END), 0)::numeric`,
          totalCommission: sql<number>`COALESCE(SUM(CASE WHEN ${affiliateReferrals.status} = 'converted' THEN ${affiliateReferrals.commissionAmount} ELSE 0 END), 0)::numeric`,
          conversionRate: sql<number>`CASE 
            WHEN COUNT(${affiliateReferrals.id}) > 0 
            THEN (COUNT(CASE WHEN ${affiliateReferrals.status} = 'converted' THEN 1 END) * 100.0 / COUNT(${affiliateReferrals.id}))::numeric
            ELSE 0::numeric
          END`,
          averageOrderValue: sql<number>`CASE 
            WHEN COUNT(CASE WHEN ${affiliateReferrals.status} = 'converted' THEN 1 END) > 0
            THEN (SUM(CASE WHEN ${affiliateReferrals.status} = 'converted' THEN ${affiliateReferrals.conversionValue} ELSE 0 END) / COUNT(CASE WHEN ${affiliateReferrals.status} = 'converted' THEN 1 END))::numeric
            ELSE 0::numeric
          END`,
          totalEarnings: affiliates.totalEarnings,
          pendingEarnings: affiliates.pendingEarnings,
          paidEarnings: affiliates.paidEarnings,
          lastConversionDate: sql<Date | null>`MAX(CASE WHEN ${affiliateReferrals.status} = 'converted' THEN ${affiliateReferrals.convertedAt} END)`
        })
        .from(affiliates)
        .leftJoin(affiliateReferrals, eq(affiliates.id, affiliateReferrals.affiliateId))
        .where(and(...conditions))
        .groupBy(
          affiliates.id,
          affiliates.name,
          affiliates.affiliateCode,
          affiliates.email,
          affiliates.status,
          affiliates.totalEarnings,
          affiliates.pendingEarnings,
          affiliates.paidEarnings
        )
        .orderBy(desc(sql`COALESCE(SUM(CASE WHEN ${affiliateReferrals.status} = 'converted' THEN ${affiliateReferrals.commissionAmount} ELSE 0 END), 0)`))
        .limit(topN);

      return results;
    } catch (error) {
      console.error("Error fetching affiliate performance:", error);
      throw error;
    }
  }

  async exportAffiliateData(params: Record<string, unknown>): Promise<string> {
    try {
      const type = params.type as "affiliates" | "referrals" | "payouts" | "analytics";
      const format = (params.format as "csv" | "xlsx") || "csv";
      const startDate = params.startDate ? new Date(params.startDate as string) : undefined;
      const endDate = params.endDate ? new Date(params.endDate as string) : undefined;
      const affiliateId = params.affiliateId as number | undefined;

      if (format === "xlsx") {

        throw new Error("XLSX export format not implemented. Please use CSV format.");
      }

      let data: unknown[] = [];
      let headers: string[] = [];

      switch (type) {
        case "affiliates": {
          const conditions = [];
          if (affiliateId) {
            conditions.push(eq(affiliates.id, affiliateId));
          }

          const results = await db
            .select()
            .from(affiliates)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(affiliates.createdAt));

          data = results;
          headers = [
            "id", "name", "email", "affiliateCode", "status", "totalReferrals",
            "successfulReferrals", "totalEarnings", "pendingEarnings", "paidEarnings",
            "defaultCommissionRate", "commissionType", "createdAt", "updatedAt"
          ];
          break;
        }

        case "referrals": {
          const conditions = [];
          if (affiliateId) {
            conditions.push(eq(affiliateReferrals.affiliateId, affiliateId));
          }
          if (startDate) {
            conditions.push(gte(affiliateReferrals.createdAt, startDate));
          }
          if (endDate) {
            conditions.push(lte(affiliateReferrals.createdAt, endDate));
          }

          const results = await db
            .select({
              id: affiliateReferrals.id,
              affiliateId: affiliateReferrals.affiliateId,
              affiliateName: affiliates.name,
              affiliateCode: affiliates.affiliateCode,
              referralCode: affiliateReferrals.referralCode,
              referredCompanyId: affiliateReferrals.referredCompanyId,
              referredUserId: affiliateReferrals.referredUserId,
              referredEmail: affiliateReferrals.referredEmail,
              status: affiliateReferrals.status,
              conversionValue: affiliateReferrals.conversionValue,
              commissionAmount: affiliateReferrals.commissionAmount,
              commissionRate: affiliateReferrals.commissionRate,
              convertedAt: affiliateReferrals.convertedAt,
              createdAt: affiliateReferrals.createdAt
            })
            .from(affiliateReferrals)
            .leftJoin(affiliates, eq(affiliateReferrals.affiliateId, affiliates.id))
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(affiliateReferrals.createdAt));

          data = results;
          headers = [
            "id", "affiliateId", "affiliateName", "affiliateCode", "referralCode",
            "referredCompanyId", "referredUserId", "referredEmail", "status",
            "conversionValue", "commissionAmount", "commissionRate", "convertedAt", "createdAt"
          ];
          break;
        }

        case "payouts": {
          const conditions = [];
          if (affiliateId) {
            conditions.push(eq(affiliatePayouts.affiliateId, affiliateId));
          }
          if (startDate) {
            conditions.push(gte(affiliatePayouts.periodStart, startDate));
          }
          if (endDate) {
            conditions.push(lte(affiliatePayouts.periodEnd, endDate));
          }

          const results = await db
            .select({
              id: affiliatePayouts.id,
              affiliateId: affiliatePayouts.affiliateId,
              affiliateName: affiliates.name,
              affiliateCode: affiliates.affiliateCode,
              amount: affiliatePayouts.amount,
              currency: affiliatePayouts.currency,
              status: affiliatePayouts.status,
              paymentMethod: affiliatePayouts.paymentMethod,
              paymentReference: affiliatePayouts.paymentReference,
              periodStart: affiliatePayouts.periodStart,
              periodEnd: affiliatePayouts.periodEnd,
              processedBy: affiliatePayouts.processedBy,
              processedAt: affiliatePayouts.processedAt,
              referralIds: affiliatePayouts.referralIds,
              createdAt: affiliatePayouts.createdAt
            })
            .from(affiliatePayouts)
            .leftJoin(affiliates, eq(affiliatePayouts.affiliateId, affiliates.id))
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(affiliatePayouts.createdAt));

          data = results;
          headers = [
            "id", "affiliateId", "affiliateName", "affiliateCode", "amount", "currency",
            "status", "paymentMethod", "paymentReference", "periodStart", "periodEnd",
            "processedBy", "processedAt", "referralIds", "createdAt"
          ];
          break;
        }

        case "analytics": {
          const conditions = [];
          if (affiliateId) {
            conditions.push(eq(affiliateAnalytics.affiliateId, affiliateId));
          }
          if (startDate) {
            conditions.push(gte(affiliateAnalytics.date, startDate.toISOString().split('T')[0]));
          }
          if (endDate) {
            conditions.push(lte(affiliateAnalytics.date, endDate.toISOString().split('T')[0]));
          }

          const results = await db
            .select({
              id: affiliateAnalytics.id,
              affiliateId: affiliateAnalytics.affiliateId,
              affiliateName: affiliates.name,
              affiliateCode: affiliates.affiliateCode,
              date: affiliateAnalytics.date,
              periodType: affiliateAnalytics.periodType,
              clicks: affiliateAnalytics.clicks,
              uniqueClicks: affiliateAnalytics.uniqueClicks,
              impressions: affiliateAnalytics.impressions,
              referrals: affiliateAnalytics.referrals,
              conversions: affiliateAnalytics.conversions,
              conversionRate: affiliateAnalytics.conversionRate,
              revenue: affiliateAnalytics.revenue,
              commissionEarned: affiliateAnalytics.commissionEarned,
              averageOrderValue: affiliateAnalytics.averageOrderValue
            })
            .from(affiliateAnalytics)
            .leftJoin(affiliates, eq(affiliateAnalytics.affiliateId, affiliates.id))
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(affiliateAnalytics.date));

          data = results;
          headers = [
            "id", "affiliateId", "affiliateName", "affiliateCode", "date", "periodType",
            "clicks", "uniqueClicks", "impressions", "referrals", "conversions",
            "conversionRate", "revenue", "commissionEarned", "averageOrderValue"
          ];
          break;
        }

        default:
          throw new Error(`Invalid export type: ${type}`);
      }

      if (data.length === 0) {
        return "No data available for export";
      }


      const csvRows: string[] = [];


      csvRows.push(headers.map(h => `"${h}"`).join(","));


      for (const row of data) {
        const values = headers.map(header => {
          const value = (row as Record<string, unknown>)[header];
          if (value === null || value === undefined) {
            return "";
          }
          if (value instanceof Date) {
            return value.toISOString();
          }
          if (Array.isArray(value)) {
            return JSON.stringify(value);
          }
          if (typeof value === "object") {
            return JSON.stringify(value);
          }

          return `"${String(value).replace(/"/g, '""')}"`;
        });
        csvRows.push(values.join(","));
      }

      return csvRows.join("\n");
    } catch (error) {
      console.error("Error exporting affiliate data:", error);
      if (error instanceof Error && error.message.includes("not implemented")) {
        throw error; // Re-throw 501 errors
      }
      throw error;
    }
  }


  async getCompanyPages(companyId: number, options?: { published?: boolean; featured?: boolean }): Promise<CompanyPage[]> {
    try {
      const conditions = [eq(companyPages.companyId, companyId)];

      if (options?.published !== undefined) {
        conditions.push(eq(companyPages.isPublished, options.published));
      }

      if (options?.featured !== undefined) {
        conditions.push(eq(companyPages.isFeatured, options.featured));
      }

      const query = db.select().from(companyPages).where(and(...conditions));

      const results = await query.orderBy(desc(companyPages.createdAt));
      return results;
    } catch (error) {
      console.error(`Error getting company pages for company ${companyId}:`, error);
      return [];
    }
  }

  async getCompanyPage(id: number): Promise<CompanyPage | undefined> {
    try {
      const [page] = await db.select().from(companyPages).where(eq(companyPages.id, id));
      return page;
    } catch (error) {
      console.error(`Error getting company page ${id}:`, error);
      return undefined;
    }
  }

  async getCompanyPageBySlug(companyId: number, slug: string): Promise<CompanyPage | undefined> {
    try {
      const [page] = await db
        .select()
        .from(companyPages)
        .where(and(eq(companyPages.companyId, companyId), eq(companyPages.slug, slug)));
      return page;
    } catch (error) {
      console.error(`Error getting company page by slug ${slug} for company ${companyId}:`, error);
      return undefined;
    }
  }

  async createCompanyPage(page: InsertCompanyPage): Promise<CompanyPage> {
    try {
      const [newPage] = await db
        .insert(companyPages)
        .values({
          ...page,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      return newPage;
    } catch (error) {
      console.error("Error creating company page:", error);
      throw error;
    }
  }

  async updateCompanyPage(id: number, page: Partial<InsertCompanyPage>): Promise<CompanyPage> {
    try {
      const [updatedPage] = await db
        .update(companyPages)
        .set({
          ...page,
          updatedAt: new Date()
        })
        .where(eq(companyPages.id, id))
        .returning();

      if (!updatedPage) {
        throw new Error('Company page not found');
      }

      return updatedPage;
    } catch (error) {
      console.error(`Error updating company page ${id}:`, error);
      throw error;
    }
  }

  async deleteCompanyPage(id: number): Promise<boolean> {
    try {
      const result = await db.delete(companyPages).where(eq(companyPages.id, id));
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error(`Error deleting company page ${id}:`, error);
      return false;
    }
  }

  async publishCompanyPage(id: number): Promise<CompanyPage> {
    try {
      const [updatedPage] = await db
        .update(companyPages)
        .set({
          isPublished: true,
          publishedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(companyPages.id, id))
        .returning();

      if (!updatedPage) {
        throw new Error('Company page not found');
      }

      return updatedPage;
    } catch (error) {
      console.error(`Error publishing company page ${id}:`, error);
      throw error;
    }
  }

  async unpublishCompanyPage(id: number): Promise<CompanyPage> {
    try {
      const [updatedPage] = await db
        .update(companyPages)
        .set({
          isPublished: false,
          updatedAt: new Date()
        })
        .where(eq(companyPages.id, id))
        .returning();

      if (!updatedPage) {
        throw new Error('Company page not found');
      }

      return updatedPage;
    } catch (error) {
      console.error(`Error unpublishing company page ${id}:`, error);
      throw error;
    }
  }

  async getAllWebsites(): Promise<Website[]> {
    try {
      const result = await db
        .select()
        .from(websites)
        .orderBy(desc(websites.createdAt));
      return result;
    } catch (error) {
      console.error('Error fetching websites:', error);
      throw error;
    }
  }

  async getWebsite(id: number): Promise<Website | null> {
    try {
      const [website] = await db
        .select()
        .from(websites)
        .where(eq(websites.id, id));
      return website || null;
    } catch (error) {
      console.error(`Error fetching website ${id}:`, error);
      throw error;
    }
  }

  async getWebsiteBySlug(slug: string): Promise<Website | null> {
    try {
      const [website] = await db
        .select()
        .from(websites)
        .where(eq(websites.slug, slug));
      return website || null;
    } catch (error) {
      console.error(`Error fetching website by slug ${slug}:`, error);
      throw error;
    }
  }

  async createWebsite(websiteData: InsertWebsite): Promise<Website> {
    try {
      const [newWebsite] = await db
        .insert(websites)
        .values({
          ...websiteData,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      return newWebsite;
    } catch (error) {
      console.error('Error creating website:', error);
      throw error;
    }
  }

  async updateWebsite(id: number, websiteData: Partial<InsertWebsite>): Promise<Website> {
    try {
      const [updatedWebsite] = await db
        .update(websites)
        .set({
          ...websiteData,
          updatedAt: new Date()
        })
        .where(eq(websites.id, id))
        .returning();

      if (!updatedWebsite) {
        throw new Error('Website not found');
      }

      return updatedWebsite;
    } catch (error) {
      console.error(`Error updating website ${id}:`, error);
      throw error;
    }
  }

  async deleteWebsite(id: number): Promise<boolean> {
    try {
      const result = await db.delete(websites).where(eq(websites.id, id));
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error(`Error deleting website ${id}:`, error);
      return false;
    }
  }

  async publishWebsite(id: number): Promise<Website> {
    try {
      const [updatedWebsite] = await db
        .update(websites)
        .set({
          status: 'published',
          publishedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(websites.id, id))
        .returning();

      if (!updatedWebsite) {
        throw new Error('Website not found');
      }

      return updatedWebsite;
    } catch (error) {
      console.error(`Error publishing website ${id}:`, error);
      throw error;
    }
  }

  async unpublishWebsite(id: number): Promise<Website> {
    try {
      const [updatedWebsite] = await db
        .update(websites)
        .set({
          status: 'draft',
          updatedAt: new Date()
        })
        .where(eq(websites.id, id))
        .returning();

      if (!updatedWebsite) {
        throw new Error('Website not found');
      }

      return updatedWebsite;
    } catch (error) {
      console.error(`Error unpublishing website ${id}:`, error);
      throw error;
    }
  }

  async getPublishedWebsite(): Promise<Website | null> {
    try {
      const [website] = await db
        .select()
        .from(websites)
        .where(eq(websites.status, 'published'))
        .orderBy(desc(websites.publishedAt))
        .limit(1);
      return website || null;
    } catch (error) {
      console.error('Error fetching published website:', error);
      throw error;
    }
  }



  async getWebsiteAssets(websiteId: number): Promise<WebsiteAsset[]> {
    try {
      const result = await db
        .select()
        .from(websiteAssets)
        .where(eq(websiteAssets.websiteId, websiteId))
        .orderBy(desc(websiteAssets.createdAt));
      return result;
    } catch (error) {
      console.error(`Error fetching website assets for website ${websiteId}:`, error);
      throw error;
    }
  }

  async createWebsiteAsset(assetData: InsertWebsiteAsset): Promise<WebsiteAsset> {
    try {
      const [newAsset] = await db
        .insert(websiteAssets)
        .values({
          ...assetData,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      return newAsset;
    } catch (error) {
      console.error('Error creating website asset:', error);
      throw error;
    }
  }

  async deleteWebsiteAsset(id: number): Promise<boolean> {
    try {
      const result = await db.delete(websiteAssets).where(eq(websiteAssets.id, id));
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error(`Error deleting website asset ${id}:`, error);
      return false;
    }
  }

  async createHistorySyncBatch(batchData: InsertHistorySyncBatch): Promise<HistorySyncBatch> {
    try {
      const [newBatch] = await db
        .insert(historySyncBatches)
        .values({
          ...batchData,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      return newBatch;
    } catch (error) {
      console.error('Error creating history sync batch:', error);
      throw error;
    }
  }

  async updateHistorySyncBatch(batchId: string, updateData: Partial<InsertHistorySyncBatch>): Promise<HistorySyncBatch | null> {
    try {
      const [updatedBatch] = await db
        .update(historySyncBatches)
        .set({
          ...updateData,
          updatedAt: new Date()
        })
        .where(eq(historySyncBatches.batchId, batchId))
        .returning();
      return updatedBatch || null;
    } catch (error) {
      console.error('Error updating history sync batch:', error);
      throw error;
    }
  }

  async getHistorySyncBatch(batchId: string): Promise<HistorySyncBatch | null> {
    try {
      const [batch] = await db
        .select()
        .from(historySyncBatches)
        .where(eq(historySyncBatches.batchId, batchId))
        .limit(1);
      return batch || null;
    } catch (error) {
      console.error('Error getting history sync batch:', error);
      throw error;
    }
  }

  async getHistorySyncBatchesByConnection(connectionId: number): Promise<HistorySyncBatch[]> {
    try {
      return await db
        .select()
        .from(historySyncBatches)
        .where(eq(historySyncBatches.connectionId, connectionId))
        .orderBy(desc(historySyncBatches.createdAt));
    } catch (error) {
      console.error('Error getting history sync batches by connection:', error);
      throw error;
    }
  }


  async clearCompanyContacts(companyId: number): Promise<{ success: boolean; deletedCount: number }> {
    try {

      const companyContacts = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.companyId, companyId));

      const contactIds = companyContacts.map((c: { id: number }) => c.id);

      if (contactIds.length === 0) {
        return { success: true, deletedCount: 0 };
      }

      let totalDeleted = 0;


      await db.transaction(async (tx: any) => {

        const conversationList = await tx
          .select({ id: conversations.id })
          .from(conversations)
          .where(inArray(conversations.contactId, contactIds));

        const conversationIds = conversationList.map((c: { id: number }) => c.id);

        if (conversationIds.length > 0) {

          await tx.delete(messages).where(inArray(messages.conversationId, conversationIds));

          await tx.delete(conversations).where(inArray(conversations.id, conversationIds));
        }


        await tx.delete(notes).where(inArray(notes.contactId, contactIds));


        await tx.delete(deals).where(inArray(deals.contactId, contactIds));


        const result = await tx.delete(contacts).where(eq(contacts.companyId, companyId));
        totalDeleted = result.rowCount || 0;
      });

      return { success: true, deletedCount: totalDeleted };
    } catch (error) {
      console.error(`Error clearing contacts for company ${companyId}:`, error);
      return { success: false, deletedCount: 0 };
    }
  }

  async clearCompanyConversations(companyId: number): Promise<{ success: boolean; deletedCount: number }> {
    try {

      const companyConversations = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.companyId, companyId));

      const conversationIds = companyConversations.map((c: { id: number }) => c.id);

      if (conversationIds.length === 0) {
        return { success: true, deletedCount: 0 };
      }

      let totalDeleted = 0;

      await db.transaction(async (tx: any) => {

        await tx.delete(messages).where(inArray(messages.conversationId, conversationIds));


        const result = await tx.delete(conversations).where(eq(conversations.companyId, companyId));
        totalDeleted = result.rowCount || 0;
      });

      return { success: true, deletedCount: totalDeleted };
    } catch (error) {
      console.error(`Error clearing conversations for company ${companyId}:`, error);
      return { success: false, deletedCount: 0 };
    }
  }

  async clearCompanyMessages(companyId: number): Promise<{ success: boolean; deletedCount: number }> {
    try {

      const result = await db
        .delete(messages)
        .where(
          inArray(
            messages.conversationId,
            db.select({ id: conversations.id })
              .from(conversations)
              .where(eq(conversations.companyId, companyId))
          )
        );

      return { success: true, deletedCount: result.rowCount || 0 };
    } catch (error) {
      console.error(`Error clearing messages for company ${companyId}:`, error);
      return { success: false, deletedCount: 0 };
    }
  }

  async clearCompanyTemplates(companyId: number): Promise<{ success: boolean; deletedCount: number }> {
    try {
      const result = await db
        .delete(followUpTemplates)
        .where(eq(followUpTemplates.companyId, companyId));

      return { success: true, deletedCount: result.rowCount || 0 };
    } catch (error) {
      console.error(`Error clearing templates for company ${companyId}:`, error);
      return { success: false, deletedCount: 0 };
    }
  }

  async clearCompanyCampaigns(companyId: number): Promise<{ success: boolean; deletedCount: number }> {
    try {


      return { success: true, deletedCount: 0 };
    } catch (error) {
      console.error(`Error clearing campaigns for company ${companyId}:`, error);
      return { success: false, deletedCount: 0 };
    }
  }

  async clearCompanyMedia(companyId: number): Promise<{ success: boolean; deletedCount: number }> {
    try {



      return { success: true, deletedCount: 0 };
    } catch (error) {
      console.error(`Error clearing media for company ${companyId}:`, error);
      return { success: false, deletedCount: 0 };
    }
  }

  async clearCompanyAnalytics(companyId: number): Promise<{ success: boolean; deletedCount: number }> {
    try {


      return { success: true, deletedCount: 0 };
    } catch (error) {
      console.error(`Error clearing analytics for company ${companyId}:`, error);
      return { success: false, deletedCount: 0 };
    }
  }


  async getAllCoupons(): Promise<any[]> {
    try {
      const couponList = await db
        .select()
        .from(couponCodes)
        .orderBy(desc(couponCodes.createdAt));

      return couponList;
    } catch (error) {
      console.error('Error getting all coupons:', error);
      throw error;
    }
  }

  async getCouponById(id: number): Promise<any> {
    try {
      const [coupon] = await db
        .select()
        .from(couponCodes)
        .where(eq(couponCodes.id, id))
        .limit(1);

      return coupon || null;
    } catch (error) {
      console.error('Error getting coupon by ID:', error);
      throw error;
    }
  }

  async getCouponByCode(code: string): Promise<any> {
    try {
      const [coupon] = await db
        .select()
        .from(couponCodes)
        .where(eq(couponCodes.code, code.toUpperCase()))
        .limit(1);

      return coupon || null;
    } catch (error) {
      console.error('Error getting coupon by code:', error);
      throw error;
    }
  }

  async createCoupon(couponData: any): Promise<any> {
    try {
      const processedData = {
        ...couponData,
        code: couponData.code.toUpperCase()
      };


      if (processedData.startDate) {
        processedData.startDate = new Date(processedData.startDate);
      }
      if (processedData.endDate) {
        processedData.endDate = new Date(processedData.endDate);
      }

      const [coupon] = await db
        .insert(couponCodes)
        .values(processedData)
        .returning();

      return coupon;
    } catch (error) {
      console.error('Error creating coupon:', error);
      throw error;
    }
  }

  async updateCoupon(id: number, updates: any): Promise<any> {
    try {
      const updateData = { ...updates };
      if (updateData.code) {
        updateData.code = updateData.code.toUpperCase();
      }


      if (updateData.startDate) {
        updateData.startDate = new Date(updateData.startDate);
      }
      if (updateData.endDate) {
        updateData.endDate = new Date(updateData.endDate);
      }

      delete updateData.id; // Remove id from updates

      const [updatedCoupon] = await db
        .update(couponCodes)
        .set({
          ...updateData,
          updatedAt: new Date()
        })
        .where(eq(couponCodes.id, id))
        .returning();

      return updatedCoupon;
    } catch (error) {
      console.error('Error updating coupon:', error);
      throw error;
    }
  }

  async deleteCoupon(id: number): Promise<boolean> {
    try {
      const result = await db
        .delete(couponCodes)
        .where(eq(couponCodes.id, id));

      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error('Error deleting coupon:', error);
      return false;
    }
  }

  async validateCoupon(code: string, planId: number, amount: number, userId?: number): Promise<any> {
    try {

      const coupon = await this.getCouponByCode(code);
      if (!coupon) {
        return { isValid: false, reason: 'Coupon not found' };
      }


      if (!coupon.isActive) {
        return { isValid: false, reason: 'Coupon is not active' };
      }


      const now = new Date();
      const startDate = new Date(coupon.startDate);
      const endDate = coupon.endDate ? new Date(coupon.endDate) : null;

      if (now < startDate) {
        return { isValid: false, reason: 'Coupon is not yet active' };
      }

      if (endDate && now > endDate) {
        return { isValid: false, reason: 'Coupon has expired' };
      }


      if (coupon.usageLimit && coupon.currentUsageCount >= coupon.usageLimit) {
        return { isValid: false, reason: 'Coupon usage limit reached' };
      }


      if (userId && coupon.usageLimitPerUser > 0) {
        const userUsageCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(couponUsage)
          .where(and(
            eq(couponUsage.couponId, coupon.id),
            eq(couponUsage.userId, userId)
          ));

        if (userUsageCount[0]?.count >= coupon.usageLimitPerUser) {
          return { isValid: false, reason: 'You have reached the usage limit for this coupon' };
        }
      }


      if (coupon.applicablePlanIds && coupon.applicablePlanIds.length > 0) {
        if (!coupon.applicablePlanIds.includes(planId)) {
          return { isValid: false, reason: 'Coupon is not applicable to this plan' };
        }
      }


      if (coupon.minimumPlanValue && amount < Number(coupon.minimumPlanValue)) {
        return { isValid: false, reason: `Minimum plan value of $${coupon.minimumPlanValue} required` };
      }


      let discountAmount = 0;
      if (coupon.discountType === 'percentage') {
        discountAmount = (amount * Number(coupon.discountValue)) / 100;
      } else {
        discountAmount = Math.min(Number(coupon.discountValue), amount);
      }

      const finalAmount = Math.max(0, amount - discountAmount);

      return {
        isValid: true,
        coupon,
        discountAmount,
        finalAmount
      };

    } catch (error) {
      console.error('Error validating coupon:', error);
      return { isValid: false, reason: 'Error validating coupon' };
    }
  }

  async getCouponUsageStats(couponId: number): Promise<any> {
    try {
      const usage = await db
        .select({
          totalUsage: sql<number>`count(*)`,
          totalDiscount: sql<number>`sum(${couponUsage.discountAmount})`,
          uniqueUsers: sql<number>`count(distinct ${couponUsage.userId})`
        })
        .from(couponUsage)
        .where(eq(couponUsage.couponId, couponId));

      return usage[0] || { totalUsage: 0, totalDiscount: 0, uniqueUsers: 0 };
    } catch (error) {
      console.error('Error getting coupon usage stats:', error);
      throw error;
    }
  }


  async getContactsForBackup(companyId: number): Promise<any[]> {
    try {
      const contactsData = await db
        .select({
          id: contacts.id,
          name: contacts.name,
          phone: contacts.phone,
          email: contacts.email,
          company: contacts.company,
          tags: contacts.tags,
          identifier: contacts.identifier,
          identifierType: contacts.identifierType,
          source: contacts.source,
          notes: contacts.notes,
          isHistorySync: contacts.isHistorySync,
          historySyncBatchId: contacts.historySyncBatchId,
          createdAt: contacts.createdAt,
          updatedAt: contacts.updatedAt
        })
        .from(contacts)
        .where(eq(contacts.companyId, companyId));


      const contactsWithDetails = await Promise.all(
        contactsData.map(async (contact: Contact) => {

          const contactNotes = await db
            .select({
              id: notes.id,
              content: notes.content,
              createdAt: notes.createdAt,
              userId: notes.userId
            })
            .from(notes)
            .where(eq(notes.contactId, contact.id));


          const channelRelationships = await db
            .select({
              channelId: conversations.channelId,
              channelType: conversations.channelType,
              conversationId: conversations.id,
              conversationCreatedAt: conversations.createdAt,

              connectionAccountId: channelConnections.accountId,
              connectionAccountName: channelConnections.accountName,
              connectionStatus: channelConnections.status
            })
            .from(conversations)
            .leftJoin(channelConnections, eq(conversations.channelId, channelConnections.id))
            .where(eq(conversations.contactId, contact.id))
            .groupBy(
              conversations.channelId,
              conversations.channelType,
              conversations.id,
              conversations.createdAt,
              channelConnections.accountId,
              channelConnections.accountName,
              channelConnections.status
            )
            .orderBy(conversations.createdAt);


          const uniqueChannels = channelRelationships.reduce((acc: Record<string, any>, rel: { channelType: string | null; channelId: number | null; conversationCreatedAt: Date | null }) => {
            const key = `${rel.channelType}-${rel.channelId}`;
            if (!acc[key] || (
              rel.conversationCreatedAt && acc[key].conversationCreatedAt &&
              new Date(rel.conversationCreatedAt) < new Date(acc[key].conversationCreatedAt)
            )) {
              acc[key] = rel;
            }
            return acc;
          }, {} as Record<string, any>);

          return {
            ...contact,
            notes: contactNotes,
            channelRelationships: (Object.values(uniqueChannels) as Array<{ channelId: number | null; channelType: string | null; connectionAccountId: string | null; connectionAccountName: string | null; connectionStatus: string | null; conversationCreatedAt: Date | null }>).map((rel) => ({
              channelId: rel.channelId,
              channelType: rel.channelType,
              connectionAccountId: rel.connectionAccountId,
              connectionAccountName: rel.connectionAccountName,
              connectionStatus: rel.connectionStatus,
              firstConversationAt: rel.conversationCreatedAt
            }))
          };
        })
      );

      return contactsWithDetails;
    } catch (error) {
      console.error('Error getting contacts for backup:', error);
      throw error;
    }
  }

  async getConversationsForBackup(
    companyId: number,
    dateRangeStart?: Date,
    dateRangeEnd?: Date
  ): Promise<any[]> {
    try {
      let baseQuery = db
        .select({
          id: conversations.id,
          contactId: conversations.contactId,
          channelId: conversations.channelId,
          channelType: conversations.channelType,
          status: conversations.status,
          assignedToUserId: conversations.assignedToUserId,
          lastMessageAt: conversations.lastMessageAt,
          groupMetadata: conversations.groupMetadata,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt
        })
        .from(conversations);

      let whereConditions = [eq(conversations.companyId, companyId)];

      if (dateRangeStart) {
        whereConditions.push(gte(conversations.createdAt, dateRangeStart));
      }

      if (dateRangeEnd) {
        whereConditions.push(lte(conversations.createdAt, dateRangeEnd));
      }

      const conversationsData = await baseQuery.where(and(...whereConditions));

      return conversationsData;
    } catch (error) {
      console.error('Error getting conversations for backup:', error);
      throw error;
    }
  }

  async getMessagesForBackup(
    companyId: number,
    dateRangeStart?: Date,
    dateRangeEnd?: Date
  ): Promise<any[]> {
    try {
      let baseQuery = db
        .select({
          id: messages.id,
          conversationId: messages.conversationId,
          content: messages.content,
          type: messages.type,
          direction: messages.direction,
          status: messages.status,
          externalId: messages.externalId,
          metadata: messages.metadata,
          createdAt: messages.createdAt
        })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id));

      let whereConditions = [eq(conversations.companyId, companyId)];

      if (dateRangeStart) {
        whereConditions.push(gte(messages.createdAt, dateRangeStart));
      }

      if (dateRangeEnd) {
        whereConditions.push(lte(messages.createdAt, dateRangeEnd));
      }

      const messagesData = await baseQuery.where(and(...whereConditions));


      return messagesData.filter((message: Message) =>
        !message.type ||
        ['text', 'template', 'interactive', 'list', 'button'].includes(message.type)
      );
    } catch (error) {
      console.error('Error getting messages for backup:', error);
      throw error;
    }
  }


  async setFlowVariable(data: {
    sessionId: string;
    variableKey: string;
    variableValue: any;
    variableType?: 'string' | 'number' | 'boolean' | 'object' | 'array';
    scope?: 'global' | 'flow' | 'node' | 'user' | 'session';
    nodeId?: string;
    expiresAt?: Date;
  }): Promise<void> {
    try {
      await db.insert(flowSessionVariables).values({
        sessionId: data.sessionId,
        variableKey: data.variableKey,
        variableValue: data.variableValue,
        variableType: data.variableType || 'string',
        scope: data.scope || 'session',
        nodeId: data.nodeId,
        expiresAt: data.expiresAt,
        createdAt: new Date(),
        updatedAt: new Date()
      }).onConflictDoUpdate({
        target: [flowSessionVariables.sessionId, flowSessionVariables.variableKey],
        set: {
          variableValue: data.variableValue,
          variableType: data.variableType || 'string',
          scope: data.scope || 'session',
          nodeId: data.nodeId,
          expiresAt: data.expiresAt,
          updatedAt: new Date()
        }
      });
    } catch (error) {
      console.error('Error setting flow variable:', error);
      throw error;
    }
  }

  async getFlowVariable(sessionId: string, variableKey: string): Promise<any> {
    try {
      const [variable] = await db
        .select()
        .from(flowSessionVariables)
        .where(
          and(
            eq(flowSessionVariables.sessionId, sessionId),
            eq(flowSessionVariables.variableKey, variableKey)
          )
        );

      if (!variable) {
        return undefined;
      }


      if (variable.expiresAt && new Date() > variable.expiresAt) {
        await this.deleteFlowVariable(sessionId, variableKey);
        return undefined;
      }

      return variable.variableValue;
    } catch (error) {
      console.error('Error getting flow variable:', error);
      return undefined;
    }
  }

  async getFlowVariables(sessionId: string, scope?: string): Promise<Record<string, any>> {
    try {
      const conditions = [eq(flowSessionVariables.sessionId, sessionId)];

      if (scope && ['global', 'flow', 'node', 'user', 'session'].includes(scope)) {
        conditions.push(eq(flowSessionVariables.scope, scope as 'global' | 'flow' | 'node' | 'user' | 'session'));
      }

      const variables = await db
        .select()
        .from(flowSessionVariables)
        .where(and(...conditions));

      const result: Record<string, any> = {};
      const now = new Date();

      for (const variable of variables) {

        if (variable.expiresAt && now > variable.expiresAt) {
          await this.deleteFlowVariable(sessionId, variable.variableKey);
          continue;
        }

        result[variable.variableKey] = variable.variableValue;
      }

      return result;
    } catch (error) {
      console.error('Error getting flow variables:', error);
      return {};
    }
  }

  async deleteFlowVariable(sessionId: string, variableKey: string): Promise<void> {
    try {
      await db
        .delete(flowSessionVariables)
        .where(
          and(
            eq(flowSessionVariables.sessionId, sessionId),
            eq(flowSessionVariables.variableKey, variableKey)
          )
        );
    } catch (error) {
      console.error('Error deleting flow variable:', error);
      throw error;
    }
  }

  async clearFlowVariables(sessionId: string, scope?: string): Promise<void> {
    try {
      const conditions = [eq(flowSessionVariables.sessionId, sessionId)];

      if (scope && ['global', 'flow', 'node', 'user', 'session'].includes(scope)) {
        conditions.push(eq(flowSessionVariables.scope, scope as 'global' | 'flow' | 'node' | 'user' | 'session'));
      }

      await db
        .delete(flowSessionVariables)
        .where(and(...conditions));
    } catch (error) {
      console.error('Error clearing flow variables:', error);
      throw error;
    }
  }

  async getFlowVariablesByScope(sessionId: string, scope: 'global' | 'flow' | 'node' | 'user' | 'session'): Promise<Array<{
    variableKey: string;
    variableValue: any;
    variableType: string;
    nodeId?: string;
    createdAt: Date;
    updatedAt: Date;
  }>> {
    try {
      const variables = await db
        .select({
          variableKey: flowSessionVariables.variableKey,
          variableValue: flowSessionVariables.variableValue,
          variableType: flowSessionVariables.variableType,
          nodeId: flowSessionVariables.nodeId,
          createdAt: flowSessionVariables.createdAt,
          updatedAt: flowSessionVariables.updatedAt
        })
        .from(flowSessionVariables)
        .where(
          and(
            eq(flowSessionVariables.sessionId, sessionId),
            eq(flowSessionVariables.scope, scope)
          )
        )
        .orderBy(flowSessionVariables.createdAt);


      return variables.map((variable: any) => ({
        ...variable,
        nodeId: variable.nodeId || undefined
      }));
    } catch (error) {
      console.error('Error getting flow variables by scope:', error);
      return [];
    }
  }

  async getRecentFlowSessions(flowId: number, limit: number = 50, offset: number = 0): Promise<Array<{
    sessionId: string;
    status: string;
    startedAt: Date;
    lastActivityAt: Date;
    completedAt?: Date;
    contactName?: string;
    contactPhone?: string;
    conversationId: number;
    variableCount: number;
  }>> {
    try {

      const sessions = await db
        .select({
          sessionId: flowSessions.sessionId,
          status: flowSessions.status,
          startedAt: flowSessions.startedAt,
          lastActivityAt: flowSessions.lastActivityAt,
          completedAt: flowSessions.completedAt,
          conversationId: flowSessions.conversationId,
          contactName: contacts.name,
          contactPhone: contacts.phone,
          variableCount: sql<number>`COALESCE(var_counts.count, 0)`
        })
        .from(flowSessions)
        .leftJoin(contacts, eq(flowSessions.contactId, contacts.id))
        .leftJoin(
          sql`(
            SELECT session_id, COUNT(*) as count
            FROM flow_session_variables
            GROUP BY session_id
          ) var_counts`,
          sql`var_counts.session_id = ${flowSessions.sessionId}`
        )
        .where(eq(flowSessions.flowId, flowId))
        .orderBy(desc(flowSessions.lastActivityAt))
        .limit(limit)
        .offset(offset);

      return sessions.map((session: any) => ({
        sessionId: session.sessionId,
        status: session.status,
        startedAt: session.startedAt,
        lastActivityAt: session.lastActivityAt,
        completedAt: session.completedAt || undefined,
        contactName: session.contactName || undefined,
        contactPhone: session.contactPhone || undefined,
        conversationId: session.conversationId,
        variableCount: session.variableCount
      }));
    } catch (error) {
      console.error('Error getting recent flow sessions:', error);
      return [];
    }
  }

  async getFlowVariablesPaginated(sessionId: string, options: {
    scope?: 'global' | 'flow' | 'node' | 'user' | 'session';
    limit: number;
    offset: number;
  }): Promise<{
    variables: Array<{
      variableKey: string;
      variableValue: any;
      variableType: string;
      nodeId?: string;
      createdAt: Date;
      updatedAt: Date;
    }>;
    totalCount: number;
  }> {
    try {
      const { scope = 'session', limit, offset } = options;


      const conditions = [eq(flowSessionVariables.sessionId, sessionId)];
      if (scope) {
        conditions.push(eq(flowSessionVariables.scope, scope));
      }


      const [countResult] = await db
        .select({ count: count() })
        .from(flowSessionVariables)
        .where(and(...conditions));

      const totalCount = countResult?.count || 0;


      const variables = await db
        .select({
          variableKey: flowSessionVariables.variableKey,
          variableValue: flowSessionVariables.variableValue,
          variableType: flowSessionVariables.variableType,
          nodeId: flowSessionVariables.nodeId,
          createdAt: flowSessionVariables.createdAt,
          updatedAt: flowSessionVariables.updatedAt
        })
        .from(flowSessionVariables)
        .where(and(...conditions))
        .orderBy(flowSessionVariables.createdAt)
        .limit(limit)
        .offset(offset);

      return {
        variables: variables.map((variable: any) => ({
          ...variable,
          nodeId: variable.nodeId || undefined
        })),
        totalCount
      };
    } catch (error) {
      console.error('Error getting paginated flow variables:', error);
      return {
        variables: [],
        totalCount: 0
      };
    }
  }

  async deleteAllFlowSessions(flowId: number): Promise<number> {
    try {

      const sessions = await db
        .select({ sessionId: flowSessions.sessionId })
        .from(flowSessions)
        .where(eq(flowSessions.flowId, flowId));

      if (sessions.length === 0) {
        return 0;
      }

      const sessionIds = sessions.map((s: any) => s.sessionId);


      await db
        .delete(flowSessionVariables)
        .where(inArray(flowSessionVariables.sessionId, sessionIds));


      const result = await db
        .delete(flowSessions)
        .where(eq(flowSessions.flowId, flowId));

      return sessions.length;
    } catch (error) {
      console.error('Error deleting all flow sessions:', error);
      throw error;
    }
  }


  async getContactDocuments(contactId: number): Promise<ContactDocument[]> {
    try {
      return await db
        .select()
        .from(contactDocuments)
        .where(eq(contactDocuments.contactId, contactId))
        .orderBy(desc(contactDocuments.createdAt));
    } catch (error) {
      console.error('Error getting contact documents:', error);
      throw error;
    }
  }

  async getContactDocument(documentId: number): Promise<ContactDocument | undefined> {
    try {
      const [document] = await db
        .select()
        .from(contactDocuments)
        .where(eq(contactDocuments.id, documentId));
      return document;
    } catch (error) {
      console.error('Error getting contact document:', error);
      throw error;
    }
  }

  async createContactDocument(document: InsertContactDocument): Promise<ContactDocument> {
    try {
      const [newDocument] = await db
        .insert(contactDocuments)
        .values(document)
        .returning();
      return newDocument;
    } catch (error) {
      console.error('Error creating contact document:', error);
      throw error;
    }
  }

  async deleteContactDocument(documentId: number): Promise<void> {
    try {
      await db
        .delete(contactDocuments)
        .where(eq(contactDocuments.id, documentId));
    } catch (error) {
      console.error('Error deleting contact document:', error);
      throw error;
    }
  }


  async getContactAppointments(contactId: number): Promise<ContactAppointment[]> {
    try {
      return await db
        .select()
        .from(contactAppointments)
        .where(eq(contactAppointments.contactId, contactId))
        .orderBy(desc(contactAppointments.scheduledAt));
    } catch (error) {
      console.error('Error getting contact appointments:', error);
      throw error;
    }
  }

  async getContactAppointment(appointmentId: number): Promise<ContactAppointment | undefined> {
    try {
      const [appointment] = await db
        .select()
        .from(contactAppointments)
        .where(eq(contactAppointments.id, appointmentId));
      return appointment;
    } catch (error) {
      console.error('Error getting contact appointment:', error);
      throw error;
    }
  }

  async createContactAppointment(appointment: InsertContactAppointment): Promise<ContactAppointment> {
    try {
      const [newAppointment] = await db
        .insert(contactAppointments)
        .values(appointment)
        .returning();
      return newAppointment;
    } catch (error) {
      console.error('Error creating contact appointment:', error);
      throw error;
    }
  }

  async updateContactAppointment(appointmentId: number, appointment: Partial<InsertContactAppointment>): Promise<ContactAppointment> {
    try {
      const [updatedAppointment] = await db
        .update(contactAppointments)
        .set({ ...appointment, updatedAt: new Date() })
        .where(eq(contactAppointments.id, appointmentId))
        .returning();
      return updatedAppointment;
    } catch (error) {
      console.error('Error updating contact appointment:', error);
      throw error;
    }
  }

  async deleteContactAppointment(appointmentId: number): Promise<void> {
    try {
      await db
        .delete(contactAppointments)
        .where(eq(contactAppointments.id, appointmentId));
    } catch (error) {
      console.error('Error deleting contact appointment:', error);
      throw error;
    }
  }


  async getContactTasks(contactId: number, companyId: number, options?: { status?: string; priority?: string; search?: string }): Promise<ContactTask[]> {
    try {
      let whereConditions = [
        eq(contactTasks.contactId, contactId),
        eq(contactTasks.companyId, companyId)
      ];

      if (options?.status && options.status !== 'all') {
        whereConditions.push(eq(contactTasks.status, options.status as any));
      }

      if (options?.priority && options.priority !== 'all') {
        whereConditions.push(eq(contactTasks.priority, options.priority as any));
      }

      let query = db
        .select()
        .from(contactTasks)
        .where(and(...whereConditions))
        .orderBy(desc(contactTasks.createdAt));

      const tasks = await query;


      if (options?.search) {
        const searchTerm = options.search.toLowerCase();
        return tasks.filter((task: ContactTask) =>
          task.title.toLowerCase().includes(searchTerm) ||
          (task.description && task.description.toLowerCase().includes(searchTerm))
        );
      }

      return tasks;
    } catch (error) {
      console.error('Error fetching contact tasks:', error);
      throw error;
    }
  }

  async getContactTask(taskId: number, companyId: number): Promise<ContactTask | undefined> {
    try {
      const [task] = await db
        .select()
        .from(contactTasks)
        .where(and(
          eq(contactTasks.id, taskId),
          eq(contactTasks.companyId, companyId)
        ));

      return task;
    } catch (error) {
      console.error('Error fetching contact task:', error);
      throw error;
    }
  }

  async createContactTask(task: InsertContactTask): Promise<ContactTask> {
    try {
      const [newTask] = await db
        .insert(contactTasks)
        .values({
          ...task,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      return newTask;
    } catch (error) {
      console.error('Error creating contact task:', error);
      throw error;
    }
  }

  async updateContactTask(taskId: number, companyId: number, updates: Partial<InsertContactTask>): Promise<ContactTask> {
    try {
      const updateData: any = {};


      for (const [key, value] of Object.entries(updates)) {
        if (key !== 'updatedAt' && key !== 'createdAt' && key !== 'dueDate' && key !== 'completedAt') {
          updateData[key] = value;
        }
      }


      if (updates.dueDate !== undefined) {
        if (typeof updates.dueDate === 'string') {
          updateData.dueDate = new Date(updates.dueDate);
        } else if (updates.dueDate instanceof Date) {
          updateData.dueDate = updates.dueDate;
        } else if (updates.dueDate === null) {
          updateData.dueDate = null;
        }
      }


      if (updates.status === 'completed' && !updates.completedAt) {
        updateData.completedAt = new Date();
      } else if (updates.status !== 'completed') {
        updateData.completedAt = null;
      } else if (updates.completedAt !== undefined) {
        if (typeof updates.completedAt === 'string') {
          updateData.completedAt = new Date(updates.completedAt);
        } else if (updates.completedAt instanceof Date) {
          updateData.completedAt = updates.completedAt;
        } else if (updates.completedAt === null) {
          updateData.completedAt = null;
        }
      }


      updateData.updatedAt = new Date();

      const [updatedTask] = await db
        .update(contactTasks)
        .set(updateData)
        .where(and(
          eq(contactTasks.id, taskId),
          eq(contactTasks.companyId, companyId)
        ))
        .returning();

      if (!updatedTask) {
        throw new Error('Task not found or access denied');
      }

      return updatedTask;
    } catch (error) {
      console.error('Error updating contact task:', error);
      throw error;
    }
  }

  async deleteContactTask(taskId: number, companyId: number): Promise<void> {
    try {
      const result = await db
        .delete(contactTasks)
        .where(and(
          eq(contactTasks.id, taskId),
          eq(contactTasks.companyId, companyId)
        ));

      if (result.rowCount === 0) {
        throw new Error('Task not found or access denied');
      }
    } catch (error) {
      console.error('Error deleting contact task:', error);
      throw error;
    }
  }

  async bulkUpdateContactTasks(taskIds: number[], companyId: number, updates: Partial<InsertContactTask>): Promise<ContactTask[]> {
    try {
      const updateData: any = {};


      for (const [key, value] of Object.entries(updates)) {
        if (key !== 'updatedAt' && key !== 'createdAt' && key !== 'dueDate' && key !== 'completedAt') {
          updateData[key] = value;
        }
      }


      if (updates.dueDate !== undefined) {
        if (typeof updates.dueDate === 'string') {
          updateData.dueDate = new Date(updates.dueDate);
        } else if (updates.dueDate instanceof Date) {
          updateData.dueDate = updates.dueDate;
        } else if (updates.dueDate === null) {
          updateData.dueDate = null;
        }
      }


      if (updates.status === 'completed' && !updates.completedAt) {
        updateData.completedAt = new Date();
      } else if (updates.status !== 'completed') {
        updateData.completedAt = null;
      } else if (updates.completedAt !== undefined) {
        if (typeof updates.completedAt === 'string') {
          updateData.completedAt = new Date(updates.completedAt);
        } else if (updates.completedAt instanceof Date) {
          updateData.completedAt = updates.completedAt;
        } else if (updates.completedAt === null) {
          updateData.completedAt = null;
        }
      }


      updateData.updatedAt = new Date();

      const updatedTasks = await db
        .update(contactTasks)
        .set(updateData)
        .where(and(
          inArray(contactTasks.id, taskIds),
          eq(contactTasks.companyId, companyId)
        ))
        .returning();

      if (updatedTasks.length === 0) {
        throw new Error(`No tasks were updated. Please verify task IDs and permissions.`);
      }

      return updatedTasks;
    } catch (error) {
      console.error('Error bulk updating contact tasks:', error);
      throw error;
    }
  }


  async getCompanyTasks(companyId: number, options?: {
    status?: string;
    priority?: string;
    assignedTo?: string;
    contactId?: number;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ tasks: ContactTask[]; total: number }> {
    try {
      const page = options?.page || 1;
      const limit = options?.limit || 50;
      const offset = (page - 1) * limit;

      let whereConditions = [
        eq(contactTasks.companyId, companyId)
      ];

      if (options?.status && options.status !== 'all') {
        whereConditions.push(eq(contactTasks.status, options.status as any));
      }

      if (options?.priority && options.priority !== 'all') {
        whereConditions.push(eq(contactTasks.priority, options.priority as any));
      }

      if (options?.assignedTo) {
        whereConditions.push(eq(contactTasks.assignedTo, options.assignedTo));
      }

      if (options?.contactId) {
        whereConditions.push(eq(contactTasks.contactId, options.contactId));
      }


      let allTasks = await db
        .select()
        .from(contactTasks)
        .where(and(...whereConditions))
        .orderBy(desc(contactTasks.createdAt));


      if (options?.search) {
        const searchTerm = options.search.toLowerCase();


        const allContacts = await db
          .select()
          .from(contacts)
          .where(eq(contacts.companyId, companyId));

        const contactMap = new Map<number, Contact>(allContacts.map((contact: Contact) => [contact.id, contact]));

        allTasks = allTasks.filter((task: ContactTask) => {
          const contact = contactMap.get(task.contactId);
          const contactName = contact?.name || '';

          return task.title.toLowerCase().includes(searchTerm) ||
            (task.description && task.description.toLowerCase().includes(searchTerm)) ||
            (task.category && task.category.toLowerCase().includes(searchTerm)) ||
            contactName.toLowerCase().includes(searchTerm);
        });
      }


      const total = allTasks.length;


      const tasks = allTasks.slice(offset, offset + limit);

      return { tasks, total };
    } catch (error) {
      console.error('Error fetching company tasks:', error);
      throw error;
    }
  }

  async getTask(taskId: number, companyId: number): Promise<ContactTask | undefined> {
    try {
      const [task] = await db
        .select()
        .from(contactTasks)
        .where(and(
          eq(contactTasks.id, taskId),
          eq(contactTasks.companyId, companyId)
        ));

      return task;
    } catch (error) {
      console.error('Error fetching task:', error);
      throw error;
    }
  }

  async createTask(task: InsertContactTask): Promise<ContactTask> {
    try {
      const taskData: any = { ...task };


      if (taskData.dueDate && typeof taskData.dueDate === 'string') {
        taskData.dueDate = new Date(taskData.dueDate);
      }

      const [newTask] = await db
        .insert(contactTasks)
        .values({
          ...taskData,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      return newTask;
    } catch (error) {
      console.error('Error creating task:', error);
      throw error;
    }
  }

  async updateTask(taskId: number, companyId: number, updates: Partial<InsertContactTask>): Promise<ContactTask> {
    try {
      const updateData: any = {};


      for (const [key, value] of Object.entries(updates)) {
        if (key !== 'updatedAt' && key !== 'createdAt' && key !== 'dueDate' && key !== 'completedAt') {
          updateData[key] = value;
        }
      }


      if (updates.dueDate !== undefined) {
        if (typeof updates.dueDate === 'string') {
          updateData.dueDate = new Date(updates.dueDate);
        } else if (updates.dueDate instanceof Date) {
          updateData.dueDate = updates.dueDate;
        } else if (updates.dueDate === null) {
          updateData.dueDate = null;
        }
      }


      if (updates.status === 'completed' && !updates.completedAt) {
        updateData.completedAt = new Date();
      } else if (updates.status !== 'completed') {
        updateData.completedAt = null;
      } else if (updates.completedAt !== undefined) {
        if (typeof updates.completedAt === 'string') {
          updateData.completedAt = new Date(updates.completedAt);
        } else if (updates.completedAt instanceof Date) {
          updateData.completedAt = updates.completedAt;
        } else if (updates.completedAt === null) {
          updateData.completedAt = null;
        }
      }


      updateData.updatedAt = new Date();

      const [updatedTask] = await db
        .update(contactTasks)
        .set(updateData)
        .where(and(
          eq(contactTasks.id, taskId),
          eq(contactTasks.companyId, companyId)
        ))
        .returning();

      if (!updatedTask) {
        throw new Error('Task not found or access denied');
      }

      return updatedTask;
    } catch (error) {
      console.error('Error updating task:', error);
      throw error;
    }
  }

  async deleteTask(taskId: number, companyId: number): Promise<void> {
    try {
      const result = await db
        .delete(contactTasks)
        .where(and(
          eq(contactTasks.id, taskId),
          eq(contactTasks.companyId, companyId)
        ));

      if (result.rowCount === 0) {
        throw new Error('Task not found or access denied');
      }
    } catch (error) {
      console.error('Error deleting task:', error);
      throw error;
    }
  }

  async bulkUpdateTasks(taskIds: number[], companyId: number, updates: Partial<InsertContactTask>): Promise<ContactTask[]> {
    try {
      const updateData: any = {};


      for (const [key, value] of Object.entries(updates)) {
        if (key !== 'updatedAt' && key !== 'createdAt' && key !== 'dueDate' && key !== 'completedAt') {
          updateData[key] = value;
        }
      }


      if (updates.dueDate !== undefined) {
        if (typeof updates.dueDate === 'string') {
          updateData.dueDate = new Date(updates.dueDate);
        } else if (updates.dueDate instanceof Date) {
          updateData.dueDate = updates.dueDate;
        } else if (updates.dueDate === null) {
          updateData.dueDate = null;
        }
      }


      if (updates.status === 'completed' && !updates.completedAt) {
        updateData.completedAt = new Date();
      } else if (updates.status !== 'completed') {
        updateData.completedAt = null;
      } else if (updates.completedAt !== undefined) {
        if (typeof updates.completedAt === 'string') {
          updateData.completedAt = new Date(updates.completedAt);
        } else if (updates.completedAt instanceof Date) {
          updateData.completedAt = updates.completedAt;
        } else if (updates.completedAt === null) {
          updateData.completedAt = null;
        }
      }


      updateData.updatedAt = new Date();

      const updatedTasks = await db
        .update(contactTasks)
        .set(updateData)
        .where(and(
          inArray(contactTasks.id, taskIds),
          eq(contactTasks.companyId, companyId)
        ))
        .returning();

      if (updatedTasks.length === 0) {
        throw new Error(`No tasks were updated. Please verify task IDs and permissions.`);
      }

      return updatedTasks;
    } catch (error) {
      console.error('Error bulk updating tasks:', error);
      throw error;
    }
  }


  async getTaskCategories(companyId: number): Promise<TaskCategory[]> {
    try {
      return await db
        .select()
        .from(taskCategories)
        .where(eq(taskCategories.companyId, companyId))
        .orderBy(taskCategories.name);
    } catch (error) {
      console.error('Error getting task categories:', error);
      return [];
    }
  }

  async createTaskCategory(data: InsertTaskCategory): Promise<TaskCategory> {
    try {
      const [category] = await db
        .insert(taskCategories)
        .values(data)
        .returning();
      return category;
    } catch (error) {
      console.error('Error creating task category:', error);
      throw error;
    }
  }

  async updateTaskCategory(id: number, companyId: number, data: Partial<InsertTaskCategory>): Promise<TaskCategory> {
    try {
      const updateData: any = { ...data };
      delete updateData.updatedAt; // Remove updatedAt from data if it exists
      updateData.updatedAt = new Date();

      const [category] = await db
        .update(taskCategories)
        .set(updateData)
        .where(and(
          eq(taskCategories.id, id),
          eq(taskCategories.companyId, companyId)
        ))
        .returning();

      if (!category) {
        throw new Error('Task category not found');
      }

      return category;
    } catch (error) {
      console.error('Error updating task category:', error);
      throw error;
    }
  }

  async deleteTaskCategory(id: number, companyId: number): Promise<void> {
    try {
      await db
        .delete(taskCategories)
        .where(and(
          eq(taskCategories.id, id),
          eq(taskCategories.companyId, companyId)
        ));
    } catch (error) {
      console.error('Error deleting task category:', error);
      throw error;
    }
  }

  async getContactActivity(contactId: number, options?: { type?: string; limit?: number }): Promise<any[]> {
    try {
      const limit = options?.limit || 50;
      const activities: any[] = [];


      const contactConversations = await db
        .select()
        .from(conversations)
        .where(eq(conversations.contactId, contactId))
        .orderBy(desc(conversations.lastMessageAt));


      for (const conversation of contactConversations.slice(0, 5)) { // Limit to 5 most recent conversations
        const recentMessages = await db
          .select({
            id: messages.id,
            content: messages.content,
            messageType: messages.type,
            direction: messages.direction,
            timestamp: messages.sentAt,
            conversationId: messages.conversationId
          })
          .from(messages)
          .where(eq(messages.conversationId, conversation.id))
          .orderBy(desc(messages.sentAt))
          .limit(10);


        recentMessages.forEach((message: Message) => {
          if (!options?.type || options.type === 'all' || options.type === 'messages') {
            activities.push({
              id: `message-${message.id}`,
              type: 'message',
              subtype: conversation.channelType,
              title: `${message.direction === 'outbound' ? 'Sent' : 'Received'} ${conversation.channelType} Message`,
              description: message.content?.substring(0, 100) + (message.content && message.content.length > 100 ? '...' : ''),
              timestamp: message.sentAt || message.createdAt || new Date(),
              status: message.direction === 'outbound' ? 'sent' : 'received',
              metadata: {
                messageType: message.type,
                direction: message.direction,
                conversationId: message.conversationId
              }
            });
          }
        });
      }


      const appointments = await db
        .select()
        .from(contactAppointments)
        .where(eq(contactAppointments.contactId, contactId))
        .orderBy(desc(contactAppointments.scheduledAt))
        .limit(20);

      appointments.forEach((appointment: ContactAppointment) => {
        if (!options?.type || options.type === 'all' || options.type === 'meetings') {
          const isPast = new Date(appointment.scheduledAt) < new Date();
          activities.push({
            id: `appointment-${appointment.id}`,
            type: 'appointment',
            subtype: appointment.type,
            title: appointment.title,
            description: appointment.description,
            timestamp: appointment.scheduledAt,
            status: isPast ? 'completed' : appointment.status,
            metadata: {
              location: appointment.location,
              duration: appointment.durationMinutes,
              appointmentType: appointment.type
            }
          });
        }
      });


      const documents = await db
        .select()
        .from(contactDocuments)
        .where(eq(contactDocuments.contactId, contactId))
        .orderBy(desc(contactDocuments.createdAt))
        .limit(20);

      documents.forEach((document: ContactDocument) => {
        if (!options?.type || options.type === 'all' || options.type === 'documents') {
          activities.push({
            id: `document-${document.id}`,
            type: 'document',
            subtype: document.category,
            title: `Document Uploaded: ${document.originalName}`,
            description: document.description || `${document.category} document`,
            timestamp: document.createdAt,
            status: 'completed',
            metadata: {
              filename: document.originalName,
              category: document.category,
              fileSize: document.fileSize
            }
          });
        }
      });


      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());


      return activities.slice(0, limit);
    } catch (error) {
      console.error('Error getting contact activity:', error);
      throw error;
    }
  }


  async createContactAuditLog(auditLog: InsertContactAuditLog): Promise<ContactAuditLog> {
    try {
      const [result] = await db.insert(contactAuditLogs).values(auditLog).returning();
      return result;
    } catch (error) {
      console.error('Error creating contact audit log:', error);
      throw error;
    }
  }

  async getContactAuditLogs(
    contactId: number,
    options?: { page?: number; limit?: number; actionType?: string }
  ): Promise<{ logs: ContactAuditLog[]; total: number }> {
    try {
      const page = options?.page || 1;
      const limit = options?.limit || 50;
      const offset = (page - 1) * limit;

      let whereConditions = [eq(contactAuditLogs.contactId, contactId)];

      if (options?.actionType && options.actionType !== 'all') {
        whereConditions.push(eq(contactAuditLogs.actionType, options.actionType));
      }


      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(contactAuditLogs)
        .where(and(...whereConditions));


      const logs = await db
        .select({
          id: contactAuditLogs.id,
          companyId: contactAuditLogs.companyId,
          contactId: contactAuditLogs.contactId,
          userId: contactAuditLogs.userId,
          actionType: contactAuditLogs.actionType,
          actionCategory: contactAuditLogs.actionCategory,
          description: contactAuditLogs.description,
          oldValues: contactAuditLogs.oldValues,
          newValues: contactAuditLogs.newValues,
          metadata: contactAuditLogs.metadata,
          ipAddress: contactAuditLogs.ipAddress,
          userAgent: contactAuditLogs.userAgent,
          createdAt: contactAuditLogs.createdAt,

          userFullName: users.fullName,
          userEmail: users.email,
          userAvatarUrl: users.avatarUrl,
          userRole: users.role
        })
        .from(contactAuditLogs)
        .leftJoin(users, eq(contactAuditLogs.userId, users.id))
        .where(and(...whereConditions))
        .orderBy(desc(contactAuditLogs.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        logs: logs as any[],
        total: count
      };
    } catch (error) {
      console.error('Error getting contact audit logs:', error);
      throw error;
    }
  }

  async getCompanyDeletionAuditLogs(
    companyId: number,
    options?: { page?: number; limit?: number }
  ): Promise<{ logs: ContactAuditLog[]; total: number }> {
    try {
      const page = options?.page || 1;
      const limit = options?.limit || 50;
      const offset = (page - 1) * limit;
      const whereConditions = [
        eq(contactAuditLogs.companyId, companyId),
        eq(contactAuditLogs.actionType, 'tiktok_user_deletion')
      ];
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(contactAuditLogs)
        .where(and(...whereConditions));
      const logs = await db
        .select()
        .from(contactAuditLogs)
        .where(and(...whereConditions))
        .orderBy(desc(contactAuditLogs.createdAt))
        .limit(limit)
        .offset(offset);
      return { logs, total: count };
    } catch (error) {
      console.error('Error getting company deletion audit logs:', error);
      throw error;
    }
  }

  async logContactActivity(params: {
    companyId: number;
    contactId: number;
    userId?: number;
    actionType: string;
    actionCategory?: string;
    description: string;
    oldValues?: any;
    newValues?: any;
    metadata?: any;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await this.createContactAuditLog({
        companyId: params.companyId,
        contactId: params.contactId,
        userId: params.userId || null,
        actionType: params.actionType,
        actionCategory: params.actionCategory || 'contact',
        description: params.description,
        oldValues: params.oldValues || null,
        newValues: params.newValues || null,
        metadata: params.metadata || null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null
      });
    } catch (error) {
      console.error('Error logging contact activity:', error);
      throw error;
    }
  }


  async archiveContact(contactId: number): Promise<Contact> {
    try {
      const [contact] = await db
        .update(contacts)
        .set({
          isArchived: true,
          updatedAt: new Date()
        })
        .where(eq(contacts.id, contactId))
        .returning();

      if (!contact) {
        throw new Error('Contact not found');
      }

      return contact;
    } catch (error) {
      console.error('Error archiving contact:', error);
      throw error;
    }
  }

  async unarchiveContact(contactId: number): Promise<Contact> {
    try {
      const [contact] = await db
        .update(contacts)
        .set({
          isArchived: false,
          updatedAt: new Date()
        })
        .where(eq(contacts.id, contactId))
        .returning();

      if (!contact) {
        throw new Error('Contact not found');
      }

      return contact;
    } catch (error) {
      console.error('Error unarchiving contact:', error);
      throw error;
    }
  }

  async getCompanyCustomFields(companyId: number, entity: 'deal' | 'contact' | 'company'): Promise<any[]> {
    try {
      return await db
        .select()
        .from(companyCustomFields)
        .where(
          and(
            eq(companyCustomFields.companyId, companyId),
            eq(companyCustomFields.entity, entity)
          )
        )
        .orderBy(companyCustomFields.displayOrder, companyCustomFields.fieldName);
    } catch (error) {
      console.error(`Error getting custom fields for company ${companyId}, entity ${entity}:`, error);
      return [];
    }
  }

  async createCompanyCustomField(data: {
    companyId: number;
    entity: 'deal' | 'contact' | 'company';
    fieldName: string;
    fieldType: 'text' | 'number' | 'select' | 'multi_select' | 'date' | 'boolean';
    fieldLabel: string;
    options?: any;
    required?: boolean;
    displayOrder?: number;
  }): Promise<any> {
    try {
      const [result] = await db
        .insert(companyCustomFields)
        .values({
          companyId: data.companyId,
          entity: data.entity,
          fieldName: data.fieldName,
          fieldType: data.fieldType,
          fieldLabel: data.fieldLabel,
          options: data.options || null,
          required: data.required || false,
          displayOrder: data.displayOrder || 0,
        })
        .returning();
      return result;
    } catch (error) {
      console.error('Error creating custom field:', error);
      throw error;
    }
  }

  async updateCompanyCustomField(id: number, updates: Partial<{
    fieldLabel: string;
    fieldType: 'text' | 'number' | 'select' | 'multi_select' | 'date' | 'boolean';
    options?: any;
    required?: boolean;
    displayOrder?: number;
  }>): Promise<any> {
    try {
      const [result] = await db
        .update(companyCustomFields)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(companyCustomFields.id, id))
        .returning();
      return result;
    } catch (error) {
      console.error(`Error updating custom field ${id}:`, error);
      throw error;
    }
  }

  async deleteCompanyCustomField(id: number): Promise<boolean> {
    try {
      await db
        .delete(companyCustomFields)
        .where(eq(companyCustomFields.id, id));
      return true;
    } catch (error) {
      console.error(`Error deleting custom field ${id}:`, error);
      return false;
    }
  }
}

export const storage = new DatabaseStorage();


export async function logContactAudit(params: {
  companyId: number;
  contactId: number;
  userId?: number;
  actionType: string;
  actionCategory?: string;
  description: string;
  oldValues?: any;
  newValues?: any;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
}) {
  try {
    await storage.createContactAuditLog({
      companyId: params.companyId,
      contactId: params.contactId,
      userId: params.userId || null,
      actionType: params.actionType,
      actionCategory: params.actionCategory || 'contact',
      description: params.description,
      oldValues: params.oldValues || null,
      newValues: params.newValues || null,
      metadata: params.metadata || null,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null
    });
  } catch (error) {
    console.error('Error logging contact audit:', error);

  }
}

