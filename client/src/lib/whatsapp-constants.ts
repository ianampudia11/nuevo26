/**
 * WhatsApp Campaign Constants
 * Centralized configuration for WhatsApp-specific campaign features and limitations
 */


export const WHATSAPP_CHANNEL_TYPES = {
  OFFICIAL: 'official',
  UNOFFICIAL: 'unofficial'
} as const;

export type WhatsAppChannelType = typeof WHATSAPP_CHANNEL_TYPES[keyof typeof WHATSAPP_CHANNEL_TYPES];


export const WHATSAPP_LIMITS = {
  MESSAGE: {
    MAX_LENGTH: 4096,
    MAX_EMOJIS: 100
  },
  MEDIA: {
    IMAGE: {
      MAX_SIZE: 16 * 1024 * 1024, // 16MB
      FORMATS: ['image/jpeg', 'image/png', 'image/webp'],
      EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp']
    },
    VIDEO: {
      MAX_SIZE: 16 * 1024 * 1024, // 16MB
      FORMATS: ['video/mp4', 'video/3gpp'],
      EXTENSIONS: ['.mp4', '.3gp']
    },
    AUDIO: {
      MAX_SIZE: 16 * 1024 * 1024, // 16MB
      FORMATS: ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'], // OGG must use Opus codec
      EXTENSIONS: ['.aac', '.m4a', '.mp3', '.amr', '.ogg'] // Preferred format: OGG Opus
    },
    DOCUMENT: {
      MAX_SIZE: 100 * 1024 * 1024, // 100MB
      FORMATS: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain'
      ],
      EXTENSIONS: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt']
    }
  }
} as const;


export const WHATSAPP_RATE_LIMITS = {
  [WHATSAPP_CHANNEL_TYPES.OFFICIAL]: {
    MESSAGES_PER_SECOND: 20,
    MESSAGES_PER_MINUTE: 1000,
    MESSAGES_PER_HOUR: 10000,
    MESSAGES_PER_DAY: 100000,
    DEFAULT_DELAY: 50, // milliseconds
    BURST_LIMIT: 100,
    BURST_WINDOW: 60 // seconds
  },
  [WHATSAPP_CHANNEL_TYPES.UNOFFICIAL]: {
    MESSAGES_PER_SECOND: 1,
    MESSAGES_PER_MINUTE: 20,
    MESSAGES_PER_HOUR: 200,
    MESSAGES_PER_DAY: 1000,
    DEFAULT_DELAY: 3000, // 3 seconds
    BURST_LIMIT: 5,
    BURST_WINDOW: 300 // 5 minutes
  }
} as const;


export const WHATSAPP_CAPABILITIES = {
  [WHATSAPP_CHANNEL_TYPES.OFFICIAL]: {
    SUPPORTS_TEMPLATES: true,
    SUPPORTS_INTERACTIVE_MESSAGES: true,
    SUPPORTS_BUTTONS: true,
    SUPPORTS_LISTS: true,
    SUPPORTS_QUICK_REPLIES: true,
    SUPPORTS_MEDIA: true,
    SUPPORTS_DOCUMENTS: true,
    SUPPORTS_LOCATION: true,
    SUPPORTS_CONTACTS: true,
    DELIVERY_RECEIPTS: true,
    READ_RECEIPTS: true,
    TYPING_INDICATORS: true,
    BUSINESS_HOURS_REQUIRED: false,
    TEMPLATE_APPROVAL_REQUIRED: true
  },
  [WHATSAPP_CHANNEL_TYPES.UNOFFICIAL]: {
    SUPPORTS_TEMPLATES: false,
    SUPPORTS_INTERACTIVE_MESSAGES: false,
    SUPPORTS_BUTTONS: false,
    SUPPORTS_LISTS: false,
    SUPPORTS_QUICK_REPLIES: false,
    SUPPORTS_MEDIA: true,
    SUPPORTS_DOCUMENTS: true,
    SUPPORTS_LOCATION: false,
    SUPPORTS_CONTACTS: false,
    DELIVERY_RECEIPTS: false,
    READ_RECEIPTS: false,
    TYPING_INDICATORS: true,
    BUSINESS_HOURS_REQUIRED: true,
    TEMPLATE_APPROVAL_REQUIRED: false
  }
} as const;


