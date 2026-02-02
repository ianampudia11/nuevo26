import { Router } from 'express';
import { authenticateApiKey, requirePermission, rateLimitMiddleware, logApiUsage } from '../middleware/api-auth';
import apiMessageService from '../services/api-message-service';
import { storage } from '../storage';
import { dataUsageTracker } from '../services/data-usage-tracker';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';

const router = Router();

router.use(authenticateApiKey);
router.use(rateLimitMiddleware);
router.use(logApiUsage);

const sendMessageSchema = z.object({
  channelId: z.number().int().positive(),
  to: z.string().min(1).max(20),
  message: z.string().min(1).max(4096),
  messageType: z.literal('text').optional().default('text')
});

const sendMediaSchema = z.object({
  channelId: z.number().int().positive(),
  to: z.string().min(1).max(20),
  mediaType: z.enum(['image', 'video', 'audio', 'document']),
  mediaUrl: z.string().url(),
  caption: z.string().max(1024).optional(),
  filename: z.string().max(255).optional()
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const uploadDir = path.join(process.cwd(), 'uploads', 'api');
      fs.ensureDirSync(uploadDir);
      cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
      const uniqueId = crypto.randomBytes(16).toString('hex');
      const fileExt = path.extname(file.originalname) || '';
      cb(null, `${uniqueId}${fileExt}`);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/webp',
      'video/mp4', 'video/3gpp',
      'audio/mpeg', 'audio/aac', 'audio/ogg', 'audio/mp4', 'audio/webm',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  }
});

/**
 * GET /api/v1/channels
 * Get list of available channels for the authenticated company
 */
router.get('/channels', requirePermission('channels:read'), async (req, res) => {
  try {
    const channels = await apiMessageService.getChannels(req.companyId!);
    
    res.json({
      success: true,
      data: channels,
      count: channels.length
    });
  } catch (error: any) {
    console.error('Error getting channels:', error);
    res.status(500).json({
      success: false,
      error: 'CHANNELS_FETCH_ERROR',
      message: error.message || 'Failed to retrieve channels'
    });
  }
});

/**
 * POST /api/v1/messages/send
 * Send a text message through the specified channel
 */
router.post('/messages/send', requirePermission('messages:send'), async (req, res) => {
  try {
    const validatedData = sendMessageSchema.parse(req.body);
    
    const result = await apiMessageService.sendMessage(req.companyId!, validatedData);
    
    res.locals.messageId = result.id;
    
    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('Error sending message:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.errors
      });
    }
    
    if (error.message?.includes('conversion') || error.message?.includes('audio')) {
      return res.status(400).json({
        success: false,
        error: 'AUDIO_CONVERSION_FAILED',
        message: error.message || 'Audio conversion failed'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'MESSAGE_SEND_ERROR',
      message: error.message || 'Failed to send message'
    });
  }
});

/**
 * POST /api/v1/messages/send-media
 * Send a media message through the specified channel
 */
router.post('/messages/send-media', requirePermission('messages:send'), async (req, res) => {
  try {
    const validatedData = sendMediaSchema.parse(req.body);
    
    const result = await apiMessageService.sendMedia(req.companyId!, validatedData);
    
    res.locals.messageId = result.id;
    
    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('Error sending media message:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.errors
      });
    }
    
    if (error.message?.includes('conversion') || error.message?.includes('audio')) {
      return res.status(400).json({
        success: false,
        error: 'AUDIO_CONVERSION_FAILED',
        message: error.message || 'Audio conversion failed'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'MEDIA_SEND_ERROR',
      message: error.message || 'Failed to send media message'
    });
  }
});

/**
 * POST /api/v1/messages/send-batch
 * Send multiple messages in a single request
 */
const sendBatchSchema = z.object({
  messages: z.array(z.object({
    channelId: z.number().int().positive(),
    to: z.string().min(1).max(20),
    message: z.string().min(1).max(4096),
    messageType: z.literal('text').optional().default('text')
  })).min(1).max(100)
});

router.post('/messages/send-batch', requirePermission('messages:send:batch'), async (req, res) => {
  try {
    const validatedData = sendBatchSchema.parse(req.body);
    
    const results = await apiMessageService.sendBatchMessages(req.companyId!, validatedData.messages);
    

    const firstSuccessId = results.find(r => r.status === 'sent' && r.id > 0)?.id;
    if (firstSuccessId) {
      res.locals.messageId = firstSuccessId;
    }
    
    res.status(201).json({
      success: true,
      data: results,
      count: results.length
    });
  } catch (error: any) {
    console.error('Error sending batch messages:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.errors
      });
    }
    

    if (error.name === 'BatchSizeExceededError' || 
        error.message?.includes('Batch size') || error.message?.includes('batch size') || 
        error.message?.includes('exceed') || error.message?.includes('100')) {
      return res.status(400).json({
        success: false,
        error: 'BATCH_SIZE_EXCEEDED',
        message: error.message || 'Batch size cannot exceed 100 messages'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'BATCH_SEND_ERROR',
      message: error.message || 'Failed to send batch messages'
    });
  }
});

