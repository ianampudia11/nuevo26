import express from 'express';
import { storage } from '../storage';
import { ensureAuthenticated, requirePermission } from '../middleware';
import { PERMISSIONS } from '@shared/schema';
import { db } from '../db';
import { campaignTemplates, channelConnections } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import axios from 'axios';
import { logger } from '../utils/logger';
import { syncSpecificTemplates } from '../services/template-status-sync';

const router = express.Router();

const WHATSAPP_GRAPH_URL = 'https://graph.facebook.com';
const WHATSAPP_API_VERSION = 'v23.0';

/**
 * Upload media for template using WhatsApp Resumable Upload API
 * This is required for template creation, not the regular media upload endpoint
 * Reference: https://developers.facebook.com/docs/graph-api/guides/upload
 */
async function uploadMediaForTemplate(
  mediaUrl: string,
  accessToken: string,
  wabaId: string,
  appId?: string
): Promise<string> {

  const uploadId = wabaId || appId;

  if (!uploadId) {
    throw new Error('Either WABA ID or App ID is required for media upload');
  }

  try {
    logger.info('whatsapp-templates', 'Starting Resumable Upload for template media', {
      mediaUrl,
      uploadId,
      usingWabaId: !!wabaId,
      usingAppId: !wabaId && !!appId
    });


    const mediaResponse = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    });


    const contentType = mediaResponse.headers['content-type'] || 'application/octet-stream';
    const urlParts = mediaUrl.split('/');
    const filename = urlParts[urlParts.length - 1];
    const fileSize = mediaResponse.data.byteLength;

    logger.info('whatsapp-templates', 'Media downloaded', {
      filename,
      contentType,
      fileSize
    });


    const sessionUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${uploadId}/uploads?file_length=${fileSize}&file_type=${encodeURIComponent(contentType)}&access_token=${accessToken}`;

    logger.info('whatsapp-templates', 'Creating upload session', {
      sessionUrl: sessionUrl.replace(accessToken, 'REDACTED'),
      uploadId
    });

    const sessionResponse = await axios.post(sessionUrl, {}, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!sessionResponse.data?.id) {
      throw new Error('Failed to create upload session: No session ID returned');
    }

    const uploadSessionId = sessionResponse.data.id;
    logger.info('whatsapp-templates', 'Upload session created', {
      uploadSessionId
    });


    const uploadUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${uploadSessionId}`;

    logger.info('whatsapp-templates', 'Uploading file data', {
      uploadUrl,
      fileSize
    });

    const uploadResponse = await axios.post(uploadUrl, mediaResponse.data, {
      headers: {
        'Authorization': `OAuth ${accessToken}`,
        'file_offset': '0',
        'Content-Type': 'application/octet-stream'
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 120000
    });

    if (!uploadResponse.data?.h) {
      throw new Error('Failed to upload media: No media handle returned');
    }

    const mediaHandle = uploadResponse.data.h;
    logger.info('whatsapp-templates', 'Media uploaded successfully via Resumable Upload API', {
      mediaHandle
    });

    return mediaHandle;
  } catch (error: any) {
    logger.error('whatsapp-templates', 'Error uploading media for template', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      uploadId,
      usingWabaId: !!wabaId,
      usingAppId: !wabaId && !!appId
    });


    if (wabaId && appId && error.response?.status === 400) {
      logger.info('whatsapp-templates', 'Retrying with App ID instead of WABA ID');
      return uploadMediaForTemplate(mediaUrl, accessToken, '', appId);
    }

    throw error;
  }
}

/**
 * Get all templates for the company
 * Only returns official WhatsApp Business API templates
 */
