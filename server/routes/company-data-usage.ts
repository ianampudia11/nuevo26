import { Router } from 'express';
import { ensureAuthenticated, ensureSuperAdmin } from '../middleware';
import { storage } from '../storage';
import { db } from '../db';
import { knowledgeBaseDocuments, users, messages, conversations } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import fsExtra from 'fs-extra';

const router = Router();


const updateUsageSchema = z.object({
  storageUsed: z.number().int().min(0).optional(),
  bandwidthUsed: z.number().int().min(0).optional(),
  filesCount: z.number().int().min(0).optional()
});


const overrideUsageSchema = z.object({
  currentStorageUsed: z.number().int().min(0).optional(),
  currentBandwidthUsed: z.number().int().min(0).optional(),
  filesCount: z.number().int().min(0).optional(),
  reason: z.string().optional()
});

/**
 * Get company data usage and limits
 */
router.get('/:companyId/usage', ensureSuperAdmin, async (req, res) => {
  try {
    const companyId = parseInt(req.params.companyId);
    
    if (isNaN(companyId)) {
      return res.status(400).json({ error: 'Invalid company ID' });
    }

    const company = await storage.getCompany(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }


    let plan = null;
    if (company.planId) {
      plan = await storage.getPlan(company.planId);
    }



    const currentStorageUsed = company.currentStorageUsed ?? 0;
    const currentBandwidthUsed = company.currentBandwidthUsed ?? 0;
    const currentFilesCount = company.filesCount ?? 0;
    
    const storageLimit = plan?.storageLimit ?? 0;
    const bandwidthLimit = plan?.bandwidthLimit ?? 0;
    const totalFilesLimit = plan?.totalFilesLimit ?? 0;
    

    const storagePercentage = storageLimit > 0
      ? Math.min(100, Math.round((currentStorageUsed / storageLimit) * 100))
      : (currentStorageUsed > 0 ? 100 : 0);
    
    const bandwidthPercentage = bandwidthLimit > 0
      ? Math.min(100, Math.round((currentBandwidthUsed / bandwidthLimit) * 100))
      : (currentBandwidthUsed > 0 ? 100 : 0);

    const filesPercentage = totalFilesLimit > 0
      ? Math.min(100, Math.round((currentFilesCount / totalFilesLimit) * 100))
      : (currentFilesCount > 0 ? 100 : 0);

    const usageData = {
      companyId: company.id,
      companyName: company.name,
      planName: plan?.name || 'No Plan',
      

      currentUsage: {



        storage: currentStorageUsed, // in MB - actual database value
        bandwidth: currentBandwidthUsed, // in MB - actual database value
        files: currentFilesCount // actual database value
      },
      

      limits: {
        storage: storageLimit, // in MB
        bandwidth: bandwidthLimit, // in MB
        fileUpload: plan?.fileUploadLimit ?? 0, // in MB
        totalFiles: totalFilesLimit
      },
      

      percentages: {
        storage: storagePercentage,
        bandwidth: bandwidthPercentage,
        files: filesPercentage
      },
      

      status: {
        storageNearLimit: storagePercentage >= 80,
        bandwidthNearLimit: bandwidthPercentage >= 80,
        filesNearLimit: filesPercentage >= 80,
        storageExceeded: storagePercentage >= 100,
        bandwidthExceeded: bandwidthPercentage >= 100,
        filesExceeded: filesPercentage >= 100
      },
      
      lastUpdated: company.lastUsageUpdate
    };

    res.json(usageData);

  } catch (error) {
    console.error('Error fetching company usage:', error);
    res.status(500).json({ error: 'Failed to fetch company usage data' });
  }
});

/**
 * Update company usage (internal API for system use)
 */
router.post('/:companyId/usage/update', ensureAuthenticated, async (req, res) => {
  try {
    const companyId = parseInt(req.params.companyId);
    
    if (isNaN(companyId)) {
      return res.status(400).json({ error: 'Invalid company ID' });
    }

    const validatedData = updateUsageSchema.parse(req.body);

    const company = await storage.getCompany(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }


    const updateData: any = {
      lastUsageUpdate: new Date()
    };

    if (validatedData.storageUsed !== undefined) {
      updateData.currentStorageUsed = validatedData.storageUsed;
    }
    if (validatedData.bandwidthUsed !== undefined) {
      updateData.currentBandwidthUsed = validatedData.bandwidthUsed;
    }
    if (validatedData.filesCount !== undefined) {
      updateData.filesCount = validatedData.filesCount;
    }

    await storage.updateCompany(companyId, updateData);

    res.json({
      success: true,
      message: 'Usage updated successfully',
      updatedFields: Object.keys(updateData)
    });

  } catch (error) {
    console.error('Error updating company usage:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.errors 
      });
    }
    res.status(500).json({ error: 'Failed to update company usage' });
  }
});

/**
 * Override company usage manually (admin only)
 */