export const WHATSAPP_TEMPLATE_CATEGORIES = {
  MARKETING: 'marketing',
  UTILITY: 'utility',
  AUTHENTICATION: 'authentication'
} as const;

export type WhatsAppTemplateCategory = typeof WHATSAPP_TEMPLATE_CATEGORIES[keyof typeof WHATSAPP_TEMPLATE_CATEGORIES];


export const WHATSAPP_TEMPLATE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  DISABLED: 'disabled'
} as const;

export type WhatsAppTemplateStatus = typeof WHATSAPP_TEMPLATE_STATUS[keyof typeof WHATSAPP_TEMPLATE_STATUS];


export const DEFAULT_BUSINESS_HOURS = {
  MONDAY: { start: '09:00', end: '17:00', enabled: true },
  TUESDAY: { start: '09:00', end: '17:00', enabled: true },
  WEDNESDAY: { start: '09:00', end: '17:00', enabled: true },
  THURSDAY: { start: '09:00', end: '17:00', enabled: true },
  FRIDAY: { start: '09:00', end: '17:00', enabled: true },
  SATURDAY: { start: '09:00', end: '13:00', enabled: false },
  SUNDAY: { start: '09:00', end: '13:00', enabled: false }
} as const;


export const WHATSAPP_MESSAGE_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  DOCUMENT: 'document',
  LOCATION: 'location',
  CONTACT: 'contact',
  TEMPLATE: 'template',
  INTERACTIVE: 'interactive'
} as const;



export type WhatsAppMessageType = typeof WHATSAPP_MESSAGE_TYPES[keyof typeof WHATSAPP_MESSAGE_TYPES];


export const WHATSAPP_INTERACTIVE_TYPES = {
  BUTTON: 'button',
  LIST: 'list',
  QUICK_REPLY: 'quick_reply'
} as const;

export type WhatsAppInteractiveType = typeof WHATSAPP_INTERACTIVE_TYPES[keyof typeof WHATSAPP_INTERACTIVE_TYPES];


export const WHATSAPP_VALIDATION_RULES = {
  PHONE_NUMBER: {
    MIN_LENGTH: 10,
    MAX_LENGTH: 15,
    PATTERN: /^\+?[1-9]\d{1,14}$/
  },
  MESSAGE_CONTENT: {
    MIN_LENGTH: 1,
    MAX_LENGTH: WHATSAPP_LIMITS.MESSAGE.MAX_LENGTH,
    FORBIDDEN_PATTERNS: [
      /https?:\/\/bit\.ly/i, // Shortened URLs often flagged
      /https?:\/\/tinyurl/i,
      /https?:\/\/t\.co/i
    ]
  }
} as const;


export const WHATSAPP_ERROR_MESSAGES = {
  INVALID_CHANNEL_TYPE: 'Invalid WhatsApp channel type',
  MESSAGE_TOO_LONG: `Message exceeds ${WHATSAPP_LIMITS.MESSAGE.MAX_LENGTH} character limit`,
  UNSUPPORTED_MEDIA_FORMAT: 'Media format not supported by WhatsApp',
  FILE_TOO_LARGE: 'File size exceeds WhatsApp limits',
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded for this channel',
  BUSINESS_HOURS_VIOLATION: 'Messages can only be sent during business hours for unofficial channels',
  TEMPLATE_NOT_APPROVED: 'Template must be approved before use',
  FEATURE_NOT_SUPPORTED: 'Feature not supported by this channel type'
} as const;


export const getChannelCapabilities = (channelType: WhatsAppChannelType) => {
  return WHATSAPP_CAPABILITIES[channelType];
};

export const getRateLimits = (channelType: WhatsAppChannelType) => {
  return WHATSAPP_RATE_LIMITS[channelType];
};