/**
 * POST /api/v1/messages/send-template
 * Send a template message (WhatsApp official/meta only)
 */
const sendTemplateSchema = z.object({
  channelId: z.number().int().positive(),
  to: z.string().min(1).max(20),
  templateName: z.string().min(1).max(255),
  templateLanguage: z.string().min(2).max(10).default('en'),
  components: z.array(z.object({
    type: z.enum(['header', 'body', 'button']),
    parameters: z.array(z.union([
      z.string(),
      z.object({ type: z.literal('text'), text: z.string() })
    ]))
  })).optional().default([])
});

router.post('/messages/send-template', requirePermission('messages:send:template'), async (req, res) => {
  try {
    const validatedData = sendTemplateSchema.parse(req.body);
    
    const result = await apiMessageService.sendTemplateMessage(req.companyId!, validatedData);
    
    res.locals.messageId = result.id;
    
    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('Error sending template message:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.errors
      });
    }
    
    if (error.message?.includes('template') || error.message?.includes('Template')) {
      return res.status(404).json({
        success: false,
        error: 'TEMPLATE_NOT_FOUND',
        message: error.message || 'Template not found'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'TEMPLATE_SEND_ERROR',
      message: error.message || 'Failed to send template message'
    });
  }
});

/**
 * POST /api/v1/messages/send-interactive
 * Send an interactive message (WhatsApp only)
 */
const sendInteractiveSchema = z.object({
  channelId: z.number().int().positive(),
  to: z.string().min(1).max(20),
  interactiveType: z.enum(['button', 'list']),
  content: z.object({
    header: z.object({
      type: z.enum(['text', 'image', 'video', 'document']),
      text: z.string().optional(),
      mediaUrl: z.string().url().optional()
    }).optional(),
    body: z.object({
      text: z.string().min(1).max(1024)
    }),
    footer: z.object({
      text: z.string().max(60)
    }).optional()
  }),
  options: z.union([
    z.object({
      type: z.literal('button'),
      buttons: z.array(z.object({
        id: z.string().min(1).max(256),
        title: z.string().min(1).max(20)
      })).min(1).max(3)
    }),
    z.object({
      type: z.literal('list'),
      button: z.string().min(1).max(20),
      sections: z.array(z.object({
        title: z.string().max(24).optional(),
        rows: z.array(z.object({
          id: z.string().min(1).max(200),
          title: z.string().min(1).max(24),
          description: z.string().max(72).optional()
        })).min(1).max(10)
      })).min(1).max(10)
    })
  ])
});

router.post('/messages/send-interactive', requirePermission('messages:send:interactive'), async (req, res) => {
  try {
    const validatedData = sendInteractiveSchema.parse(req.body);
    
    const result = await apiMessageService.sendInteractiveMessage(req.companyId!, validatedData);
    
    res.locals.messageId = result.id;
    
    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('Error sending interactive message:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.errors
      });
    }
    
    if (error.message?.includes('interactive') || error.message?.includes('Interactive')) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_INTERACTIVE_MESSAGE',
        message: error.message || 'Invalid interactive message structure'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'INTERACTIVE_SEND_ERROR',
      message: error.message || 'Failed to send interactive message'
    });
  }
});

/**
 * GET /api/v1/conversations
 * List conversations for the authenticated company
 */
router.get('/conversations', requirePermission('conversations:read'), async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const channelId = req.query.channelId ? parseInt(req.query.channelId as string) : undefined;
    const status = req.query.status as string | undefined;
    const isGroup = req.query.isGroup === 'true' ? true : req.query.isGroup === 'false' ? false : undefined;
    
    const result = await apiMessageService.getConversations(req.companyId!, {
      page,
      limit,
      channelId,
      status,
      isGroup
    });
    
    res.json({
      success: true,
      data: result.conversations,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit)
      }
    });
  } catch (error: any) {
    console.error('Error getting conversations:', error);
    res.status(500).json({
      success: false,
      error: 'CONVERSATIONS_FETCH_ERROR',
      message: error.message || 'Failed to retrieve conversations'
    });
  }
});

/**
 * GET /api/v1/contacts
 * List contacts for the authenticated company
 */
router.get('/contacts', requirePermission('contacts:read'), async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const search = req.query.search as string | undefined;
    
    const result = await apiMessageService.getContacts(req.companyId!, {
      page,
      limit,
      search
    });
    
    res.json({
      success: true,
      data: result.contacts,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit)
      }
    });
  } catch (error: any) {
    console.error('Error getting contacts:', error);
    res.status(500).json({
      success: false,
      error: 'CONTACTS_FETCH_ERROR',
      message: error.message || 'Failed to retrieve contacts'
    });
  }
});

/**
 * POST /api/v1/media/upload
 * Upload media file and get URL for sending
 */
