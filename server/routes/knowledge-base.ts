import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { ensureAuthenticated, ensureCompanyUser } from '../middleware';
import { db } from '../db';
import {
  knowledgeBaseDocuments, type InsertKnowledgeBaseDocument,
  type InsertKnowledgeBaseConfig
} from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import knowledgeBaseService from '../services/knowledge-base-service';
import { TextDocumentProcessor } from '../services/document-processors/text-processor';
import { z } from 'zod';
import { dataUsageTracker } from '../services/data-usage-tracker';

const router = express.Router();


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'knowledge-base');
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const supportedTypes = TextDocumentProcessor.getSupportedMimeTypes();

    if (supportedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const availableProcessors = TextDocumentProcessor.getAvailableProcessors();
      let errorMessage = `Unsupported file type: ${file.mimetype}. `;

      if (file.mimetype === 'application/pdf' && !availableProcessors.pdf && !availableProcessors.pdfAdvanced) {
        errorMessage += 'PDF processing not available. Install pdf-parse or pdfjs-dist.';
      } else if (file.mimetype.includes('word') && !availableProcessors.docx) {
        errorMessage += 'Word document processing not available. Install mammoth.';
      } else {
        errorMessage += `Supported types: ${supportedTypes.join(', ')}`;
      }

      cb(new Error(errorMessage));
    }
  }
});


const configSchema = z.object({
  enabled: z.boolean().optional(),
  maxRetrievedChunks: z.number().min(1).max(10).optional(),
  similarityThreshold: z.number().min(0).max(1).optional(),
  embeddingModel: z.string().optional(),
  contextPosition: z.enum(['before_system', 'after_system', 'before_user']).optional(),
  contextTemplate: z.string().optional()
});

const searchSchema = z.object({
  query: z.string().min(1),
  nodeId: z.string().min(1),
  maxResults: z.number().min(1).max(10).optional()
});

/**
 * Get available document processors and supported file types
 * GET /api/knowledge-base/capabilities
 */
