import { google } from 'googleapis';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { storage } from '../storage';

export class GoogleDriveService {
  private oauth2Client: any;
  private drive: any;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2();
  }

  private async initializeOAuth2Client(): Promise<void> {
    try {
      const config = await storage.getAppSetting('backup_config');
      const configValue = config?.value as any;
      const oauthConfig = configValue?.google_drive?.oauth_config;

      let clientId, clientSecret, redirectUri;

      if (oauthConfig?.client_id && oauthConfig?.client_secret) {
        clientId = oauthConfig.client_id;
        clientSecret = oauthConfig.client_secret;
        redirectUri = oauthConfig.redirect_uri || `${process.env.BASE_URL || 'http://localhost:5000'}/admin/settings?tab=backup`;
        
      } else {
        clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
        clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
        redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI || `${process.env.BASE_URL || 'http://localhost:5000'}/admin/settings?tab=backup`;
        
      }

      if (!clientId || !clientSecret) {
        throw new Error('Google OAuth credentials not configured. Please configure them in the backup settings or environment variables.');
      }

      this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    } catch (error) {
      console.error('Error initializing OAuth2 client:', error);
      throw error;
    }
  }

  async getAuthUrl(): Promise<string> {
    await this.initializeOAuth2Client();

    const scopes = [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.metadata.readonly'
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });
  }

  async exchangeCodeForTokens(code: string): Promise<any> {
    try {
      await this.initializeOAuth2Client();
      const { tokens } = await this.oauth2Client.getAccessToken(code);
      return tokens;
    } catch (error) {
      console.error('Error exchanging code for tokens:', error);
      throw new Error('Failed to exchange authorization code for tokens');
    }
  }

  private async initializeDrive(): Promise<void> {
    try {
      await this.initializeOAuth2Client();

      const config = await storage.getAppSetting('backup_config');
      const configValue = config?.value as any;
      const credentials = configValue?.google_drive?.credentials;

      if (!credentials) {
        throw new Error('Google Drive credentials not found');
      }

      this.oauth2Client.setCredentials(credentials);
      this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });

      if (credentials.refresh_token && this.isTokenExpired(credentials)) {
        await this.refreshAccessToken();
      }
    } catch (error) {
      console.error('Error initializing Google Drive:', error);
      throw error;
    }
  }

  private isTokenExpired(credentials: any): boolean {
    if (!credentials.expiry_date) return false;
    return Date.now() >= credentials.expiry_date;
  }

  private async refreshAccessToken(): Promise<void> {
    const maxRetries = 3;
    const retryDelays = [1000, 2000, 4000]; // Exponential backoff: 1s, 2s, 4s

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {




        const { token } = await this.oauth2Client.getAccessToken();

        if (!token) {
          throw new Error('Failed to obtain access token');
        }


        const credentials = this.oauth2Client.credentials;

        


        const config = await storage.getAppSetting('backup_config');
        const configValue = config?.value as any;
        const updatedConfig = {
          ...configValue || {},
          google_drive: {
            ...configValue?.google_drive || {},
            credentials
          }
        };
        await storage.saveAppSetting('backup_config', updatedConfig);

        
        return; // Success, exit retry loop

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[GoogleDrive] Token refresh attempt ${attempt + 1} failed:`, errorMessage);


        const isPersistentFailure =
          errorMessage.includes('invalid_grant') ||
          errorMessage.includes('Token has been expired or revoked') ||
          errorMessage.includes('invalid refresh token');

        if (isPersistentFailure) {
          console.error('[GoogleDrive] Persistent authentication failure detected. Clearing stored credentials.');


          try {
            const config = await storage.getAppSetting('backup_config');
            const configValue = config?.value as any;
            const updatedConfig = {
              ...configValue || {},
              google_drive: {
                ...configValue?.google_drive || {},
                credentials: null // Clear credentials
              }
            };
            await storage.saveAppSetting('backup_config', updatedConfig);
            
          } catch (clearError) {
            console.error('[GoogleDrive] Failed to clear credentials:', clearError);
          }

          throw new Error('Google Drive authentication failed. Please re-authenticate in the backup settings.');
        }


        if (attempt < maxRetries - 1) {
          const delay = retryDelays[attempt];
          
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {

          console.error('[GoogleDrive] All token refresh attempts failed');
          throw new Error(`Failed to refresh Google Drive access token after ${maxRetries} attempts: ${errorMessage}`);
        }
      }
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      await this.initializeDrive();

      const response = await this.drive.about.get({
        fields: 'user,storageQuota'
      });

      return {
        success: true,
        message: 'Google Drive connection successful',
        details: {
          user: response.data.user,
          storage: response.data.storageQuota
        }
      };
    } catch (error) {
      console.error('Google Drive connection test failed:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async ensureBackupFolder(): Promise<string> {
    try {
      const folderName = 'PowerChat Backups';

      const response = await this.drive.files.list({
        q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)'
      });

      if (response.data.files && response.data.files.length > 0) {
        return response.data.files[0].id;
      }

      const folderResponse = await this.drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder'
        },
        fields: 'id'
      });

      const folderId = folderResponse.data.id;

      const config = await storage.getAppSetting('backup_config');
      const configValue = config?.value as any;
      const updatedConfig = {
        ...configValue || {},
        google_drive: {
          ...configValue?.google_drive || {},
          folder_id: folderId
        }
      };
      await storage.saveAppSetting('backup_config', updatedConfig);

      return folderId;
    } catch (error) {
      console.error('Error ensuring backup folder:', error);
      throw error;
    }
  }

  async uploadBackup(filePath: string, filename: string): Promise<{ fileId: string; size: number }> {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.initializeDrive();
        const folderId = await this.ensureBackupFolder();


        const stats = await fs.stat(filePath);
        const fileSize = stats.size;




        const fileStream = createReadStream(filePath);


        let uploadedBytes = 0;
        let lastLoggedPercent = 0;

        fileStream.on('data', (chunk) => {
          uploadedBytes += chunk.length;
          const percent = Math.floor((uploadedBytes / fileSize) * 100);


          if (percent >= lastLoggedPercent + 10) {

            lastLoggedPercent = percent;
          }
        });


        const response = await this.drive.files.create({
          requestBody: {
            name: filename,
            parents: [folderId],
            description: `PowerChat database backup created on ${new Date().toISOString()}`
          },
          media: {
            mimeType: 'application/octet-stream',
            body: fileStream
          },
          fields: 'id, size',

          supportsAllDrives: true
        }, {

          onUploadProgress: (evt: any) => {
            if (evt.bytesRead) {
              const percent = Math.floor((evt.bytesRead / fileSize) * 100);
              if (percent >= lastLoggedPercent + 10) {

                lastLoggedPercent = percent;
              }
            }
          }
        });

        

        return {
          fileId: response.data.id || '',
          size: parseInt(response.data.size || '0')
        };

      } catch (error: any) {
        console.error(`[Google Drive Upload] Attempt ${attempt}/${maxRetries} failed:`, error);


        const isRetryable =
          error.code === 'ECONNRESET' ||
          error.code === 'ETIMEDOUT' ||
          error.code === 'ENOTFOUND' ||
          (error.response && [429, 500, 502, 503, 504].includes(error.response.status));

        if (attempt < maxRetries && isRetryable) {

          const delay = baseDelay * Math.pow(2, attempt - 1);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }


        console.error('[Google Drive Upload] Upload failed after all retries');
        throw error;
      }
    }

    throw new Error('Upload failed after maximum retries');
  }

  async downloadBackup(filename: string, localPath: string): Promise<void> {
    try {
      await this.initializeDrive();
      const folderId = await this.ensureBackupFolder();

      const response = await this.drive.files.list({
        q: `name='${filename}' and parents in '${folderId}' and trashed=false`,
        fields: 'files(id, name, size)'
      });

      if (!response.data.files || response.data.files.length === 0) {
        throw new Error(`Backup file not found in Google Drive: ${filename}`);
      }

      const file = response.data.files[0];
      

      const fileResponse = await this.drive.files.get({
        fileId: file.id,
        alt: 'media'
      }, { responseType: 'stream' });

      const writeStream = require('fs').createWriteStream(localPath);

      return new Promise((resolve, reject) => {
        fileResponse.data
          .on('end', () => {
            
            resolve();
          })
          .on('error', (error: any) => {
            console.error('Error downloading backup:', error);
            reject(error);
          })
          .pipe(writeStream);
      });
    } catch (error) {
      console.error('Error downloading backup from Google Drive:', error);
      throw error;
    }
  }

  async deleteBackup(filename: string): Promise<void> {
    try {
      await this.initializeDrive();
      const folderId = await this.ensureBackupFolder();

      const response = await this.drive.files.list({
        q: `name='${filename}' and parents in '${folderId}' and trashed=false`,
        fields: 'files(id, name)'
      });

      if (!response.data.files || response.data.files.length === 0) {
        
        return;
      }

      const file = response.data.files[0];

      await this.drive.files.delete({
        fileId: file.id
      });

      
    } catch (error) {
      console.error('Error deleting backup from Google Drive:', error);
      throw error;
    }
  }

  async listBackups(): Promise<Array<{ id: string; name: string; size: number; createdTime: string }>> {
    try {
      await this.initializeDrive();
      const folderId = await this.ensureBackupFolder();

      const response = await this.drive.files.list({
        q: `parents in '${folderId}' and trashed=false`,
        fields: 'files(id, name, size, createdTime)',
        orderBy: 'createdTime desc'
      });

      return response.data.files || [];
    } catch (error) {
      console.error('Error listing backups from Google Drive:', error);
      return [];
    }
  }

  async getStorageQuota(): Promise<{ used: number; limit: number; available: number }> {
    try {
      await this.initializeDrive();

      const response = await this.drive.about.get({
        fields: 'storageQuota'
      });

      const quota = response.data.storageQuota;
      const used = parseInt(quota.usage || '0');
      const limit = parseInt(quota.limit || '0');
      const available = limit - used;

      return { used, limit, available };
    } catch (error) {
      console.error('Error getting Google Drive storage quota:', error);
      return { used: 0, limit: 0, available: 0 };
    }
  }

  async saveOAuthConfig(config: {
    client_id: string;
    client_secret: string;
    redirect_uri?: string;
  }): Promise<{ success: boolean; message: string }> {
    try {
      if (!config.client_id || !config.client_secret) {
        throw new Error('Client ID and Client Secret are required');
      }

      const testClient = new google.auth.OAuth2(
        config.client_id,
        config.client_secret,
        config.redirect_uri || `${process.env.BASE_URL || 'http://localhost:5000'}/admin/settings?tab=backup`
      );

      const scopes = ['https://www.googleapis.com/auth/drive.file'];
      testClient.generateAuthUrl({
        access_type: 'offline',
        scope: scopes
      });

      const backupConfig = await storage.getAppSetting('backup_config');
      const backupConfigValue = backupConfig?.value as any;
      const updatedConfig = {
        ...backupConfigValue || {},
        google_drive: {
          ...backupConfigValue?.google_drive || {},
          oauth_config: {
            client_id: config.client_id,
            client_secret: config.client_secret,
            redirect_uri: config.redirect_uri || `${process.env.BASE_URL || 'http://localhost:5000'}/admin/settings?tab=backup`,
            configured_at: new Date().toISOString()
          }
        }
      };

      await storage.saveAppSetting('backup_config', updatedConfig);

      
      return {
        success: true,
        message: 'Google OAuth credentials saved successfully'
      };
    } catch (error) {
      console.error('Error saving OAuth config:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to save OAuth configuration'
      };
    }
  }

  async getOAuthConfig(): Promise<{
    client_id?: string;
    redirect_uri?: string;
    configured: boolean;
    configured_at?: string;
    source?: 'ui' | 'environment';
  }> {
    try {
      const config = await storage.getAppSetting('backup_config');
      const configValue = config?.value as any;
      const oauthConfig = configValue?.google_drive?.oauth_config;

      if (oauthConfig?.client_id && oauthConfig?.client_secret) {
        return {
          client_id: oauthConfig.client_id,
          redirect_uri: oauthConfig.redirect_uri,
          configured: true,
          configured_at: oauthConfig.configured_at,
          source: 'ui'
        };
      }

      if (process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET) {
        return {
          client_id: process.env.GOOGLE_DRIVE_CLIENT_ID,
          redirect_uri: process.env.GOOGLE_DRIVE_REDIRECT_URI || `${process.env.BASE_URL || 'http://localhost:5000'}/admin/settings?tab=backup`,
          configured: true,
          configured_at: 'Environment Variables',
          source: 'environment'
        };
      }

      return { configured: false };
    } catch (error) {
      console.error('Error getting OAuth config:', error);
      return { configured: false };
    }
  }

  async clearOAuthConfig(): Promise<{ success: boolean; message: string }> {
    try {
      const backupConfig = await storage.getAppSetting('backup_config');
      const backupConfigValue = backupConfig?.value as any;
      const updatedConfig = {
        ...backupConfigValue || {},
        google_drive: {
          ...backupConfigValue?.google_drive || {},
          oauth_config: null,
          credentials: null,
          enabled: false
        }
      };

      await storage.saveAppSetting('backup_config', updatedConfig);

      
      return {
        success: true,
        message: 'Google OAuth credentials cleared successfully'
      };
    } catch (error) {
      console.error('Error clearing OAuth config:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to clear OAuth configuration'
      };
    }
  }

  async validateOAuthConfig(): Promise<{ valid: boolean; message: string; details?: any }> {
    try {
      await this.initializeOAuth2Client();

      const scopes = ['https://www.googleapis.com/auth/drive.file'];
      const authUrl = this.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes
      });

      if (authUrl) {
        return {
          valid: true,
          message: 'OAuth credentials are valid',
          details: { auth_url_generated: true }
        };
      } else {
        return {
          valid: false,
          message: 'Failed to generate authorization URL'
        };
      }
    } catch (error) {
      console.error('OAuth validation error:', error);
      return {
        valid: false,
        message: error instanceof Error ? error.message : 'OAuth validation failed'
      };
    }
  }
}