router.post('/:companyId/usage/override', ensureSuperAdmin, async (req, res) => {
  try {
    const companyId = parseInt(req.params.companyId);
    
    if (isNaN(companyId)) {
      return res.status(400).json({ error: 'Invalid company ID' });
    }

    const validatedData = overrideUsageSchema.parse(req.body);

    const company = await storage.getCompany(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }


    const updateData: any = {
      lastUsageUpdate: new Date()
    };

    if (validatedData.currentStorageUsed !== undefined) {
      updateData.currentStorageUsed = validatedData.currentStorageUsed;
    }
    if (validatedData.currentBandwidthUsed !== undefined) {
      updateData.currentBandwidthUsed = validatedData.currentBandwidthUsed;
    }
    if (validatedData.filesCount !== undefined) {
      updateData.filesCount = validatedData.filesCount;
    }

    await storage.updateCompany(companyId, updateData);




    res.json({
      success: true,
      message: 'Usage overridden successfully',
      reason: validatedData.reason,
      updatedFields: Object.keys(updateData).filter(key => key !== 'lastUsageUpdate')
    });

  } catch (error) {
    console.error('Error overriding company usage:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.errors 
      });
    }
    res.status(500).json({ error: 'Failed to override company usage' });
  }
});

/**
 * Reset monthly bandwidth usage (typically called by a cron job)
 */
router.post('/:companyId/usage/reset-bandwidth', ensureSuperAdmin, async (req, res) => {
  try {
    const companyId = parseInt(req.params.companyId);
    
    if (isNaN(companyId)) {
      return res.status(400).json({ error: 'Invalid company ID' });
    }

    await storage.updateCompany(companyId, {
      currentBandwidthUsed: 0,
      lastUsageUpdate: new Date()
    });

    res.json({
      success: true,
      message: 'Bandwidth usage reset successfully'
    });

  } catch (error) {
    console.error('Error resetting bandwidth usage:', error);
    res.status(500).json({ error: 'Failed to reset bandwidth usage' });
  }
});

/**
 * Recalculate company usage from actual files (admin only)
 * POST /api/admin/companies/:companyId/usage/recalculate
 */
router.post('/:companyId/usage/recalculate', ensureSuperAdmin, async (req, res) => {
  try {
    const companyId = parseInt(req.params.companyId);
    
    if (isNaN(companyId)) {
      return res.status(400).json({ error: 'Invalid company ID' });
    }

    const company = await storage.getCompany(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }


    let totalStorageBytes = 0;
    let totalFiles = 0;


    const knowledgeBaseDocs = await db.select()
      .from(knowledgeBaseDocuments)
      .where(eq(knowledgeBaseDocuments.companyId, companyId));

    for (const doc of knowledgeBaseDocs) {
      if (doc.fileSize) {
        totalStorageBytes += doc.fileSize;
        totalFiles += 1;
      }
    }





    try {
      const templatesDir = path.join(process.cwd(), 'uploads', 'templates');
      if (await fsExtra.pathExists(templatesDir)) {
        const templateFiles = await fs.readdir(templatesDir);
        for (const filename of templateFiles) {
          try {
            const filePath = path.join(templatesDir, filename);
            const stats = await fs.stat(filePath);
            if (stats.isFile()) {
              totalStorageBytes += stats.size;
              totalFiles += 1;
            }
          } catch (error) {

            console.warn(`Could not access template file ${filename}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error scanning template media directory:', error);
    }


    try {
      const webchatDir = path.join(process.cwd(), 'uploads', 'webchat');
      if (await fsExtra.pathExists(webchatDir)) {

        const webchatMessages = await db
          .select({ mediaUrl: messages.mediaUrl })
          .from(messages)
          .innerJoin(conversations, eq(messages.conversationId, conversations.id))
          .where(
            and(
              eq(conversations.companyId, companyId),
              sql`${messages.mediaUrl} LIKE '/uploads/webchat/%'`
            )
          );

        const processedFiles = new Set<string>();
        for (const msg of webchatMessages) {
          if (msg.mediaUrl && !processedFiles.has(msg.mediaUrl)) {
            processedFiles.add(msg.mediaUrl);
            const filename = path.basename(msg.mediaUrl);
            try {
              const filePath = path.join(webchatDir, filename);
              if (await fsExtra.pathExists(filePath)) {
                const stats = await fs.stat(filePath);
                totalStorageBytes += stats.size;
                totalFiles += 1;
              }
            } catch (error) {

              console.warn(`Could not access webchat file ${filename}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error scanning webchat uploads:', error);
    }


    try {
      const companyUsers = await db
        .select({ avatarUrl: users.avatarUrl })
        .from(users)
        .where(eq(users.companyId, companyId));

      const uploadsDir = path.join(process.cwd(), 'uploads');
      for (const user of companyUsers) {
        if (user.avatarUrl && user.avatarUrl.startsWith('/uploads/')) {
          const filename = path.basename(user.avatarUrl);
          try {
            const filePath = path.join(uploadsDir, filename);
            if (await fsExtra.pathExists(filePath)) {
              const stats = await fs.stat(filePath);
              totalStorageBytes += stats.size;
              totalFiles += 1;
            }
          } catch (error) {

            console.warn(`Could not access avatar file ${filename}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error scanning avatar files:', error);
    }



    const totalStorageMB = Math.ceil(totalStorageBytes / (1024 * 1024));


    await storage.updateCompany(companyId, {
      currentStorageUsed: totalStorageMB,
      filesCount: totalFiles,
      lastUsageUpdate: new Date()
    });

    res.json({
      success: true,
      message: 'Usage recalculated successfully',
      recalculated: {
        storage: totalStorageMB,
        files: totalFiles,
        bandwidth: company.currentBandwidthUsed || 0 // Keep existing bandwidth
      }
    });

  } catch (error) {
    console.error('Error recalculating company usage:', error);
    res.status(500).json({ error: 'Failed to recalculate company usage' });
  }
});

export default router;