router.get('/capabilities', (req, res) => {
  try {
    const processors = TextDocumentProcessor.getAvailableProcessors();
    const supportedTypes = TextDocumentProcessor.getSupportedMimeTypes();

    res.json({
      success: true,
      data: {
        processors,
        supportedMimeTypes: supportedTypes,
        recommendations: {
          pdf: processors.pdf ? 'Available' : 'Install pdf-parse for basic PDF support',
          pdfAdvanced: processors.pdfAdvanced ? 'Available' : 'Install pdfjs-dist for advanced PDF support',
          docx: processors.docx ? 'Available' : 'Install mammoth for Word document support',
          doc: processors.doc ? 'Available' : 'Install mammoth for legacy Word document support'
        }
      }
    });
  } catch (error) {
    console.error('Error getting capabilities:', error);
    res.status(500).json({
      error: 'Failed to get capabilities',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Upload document to knowledge base
 * POST /api/knowledge-base/documents/upload
 */

const handleMulterError = (err: any, req: Request, res: Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
    }
    return res.status(400).json({ error: err.message });
  } else if (err) {

    return res.status(400).json({ error: err.message });
  }
  next();
};

router.post('/documents/upload',
  ensureAuthenticated,
  ensureCompanyUser,
  upload.single('document'),
  handleMulterError,
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { nodeId } = req.body;
      const companyId = req.user!.companyId!;


      const documentData: InsertKnowledgeBaseDocument = {
        companyId,
        nodeId: nodeId || null,
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        filePath: req.file.path,
        fileUrl: `/uploads/knowledge-base/${req.file.filename}`,
        status: 'uploading'
      };

      const [document] = await db.insert(knowledgeBaseDocuments)
        .values(documentData)
        .returning();


      if (nodeId) {
        await knowledgeBaseService.associateDocumentWithNode(
          document.id,
          companyId,
          nodeId
        );
      }


      knowledgeBaseService.processDocument(document.id)
        .catch(error => {
          console.error('Background document processing failed:', error);
        });


      dataUsageTracker.trackFileUpload(companyId, req.file.size).catch(err => {
        console.error('Failed to track file upload usage:', err);
      });

      res.json({
        success: true,
        data: document
      });

    } catch (error) {
      console.error('Error uploading document:', error);
      res.status(500).json({ 
        error: 'Failed to upload document',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Get company's knowledge base documents
 * GET /api/knowledge-base/documents
 */
router.get('/documents',
  ensureAuthenticated,
  ensureCompanyUser,
  async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const { nodeId } = req.query;

      let query = db.select()
        .from(knowledgeBaseDocuments)
        .where(eq(knowledgeBaseDocuments.companyId, companyId))
        .orderBy(desc(knowledgeBaseDocuments.createdAt));


      if (nodeId) {
        const documents = await knowledgeBaseService.getNodeDocuments(companyId, nodeId as string);
        return res.json({
          success: true,
          data: documents
        });
      }

      const documents = await query;

      res.json({
        success: true,
        data: documents
      });

    } catch (error) {
      console.error('Error fetching documents:', error);
      res.status(500).json({ 
        error: 'Failed to fetch documents',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Delete document
 * DELETE /api/knowledge-base/documents/:id
 */
router.delete('/documents/:id',
  ensureAuthenticated,
  ensureCompanyUser,
  async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const companyId = req.user!.companyId!;


      const [document] = await db.select()
        .from(knowledgeBaseDocuments)
        .where(and(
          eq(knowledgeBaseDocuments.id, documentId),
          eq(knowledgeBaseDocuments.companyId, companyId)
        ));

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }


      await db.delete(knowledgeBaseDocuments)
        .where(eq(knowledgeBaseDocuments.id, documentId));


      try {
        const nodeId = document.nodeId || 'fallback';
        await knowledgeBaseService.deleteDocumentVectors(companyId, nodeId, documentId);
      } catch (error) {
        console.error('Error deleting vectors from Pinecone:', error);

      }


      if (document.fileSize) {
        dataUsageTracker.trackFileDelete(companyId, document.fileSize).catch(err => {
          console.error('Failed to track file deletion usage:', err);
        });
      }

      res.json({
        success: true,
        message: 'Document deleted successfully'
      });

    } catch (error) {
      console.error('Error deleting document:', error);
      res.status(500).json({ 
        error: 'Failed to delete document',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Get document processing status
 * GET /api/knowledge-base/documents/:id/status
 */
router.get('/documents/:id/status',
  ensureAuthenticated,
  ensureCompanyUser,
  async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const companyId = req.user!.companyId!;

      const [document] = await db.select({
        id: knowledgeBaseDocuments.id,
        status: knowledgeBaseDocuments.status,
        chunkCount: knowledgeBaseDocuments.chunkCount,
        processingError: knowledgeBaseDocuments.processingError,
        processingDurationMs: knowledgeBaseDocuments.processingDurationMs
      })
      .from(knowledgeBaseDocuments)
      .where(and(
        eq(knowledgeBaseDocuments.id, documentId),
        eq(knowledgeBaseDocuments.companyId, companyId)
      ));

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      res.json({
        success: true,
        data: document
      });

    } catch (error) {
      console.error('Error fetching document status:', error);
      res.status(500).json({ 
        error: 'Failed to fetch document status',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Get knowledge base configuration for node
 * GET /api/knowledge-base/config/:nodeId
 */
router.get('/config/:nodeId',
  ensureAuthenticated,
  ensureCompanyUser,
  async (req, res) => {
    try {
      const { nodeId } = req.params;
      const companyId = req.user!.companyId!;

      const config = await knowledgeBaseService.getNodeConfig(companyId, nodeId);

      res.json({
        success: true,
        data: config
      });

    } catch (error) {
      console.error('Error fetching config:', error);
      res.status(500).json({ 
        error: 'Failed to fetch configuration',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Update knowledge base configuration for node
 * PUT /api/knowledge-base/config/:nodeId
 */
router.put('/config/:nodeId',
  ensureAuthenticated,
  ensureCompanyUser,
  async (req, res) => {
    try {
      const { nodeId } = req.params;
      const companyId = req.user!.companyId!;


      const validatedData = configSchema.parse(req.body);

      const configData: InsertKnowledgeBaseConfig = {
        companyId,
        nodeId,
        ...validatedData
      };

      const config = await knowledgeBaseService.upsertNodeConfig(configData);

      res.json({
        success: true,
        data: config
      });

    } catch (error) {
      console.error('Error updating config:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Invalid configuration data',
          details: error.errors
        });
      }

      res.status(500).json({ 
        error: 'Failed to update configuration',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Associate document with AI Assistant node
 * POST /api/knowledge-base/config/:nodeId/documents/assign
 */
router.post('/config/:nodeId/documents/assign',
  ensureAuthenticated,
  ensureCompanyUser,
  async (req, res) => {
    try {
      const { nodeId } = req.params;
      const { documentIds } = req.body;
      const companyId = req.user!.companyId!;

      if (!Array.isArray(documentIds)) {
        return res.status(400).json({ error: 'documentIds must be an array' });
      }


      for (const documentId of documentIds) {
        await knowledgeBaseService.associateDocumentWithNode(
          documentId,
          companyId,
          nodeId
        );
      }

      res.json({
        success: true,
        message: `Associated ${documentIds.length} documents with node ${nodeId}`
      });

    } catch (error) {
      console.error('Error associating documents:', error);
      res.status(500).json({
        error: 'Failed to associate documents',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Search knowledge base
 * POST /api/knowledge-base/search
 */
router.post('/search',
  ensureAuthenticated,
  ensureCompanyUser,
  async (req, res) => {
    try {
      const companyId = req.user!.companyId!;


      const { query, nodeId, maxResults = 5 } = searchSchema.parse(req.body);

      const results = await knowledgeBaseService.retrieveContext(
        companyId,
        nodeId,
        query
      );

      res.json({
        success: true,
        data: {
          query,
          results: results.map(r => ({
            content: r.chunk.content,
            similarity: r.similarity,
            document: {
              id: r.document.id,
              filename: r.document.filename,
              originalName: r.document.originalName
            },
            chunk: {
              index: r.chunk.chunkIndex,
              tokenCount: r.chunk.tokenCount
            }
          }))
        }
      });

    } catch (error) {
      console.error('Error searching knowledge base:', error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Invalid search parameters',
          details: error.errors
        });
      }

      res.status(500).json({
        error: 'Failed to search knowledge base',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Test query against knowledge base
 * POST /api/knowledge-base/test-query
 */
router.post('/test-query',
  ensureAuthenticated,
  ensureCompanyUser,
  async (req, res) => {
    try {
      const companyId = req.user!.companyId!;


      const { query, nodeId, systemPrompt = 'You are a helpful assistant.' } = req.body;

      if (!query || !nodeId) {
        return res.status(400).json({ error: 'query and nodeId are required' });
      }


      const enhancement = await knowledgeBaseService.enhancePromptWithContext(
        companyId,
        nodeId,
        systemPrompt,
        query
      );

      res.json({
        success: true,
        data: {
          originalPrompt: systemPrompt,
          enhancedPrompt: enhancement.enhancedPrompt,
          contextUsed: enhancement.contextUsed,
          stats: enhancement.retrievalStats
        }
      });

    } catch (error) {
      console.error('Error testing query:', error);
      res.status(500).json({
        error: 'Failed to test query',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

export default router;