router.get('/', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_TEMPLATES), async (req, res) => {
  try {
    const user = req.user as any;
    if (!user || !user.companyId) {
      return res.status(403).json({ error: 'No company association found' });
    }


    const templates = await db
      .select({
        template: campaignTemplates,
        connection: channelConnections
      })
      .from(campaignTemplates)
      .leftJoin(channelConnections, eq(campaignTemplates.connectionId, channelConnections.id))
      .where(
        and(
          eq(campaignTemplates.companyId, user.companyId),
          eq(campaignTemplates.whatsappChannelType, 'official')
        )
      )
      .orderBy(desc(campaignTemplates.createdAt));


    const formattedTemplates = templates.map(({ template, connection }) => {
      const connectionData = connection?.connectionData as any;
      

      if (connectionData) {
        logger.info('whatsapp-templates', 'Template connection data structure', {
          templateId: template.id,
          templateName: template.name,
          connectionId: connection?.id,
          connectionDataKeys: Object.keys(connectionData),
          hasWabaId: !!(connectionData.wabaId || connectionData.businessAccountId || connectionData.waba_id),
          hasAccessToken: !!(connectionData.accessToken || connectionData.access_token),
          hasAppId: !!(connectionData.appId || connectionData.app_id),
          partnerManaged: connectionData.partnerManaged === true,
          phoneNumberId: connectionData.phoneNumberId || connectionData.phone_number_id
        });
      }
      
      return {
        ...template,
        connection: connection ? {
          id: connection.id,
          accountName: connection.accountName,
          phoneNumber: connectionData?.phoneNumber || connectionData?.phone_number,
          status: connection.status
        } : null
      };
    });

    res.json(formattedTemplates);
  } catch (error) {
    logger.error('whatsapp-templates', 'Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

/**
 * Get a single template by ID
 */
router.get('/:id', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_TEMPLATES), async (req, res) => {
  try {
    const user = req.user as any;
    const templateId = parseInt(req.params.id);

    if (!user || !user.companyId) {
      return res.status(403).json({ error: 'No company association found' });
    }

    const template = await db
      .select()
      .from(campaignTemplates)
      .where(
        and(
          eq(campaignTemplates.id, templateId),
          eq(campaignTemplates.companyId, user.companyId)
        )
      )
      .limit(1);

    if (!template || template.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(template[0]);
  } catch (error) {
    logger.error('whatsapp-templates', 'Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

/**
 * Create a new template and submit to WhatsApp Business API
 */
router.post('/', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_TEMPLATES), async (req, res) => {
  try {
    const user = req.user as any;
    if (!user || !user.companyId) {
      return res.status(403).json({ error: 'No company association found' });
    }

    const {
      name,
      description,
      whatsappTemplateCategory,
      whatsappTemplateLanguage,
      content,
      variables,
      connectionId,
      headerType,
      headerText,
      headerMediaUrl,
      footerText,
    } = req.body;


    if (!name || !content) {
      return res.status(400).json({ error: 'Name and content are required' });
    }


    if (!/^[a-z0-9_]+$/.test(name)) {
      return res.status(400).json({
        error: 'Template name must contain only lowercase letters, numbers, and underscores'
      });
    }

    if (!connectionId) {
      return res.status(400).json({ error: 'WhatsApp connection is required' });
    }


    const existingTemplate = await db
      .select()
      .from(campaignTemplates)
      .where(
        and(
          eq(campaignTemplates.companyId, user.companyId),
          eq(campaignTemplates.name, name)
        )
      )
      .limit(1);

    if (existingTemplate && existingTemplate.length > 0) {
      return res.status(400).json({ error: 'A template with this name already exists' });
    }


    const whatsappChannel = await storage.getChannelConnection(connectionId);

    if (!whatsappChannel) {
      logger.error('whatsapp-templates', 'WhatsApp channel not found', { connectionId });
      return res.status(404).json({
        error: 'WhatsApp connection not found'
      });
    }


    if (whatsappChannel.companyId !== user.companyId) {
      logger.error('whatsapp-templates', 'Unauthorized access to channel', {
        connectionId,
        channelCompanyId: whatsappChannel.companyId,
        userCompanyId: user.companyId
      });
      return res.status(403).json({
        error: 'Unauthorized access to this connection'
      });
    }


    if (whatsappChannel.channelType !== 'whatsapp_official') {
      logger.error('whatsapp-templates', 'Invalid channel type', {
        connectionId,
        channelType: whatsappChannel.channelType
      });
      return res.status(400).json({
        error: 'Selected connection is not a WhatsApp Official channel'
      });
    }


    const connectionData = whatsappChannel.connectionData as any;
    

    logger.info('whatsapp-templates', 'Connection data structure for template creation', {
      connectionId,
      connectionDataKeys: Object.keys(connectionData || {}),
      connectionData: {
        wabaId: connectionData?.wabaId,
        businessAccountId: connectionData?.businessAccountId,
        waba_id: connectionData?.waba_id,
        accessToken: connectionData?.accessToken ? '***REDACTED***' : undefined,
        access_token: connectionData?.access_token ? '***REDACTED***' : undefined,
        appId: connectionData?.appId,
        app_id: connectionData?.app_id,
        phoneNumberId: connectionData?.phoneNumberId,
        phone_number_id: connectionData?.phone_number_id,
        partnerManaged: connectionData?.partnerManaged
      }
    });
    
    let wabaId = connectionData.wabaId || connectionData.businessAccountId || connectionData.waba_id;
    let accessToken = connectionData.accessToken || connectionData.access_token;
    const phoneNumberId = connectionData.phoneNumberId || connectionData.phone_number_id;
    let appId = connectionData.appId || connectionData.app_id;
    const partnerManaged = connectionData.partnerManaged === true;
    

    if (partnerManaged && (!appId || !accessToken)) {
      try {
        const partnerConfig = await storage.getPartnerConfiguration('meta');
        if (partnerConfig) {
          logger.info('whatsapp-templates', 'Using partner configuration for template creation', {
            connectionId,
            hadAppId: !!appId,
            hadAccessToken: !!accessToken,
            partnerConfigHasAppId: !!partnerConfig.partnerApiKey,
            partnerConfigHasAccessToken: !!partnerConfig.accessToken
          });
          
          if (!appId && partnerConfig.partnerApiKey) {
            appId = partnerConfig.partnerApiKey;
          }


          if (!accessToken && partnerConfig.accessToken) {
            accessToken = partnerConfig.accessToken;
          }
        }
      } catch (partnerConfigError: any) {
        logger.error('whatsapp-templates', 'Error fetching partner configuration', {
          connectionId,
          error: partnerConfigError.message
        });
      }
    }

    logger.info('whatsapp-templates', 'Connection credentials', {
      hasWabaId: !!wabaId,
      wabaId: wabaId,
      hasAccessToken: !!accessToken,
      hasPhoneNumberId: !!phoneNumberId,
      phoneNumberId: phoneNumberId,
      hasAppId: !!appId,
      appId: appId,
      partnerManaged,
      connectionDataKeys: Object.keys(connectionData || {}),
      tokenSource: partnerManaged && accessToken !== (connectionData.accessToken || connectionData.access_token) 
        ? 'partner-config' 
        : 'connection'
    });

    if (!wabaId || !accessToken) {
      return res.status(400).json({
        error: 'WhatsApp Business Account ID or access token not found in connection'
      });
    }


    let mediaHandle: string | undefined;

    logger.info('whatsapp-templates', 'Checking if media upload needed', {
      hasHeaderMediaUrl: !!headerMediaUrl,
      headerType,
      headerMediaUrl,
      shouldUpload: headerMediaUrl && ['image', 'video', 'document'].includes(headerType)
    });

    if (headerMediaUrl && ['image', 'video', 'document'].includes(headerType)) {
      if (!appId) {
        logger.error('whatsapp-templates', 'App ID not found in connection data', {
          connectionDataKeys: Object.keys(connectionData || {})
        });
        return res.status(400).json({
          error: 'App ID not found in connection. Media upload requires App ID for Resumable Upload API.'
        });
      }

      try {

        let fullMediaUrl = headerMediaUrl;
        
        if (!headerMediaUrl.startsWith('http')) {
          const baseUrl = process.env.APP_URL || process.env.BASE_URL || process.env.PUBLIC_URL;
          
          if (baseUrl) {

            const cleanBaseUrl = baseUrl.replace(/\/$/, '');
            const cleanMediaUrl = headerMediaUrl.startsWith('/') ? headerMediaUrl : `/${headerMediaUrl}`;
            fullMediaUrl = `${cleanBaseUrl}${cleanMediaUrl}`;
          } else {

            const basePort = process.env.PORT || '9000';
            const host = process.env.HOST || 'localhost';
            const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';

            if (host === 'localhost' || host === '127.0.0.1') {
              fullMediaUrl = `${protocol}://${host}:${basePort}${headerMediaUrl.startsWith('/') ? headerMediaUrl : `/${headerMediaUrl}`}`;
            } else {
              fullMediaUrl = `${protocol}://${host}${headerMediaUrl.startsWith('/') ? headerMediaUrl : `/${headerMediaUrl}`}`;
            }
          }
        }

        logger.info('whatsapp-templates', 'Uploading media for template using Resumable Upload API with App ID', {
          headerType,
          mediaUrl: fullMediaUrl,
          appId
        });


        mediaHandle = await uploadMediaForTemplate(fullMediaUrl, accessToken, '', appId);

        logger.info('whatsapp-templates', 'Media uploaded, got handle', { mediaHandle });
      } catch (error: any) {
        logger.error('whatsapp-templates', 'Failed to upload media', {
          error: error.message,
          stack: error.stack
        });
        return res.status(400).json({
          error: 'Failed to upload media to WhatsApp: ' + error.message
        });
      }
    }


    const components: any[] = [];


    if (headerType === 'text' && headerText) {
      components.push({
        type: 'HEADER',
        format: 'TEXT',
        text: headerText,
      });
    } else if (headerType === 'image' && mediaHandle) {
      components.push({
        type: 'HEADER',
        format: 'IMAGE',
        example: {
          header_handle: [mediaHandle]
        }
      });
    } else if (headerType === 'video' && mediaHandle) {
      components.push({
        type: 'HEADER',
        format: 'VIDEO',
        example: {
          header_handle: [mediaHandle]
        }
      });
    } else if (headerType === 'document' && mediaHandle) {
      components.push({
        type: 'HEADER',
        format: 'DOCUMENT',
        example: {
          header_handle: [mediaHandle]
        }
      });
    }


    const bodyComponent: any = {
      type: 'BODY',
      text: content,
    };


    if (variables && variables.length > 0) {
      bodyComponent.example = {
        body_text: [variables.map((_v: any, i: number) => `Example ${i + 1}`)]
      };
    }

    components.push(bodyComponent);


    if (footerText) {
      components.push({
        type: 'FOOTER',
        text: footerText,
      });
    }


    let whatsappTemplateId: string | undefined;
    let whatsappTemplateStatus = 'pending';

    try {
      const whatsappApiUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${wabaId}/message_templates`;


      const categoryUppercase = (whatsappTemplateCategory || 'utility').toUpperCase();

      const templatePayload = {
        name,
        language: whatsappTemplateLanguage || 'en',
        category: categoryUppercase,
        components,
      };

      logger.info('whatsapp-templates', 'Submitting template to WhatsApp API', {
        name,
        wabaId,
        category: categoryUppercase,
        language: whatsappTemplateLanguage || 'en',
        componentsCount: components.length,
        payload: JSON.stringify(templatePayload, null, 2)
      });

      const response = await axios.post(whatsappApiUrl, templatePayload, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000, // 60 second timeout
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      if (response.data && response.data.id) {
        whatsappTemplateId = response.data.id;

        whatsappTemplateStatus = (response.data.status || 'pending').toLowerCase();

        logger.info('whatsapp-templates', 'Template submitted successfully', {
          templateId: whatsappTemplateId,
          status: whatsappTemplateStatus,
          response: response.data
        });


        try {
          const templateDetailsUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${whatsappTemplateId}?fields=id,name,status,category,language`;
          const detailsResponse = await axios.get(templateDetailsUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
            timeout: 30000, // 30 second timeout
          });

          if (detailsResponse.data && detailsResponse.data.status) {

            whatsappTemplateStatus = detailsResponse.data.status.toLowerCase();
            logger.info('whatsapp-templates', 'Fetched template status', {
              templateId: whatsappTemplateId,
              status: whatsappTemplateStatus,
              details: detailsResponse.data
            });
          }
        } catch (statusError: any) {
          logger.warn('whatsapp-templates', 'Could not fetch template status, using default', {
            error: statusError.message,
            defaultStatus: whatsappTemplateStatus
          });
        }
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || error.message;
      const errorDetails = error.response?.data?.error || error.response?.data || {};
      const errorSubcode = error.response?.data?.error?.error_subcode;


      const isNetworkError = error.code === 'ECONNABORTED' ||
                            error.code === 'ECONNRESET' ||
                            error.message?.includes('socket hang up') ||
                            error.message?.includes('timeout');

      logger.error('whatsapp-templates', 'Error submitting template to WhatsApp API', {
        message: errorMessage,
        errorCode: error.response?.data?.error?.code || error.code,
        errorType: error.response?.data?.error?.type,
        errorSubcode: errorSubcode,
        fullError: JSON.stringify(errorDetails, null, 2),
        statusCode: error.response?.status,
        isNetworkError,
        stack: error.stack
      });


      if (errorSubcode === 2388023) {

        return res.status(400).json({
          error: 'A template with this name is currently being deleted. Please wait 1-2 minutes before creating a new template with the same name, or use a different name.',
          errorCode: errorSubcode,
          errorType: 'template_deletion_in_progress'
        });
      }

      if (errorSubcode === 2388024) {

        return res.status(400).json({
          error: 'A template with this name and language already exists. Please use a different name or delete the existing template first.',
          errorCode: errorSubcode,
          errorType: 'template_already_exists'
        });
      }

      if (errorSubcode === 2494102) {

        return res.status(400).json({
          error: 'Failed to upload media. Please try again or use a different image.',
          errorCode: errorSubcode,
          errorType: 'invalid_media_handle'
        });
      }


      if (isNetworkError) {
        logger.warn('whatsapp-templates', 'Network error during template submission, checking if template exists', {
          templateName: name
        });


        try {
          const checkUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${wabaId}/message_templates?name=${encodeURIComponent(name)}`;
          const checkResponse = await axios.get(checkUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
            timeout: 10000,
          });


          if (checkResponse.data?.data && Array.isArray(checkResponse.data.data)) {
            const existingTemplate = checkResponse.data.data.find((t: any) =>
              t.name === name && t.language === (whatsappTemplateLanguage || 'en')
            );

            if (existingTemplate) {
              whatsappTemplateId = existingTemplate.id;

              whatsappTemplateStatus = (existingTemplate.status || 'pending').toLowerCase();
              logger.info('whatsapp-templates', 'Found existing template after network error', {
                templateId: whatsappTemplateId,
                status: whatsappTemplateStatus
              });
            } else {
              whatsappTemplateStatus = 'pending';
            }
          } else {
            whatsappTemplateStatus = 'pending';
          }
        } catch (checkError: any) {
          logger.warn('whatsapp-templates', 'Could not verify template creation after network error', {
            error: checkError.message
          });
          whatsappTemplateStatus = 'pending';
        }
      } else {

        whatsappTemplateStatus = 'rejected';
      }
    }


    const newTemplate = await db
      .insert(campaignTemplates)
      .values({
        companyId: user.companyId,
        createdById: user.id,
        connectionId: connectionId,
        name,
        description: description || null,
        category: 'whatsapp',
        whatsappTemplateCategory: whatsappTemplateCategory || 'utility',
        whatsappTemplateStatus: whatsappTemplateStatus as 'pending' | 'approved' | 'rejected' | 'disabled',
        whatsappTemplateId: whatsappTemplateId || null,
        whatsappTemplateName: name,
        whatsappTemplateLanguage: whatsappTemplateLanguage || 'en',
        content,
        variables: variables || [],
        mediaUrls: headerMediaUrl ? [headerMediaUrl] : [],
        mediaHandle: mediaHandle || null, // Store the WhatsApp media handle for reuse in campaigns
        channelType: 'whatsapp',
        whatsappChannelType: 'official',
        isActive: true,
        usageCount: 0,
      })
      .returning();

    res.status(201).json(newTemplate[0]);
  } catch (error) {
    logger.error('whatsapp-templates', 'Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

/**
 * Update a template (limited fields)
 */
router.patch('/:id', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_TEMPLATES), async (req, res) => {
  try {
    const user = req.user as any;
    const templateId = parseInt(req.params.id);

    if (!user || !user.companyId) {
      return res.status(403).json({ error: 'No company association found' });
    }

    const { description, isActive } = req.body;


    const existingTemplate = await db
      .select()
      .from(campaignTemplates)
      .where(
        and(
          eq(campaignTemplates.id, templateId),
          eq(campaignTemplates.companyId, user.companyId)
        )
      )
      .limit(1);

    if (!existingTemplate || existingTemplate.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }


    const updatedTemplate = await db
      .update(campaignTemplates)
      .set({
        description: description !== undefined ? description : existingTemplate[0].description,
        isActive: isActive !== undefined ? isActive : existingTemplate[0].isActive,
        updatedAt: new Date(),
      })
      .where(eq(campaignTemplates.id, templateId))
      .returning();

    res.json(updatedTemplate[0]);
  } catch (error) {
    logger.error('whatsapp-templates', 'Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

/**
 * Delete a template
 */
router.delete('/:id', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_TEMPLATES), async (req, res) => {
  try {
    const user = req.user as any;
    const templateId = parseInt(req.params.id);

    if (!user || !user.companyId) {
      return res.status(403).json({ error: 'No company association found' });
    }


    const existingTemplate = await db
      .select()
      .from(campaignTemplates)
      .where(
        and(
          eq(campaignTemplates.id, templateId),
          eq(campaignTemplates.companyId, user.companyId)
        )
      )
      .limit(1);

    if (!existingTemplate || existingTemplate.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }


    await db
      .delete(campaignTemplates)
      .where(eq(campaignTemplates.id, templateId));

    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (error) {
    logger.error('whatsapp-templates', 'Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

/**
 * Sync template status with WhatsApp API
 * POST /api/whatsapp-templates/:id/sync-status
 */
router.post('/:id/sync-status', ensureAuthenticated, async (req, res) => {
  try {
    const user = (req as any).user;
    const templateId = parseInt(req.params.id);

    if (!user.companyId) {
      return res.status(403).json({ error: 'No company association found' });
    }


    const template = await db
      .select()
      .from(campaignTemplates)
      .where(
        and(
          eq(campaignTemplates.id, templateId),
          eq(campaignTemplates.companyId, user.companyId)
        )
      )
      .limit(1);

    if (!template || template.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }


    await syncSpecificTemplates([templateId]);


    const updatedTemplate = await db
      .select()
      .from(campaignTemplates)
      .where(eq(campaignTemplates.id, templateId))
      .limit(1);

    res.json({
      message: 'Template status synced successfully',
      template: updatedTemplate[0]
    });
  } catch (error) {
    logger.error('whatsapp-templates', 'Error syncing template status:', error);
    res.status(500).json({ error: 'Failed to sync template status' });
  }
});

/**
 * Fetch and sync all templates from WhatsApp API
 * POST /api/whatsapp-templates/sync-from-meta
 */
router.post('/sync-from-meta', ensureAuthenticated, async (req, res) => {
  let whatsappChannel: any[] | null = null;
  let fetchMethod: 'business' | 'waba' | 'unknown' = 'unknown'; // Track which fetch method was used
  
  try {
    const user = (req as any).user;
    const { connectionId } = req.body;

    if (!user.companyId) {
      return res.status(403).json({ error: 'No company association found' });
    }

    if (!connectionId) {
      return res.status(400).json({ error: 'Connection ID is required' });
    }


    whatsappChannel = await db
      .select()
      .from(channelConnections)
      .where(
        and(
          eq(channelConnections.id, connectionId),
          eq(channelConnections.companyId, user.companyId)
        )
      )
      .limit(1);

    if (!whatsappChannel || whatsappChannel.length === 0) {
      return res.status(404).json({ error: 'WhatsApp connection not found' });
    }


    const channelType = whatsappChannel[0].channelType;
    if (channelType !== 'whatsapp' && channelType !== 'whatsapp_official') {
      return res.status(400).json({ error: 'Selected connection is not a WhatsApp connection' });
    }

    const connectionData = whatsappChannel[0].connectionData as any;
    

    logger.info('whatsapp-templates', 'Connection data structure for template sync', {
      connectionId,
      connectionDataKeys: Object.keys(connectionData || {}),
      connectionData: {
        wabaId: connectionData?.wabaId,
        businessAccountId: connectionData?.businessAccountId,
        waba_id: connectionData?.waba_id,
        accessToken: connectionData?.accessToken ? '***REDACTED***' : undefined,
        access_token: connectionData?.access_token ? '***REDACTED***' : undefined,
        appId: connectionData?.appId,
        app_id: connectionData?.app_id,
        phoneNumberId: connectionData?.phoneNumberId,
        phone_number_id: connectionData?.phone_number_id,
        partnerManaged: connectionData?.partnerManaged
      }
    });
    
    let wabaId = connectionData.wabaId || connectionData.businessAccountId || connectionData.waba_id;
    const originalAccessToken = connectionData.accessToken || connectionData.access_token;
    let accessToken = originalAccessToken;
    const appId = connectionData.appId || connectionData.app_id;
    const partnerManaged = connectionData.partnerManaged === true;
    const businessId = connectionData.businessId; // Extract business_id for business-level template fetching
    let tokenSource: 'connection' | 'partner-config' = 'connection';
    

    

    if (partnerManaged) {
      logger.info('whatsapp-templates', 'Detected embedded signup (partner-managed) connection', {
        connectionId,
        hasConnectionToken: !!accessToken,
        wabaId,
        hasBusinessId: !!businessId
      });
    }
    

    if (partnerManaged || !accessToken) {
      try {
        const partnerConfig = await storage.getPartnerConfiguration('meta');
        if (partnerConfig?.accessToken) {

          if (accessToken !== partnerConfig.accessToken) {
            tokenSource = 'partner-config';
            logger.info('whatsapp-templates', 'Using partner configuration access token', {
              connectionId,
              partnerManaged,
              hadConnectionToken: !!accessToken,
              usingPartnerToken: true,
              tokenSource: 'partner-config'
            });
            accessToken = partnerConfig.accessToken;
          } else {
            logger.info('whatsapp-templates', 'Partner config token matches connection token', {
              connectionId,
              partnerManaged,
              tokenSource: 'connection'
            });
          }
        } else if (!accessToken) {
          logger.warn('whatsapp-templates', 'No access token found in connection or partner config', {
            connectionId,
            partnerManaged,
            hasPartnerConfig: !!partnerConfig
          });
        }
      } catch (partnerConfigError: any) {
        logger.error('whatsapp-templates', 'Error fetching partner configuration', {
          connectionId,
          error: partnerConfigError.message
        });
      }
    }

    if (!wabaId || !accessToken) {
      const errorMessage = partnerManaged 
        ? 'WhatsApp Business Account ID or access token not found. Embedded signup connections may require system-level access token in partner configuration.'
        : 'WhatsApp Business Account ID or access token not found in connection';
      
      logger.error('whatsapp-templates', 'Missing credentials for template sync', {
        connectionId,
        hasWabaId: !!wabaId,
        hasAccessToken: !!accessToken,
        partnerManaged
      });
      
      return res.status(400).json({
        error: errorMessage
      });
    }
    

    const safeTokenPrefix = (typeof accessToken === 'string' && accessToken.length > 0)
      ? accessToken.slice(0, 10) + '...'
      : 'UNKNOWN';
    
    logger.info('whatsapp-templates', 'Fetching templates from Meta API', {
      wabaId,
      connectionId,
      tokenSource,
      tokenPrefix: safeTokenPrefix,
      partnerManaged,
      hasAppId: !!appId
    });


    let metaTemplates: any[] = [];
    fetchMethod = 'waba'; // Initialize to default, will be updated based on which method succeeds

    if (partnerManaged && businessId) {
      try {
        logger.info('whatsapp-templates', 'Attempting business-level template fetch', {
          businessId,
          wabaId,
          connectionId
        });

        const businessTemplatesUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${businessId}/message_templates?fields=id,name,status,category,language,components&limit=250`;
        
        const businessResponse = await axios.get(businessTemplatesUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
          timeout: 30000,
        });

        if (businessResponse.data?.data && businessResponse.data.data.length > 0) {
          metaTemplates = businessResponse.data.data;
          fetchMethod = 'business';
          logger.info('whatsapp-templates', 'Successfully fetched templates from business', {
            count: metaTemplates.length,
            businessId,
            fetchUrl: businessTemplatesUrl.replace(accessToken, 'REDACTED'),
            connectionType: 'embedded-signup',
            firstTemplate: metaTemplates.length > 0 ? {
              id: metaTemplates[0].id,
              name: metaTemplates[0].name,
              status: metaTemplates[0].status
            } : null
          });
        } else {

          throw new Error('Business endpoint returned no templates');
        }
      } catch (businessFetchError: any) {
        logger.warn('whatsapp-templates', 'Business-level fetch failed, falling back to WABA', {
          businessId,
          wabaId,
          error: businessFetchError.message,
          statusCode: businessFetchError.response?.status,
          errorDetails: businessFetchError.response?.data
        });

      }
    }


    if (metaTemplates.length === 0) {

      const templatesUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${wabaId}/message_templates?fields=id,name,status,category,language,components&limit=250`;
      logger.info('whatsapp-templates', 'Meta API request details (WABA-level)', {
        url: templatesUrl.replace(accessToken, 'REDACTED'),
        wabaId,
        apiVersion: WHATSAPP_API_VERSION,
        tokenSource,
        partnerManaged,
        wasBusinessFetchAttempted: partnerManaged && !!businessId,
        reason: partnerManaged && !businessId 
          ? 'No businessId in connectionData' 
          : partnerManaged && businessId 
            ? 'Business fetch failed or returned no templates' 
            : 'Not a partner-managed connection',
        businessIdAvailable: !!businessId
      });

      let response;
      try {
        response = await axios.get(templatesUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
          timeout: 30000,
        });

        metaTemplates = response.data?.data || [];
        fetchMethod = 'waba';


        logger.info('whatsapp-templates', 'Fetched templates from Meta (WABA-level)', {
          count: metaTemplates.length,
          responseStatus: response.status,
          hasData: !!response.data?.data,
          firstTemplate: metaTemplates.length > 0 ? {
            id: metaTemplates[0].id,
            name: metaTemplates[0].name,
            status: metaTemplates[0].status,
            category: metaTemplates[0].category
          } : null
        });
      } catch (apiError: any) {

        const errorStatus = apiError.response?.status;
        const errorData = apiError.response?.data;
        const errorMessage = errorData?.error?.message || apiError.message;
        const errorCode = errorData?.error?.code;
        const errorType = errorData?.error?.type;
        const errorSubcode = errorData?.error?.error_subcode;
      


        const isBusinessNodeError = errorCode === 100 && errorMessage && 
            errorMessage.includes('message_templates') && 
            (errorMessage.toLowerCase().includes('business') || 
             errorMessage.toLowerCase().includes('node type'));
        
        if (isBusinessNodeError) {
          logger.info('whatsapp-templates', 'Detected code 100 error - treating wabaId as Business Manager ID', {
            connectionId,
            currentWabaId: wabaId,
            errorMessage,
            errorCode
          });

          try {

            const businessManagerId = wabaId;
            let resolvedWabaId: string | null = null;


            try {
              const ownedWabaUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${businessManagerId}/owned_whatsapp_business_accounts?access_token=${accessToken}`;
              logger.info('whatsapp-templates', 'Attempting to resolve WABA from owned accounts', {
                businessManagerId,
                url: ownedWabaUrl.replace(accessToken, 'REDACTED')
              });

              const ownedResponse = await axios.get(ownedWabaUrl, {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                },
                timeout: 30000,
              });

              if (ownedResponse.data?.data && Array.isArray(ownedResponse.data.data) && ownedResponse.data.data.length > 0) {
                resolvedWabaId = ownedResponse.data.data[0].id;
                logger.info('whatsapp-templates', 'Resolved WABA ID from owned accounts', {
                  businessManagerId,
                  resolvedWabaId
                });
              }
            } catch (ownedError: any) {
              logger.warn('whatsapp-templates', 'Failed to fetch owned WABA accounts', {
                businessManagerId,
                error: ownedError.message,
                statusCode: ownedError.response?.status
              });
            }


            if (!resolvedWabaId) {
              try {
                const clientWabaUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${businessManagerId}/client_whatsapp_business_accounts?access_token=${accessToken}`;
                logger.info('whatsapp-templates', 'Attempting to resolve WABA from client accounts', {
                  businessManagerId,
                  url: clientWabaUrl.replace(accessToken, 'REDACTED')
                });

                const clientResponse = await axios.get(clientWabaUrl, {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                  },
                  timeout: 30000,
                });

                if (clientResponse.data?.data && Array.isArray(clientResponse.data.data) && clientResponse.data.data.length > 0) {
                  resolvedWabaId = clientResponse.data.data[0].id;
                  logger.info('whatsapp-templates', 'Resolved WABA ID from client accounts', {
                    businessManagerId,
                    resolvedWabaId
                  });
                }
              } catch (clientError: any) {
                logger.warn('whatsapp-templates', 'Failed to fetch client WABA accounts', {
                  businessManagerId,
                  error: clientError.message,
                  statusCode: clientError.response?.status
                });
              }
            }


            if (resolvedWabaId) {
              logger.info('whatsapp-templates', 'Updating connection data with resolved WABA ID', {
                connectionId,
                oldWabaId: wabaId,
                newWabaId: resolvedWabaId,
                businessManagerId
              });


              const updatedConnectionData = {
                ...connectionData,
                wabaId: resolvedWabaId,
                businessAccountId: resolvedWabaId,
                waba_id: resolvedWabaId,
                businessId: businessManagerId // Also store the Business Manager ID for future reference
              };

              await storage.updateChannelConnection(connectionId, {
                connectionData: updatedConnectionData
              });


              logger.info('whatsapp-templates', 'Retrying template fetch with resolved WABA ID', {
                connectionId,
                resolvedWabaId
              });

              const retryTemplatesUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${resolvedWabaId}/message_templates?fields=id,name,status,category,language,components&limit=250`;
              const retryResponse = await axios.get(retryTemplatesUrl, {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                },
                timeout: 30000,
              });

              metaTemplates = retryResponse.data?.data || [];
              fetchMethod = 'waba';
              

              wabaId = resolvedWabaId;
              
              logger.info('whatsapp-templates', 'Successfully fetched templates after WABA ID resolution', {
                count: metaTemplates.length,
                originalBusinessManagerId: businessManagerId,
                resolvedWabaId
              });


            } else {

              logger.error('whatsapp-templates', 'Could not resolve WABA ID from Business Manager', {
                connectionId,
                businessManagerId: wabaId,
                errorMessage
              });

              return res.status(400).json({
                error: 'Unable to resolve WhatsApp Business Account ID. The provided ID appears to be a Business Manager ID. Please reconnect your WhatsApp account to ensure the correct WABA ID is stored.',
                details: errorMessage,
                errorCode,
                errorType,
                errorSubcode,
                partnerManaged,
                fetchMethod: 'waba',
                suggestion: 'Please disconnect and reconnect your WhatsApp account to update the connection with the correct WABA ID.'
              });
            }
          } catch (resolutionError: any) {
            logger.error('whatsapp-templates', 'Error during WABA ID resolution fallback', {
              connectionId,
              businessManagerId: wabaId,
              error: resolutionError.message,
              stack: resolutionError.stack
            });

            return res.status(500).json({
              error: 'Failed to resolve WhatsApp Business Account ID. Please reconnect your WhatsApp account.',
              details: resolutionError.message,
              errorCode,
              errorType,
              errorSubcode,
              partnerManaged,
              fetchMethod: 'waba'
            });
          }
        } else {

          logger.error('whatsapp-templates', 'Meta API error during template fetch (WABA-level)', {
            connectionId,
            wabaId,
            statusCode: errorStatus,
            errorMessage,
            errorCode,
            errorType,
            errorSubcode,
            fullErrorResponse: JSON.stringify(errorData, null, 2),
            partnerManaged,
            tokenSource,
            wasBusinessFetchAttempted: partnerManaged && !!businessId,
            suggestions: {
              invalidToken: errorStatus === 401 ? 'Access token may be invalid or expired' : null,
              insufficientPermissions: errorStatus === 403 ? 'Access token may lack whatsapp_business_management permission scope' : null,
              wabaNotFound: errorStatus === 404 ? 'WABA ID may be incorrect or account not found' : null,
              partnerManagedIssue: partnerManaged && (errorStatus === 401 || errorStatus === 403) 
                ? 'Embedded signup connections may require system-level access token. Please verify partner configuration has valid token with template management permissions.'
                : null
            }
          });
        

          let userFriendlyError = 'Failed to sync templates from Meta';
          if (errorStatus === 401) {
            userFriendlyError = partnerManaged
              ? 'Authentication failed. Embedded signup connections may require system-level access token. Please verify partner configuration.'
              : 'Authentication failed. Access token may be invalid or expired.';
          } else if (errorStatus === 403) {
            userFriendlyError = partnerManaged
              ? 'Permission denied. Embedded signup connections may require system-level access token with whatsapp_business_management permission scope. Please verify partner configuration.'
              : 'Permission denied. Access token may lack required permissions for template management.';
          } else if (errorStatus === 404) {
            userFriendlyError = 'WhatsApp Business Account not found. Please verify the connection configuration.';
          } else if (errorMessage) {
            userFriendlyError = `Failed to sync templates: ${errorMessage}`;
          }
          
          return res.status(errorStatus || 500).json({
            error: userFriendlyError,
            details: errorMessage,
            errorCode,
            errorType,
            errorSubcode,
            partnerManaged,
            fetchMethod: 'waba'
          });
        }
      }
    }


    logger.info('whatsapp-templates', 'Template fetch completed', {
      method: fetchMethod,
      count: metaTemplates.length,
      connectionId,
      businessId: fetchMethod === 'business' ? businessId : undefined,
      wabaId: fetchMethod === 'waba' ? wabaId : undefined,
      recommendation: fetchMethod === 'waba' && partnerManaged && !businessId 
        ? 'Connection missing businessId - may show incomplete templates. Reconnect to fix.' 
        : null
    });

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const metaTemplate of metaTemplates) {
      try {

        const existingTemplate = await db
          .select()
          .from(campaignTemplates)
          .where(
            and(
              eq(campaignTemplates.whatsappTemplateId, metaTemplate.id),
              eq(campaignTemplates.companyId, user.companyId)
            )
          )
          .limit(1);

        const status = (metaTemplate.status || 'pending').toLowerCase();

        if (existingTemplate && existingTemplate.length > 0) {

          let mediaHandle: string | undefined;
          const mediaUrls: string[] = [];
          let headerFormat: string | undefined;

          if (metaTemplate.components && Array.isArray(metaTemplate.components)) {
            for (const component of metaTemplate.components) {
              if (component.type === 'HEADER') {
                headerFormat = component.format;
                

                if (headerFormat && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat)) {

                  if (component.example?.header_handle && Array.isArray(component.example.header_handle)) {
                    const handleValue = component.example.header_handle[0];


                    if (handleValue && !handleValue.startsWith('http://') && !handleValue.startsWith('https://')) {
                      mediaHandle = handleValue;
                    } else if (handleValue) {

                      mediaUrls.push(handleValue);
                    }
                  }
                  

                  if (component.example?.header_url && Array.isArray(component.example.header_url)) {
                    const url = component.example.header_url[0];
                    if (url) {
                      mediaUrls.push(url);
                    }
                  }
                  

                  if (component.url) {
                    mediaUrls.push(component.url);
                  }
                }
              }
            }
          }

          await db
            .update(campaignTemplates)
            .set({
              whatsappTemplateStatus: status as 'pending' | 'approved' | 'rejected' | 'disabled',
              whatsappTemplateCategory: metaTemplate.category?.toLowerCase() || 'utility',
              mediaUrls: mediaUrls.length > 0 ? mediaUrls : existingTemplate[0].mediaUrls,
              mediaHandle: mediaHandle || existingTemplate[0].mediaHandle,
            })
            .where(eq(campaignTemplates.id, existingTemplate[0].id));

          updatedCount++;
          logger.info('whatsapp-templates', 'Updated existing template', {
            templateId: metaTemplate.id,
            name: metaTemplate.name,
            status,
            hasMediaHandle: !!mediaHandle,
            hasMediaUrls: mediaUrls.length > 0,
            headerFormat
          });
        } else {


          let content = '';
          let headerText = '';
          let mediaHandle: string | undefined;
          const mediaUrls: string[] = [];
          let headerFormat: string | undefined;

          if (metaTemplate.components && Array.isArray(metaTemplate.components)) {
            for (const component of metaTemplate.components) {
              if (component.type === 'HEADER') {
                headerText = component.text || '';
                headerFormat = component.format;
                

                if (headerFormat && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat)) {

                  if (component.example?.header_handle && Array.isArray(component.example.header_handle)) {
                    const handleValue = component.example.header_handle[0];


                    if (handleValue && !handleValue.startsWith('http://') && !handleValue.startsWith('https://')) {
                      mediaHandle = handleValue;
                      logger.info('whatsapp-templates', 'Found media handle (ID) in template', {
                        templateId: metaTemplate.id,
                        templateName: metaTemplate.name,
                        mediaHandle,
                        format: headerFormat
                      });
                    } else if (handleValue) {

                      mediaUrls.push(handleValue);
                      logger.info('whatsapp-templates', 'Found media URL in header_handle', {
                        templateId: metaTemplate.id,
                        templateName: metaTemplate.name,
                        url: handleValue,
                        format: headerFormat
                      });
                    }
                  }
                  

                  if (component.example?.header_url && Array.isArray(component.example.header_url)) {
                    const url = component.example.header_url[0];
                    if (url) {
                      mediaUrls.push(url);
                      logger.info('whatsapp-templates', 'Found media URL in template', {
                        templateId: metaTemplate.id,
                        templateName: metaTemplate.name,
                        url,
                        format: headerFormat
                      });
                    }
                  }
                  

                  if (component.url) {
                    mediaUrls.push(component.url);
                    logger.info('whatsapp-templates', 'Found media URL directly in component', {
                      templateId: metaTemplate.id,
                      templateName: metaTemplate.name,
                      url: component.url,
                      format: headerFormat
                    });
                  }
                }
                
                if (headerText) {
                  content += headerText + '\n\n';
                }
              } else if (component.type === 'BODY') {
                content += component.text || '';
              } else if (component.type === 'FOOTER') {
                content += '\n\n' + (component.text || '');
              }
            }
          }

          await db
            .insert(campaignTemplates)
            .values({
              companyId: user.companyId,
              createdById: user.id,
              connectionId: connectionId,
              name: metaTemplate.name,
              description: `Synced from Meta - ${metaTemplate.category || 'Template'}`,
              category: 'whatsapp',
              whatsappTemplateCategory: metaTemplate.category?.toLowerCase() || 'utility',
              whatsappTemplateStatus: status as 'pending' | 'approved' | 'rejected' | 'disabled',
              whatsappTemplateId: metaTemplate.id,
              whatsappTemplateName: metaTemplate.name,
              whatsappTemplateLanguage: metaTemplate.language || 'en',
              content: content || 'Template content',
              variables: [],
              mediaUrls: mediaUrls,
              mediaHandle: mediaHandle,
              channelType: 'whatsapp',
              whatsappChannelType: 'official',
              isActive: true,
              usageCount: 0,
            });

          createdCount++;
          logger.info('whatsapp-templates', 'Created new template from Meta', {
            templateId: metaTemplate.id,
            name: metaTemplate.name,
            status,
            hasMediaHandle: !!mediaHandle,
            hasMediaUrls: mediaUrls.length > 0,
            headerFormat
          });
        }
      } catch (error: any) {
        logger.error('whatsapp-templates', 'Error syncing individual template', {
          templateId: metaTemplate.id,
          name: metaTemplate.name,
          error: error.message
        });
        skippedCount++;
      }
    }

    res.json({
      message: 'Templates synced successfully',
      summary: {
        total: metaTemplates.length,
        created: createdCount,
        updated: updatedCount,
        skipped: skippedCount
      },
      connectionType: {
        partnerManaged: partnerManaged || false
      },
      fetchMethod: fetchMethod // Include fetch method for frontend display
    });
  } catch (error: any) {


    let connectionData: any = null;
    let partnerManaged = false;
    try {
      if (whatsappChannel && whatsappChannel.length > 0) {
        connectionData = whatsappChannel[0].connectionData as any;
        partnerManaged = connectionData?.partnerManaged === true;
      }
    } catch {

    }
    
    logger.error('whatsapp-templates', 'Error syncing templates from Meta', {
      connectionId: req.body?.connectionId,
      error: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status,
      partnerManaged,
      hasConnectionData: !!connectionData
    });
    

    let errorMessage = 'Failed to sync templates from Meta';
    if (error.response?.status === 401 || error.response?.status === 403) {
      errorMessage = partnerManaged
        ? 'Authentication or permission error. Embedded signup connections may require system-level access token. Please verify partner configuration.'
        : 'Authentication or permission error. Please verify the connection has valid credentials with template management permissions.';
    } else if (error.message) {
      errorMessage = `Failed to sync templates: ${error.message}`;
    }
    
    res.status(error.response?.status || 500).json({
      error: errorMessage,
      details: error.message,
      errorCode: error.response?.data?.error?.code,
      errorType: error.response?.data?.error?.type,
      partnerManaged,
      fetchMethod // Include fetch method for frontend error handling
    });
  }
});

export default router;