export const isMediaTypeSupported = (channelType: WhatsAppChannelType, mediaType: string) => {
  const capabilities = getChannelCapabilities(channelType);
  
  switch (mediaType) {
    case WHATSAPP_MESSAGE_TYPES.IMAGE:
    case WHATSAPP_MESSAGE_TYPES.VIDEO:
    case WHATSAPP_MESSAGE_TYPES.AUDIO:
      return capabilities.SUPPORTS_MEDIA;
    case WHATSAPP_MESSAGE_TYPES.DOCUMENT:
      return capabilities.SUPPORTS_DOCUMENTS;
    case WHATSAPP_MESSAGE_TYPES.LOCATION:
      return capabilities.SUPPORTS_LOCATION;
    case WHATSAPP_MESSAGE_TYPES.CONTACT:
      return capabilities.SUPPORTS_CONTACTS;
    case WHATSAPP_MESSAGE_TYPES.INTERACTIVE:
      return capabilities.SUPPORTS_INTERACTIVE_MESSAGES;
    default:
      return true; // Text messages are always supported
  }
};

export const validateMediaFile = (file: File, mediaType: WhatsAppMessageType) => {
  const errors: string[] = [];

  switch (mediaType) {
    case WHATSAPP_MESSAGE_TYPES.IMAGE:
      if (!(WHATSAPP_LIMITS.MEDIA.IMAGE.FORMATS as readonly string[]).includes(file.type)) {
        errors.push(`Unsupported image format. Supported: ${WHATSAPP_LIMITS.MEDIA.IMAGE.EXTENSIONS.join(', ')}`);
      }
      if (file.size > WHATSAPP_LIMITS.MEDIA.IMAGE.MAX_SIZE) {
        errors.push(`Image too large. Maximum size: ${WHATSAPP_LIMITS.MEDIA.IMAGE.MAX_SIZE / (1024 * 1024)}MB`);
      }
      break;
    case WHATSAPP_MESSAGE_TYPES.VIDEO:
      if (!(WHATSAPP_LIMITS.MEDIA.VIDEO.FORMATS as readonly string[]).includes(file.type)) {
        errors.push(`Unsupported video format. Supported: ${WHATSAPP_LIMITS.MEDIA.VIDEO.EXTENSIONS.join(', ')}`);
      }
      if (file.size > WHATSAPP_LIMITS.MEDIA.VIDEO.MAX_SIZE) {
        errors.push(`Video too large. Maximum size: ${WHATSAPP_LIMITS.MEDIA.VIDEO.MAX_SIZE / (1024 * 1024)}MB`);
      }
      break;
    case WHATSAPP_MESSAGE_TYPES.AUDIO:
      if (!(WHATSAPP_LIMITS.MEDIA.AUDIO.FORMATS as readonly string[]).includes(file.type)) {
        errors.push(`Unsupported audio format. Supported: ${WHATSAPP_LIMITS.MEDIA.AUDIO.EXTENSIONS.join(', ')}`);
      }
      if (file.size > WHATSAPP_LIMITS.MEDIA.AUDIO.MAX_SIZE) {
        errors.push(`Audio too large. Maximum size: ${WHATSAPP_LIMITS.MEDIA.AUDIO.MAX_SIZE / (1024 * 1024)}MB`);
      }
      break;
    case WHATSAPP_MESSAGE_TYPES.DOCUMENT:
      if (!(WHATSAPP_LIMITS.MEDIA.DOCUMENT.FORMATS as readonly string[]).includes(file.type)) {
        errors.push(`Unsupported document format. Supported: ${WHATSAPP_LIMITS.MEDIA.DOCUMENT.EXTENSIONS.join(', ')}`);
      }
      if (file.size > WHATSAPP_LIMITS.MEDIA.DOCUMENT.MAX_SIZE) {
        errors.push(`Document too large. Maximum size: ${WHATSAPP_LIMITS.MEDIA.DOCUMENT.MAX_SIZE / (1024 * 1024)}MB`);
      }
      break;
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};


export const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' }
] as const;

export const RECURRING_DAILY_LIMITS = {
  MAX_SEND_TIMES: 10,
  MIN_SEND_TIMES: 1,
  MIN_TIME_INTERVAL_MINUTES: 1 // Minimum gap between send times
} as const;

export const isValidTimeFormat = (time: string): boolean => {
  return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
};

/**
 * Audio specifications for WhatsApp compatibility
 * Recommended settings for optimal voice message quality
 */
export const AUDIO_SPECS = {
  sampleRate: 48000, // Opus codec preferred sample rate
  bitrate: '64k', // Optimal for voice
  channels: 1, // Mono
  codec: 'opus' // For OGG format
} as const;