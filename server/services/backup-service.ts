import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { storage } from '../storage';
import { getPool } from '../db';
import { storageProviderRegistry } from './storage-providers/storage-provider-registry';

const execAsync = promisify(exec);


const restoreStatusStore = new Map<string, {
  restoreId: string;
  backupId: string;
  status: string;
  message: string;
  percent?: number;
  timestamp: string;
}>();


function execCommand(command: string, args: string[], options: any): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {

    const child = spawn(command, args, options);
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => {
      console.error(`Command spawn error:`, error);
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const errorMsg = `Command failed with code ${code}${stderr ? ': ' + stderr : ''}${stdout ? '\nOutput: ' + stdout : ''}`;
        console.error(errorMsg);
        reject(new Error(errorMsg));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

export interface BackupConfig {
  enabled: boolean;
  schedules: BackupSchedule[];
  retention_days: number;
  storage_locations: string[];
  dump_format: 'sql' | 'custom'; // Format for pg_dump
  google_drive: {
    enabled: boolean;
    folder_id: string | null;
    credentials: any;
  };
  encryption: {
    enabled: boolean;
    key: string | null;
  };
}

export interface BackupSchedule {
  id: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string;
  day_of_week?: number;
  day_of_month?: number;
  enabled: boolean;
  storage_locations: string[];
}

export interface BackupRecord {
  id: string;
  filename: string;
  type: 'manual' | 'scheduled';
  description: string;
  size: number;
  created_at: Date;
  status: 'creating' | 'completed' | 'failed' | 'uploading' | 'uploaded';
  storage_locations: string[];
  checksum: string;
  error_message?: string;
  metadata: {
    database_size: number;
    table_count: number;
    row_count: number;
    compression_ratio?: number;
    encryption_enabled: boolean;
    app_version?: string;
    pg_version?: string;
    instance_id?: string;
    dump_format?: 'sql' | 'custom';
    schema_checksum?: string;
  };
}

export class BackupService {
  private backupDir: string;
  private tempDir: string;

  constructor() {

    const isDocker = process.env.DOCKER_CONTAINER === 'true';
    this.backupDir = isDocker
      ? path.join(process.cwd(), 'volumes', 'backups')
      : path.join(process.cwd(), 'backups');
    this.tempDir = path.join(process.cwd(), 'temp', 'backups');
    this.ensureDirectories();
    this.initializeStorageProviders();
  }

  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Error creating backup directories:', error);
    }
  }

  private initializeStorageProviders(): void {

    storageProviderRegistry.initializeDefaultProviders(this.backupDir);
  }

  private async reconnectDatabase(): Promise<void> {
    try {
      


      
      const { reinitializePool } = await import('../db');
      reinitializePool();


      await new Promise(resolve => setTimeout(resolve, 1000));


      
      const client = await getPool().connect();
      try {
        await client.query('SELECT 1 as test');
        
      } finally {
        client.release();
      }

      
      
      
    } catch (error) {
      console.error('Error reconnecting to database:', error);
      console.error('Database connection may be in an inconsistent state');
      console.warn('CRITICAL: Server restart is strongly recommended');
      throw error;
    }
  }

  async createBackup(options: {
    type: 'manual' | 'scheduled';
    description: string;
    storage_locations: string[];
    dump_format?: 'sql' | 'custom';
  }): Promise<BackupRecord> {
    const backupId = crypto.randomUUID();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');


    const config = await storage.getAppSetting('backup_config');
    const dumpFormat = options.dump_format || (config?.value as any)?.dump_format || 'custom';


    const appVersion = process.env.npm_package_version || 'unknown';
    const instanceId = process.env.INSTANCE_ID || process.env.HOSTNAME || 'default';


    let pgVersion = 'unknown';
    try {
      const versionResult = await getPool().query('SELECT version()');
      const versionString = versionResult.rows[0]?.version || '';
      const match = versionString.match(/PostgreSQL (\d+\.\d+)/);
      pgVersion = match ? match[1] : versionString.substring(0, 50);
    } catch (error) {
      console.error('Failed to get PostgreSQL version:', error);
    }


    const extension = dumpFormat === 'custom' ? 'backup' : 'sql';
    const filename = `powerchat-backup-v${appVersion}-pg${pgVersion}-${instanceId}-${timestamp}.${extension}`;
    const filePath = path.join(this.backupDir, filename);

    const backup: BackupRecord = {
      id: backupId,
      filename,
      type: options.type,
      description: options.description,
      size: 0,
      created_at: new Date(),
      status: 'creating',
      storage_locations: options.storage_locations,
      checksum: '',
      metadata: {
        database_size: 0,
        table_count: 0,
        row_count: 0,
        encryption_enabled: false
      }
    };

    try {
      await this.saveBackupRecord(backup);


      const tools = await this.checkPostgresTools();
      if (!tools.pg_dump.available) {
        throw new Error(`pg_dump is not available: ${tools.pg_dump.error}. Please install PostgreSQL client tools.`);
      }

      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) {
        throw new Error('DATABASE_URL not configured');
      }

      const url = new URL(dbUrl);
      const dbConfig = {
        host: url.hostname,
        port: url.port || '5432',
        database: url.pathname.slice(1),
        username: url.username,
        password: url.password
      };


      const pgDumpArgs = [
        `--host=${dbConfig.host}`,
        `--port=${dbConfig.port}`,
        `--username=${dbConfig.username}`,
        `--dbname=${dbConfig.database}`,
        '--verbose',
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        dumpFormat === 'custom' ? '--format=custom' : '--format=plain',
        `--file=${filePath}`
      ];


      if (dumpFormat === 'sql') {


      }

      const pgDumpCmd = ['pg_dump', ...pgDumpArgs].join(' ');

      const env = { ...process.env, PGPASSWORD: dbConfig.password };

      

      const { stdout, stderr } = await execAsync(pgDumpCmd, { env });

     

      const stats = await fs.stat(filePath);
      backup.size = stats.size;

      backup.checksum = await this.calculateChecksum(filePath);

      const dbMetadata = await this.getDatabaseMetadata();
      backup.metadata = {
        ...dbMetadata,
        app_version: appVersion,
        pg_version: pgVersion,
        instance_id: instanceId,
        dump_format: dumpFormat,
        schema_checksum: await this.calculateSchemaChecksum()
      };

      backup.status = 'completed';

      await this.saveBackupRecord(backup);

      await this.handleStorageLocations(backup);

      
      return backup;

    } catch (error) {
      console.error('Error creating backup:', error);
      backup.status = 'failed';
      backup.error_message = error instanceof Error ? error.message : 'Unknown error';
      await this.saveBackupRecord(backup);
      throw error;
    }
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  private async calculateSchemaChecksum(): Promise<string> {
    try {

      const schemaResult = await getPool().query(`
        SELECT
          table_name,
          column_name,
          data_type,
          is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
      `);

      const schemaString = JSON.stringify(schemaResult.rows);
      return crypto.createHash('sha256').update(schemaString).digest('hex');
    } catch (error) {
      console.error('Error calculating schema checksum:', error);
      return 'unknown';
    }
  }

  private async getDatabaseMetadata(): Promise<BackupRecord['metadata']> {
    try {
      const sizeResult = await getPool().query(`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size,
               pg_database_size(current_database()) as size_bytes
      `);

      const tableResult = await getPool().query(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `);

      const rowResult = await getPool().query(`
        SELECT SUM(n_tup_ins + n_tup_upd) as total_rows
        FROM pg_stat_user_tables
      `);

      return {
        database_size: parseInt(sizeResult.rows[0]?.size_bytes || '0'),
        table_count: parseInt(tableResult.rows[0]?.count || '0'),
        row_count: parseInt(rowResult.rows[0]?.total_rows || '0'),
        encryption_enabled: false
      };
    } catch (error) {
      console.error('Error getting database metadata:', error);
      return {
        database_size: 0,
        table_count: 0,
        row_count: 0,
        encryption_enabled: false
      };
    }
  }

  private async handleStorageLocations(backup: BackupRecord): Promise<void> {
    for (const location of backup.storage_locations) {

      if (location === 'local') {
        continue;
      }

      try {
        backup.status = 'uploading';
        await this.saveBackupRecord(backup);


        const provider = storageProviderRegistry.get(location);
        if (!provider) {
          console.error(`Storage provider not found: ${location}`);
          backup.error_message = `Storage provider not found: ${location}`;
          await this.saveBackupRecord(backup);
          continue;
        }


        const isAvailable = await provider.isAvailable();
        if (!isAvailable) {
          console.error(`Storage provider not available: ${location}`);
          backup.error_message = `Storage provider not available: ${location}`;
          await this.saveBackupRecord(backup);
          continue;
        }


        const filePath = path.join(this.backupDir, backup.filename);
        await provider.uploadBackup({
          filename: backup.filename,
          filePath: filePath,
          metadata: backup.metadata
        });

        backup.status = 'uploaded';
        await this.saveBackupRecord(backup);
      } catch (error) {
        console.error(`Error uploading to ${location}:`, error);
        backup.error_message = `${location} upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        await this.saveBackupRecord(backup);
      }
    }
  }

  private async saveBackupRecord(backup: BackupRecord): Promise<void> {
    try {
      const { db } = await import('../db');
      const { databaseBackups } = await import('../../shared/schema');
      const { eq } = await import('drizzle-orm');


      const existing = await db.select().from(databaseBackups).where(eq(databaseBackups.id, backup.id));

      const backupData = {
        id: backup.id,
        filename: backup.filename,
        type: backup.type,
        description: backup.description,
        size: backup.size,
        status: backup.status,
        storageLocations: backup.storage_locations,
        checksum: backup.checksum,
        errorMessage: backup.error_message || null,
        databaseSize: backup.metadata.database_size,
        tableCount: backup.metadata.table_count,
        rowCount: backup.metadata.row_count,
        compressionRatio: backup.metadata.compression_ratio || null,
        encryptionEnabled: backup.metadata.encryption_enabled,
        appVersion: backup.metadata.app_version || null,
        pgVersion: backup.metadata.pg_version || null,
        instanceId: backup.metadata.instance_id || null,
        dumpFormat: (backup.metadata.dump_format as 'sql' | 'custom') || 'sql',
        schemaChecksum: backup.metadata.schema_checksum || null,
        updatedAt: new Date()
      };

      if (existing.length > 0) {

        await db.update(databaseBackups)
          .set(backupData)
          .where(eq(databaseBackups.id, backup.id));
      } else {

        await db.insert(databaseBackups).values({
          ...backupData,
          createdAt: backup.created_at
        });
      }
    } catch (error) {
      console.error('Error saving backup record:', error);

      try {
        const backups = await this.getBackupRecordsFromSettings();
        const existingIndex = backups.findIndex(b => b.id === backup.id);
        if (existingIndex >= 0) {
          backups[existingIndex] = backup;
        } else {
          backups.push(backup);
        }
        await storage.saveAppSetting('backup_records', backups);
      } catch (fallbackError) {
        console.error('Fallback save also failed:', fallbackError);
      }
    }
  }

  private async getBackupRecords(): Promise<BackupRecord[]> {
    try {
      const { db } = await import('../db');
      const { databaseBackups } = await import('../../shared/schema');
      const { desc } = await import('drizzle-orm');

      const records = await db.select().from(databaseBackups).orderBy(desc(databaseBackups.createdAt));

      return records.map(record => ({
        id: record.id,
        filename: record.filename,
        type: record.type,
        description: record.description,
        size: record.size,
        created_at: record.createdAt,
        status: record.status,
        storage_locations: record.storageLocations as string[],
        checksum: record.checksum,
        error_message: record.errorMessage || undefined,
        metadata: {
          database_size: record.databaseSize || 0,
          table_count: record.tableCount || 0,
          row_count: record.rowCount || 0,
          compression_ratio: record.compressionRatio || undefined,
          encryption_enabled: record.encryptionEnabled || false,
          app_version: record.appVersion || undefined,
          pg_version: record.pgVersion || undefined,
          instance_id: record.instanceId || undefined,
          dump_format: record.dumpFormat || undefined,
          schema_checksum: record.schemaChecksum || undefined
        }
      }));
    } catch (error) {
      console.error('Error getting backup records from database:', error);

      return this.getBackupRecordsFromSettings();
    }
  }

  private async getBackupRecordsFromSettings(): Promise<BackupRecord[]> {
    try {
      const setting = await storage.getAppSetting('backup_records');
      return (setting?.value as BackupRecord[]) || [];
    } catch (error) {
      console.error('Error getting backup records from settings:', error);
      return [];
    }
  }

  async listBackups(): Promise<BackupRecord[]> {
    const records = await this.getBackupRecords();

    return records.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  async getBackup(id: string): Promise<BackupRecord | null> {
    const records = await this.getBackupRecords();
    return records.find(r => r.id === id) || null;
  }

  async getBackupFilePath(backup: BackupRecord): Promise<string> {
    return path.join(this.backupDir, backup.filename);
  }

  async deleteBackup(id: string): Promise<void> {
    const backup = await this.getBackup(id);
    if (!backup) {
      throw new Error('Backup not found');
    }

    try {

      const filePath = path.join(this.backupDir, backup.filename);
      try {
        await fs.unlink(filePath);
      } catch (error) {

      }


      for (const location of backup.storage_locations) {
        if (location === 'local') continue;

        try {
          const provider = storageProviderRegistry.get(location);
          if (provider) {
            await provider.deleteBackup(backup.filename);
          }
        } catch (error) {
          console.error(`Error deleting from ${location}:`, error);
        }
      }


      try {
        const { db } = await import('../db');
        const { databaseBackups } = await import('../../shared/schema');
        const { eq } = await import('drizzle-orm');

        await db.delete(databaseBackups).where(eq(databaseBackups.id, id));
      } catch (error) {
        console.error('Error deleting from database:', error);

        const records = await this.getBackupRecordsFromSettings();
        const filteredRecords = records.filter(r => r.id !== id);
        await storage.saveAppSetting('backup_records', filteredRecords);
      }

    } catch (error) {
      console.error('Error deleting backup:', error);
      throw error;
    }
  }

  async preflightRestoreChecks(id: string): Promise<{
    success: boolean;
    checks: Array<{
      name: string;
      status: 'passed' | 'failed' | 'warning';
      message: string;
      critical: boolean;
    }>;
    canProceed: boolean;
  }> {
    const checks: Array<{
      name: string;
      status: 'passed' | 'failed' | 'warning';
      message: string;
      critical: boolean;
    }> = [];


    let backup: BackupRecord | null = null;
    try {
      backup = await this.getBackup(id);
      if (!backup) {
        checks.push({
          name: 'Backup Existence',
          status: 'failed',
          message: 'Backup not found',
          critical: true
        });
      } else if (backup.status === 'failed') {
        checks.push({
          name: 'Backup Status',
          status: 'failed',
          message: 'Backup is marked as failed',
          critical: true
        });
      } else if (backup.status === 'creating') {
        checks.push({
          name: 'Backup Status',
          status: 'failed',
          message: 'Backup is still being created',
          critical: true
        });
      } else {
        checks.push({
          name: 'Backup Status',
          status: 'passed',
          message: 'Backup is valid and ready',
          critical: true
        });


        if (backup.metadata) {
          const currentPgVersion = await this.getCurrentPgVersion();
          const backupPgVersion = backup.metadata.pg_version;

          if (backupPgVersion && backupPgVersion !== 'unknown') {
            const backupMajor = parseInt(backupPgVersion.split('.')[0]);
            const currentMajor = parseInt(currentPgVersion.split('.')[0]);

            if (backupMajor > currentMajor) {
              checks.push({
                name: 'PostgreSQL Version Compatibility',
                status: 'warning',
                message: `Backup from PostgreSQL ${backupPgVersion}, current is ${currentPgVersion}. Restoring from newer version may have compatibility issues.`,
                critical: false
              });
            } else if (backupMajor < currentMajor) {
              checks.push({
                name: 'PostgreSQL Version Compatibility',
                status: 'passed',
                message: `Backup from PostgreSQL ${backupPgVersion}, current is ${currentPgVersion}. Forward compatibility should work.`,
                critical: false
              });
            } else {
              checks.push({
                name: 'PostgreSQL Version Compatibility',
                status: 'passed',
                message: `PostgreSQL versions match: ${currentPgVersion}`,
                critical: false
              });
            }
          }


          if (backup.metadata.instance_id) {
            const currentInstanceId = process.env.INSTANCE_ID || process.env.HOSTNAME || 'default';
            if (backup.metadata.instance_id !== currentInstanceId) {
              checks.push({
                name: 'Instance Compatibility',
                status: 'warning',
                message: `Backup from different instance: ${backup.metadata.instance_id} (current: ${currentInstanceId})`,
                critical: false
              });
            }
          }
        }
      }
    } catch (error) {
      checks.push({
        name: 'Backup Existence',
        status: 'failed',
        message: `Failed to check backup: ${error instanceof Error ? error.message : String(error)}`,
        critical: true
      });
    }


    try {
      await execAsync('psql --version');
      checks.push({
        name: 'psql Tool',
        status: 'passed',
        message: 'psql is available',
        critical: true
      });
    } catch (error) {
      checks.push({
        name: 'psql Tool',
        status: 'failed',
        message: 'psql command not found. PostgreSQL client tools must be installed.',
        critical: true
      });
    }

    try {
      await execAsync('pg_restore --version');
      checks.push({
        name: 'pg_restore Tool',
        status: 'passed',
        message: 'pg_restore is available',
        critical: false
      });
    } catch (error) {
      checks.push({
        name: 'pg_restore Tool',
        status: 'warning',
        message: 'pg_restore not found (only needed for custom format backups)',
        critical: false
      });
    }


    try {
      const client = await getPool().connect();
      await client.query('SELECT 1');
      client.release();
      checks.push({
        name: 'Database Connectivity',
        status: 'passed',
        message: 'Database connection successful',
        critical: true
      });
    } catch (error) {
      checks.push({
        name: 'Database Connectivity',
        status: 'failed',
        message: `Cannot connect to database: ${error instanceof Error ? error.message : String(error)}`,
        critical: true
      });
    }


    try {
      const client = await getPool().connect();
      const result = await client.query(`
        SELECT extname FROM pg_extension
        WHERE extname IN ('uuid-ossp', 'pgcrypto')
      `);
      client.release();

      const installedExtensions = result.rows.map(row => row.extname);
      if (installedExtensions.length > 0) {
        checks.push({
          name: 'PostgreSQL Extensions',
          status: 'passed',
          message: `Extensions available: ${installedExtensions.join(', ')}`,
          critical: false
        });
      } else {
        checks.push({
          name: 'PostgreSQL Extensions',
          status: 'warning',
          message: 'No common extensions found (may be required by backup)',
          critical: false
        });
      }
    } catch (error) {
      checks.push({
        name: 'PostgreSQL Extensions',
        status: 'warning',
        message: 'Could not check extensions',
        critical: false
      });
    }


    try {
      const tmpDir = process.env.TEMP || process.env.TMP || '/tmp';
      const { stdout } = await execAsync(process.platform === 'win32'
        ? `powershell "Get-PSDrive -Name ${tmpDir.charAt(0)} | Select-Object -ExpandProperty Free"`
        : `df -k "${tmpDir}" | tail -1 | awk '{print $4}'`);

      const freeSpaceKB = parseInt(stdout.trim());
      const freeSpaceGB = freeSpaceKB / (1024 * 1024);

      if (freeSpaceGB > 5) {
        checks.push({
          name: 'Disk Space',
          status: 'passed',
          message: `${freeSpaceGB.toFixed(2)} GB free in temp directory`,
          critical: false
        });
      } else if (freeSpaceGB > 1) {
        checks.push({
          name: 'Disk Space',
          status: 'warning',
          message: `Only ${freeSpaceGB.toFixed(2)} GB free in temp directory`,
          critical: false
        });
      } else {
        checks.push({
          name: 'Disk Space',
          status: 'failed',
          message: `Insufficient disk space: ${freeSpaceGB.toFixed(2)} GB free`,
          critical: true
        });
      }
    } catch (error) {
      checks.push({
        name: 'Disk Space',
        status: 'warning',
        message: 'Could not check disk space',
        critical: false
      });
    }


    try {
      await storage.getAppSetting('system.maintenanceMode');
      checks.push({
        name: 'Maintenance Mode',
        status: 'passed',
        message: 'Maintenance mode can be enabled',
        critical: true
      });
    } catch (error) {
      checks.push({
        name: 'Maintenance Mode',
        status: 'failed',
        message: 'Cannot access maintenance mode settings',
        critical: true
      });
    }


    const criticalFailures = checks.filter(c => c.critical && c.status === 'failed');
    const canProceed = criticalFailures.length === 0;

    return {
      success: canProceed,
      checks,
      canProceed
    };
  }

  /**
   * Drop and recreate the database using PostgreSQL shell commands
   * Used when user explicitly requests complete database drop before restore
   * Uses execCommand for reliable shell execution outside the app's pool
   */
  private async dropAndRecreateDatabase(dbConfig: {
    host: string;
    port: string;
    database: string;
    username: string;
    password: string;
  }): Promise<void> {
    const env = { ...process.env, PGPASSWORD: dbConfig.password };

    try {
      
      

      const terminateCommand = `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${dbConfig.database}';`;
      const terminateArgs = [
        `--host=${dbConfig.host}`,
        `--port=${dbConfig.port}`,
        `--username=${dbConfig.username}`,
        '--dbname=postgres',
        '--command', terminateCommand
      ];

      try {
        const { stdout: terminateStdout, stderr: terminateStderr } = await execCommand('psql', terminateArgs, { env });
        
        if (terminateStderr && !terminateStderr.includes('does not exist')) {
          
        }
      } catch (error) {
      }


      await new Promise(resolve => setTimeout(resolve, 2000));


      
      const dropCommand = `DROP DATABASE IF EXISTS "${dbConfig.database}";`;
      const dropArgs = [
        `--host=${dbConfig.host}`,
        `--port=${dbConfig.port}`,
        `--username=${dbConfig.username}`,
        '--dbname=postgres',
        '--command', dropCommand
      ];

      const { stdout: dropStdout, stderr: dropStderr } = await execCommand('psql', dropArgs, { env });
      
      if (dropStderr && !dropStderr.includes('does not exist')) {
        
      }


      
      const createCommand = `CREATE DATABASE "${dbConfig.database}";`;
      const createArgs = [
        `--host=${dbConfig.host}`,
        `--port=${dbConfig.port}`,
        `--username=${dbConfig.username}`,
        '--dbname=postgres',
        '--command', createCommand
      ];

      const { stdout: createStdout, stderr: createStderr } = await execCommand('psql', createArgs, { env });
      
      if (createStderr) {
        
      }


      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error('[Restore] Error dropping/recreating database:', error);
      throw new Error(`Failed to drop and recreate database: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async restoreBackup(id: string, options?: {
    userId?: number;
    userEmail?: string;
    confirmationText?: string;
    dropDatabase?: boolean;
  }): Promise<{
    success: boolean;
    message: string;
    details?: any;
    restoreId?: string;
  }> {
    const restoreId = crypto.randomUUID();
    const startTime = Date.now();


    const { broadcastToAll } = await import('../utils/websocket');


    const emitProgress = (status: string, message: string, percent?: number) => {
      const progressData = {
        restoreId,
        backupId: id,
        status,
        message,
        percent,
        timestamp: new Date().toISOString()
      };


      restoreStatusStore.set(restoreId, progressData);


      broadcastToAll({
        type: 'backup:restore:progress',
        data: progressData
      });
    };

    emitProgress('started', 'Restore process initiated', 0);
    await this.logRestoreAttempt(restoreId, id, 'started', options?.userId, options?.userEmail);

    const backup = await this.getBackup(id);
    if (!backup) {
      emitProgress('failed', 'Backup not found', 0);
      await this.logRestoreAttempt(restoreId, id, 'failed', options?.userId, options?.userEmail, 'Backup not found');
      throw new Error('Backup not found');
    }

    if (backup.status === 'creating' || backup.status === 'failed') {
      const errorMsg = `Cannot restore backup with status: ${backup.status}`;
      emitProgress('failed', errorMsg, 0);
      await this.logRestoreAttempt(restoreId, id, 'failed', options?.userId, options?.userEmail, errorMsg);
      return {
        success: false,
        message: errorMsg,
        restoreId
      };
    }


    try {
      emitProgress('maintenance_mode', 'Enabling maintenance mode...', 2);
      await storage.saveAppSetting('system.maintenanceMode', true);


      broadcastToAll({
        type: 'system:maintenance:enabled',
        data: {
          reason: 'Database restore in progress',
          restoreId,
          timestamp: new Date().toISOString()
        }
      });

      


      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Failed to enable maintenance mode:', error);
      emitProgress('failed', 'Failed to enable maintenance mode', 0);
      throw new Error('Failed to enable maintenance mode');
    }

    try {
      const filePath = path.join(this.backupDir, backup.filename);

      let fileDownloaded = false;
      try {
        await fs.access(filePath);
        emitProgress('file_ready', 'Backup file found locally', 10);
      } catch (error) {
        if (backup.storage_locations.includes('google_drive')) {
          emitProgress('downloading', 'Downloading backup from Google Drive...', 5);
          const { GoogleDriveService } = await import('./google-drive-service');
          const googleDriveService = new GoogleDriveService();
          await googleDriveService.downloadBackup(backup.filename, filePath);
          fileDownloaded = true;
          emitProgress('download_completed', 'Download completed successfully', 15);
        } else {
          const errorMsg = 'Backup file not found locally or in cloud storage';
          emitProgress('failed', errorMsg, 0);
          throw new Error(errorMsg);
        }
      }

      emitProgress('verifying', 'Verifying backup integrity...', 20);
      const verificationResult = await this.verifyBackup(id);
      if (!verificationResult.valid) {
        const errorMsg = `Backup verification failed: ${verificationResult.message}`;
        emitProgress('failed', errorMsg, 0);
        await this.logRestoreAttempt(restoreId, id, 'failed', options?.userId, options?.userEmail, errorMsg);
        return {
          success: false,
          message: errorMsg,
          restoreId
        };
      }

      emitProgress('verify_completed', 'Backup verification successful', 30);

      const currentMetadata = await this.getDatabaseMetadata();

      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) {
        throw new Error('DATABASE_URL not configured');
      }

      const url = new URL(dbUrl);
      const dbConfig = {
        host: url.hostname,
        port: url.port || '5432',
        database: url.pathname.slice(1),
        username: url.username,
        password: url.password
      };

      const env = { ...process.env, PGPASSWORD: dbConfig.password };

      emitProgress('preparing', 'Preparing database for restore...', 35);


      const fileHandle = await fs.open(filePath, 'r');
      const buffer = Buffer.alloc(100 * 1024); // 100KB buffer
      const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, 0);
      await fileHandle.close();
      const fileHeader = buffer.toString('utf8', 0, bytesRead);

      const needsExclusiveAccess = fileHeader.includes('DROP DATABASE') ||
                                    fileHeader.includes('CREATE DATABASE') ||
                                    fileHeader.toLowerCase().includes('drop database') ||
                                    fileHeader.toLowerCase().includes('create database');


      if (!needsExclusiveAccess) {
        emitProgress('validating', 'Validating backup for online restore...', 40);
        const preflightResult = await this.preflightValidation(filePath);
        if (!preflightResult.safe) {
          const errorMsg = `Backup contains non-transactional commands that cannot be restored atomically: ${preflightResult.issues.join(', ')}`;
          emitProgress('failed', errorMsg, 0);
          await this.logRestoreAttempt(restoreId, id, 'failed', options?.userId, options?.userEmail, errorMsg);
          return {
            success: false,
            message: errorMsg,
            restoreId
          };
        }
      }


      emitProgress('draining_pool', 'Draining database connection pool...', 40);
      

      emitProgress('pausing_services', 'Pausing background services...', 38);
      const { MaintenanceCoordinator } = await import('./maintenance-coordinator');
      const maintenanceCoordinator = MaintenanceCoordinator.getInstance();
      try {
        await maintenanceCoordinator.pauseAllServices();
        
      } catch (error) {
        console.error('Failed to pause some services:', error);

      }

      const { drainPool } = await import('../db');
      await drainPool();
      


      const shouldDropAndRecreate = options?.dropDatabase === true || needsExclusiveAccess;
      
      if (shouldDropAndRecreate) {
        emitProgress('dropping_database', 'Dropping and recreating database...', 42);
        const reason = options?.dropDatabase === true 
          ? 'User requested complete database drop before restore'
          : 'Backup contains database-level statements requiring exclusive access';
        
        try {
          await this.dropAndRecreateDatabase(dbConfig);
          emitProgress('database_recreated', 'Database dropped and recreated successfully', 44);
        } catch (error) {
          const errorMsg = `Failed to drop and recreate database: ${error instanceof Error ? error.message : String(error)}`;
          console.error(errorMsg);
          emitProgress('failed', errorMsg, 0);
          throw new Error(errorMsg);
        }
      } else {

        emitProgress('online_restore', 'Using online restore mode (no downtime)', 50);
      }


      const targetDb = dbConfig.database;


      const ext = path.extname(filePath).toLowerCase();
      const isCustomFormat = ['.backup', '.dump', '.bak'].includes(ext);

      let command: string;
      let args: string[];
      let processedFilePath = filePath;

      if (isCustomFormat) {

        emitProgress('restoring', 'Using pg_restore for custom format backup...', 55);
        command = 'pg_restore';
        args = [
          `--host=${dbConfig.host}`,
          `--port=${dbConfig.port}`,
          `--username=${dbConfig.username}`,
          `--dbname=${targetDb}`,
          '--clean',
          '--if-exists',
          '--no-owner',
          '--no-privileges',
          '--verbose'
        ];


        if (!shouldDropAndRecreate) {
          args.push('--single-transaction');
          
        } 
        args.push(filePath);
      } else {


        emitProgress('preprocessing', 'Preprocessing SQL backup file...', 55);
        processedFilePath = await this.preprocessSqlFile(filePath, shouldDropAndRecreate);

        command = 'psql';
        args = [
          `--host=${dbConfig.host}`,
          `--port=${dbConfig.port}`,
          `--username=${dbConfig.username}`,
          `--dbname=${targetDb}`,
          '-f',
          processedFilePath,
          '--set',
          'ON_ERROR_STOP=on'
        ];




        if (!shouldDropAndRecreate) {
          args.splice(args.length - 2, 0, '--single-transaction');
          
        }
      }

      emitProgress('restoring', 'Executing database restore...', 60);
      const { stdout, stderr } = await execCommand(command, args, { env });



      if (processedFilePath !== filePath) {
        try {
          await fs.unlink(processedFilePath);

        } catch (error) {
          console.warn('Failed to clean up processed file:', error);
        }
      }


      if (stderr) {

      }

      if (stdout) {

      }

      const executionTime = Date.now() - startTime;


      emitProgress('restore_completed', 'Database restore completed', 80);
      emitProgress('reconnecting', 'Reconnecting to database...', 85);
      await this.reconnectDatabase();


      emitProgress('resuming_services', 'Resuming background services...', 87);
      try {
        await maintenanceCoordinator.resumeAllServices();
        
      } catch (error) {
        console.error('Failed to resume some services:', error);

      }

      emitProgress('verifying_restore', 'Verifying restored database...', 90);
      const restoredMetadata = await this.getDatabaseMetadata();

      const restoreDetails = {
        backup_id: backup.id,
        backup_filename: backup.filename,
        backup_created_at: backup.created_at,
        backup_size: backup.size,
        execution_time_ms: executionTime,
        file_downloaded: fileDownloaded,
        pre_restore_metadata: currentMetadata,
        post_restore_metadata: restoredMetadata,
        verification_passed: true,
        confirmation_text: options?.confirmationText
      };

      await this.logRestoreAttempt(restoreId, id, 'success', options?.userId, options?.userEmail, undefined, restoreDetails);

      emitProgress('completed', 'Restore completed successfully. Server restart recommended.', 100);

      return {
        success: true,
        message: `Database restored successfully from backup "${backup.filename}" created on ${new Date(backup.created_at).toLocaleString()}. IMPORTANT: Restart the server to ensure all application state is synchronized with the restored database.`,
        details: restoreDetails,
        restoreId
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during restore';

      console.error('Error restoring backup:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');

      emitProgress('failed', `Restore failed: ${errorMessage}`, 0);


      try {
        const { MaintenanceCoordinator } = await import('./maintenance-coordinator');
        const maintenanceCoordinator = MaintenanceCoordinator.getInstance();
        await maintenanceCoordinator.resumeAllServices();
        
      } catch (resumeError) {
        console.error('Failed to resume services after restore failure:', resumeError);
      }

      try {
        await this.reconnectDatabase();
      } catch (reconnectError) {
        console.error('Failed to reconnect to database after error:', reconnectError);
      }

      await this.logRestoreAttempt(restoreId, id, 'failed', options?.userId, options?.userEmail, errorMessage, {
        backup_id: backup.id,
        backup_filename: backup.filename,
        execution_time_ms: executionTime,
        error_details: error instanceof Error ? error.stack : String(error)
      });

      throw new Error(`Database restore failed: ${errorMessage}`);
    } finally {

      try {
        const { MaintenanceCoordinator } = await import('./maintenance-coordinator');
        const maintenanceCoordinator = MaintenanceCoordinator.getInstance();
        await maintenanceCoordinator.resumeAllServices();
        
      } catch (resumeError) {
        console.error('Failed to resume services in finally block:', resumeError);
      }

      try {
        
        await storage.saveAppSetting('system.maintenanceMode', false);


        broadcastToAll({
          type: 'system:maintenance:disabled',
          data: {
            restoreId,
            timestamp: new Date().toISOString()
          }
        });

        
      } catch (error) {
        console.error('Failed to clear maintenance mode:', error);

      }
    }
  }

  private async logRestoreAttempt(
    restoreId: string,
    backupId: string,
    status: 'started' | 'success' | 'failed',
    userId?: number,
    userEmail?: string,
    errorMessage?: string,
    metadata?: any
  ): Promise<void> {
    try {
      const { db } = await import('../db');
      const { databaseBackupLogs } = await import('../../shared/schema');



      if (status === 'started') {
        return;
      }

      const logEntry = {
        id: crypto.randomUUID(),
        scheduleId: 'restore',
        backupId: backupId,
        status: status,
        timestamp: new Date(),
        errorMessage: errorMessage || null,
        metadata: {
          restore_id: restoreId,
          event_type: 'restore',
          user_id: userId,
          user_email: userEmail,
          ...metadata
        }
      };

      await db.insert(databaseBackupLogs).values(logEntry);
    } catch (error) {
      console.error('Error logging restore attempt:', error);
    }
  }

  /**
   * Generic method to log backup-related events
   */
  private async logBackupEvent(event: {
    backup_id: string | null;
    event_type: string;
    status: 'success' | 'failed' | 'partial' | 'in_progress';
    message: string;
    details?: any;
  }): Promise<void> {
    try {
      const { db } = await import('../db');
      const { databaseBackupLogs } = await import('../../shared/schema');

      const logEntry = {
        id: crypto.randomUUID(),
        scheduleId: 'manual', // Use 'manual' for non-scheduled events; event_type goes in metadata
        backupId: event.backup_id,
        status: event.status, // Keep status faithful to actual state, don't coerce
        timestamp: new Date(),
        errorMessage: event.status !== 'success' ? event.message : null,
        metadata: {
          event_type: event.event_type,
          message: event.message,
          ...event.details
        }
      };

      await db.insert(databaseBackupLogs).values(logEntry);
    } catch (error) {
      console.error('Error logging backup event:', error);
    }
  }

  async processUploadedBackup(options: {
    filePath: string;
    originalName: string;
    filename: string;
    size: number;
    description: string;
    storage_locations: string[];
  }): Promise<BackupRecord> {
    const backupId = crypto.randomUUID();

    const backup: BackupRecord = {
      id: backupId,
      filename: options.filename,
      type: 'manual',
      description: options.description,
      size: options.size,
      created_at: new Date(),
      status: 'creating',
      storage_locations: options.storage_locations,
      checksum: '',
      metadata: {
        database_size: 0,
        table_count: 0,
        row_count: 0,
        encryption_enabled: false
      }
    };

    try {
      backup.checksum = await this.calculateChecksum(options.filePath);

      const isValid = await this.validateBackupFile(options.filePath);
      if (!isValid) {
        throw new Error('Invalid backup file format. Please upload a valid PostgreSQL backup file.');
      }

      backup.status = 'completed';

      await this.saveBackupRecord(backup);

      await this.handleStorageLocations(backup);

      
      return backup;

    } catch (error) {
      console.error('Error processing uploaded backup:', error);
      backup.status = 'failed';
      backup.error_message = error instanceof Error ? error.message : 'Unknown error';
      await this.saveBackupRecord(backup);

      try {
        await fs.unlink(options.filePath);
      } catch (cleanupError) {
        console.error('Error cleaning up failed upload:', cleanupError);
      }

      throw error;
    }
  }

  private async validateBackupFile(filePath: string): Promise<boolean> {
    try {
      const ext = path.extname(filePath).toLowerCase();
      const validExtensions = ['.sql', '.backup', '.dump', '.bak'];
      if (!validExtensions.includes(ext)) {
        console.error('[BackupValidation] Invalid file extension:', ext);
        return false;
      }

      if (ext === '.sql') {

        try {
          const fileContent = await fs.readFile(filePath, 'utf8');


          const hasPostgreSQLHeader =
            fileContent.includes('PostgreSQL database dump') ||
            fileContent.includes('pg_dump');

          if (!hasPostgreSQLHeader) {
            console.error('[BackupValidation] SQL file missing required PostgreSQL header markers');
            return false;
          }


          const hasValidContent =
            fileContent.includes('CREATE TABLE') ||
            fileContent.includes('INSERT INTO') ||
            fileContent.includes('CREATE DATABASE') ||
            fileContent.includes('CREATE SCHEMA') ||
            fileContent.includes('CREATE EXTENSION') ||
            fileContent.includes('ALTER TABLE') ||
            fileContent.includes('CREATE INDEX') ||
            (fileContent.includes('CREATE') && fileContent.includes('TABLE')) ||
            (fileContent.includes('INSERT') && fileContent.includes('VALUES'));

          if (!hasValidContent) {
            console.error('[BackupValidation] SQL file contains no valid PostgreSQL statements');
            return false;
          }

          
          return true;
        } catch (error) {
          console.error('[BackupValidation] Failed to read SQL file for validation:', error);
          return false;
        }
      }


      try {
        
        const pgListCmd = `pg_restore --list "${filePath}"`;
        await execAsync(pgListCmd);
        
        return true;
      } catch (error) {
        console.error('[BackupValidation] pg_restore --list validation failed:', error);
        return false;
      }

    } catch (error) {
      console.error('[BackupValidation] Error validating backup file:', error);
      return false;
    }
  }

  async verifyBackup(id: string): Promise<{ valid: boolean; message: string; details?: any }> {
    const backup = await this.getBackup(id);
    if (!backup) {
      throw new Error('Backup not found');
    }

    try {
      const filePath = path.join(this.backupDir, backup.filename);

      try {
        await fs.access(filePath);
      } catch (error) {
        return {
          valid: false,
          message: 'Backup file not found locally'
        };
      }

      const stats = await fs.stat(filePath);
      if (stats.size !== backup.size) {
        return {
          valid: false,
          message: `File size mismatch. Expected: ${backup.size}, Actual: ${stats.size}`
        };
      }

      const currentChecksum = await this.calculateChecksum(filePath);
      if (currentChecksum !== backup.checksum) {
        return {
          valid: false,
          message: 'Checksum verification failed. File may be corrupted.'
        };
      }


      const ext = path.extname(filePath).toLowerCase();
      const isSqlFormat = ext === '.sql';

      if (isSqlFormat) {

        try {


          const fileHandle = await fs.open(filePath, 'r');
          const buffer = Buffer.alloc(1024 * 1024); // 1MB buffer
          const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, 0);
          await fileHandle.close();

          const fileHeader = buffer.toString('utf8', 0, bytesRead);
          const hasPostgresMarkers =
            fileHeader.includes('PostgreSQL database dump') ||
            fileHeader.includes('pg_dump') ||
            fileHeader.includes('CREATE TABLE') ||
            fileHeader.includes('INSERT INTO') ||
            fileHeader.includes('CREATE DATABASE') ||
            fileHeader.includes('SET statement_timeout') ||
            fileHeader.includes('SET lock_timeout');

          if (!hasPostgresMarkers) {
            return {
              valid: false,
              message: 'File does not appear to be a valid PostgreSQL SQL dump'
            };
          }


          const tableCount = (fileHeader.match(/CREATE TABLE/gi) || []).length;

          return {
            valid: true,
            message: 'Backup verification successful',
            details: {
              file_size: stats.size,
              checksum_valid: true,
              table_count: tableCount > 0 ? tableCount : 'Unknown (large file)',
              backup_format: 'PostgreSQL plain SQL format'
            }
          };
        } catch (error) {
          console.error('Error reading SQL backup file:', error);
          return {
            valid: false,
            message: `Failed to read SQL backup file: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      } else {

        const pgListCmd = `pg_restore --list "${filePath}"`;

        try {
          const { stdout } = await execAsync(pgListCmd);
          const tableCount = (stdout.match(/TABLE/g) || []).length;

          return {
            valid: true,
            message: 'Backup verification successful',
            details: {
              file_size: stats.size,
              checksum_valid: true,
              table_count: tableCount,
              backup_format: 'PostgreSQL custom format'
            }
          };
        } catch (error) {
          return {
            valid: false,
            message: 'Backup file format verification failed. File may be corrupted or not a valid PostgreSQL custom format backup.'
          };
        }
      }

    } catch (error) {
      console.error('Error verifying backup:', error);
      return {
        valid: false,
        message: error instanceof Error ? error.message : 'Unknown error during verification'
      };
    }
  }

  /**
   * Deep verification: Creates a temporary database and performs actual restore
   * to verify restore-ability. This is more thorough than basic verification.
   */
  async verifyDeep(id: string): Promise<{
    valid: boolean;
    message: string;
    details?: any;
    errors?: string[];
    timings?: {
      total_ms: number;
      create_db_ms: number;
      restore_ms: number;
      verify_schema_ms: number;
      cleanup_ms: number;
    };
  }> {
    const startTime = Date.now();
    const timings: any = {};
    const errors: string[] = [];

    const backup = await this.getBackup(id);
    if (!backup) {
      throw new Error('Backup not found');
    }


    const config = await storage.getAppSetting('backup_config');
    const configValue = config?.value as any;
    const deepVerifyEnabled = configValue?.deep_verify_enabled !== false; // Default to true

    if (!deepVerifyEnabled) {
      return {
        valid: false,
        message: 'Deep verification is disabled in backup configuration',
        errors: ['Deep verification feature is disabled']
      };
    }

    const filePath = path.join(this.backupDir, backup.filename);


    const basicVerify = await this.verifyBackup(id);
    if (!basicVerify.valid) {
      return {
        valid: false,
        message: `Basic verification failed: ${basicVerify.message}`,
        errors: [basicVerify.message]
      };
    }

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL not configured');
    }

    const url = new URL(dbUrl);
    const dbConfig = {
      host: url.hostname,
      port: url.port || '5432',
      database: url.pathname.slice(1),
      username: url.username,
      password: url.password
    };


    const tempDbName = `powerchat_verify_${crypto.randomUUID().replace(/-/g, '_')}`;

    let tempDbCreated = false;
    const { Client } = await import('pg');
    const adminClient = new Client({
      host: dbConfig.host,
      port: parseInt(dbConfig.port),
      database: 'postgres',
      user: dbConfig.username,
      password: dbConfig.password,
    });

    try {

      const createDbStart = Date.now();
      await adminClient.connect();
      

      await adminClient.query(`CREATE DATABASE ${tempDbName}`);
      tempDbCreated = true;
      timings.create_db_ms = Date.now() - createDbStart;

      await adminClient.end();


      const restoreStart = Date.now();
      

      const env = { ...process.env, PGPASSWORD: dbConfig.password };
      const ext = path.extname(filePath).toLowerCase();
      const isSqlFormat = ext === '.sql';

      if (isSqlFormat) {

        const command = 'psql';
        const args = [
          `--host=${dbConfig.host}`,
          `--port=${dbConfig.port}`,
          `--username=${dbConfig.username}`,
          `--dbname=${tempDbName}`,
          '-f',
          filePath,
          '--set',
          'ON_ERROR_STOP=on',
          '--single-transaction'
        ];

        try {
          await execCommand(command, args, { env });
        } catch (error) {
          errors.push(`Restore failed: ${error instanceof Error ? error.message : String(error)}`);
          throw error;
        }
      } else {

        const command = 'pg_restore';
        const args = [
          `--host=${dbConfig.host}`,
          `--port=${dbConfig.port}`,
          `--username=${dbConfig.username}`,
          `--dbname=${tempDbName}`,
          '--verbose',
          '--single-transaction',
          filePath
        ];

        try {
          await execCommand(command, args, { env });
        } catch (error) {
          errors.push(`Restore failed: ${error instanceof Error ? error.message : String(error)}`);
          throw error;
        }
      }

      timings.restore_ms = Date.now() - restoreStart;


      const verifyStart = Date.now();
      

      const verifyClient = new Client({
        host: dbConfig.host,
        port: parseInt(dbConfig.port),
        database: tempDbName,
        user: dbConfig.username,
        password: dbConfig.password,
      });

      await verifyClient.connect();

      try {

        const tableResult = await verifyClient.query(`
          SELECT COUNT(*) as count
          FROM information_schema.tables
          WHERE table_schema = 'public'
        `);
        const tableCount = parseInt(tableResult.rows[0]?.count || '0');


        const keyTables = ['users', 'companies', 'contacts'];
        const missingTables: string[] = [];

        for (const table of keyTables) {
          const result = await verifyClient.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables
              WHERE table_schema = 'public'
              AND table_name = $1
            )
          `, [table]);

          if (!result.rows[0]?.exists) {
            missingTables.push(table);
          }
        }


        const rowCounts: Record<string, number> = {};
        for (const table of keyTables) {
          if (!missingTables.includes(table)) {
            try {
              const result = await verifyClient.query(`SELECT COUNT(*) as count FROM ${table}`);
              rowCounts[table] = parseInt(result.rows[0]?.count || '0');
            } catch (error) {
              errors.push(`Failed to count rows in ${table}: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        }

        await verifyClient.end();
        timings.verify_schema_ms = Date.now() - verifyStart;


        const details = {
          temp_database: tempDbName,
          table_count: tableCount,
          key_tables_found: keyTables.length - missingTables.length,
          key_tables_missing: missingTables,
          row_counts: rowCounts,
          backup_format: isSqlFormat ? 'PostgreSQL plain SQL format' : 'PostgreSQL custom format'
        };

        if (missingTables.length > 0) {
          errors.push(`Missing key tables: ${missingTables.join(', ')}`);
        }


        const cleanupStart = Date.now();
        const cleanupClient = new Client({
          host: dbConfig.host,
          port: parseInt(dbConfig.port),
          database: 'postgres',
          user: dbConfig.username,
          password: dbConfig.password,
        });

        await cleanupClient.connect();


        await cleanupClient.query(`
          SELECT pg_terminate_backend(pg_stat_activity.pid)
          FROM pg_stat_activity
          WHERE pg_stat_activity.datname = $1
            AND pid <> pg_backend_pid()
        `, [tempDbName]);

        await new Promise(resolve => setTimeout(resolve, 1000));

        await cleanupClient.query(`DROP DATABASE IF EXISTS ${tempDbName}`);
        await cleanupClient.end();
        tempDbCreated = false;
        timings.cleanup_ms = Date.now() - cleanupStart;

        timings.total_ms = Date.now() - startTime;

        const isValid = errors.length === 0 && missingTables.length === 0;

        return {
          valid: isValid,
          message: isValid
            ? 'Deep verification successful - backup is fully restorable'
            : `Deep verification completed with warnings: ${errors.join('; ')}`,
          details,
          errors: errors.length > 0 ? errors : undefined,
          timings
        };

      } catch (error) {
        await verifyClient.end().catch(() => {});
        throw error;
      }

    } catch (error) {
      console.error('Error during deep verification:', error);
      errors.push(error instanceof Error ? error.message : String(error));


      if (tempDbCreated) {
        try {
          const cleanupClient = new Client({
            host: dbConfig.host,
            port: parseInt(dbConfig.port),
            database: 'postgres',
            user: dbConfig.username,
            password: dbConfig.password,
          });

          await cleanupClient.connect();

          await cleanupClient.query(`
            SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = $1
              AND pid <> pg_backend_pid()
          `, [tempDbName]);

          await new Promise(resolve => setTimeout(resolve, 1000));

          await cleanupClient.query(`DROP DATABASE IF EXISTS ${tempDbName}`);
          await cleanupClient.end();
        } catch (cleanupError) {
          console.error('Failed to cleanup temporary database:', cleanupError);
          errors.push(`Cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
        }
      }

      timings.total_ms = Date.now() - startTime;

      return {
        valid: false,
        message: `Deep verification failed: ${error instanceof Error ? error.message : String(error)}`,
        errors,
        timings
      };
    }
  }

  async getBackupStats(): Promise<{
    total_backups: number;
    total_size: number;
    local_backups: number;
    cloud_backups: number;
    oldest_backup: Date | null;
    newest_backup: Date | null;
    storage_usage: {
      local: number;
      google_drive: number;
    };
  }> {
    try {
      const backups = await this.getBackupRecords();

      const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0);
      const localBackups = backups.filter(b => b.storage_locations.includes('local')).length;
      const cloudBackups = backups.filter(b => b.storage_locations.includes('google_drive')).length;

      const dates = backups.map(b => new Date(b.created_at));
      const oldestBackup = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
      const newestBackup = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;

      const localSize = backups
        .filter(b => b.storage_locations.includes('local'))
        .reduce((sum, backup) => sum + backup.size, 0);

      const cloudSize = backups
        .filter(b => b.storage_locations.includes('google_drive'))
        .reduce((sum, backup) => sum + backup.size, 0);

      return {
        total_backups: backups.length,
        total_size: totalSize,
        local_backups: localBackups,
        cloud_backups: cloudBackups,
        oldest_backup: oldestBackup,
        newest_backup: newestBackup,
        storage_usage: {
          local: localSize,
          google_drive: cloudSize
        }
      };
    } catch (error) {
      console.error('Error getting backup stats:', error);
      return {
        total_backups: 0,
        total_size: 0,
        local_backups: 0,
        cloud_backups: 0,
        oldest_backup: null,
        newest_backup: null,
        storage_usage: {
          local: 0,
          google_drive: 0
        }
      };
    }
  }

  async cleanupOldBackups(retentionDays: number = 30): Promise<{ deleted: number; errors: string[]; deletedBackups: string[] }> {
    const startTime = Date.now();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);


    const backups = await this.getBackupRecords();
    const oldBackups = backups.filter(backup =>
      new Date(backup.created_at) < cutoffDate
    );

    

    let deleted = 0;
    const errors: string[] = [];
    const deletedBackups: string[] = [];

    for (const backup of oldBackups) {
      try {
        await this.deleteBackup(backup.id);
        deleted++;
        deletedBackups.push(backup.filename);


        await this.logBackupEvent({
          backup_id: backup.id,
          event_type: 'cleanup_deleted',
          status: 'success',
          message: `Backup deleted by automated cleanup (older than ${retentionDays} days)`,
          details: {
            filename: backup.filename,
            created_at: backup.created_at,
            size: backup.size,
            retention_days: retentionDays,
            cutoff_date: cutoffDate.toISOString()
          }
        });

      } catch (error) {
        const errorMsg = `Failed to delete backup ${backup.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        console.error(`[Backup Cleanup] ${errorMsg}`);


        await this.logBackupEvent({
          backup_id: backup.id,
          event_type: 'cleanup_failed',
          status: 'failed',
          message: errorMsg,
          details: {
            filename: backup.filename,
            error: error instanceof Error ? error.message : String(error)
          }
        }).catch(logError => {
          console.error('[Backup Cleanup] Failed to log cleanup error:', logError);
        });
      }
    }

    const duration = Date.now() - startTime;
    const summary = `Cleanup completed: ${deleted} deleted, ${errors.length} errors in ${(duration / 1000).toFixed(2)}s`;
    


    await this.logBackupEvent({
      backup_id: null,
      event_type: 'cleanup_completed',
      status: errors.length === 0 ? 'success' : 'partial',
      message: summary,
      details: {
        retention_days: retentionDays,
        total_found: oldBackups.length,
        deleted_count: deleted,
        error_count: errors.length,
        deleted_backups: deletedBackups,
        errors: errors,
        duration_ms: duration
      }
    }).catch(logError => {
      console.error('[Backup Cleanup] Failed to log cleanup summary:', logError);
    });

    return { deleted, errors, deletedBackups };
  }

  /**
   * Preflight validation: scan dump for non-transactional commands
   * Returns whether the dump is safe for online (transactional) restore
   */
  private async preflightValidation(filePath: string): Promise<{ safe: boolean; issues: string[] }> {
    try {
      const { createReadStream } = await import('fs');
      const { createInterface } = await import('readline');

      const readStream = createReadStream(filePath, { encoding: 'utf8' });
      const rl = createInterface({
        input: readStream,
        crlfDelay: Infinity
      });

      const issues: string[] = [];
      const nonTransactionalCommands = [
        'ALTER SYSTEM',
        'VACUUM',
        'REINDEX',
        'ANALYZE',
        'CLUSTER'
      ];

      let lineNumber = 0;
      const maxLinesToScan = 10000; // Scan first 10k lines for performance

      for await (const line of rl) {
        lineNumber++;
        if (lineNumber > maxLinesToScan) break;

        const trimmedLine = line.trim();
        const upperLine = trimmedLine.toUpperCase();


        if (!trimmedLine || trimmedLine.startsWith('--')) continue;


        for (const cmd of nonTransactionalCommands) {
          if (upperLine.startsWith(cmd)) {
            issues.push(`${cmd} at line ${lineNumber}`);
            if (issues.length >= 10) {

              rl.close();
              readStream.destroy();
              return { safe: false, issues };
            }
            break;
          }
        }
      }

      return { safe: issues.length === 0, issues };
    } catch (error) {
      console.error('Error during preflight validation:', error);

      return { safe: false, issues: ['Preflight validation error'] };
    }
  }

  /**
   * Get current PostgreSQL version
   */
  private async getCurrentPgVersion(): Promise<string> {
    try {
      const versionResult = await getPool().query('SELECT version()');
      const versionString = versionResult.rows[0]?.version || '';
      const match = versionString.match(/PostgreSQL (\d+\.\d+)/);
      return match ? match[1] : 'unknown';
    } catch (error) {
      console.error('Failed to get PostgreSQL version:', error);
      return 'unknown';
    }
  }

  /**
   * Check PostgreSQL tools availability and versions
   */
  async checkPostgresTools(): Promise<{
    pg_dump: { available: boolean; version: string; error?: string };
    psql: { available: boolean; version: string; error?: string };
    pg_restore: { available: boolean; version: string; error?: string };
  }> {
    const tools = {
      pg_dump: { available: false, version: '', error: '' },
      psql: { available: false, version: '', error: '' },
      pg_restore: { available: false, version: '', error: '' }
    };


    try {
      const { stdout } = await execAsync('pg_dump --version');
      tools.pg_dump.available = true;
      tools.pg_dump.version = stdout.trim();
    } catch (error) {
      tools.pg_dump.error = error instanceof Error ? error.message : 'Command not found';
    }


    try {
      const { stdout } = await execAsync('psql --version');
      tools.psql.available = true;
      tools.psql.version = stdout.trim();
    } catch (error) {
      tools.psql.error = error instanceof Error ? error.message : 'Command not found';
    }


    try {
      const { stdout } = await execAsync('pg_restore --version');
      tools.pg_restore.available = true;
      tools.pg_restore.version = stdout.trim();
    } catch (error) {
      tools.pg_restore.error = error instanceof Error ? error.message : 'Command not found';
    }

    return tools;
  }

  /**
   * Get list of available PostgreSQL extensions
   */
  private async getAvailableExtensions(): Promise<Set<string>> {
    try {
      const result = await getPool().query(`
        SELECT name FROM pg_available_extensions
      `);
      return new Set(result.rows.map(row => row.name));
    } catch (error) {
      console.error('Error getting available extensions:', error);
      return new Set();
    }
  }

  /**
   * Preprocess SQL file to remove incompatible PostgreSQL parameters and non-transactional commands
   * This handles cases where backup is from newer PostgreSQL version and ensures atomicity
   */
  private async preprocessSqlFile(filePath: string, needsExclusiveAccess: boolean = false): Promise<string> {
    try {

      const availableExtensions = await this.getAvailableExtensions();


      const incompatibleParams = [
        'transaction_timeout',  // PostgreSQL 17+ only
        'idle_session_timeout', // PostgreSQL 14+ only
      ];


      const nonTransactionalCommands = [
        'ALTER SYSTEM',
        'VACUUM',
        'REINDEX',
        'ANALYZE',
        'CLUSTER',
        'CREATE DATABASE',
        'DROP DATABASE',
        'CREATE TABLESPACE',
        'DROP TABLESPACE'
      ];


      const problematicSetCommands = [
        'SET default_transaction_read_only',
        'SET default_tablespace',
        'SET temp_tablespaces',
        'SET session_replication_role'
      ];

      const processedFilePath = filePath.replace(/\.sql$/, '.processed.sql');

      const { createReadStream, createWriteStream } = await import('fs');
      const { createInterface } = await import('readline');

      const readStream = createReadStream(filePath, { encoding: 'utf8' });
      const writeStream = createWriteStream(processedFilePath, { encoding: 'utf8' });

      const rl = createInterface({
        input: readStream,
        crlfDelay: Infinity
      });

      let linesProcessed = 0;
      let linesFiltered = 0;
      const nonTransactionalFound: string[] = [];

      for await (const line of rl) {
        linesProcessed++;
        let shouldSkip = false;
        const trimmedLine = line.trim();
        const upperLine = trimmedLine.toUpperCase();


        if (!trimmedLine || trimmedLine.startsWith('--')) {
          writeStream.write(line + '\n');
          continue;
        }


        for (const param of incompatibleParams) {
          if (line.includes(`SET ${param}`) || line.includes(`set ${param}`)) {
            shouldSkip = true;
            linesFiltered++;
            
            break;
          }
        }


        if (!shouldSkip) {
          for (const setCmd of problematicSetCommands) {
            if (upperLine.includes(setCmd.toUpperCase())) {
              shouldSkip = true;
              linesFiltered++;
              
              break;
            }
          }
        }


        if (!shouldSkip) {
          if (
            (upperLine.startsWith('ALTER ') && upperLine.includes(' OWNER TO ')) ||
            upperLine.startsWith('REASSIGN OWNED BY') ||
            upperLine.startsWith('GRANT ') ||
            upperLine.startsWith('REVOKE ') ||
            upperLine.startsWith('COMMENT ON ') ||
            upperLine.startsWith('SECURITY LABEL ')
          ) {
            shouldSkip = true;
            linesFiltered++;
          }
        }


        if (!shouldSkip && upperLine.startsWith('CREATE EXTENSION ')) {
          const extensionMatch = trimmedLine.match(/CREATE EXTENSION\s+(?:IF NOT EXISTS\s+)?["']?(\w+)["']?/i);
          if (extensionMatch) {
            const extensionName = extensionMatch[1];
            if (!availableExtensions.has(extensionName)) {
              shouldSkip = true;
              linesFiltered++;
              console.warn(`Filtered unavailable extension: ${extensionName}`);
            }
          }
        }


        if (!shouldSkip && upperLine.includes('ALTER EXTENSION') && upperLine.includes('SET SCHEMA')) {
          shouldSkip = true;
          linesFiltered++;
        }


        if (!needsExclusiveAccess) {
          for (const cmd of nonTransactionalCommands) {
            if (upperLine.startsWith(cmd)) {
              nonTransactionalFound.push(trimmedLine.substring(0, 100));

              if (!['CREATE DATABASE', 'DROP DATABASE'].includes(cmd)) {

                shouldSkip = true;
                linesFiltered++;
                
              }
              break;
            }
          }
        }


        if (!shouldSkip) {
          writeStream.write(line + '\n');
        }
      }


      await new Promise<void>((resolve, reject) => {
        writeStream.end(() => resolve());
        writeStream.on('error', reject);
      });

      


      if (!needsExclusiveAccess && nonTransactionalFound.length > 0) {
        console.warn(`Warning: Found ${nonTransactionalFound.length} non-transactional commands that were filtered`);
        console.warn('First few commands:', nonTransactionalFound.slice(0, 3));
      }

      return processedFilePath;

    } catch (error) {
      console.error('Error preprocessing SQL file:', error);

      return filePath;
    }
  }

  /**
   * Get restore status for polling fallback
   */
  getRestoreStatus(restoreId: string): {
    restoreId: string;
    backupId: string;
    status: string;
    message: string;
    percent?: number;
    timestamp: string;
  } | null {
    return restoreStatusStore.get(restoreId) || null;
  }

  /**
   * Clear restore status from memory (cleanup after completion)
   */
  clearRestoreStatus(restoreId: string): void {
    restoreStatusStore.delete(restoreId);
  }
}
