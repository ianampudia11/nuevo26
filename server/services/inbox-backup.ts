import { db } from '../db';
import { storage } from '../storage';
import { getCachedCompanySetting, getCachedInitialPipelineStage } from '../utils/pipeline-cache';
import { 
  inboxBackups, 
  backupSchedules, 
  inboxRestores, 
  backupAuditLogs,
  InsertInboxBackup,
  InsertBackupSchedule,
  InsertInboxRestore,
  InsertBackupAuditLog
} from '@shared/schema';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { promisify } from 'util';
import { logger } from '../utils/logger';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export interface BackupData {
  metadata: {
    version: string;
    createdAt: string;
    companyId: number;
    totalContacts: number;
    totalConversations: number;
    totalMessages: number;
    totalChannelRelationships: number;
    dateRangeStart?: string;
    dateRangeEnd?: string;
  };
  contacts: any[];
  conversations: any[];
  messages: any[];
  channelConnections: any[];
}

export interface BackupOptions {
  companyId: number;
  createdByUserId: number;
  name: string;
  description?: string;
  includeContacts: boolean;
  includeConversations: boolean;
  includeMessages: boolean;
  dateRangeStart?: Date;
  dateRangeEnd?: Date;
}

export interface RestoreOptions {
  companyId: number;
  restoredByUserId: number;
  backupId?: number;
  restoreType: 'full' | 'selective';
  conflictResolution: 'merge' | 'overwrite' | 'skip';
  dateRangeStart?: Date;
  dateRangeEnd?: Date;
  restoreContacts: boolean;
  restoreConversations: boolean;
  restoreMessages: boolean;
}

class InboxBackupService {
  private readonly backupDir = path.join(process.cwd(), 'backups');

  constructor() {
    this.ensureBackupDirectory();
  }

