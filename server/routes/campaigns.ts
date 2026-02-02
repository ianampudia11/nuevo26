import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import { CampaignService } from '../services/campaignService.js';
import { requirePermission, requireAnyPermission } from '../middleware.js';
import { db } from '../db.js';
import { campaigns, campaignRecipients, campaignQueue, campaignMessages, contacts, channelConnections, whatsappAccounts } from '../../shared/schema.js';
import { eq, sql, and, desc, inArray } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import { createObjectCsvWriter } from 'csv-writer';
import { tmpdir } from 'os';
import { join } from 'path';

const router = Router();
const campaignService = new CampaignService();


const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};


const MEDIA_DIR = path.join(process.cwd(), 'media');
const upload = multer({
  dest: path.join(MEDIA_DIR, 'temp'),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/webp',
      'video/mp4', 'video/3gpp',
      'audio/mpeg', 'audio/aac', 'audio/ogg',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  }
});






router.get('/', requireAnyPermission(['view_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const filters = {
      status: req.query.status as string,
      channel_type: req.query.channel_type as string,
      search: req.query.search as string,
      sort_field: req.query.sort_field as string,
      sort_order: req.query.sort_order as 'asc' | 'desc',
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
    };

    const campaigns = await campaignService.getCampaigns(companyId, filters);
    res.json({ success: true, data: campaigns });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.get('/stats', requireAnyPermission(['view_campaigns', 'view_campaign_analytics']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const stats = await campaignService.getCampaignStats(companyId);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching campaign stats:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.post('/', requireAnyPermission(['create_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;

    if (!companyId || !userId) {
      return res.status(400).json({ success: false, error: 'Company ID and User ID required' });
    }


    const campaignData = { ...req.body };


    if (campaignData.scheduledAt && typeof campaignData.scheduledAt === 'string') {
      const scheduledDate = new Date(campaignData.scheduledAt);
      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid scheduled date format' });
      }
      campaignData.scheduledAt = scheduledDate;
    }


    if (campaignData.scheduledAt === '') {
      campaignData.scheduledAt = null;
    }

    const campaign = await campaignService.createCampaign(companyId, userId, campaignData);
    res.json({ success: true, data: campaign });
  } catch (error) {
    console.error('Error creating campaign:', error);
    const errorMessage = getErrorMessage(error);

    if (errorMessage.includes('Validation failed') || errorMessage.includes('recurring daily')) {
      res.status(400).json({ success: false, error: errorMessage });
    } else {
      res.status(500).json({ success: false, error: errorMessage });
    }
  }
});






router.get('/templates', requireAnyPermission(['view_campaigns', 'manage_templates']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const filters = {
      category: req.query.category as string,
      channel_type: req.query.channel_type as string,
      is_active: req.query.is_active ? req.query.is_active === 'true' : undefined
    };

    const templates = await campaignService.getTemplates(companyId, filters);
    res.json({ success: true, data: templates });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.post('/templates', requireAnyPermission(['manage_templates']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;

    if (!companyId || !userId) {
      return res.status(400).json({ success: false, error: 'Company ID and User ID required' });
    }

    const template = await campaignService.createTemplate(companyId, userId, req.body);
    res.json({ success: true, data: template });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.get('/templates/:id', requireAnyPermission(['view_campaigns', 'manage_templates']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const templateId = parseInt(req.params.id);

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const template = await campaignService.getTemplate(companyId, templateId);
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, data: template });
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.put('/templates/:id', requireAnyPermission(['manage_templates']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    const templateId = parseInt(req.params.id);

    if (!companyId || !userId) {
      return res.status(400).json({ success: false, error: 'Company ID and User ID required' });
    }

    const template = await campaignService.updateTemplate(companyId, userId, templateId, req.body);
    res.json({ success: true, data: template });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.delete('/templates/:id', requireAnyPermission(['manage_templates']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    const templateId = parseInt(req.params.id);

    if (!companyId || !userId) {
      return res.status(400).json({ success: false, error: 'Company ID and User ID required' });
    }

    await campaignService.deleteTemplate(companyId, userId, templateId);
    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.post('/templates/upload-media', requireAnyPermission(['manage_templates']), upload.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const file = req.file;
    const fileType = file.mimetype.split('/')[0]; // image, video, audio, application


    let mediaType: string;
    if (fileType === 'image') mediaType = 'image';
    else if (fileType === 'video') mediaType = 'video';
    else if (fileType === 'audio') mediaType = 'audio';
    else mediaType = 'document';


    const uniqueId = crypto.createHash('md5').update(`${Date.now()}-${file.originalname}`).digest('hex');
    const fileExt = path.extname(file.originalname);
    const filename = `${uniqueId}${fileExt}`;


    const mediaTypeDir = path.join(MEDIA_DIR, mediaType);
    await fs.ensureDir(mediaTypeDir);


    const finalPath = path.join(mediaTypeDir, filename);
    await fs.move(file.path, finalPath);


    const mediaUrl = `/media/${mediaType}/${filename}`;

    res.json({
      success: true,
      data: {
        url: mediaUrl,
        type: mediaType,
        filename: file.originalname,
        size: file.size
      }
    });
  } catch (error) {
    console.error('Error uploading media:', error);


    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting temp file:', unlinkError);
      }
    }

    res.status(500).json({ success: false, error: 'Failed to upload media' });
  }
});






router.get('/segments', requireAnyPermission(['view_campaigns', 'manage_segments']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const segments = await campaignService.getSegments(companyId);
    res.json({ success: true, data: segments });
  } catch (error) {
    console.error('Error fetching segments:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.post('/segments', requireAnyPermission(['manage_segments']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;

    if (!companyId || !userId) {
      return res.status(400).json({ success: false, error: 'Company ID and User ID required' });
    }


    const { excludedContactIds, ...segmentData } = req.body;
    const segment = await campaignService.createSegment(companyId, userId, segmentData, excludedContactIds);
    res.json({ success: true, data: segment });
  } catch (error) {
    console.error('Error creating segment:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.get('/segments/:id', requireAnyPermission(['view_campaigns', 'manage_segments']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const segmentId = parseInt(req.params.id);

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const segment = await campaignService.getSegment(companyId, segmentId);
    if (!segment) {
      return res.status(404).json({ success: false, error: 'Segment not found' });
    }

    res.json({ success: true, data: segment });
  } catch (error) {
    console.error('Error fetching segment:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.put('/segments/:id', requireAnyPermission(['manage_segments']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    const segmentId = parseInt(req.params.id);

    if (!companyId || !userId) {
      return res.status(400).json({ success: false, error: 'Company ID and User ID required' });
    }

    const segment = await campaignService.updateSegment(companyId, userId, segmentId, req.body);
    res.json({ success: true, data: segment });
  } catch (error) {
    console.error('Error updating segment:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.delete('/segments/:id', requireAnyPermission(['manage_segments']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    const segmentId = parseInt(req.params.id);

    if (!companyId || !userId) {
      return res.status(400).json({ success: false, error: 'Company ID and User ID required' });
    }

    await campaignService.deleteSegment(companyId, userId, segmentId);
    res.json({ success: true, message: 'Segment deleted successfully' });
  } catch (error) {
    console.error('Error deleting segment:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.post('/segments/preview', requireAnyPermission(['view_campaigns', 'manage_segments']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const { criteria, includeDetails = false, limit = 50 } = req.body;

    if (!criteria) {
      return res.status(400).json({ success: false, error: 'Criteria is required' });
    }



    const tempSegment = {
      id: 0,
      companyId,
      criteria,
      name: 'preview',
      description: '',
      contactCount: 0,
      createdById: req.user?.id || 0,
      lastUpdatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (includeDetails) {

      const contacts = await campaignService.getContactsBySegmentWithDetails(tempSegment, limit);
      const count = await campaignService.calculateSegmentContactCount(tempSegment);

      res.json({
        success: true,
        data: {
          count,
          contacts,
          hasMore: count > limit
        }
      });
    } else {

      const count = await campaignService.calculateSegmentContactCount(tempSegment);
      res.json({ success: true, data: { count } });
    }
  } catch (error) {
    console.error('Error previewing segment:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});





router.get('/contacts/duplicates', requireAnyPermission(['view_campaigns', 'manage_segments']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const duplicateReport = await campaignService.detectDuplicateContacts(companyId);
    res.json({ success: true, data: duplicateReport });
  } catch (error) {
    console.error('Error detecting duplicate contacts:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});






router.post('/validate-content', requireAnyPermission(['view_campaigns', 'create_campaigns']), async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: 'Content is required' });
    }

    const validation = await campaignService.validateCampaignContent(content);
    res.json({ success: true, data: validation });
  } catch (error) {
    console.error('Error validating content:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

router.post('/validate-whatsapp-content', requireAnyPermission(['view_campaigns', 'create_campaigns']), async (req, res) => {
  try {
    const { content, whatsappChannelType, messageType } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: 'Content is required' });
    }

    const validation = await campaignService.validateCampaignContent(content);
    res.json({ success: true, data: validation });
  } catch (error) {
    console.error('Error validating WhatsApp content:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});




router.get('/:id', requireAnyPermission(['view_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const campaignId = parseInt(req.params.id);

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }

    const campaign = await campaignService.getCampaignById(companyId, campaignId);
    res.json({ success: true, data: campaign });
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.put('/:id', requireAnyPermission(['edit_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const campaignId = parseInt(req.params.id);

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }


    const updateData = { ...req.body };


    if (updateData.scheduledAt && typeof updateData.scheduledAt === 'string') {
      const scheduledDate = new Date(updateData.scheduledAt);
      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid scheduled date format' });
      }
      updateData.scheduledAt = scheduledDate;
    }

    if (updateData.scheduledAt === '') {
      updateData.scheduledAt = null;
    }

    const campaign = await campaignService.updateCampaign(companyId, campaignId, updateData);
    res.json({ success: true, data: campaign });
  } catch (error) {
    console.error('Error updating campaign:', error);
    const errorMessage = getErrorMessage(error);

    if (errorMessage.includes('Validation failed') || errorMessage.includes('recurring daily')) {
      res.status(400).json({ success: false, error: errorMessage });
    } else {
      res.status(500).json({ success: false, error: errorMessage });
    }
  }
});


router.delete('/:id', requireAnyPermission(['delete_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const campaignId = parseInt(req.params.id);

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }

    const result = await campaignService.deleteCampaign(companyId, campaignId);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.post('/:id/start', requireAnyPermission(['edit_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const campaignId = parseInt(req.params.id);

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }

    const result = await campaignService.startCampaign(companyId, campaignId);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error starting campaign:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.post('/:id/pause', requireAnyPermission(['edit_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const campaignId = parseInt(req.params.id);

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }

    const result = await campaignService.pauseCampaign(companyId, campaignId);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error pausing campaign:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.post('/:id/recalculate-stats', requireAnyPermission(['edit_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const campaignId = parseInt(req.params.id);

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }


    const recipientStats = await db.select({
      total: sql`COUNT(*)`,
      sent: sql`COUNT(*) FILTER (WHERE status IN ('sent', 'delivered', 'read'))`,
      failed: sql`COUNT(*) FILTER (WHERE status = 'failed')`,
      pending: sql`COUNT(*) FILTER (WHERE status IN ('pending', 'processing'))`
    })
    .from(campaignRecipients)
    .where(eq(campaignRecipients.campaignId, campaignId));

    const stats = recipientStats[0];
    const totalRecipients = parseInt(String(stats.total)) || 0;
    const successfulSends = parseInt(String(stats.sent)) || 0;
    const failedSends = parseInt(String(stats.failed)) || 0;
    const processedRecipients = successfulSends + failedSends;


    await db.update(campaigns)
      .set({
        totalRecipients,
        processedRecipients,
        successfulSends,
        failedSends,
        updatedAt: new Date()
      })
      .where(eq(campaigns.id, campaignId));


    const updatedCampaign = await campaignService.getCampaignById(companyId, campaignId);

    res.json({
      success: true,
      data: {
        message: 'Campaign statistics recalculated',
        before: { totalRecipients, processedRecipients, successfulSends, failedSends },
        after: updatedCampaign
      }
    });
  } catch (error) {
    console.error('Error recalculating campaign stats:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.post('/:id/resume', requireAnyPermission(['edit_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const campaignId = parseInt(req.params.id);

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }

    const result = await campaignService.resumeCampaign(companyId, campaignId);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error resuming campaign:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.get('/:id/analytics', requireAnyPermission(['view_campaign_analytics']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const campaignId = parseInt(req.params.id);

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }

    const analytics = await campaignService.getCampaignAnalytics(companyId, campaignId);
    res.json({ success: true, data: analytics });
  } catch (error) {
    console.error('Error fetching campaign analytics:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.get('/:id/details', requireAnyPermission(['view_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const campaignId = parseInt(req.params.id);

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }


    const [campaign] = await db.select()
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.companyId, companyId)));

    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }


    let campaignWhatsAppAccounts: Array<{
      id: number;
      accountName: string;
      phoneNumber: string | null;
    }> = [];
    try {
      if (campaign.channelIds && Array.isArray(campaign.channelIds) && campaign.channelIds.length > 0) {
        campaignWhatsAppAccounts = await db.select({
          id: channelConnections.id,
          accountName: channelConnections.accountName,
          phoneNumber: whatsappAccounts.phoneNumber
        })
        .from(channelConnections)
        .leftJoin(whatsappAccounts, eq(channelConnections.id, whatsappAccounts.channelId))
        .where(and(
          inArray(channelConnections.id, campaign.channelIds),
          eq(channelConnections.companyId, companyId)
        ));
      }
    } catch (error) {
      console.error('Error fetching campaign WhatsApp accounts:', error);
      campaignWhatsAppAccounts = [];
    }


    let messageData = await db.select()
      .from(campaignMessages)
      .where(eq(campaignMessages.campaignId, campaignId))
      .orderBy(desc(campaignMessages.createdAt));

    let details = [];

    if (messageData.length > 0) {

      details = await Promise.all(
        messageData.map(async (messageItem) => {
          let contactName = 'Unknown';
          let phoneNumber = 'Unknown';
          let whatsappAccount = 'Unknown';
          let whatsappAccountId = 0;


          if (messageItem.recipientId) {
            try {
              const [recipient] = await db.select()
                .from(campaignRecipients)
                .where(eq(campaignRecipients.id, messageItem.recipientId));

              if (recipient && recipient.contactId) {
                const [contact] = await db.select()
                  .from(contacts)
                  .where(eq(contacts.id, recipient.contactId));

                if (contact) {
                  contactName = contact.name || contact.phone || 'Unknown';
                  phoneNumber = contact.phone || 'Unknown';
                }
              }


              if (recipient) {
                try {
                  const [queueItem] = await db.select({
                    accountId: campaignQueue.accountId
                  })
                  .from(campaignQueue)
                  .where(and(
                    eq(campaignQueue.campaignId, campaignId),
                    eq(campaignQueue.recipientId, recipient.id)
                  ))
                  .limit(1);

                  if (queueItem && queueItem.accountId) {
                    const [account] = await db.select({
                      id: channelConnections.id,
                      accountName: channelConnections.accountName
                    })
                    .from(channelConnections)
                    .where(eq(channelConnections.id, queueItem.accountId));

                    if (account) {
                      whatsappAccount = account.accountName;
                      whatsappAccountId = account.id;
                    }
                  }
                } catch (error) {
                  console.error('Error fetching WhatsApp account from queue:', error);
                }
              }
            } catch (error) {
              console.error('Error fetching contact for recipient:', messageItem.recipientId, error);
            }
          }


          if (whatsappAccount === 'Unknown' && campaignWhatsAppAccounts.length > 0) {
            whatsappAccount = campaignWhatsAppAccounts[0].accountName;
            whatsappAccountId = campaignWhatsAppAccounts[0].id;
          }

          return {
            id: messageItem.id,
            contactName,
            phoneNumber,
            whatsappAccount,
            whatsappAccountId,
            messageStatus: messageItem.status,
            sentAt: messageItem.sentAt,
            messageContent: messageItem.content,
            deliveryStatus: messageItem.whatsappStatus,
            errorMessage: messageItem.errorMessage,
          };
        })
      );
    } else {

      const recipientData = await db.select()
        .from(campaignRecipients)
        .where(eq(campaignRecipients.campaignId, campaignId))
        .orderBy(desc(campaignRecipients.createdAt));

      details = await Promise.all(
        recipientData.map(async (recipient) => {
          let contactName = 'Unknown';
          let phoneNumber = 'Unknown';
          let whatsappAccount = 'Unknown';
          let whatsappAccountId = 0;


          if (recipient.contactId) {
            try {
              const [contact] = await db.select()
                .from(contacts)
                .where(eq(contacts.id, recipient.contactId));

              if (contact) {
                contactName = contact.name || contact.phone || 'Unknown';
                phoneNumber = contact.phone || 'Unknown';
              }
            } catch (error) {
              console.error('Error fetching contact for recipient:', recipient.id, error);
            }
          }


          try {
            const [queueItem] = await db.select({
              accountId: campaignQueue.accountId
            })
            .from(campaignQueue)
            .where(and(
              eq(campaignQueue.campaignId, campaignId),
              eq(campaignQueue.recipientId, recipient.id)
            ))
            .limit(1);

            if (queueItem && queueItem.accountId) {
              const [account] = await db.select({
                id: channelConnections.id,
                accountName: channelConnections.accountName
              })
              .from(channelConnections)
              .where(eq(channelConnections.id, queueItem.accountId));

              if (account) {
                whatsappAccount = account.accountName;
                whatsappAccountId = account.id;
              }
            }
          } catch (error) {
            console.error('Error fetching WhatsApp account from queue:', error);
          }


          if (whatsappAccount === 'Unknown' && campaignWhatsAppAccounts.length > 0) {
            whatsappAccount = campaignWhatsAppAccounts[0].accountName;
            whatsappAccountId = campaignWhatsAppAccounts[0].id;
          }

          return {
            id: recipient.id,
            contactName,
            phoneNumber,
            whatsappAccount,
            whatsappAccountId,
            messageStatus: recipient.status,
            sentAt: recipient.sentAt,
            messageContent: recipient.personalizedContent || campaign.content || 'No content',
            deliveryStatus: null,
            errorMessage: recipient.errorMessage,
          };
        })
      );
    }


    const transformedDetails = details.map(detail => ({
      id: detail.id,
      contactName: detail.contactName || detail.phoneNumber || 'Unknown',
      phoneNumber: detail.phoneNumber || 'Unknown',
      whatsappAccount: detail.whatsappAccount || 'Unknown',
      whatsappAccountId: detail.whatsappAccountId || 0,
      messageStatus: detail.messageStatus || 'pending',
      sentAt: detail.sentAt ? detail.sentAt.toISOString() : null,
      messageContent: detail.messageContent || '',
      deliveryStatus: detail.deliveryStatus || null,
      errorMessage: detail.errorMessage || null,
    }));

    res.json({ success: true, data: transformedDetails });
  } catch (error) {
    console.error('Error fetching campaign details:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.post('/:id/export/csv', requireAnyPermission(['view_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const campaignId = parseInt(req.params.id);
    const { campaignName } = req.body;

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }


    const [campaign] = await db.select()
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.companyId, companyId)));

    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }


    let campaignWhatsAppAccounts: Array<{
      id: number;
      accountName: string;
      phoneNumber: string | null;
    }> = [];
    if (campaign.channelIds && Array.isArray(campaign.channelIds) && campaign.channelIds.length > 0) {
      campaignWhatsAppAccounts = await db.select({
        id: channelConnections.id,
        accountName: channelConnections.accountName,
        phoneNumber: whatsappAccounts.phoneNumber
      })
      .from(channelConnections)
      .leftJoin(whatsappAccounts, eq(channelConnections.id, whatsappAccounts.channelId))
      .where(and(
        inArray(channelConnections.id, campaign.channelIds),
        eq(channelConnections.companyId, companyId)
      ));
    }


    const recipientData = await db.select()
      .from(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, campaignId));


    const details = await Promise.all(
      recipientData.map(async (recipient) => {
        let contactName = 'Unknown';
        let phoneNumber = 'Unknown';
        let whatsappAccount = 'Unknown';
        let whatsappAccountId = 0;


        if (recipient.contactId) {
          try {
            const [contact] = await db.select()
              .from(contacts)
              .where(eq(contacts.id, recipient.contactId));

            if (contact) {
              contactName = contact.name || contact.phone || 'Unknown';
              phoneNumber = contact.phone || 'Unknown';
            }
          } catch (error) {
            console.error('Error fetching contact for recipient:', recipient.id, error);
          }
        }


        try {
          const [queueItem] = await db.select({
            accountId: campaignQueue.accountId
          })
          .from(campaignQueue)
          .where(and(
            eq(campaignQueue.campaignId, campaignId),
            eq(campaignQueue.recipientId, recipient.id)
          ))
          .limit(1);

          if (queueItem && queueItem.accountId) {
            const [account] = await db.select({
              id: channelConnections.id,
              accountName: channelConnections.accountName
            })
            .from(channelConnections)
            .where(eq(channelConnections.id, queueItem.accountId));

            if (account) {
              whatsappAccount = account.accountName;
              whatsappAccountId = account.id;
            }
          }
        } catch (error) {
          console.error('Error fetching WhatsApp account from queue:', error);
        }


        if (whatsappAccount === 'Unknown' && campaignWhatsAppAccounts.length > 0) {
          whatsappAccount = campaignWhatsAppAccounts[0].accountName;
          whatsappAccountId = campaignWhatsAppAccounts[0].id;
        }

        return {
          id: recipient.id,
          contactName,
          phoneNumber,
          whatsappAccount,
          whatsappAccountId,
          messageStatus: recipient.status,
          sentAt: recipient.sentAt,
          messageContent: recipient.personalizedContent || campaign.content || 'No content',
          deliveryStatus: null,
          errorMessage: recipient.errorMessage,
          createdAt: recipient.createdAt,
        };
      })
    );


    const csvData = details.map(detail => ({
      'Contact Name': detail.contactName || detail.phoneNumber || 'Unknown',
      'Phone Number': detail.phoneNumber || 'Unknown',
      'WhatsApp Account': detail.whatsappAccount || 'Unknown',
      'Message Status': detail.messageStatus || 'pending',
      'Sent At': detail.sentAt ? detail.sentAt.toISOString() : '',
      'Message Content': detail.messageContent || '',
      'Delivery Status': detail.deliveryStatus || '',
      'Error Message': detail.errorMessage || '',
      'Created At': detail.createdAt ? detail.createdAt.toISOString() : '',
    }));


    const fileName = `campaign-${campaignName?.replace(/[^a-zA-Z0-9]/g, '-') || 'export'}-${new Date().toISOString().split('T')[0]}.csv`;
    const filePath = join(tmpdir(), fileName);

    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: 'Contact Name', title: 'Contact Name' },
        { id: 'Phone Number', title: 'Phone Number' },
        { id: 'WhatsApp Account', title: 'WhatsApp Account' },
        { id: 'Message Status', title: 'Message Status' },
        { id: 'Sent At', title: 'Sent At' },
        { id: 'Message Content', title: 'Message Content' },
        { id: 'Delivery Status', title: 'Delivery Status' },
        { id: 'Error Message', title: 'Error Message' },
        { id: 'Created At', title: 'Created At' },
      ]
    });

    await csvWriter.writeRecords(csvData);


    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);


    fileStream.on('end', () => {
      fs.unlink(filePath, (err) => {
        if (err) console.error('Error deleting temp CSV file:', err);
      });
    });

  } catch (error) {
    console.error('Error exporting campaign to CSV:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.post('/:id/export/excel', requireAnyPermission(['view_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const campaignId = parseInt(req.params.id);
    const { campaignName } = req.body;

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }


    const [campaign] = await db.select()
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.companyId, companyId)));

    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }


    let campaignWhatsAppAccounts: Array<{
      id: number;
      accountName: string;
      phoneNumber: string | null;
    }> = [];
    try {
      if (campaign.channelIds && Array.isArray(campaign.channelIds) && campaign.channelIds.length > 0) {
        campaignWhatsAppAccounts = await db.select({
          id: channelConnections.id,
          accountName: channelConnections.accountName,
          phoneNumber: whatsappAccounts.phoneNumber
        })
        .from(channelConnections)
        .leftJoin(whatsappAccounts, eq(channelConnections.id, whatsappAccounts.channelId))
        .where(and(
          inArray(channelConnections.id, campaign.channelIds),
          eq(channelConnections.companyId, companyId)
        ));
      }
    } catch (error) {
      console.error('Error fetching campaign WhatsApp accounts:', error);
      campaignWhatsAppAccounts = [];
    }


    const recipientData = await db.select()
      .from(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, campaignId));


    const details = await Promise.all(
      recipientData.map(async (recipient) => {
        let contactName = 'Unknown';
        let phoneNumber = 'Unknown';
        let whatsappAccount = 'Unknown';
        let whatsappAccountId = 0;


        if (recipient.contactId) {
          try {
            const [contact] = await db.select()
              .from(contacts)
              .where(eq(contacts.id, recipient.contactId));

            if (contact) {
              contactName = contact.name || contact.phone || 'Unknown';
              phoneNumber = contact.phone || 'Unknown';
            }
          } catch (error) {
            console.error('Error fetching contact for recipient:', recipient.id, error);
          }
        }


        try {
          const [queueItem] = await db.select({
            accountId: campaignQueue.accountId
          })
          .from(campaignQueue)
          .where(and(
            eq(campaignQueue.campaignId, campaignId),
            eq(campaignQueue.recipientId, recipient.id)
          ))
          .limit(1);

          if (queueItem && queueItem.accountId) {
            const [account] = await db.select({
              id: channelConnections.id,
              accountName: channelConnections.accountName
            })
            .from(channelConnections)
            .where(eq(channelConnections.id, queueItem.accountId));

            if (account) {
              whatsappAccount = account.accountName;
              whatsappAccountId = account.id;
            }
          }
        } catch (error) {
          console.error('Error fetching WhatsApp account from queue:', error);
        }


        if (whatsappAccount === 'Unknown' && campaignWhatsAppAccounts.length > 0) {
          whatsappAccount = campaignWhatsAppAccounts[0].accountName;
          whatsappAccountId = campaignWhatsAppAccounts[0].id;
        }

        return {
          id: recipient.id,
          contactName,
          phoneNumber,
          whatsappAccount,
          whatsappAccountId,
          messageStatus: recipient.status,
          sentAt: recipient.sentAt,
          messageContent: recipient.personalizedContent || campaign.content || 'No content',
          deliveryStatus: null,
          errorMessage: recipient.errorMessage,
          createdAt: recipient.createdAt,
        };
      })
    );


    const excelData = details.map(detail => ({
      'Contact Name': detail.contactName || detail.phoneNumber || 'Unknown',
      'Phone Number': detail.phoneNumber || 'Unknown',
      'WhatsApp Account': detail.whatsappAccount || 'Unknown',
      'Message Status': detail.messageStatus || 'pending',
      'Sent At': detail.sentAt ? detail.sentAt.toISOString() : '',
      'Message Content': detail.messageContent || '',
      'Delivery Status': detail.deliveryStatus || '',
      'Error Message': detail.errorMessage || '',
      'Created At': detail.createdAt ? detail.createdAt.toISOString() : '',
    }));


    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);


    const colWidths = [
      { wch: 20 }, // Contact Name
      { wch: 15 }, // Phone Number
      { wch: 15 }, // WhatsApp Account
      { wch: 12 }, // Message Status
      { wch: 20 }, // Sent At
      { wch: 50 }, // Message Content
      { wch: 15 }, // Delivery Status
      { wch: 30 }, // Error Message
      { wch: 20 }, // Created At
    ];
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Campaign Details');


    const fileName = `campaign-${campaignName?.replace(/[^a-zA-Z0-9]/g, '-') || 'export'}-${new Date().toISOString().split('T')[0]}.xlsx`;
    const filePath = join(tmpdir(), fileName);

    XLSX.writeFile(workbook, filePath);


    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);


    fileStream.on('end', () => {
      fs.unlink(filePath, (err) => {
        if (err) console.error('Error deleting temp Excel file:', err);
      });
    });

  } catch (error) {
    console.error('Error exporting campaign to Excel:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

export default router;
