import fs from 'fs/promises';
import path from 'path';

/**
 * Ensure upload directories exist
 */
export async function ensureUploadDirectories(): Promise<void> {
  const uploadDirs = [
    path.join(process.cwd(), 'uploads'),
    path.join(process.cwd(), 'uploads', 'knowledge-base'),
    path.join(process.cwd(), 'uploads', 'knowledge-base', 'temp')
  ];

  for (const dir of uploadDirs) {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });

    }
  }
}

/**
 * Clean up temporary files older than specified age
 */
export async function cleanupTempFiles(maxAgeHours: number = 24): Promise<void> {
  const tempDir = path.join(process.cwd(), 'uploads', 'knowledge-base', 'temp');
  const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
  
  try {
    const files = await fs.readdir(tempDir);
    const now = Date.now();
    
    for (const file of files) {
      const filePath = path.join(tempDir, file);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtime.getTime() > maxAge) {
        await fs.unlink(filePath);

      }
    }
  } catch (error) {
    console.error('Error cleaning up temp files:', error);
  }
}

/**
 * Clean up old auth background file when a new one is uploaded
 */
export async function cleanupOldAuthBackground(oldUrl: string | undefined): Promise<void> {
  if (!oldUrl) {
    return;
  }

  try {

    const urlPath = oldUrl.split('?')[0];
    const filename = path.basename(urlPath);
    
    if (!filename) {
      return;
    }

    const filePath = path.join(process.cwd(), 'uploads', 'branding', filename);
    
    try {
      await fs.access(filePath);
      await fs.unlink(filePath);
    } catch (error) {


    }
  } catch (error) {

    console.error('Error cleaning up old auth background:', error);
  }
}