  private async ensureBackupDirectory() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      logger.error('InboxBackupService', 'Failed to create backup directory', error);
    }
  }

  async createBackup(options: BackupOptions): Promise<number> {
    const backupRecord = await db.insert(inboxBackups).values({
      companyId: options.companyId,
      createdByUserId: options.createdByUserId,
      name: options.name,
      description: options.description,
      status: 'pending',
      includeContacts: options.includeContacts,
      includeConversations: options.includeConversations,
      includeMessages: options.includeMessages,
      dateRangeStart: options.dateRangeStart,
      dateRangeEnd: options.dateRangeEnd,
      startedAt: new Date()
    }).returning({ id: inboxBackups.id });

    const backupId = backupRecord[0].id;


    await this.logAuditEvent({
      companyId: options.companyId,
      userId: options.createdByUserId,
      action: 'backup_created',
      entityType: 'backup',
      entityId: backupId,
      details: { name: options.name, options }
    });


    this.processBackup(backupId, options).catch(error => {
      logger.error(`Backup ${backupId} failed:`, error);
      this.updateBackupStatus(backupId, 'failed', error.message);
    });

    return backupId;
  }

  private async processBackup(backupId: number, options: BackupOptions) {
    try {
      await this.updateBackupStatus(backupId, 'in_progress');


      const backupData = await this.extractBackupData(options);


      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `backup-${options.companyId}-${timestamp}.json`;
      const filePath = path.join(this.backupDir, fileName);


      const jsonData = JSON.stringify(backupData, null, 2);
      const compressedData = await gzip(Buffer.from(jsonData, 'utf8'));
      
      await fs.writeFile(filePath + '.gz', compressedData);


      const checksum = crypto.createHash('sha256').update(compressedData).digest('hex');


      await db.update(inboxBackups)
        .set({
          status: 'completed',
          filePath: filePath + '.gz',
          fileName: fileName + '.gz',
          fileSize: Buffer.byteLength(jsonData, 'utf8'),
          compressedSize: compressedData.length,
          checksum,
          totalContacts: backupData.contacts.length,
          totalConversations: backupData.conversations.length,
          totalMessages: backupData.messages.length,
          metadata: {
            ...backupData.metadata,
            totalChannelConnections: backupData.channelConnections.length
          },
          completedAt: new Date()
        })
        .where(eq(inboxBackups.id, backupId));

      logger.info('InboxBackupService', `Backup ${backupId} completed successfully`);

    } catch (error) {
      logger.error('InboxBackupService', `Backup ${backupId} failed`, error);
      await this.updateBackupStatus(backupId, 'failed', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  private async extractBackupData(options: BackupOptions): Promise<BackupData> {
    const backupData: BackupData = {
      metadata: {
        version: '1.1.0', // Updated version to reflect channel relationship support
        createdAt: new Date().toISOString(),
        companyId: options.companyId,
        totalContacts: 0,
        totalConversations: 0,
        totalMessages: 0,
        totalChannelRelationships: 0,
        dateRangeStart: options.dateRangeStart?.toISOString(),
        dateRangeEnd: options.dateRangeEnd?.toISOString()
      },
      contacts: [],
      conversations: [],
      messages: [],
      channelConnections: []
    };


    if (options.includeContacts) {
      backupData.contacts = await storage.getContactsForBackup(options.companyId);
      backupData.metadata.totalContacts = backupData.contacts.length;


      backupData.metadata.totalChannelRelationships = backupData.contacts.reduce(
        (total, contact) => total + (contact.channelRelationships?.length || 0),
        0
      );
    }


    backupData.channelConnections = await storage.getChannelConnectionsByCompany(options.companyId);


    if (options.includeConversations) {
      backupData.conversations = await storage.getConversationsForBackup(
        options.companyId,
        options.dateRangeStart,
        options.dateRangeEnd
      );
      backupData.metadata.totalConversations = backupData.conversations.length;
    }


    if (options.includeMessages) {
      backupData.messages = await storage.getMessagesForBackup(
        options.companyId,
        options.dateRangeStart,
        options.dateRangeEnd
      );
      backupData.metadata.totalMessages = backupData.messages.length;
    }

    return backupData;
  }

  private async updateBackupStatus(backupId: number, status: string, errorMessage?: string) {
    await db.update(inboxBackups)
      .set({
        status: status as any,
        errorMessage,
        updatedAt: new Date()
      })
      .where(eq(inboxBackups.id, backupId));
  }

  async getBackups(companyId: number, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    
    const backups = await db.select()
      .from(inboxBackups)
      .where(eq(inboxBackups.companyId, companyId))
      .orderBy(desc(inboxBackups.createdAt))
      .limit(limit)
      .offset(offset);

    const total = await db.select({ count: inboxBackups.id })
      .from(inboxBackups)
      .where(eq(inboxBackups.companyId, companyId));

    return {
      backups,
      total: total.length,
      page,
      limit,
      totalPages: Math.ceil(total.length / limit)
    };
  }

  async getBackup(backupId: number, companyId: number) {
    const backup = await db.select()
      .from(inboxBackups)
      .where(and(
        eq(inboxBackups.id, backupId),
        eq(inboxBackups.companyId, companyId)
      ))
      .limit(1);

    return backup[0] || null;
  }

  async downloadBackup(backupId: number, companyId: number): Promise<Buffer | null> {
    const backup = await this.getBackup(backupId, companyId);
    
    if (!backup || !backup.filePath || backup.status !== 'completed') {
      return null;
    }

    try {
      const compressedData = await fs.readFile(backup.filePath);
      

      const checksum = crypto.createHash('sha256').update(compressedData).digest('hex');
      if (checksum !== backup.checksum) {
        throw new Error('Backup file integrity check failed');
      }

      return compressedData;
    } catch (error) {
      logger.error('InboxBackupService', `Failed to read backup file ${backup.filePath}`, error);
      return null;
    }
  }

  async deleteBackup(backupId: number, companyId: number, userId: number): Promise<boolean> {
    const backup = await this.getBackup(backupId, companyId);

    if (!backup) {
      return false;
    }

    try {

      await db.delete(inboxRestores)
        .where(and(
          eq(inboxRestores.backupId, backupId),
          eq(inboxRestores.companyId, companyId)
        ));


      if (backup.filePath) {
        try {
          await fs.unlink(backup.filePath);
        } catch (error) {
          logger.warn('InboxBackupService', `Failed to delete backup file ${backup.filePath}`, error);
        }
      }


      await db.delete(inboxBackups)
        .where(and(
          eq(inboxBackups.id, backupId),
          eq(inboxBackups.companyId, companyId)
        ));


      await this.logAuditEvent({
        companyId,
        userId,
        action: 'backup_deleted',
        entityType: 'backup',
        entityId: backupId,
        details: { name: backup.name }
      });

      return true;
    } catch (error) {
      logger.error('InboxBackupService', `Failed to delete backup ${backupId}`, error);
      return false;
    }
  }

  async logAuditEvent(event: Omit<InsertBackupAuditLog, 'createdAt'>) {
    try {
      await db.insert(backupAuditLogs).values({
        ...event,
        createdAt: new Date()
      });
    } catch (error) {
      logger.error('InboxBackupService', 'Failed to log audit event', error);
    }
  }

  async createRestore(options: RestoreOptions, uploadedFile?: Buffer): Promise<number> {
    const restoreRecord = await db.insert(inboxRestores).values({
      companyId: options.companyId,
      backupId: options.backupId,
      restoredByUserId: options.restoredByUserId,
      status: 'pending',
      restoreType: options.restoreType,
      conflictResolution: options.conflictResolution,
      dateRangeStart: options.dateRangeStart,
      dateRangeEnd: options.dateRangeEnd,
      restoreContacts: options.restoreContacts,
      restoreConversations: options.restoreConversations,
      restoreMessages: options.restoreMessages,
      startedAt: new Date()
    }).returning({ id: inboxRestores.id });

    const restoreId = restoreRecord[0].id;


    await this.logAuditEvent({
      companyId: options.companyId,
      userId: options.restoredByUserId,
      action: 'restore_started',
      entityType: 'restore',
      entityId: restoreId,
      details: { restoreType: options.restoreType, backupId: options.backupId }
    });


    this.processRestore(restoreId, options, uploadedFile).catch(error => {
      logger.error(`Restore ${restoreId} failed:`, error);
      this.updateRestoreStatus(restoreId, 'failed', error.message);
    });

    return restoreId;
  }

  private async processRestore(restoreId: number, options: RestoreOptions, uploadedFile?: Buffer) {
    try {
      await this.updateRestoreStatus(restoreId, 'in_progress');

      let backupData: BackupData;

      if (uploadedFile) {

        const decompressedData = await gunzip(uploadedFile);
        backupData = JSON.parse(decompressedData.toString('utf8'));
      } else if (options.backupId) {

        const backup = await this.getBackup(options.backupId, options.companyId);
        if (!backup || !backup.filePath) {
          throw new Error('Backup file not found');
        }

        const compressedData = await fs.readFile(backup.filePath);
        const decompressedData = await gunzip(compressedData);
        backupData = JSON.parse(decompressedData.toString('utf8'));
      } else {
        throw new Error('No backup source provided');
      }


      if (!backupData.metadata || !backupData.metadata.version) {
        throw new Error('Invalid backup file format');
      }

      let totalItemsToRestore = 0;
      let itemsRestored = 0;
      let itemsSkipped = 0;
      let itemsErrored = 0;


      if (options.restoreContacts) totalItemsToRestore += backupData.contacts.length;
      if (options.restoreConversations) totalItemsToRestore += backupData.conversations.length;
      if (options.restoreMessages) totalItemsToRestore += backupData.messages.length;

      await db.update(inboxRestores)
        .set({ totalItemsToRestore })
        .where(eq(inboxRestores.id, restoreId));


      if (backupData.channelConnections && backupData.channelConnections.length > 0) {
        logger.info('InboxBackupService',
          `Backup contains ${backupData.channelConnections.length} channel connections:`,
          backupData.channelConnections.map((conn: any) => ({
            id: conn.id,
            channelType: conn.channelType,
            accountName: conn.accountName,
            status: conn.status
          }))
        );
      }


      if (options.restoreContacts && backupData.contacts.length > 0) {
        const result = await this.restoreContacts(backupData.contacts, options);
        itemsRestored += result.restored;
        itemsSkipped += result.skipped;
        itemsErrored += result.errored;
      }


      if (options.restoreConversations && backupData.conversations.length > 0) {
        const result = await this.restoreConversations(backupData.conversations, options);
        itemsRestored += result.restored;
        itemsSkipped += result.skipped;
        itemsErrored += result.errored;
      }


      if (options.restoreMessages && backupData.messages.length > 0) {
        const result = await this.restoreMessages(backupData.messages, options);
        itemsRestored += result.restored;
        itemsSkipped += result.skipped;
        itemsErrored += result.errored;
      }


      await db.update(inboxRestores)
        .set({
          status: 'completed',
          itemsRestored,
          itemsSkipped,
          itemsErrored,
          completedAt: new Date()
        })
        .where(eq(inboxRestores.id, restoreId));

      logger.info('InboxBackupService', `Restore ${restoreId} completed successfully`);

    } catch (error) {
      logger.error('InboxBackupService', `Restore ${restoreId} failed`, error);
      await this.updateRestoreStatus(restoreId, 'failed', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  private async updateRestoreStatus(restoreId: number, status: string, errorMessage?: string) {
    await db.update(inboxRestores)
      .set({
        status: status as any,
        errorMessage,
        updatedAt: new Date()
      })
      .where(eq(inboxRestores.id, restoreId));
  }

  private async restoreContacts(contacts: any[], options: RestoreOptions) {
    let restored = 0, skipped = 0, errored = 0;

    for (const contact of contacts) {
      try {

        const existing = await storage.getContactByPhone(contact.phone, options.companyId);

        let contactId: number;

        if (existing) {
          if (options.conflictResolution === 'skip') {
            skipped++;
            continue;
          } else if (options.conflictResolution === 'merge') {

            await storage.updateContact(existing.id, {
              name: contact.name || existing.name,
              email: contact.email || existing.email,
              company: contact.company || existing.company,
              tags: [...(existing.tags || []), ...(contact.tags || [])],
              identifier: contact.identifier || existing.identifier,
              identifierType: contact.identifierType || existing.identifierType,
              source: contact.source || existing.source,
              notes: contact.notes || existing.notes
            });
            contactId = existing.id;
            restored++;
          } else if (options.conflictResolution === 'overwrite') {

            await storage.updateContact(existing.id, {
              name: contact.name,
              email: contact.email,
              company: contact.company,
              tags: contact.tags,
              identifier: contact.identifier,
              identifierType: contact.identifierType,
              source: contact.source,
              notes: contact.notes
            });
            contactId = existing.id;
            restored++;
          } else {
            contactId = existing.id;
          }
        } else {

          const newContact = await storage.createContact({
            companyId: options.companyId,
            name: contact.name,
            phone: contact.phone,
            email: contact.email,
            company: contact.company,
            tags: contact.tags,
            identifier: contact.identifier,
            identifierType: contact.identifierType,
            source: contact.source,
            notes: contact.notes
          });
          contactId = newContact.id;
          restored++;


          try {
            const autoAddEnabled = await getCachedCompanySetting(options.companyId, 'autoAddContactToPipeline');
            if (autoAddEnabled) {

              const initialStage = await getCachedInitialPipelineStage(options.companyId);
              if (initialStage) {

                const existingDeal = await storage.getActiveDealByContact(newContact.id, options.companyId, initialStage.pipelineId);
                if (!existingDeal) {
                  const deal = await storage.createDeal({
                    companyId: options.companyId,
                    contactId: newContact.id,
                    title: `New Lead - ${newContact.name}`,
                    pipelineId: initialStage.pipelineId,
                    stageId: initialStage.id,
                    stage: 'lead'
                  });
                  await storage.createDealActivity({
                    dealId: deal.id,
                    userId: options.restoredByUserId,
                    type: 'create',
                    content: 'Deal automatically created when contact was added'
                  });
                }
              }
            }
          } catch (error) {
            console.error('Error auto-adding contact to pipeline:', error);

          }
        }


        if (contact.notes && Array.isArray(contact.notes)) {
          for (const note of contact.notes) {
            try {
              await storage.createNote({
                contactId: contactId,
                userId: note.userId || options.restoredByUserId,
                content: note.content
              });
            } catch (noteError) {
              logger.warn('InboxBackupService', `Failed to restore note for contact ${contactId}`, noteError);
            }
          }
        }



        if (contact.channelRelationships && contact.channelRelationships.length > 0) {
          logger.info('InboxBackupService',
            `Contact ${contactId} has ${contact.channelRelationships.length} channel relationships:`,
            contact.channelRelationships.map((rel: any) => ({
              channelType: rel.channelType,
              channelId: rel.channelId,
              accountName: rel.connectionAccountName
            }))
          );
        }

      } catch (error) {
        logger.error('InboxBackupService', `Failed to restore contact ${contact.id}`, error);
        errored++;
      }
    }

    return { restored, skipped, errored };
  }

  private async restoreConversations(conversations: any[], options: RestoreOptions) {
    let restored = 0, skipped = 0, errored = 0;

    for (const conversation of conversations) {
      try {

        if (options.dateRangeStart && new Date(conversation.createdAt) < options.dateRangeStart) {
          skipped++;
          continue;
        }
        if (options.dateRangeEnd && new Date(conversation.createdAt) > options.dateRangeEnd) {
          skipped++;
          continue;
        }


        const existingConversations = await storage.getConversationsByChannel(conversation.channelId);
        const existing = existingConversations.find(c =>
          c.channelId === conversation.channelId && c.channelType === conversation.channelType
        );

        if (existing) {
          if (options.conflictResolution === 'skip') {
            skipped++;
            continue;
          }

          skipped++;
        } else {

          await storage.createConversation({
            companyId: options.companyId,
            contactId: conversation.contactId,
            channelId: conversation.channelId,
            channelType: conversation.channelType,
            status: conversation.status,
            groupMetadata: conversation.groupMetadata
          });
          restored++;
        }
      } catch (error) {
        logger.error('InboxBackupService', `Failed to restore conversation ${conversation.id}`, error);
        errored++;
      }
    }

    return { restored, skipped, errored };
  }

  private async restoreMessages(messages: any[], options: RestoreOptions) {
    let restored = 0, skipped = 0, errored = 0;

    for (const message of messages) {
      try {

        if (options.dateRangeStart && new Date(message.createdAt) < options.dateRangeStart) {
          skipped++;
          continue;
        }
        if (options.dateRangeEnd && new Date(message.createdAt) > options.dateRangeEnd) {
          skipped++;
          continue;
        }


        const existing = await storage.getMessageByExternalId(message.externalId || message.channelMessageId);

        if (existing) {
          if (options.conflictResolution === 'skip') {
            skipped++;
            continue;
          }

          skipped++;
        } else {

          await storage.createMessage({
            conversationId: message.conversationId,
            content: message.content,
            type: message.messageType || 'text',
            direction: message.direction,
            status: message.status,
            externalId: message.externalId || message.channelMessageId,
            metadata: message.metadata
          });
          restored++;
        }
      } catch (error) {
        logger.error('InboxBackupService', `Failed to restore message ${message.id}`, error);
        errored++;
      }
    }

    return { restored, skipped, errored };
  }

  async getRestores(companyId: number, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const restores = await db.select()
      .from(inboxRestores)
      .where(eq(inboxRestores.companyId, companyId))
      .orderBy(desc(inboxRestores.createdAt))
      .limit(limit)
      .offset(offset);

    const total = await db.select({ count: inboxRestores.id })
      .from(inboxRestores)
      .where(eq(inboxRestores.companyId, companyId));

    return {
      restores,
      total: total.length,
      page,
      limit,
      totalPages: Math.ceil(total.length / limit)
    };
  }

  async getRestore(restoreId: number, companyId: number) {
    const restore = await db.select()
      .from(inboxRestores)
      .where(and(
        eq(inboxRestores.id, restoreId),
        eq(inboxRestores.companyId, companyId)
      ))
      .limit(1);

    return restore[0] || null;
  }
}

export const inboxBackupService = new InboxBackupService();