router.post('/media/upload', requirePermission('media:upload'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'NO_FILE_PROVIDED',
        message: 'No file was uploaded'
      });
    }

    let finalUrl = `${req.protocol}://${req.get('host')}/uploads/api/${path.basename(req.file.path)}`;
    let finalMimeType = req.file.mimetype;
    let finalSize = req.file.size;

    let mediaType: string;
    if (req.file.mimetype.startsWith('image/')) mediaType = 'image';
    else if (req.file.mimetype.startsWith('video/')) mediaType = 'video';
    else if (req.file.mimetype.startsWith('audio/')) mediaType = 'audio';
    else mediaType = 'document';


    if (mediaType === 'audio') {
      try {
        const { convertAudioForWhatsAppWithFallback, getWhatsAppMimeType } = await import('../utils/audio-converter');
        const tempDir = path.join(process.cwd(), 'temp', 'api-audio');
        await fs.ensureDir(tempDir);

        const conversionResult = await convertAudioForWhatsAppWithFallback(
          req.file.path,
          tempDir,
          req.file.originalname
        );


        if (!conversionResult || !conversionResult.outputPath) {
          throw new Error('Audio conversion failed: no output path');
        }

        const mediaDir = path.join(process.cwd(), 'public', 'media', 'audio');
        await fs.ensureDir(mediaDir);

        const convertedFileName = path.basename(conversionResult.outputPath);
        const publicMediaPath = path.join(mediaDir, convertedFileName);

        await fs.move(conversionResult.outputPath, publicMediaPath);


        let cleanMimeType = conversionResult.mimeType;
        if (cleanMimeType.includes(';')) {
          cleanMimeType = cleanMimeType.split(';')[0].trim();
        }

        finalUrl = `${req.protocol}://${req.get('host')}/media/audio/${convertedFileName}`;
        finalMimeType = cleanMimeType;
        finalSize = conversionResult.metadata.size || req.file.size;

      } catch (conversionError) {
        console.warn('API audio conversion failed, using original file:', conversionError);

      }
    }

    const responseData = {
      success: true,
      data: {
        url: finalUrl,
        mediaType,
        filename: req.file.originalname,
        size: finalSize,
        mimetype: finalMimeType
      }
    };


    if (req.companyId && req.file) {
      dataUsageTracker.trackFileUpload(req.companyId, finalSize).catch(err => {
        console.error('Failed to track API v1 media upload:', err);
      });
    }

    res.json(responseData);
  } catch (error: any) {
    console.error('Error uploading media:', error);

    if (req.file && req.file.path) {
      fs.unlink(req.file.path).catch(console.error);
    }

    if (error.message?.includes('conversion') || error.message?.includes('audio')) {
      return res.status(400).json({
        success: false,
        error: 'AUDIO_CONVERSION_FAILED',
        message: error.message || 'Audio conversion failed'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'UPLOAD_ERROR',
      message: error.message || 'Failed to upload media'
    });
  }
});

/**
 * GET /api/v1/messages/:messageId/status
 * Get message delivery status
 */
router.get('/messages/:messageId/status', requirePermission('messages:read'), async (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId);
    if (isNaN(messageId)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_MESSAGE_ID',
        message: 'Message ID must be a valid number'
      });
    }

    const status = await apiMessageService.getMessageStatus(req.companyId!, messageId);
    
    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'MESSAGE_NOT_FOUND',
        message: 'Message not found'
      });
    }

    res.json({
      success: true,
      data: status
    });
  } catch (error: any) {
    console.error('Error getting message status:', error);
    res.status(500).json({
      success: false,
      error: 'STATUS_FETCH_ERROR',
      message: error.message || 'Failed to get message status'
    });
  }
});

/**
 * GET /api/v1/health
 * API health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }
  });
});

/**
 * Error handler for API routes
 */
router.use((error: any, req: any, res: any, next: any) => {
  console.error('API v1 error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'FILE_TOO_LARGE',
        message: 'File size exceeds the 10MB limit'
      });
    }
  }
  
  res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred'
  });
});










router.get('/messages/:messageId/email-attachments', requirePermission('messages:read'), async (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId);
    if (isNaN(messageId)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_MESSAGE_ID',
        message: 'Invalid message ID'
      });
    }


    const message = await storage.getMessageById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'MESSAGE_NOT_FOUND',
        message: 'Message not found'
      });
    }


    const conversation = await storage.getConversation(message.conversationId);
    if (!conversation || conversation.companyId !== req.companyId) {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'You can only access messages from your company'
      });
    }

    const attachments = await storage.getEmailAttachmentsByMessageId(messageId);

    res.json({
      success: true,
      attachments: attachments
    });

  } catch (error: any) {
    console.error('Error fetching email attachments:', error);
    res.status(500).json({
      success: false,
      error: 'EMAIL_ATTACHMENTS_ERROR',
      message: error.message || 'Failed to fetch email attachments'
    });
  }
});

export default router;
