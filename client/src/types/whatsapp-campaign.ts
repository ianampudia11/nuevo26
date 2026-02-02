/**
 * WhatsApp Campaign Types
 * Shared TypeScript interfaces for WhatsApp-specific campaign functionality
 */

import { 
  WhatsAppChannelType, 
  WhatsAppTemplateCategory, 
  WhatsAppTemplateStatus,
  WhatsAppMessageType 
} from '@/lib/whatsapp-constants';


export interface WhatsAppCampaign {
  id: number;
  name: string;
  description: string;
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';
  whatsappChannelType: WhatsAppChannelType;
  campaignType: 'immediate' | 'scheduled' | 'recurring_daily';
  totalRecipients: number;
  processedRecipients: number;
  successfulSends: number;
  failedSends: number;
  createdAt: string;
  scheduledAt?: string;
  templateName?: string;
  segmentName?: string;
  creatorName?: string;

  messageType: WhatsAppMessageType;
  deliveryReceipts?: number;
  readReceipts?: number;
  whatsappAccountId?: number;
  whatsappAccountName?: string;
}


export interface WhatsAppRecurringDailySettings {
  enabled: boolean;
  sendTimes: string[]; // Array of time strings in HH:mm format (e.g., ['10:00', '15:00', '22:00'])
  offDays: number[]; // Array of day numbers (0=Sunday, 1=Monday, etc.) when campaign should not be sent
  timezone: string; // IANA timezone identifier (e.g., 'America/New_York')
  startDate?: string; // Optional start date for the recurring campaign
  endDate?: string; // Optional end date for the recurring campaign
}

export interface WhatsAppCampaignData {
  name: string;
  description: string;
  templateId?: number;
  segmentId?: number;
  content: string;
  mediaUrls?: string[];
  whatsappChannelType: WhatsAppChannelType;
  whatsappAccountId?: number;
  whatsappAccountIds?: number[];
  channelId?: number; // Legacy support
  channelIds?: number[]; // Legacy support
  campaignType: 'immediate' | 'scheduled' | 'recurring_daily';
  scheduledAt?: string;
  messageType: WhatsAppMessageType;
  rateLimitSettings: WhatsAppRateLimitSettings;
  antiBanSettings: WhatsAppAntiBanSettings;
  businessHoursSettings?: WhatsAppBusinessHoursSettings;
  /** Array of pipeline stage IDs to filter campaign recipients. Merged with segment criteria. */
  pipelineStageIds?: number[];
  recurringDailySettings?: WhatsAppRecurringDailySettings;
}


export interface WhatsAppRateLimitSettings {
  messages_per_minute: number;
  messages_per_hour: number;
  messages_per_day: number;
  delay_between_messages: number;
  humanization_enabled: boolean;

  respect_whatsapp_limits: boolean;
  adaptive_rate_limiting: boolean;
}


export interface WhatsAppAntiBanSettings {
  enabled: boolean;
  mode: 'conservative' | 'moderate' | 'aggressive';
  businessHoursOnly: boolean;
  respectWeekends: boolean;
  randomizeDelay: boolean;
  minDelay: number;
  maxDelay: number;
  accountRotation: boolean;
  cooldownPeriod: number;
  messageVariation: boolean;

  avoidSpamTriggers: boolean;
  useTypingIndicators: boolean;
  randomizeMessageTiming: boolean;
  respectRecipientTimezone: boolean;
}


export interface WhatsAppBusinessHoursSettings {
  enabled: boolean;
  timezone: string;
  schedule: {
    [key: string]: {
      enabled: boolean;
      start: string;
      end: string;
    };
  };
}


export interface WhatsAppCampaignTemplate {
  id: number;
  name: string;
  content: string;
  category: WhatsAppTemplateCategory;
  status: WhatsAppTemplateStatus;
  variables: string[];
  mediaUrls?: string[];
  whatsappChannelType: WhatsAppChannelType;
  messageType: WhatsAppMessageType;

  whatsappTemplateId?: string;
  whatsappTemplateName?: string;
  whatsappTemplateLanguage?: string;
  whatsappTemplateStatus?: WhatsAppTemplateStatus;
  rejectionReason?: string;

  interactiveComponents?: WhatsAppInteractiveComponent[];
}


export interface WhatsAppInteractiveComponent {
  type: 'button' | 'list' | 'quick_reply';
  title: string;
  payload?: string;
  options?: WhatsAppInteractiveOption[];
}

