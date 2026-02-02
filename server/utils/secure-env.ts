import crypto from 'crypto';

/**
 * Secure environment variable handler
 * Encrypts sensitive data and provides runtime validation
 */
class SecureEnvironment {
  private static instance: SecureEnvironment;
  private encryptionKey: string;
  private sensitiveKeys = [
    'DATABASE_URL',
    'SESSION_SECRET',
    'GOOGLE_CLIENT_SECRET',
    'SENDGRID_API_KEY',
    'SMTP_PASS'
  ];

  private constructor() {
    this.encryptionKey = this.getOrCreateEncryptionKey();
    this.validateEnvironment();
  }

  public static getInstance(): SecureEnvironment {
    if (!SecureEnvironment.instance) {
      SecureEnvironment.instance = new SecureEnvironment();
    }
    return SecureEnvironment.instance;
  }

  private getOrCreateEncryptionKey(): string {
    const key = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
    if (!process.env.ENCRYPTION_KEY) {
      
    }
    return key;
  }

  private validateEnvironment(): void {
    if (process.env.NODE_ENV === 'production') {
      const devArtifacts = [
        'VITE_DEV_SERVER',
        'HMR_PORT',
        'WEBPACK_DEV_SERVER'
      ];

      devArtifacts.forEach(artifact => {
        if (process.env[artifact]) {
          console.error(`🚨 Development artifact detected in production: ${artifact}`);
          process.exit(1);
        }
      });

      const requiredVars = ['DATABASE_URL', 'SESSION_SECRET'];
      requiredVars.forEach(varName => {
        if (!process.env[varName]) {
          console.error(`🚨 Required environment variable missing: ${varName}`);
          process.exit(1);
        }
      });
    }
  }

  /**
   * Encrypt sensitive data
   */
  private encrypt(text: string): string {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(this.encryptionKey, 'hex');
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipher(algorithm, key);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt sensitive data
   */
  private decrypt(encryptedText: string): string {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(this.encryptionKey, 'hex');
    const [ivHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    
    const decipher = crypto.createDecipher(algorithm, key);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Get environment variable with optional decryption
   */
  public get(key: string, defaultValue?: string): string | undefined {
    const value = process.env[key] || defaultValue;
    
    if (!value) return undefined;
    
    if (this.sensitiveKeys.includes(key) && value.includes(':')) {
      try {
        return this.decrypt(value);
      } catch (error) {
        
        return value;
      }
    }
    
    return value;
  }

  /**
   * Set environment variable with optional encryption
   */
  public set(key: string, value: string, encrypt = false): void {
    if (encrypt && this.sensitiveKeys.includes(key)) {
      process.env[key] = this.encrypt(value);
    } else {
      process.env[key] = value;
    }
  }

  /**
   * Get database URL with connection pooling and security
   */
  public getDatabaseUrl(): string {
    const dbUrl = this.get('DATABASE_URL');
    if (!dbUrl) {
      throw new Error('DATABASE_URL is required');
    }

    const url = new URL(dbUrl);

    const sslMode = this.get('PGSSLMODE') || (process.env.NODE_ENV === 'production' ? 'prefer' : 'disable');
    url.searchParams.set('sslmode', sslMode);
    url.searchParams.set('application_name', 'powerchat-prod');

    return url.toString();
  }

  /**
   * Validate runtime integrity
   */
  public validateIntegrity(): boolean {
    try {
      if (process.env.NODE_ENV === 'development') {
        return true;
      }

      const critical = ['NODE_ENV', 'DATABASE_URL'];
      return critical.every(key => !!process.env[key]);
    } catch (error) {
      return false;
    }
  }
}

export const secureEnv = SecureEnvironment.getInstance();
