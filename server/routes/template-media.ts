import express, { Request, Response, NextFunction } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { ensureAuthenticated, requirePermission } from '../middleware';
import { User as SelectUser } from '@shared/schema';
import { dataUsageTracker } from '../services/data-usage-tracker';

const router = express.Router();


const storage = multer.diskStorage({
  destination: async (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'templates');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error as Error, '');
    }
  },
  filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `template-${uniqueSuffix}${ext}`);
  }
});


const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
  const allowedTypes: Record<string, boolean> = {
    'image/jpeg': true,
    'image/png': true,
    'image/webp': true,
    'video/mp4': true,
    'video/3gpp': true,
    'audio/mpeg': true,
    'audio/aac': true,
    'audio/ogg': true,
    'audio/mp4': true,
    'audio/webm': true,
    'application/pdf': true,
    'application/msword': true,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true
  };

  if (allowedTypes[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Maximum 5 files per upload
  }
});


interface MediaInfo {
  url: string;
  originalName: string;
  filename: string;
  mimetype: string;
  size: number;
  contentType: 'image' | 'video' | 'audio' | 'document';
  uploadedAt: string;
  metadata: {
    size: number;
    uploadedBy: number;
    uploadedAt: Date;
  };
}


const getContentType = (mimetype: string): 'image' | 'video' | 'audio' | 'document' => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'document';
};


router.post('/upload-media',
  ensureAuthenticated,
  requirePermission('manage_templates'),
  upload.single('media'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
        return;
      }

      const user = req.user as SelectUser;
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
        return;
      }


      const file = req.file;
      const fileUrl = `/uploads/templates/${file.filename}`;
      

      const contentType = getContentType(file.mimetype);


      const stats = await fs.stat(file.path);

      const mediaInfo: MediaInfo = {
        url: fileUrl,
        originalName: file.originalname,
        filename: file.filename,
        mimetype: file.mimetype,
        size: file.size,
        contentType,
        uploadedAt: new Date().toISOString(),
        metadata: {
          size: stats.size,
          uploadedBy: user.id,
          uploadedAt: stats.birthtime
        }
      };


      if (user.companyId) {
        dataUsageTracker.trackFileUpload(user.companyId, file.size).catch(err => {
          console.error('Failed to track template media upload:', err);
        });
      }

      res.json({
        success: true,
        data: mediaInfo,
        url: fileUrl
      });

    } catch (error) {
      console.error('Template media upload error:', error);
      

      if (req.file) {
        try {
          await fs.unlink(req.file.path);
        } catch (unlinkError) {
          console.error('Error cleaning up uploaded file:', unlinkError);
        }
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload media file'
      });
    }
  }
);


router.post('/upload-multiple-media',
  ensureAuthenticated,
  requirePermission('manage_templates'),
  upload.array('media', 5),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No files uploaded'
        });
        return;
      }

      const user = req.user as SelectUser;
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
        return;
      }

      const uploadedFiles: MediaInfo[] = [];

      for (const file of req.files) {
        const fileUrl = `/uploads/templates/${file.filename}`;
        

        const contentType = getContentType(file.mimetype);


        const stats = await fs.stat(file.path);

        const mediaInfo: MediaInfo = {
          url: fileUrl,
          originalName: file.originalname,
          filename: file.filename,
          mimetype: file.mimetype,
          size: file.size,
          contentType,
          uploadedAt: new Date().toISOString(),
          metadata: {
            size: stats.size,
            uploadedBy: user.id,
            uploadedAt: stats.birthtime
          }
        };

        uploadedFiles.push(mediaInfo);
      }


      if (user.companyId) {
        const totalSize = uploadedFiles.reduce((sum, f) => sum + f.size, 0);
        dataUsageTracker.trackFileUpload(user.companyId, totalSize).catch(err => {
          console.error('Failed to track template media uploads:', err);
        });
      }

      res.json({
        success: true,
        data: uploadedFiles,
        count: uploadedFiles.length
      });

    } catch (error) {
      console.error('Template media upload error:', error);
      

      if (req.files && Array.isArray(req.files)) {
        for (const file of req.files) {
          try {
            await fs.unlink(file.path);
          } catch (unlinkError) {
            console.error('Error cleaning up uploaded file:', unlinkError);
          }
        }
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload media files'
      });
    }
  }
);


router.delete('/media/:filename',
  ensureAuthenticated,
  requirePermission('manage_templates'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { filename } = req.params;
      

      if (!filename || filename.includes('..') || filename.includes('/')) {
        res.status(400).json({
          success: false,
          error: 'Invalid filename'
        });
        return;
      }

      const filePath = path.join(process.cwd(), 'uploads', 'templates', filename);
      

      try {
        await fs.access(filePath);
      } catch (error) {
        res.status(404).json({
          success: false,
          error: 'File not found'
        });
        return;
      }


      const stats = await fs.stat(filePath);
      const fileSize = stats.size;

      await fs.unlink(filePath);


      const user = req.user as SelectUser;
      if (user?.companyId) {
        dataUsageTracker.trackFileDelete(user.companyId, fileSize).catch(err => {
          console.error('Failed to track template media deletion:', err);
        });
      }

      res.json({
        success: true,
        message: 'File deleted successfully'
      });

    } catch (error) {
      console.error('Template media delete error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete media file'
      });
    }
  }
);


router.get('/media/:filename',
  ensureAuthenticated,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { filename } = req.params;
      

      if (!filename || filename.includes('..') || filename.includes('/')) {
        res.status(400).json({
          success: false,
          error: 'Invalid filename'
        });
        return;
      }

      const filePath = path.join(process.cwd(), 'uploads', 'templates', filename);
      

      try {
        const stats = await fs.stat(filePath);
        
        res.json({
          success: true,
          data: {
            filename,
            size: stats.size,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime,
            url: `/uploads/templates/${filename}`
          }
        });
      } catch (error) {
        res.status(404).json({
          success: false,
          error: 'File not found'
        });
      }

    } catch (error) {
      console.error('Template media info error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get media file info'
      });
    }
  }
);

export default router;