export interface WhatsAppInteractiveOption {
  id: string;
  title: string;
  description?: string;
}


export interface WhatsAppContactSegment {
  id: number;
  name: string;
  description: string;
  contactCount: number;
  criteria: WhatsAppSegmentCriteria;
}

export interface WhatsAppSegmentCriteria {
  tags: string[];
  created_after?: string;
  created_before?: string;
  excludedContactIds?: number[];
  /**
   * Array of pipeline stage IDs. Filters contacts that have deals in the specified pipeline stages.
   * Contacts will be included if they have at least one deal in any of the specified stages.
   */
  pipelineStageIds?: number[];

  hasWhatsappNumber: boolean;
  whatsappOptedIn?: boolean;
  lastWhatsappActivity?: {
    days: number;
    operator: 'within' | 'before';
  };
}


export interface WhatsAppCampaignStats {
  totalCampaigns: number;
  activeCampaigns: number;
  totalRecipients: number;
  messagesDelivered: number;
  deliveryRate: number;

  readReceipts: number;
  readRate: number;
  whatsappAccountsUsed: number;
  averageDeliveryTime: number;
  bounceRate: number;
}


export interface WhatsAppCampaignDetail {
  id: number;
  contactName: string;
  phoneNumber: string;
  whatsappAccount: string;
  whatsappAccountId: number;
  messageStatus: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'cancelled';
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  messageContent: string;
  messageType: WhatsAppMessageType;
  deliveryStatus: string | null;
  errorMessage: string | null;
  errorCode?: string;

  whatsappMessageId?: string;
  mediaUrl?: string;
  interactionData?: any;
}


export interface WhatsAppChannelConnection {
  id: number;
  name: string;
  type: WhatsAppChannelType;
  status: 'active' | 'inactive' | 'error';
  phoneNumber: string;
  displayName?: string;
  profilePicture?: string;

  businessAccountId?: string;
  phoneNumberId?: string;
  accessToken?: string;
  webhookUrl?: string;

  sessionStatus?: 'connected' | 'disconnected' | 'connecting';
  qrCode?: string;
  lastActivity?: string;

  currentRateLimit?: {
    messagesPerMinute: number;
    messagesPerHour: number;
    messagesPerDay: number;
    currentUsage: {
      minute: number;
      hour: number;
      day: number;
    };
  };
}


export interface WhatsAppValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions?: string[];
}


export interface WhatsAppContentValidation extends WhatsAppValidationResult {
  characterCount: number;
  emojiCount: number;
  linkCount: number;
  urlCount: number; // Number of URLs in content
  variableCount: number;
  estimatedCost?: number;
  supportedChannels: WhatsAppChannelType[];
  score: number; // Quality score for the content
  issues: string[]; // Critical issues that prevent sending
}


export interface WhatsAppMediaValidation extends WhatsAppValidationResult {
  fileSize: number;
  fileType: string;
  dimensions?: {
    width: number;
    height: number;
  };
  duration?: number; // for video/audio
  supportedChannels: WhatsAppChannelType[];
}


export interface WhatsAppCampaignExportData {
  campaignInfo: {
    name: string;
    description: string;
    whatsappChannelType: WhatsAppChannelType;
    messageType: WhatsAppMessageType;
    totalRecipients: number;
    successfulSends: number;
    failedSends: number;
    deliveryRate: number;
    readRate?: number;
  };
  recipients: WhatsAppCampaignDetail[];
  summary: {
    exportedAt: string;
    totalRecords: number;
    filters?: any;
  };
}


export interface WhatsAppCampaignFormErrors {
  name?: string;
  description?: string;
  content?: string;
  whatsappChannelType?: string;
  whatsappAccountId?: string;
  segmentId?: string;
  scheduledAt?: string;
  mediaUrls?: string[];
  rateLimitSettings?: Partial<WhatsAppRateLimitSettings>;
  antiBanSettings?: Partial<WhatsAppAntiBanSettings>;
}


export interface WhatsAppCampaignApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface WhatsAppCampaignListResponse extends WhatsAppCampaignApiResponse {
  data: {
    campaigns: WhatsAppCampaign[];
    total: number;
    page: number;
    limit: number;
  };
}

export interface WhatsAppCampaignStatsResponse extends WhatsAppCampaignApiResponse {
  data: WhatsAppCampaignStats;
}


export type WhatsAppCampaignStatus = WhatsAppCampaign['status'];
export type WhatsAppCampaignType = WhatsAppCampaignData['campaignType'];
