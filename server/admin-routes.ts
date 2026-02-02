import { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import Stripe from "stripe";
import paypal from "@paypal/checkout-server-sdk";
import { pool, db } from "./db";
import { ensureSuperAdmin } from "./middleware";
import nodemailer from "nodemailer";
import { createCipheriv, createDecipheriv, randomBytes as cryptoRandomBytes } from "crypto";
import axios from "axios";
import { registerAffiliateRoutes } from "./routes/admin/affiliate-routes";
import adminAiCredentialsRoutes from "./routes/admin-ai-credentials";
import { databaseBackupLogs } from "../shared/schema";
import { desc, sql } from "drizzle-orm";
import { invalidateSubdomainCache } from "./middleware/subdomain";
import { generateWebhookVerifyToken, validateWebhookToken } from "./utils/webhook-token-generator";
import { testWebhookDelivery, getAppWebhookFieldSubscriptions } from "./services/meta-webhook-configurator";
import { checkConfigurationHealth } from "./services/meta-configuration-monitor";
import { cleanupOldAuthBackground } from "./utils/file-system";

interface SMTPConfig {
  enabled: boolean;
  host?: string;
  port?: number;
  security?: 'none' | 'ssl';
  username?: string;
  password?: string;
  fromName?: string;
  fromEmail?: string;
  testEmail?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface AuthenticatedUser {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: string;
  companyId: number | null;
  isSuperAdmin: boolean;
}


const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production-32-chars';
const ALGORITHM = 'aes-256-cbc';

function getEncryptionKey(): Buffer {
  const key = ENCRYPTION_KEY;

  let finalKey: string;
  if (key.length === 32) {
    finalKey = key;
  } else if (key.length > 32) {
    finalKey = key.substring(0, 32);
  } else {
    finalKey = key.padEnd(32, '0');
  }

  return Buffer.from(finalKey, 'utf8');
}

function encryptPassword(password: string): string {
  const iv = cryptoRandomBytes(16);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptPassword(encryptedPassword: string): string {
  const [ivHex, encrypted] = encryptedPassword.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

const smtpConfigSchema = z.object({
  enabled: z.boolean().default(false),
  host: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  security: z.enum(['none', 'ssl']).optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  fromName: z.string().optional(),
  fromEmail: z.string().optional(),
  testEmail: z.string().optional()
});

function validateEnabledSmtp(config: SMTPConfig): ValidationResult {
  if (!config.enabled) {
    return { valid: true, errors: [] };
  }

  const errors: Array<{ field: string; message: string }> = [];

  if (!config.host || config.host.trim() === '') {
    errors.push({ field: 'host', message: 'SMTP host is required when SMTP is enabled' });
  }

  if (!config.port || config.port < 1 || config.port > 65535) {
    errors.push({ field: 'port', message: 'Valid port number is required when SMTP is enabled' });
  }

  if (!config.security || !['none', 'ssl'].includes(config.security)) {
    errors.push({ field: 'security', message: 'Valid security type is required when SMTP is enabled' });
  }

  if (!config.username || config.username.trim() === '') {
    errors.push({ field: 'username', message: 'Username is required when SMTP is enabled' });
  }

  if (!config.password || (config.password.trim() === '' && config.password !== '••••••••')) {
    errors.push({ field: 'password', message: 'Password is required when SMTP is enabled' });
  }

  if (!config.fromName || config.fromName.trim() === '') {
    errors.push({ field: 'fromName', message: 'From name is required when SMTP is enabled' });
  }

  if (!config.fromEmail || config.fromEmail.trim() === '') {
    errors.push({ field: 'fromEmail', message: 'From email is required when SMTP is enabled' });
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.fromEmail)) {
    errors.push({ field: 'fromEmail', message: 'Valid email address is required for from email' });
  }

  return { valid: errors.length === 0, errors };
}

async function createSMTPTransporter(config: SMTPConfig): Promise<nodemailer.Transporter> {
  const transportConfig: any = {
    host: config.host,
    port: config.port,
    auth: {
      user: config.username,
      pass: config.password
    }
  };

  if (config.security === 'ssl') {
    transportConfig.secure = true;
  
  } else{
    transportConfig.secure = false;
    transportConfig.ignoreTLS = true;
  }


  return nodemailer.createTransport(transportConfig);
}

async function testSMTPConnection(config: SMTPConfig, testEmail: string): Promise<EmailResult> {
  try {
    const transporter = await createSMTPTransporter(config);

    await transporter.verify();

    const mailOptions = {
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: testEmail,
      subject: 'SMTP Configuration Test',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333235;">SMTP Configuration Test</h2>
          <p>This is a test email to verify your SMTP configuration is working correctly.</p>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>Configuration Details:</h3>
            <ul>
              <li><strong>SMTP Host:</strong> ${config.host}</li>
              <li><strong>Port:</strong> ${config.port}</li>
              <li><strong>Security:</strong> ${config.security?.toUpperCase() || 'NONE'}</li>
              <li><strong>From:</strong> ${config.fromName} &lt;${config.fromEmail}&gt;</li>
            </ul>
          </div>
          <p>If you received this email, your SMTP configuration is working correctly!</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 14px;">
            This email was sent from Email Configuration Test.<br>
            Sent at: ${new Date().toLocaleString()}
          </p>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function sendTestEmail(config: SMTPConfig, testEmail: string): Promise<EmailResult> {
  try {
    const transporter = await createSMTPTransporter(config);

    const mailOptions = {
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: testEmail,
      subject: 'SMTP Configuration Test',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333235;">SMTP Configuration Test</h2>
          <p>This is a test email to verify your SMTP configuration is working correctly.</p>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>Configuration Details:</h3>
            <ul>
              <li><strong>SMTP Host:</strong> ${config.host}</li>
              <li><strong>Port:</strong> ${config.port}</li>
              <li><strong>Security:</strong> ${config.security?.toUpperCase() || 'NONE'}</li>
              <li><strong>From:</strong> ${config.fromName} &lt;${config.fromEmail}&gt;</li>
            </ul>
          </div>
          <p>If you received this email, your SMTP configuration is working correctly!</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 14px;">
            This email was sent from  Email Configuration Test.<br>
            Sent at: ${new Date().toLocaleString()}
          </p>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    throw new Error(`SMTP test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function sendEmail(to: string, subject: string, html: string, options: Record<string, any> = {}): Promise<EmailResult> {
  try {
    const smtpSetting = await storage.getAppSetting('smtp_config');
    if (!smtpSetting || !(smtpSetting.value as SMTPConfig).enabled) {
      throw new Error('SMTP is not configured or disabled');
    }

    const config: SMTPConfig = smtpSetting.value as SMTPConfig;
    if (config.password) {
      config.password = decryptPassword(config.password);
    }

    const transporter = await createSMTPTransporter(config);

    const mailOptions = {
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to,
      subject,
      html,
      ...options
    };

    const result = await transporter.sendMail(mailOptions);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    throw error;
  }
}

const ensureAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Unauthorized' });
};

/**
 * Validate color format (hex, rgb, rgba, hsl, hsla)
 */
function validateColorFormat(color: string): boolean {
  if (!color || typeof color !== 'string') {
    return false;
  }


  const hexPattern = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
  if (hexPattern.test(color)) {
    return true;
  }


  const rgbPattern = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+)?\s*\)$/;
  if (rgbPattern.test(color)) {
    return true;
  }


  const hslPattern = /^hsla?\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*(,\s*[\d.]+)?\s*\)$/;
  if (hslPattern.test(color)) {
    return true;
  }

  return false;
}

/**
 * Validate gradient configuration
 */
function validateGradientConfig(gradientConfig: any): { valid: boolean; error?: string } {
  if (!gradientConfig || typeof gradientConfig !== 'object') {
    return { valid: false, error: 'Gradient config must be an object' };
  }

  if (gradientConfig.mode !== 'simple' && gradientConfig.mode !== 'advanced') {
    return { valid: false, error: 'Gradient mode must be "simple" or "advanced"' };
  }

  if (gradientConfig.mode === 'simple') {
    if (!gradientConfig.simple || typeof gradientConfig.simple !== 'object') {
      return { valid: false, error: 'Simple gradient config is required' };
    }

    const { startColor, endColor, direction } = gradientConfig.simple;

    if (!startColor || !validateColorFormat(startColor)) {
      return { valid: false, error: 'Valid startColor is required for simple gradient' };
    }

    if (!endColor || !validateColorFormat(endColor)) {
      return { valid: false, error: 'Valid endColor is required for simple gradient' };
    }

    const validDirections = ['to-right', 'to-left', 'to-top', 'to-bottom', 'to-br', 'to-bl', 'to-tr', 'to-tl'];
    if (!direction || !validDirections.includes(direction)) {
      return { valid: false, error: `Direction must be one of: ${validDirections.join(', ')}` };
    }
  } else if (gradientConfig.mode === 'advanced') {
    if (!gradientConfig.advanced || typeof gradientConfig.advanced !== 'object') {
      return { valid: false, error: 'Advanced gradient config is required' };
    }

    const { stops, angle } = gradientConfig.advanced;

    if (!Array.isArray(stops) || stops.length < 2) {
      return { valid: false, error: 'Advanced gradient must have at least 2 stops' };
    }

    for (const stop of stops) {
      if (!stop.color || !validateColorFormat(stop.color)) {
        return { valid: false, error: 'All gradient stops must have valid colors' };
      }

      if (typeof stop.position !== 'number' || stop.position < 0 || stop.position > 100) {
        return { valid: false, error: 'Gradient stop positions must be numbers between 0 and 100' };
      }
    }

    if (typeof angle !== 'number' || angle < 0 || angle > 360) {
      return { valid: false, error: 'Gradient angle must be a number between 0 and 360' };
    }
  }

  return { valid: true };
}

/**
 * Validate auth background configuration
 */
function validateAuthBackgroundConfig(config: any): { valid: boolean; error?: string } {
  if (!config || typeof config !== 'object') {
    return { valid: false, error: 'Config must be an object' };
  }

  const validPriorities = ['image', 'color', 'layer'];
  if (config.priority && !validPriorities.includes(config.priority)) {
    return { valid: false, error: `Priority must be one of: ${validPriorities.join(', ')}` };
  }

  if (config.backgroundColor && !validateColorFormat(config.backgroundColor)) {
    return { valid: false, error: 'Invalid backgroundColor format' };
  }

  if (config.gradientConfig) {
    const gradientValidation = validateGradientConfig(config.gradientConfig);
    if (!gradientValidation.valid) {
      return gradientValidation;
    }
  }


  if (config.priority === 'color') {
    if (!config.backgroundColor && !config.gradientConfig) {
      return { valid: false, error: 'backgroundColor or gradientConfig is required when priority is "color"' };
    }
  }

  return { valid: true };
}

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage_config = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(uploadsDir, 'branding');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage_config,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 5,
    fieldNameSize: 100,
    fieldSize: 1024 * 1024
  },
  fileFilter: (req, file, cb) => {

    const allowedMimeTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'
    ];

    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico'];

    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return cb(new Error(`File type not allowed. Allowed extensions: ${allowedExtensions.join(', ')}`));
    }

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error(`File type not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`));
    }

    const filename = file.originalname.toLowerCase();

    const dangerousPatterns = [
      /\.exe$/i, /\.bat$/i, /\.cmd$/i, /\.com$/i, /\.pif$/i, /\.scr$/i,
      /\.vbs$/i, /\.js$/i, /\.jar$/i, /\.php$/i, /\.asp$/i, /\.jsp$/i,
      /\.sh$/i, /\.ps1$/i, /\.html$/i, /\.htm$/i
    ];

    if (dangerousPatterns.some(pattern => pattern.test(filename))) {
      return cb(new Error('File type not allowed for security reasons'));
    }

    if (file.size && file.size > 5 * 1024 * 1024) {
      return cb(new Error('File size exceeds 5MB limit'));
    }

    cb(null, true);
  }
});

function registerAdminRoutes(app: Express) {
  app.get("/api/admin/users", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const allUsers = await storage.getAllUsers();

      const safeUsers = allUsers.map(user => {
        const { password, ...safeUser } = user;
        return safeUser;
      });

      res.json(safeUsers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/admin/users/:id", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const { password, ...safeUser } = user;

      res.json(safeUser);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.post("/api/admin/users", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const { username, email, fullName, password, role, companyId, isSuperAdmin } = req.body;

      if (!username || !email || !fullName || !password) {
        return res.status(400).json({ error: "Username, email, full name, and password are required" });
      }

      const existingUser = await storage.getUserByUsernameCaseInsensitive(username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      if (companyId && !isSuperAdmin) {
        const company = await storage.getCompany(companyId);
        if (!company) {
          return res.status(400).json({ error: "Company not found" });
        }
      }

      const hashedPassword = await hashPassword(password);

      const newUser = await storage.createUser({
        username,
        email,
        fullName,
        password: hashedPassword,
        role: role || "agent",
        companyId: isSuperAdmin ? null : companyId,
        isSuperAdmin: !!isSuperAdmin
      });

      const { password: _, ...safeUser } = newUser;

      res.status(201).json(safeUser);
    } catch (error) {
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.put("/api/admin/users/:id", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const { email, fullName, role, companyId, isSuperAdmin, active } = req.body;

      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json({ error: "User not found" });
      }

      if (companyId && !isSuperAdmin) {
        const company = await storage.getCompany(companyId);
        if (!company) {
          return res.status(400).json({ error: "Company not found" });
        }
      }

      const updatedUser = await storage.updateUser(userId, {
        email,
        fullName,
        role,
        companyId: isSuperAdmin ? null : companyId,
        isSuperAdmin: !!isSuperAdmin,
        active: active !== undefined ? !!active : undefined
      });

      const { password, ...safeUser } = updatedUser;

      res.json(safeUser);
    } catch (error) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.post("/api/admin/users/:id/change-password", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const { newPassword } = req.body;

      if (!newPassword) {
        return res.status(400).json({ error: "New password is required" });
      }

      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const hashedPassword = await hashPassword(newPassword);

      const success = await storage.updateUserPassword(userId, hashedPassword, true);

      if (!success) {
        return res.status(500).json({ error: "Failed to update password" });
      }

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  app.post("/api/admin/users/:id/reset-password", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);

      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const temporaryPassword = randomBytes(4).toString("hex");

      const hashedPassword = await hashPassword(temporaryPassword);

      const success = await storage.updateUserPassword(userId, hashedPassword, true);

      if (!success) {
        return res.status(500).json({ error: "Failed to reset password" });
      }

      res.json({
        message: "Password reset successfully",
        temporaryPassword
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  app.delete("/api/admin/users/:id", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);

      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json({ error: "User not found" });
      }

      if (userId === (req.user as any)?.id) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }

      const success = await storage.deleteUser(userId);

      if (!success) {
        return res.status(500).json({ error: "Failed to delete user" });
      }

      res.json({ message: "User deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete user" });
    }
  });


  const ensureSettingsAccess = (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = req.user;
    const session = req.session as any;

    if (user?.isSuperAdmin) {
      return next();
    }

    if (session?.impersonation?.originalUserId) {
      (req as any).isImpersonating = true;
      (req as any).originalUserId = session.impersonation.originalUserId;
      return next();
    }

    res.status(403).json({ message: 'Settings access requires super admin privileges' });
  };

  app.get("/api/admin/settings", ensureSettingsAccess, async (_req, res) => {
    try {
      const settings = await storage.getAllAppSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.get("/api/admin/settings/:key", ensureSettingsAccess, async (req: Request, res: Response) => {
    try {
      const key = req.params.key;
      const setting = await storage.getAppSetting(key);

      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }

      res.json(setting);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch setting" });
    }
  });


  app.post("/api/admin/settings/branding/logo", ensureSettingsAccess, upload.single('logo'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const timestamp = Date.now();
      const logoUrl = `/uploads/branding/${req.file.filename}?v=${timestamp}`;

      await storage.saveAppSetting('branding_logo', logoUrl);

      try {
        if ((global as any).broadcastToAllClients) {
          (global as any).broadcastToAllClients({
            type: 'settingsUpdated',
            key: 'branding_logo',
            value: logoUrl
          });
        }
      } catch (error) {

      }

      res.json({
        message: "Logo uploaded successfully",
        logoUrl
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to upload logo" });
    }
  });

  app.post("/api/admin/settings/branding/favicon", ensureSettingsAccess, upload.single('favicon'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const timestamp = Date.now();
      const faviconUrl = `/uploads/branding/${req.file.filename}?v=${timestamp}`;

      await storage.saveAppSetting('branding_favicon', faviconUrl);

      try {
        if ((global as any).broadcastToAllClients) {
          (global as any).broadcastToAllClients({
            type: 'settingsUpdated',
            key: 'branding_favicon',
            value: faviconUrl
          });
        }
      } catch (error) {

      }

      res.json({
        message: "Favicon uploaded successfully",
        faviconUrl
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to upload favicon" });
    }
  });

  app.post("/api/admin/settings/branding/admin-auth-background", ensureSettingsAccess, upload.single('adminAuthBackground'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }


      const oldSetting = await storage.getAppSetting('branding_admin_auth_background');
      const oldUrl = oldSetting?.value as string | undefined;

      const timestamp = Date.now();
      const backgroundUrl = `/uploads/branding/${req.file.filename}?v=${timestamp}`;

      await storage.saveAppSetting('branding_admin_auth_background', backgroundUrl);


      if (oldUrl) {
        await cleanupOldAuthBackground(oldUrl);
      }

      try {
        if ((global as any).broadcastToAllClients) {
          (global as any).broadcastToAllClients({
            type: 'settingsUpdated',
            key: 'branding_admin_auth_background',
            value: backgroundUrl
          });
        }
      } catch (error) {

      }

      res.json({
        message: "Admin auth background uploaded successfully",
        backgroundUrl
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to upload admin auth background" });
    }
  });

  app.post("/api/admin/settings/branding/user-auth-background", ensureSettingsAccess, upload.single('userAuthBackground'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }


      const oldSetting = await storage.getAppSetting('branding_user_auth_background');
      const oldUrl = oldSetting?.value as string | undefined;

      const timestamp = Date.now();
      const backgroundUrl = `/uploads/branding/${req.file.filename}?v=${timestamp}`;

      await storage.saveAppSetting('branding_user_auth_background', backgroundUrl);


      if (oldUrl) {
        await cleanupOldAuthBackground(oldUrl);
      }

      try {
        if ((global as any).broadcastToAllClients) {
          (global as any).broadcastToAllClients({
            type: 'settingsUpdated',
            key: 'branding_user_auth_background',
            value: backgroundUrl
          });
        }
      } catch (error) {

      }

      res.json({
        message: "User auth background uploaded successfully",
        backgroundUrl
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to upload user auth background" });
    }
  });

  app.delete("/api/admin/settings/branding/admin-auth-background", ensureSettingsAccess, async (req, res) => {
    try {
      const oldSetting = await storage.getAppSetting('branding_admin_auth_background');
      const oldUrl = oldSetting?.value as string | undefined;


      if (oldUrl) {
        await cleanupOldAuthBackground(oldUrl);
      }


      await storage.deleteAppSetting('branding_admin_auth_background');

      try {
        if ((global as any).broadcastToAllClients) {
          (global as any).broadcastToAllClients({
            type: 'settingsUpdated',
            key: 'branding_admin_auth_background',
            value: null
          });
        }
      } catch (error) {

      }

      res.json({
        message: "Admin auth background deleted successfully"
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete admin auth background" });
    }
  });

  app.delete("/api/admin/settings/branding/user-auth-background", ensureSettingsAccess, async (req, res) => {
    try {
      const oldSetting = await storage.getAppSetting('branding_user_auth_background');
      const oldUrl = oldSetting?.value as string | undefined;


      if (oldUrl) {
        await cleanupOldAuthBackground(oldUrl);
      }


      await storage.deleteAppSetting('branding_user_auth_background');

      try {
        if ((global as any).broadcastToAllClients) {
          (global as any).broadcastToAllClients({
            type: 'settingsUpdated',
            key: 'branding_user_auth_background',
            value: null
          });
        }
      } catch (error) {

      }

      res.json({
        message: "User auth background deleted successfully"
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete user auth background" });
    }
  });

  app.post("/api/admin/settings/branding/auth-backgrounds", ensureSettingsAccess, async (req, res) => {
    try {
      const { adminAuthBackground, userAuthBackground } = req.body;

      const config: any = {};


      if (adminAuthBackground) {
        const validation = validateAuthBackgroundConfig(adminAuthBackground);
        if (!validation.valid) {
          return res.status(400).json({ error: `Invalid admin auth background config: ${validation.error}` });
        }
        config.adminAuthBackground = {
          backgroundColor: adminAuthBackground.backgroundColor,
          gradientConfig: adminAuthBackground.gradientConfig,
          priority: adminAuthBackground.priority || 'image'
        };
      }


      if (userAuthBackground) {
        const validation = validateAuthBackgroundConfig(userAuthBackground);
        if (!validation.valid) {
          return res.status(400).json({ error: `Invalid user auth background config: ${validation.error}` });
        }
        config.userAuthBackground = {
          backgroundColor: userAuthBackground.backgroundColor,
          gradientConfig: userAuthBackground.gradientConfig,
          priority: userAuthBackground.priority || 'image'
        };
      }


      await storage.saveAppSetting('auth_background_config', config);

      try {
        if ((global as any).broadcastToAllClients) {
          (global as any).broadcastToAllClients({
            type: 'settingsUpdated',
            key: 'auth_background_config',
            value: config
          });
        }
      } catch (error) {

      }

      res.json({
        message: "Auth background configuration saved successfully",
        config
      });
    } catch (error) {
      if (error instanceof Error) {
        res.status(500).json({ error: error.message || "Failed to save auth background configuration" });
      } else {
        res.status(500).json({ error: "Failed to save auth background configuration" });
      }
    }
  });


  app.post("/api/admin/companies/:id/logo", ensureSuperAdmin, upload.single('logo'), async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);
      if (isNaN(companyId)) {
        return res.status(400).json({ error: "Invalid company ID" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }


      const existingCompany = await storage.getCompany(companyId);
      if (!existingCompany) {
        return res.status(404).json({ error: "Company not found" });
      }


      const companyUploadDir = path.join(uploadsDir, 'companies', companyId.toString());
      if (!fs.existsSync(companyUploadDir)) {
        fs.mkdirSync(companyUploadDir, { recursive: true });
      }


      const fileExtension = path.extname(req.file.filename);
      const targetFileName = `logo${fileExtension}`;
      const targetPath = path.join(companyUploadDir, targetFileName);
      fs.renameSync(req.file.path, targetPath);

      const timestamp = Date.now();
      const logoUrl = `/uploads/companies/${companyId}/${targetFileName}?v=${timestamp}`;

      const updatedCompany = await storage.updateCompany(companyId, {
        logo: logoUrl
      });


      try {
        invalidateSubdomainCache(existingCompany.slug);
      } catch (error) {

      }

      res.json({
        message: "Company logo uploaded successfully",
        logoUrl,
        company: updatedCompany
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to upload company logo" });
    }
  });

  app.post("/api/admin/settings/branding", ensureSettingsAccess, async (req, res) => {
    try {
      const { appName, primaryColor, secondaryColor, defaultTheme } = req.body;

      if (!appName) {
        return res.status(400).json({ error: "Application name is required" });
      }


      if (defaultTheme !== undefined && defaultTheme !== null && defaultTheme !== '' && defaultTheme !== 'dark' && defaultTheme !== 'light') {
        return res.status(400).json({ error: "defaultTheme must be either 'dark' or 'light'" });
      }

      const brandingSettings: any = {
        appName: appName,
        primaryColor: primaryColor || '#333235',
        secondaryColor: secondaryColor || '#4F46E5'
      };


      if (defaultTheme === 'dark' || defaultTheme === 'light') {
        brandingSettings.defaultTheme = defaultTheme;
      }

      await storage.saveAppSetting('branding', brandingSettings);


      try {




      } catch (error) {

      }

      try {
        if ((global as any).broadcastToAllClients) {

          (global as any).broadcastToAllClients({
            type: 'settingsUpdated',
            key: 'branding',
            value: brandingSettings
          });
        }
      } catch (error) {

      }

      res.json({
        message: "Branding settings saved successfully",
        settings: brandingSettings
      });
    } catch (error) {
      if (error instanceof Error) {
        res.status(500).json({ error: error.message || "Failed to save branding settings" });
      } else {
        res.status(500).json({ error: "Failed to save branding settings" });
      }
    }
  });

  app.post("/api/admin/settings/registration", ensureSuperAdmin, async (req, res) => {
    try {
      const { enabled, requireApproval, defaultPlan } = req.body;

      if (defaultPlan && defaultPlan !== 'free') {
        const planId = parseInt(defaultPlan);
        if (!isNaN(planId)) {
          const plan = await storage.getPlan(planId);
          if (!plan) {
            return res.status(400).json({ error: `Plan with ID ${planId} not found` });
          }
          if (!plan.isActive) {
            return res.status(400).json({ error: `Plan with ID ${planId} is not active` });
          }
        }
      }

      const registrationSettings = {
        enabled: Boolean(enabled),
        requireApproval: Boolean(requireApproval),
        defaultPlan: defaultPlan || '1'
      };

      await storage.saveAppSetting('registration_settings', registrationSettings);

      res.json({
        message: "Registration settings saved successfully",
        settings: registrationSettings
      });
    } catch (error) {

      res.status(500).json({ error: "Failed to save registration settings" });
    }
  });

  app.post("/api/admin/settings/general", ensureSuperAdmin, async (req, res) => {
    try {
      let { defaultCurrency, dateFormat, timeFormat, subdomainAuthentication, frontendWebsiteEnabled, planRenewalEnabled, helpSupportUrl, customCurrencies } = req.body;


      if (helpSupportUrl && helpSupportUrl.trim()) {
        try {
          new URL(helpSupportUrl.trim());
        } catch (error) {
          return res.status(400).json({ error: "Invalid Help & Support URL format" });
        }
      }


      if (customCurrencies !== undefined) {
        if (!Array.isArray(customCurrencies)) {
          return res.status(400).json({ error: "customCurrencies must be an array" });
        }


        const builtInCurrencies = ['ARS', 'BRL', 'MXN', 'CLP', 'COP', 'PEN', 'UYU', 'PYG', 'BOB', 'VEF', 'PKR', 'INR', 'USD', 'EUR'];
        const seenCodes = new Set<string>();
        
        for (const currency of customCurrencies) {

          if (!currency.code || !currency.name || !currency.symbol) {
            return res.status(400).json({ error: "Each custom currency must have code, name, and symbol" });
          }


          const code = String(currency.code).trim().toUpperCase();
          if (!/^[A-Z]{3}$/.test(code)) {
            return res.status(400).json({ error: `Invalid currency code format: ${code}. Must be exactly 3 uppercase letters (ISO 4217 format)` });
          }


          if (builtInCurrencies.includes(code)) {
            return res.status(400).json({ error: `Currency code ${code} conflicts with a built-in default currency. Custom currencies cannot override built-in currencies.` });
          }


          try {
            new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(1);
          } catch (error) {
            return res.status(400).json({ error: `Currency code ${code} is not supported by the Intl API. Please use a valid ISO 4217 currency code.` });
          }


          if (seenCodes.has(code)) {
            return res.status(400).json({ error: `Duplicate currency code found: ${code}` });
          }
          seenCodes.add(code);
        }


        customCurrencies = customCurrencies.map((currency: any) => ({
          code: String(currency.code).trim().toUpperCase(),
          name: String(currency.name).trim(),
          symbol: String(currency.symbol).trim()
        }));
      }

      const generalSettings = {
        defaultCurrency: defaultCurrency || 'USD',
        dateFormat: dateFormat || 'MM/DD/YYYY',
        timeFormat: timeFormat || '12h',
        subdomainAuthentication: Boolean(subdomainAuthentication),
        frontendWebsiteEnabled: frontendWebsiteEnabled !== undefined ? Boolean(frontendWebsiteEnabled) : false,
        planRenewalEnabled: planRenewalEnabled !== undefined ? Boolean(planRenewalEnabled) : true,
        helpSupportUrl: helpSupportUrl ? helpSupportUrl.trim() : '',
        customCurrencies: customCurrencies || []
      };

      await storage.saveAppSetting('general_settings', generalSettings);

      await storage.saveAppSetting('subdomain_authentication', Boolean(subdomainAuthentication));


      try {
        if ((global as any).broadcastToAllClients) {
          (global as any).broadcastToAllClients({
            type: 'settingsUpdated',
            key: 'general_settings',
            value: generalSettings
          });
        }
      } catch (error) {

      }

      res.json({
        message: "General settings saved successfully",
        settings: generalSettings
      });
    } catch (error) {

      res.status(500).json({ error: "Failed to save general settings" });
    }
  });


  app.get("/api/admin/settings/custom-scripts", ensureSettingsAccess, async (_req, res) => {
    try {
      const customScriptsSetting = await storage.getAppSetting('custom_scripts');

      if (!customScriptsSetting) {
        const defaultConfig = {
          enabled: false,
          scripts: '',
          lastModified: new Date().toISOString()
        };
        return res.json(defaultConfig);
      }

      res.json(customScriptsSetting.value);
    } catch (error) {

      res.status(500).json({ error: "Failed to fetch custom scripts settings" });
    }
  });

  app.post("/api/admin/settings/custom-scripts", ensureSuperAdmin, async (req, res) => {
    try {
      const { enabled, scripts } = req.body;


      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: "Enabled must be a boolean value" });
      }

      if (typeof scripts !== 'string') {
        return res.status(400).json({ error: "Scripts must be a string" });
      }


      const srcMatches = scripts.match(/src\s*=\s*["']([^"']+)["']/gi);

      const customScriptsSettings = {
        enabled: Boolean(enabled),
        scripts: scripts || '',
        lastModified: new Date().toISOString()
      };

      await storage.saveAppSetting('custom_scripts', customScriptsSettings);


      try {
        if ((global as any).broadcastToAllClients) {
          (global as any).broadcastToAllClients({
            type: 'customScriptsUpdated',
            data: customScriptsSettings
          });
        }
      } catch (error) {

      }

      res.json({
        message: "Custom scripts settings saved successfully",
        settings: customScriptsSettings
      });
    } catch (error) {

      res.status(500).json({ error: "Failed to save custom scripts settings" });
    }
  });

  app.get("/api/admin/settings/custom-css", ensureSettingsAccess, async (_req, res) => {
    try {
      const customCssSetting = await storage.getAppSetting('custom_css');

      if (!customCssSetting) {
        const defaultConfig = {
          enabled: false,
          css: '',
          lastModified: new Date().toISOString()
        };
        return res.json(defaultConfig);
      }

      res.json(customCssSetting.value);
    } catch (error) {

      res.status(500).json({ error: "Failed to fetch custom CSS settings" });
    }
  });

  app.post("/api/admin/settings/custom-css", ensureSuperAdmin, async (req, res) => {
    try {
      const { enabled, css } = req.body;

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: "Enabled must be a boolean value" });
      }

      if (typeof css !== 'string') {
        return res.status(400).json({ error: "CSS must be a string" });
      }

      const customCssSettings = {
        enabled: Boolean(enabled),
        css: css || '',
        lastModified: new Date().toISOString()
      };

      await storage.saveAppSetting('custom_css', customCssSettings);


      try {
        if ((global as any).broadcastToAllClients) {
          (global as any).broadcastToAllClients({
            type: 'customCssUpdated',
            data: customCssSettings
          });
        }
      } catch (error) {

      }

      res.json({
        message: "Custom CSS settings saved successfully",
        settings: customCssSettings
      });
    } catch (error) {

      res.status(500).json({ error: "Failed to save custom CSS settings" });
    }
  });


  app.get("/api/admin/settings/smtp", ensureSettingsAccess, async (_req, res) => {
    try {
      const smtpSetting = await storage.getAppSetting('smtp_config');

      if (!smtpSetting) {
        const defaultConfig = {
          enabled: false,
          host: '',
          port: 465,
          security: 'ssl',
          username: '',
          password: '',
          fromName: '',
          fromEmail: '',
          testEmail: ''
        };
        return res.json(defaultConfig);
      }

      const config = { ...(smtpSetting.value as any) };
      if (config.password) {
        config.password = '••••••••';
      }

      res.json(config);
    } catch (error) {

      res.status(500).json({ error: "Failed to fetch SMTP settings" });
    }
  });

  app.post("/api/admin/settings/smtp", ensureSettingsAccess, async (req, res) => {
    try {


      const validation = smtpConfigSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: "Invalid SMTP configuration format",
          details: validation.error.errors
        });
      }

      const config = validation.data;

      if (config.password === '••••••••') {
        const existingSetting = await storage.getAppSetting('smtp_config');
        if (existingSetting && (existingSetting.value as any).password) {
          config.password = (existingSetting.value as any).password;
        } else if (config.enabled) {
          return res.status(400).json({ error: "Password is required when SMTP is enabled" });
        }
      } else if (config.password && config.password.trim() !== '') {
        config.password = encryptPassword(config.password);
      }

      if (config.enabled) {
        const enabledValidation = validateEnabledSmtp(config);
        if (!enabledValidation.valid) {
          return res.status(400).json({
            error: "Invalid SMTP configuration",
            details: enabledValidation.errors
          });
        }
      }

      await storage.saveAppSetting('smtp_config', config);

      const responseConfig = { ...config };
      responseConfig.password = '••••••••';

      res.json({
        message: "SMTP settings saved successfully",
        config: responseConfig
      });
    } catch (error) {

      res.status(500).json({ error: "Failed to save SMTP settings" });
    }
  });

  app.post("/api/admin/settings/smtp/test", ensureSettingsAccess, async (req, res) => {
    try {

      const { testEmail } = req.body;

      if (!testEmail) {
        return res.status(400).json({ error: "Test email address is required" });
      }

      const smtpSetting = await storage.getAppSetting('smtp_config');
      if (!smtpSetting || !(smtpSetting.value as any).enabled) {
        return res.status(400).json({ error: "SMTP is not configured or disabled" });
      }

      const config = { ...(smtpSetting.value as any) };

      if (config.password && config.password !== '••••••••') {
        config.password = decryptPassword(config.password);
      } else {
        return res.status(400).json({ error: "SMTP password is not configured" });
      }

      const testResult = await testSMTPConnection(config, testEmail);

      if (testResult.success) {
        res.json({
          message: "Test email sent successfully",
          testEmail: testEmail
        });
      } else {
        res.status(400).json({
          error: "SMTP test failed",
          details: testResult.error
        });
      }
    } catch (error) {

      res.status(500).json({ error: "Failed to test SMTP connection" });
    }
  });

  app.post("/api/admin/settings/:key", ensureSuperAdmin, async (req, res) => {
    try {
      const key = req.params.key;
      const { value } = req.body;

      if (value === undefined) {
        return res.status(400).json({ error: "Value is required" });
      }

      const setting = await storage.saveAppSetting(key, value);

      try {
        if ((global as any).broadcastToAllClients) {
          (global as any).broadcastToAllClients({
            type: 'settingsUpdated',
            key,
            value
          });
        }
      } catch (error) {

      }

      res.json(setting);
    } catch (error) {

      res.status(500).json({ error: "Failed to save setting" });
    }
  });

  app.delete("/api/admin/settings/:key", ensureSuperAdmin, async (req, res) => {
    try {
      const key = req.params.key;
      const success = await storage.deleteAppSetting(key);

      if (!success) {
        return res.status(500).json({ error: "Failed to delete setting" });
      }

      res.json({ message: "Setting deleted successfully" });
    } catch (error) {

      res.status(500).json({ error: "Failed to delete setting" });
    }
  });


  app.post("/api/admin/settings/payment/stripe", ensureSuperAdmin, async (req, res) => {
    try {
      const { publishableKey, secretKey, webhookSecret, testMode } = req.body;

      if (!publishableKey || !secretKey) {
        return res.status(400).json({ error: "Publishable key and secret key are required" });
      }

      const stripeSettings = {
        publishableKey,
        secretKey,
        webhookSecret: webhookSecret || '',
        testMode: !!testMode,
        enabled: true
      };

      await storage.saveAppSetting('payment_stripe', stripeSettings);

      res.json({
        message: "Stripe settings saved successfully",
        settings: {
          ...stripeSettings,
          secretKey: '••••••••'
        }
      });
    } catch (error) {

      res.status(500).json({ error: "Failed to save Stripe settings" });
    }
  });

  app.post("/api/admin/settings/payment/stripe/test", ensureSuperAdmin, async (_req, res) => {
    try {
      const stripeSettingObj = await storage.getAppSetting('payment_stripe');

      if (!stripeSettingObj || !stripeSettingObj.value) {
        return res.status(400).json({ error: "Stripe is not configured" });
      }

      const stripeSettings = stripeSettingObj.value as any;

      const stripe = new Stripe(stripeSettings.secretKey, {
        apiVersion: '2025-09-30.clover' as any
      });

      const account = await stripe.accounts.retrieve();

      res.json({
        message: "Stripe connection successful",
        account: {
          id: account.id,
          email: account.email,
          country: account.country,
          detailsSubmitted: account.details_submitted
        }
      });
    } catch (error) {

      res.status(500).json({
        error: "Failed to connect to Stripe",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post("/api/admin/settings/payment/mercadopago", ensureSuperAdmin, async (req, res) => {
    try {
      const { clientId, clientSecret, accessToken, testMode } = req.body;

      if (!clientId || !clientSecret || !accessToken) {
        return res.status(400).json({ error: "Client ID, Client Secret, and Access Token are required" });
      }

      const mercadoPagoSettings = {
        clientId,
        clientSecret,
        accessToken,
        testMode: !!testMode,
        enabled: true
      };

      await storage.saveAppSetting('payment_mercadopago', mercadoPagoSettings);

      res.json({
        message: "Mercado Pago settings saved successfully",
        settings: {
          ...mercadoPagoSettings,
          clientSecret: '••••••••',
          accessToken: '••••••••'
        }
      });
    } catch (error) {

      res.status(500).json({ error: "Failed to save Mercado Pago settings" });
    }
  });

  app.post("/api/admin/settings/payment/mercadopago/test", ensureSuperAdmin, async (_req, res) => {
    try {
      const mercadoPagoSettingObj = await storage.getAppSetting('payment_mercadopago');

      if (!mercadoPagoSettingObj || !mercadoPagoSettingObj.value) {
        return res.status(400).json({ error: "Mercado Pago is not configured" });
      }

      const mercadoPagoSettings = mercadoPagoSettingObj.value as any;

      if (!mercadoPagoSettings.clientId || !mercadoPagoSettings.clientSecret || !mercadoPagoSettings.accessToken) {
        return res.status(400).json({ error: "Mercado Pago settings are incomplete" });
      }

      if (!mercadoPagoSettings.accessToken) {
        return res.status(400).json({ error: "Mercado Pago access token is required" });
      }

      let paymentMethods;

      try {
        const response = await fetch('https://api.mercadopago.com/v1/payment_methods', {
          headers: {
            'Authorization': `Bearer ${mercadoPagoSettings.accessToken}`
          }
        });


        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));

          throw new Error(`Failed to connect to Mercado Pago API: ${response.status} ${response.statusText}`);
        }

        paymentMethods = await response.json();
      } catch (error) {

        throw error;
      }

      if (!paymentMethods || paymentMethods.length === 0) {
        throw new Error('No payment methods returned from Mercado Pago API');
      }

      let userData;

      try {

        const userResponse = await fetch('https://api.mercadopago.com/users/me', {
          headers: {
            'Authorization': `Bearer ${mercadoPagoSettings.accessToken}`
          }
        });


        if (!userResponse.ok) {
          const errorData = await userResponse.json().catch(() => ({}));

          throw new Error(`Failed to fetch user information from Mercado Pago API: ${userResponse.status} ${userResponse.statusText}`);
        }

        userData = await userResponse.json();
      } catch (error) {

        throw error;
      }

      if (userData.id.toString() !== mercadoPagoSettings.clientId) {
        
      }

      res.json({
        message: "Mercado Pago connection successful",
        account: {
          id: userData.id,
          email: userData.email,
          nickname: userData.nickname,
          country: userData.country_id
        }
      });
    } catch (error) {

      res.status(500).json({
        error: "Failed to connect to Mercado Pago",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post("/api/admin/settings/payment/moyasar", ensureSuperAdmin, async (req, res) => {
    try {
      const { publishableKey, secretKey, testMode } = req.body;

      if (!publishableKey || !secretKey) {
        return res.status(400).json({ error: "Publishable key and secret key are required" });
      }

      const moyasarSettings = {
        publishableKey,
        secretKey,
        testMode: !!testMode,
        enabled: true
      };

      await storage.saveAppSetting('payment_moyasar', moyasarSettings);

      res.json({
        message: "Moyasar settings saved successfully",
        settings: {
          ...moyasarSettings,
          secretKey: '••••••••'
        }
      });
    } catch (error) {

      res.status(500).json({ error: "Failed to save Moyasar settings" });
    }
  });

  app.post("/api/admin/settings/payment/moyasar/test", ensureSuperAdmin, async (_req, res) => {
    try {
      const moyasarSettingObj = await storage.getAppSetting('payment_moyasar');

      if (!moyasarSettingObj || !moyasarSettingObj.value) {
        return res.status(400).json({ error: "Moyasar is not configured" });
      }

      const moyasarSettings = moyasarSettingObj.value as any;

      if (!moyasarSettings.publishableKey || !moyasarSettings.secretKey) {
        return res.status(400).json({ error: "Moyasar settings are incomplete" });
      }


      try {

        const response = await fetch('https://api.moyasar.com/v1/payments', {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${Buffer.from(moyasarSettings.secretKey + ':').toString('base64')}`
          }
        });

        if (response.status === 401) {
          throw new Error('Invalid API credentials. Please check your secret key.');
        } else if (response.status === 403) {
          throw new Error('API key does not have sufficient permissions.');
        } else if (response.status === 405) {


          if (!moyasarSettings.secretKey.startsWith('sk_')) {
            throw new Error('Invalid secret key format. Secret key should start with "sk_".');
          }


          res.json({
            success: true,
            message: "Moyasar API key format is valid",
            testMode: moyasarSettings.testMode,
            note: "Full API test not available - key format validated"
          });
          return;
        } else if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));

          throw new Error(`API test failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        res.json({
          success: true,
          message: "Moyasar API connection test successful",
          testMode: moyasarSettings.testMode,
          apiResponse: {
            status: response.status,
            hasData: !!data
          }
        });
      } catch (error) {

        throw error;
      }
    } catch (error) {

      res.status(500).json({
        error: "Failed to test Moyasar connection",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post("/api/admin/settings/payment/paystack", ensureSuperAdmin, async (req, res) => {
    try {
      const { publicKey, secretKey, testMode, subaccount, webhookSecret } = req.body;

      if (!publicKey || !secretKey) {
        return res.status(400).json({ error: "Public Key and Secret Key are required" });
      }

      const paystackSettings = {
        publicKey,
        secretKey,
        subaccount: subaccount || '',
        webhookSecret: webhookSecret || '',
        testMode: !!testMode,
        enabled: true
      };

      await storage.saveAppSetting('payment_paystack', paystackSettings);

      res.json({
        message: "Paystack settings saved successfully",
        settings: {
          ...paystackSettings,
          secretKey: '••••••••'
        }
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to save Paystack settings" });
    }
  });

  app.post("/api/admin/settings/payment/paystack/test", ensureSuperAdmin, async (_req, res) => {
    try {
      const paystackSettingObj = await storage.getAppSetting('payment_paystack');
      if (!paystackSettingObj || !paystackSettingObj.value) {
        return res.status(400).json({ error: "Paystack is not configured" });
      }

      const paystackSettings = paystackSettingObj.value as any;
      if (!paystackSettings.secretKey) {
        return res.status(400).json({ error: "Paystack secret key is missing" });
      }

      const response = await fetch('https://api.paystack.co/bank', {
        headers: {
          'Authorization': `Bearer ${paystackSettings.secretKey}`
        }
      });

      if (response.status === 401) {
        throw new Error('Invalid Paystack secret key');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.message || `Paystack API error: ${response.statusText}`);
      }

      res.json({
        message: "Paystack connection successful",
        testMode: !!paystackSettings.testMode
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to test Paystack connection",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post("/api/admin/settings/payment/paypal", ensureSuperAdmin, async (req, res) => {
    try {
      const { clientId, clientSecret, testMode } = req.body;

      if (!clientId || !clientSecret) {
        return res.status(400).json({ error: "Client ID and Client Secret are required" });
      }


      const trimmedClientId = clientId.trim();
      const trimmedClientSecret = clientSecret.trim();


      if (!trimmedClientId || !trimmedClientSecret) {
        return res.status(400).json({ error: "Client ID and Client Secret cannot be empty or whitespace only" });
      }

      const paypalSettings = {
        clientId: trimmedClientId,
        clientSecret: trimmedClientSecret,
        testMode: !!testMode,
        enabled: true
      };

      await storage.saveAppSetting('payment_paypal', paypalSettings);

      res.json({
        message: "PayPal settings saved successfully",
        settings: {
          ...paypalSettings,
          clientSecret: '••••••••'
        }
      });
    } catch (error) {

      res.status(500).json({ error: "Failed to save PayPal settings" });
    }
  });

  app.post("/api/admin/settings/payment/paypal/test", ensureSuperAdmin, async (_req, res) => {
    try {
      const paypalSettingObj = await storage.getAppSetting('payment_paypal');

      if (!paypalSettingObj || !paypalSettingObj.value) {
        return res.status(400).json({ error: "PayPal is not configured" });
      }

      const paypalSettings = paypalSettingObj.value as any;


      const clientId = (paypalSettings.clientId || '').trim();
      const clientSecret = (paypalSettings.clientSecret || '').trim();


      if (!clientId || !clientSecret) {
        console.error('PayPal credentials validation failed in test endpoint:', {
          hasClientId: !!paypalSettings.clientId,
          hasClientSecret: !!paypalSettings.clientSecret,
          clientIdLength: clientId?.length || 0,
          clientSecretLength: clientSecret?.length || 0,
          testMode: paypalSettings.testMode
        });
        return res.status(400).json({ error: "Invalid PayPal credentials. Please check your PayPal settings and remove any extra whitespace." });
      }

      let environment;
      if (paypalSettings.testMode) {
        environment = new paypal.core.SandboxEnvironment(
          clientId,
          clientSecret
        );
      } else {
        environment = new paypal.core.LiveEnvironment(
          clientId,
          clientSecret
        );
      }

      const client = new paypal.core.PayPalHttpClient(environment);

      const request = new paypal.orders.OrdersCreateRequest();
      request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: 'USD',
            value: '0.01'
          }
        }]
      });

      const response = await client.execute(request);

      if (response.statusCode !== 201) {
        throw new Error('Failed to connect to PayPal API');
      }


      res.json({
        message: "PayPal connection successful",
        account: {
          environment: paypalSettings.testMode ? 'sandbox' : 'live',
          status: 'connected'
        }
      });
    } catch (error) {

      console.error('PayPal connection test error:', error);
      res.status(500).json({
        error: "Failed to connect to PayPal. Please verify your credentials are correct and don't contain extra whitespace.",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post("/api/admin/settings/payment/mpesa", ensureSuperAdmin, async (req, res) => {
    try {
      const { consumerKey, consumerSecret, businessShortcode, passkey, testMode, shortcodeType, callbackUrl } = req.body;

      if (!consumerKey || !consumerSecret || !businessShortcode || !passkey) {
        return res.status(400).json({ error: "Consumer Key, Consumer Secret, Business Shortcode, and Passkey are required" });
      }

      const mpesaSettings = {
        consumerKey,
        consumerSecret,
        businessShortcode,
        passkey,
        shortcodeType: shortcodeType === 'buygoods' ? 'buygoods' : 'paybill',
        callbackUrl: typeof callbackUrl === 'string' ? callbackUrl : '',
        testMode: !!testMode,
        enabled: true
      };

      await storage.saveAppSetting('payment_mpesa', mpesaSettings);

      res.json({
        message: "MPESA settings saved successfully",
        settings: {
          ...mpesaSettings
        }
      });
    } catch (error) {

      res.status(500).json({ error: "Failed to save MPESA settings" });
    }
  });

  app.post("/api/admin/settings/payment/mpesa/test", ensureSuperAdmin, async (req, res) => {
    try {
      const { consumerKey, consumerSecret, businessShortcode, testMode } = req.body;

      if (!consumerKey || !consumerSecret || !businessShortcode) {
        return res.status(400).json({ error: "Consumer Key, Consumer Secret, and Business Shortcode are required for testing" });
      }


      const baseUrl = testMode ? 'https://sandbox.safaricom.co.ke' : 'https://api.safaricom.co.ke';
      const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

      try {
        const response = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (response.status === 401) {
            throw new Error('Invalid MPESA credentials. Please check your Consumer Key and Consumer Secret.');
          } else if (response.status === 400) {
            throw new Error('Bad request. Please verify your MPESA credentials format.');
          } else {
            throw new Error(errorData.error_description || `MPESA API error: ${response.status}`);
          }
        }

        const data = await response.json();

        if (!data.access_token) {
          throw new Error('Failed to obtain access token from MPESA API');
        }

        res.json({
          success: true,
          message: "MPESA connection successful",
          environment: testMode ? 'sandbox' : 'production',
          expires_in: data.expires_in
        });

      } catch (fetchError: any) {

        throw new Error(fetchError.message || 'Failed to connect to MPESA API');
      }

    } catch (error: any) {

      res.status(500).json({
        error: "Failed to test MPESA connection",
        details: error.message || 'Unknown error'
      });
    }
  });

  app.post("/api/admin/settings/payment/bank-transfer", ensureSuperAdmin, async (req, res) => {
    try {
      const {
        accountName,
        accountNumber,
        bankName,
        routingNumber,
        swiftCode,
        instructions,
        enabled
      } = req.body;

      if (!accountName || !accountNumber || !bankName) {
        return res.status(400).json({ error: "Account name, account number, and bank name are required" });
      }

      const bankSettings = {
        accountName,
        accountNumber,
        bankName,
        routingNumber: routingNumber || '',
        swiftCode: swiftCode || '',
        instructions: instructions || '',
        enabled: enabled !== false
      };

      await storage.saveAppSetting('payment_bank_transfer', bankSettings);

      res.json({
        message: "Bank transfer settings saved successfully",
        settings: bankSettings
      });
    } catch (error) {

      res.status(500).json({ error: "Failed to save bank transfer settings" });
    }
  });
















  app.get("/api/admin/settings/integrations/google-calendar", ensureSuperAdmin, async (req, res) => {
    try {
      const googleCalendarSetting = await storage.getAppSetting('google_calendar_oauth');


      const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
      const host = req.get('host') || 'localhost:9000';
      const origin = req.get('origin') || `${protocol}://${host}`;
      const baseUrl = process.env.BASE_URL || origin;

      if (!googleCalendarSetting) {
        const defaultConfig = {
          enabled: false,
          client_id: '',
          client_secret: '',
          redirect_uri: `${baseUrl}/api/google/calendar/callback`
        };
        return res.json(defaultConfig);
      }

      const config = { ...(googleCalendarSetting.value as any) };
      if (config.client_secret) {
        config.client_secret = '••••••••';
      }

      res.json(config);
    } catch (error) {

      res.status(500).json({ error: "Failed to fetch Google Calendar OAuth settings" });
    }
  });


  app.post("/api/admin/settings/integrations/google-calendar", ensureSuperAdmin, async (req, res) => {
    try {
      const { enabled, client_id, client_secret, redirect_uri } = req.body;

      if (enabled && (!client_id || !client_secret)) {
        return res.status(400).json({ error: "Client ID and Client Secret are required when enabling Google Calendar integration" });
      }


      const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
      const host = req.get('host') || 'localhost:9000';
      const origin = req.get('origin') || `${protocol}://${host}`;
      const baseUrl = process.env.BASE_URL || origin;

      const googleCalendarSettings = {
        enabled: !!enabled,
        client_id: client_id || '',
        client_secret: client_secret || '',
        redirect_uri: redirect_uri || `${baseUrl}/api/google/calendar/callback`
      };

      await storage.saveAppSetting('google_calendar_oauth', googleCalendarSettings);

      res.json({
        message: "Google Calendar OAuth settings saved successfully",
        settings: {
          ...googleCalendarSettings,
          client_secret: googleCalendarSettings.client_secret ? '••••••••' : ''
        }
      });
    } catch (error) {

      res.status(500).json({ error: "Failed to save Google Calendar OAuth settings" });
    }
  });



  app.get("/api/admin/settings/integrations/zoho-calendar", ensureSuperAdmin, async (req, res) => {
    try {
      const zohoCalendarSetting = await storage.getAppSetting('zoho_calendar_oauth');


      const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
      const host = req.get('host') || 'localhost:9000';
      const origin = req.get('origin') || `${protocol}://${host}`;
      const baseUrl = process.env.BASE_URL || origin;

      if (!zohoCalendarSetting) {
        const defaultConfig = {
          enabled: false,
          client_id: '',
          client_secret: '',
          redirect_uri: `${baseUrl}/api/zoho/calendar/callback`
        };
        return res.json(defaultConfig);
      }

      const config = { ...(zohoCalendarSetting.value as any) };
      if (config.client_secret) {
        config.client_secret = '••••••••';
      }

      res.json(config);
    } catch (error) {

      res.status(500).json({ error: "Failed to fetch Zoho Calendar OAuth settings" });
    }
  });

  app.post("/api/admin/settings/integrations/zoho-calendar", ensureSuperAdmin, async (req, res) => {
    try {
      const { enabled, client_id, client_secret, redirect_uri } = req.body;

      if (enabled && (!client_id || !client_secret)) {
        return res.status(400).json({ error: "Client ID and Client Secret are required when enabling Zoho Calendar integration" });
      }


      const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
      const host = req.get('host') || 'localhost:9000';
      const origin = req.get('origin') || `${protocol}://${host}`;
      const baseUrl = process.env.BASE_URL || origin;

      const zohoCalendarSettings = {
        enabled: !!enabled,
        client_id: client_id || '',
        client_secret: client_secret || '',
        redirect_uri: redirect_uri || `${baseUrl}/api/zoho/calendar/callback`
      };

      await storage.saveAppSetting('zoho_calendar_oauth', zohoCalendarSettings);



      res.json({
        message: "Zoho Calendar OAuth settings saved successfully",
        settings: {
          ...zohoCalendarSettings,
          client_secret: zohoCalendarSettings.client_secret ? '••••••••' : ''
        },
        debug_info: {
          global_data_center_support: true,
          accounts_endpoint: 'https://accounts.zoho.com',
          calendar_api_endpoint: 'https://calendar.zoho.com/api/v1',
          required_scopes: ['ZohoCalendar.event.ALL', 'ZohoCalendar.calendar.READ']
        }
      });
    } catch (error) {

      res.status(500).json({ error: "Failed to save Zoho Calendar OAuth settings" });
    }
  });


  app.get("/api/admin/settings/integrations/zoho-calendar/test", ensureSuperAdmin, async (req, res) => {
    try {
      const zohoCalendarSetting = await storage.getAppSetting('zoho_calendar_oauth');

      if (!zohoCalendarSetting || !zohoCalendarSetting.value) {
        return res.json({
          success: false,
          error: "Zoho Calendar OAuth not configured",
          recommendations: [
            "Configure Zoho Calendar OAuth settings first",
            "Ensure you have a valid Zoho Developer Console application"
          ]
        });
      }

      const config = zohoCalendarSetting.value as any;

      const validationResults = {
        success: true,
        configuration: {
          enabled: config.enabled,
          has_client_id: !!config.client_id,
          has_client_secret: !!config.client_secret,
          redirect_uri: config.redirect_uri,
          client_id_format: config.client_id ? (config.client_id.startsWith('1000.') ? 'Valid' : 'Invalid format') : 'Missing'
        },
        endpoints: {
          auth_url: 'https://accounts.zoho.com/oauth/v2/auth',
          token_url: 'https://accounts.zoho.com/oauth/v2/token',
          calendar_api: 'https://calendar.zoho.com/api/v1'
        },
        required_scopes: ['ZohoCalendar.event.ALL', 'ZohoCalendar.calendar.READ'],
        recommendations: [] as string[]
      };


      if (!config.enabled) {
        validationResults.recommendations.push("Enable Zoho Calendar integration");
      }
      if (!config.client_id) {
        validationResults.recommendations.push("Add Client ID from Zoho Developer Console");
      }
      if (!config.client_secret) {
        validationResults.recommendations.push("Add Client Secret from Zoho Developer Console");
      }
      if (config.client_id && !config.client_id.startsWith('1000.')) {
        validationResults.recommendations.push("Client ID should start with '1000.' - verify it's from Zoho Developer Console");
      }

      res.json(validationResults);
    } catch (error) {

      res.status(500).json({
        success: false,
        error: "Failed to test Zoho Calendar configuration"
      });
    }
  });



  app.get("/api/admin/settings/integrations/calendly", ensureSuperAdmin, async (req, res) => {
    try {
      const calendlySetting = await storage.getAppSetting('calendly_oauth');


      const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
      const host = req.get('host') || 'localhost:9000';
      const origin = req.get('origin') || `${protocol}://${host}`;
      const baseUrl = process.env.BASE_URL || origin;

      if (!calendlySetting) {
        const defaultConfig = {
          enabled: false,
          client_id: '',
          client_secret: '',
          webhook_signing_key: '',
          redirect_uri: `${baseUrl}/api/calendly/callback`
        };
        return res.json(defaultConfig);
      }

      const config = { ...(calendlySetting.value as any) };
      if (config.client_secret) {
        config.client_secret = '••••••••';
      }
      if (config.webhook_signing_key) {
        config.webhook_signing_key = '••••••••';
      }

      res.json(config);
    } catch (error) {

      res.status(500).json({ error: "Failed to fetch Calendly OAuth settings" });
    }
  });

  app.post("/api/admin/settings/integrations/calendly", ensureSuperAdmin, async (req, res) => {
    try {
      const { enabled, client_id, client_secret, webhook_signing_key, redirect_uri } = req.body;

      if (enabled && (!client_id || !client_secret)) {
        return res.status(400).json({ error: "Client ID and Client Secret are required when enabling Calendly integration" });
      }


      const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
      const host = req.get('host') || 'localhost:9000';
      const origin = req.get('origin') || `${protocol}://${host}`;
      const baseUrl = process.env.BASE_URL || origin;

      const calendlySettings = {
        enabled: !!enabled,
        client_id: client_id || '',
        client_secret: client_secret || '',
        webhook_signing_key: webhook_signing_key || '',
        redirect_uri: redirect_uri || `${baseUrl}/api/calendly/callback`
      };

      await storage.saveAppSetting('calendly_oauth', calendlySettings);

      res.json({
        message: "Calendly OAuth settings saved successfully",
        settings: {
          ...calendlySettings,
          client_secret: calendlySettings.client_secret ? '••••••••' : '',
          webhook_signing_key: calendlySettings.webhook_signing_key ? '••••••••' : ''
        }
      });
    } catch (error) {

      res.status(500).json({ error: "Failed to save Calendly OAuth settings" });
    }
  });

  app.get("/api/admin/settings/integrations/google-sheets", ensureSuperAdmin, async (req, res) => {
    try {
      const googleSheetsSetting = await storage.getAppSetting('google_sheets_oauth');


      const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
      const host = req.get('host') || 'localhost:9000';
      const origin = req.get('origin') || `${protocol}://${host}`;
      const baseUrl = process.env.BASE_URL || origin;

      if (!googleSheetsSetting) {
        const defaultConfig = {
          enabled: false,
          client_id: '',
          client_secret: '',
          redirect_uri: `${baseUrl}/api/google/sheets/callback`
        };
        return res.json(defaultConfig);
      }

      const config = { ...(googleSheetsSetting.value as any) };
      if (config.client_secret) {
        config.client_secret = '••••••••';
      }

      res.json(config);
    } catch (error) {

      res.status(500).json({ error: "Failed to fetch Google Sheets OAuth settings" });
    }
  });


  app.post("/api/admin/settings/integrations/google-sheets", ensureSuperAdmin, async (req, res) => {
    try {
      const { enabled, client_id, client_secret, redirect_uri } = req.body;

      if (enabled && (!client_id || !client_secret)) {
        return res.status(400).json({ error: "Client ID and Client Secret are required when enabling Google Sheets integration" });
      }


      const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
      const host = req.get('host') || 'localhost:9000';
      const origin = req.get('origin') || `${protocol}://${host}`;
      const baseUrl = process.env.BASE_URL || origin;

      const googleSheetsSettings = {
        enabled: !!enabled,
        client_id: client_id || '',
        client_secret: client_secret || '',
        redirect_uri: redirect_uri || `${baseUrl}/api/google/sheets/callback`
      };

      await storage.saveAppSetting('google_sheets_oauth', googleSheetsSettings);

      res.json({
        message: "Google Sheets OAuth settings saved successfully",
        settings: {
          ...googleSheetsSettings,
          client_secret: googleSheetsSettings.client_secret ? '••••••••' : ''
        }
      });
    } catch (error) {

      res.status(500).json({ error: "Failed to save Google Sheets OAuth settings" });
    }
  });

  app.post("/api/webhooks/stripe", async (req: Request, res: Response) => {
    try {
      const stripeSettingObj = await storage.getAppSetting('payment_stripe');

      if (!stripeSettingObj || !stripeSettingObj.value) {
        return res.status(400).json({ error: "Stripe is not configured" });
      }

      const stripeSettings = stripeSettingObj.value as any;

      const stripe = new Stripe(stripeSettings.secretKey, {
        apiVersion: '2025-09-30.clover' as any
      });

      const signature = req.headers['stripe-signature'] as string;

      if (!signature || !stripeSettings.webhookSecret) {
        return res.status(400).json({ error: "Missing signature or webhook secret" });
      }

      let event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          signature,
          stripeSettings.webhookSecret
        );
      } catch (err) {

        return res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }

      switch (event.type) {
        case 'payment_intent.succeeded':
          const paymentIntent = event.data.object;
          if (paymentIntent.metadata && paymentIntent.metadata.transactionId) {
            const transactionId = parseInt(paymentIntent.metadata.transactionId);


            await storage.updatePaymentTransaction(transactionId, {
              status: 'completed',
              paymentIntentId: paymentIntent.id,
              receiptUrl: (paymentIntent as any).charges?.data[0]?.receipt_url
            });


            const transaction = await storage.getPaymentTransaction(transactionId);
            if (transaction && paymentIntent.metadata.companyId && paymentIntent.metadata.planId) {
              const companyId = parseInt(paymentIntent.metadata.companyId);
              const planId = parseInt(paymentIntent.metadata.planId);


              const plan = await storage.getPlan(planId);
              const updatedCompany = await storage.updateCompany(companyId, {
                planId: planId,
                plan: plan?.name.toLowerCase() || 'unknown',
                subscriptionStatus: 'active',
                subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
              });




              try {
                if ((global as any).broadcastToCompany && updatedCompany) {
                  (global as any).broadcastToCompany({
                    type: 'plan_updated',
                    data: {
                      companyId,
                      newPlan: updatedCompany.plan,
                      planId: updatedCompany.planId,
                      timestamp: new Date().toISOString(),
                      changeType: 'payment_upgrade'
                    }
                  }, companyId);
                }
              } catch (broadcastError) {

              }
            }
          }
          break;
        case 'payment_intent.payment_failed':
          const failedPaymentIntent = event.data.object;
          if (failedPaymentIntent.metadata && failedPaymentIntent.metadata.transactionId) {
            await storage.updatePaymentTransaction(
              parseInt(failedPaymentIntent.metadata.transactionId),
              {
                status: 'failed',
                paymentIntentId: failedPaymentIntent.id
              }
            );
          }
          break;
        default:
      }

      res.json({ received: true });
    } catch (error) {

      res.status(500).json({ error: 'Failed to process webhook' });
    }
  });

  app.post("/api/webhooks/mercadopago", async (req: Request, res: Response) => {
    try {
      const mercadoPagoSettingObj = await storage.getAppSetting('payment_mercadopago');

      if (!mercadoPagoSettingObj || !mercadoPagoSettingObj.value) {
        return res.status(400).json({ error: "Mercado Pago is not configured" });
      }

      const mercadoPagoSettings = mercadoPagoSettingObj.value as any;

      if (!mercadoPagoSettings.clientId || !mercadoPagoSettings.clientSecret || !mercadoPagoSettings.accessToken) {
        return res.status(400).json({ error: "Mercado Pago settings are incomplete" });
      }

      if (!mercadoPagoSettings.accessToken) {
        return res.status(400).json({ error: "Mercado Pago access token is required" });
      }

      const { type, data } = req.body;

      if (!type || !data) {
        return res.status(400).json({ error: "Invalid webhook payload" });
      }

      if (type === 'payment') {
        const paymentId = data.id;

        const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: {
            'Authorization': `Bearer ${mercadoPagoSettings.accessToken}`
          }
        });

        if (!paymentResponse.ok) {
          throw new Error(`Failed to get payment details: ${paymentResponse.status} ${paymentResponse.statusText}`);
        }

        const paymentData = await paymentResponse.json();

        if (paymentData.external_reference) {
          const transactionId = parseInt(paymentData.external_reference);

          if (!isNaN(transactionId)) {
            let status = 'pending';

            switch (paymentData.status) {
              case 'approved':
                status = 'completed';
                break;
              case 'rejected':
              case 'cancelled':
                status = 'failed';
                break;
              case 'refunded':
                status = 'refunded';
                break;
              default:
                status = 'pending';
            }

            await storage.updatePaymentTransaction(transactionId, {
              status: status as 'pending' | 'completed' | 'failed' | 'refunded',
              paymentIntentId: paymentData.id.toString(),
              metadata: {
                ...paymentData,
                mercadopago_status: paymentData.status,
                mercadopago_status_detail: paymentData.status_detail
              }
            });
          }
        }
      }

      res.json({ received: true });
    } catch (error) {

      res.status(500).json({ error: 'Failed to process webhook' });
    }
  });

  app.post("/api/webhooks/paypal", async (req: Request, res: Response) => {
    try {
      const paypalSettingObj = await storage.getAppSetting('payment_paypal');

      if (!paypalSettingObj || !paypalSettingObj.value) {
        return res.status(400).json({ error: "PayPal is not configured" });
      }

      const body = req.body;

      const verificationBody = 'cmd=_notify-validate&' + Object.keys(body).map(key => {
        return `${encodeURIComponent(key)}=${encodeURIComponent(body[key])}`;
      }).join('&');

      const verificationUrl = (paypalSettingObj.value as any).testMode
        ? 'https://ipnpb.sandbox.paypal.com/cgi-bin/webscr'
        : 'https://ipnpb.paypal.com/cgi-bin/webscr';

      const verificationResponse = await fetch(verificationUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: verificationBody
      });

      const verificationText = await verificationResponse.text();

      if (verificationText === 'VERIFIED') {
        const paymentStatus = body.payment_status;
        const transactionId = body.custom;

        if (transactionId) {
          let status = 'pending';

          switch (paymentStatus) {
            case 'Completed':
              status = 'completed';
              break;
            case 'Failed':
            case 'Denied':
            case 'Expired':
              status = 'failed';
              break;
            case 'Refunded':
            case 'Reversed':
              status = 'refunded';
              break;
            default:
              status = 'pending';
          }

          await storage.updatePaymentTransaction(parseInt(transactionId), {
            status: status as 'pending' | 'completed' | 'failed' | 'refunded',
            paymentIntentId: body.txn_id,
            receiptUrl: body.receipt_url || '',
            metadata: {
              ...body,
              paypal_payment_status: paymentStatus
            }
          });
        }
      } else {

      }

      res.status(200).end();
    } catch (error) {

      res.status(200).end();
    }
  });

  app.post("/api/webhooks/moyasar", async (req: Request, res: Response) => {
    try {
      const moyasarSettingObj = await storage.getAppSetting('payment_moyasar');

      if (!moyasarSettingObj || !moyasarSettingObj.value) {

        return res.status(400).json({ error: "Moyasar is not configured" });
      }

      const body = req.body;


      if (!body.type || !body.data) {

        return res.status(400).json({ error: "Invalid webhook payload" });
      }

      const eventType = body.type;
      const paymentData = body.data;

      

      if (eventType.startsWith('payment_')) {
        const paymentId = paymentData.id;


        const transactions = await storage.getAllPaymentTransactions();
        const transaction = transactions.find((t: any) =>
          t.paymentIntentId === paymentId || t.externalTransactionId === paymentId
        );

        if (!transaction) {

          return res.status(404).json({ error: "Transaction not found" });
        }


        const statusMap: { [key: string]: 'completed' | 'failed' | 'pending' | 'refunded' | 'cancelled' } = {
          'payment_paid': 'completed',
          'payment_failed': 'failed',
          'payment_authorized': 'pending',
          'payment_captured': 'completed',
          'payment_voided': 'cancelled',
          'payment_refunded': 'refunded',
          'payment_verified': 'completed'
        };

        const newStatus = statusMap[eventType];

        if (newStatus && newStatus !== transaction.status) {
          await storage.updatePaymentTransaction(transaction.id, {
            status: newStatus
          });




          if (newStatus === 'completed' && transaction.companyId && transaction.planId) {
            const company = await storage.getCompany(transaction.companyId);
            if (company && (company.planId !== transaction.planId || company.subscriptionStatus !== 'active')) {

              const plan = await storage.getPlan(transaction.planId);
              const updatedCompany = await storage.updateCompany(transaction.companyId, {
                planId: transaction.planId,
                plan: plan?.name || 'unknown',
                subscriptionStatus: 'active',
                subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
              });




              try {
                if ((global as any).broadcastToCompany && updatedCompany) {
                  (global as any).broadcastToCompany({
                    type: 'plan_updated',
                    data: {
                      companyId: transaction.companyId,
                      newPlan: updatedCompany.plan,
                      planId: updatedCompany.planId,
                      timestamp: new Date().toISOString(),
                      changeType: 'subscription_activation'
                    }
                  }, transaction.companyId);
                }
              } catch (broadcastError) {

              }
            }
          }
        }
      }

      res.status(200).json({ received: true });
    } catch (error) {

      res.status(500).json({ error: 'Failed to process webhook' });
    }
  });

  app.post("/api/webhooks/mpesa", async (req: Request, res: Response) => {
    try {
      const mpesaSettingObj = await storage.getAppSetting('payment_mpesa');

      if (!mpesaSettingObj || !mpesaSettingObj.value) {

        return res.status(400).json({ error: "MPESA is not configured" });
      }

      const body = req.body;



      if (!body.Body || !body.Body.stkCallback) {

        return res.status(400).json({ error: "Invalid webhook payload" });
      }

      const stkCallback = body.Body.stkCallback;
      const checkoutRequestId = stkCallback.CheckoutRequestID;
      const merchantRequestId = stkCallback.MerchantRequestID;
      const resultCode = stkCallback.ResultCode;
      const resultDesc = stkCallback.ResultDesc;


      const transactions = await storage.getAllPaymentTransactions();
      const transaction = transactions.find((t: any) =>
        t.paymentIntentId === checkoutRequestId || t.externalTransactionId === merchantRequestId
      );

      if (!transaction) {

        return res.status(404).json({ error: "Transaction not found" });
      }




      let newStatus: 'pending' | 'completed' | 'failed' | 'cancelled' = 'pending';

      if (resultCode === 0) {

        newStatus = 'completed';


        const callbackMetadata = stkCallback.CallbackMetadata;
        let mpesaReceiptNumber = '';
        let transactionDate = '';
        let phoneNumber = '';
        let amount = 0;

        if (callbackMetadata && callbackMetadata.Item) {
          for (const item of callbackMetadata.Item) {
            switch (item.Name) {
              case 'MpesaReceiptNumber':
                mpesaReceiptNumber = item.Value;
                break;
              case 'TransactionDate':
                transactionDate = item.Value;
                break;
              case 'PhoneNumber':
                phoneNumber = item.Value;
                break;
              case 'Amount':
                amount = item.Value;
                break;
            }
          }
        }


        await storage.updatePaymentTransaction(transaction.id, {
          status: newStatus,
          externalTransactionId: mpesaReceiptNumber || merchantRequestId,
          paymentIntentId: checkoutRequestId
        });


        const plan = transaction.planId ? await storage.getPlan(transaction.planId) : null;
        if (plan && transaction.companyId) {
          await storage.updateCompany(transaction.companyId, {
            planId: transaction.planId,
            plan: plan.name.toLowerCase(),
            subscriptionStatus: 'active',
            subscriptionStartDate: new Date(),
            subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            isInTrial: false,
            trialStartDate: null,
            trialEndDate: null
          });


          try {
            if ((global as any).broadcastToCompany) {
              (global as any).broadcastToCompany({
                type: 'plan_updated',
                data: {
                  companyId: transaction.companyId,
                  newPlan: plan.name.toLowerCase(),
                  planId: transaction.planId,
                  timestamp: new Date().toISOString(),
                  changeType: 'payment_upgrade'
                }
              }, transaction.companyId);
            }
          } catch (broadcastError) {

          }
        }



      } else if (resultCode === 1032) {

        newStatus = 'cancelled';
        await storage.updatePaymentTransaction(transaction.id, { status: newStatus });


      } else if (resultCode === 1037) {

        newStatus = 'failed';
        await storage.updatePaymentTransaction(transaction.id, { status: newStatus });


      } else if (resultCode === 1001) {

        newStatus = 'failed';
        await storage.updatePaymentTransaction(transaction.id, { status: newStatus });


      } else {

        newStatus = 'failed';
        await storage.updatePaymentTransaction(transaction.id, { status: newStatus });

      }


      res.status(200).json({
        ResultCode: 0,
        ResultDesc: "Accepted"
      });

    } catch (error) {

      res.status(200).json({
        ResultCode: 1,
        ResultDesc: "Failed to process webhook"
      });
    }
  });

  app.get("/api/admin/analytics", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const timeRange = req.query.timeRange || '30days';

      let startDate = new Date();
      switch(timeRange) {
        case '7days':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30days':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90days':
          startDate.setDate(startDate.getDate() - 90);
          break;
        case 'year':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        case 'all':
          startDate = new Date(0);
          break;
        default:
          startDate.setDate(startDate.getDate() - 30);
      }

      const startDateStr = startDate.toISOString();

      const users = await storage.getAllUsers();
      const totalUsers = users.length;

      const companies = await storage.getAllCompanies();
      const totalCompanies = companies.length;
      const activeCompanies = companies.filter(company => company.active).length;

      const totalConversations = await storage.getConversationsCount();

      const totalMessages = await storage.getMessagesCount();

      const contactsData = await storage.getContacts();
      const totalContacts = contactsData.total;

      const userGrowthQuery = `
        SELECT
          DATE_TRUNC('month', created_at) AS date,
          COUNT(*) AS count
        FROM
          users
        WHERE
          created_at >= $1
        GROUP BY
          DATE_TRUNC('month', created_at)
        ORDER BY
          date ASC
      `;

      const userGrowthResult = await pool.query(userGrowthQuery, [startDateStr]);
      const userGrowth = userGrowthResult.rows.map(row => ({
        date: row.date.toISOString().split('T')[0],
        count: parseInt(row.count)
      }));

      const messagesByChannelQuery = `
        SELECT
          c.channel_type AS channel,
          COUNT(m.id) AS count
        FROM
          messages m
        JOIN
          conversations conv ON m.conversation_id = conv.id
        JOIN
          channel_connections c ON conv.channel_id = c.id
        WHERE
          m.created_at >= $1
        GROUP BY
          c.channel_type
        ORDER BY
          count DESC
      `;

      const messagesByChannelResult = await pool.query(messagesByChannelQuery, [startDateStr]);
      const messagesByChannel = messagesByChannelResult.rows.map(row => ({
        channel: row.channel,
        count: parseInt(row.count)
      }));

      const conversationsByCompanyQuery = `
        SELECT
          c.name AS company,
          COUNT(conv.id) AS count
        FROM
          conversations conv
        JOIN
          companies c ON conv.company_id = c.id
        WHERE
          conv.created_at >= $1
        GROUP BY
          c.name
        ORDER BY
          count DESC
        LIMIT 5
      `;

      const conversationsByCompanyResult = await pool.query(conversationsByCompanyQuery, [startDateStr]);
      const conversationsByCompany = conversationsByCompanyResult.rows.map(row => ({
        company: row.company,
        count: parseInt(row.count)
      }));

      const last7Days = new Date();
      last7Days.setDate(last7Days.getDate() - 7);

      const activeUsersByDayQuery = `
        SELECT
          DATE_TRUNC('day', sess.expire) AS date,
          COUNT(DISTINCT sess.sid) AS count
        FROM
          session sess
        WHERE
          sess.expire >= $1
        GROUP BY
          DATE_TRUNC('day', sess.expire)
        ORDER BY
          date ASC
      `;

      const activeUsersByDayResult = await pool.query(activeUsersByDayQuery, [last7Days.toISOString()]);
      const activeUsersByDay = activeUsersByDayResult.rows.map(row => ({
        date: row.date.toISOString().split('T')[0],
        count: parseInt(row.count)
      }));

      if (userGrowth.length === 0) {
        userGrowth.push({ date: new Date().toISOString().split('T')[0], count: 0 });
      }

      if (messagesByChannel.length === 0) {
        messagesByChannel.push({ channel: 'No Data', count: 0 });
      }

      if (conversationsByCompany.length === 0) {
        conversationsByCompany.push({ company: 'No Data', count: 0 });
      }

      if (activeUsersByDay.length === 0) {
        activeUsersByDay.push({ date: new Date().toISOString().split('T')[0], count: 0 });
      }

      res.json({
        totalUsers,
        totalCompanies,
        activeCompanies,
        totalConversations,
        totalMessages,
        totalContacts,
        userGrowth,
        messagesByChannel,
        conversationsByCompany,
        activeUsersByDay
      });
    } catch (error) {

      res.status(500).json({ error: "Failed to fetch analytics data" });
    }
  });




  app.get("/api/admin/payment-transactions", ensureSuperAdmin, async (_req, res) => {
    try {
      const transactions = await storage.getAllPaymentTransactions();
      res.json(transactions);
    } catch (error) {

      res.status(500).json({ error: "Failed to fetch payment transactions" });
    }
  });

  app.get("/api/admin/companies/:id/payment-transactions", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const companyId = parseInt(req.params.id);
      const transactions = await storage.getPaymentTransactionsByCompany(companyId);
      res.json(transactions);
    } catch (error) {

      res.status(500).json({ error: "Failed to fetch company payment transactions" });
    }
  });

  app.get("/api/admin/companies/:companyId/data-retention-policy/:platform", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const platform = req.params.platform;
      if (isNaN(companyId) || !platform) {
        return res.status(400).json({ error: "Company ID and platform are required" });
      }
      const policy = await storage.getDataRetentionPolicy(companyId, platform);
      res.json({ policy: policy ?? null });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch data retention policy" });
    }
  });

  app.put("/api/admin/companies/:companyId/data-retention-policy/:platform", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const platform = req.params.platform;
      const raw = req.body;
      if (isNaN(companyId) || !platform) {
        return res.status(400).json({ error: "Company ID and platform are required" });
      }
      if (!raw || typeof raw.enabled !== 'boolean') {
        return res.status(400).json({ error: "Valid policy config (enabled, retentionDays, etc.) is required" });
      }
      const parsedRetention = typeof raw.retentionDays === 'number' && Number.isFinite(raw.retentionDays)
        ? raw.retentionDays
        : parseInt(String(raw.retentionDays), 10);
      if (!Number.isFinite(parsedRetention) || parsedRetention <= 0) {
        return res.status(400).json({ error: "retentionDays must be a finite positive number" });
      }
      const policyConfig = {
        enabled: raw.enabled,
        retentionDays: parsedRetention,
        autoAnonymize: typeof raw.autoAnonymize === 'boolean' ? raw.autoAnonymize : false,
        deleteInactiveConversations: typeof raw.deleteInactiveConversations === 'boolean' ? raw.deleteInactiveConversations : false,
        inactivityThresholdDays: typeof raw.inactivityThresholdDays === 'number' && Number.isFinite(raw.inactivityThresholdDays) && raw.inactivityThresholdDays >= 0
          ? raw.inactivityThresholdDays
          : (parseInt(String(raw.inactivityThresholdDays), 10) >= 0 ? parseInt(String(raw.inactivityThresholdDays), 10) : 0),
        notifyBeforeDeletion: raw.notifyBeforeDeletion === true,
        notificationDays: typeof raw.notificationDays === 'number' && Number.isFinite(raw.notificationDays) && raw.notificationDays >= 0
          ? raw.notificationDays
          : undefined
      };
      await storage.setDataRetentionPolicy(companyId, platform, policyConfig);
      const policy = await storage.getDataRetentionPolicy(companyId, platform);
      res.json({ message: "Data retention policy updated", policy });
    } catch (error) {
      res.status(500).json({ error: "Failed to update data retention policy" });
    }
  });

  app.get("/api/admin/companies/:companyId/deletion-audit-logs", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const companyId = parseInt(req.params.companyId);
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      if (isNaN(companyId)) {
        return res.status(400).json({ error: "Company ID is required" });
      }
      const result = await storage.getCompanyDeletionAuditLogs(companyId, { page, limit });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch deletion audit logs" });
    }
  });

  app.put("/api/admin/payment-transactions/:id", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const transactionId = parseInt(req.params.id);
      const { status } = req.body;

      if (!status || !['pending', 'completed', 'failed', 'refunded'].includes(status)) {
        return res.status(400).json({ error: "Valid status is required" });
      }

      const transaction = await storage.updatePaymentTransaction(transactionId, { status });

      res.json({
        message: "Payment transaction updated successfully",
        transaction
      });
    } catch (error) {

      res.status(500).json({ error: "Failed to update payment transaction" });
    }
  });

  app.get('/api/registration/status', async (_req, res) => {
    try {
      const registrationSettingObj = await storage.getAppSetting('registration_settings');
      const registrationSettings = (registrationSettingObj?.value as any) || { enabled: true, requireApproval: false };

      res.json({
        enabled: registrationSettings.enabled ?? true,
        requireApproval: registrationSettings.requireApproval ?? false
      });
    } catch (error) {

      res.status(500).json({ error: 'Failed to get registration status' });
    }
  });


  app.get("/api/admin/backup/config", ensureSuperAdmin, async (_req, res) => {
    try {
      const config = await storage.getAppSetting('backup_config');
      const defaultConfig = {
        enabled: false,
        schedules: [],
        retention_days: 30,
        storage_locations: ['local'],
        google_drive: {
          enabled: false,
          folder_id: null,
          credentials: null
        },
        encryption: {
          enabled: false,
          key: null
        }
      };

      res.json(config?.value || defaultConfig);
    } catch (error) {

      res.status(500).json({ error: "Failed to fetch backup configuration" });
    }
  });

  app.post("/api/admin/backup/config", ensureSuperAdmin, async (req, res) => {
    try {
      const config = req.body;
      await storage.saveAppSetting('backup_config', config);

      res.json({ message: "Backup configuration saved successfully" });
    } catch (error) {

      res.status(500).json({ error: "Failed to save backup configuration" });
    }
  });

  app.post("/api/admin/backup/create", ensureSuperAdmin, async (req, res) => {
    try {
      const { description, storage_locations } = req.body;


      const { storageProviderRegistry } = await import('./services/storage-providers/storage-provider-registry');
      const locationsToValidate = storage_locations || ['local'];
      const validation = storageProviderRegistry.validateStorageLocations(locationsToValidate);
      if (!validation.valid) {
        return res.status(400).json({
          error: `Invalid storage providers: ${validation.invalidProviders.join(', ')}. Available providers: ${storageProviderRegistry.getProviderNames().join(', ')}`
        });
      }

      const { BackupService } = await import('./services/backup-service');
      const backupService = new BackupService();

      const backup = await backupService.createBackup({
        type: 'manual',
        description: description || 'Manual backup',
        storage_locations: locationsToValidate
      });

      res.json(backup);
    } catch (error) {

      res.status(500).json({ error: "Failed to create backup" });
    }
  });

  app.get("/api/admin/backup/list", ensureSuperAdmin, async (_req, res) => {
    try {
      const { BackupService } = await import('./services/backup-service');
      const backupService = new BackupService();

      const backups = await backupService.listBackups();
      res.json(backups);
    } catch (error) {

      res.status(500).json({ error: "Failed to list backups" });
    }
  });

  app.get("/api/admin/backup/download/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { BackupService } = await import('./services/backup-service');
      const backupService = new BackupService();

      const backup = await backupService.getBackup(id);
      if (!backup) {
        return res.status(404).json({ error: "Backup not found" });
      }

      const filePath = await backupService.getBackupFilePath(backup);
      res.download(filePath, backup.filename);
    } catch (error) {

      res.status(500).json({ error: "Failed to download backup" });
    }
  });

  app.get("/api/admin/backup/restore-preflight/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { BackupService } = await import('./services/backup-service');
      const backupService = new BackupService();

      const result = await backupService.preflightRestoreChecks(id);
      res.json(result);
    } catch (error) {

      res.status(500).json({
        error: "Failed to perform preflight checks",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post("/api/admin/backup/restore/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { confirmationText, dropDatabase } = req.body;
      const { BackupService } = await import('./services/backup-service');
      const backupService = new BackupService();

      const user = (req as any).user;


      if (dropDatabase !== undefined && typeof dropDatabase !== 'boolean') {
        return res.status(400).json({
          error: 'dropDatabase must be a boolean value'
        });
      }

      const result = await backupService.restoreBackup(id, {
        userId: user?.id,
        userEmail: user?.email,
        confirmationText,
        dropDatabase: dropDatabase === true
      });

      if (!res.headersSent) {
        res.json(result);
      }
    } catch (error) {

      const errorMessage = error instanceof Error ? error.message : "Failed to restore backup";
      if (!res.headersSent) {
        res.status(500).json({
          error: errorMessage,
          details: error instanceof Error ? error.stack : String(error)
        });
      }
    }
  });

  app.get("/api/admin/backup/restore/:restoreId/status", ensureSuperAdmin, async (req, res) => {
    try {
      const { restoreId } = req.params;
      const { BackupService } = await import('./services/backup-service');
      const backupService = new BackupService();

      const status = backupService.getRestoreStatus(restoreId);

      if (!status) {
        return res.status(404).json({ error: "Restore status not found" });
      }

      res.json(status);
    } catch (error) {

      res.status(500).json({ error: "Failed to fetch restore status" });
    }
  });

  app.delete("/api/admin/backup/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { BackupService } = await import('./services/backup-service');
      const backupService = new BackupService();

      await backupService.deleteBackup(id);
      res.json({ message: "Backup deleted successfully" });
    } catch (error) {

      res.status(500).json({ error: "Failed to delete backup" });
    }
  });

  app.post("/api/admin/backup/verify/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { BackupService } = await import('./services/backup-service');
      const backupService = new BackupService();

      const result = await backupService.verifyBackup(id);
      res.json(result);
    } catch (error) {

      res.status(500).json({ error: "Failed to verify backup" });
    }
  });

  app.post("/api/admin/backup/verify-deep/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { BackupService } = await import('./services/backup-service');
      const backupService = new BackupService();

      const result = await backupService.verifyDeep(id);
      res.json(result);
    } catch (error) {

      res.status(500).json({
        error: "Failed to perform deep verification",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post("/api/admin/backup/cleanup", ensureSuperAdmin, async (req, res) => {
    try {
      const { BackupService } = await import('./services/backup-service');
      const backupService = new BackupService();


      const config = await storage.getAppSetting('backup_config');
      const retentionDays = (config?.value as any)?.retention_days || 30;

      const result = await backupService.cleanupOldBackups(retentionDays);

      res.json({
        message: `Cleanup completed: ${result.deleted} backups deleted`,
        deleted: result.deleted,
        deletedBackups: result.deletedBackups,
        errors: result.errors,
        retentionDays
      });
    } catch (error) {

      res.status(500).json({
        error: "Failed to perform backup cleanup",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/admin/backup/logs", ensureSuperAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;


      const logs = await db
        .select()
        .from(databaseBackupLogs)
        .orderBy(desc(databaseBackupLogs.timestamp))
        .limit(limit)
        .offset(offset);


      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(databaseBackupLogs);
      const totalCount = Number(countResult[0]?.count || 0);

      res.json({
        logs,
        total: totalCount,
        limit,
        offset
      });
    } catch (error) {

      res.status(500).json({ error: "Failed to fetch backup logs" });
    }
  });


  const backupUploadStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {

      const isDocker = process.env.DOCKER_CONTAINER === 'true';
      const backupPath = isDocker
        ? path.join(process.cwd(), 'volumes', 'backups')
        : path.join(process.cwd(), 'backups');

      if (!fs.existsSync(backupPath)) {
        fs.mkdirSync(backupPath, { recursive: true });
      }
      cb(null, backupPath);
    },
    filename: (_req, file, cb) => {

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const originalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filename = `uploaded-${timestamp}-${originalName}`;
      cb(null, filename);
    }
  });

  const backupUpload = multer({
    storage: backupUploadStorage,
    limits: {
      fileSize: 3000 * 1024 * 1024, // 3000MB limit for backup files
      files: 1
    },
    fileFilter: (_req, file, cb) => {

      const allowedExtensions = ['.sql', '.backup', '.dump', '.bak'];
      const fileExt = path.extname(file.originalname).toLowerCase();

      if (allowedExtensions.includes(fileExt)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only .sql, .backup, .dump, and .bak files are allowed.'));
      }
    }
  });

  app.post("/api/admin/backup/upload", ensureSuperAdmin, backupUpload.single('backup'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No backup file provided" });
      }

      const { description, storage_locations } = req.body;
      const { BackupService } = await import('./services/backup-service');
      const backupService = new BackupService();


      let parsedStorageLocations = ['local'];
      if (storage_locations) {
        try {
          parsedStorageLocations = typeof storage_locations === 'string'
            ? JSON.parse(storage_locations)
            : storage_locations;
        } catch (e) {
          parsedStorageLocations = [storage_locations];
        }
      }

      const result = await backupService.processUploadedBackup({
        filePath: req.file.path,
        originalName: req.file.originalname,
        filename: req.file.filename,
        size: req.file.size,
        description: description || `Uploaded backup: ${req.file.originalname}`,
        storage_locations: parsedStorageLocations
      });

      res.json(result);
    } catch (error) {



      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {

        }
      }

      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to upload backup"
      });
    }
  });

  app.post("/api/admin/backup/validate-url", ensureSuperAdmin, async (req, res) => {
    try {
      const { url } = req.body;

      if (!url || typeof url !== 'string') {
        return res.status(400).json({
          accessible: false,
          error: "URL is required"
        });
      }


      let urlObj: URL;
      try {
        urlObj = new URL(url);
      } catch (e) {
        return res.status(400).json({
          accessible: false,
          error: "Invalid URL format"
        });
      }


      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return res.status(400).json({
          accessible: false,
          error: "Only HTTP and HTTPS protocols are supported"
        });
      }


      const allowedExtensions = ['.sql', '.backup', '.dump', '.bak'];
      const pathname = urlObj.pathname.toLowerCase();
      const hasValidExtension = allowedExtensions.some(ext => pathname.endsWith(ext));

      if (!hasValidExtension) {
        return res.status(400).json({
          accessible: false,
          error: "URL must point to a valid backup file (.sql, .backup, .dump, .bak)"
        });
      }


      try {
        const headResponse = await axios.head(url, {
          timeout: 10000,
          maxRedirects: 5,
          validateStatus: (status) => status < 400
        });

        const contentLength = headResponse.headers['content-length'];
        const contentType = headResponse.headers['content-type'];

        res.json({
          accessible: true,
          contentLength: contentLength ? parseInt(contentLength) : null,
          contentType: contentType || null
        });
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (error.response) {
            return res.status(400).json({
              accessible: false,
              error: `URL returned status ${error.response.status}: ${error.response.statusText}`
            });
          } else if (error.code === 'ECONNREFUSED') {
            return res.status(400).json({
              accessible: false,
              error: "Connection refused - URL is not accessible"
            });
          } else if (error.code === 'ETIMEDOUT') {
            return res.status(400).json({
              accessible: false,
              error: "Request timed out - URL is not accessible"
            });
          }
        }
        return res.status(400).json({
          accessible: false,
          error: "Failed to access URL"
        });
      }
    } catch (error) {

      res.status(500).json({
        accessible: false,
        error: "Failed to validate URL"
      });
    }
  });

  app.post("/api/admin/backup/upload-from-url", ensureSuperAdmin, async (req, res) => {
    let tempFilePath: string | null = null;

    try {
      const { url, description, storage_locations } = req.body;

      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "URL is required" });
      }


      let urlObj: URL;
      try {
        urlObj = new URL(url);
      } catch (e) {
        return res.status(400).json({ error: "Invalid URL format" });
      }


      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return res.status(400).json({ error: "Only HTTP and HTTPS protocols are supported" });
      }


      const allowedExtensions = ['.sql', '.backup', '.dump', '.bak'];
      const pathname = urlObj.pathname.toLowerCase();
      const hasValidExtension = allowedExtensions.some(ext => pathname.endsWith(ext));

      if (!hasValidExtension) {
        return res.status(400).json({ error: "URL must point to a valid backup file (.sql, .backup, .dump, .bak)" });
      }


      const urlFilename = urlObj.pathname.split('/').pop() || 'backup';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizedFilename = urlFilename.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filename = `url-download-${timestamp}-${sanitizedFilename}`;


      const backupPath = path.join(process.cwd(), 'backups');
      if (!fs.existsSync(backupPath)) {
        fs.mkdirSync(backupPath, { recursive: true });
      }

      tempFilePath = path.join(backupPath, filename);


      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 0, // No timeout as per requirements
        maxRedirects: 5,
        maxContentLength: 3000 * 1024 * 1024, // 3000MB limit
        validateStatus: (status) => status < 400
      });


      const contentLength = response.headers['content-length'];
      if (contentLength && parseInt(contentLength) > 3000 * 1024 * 1024) {
        return res.status(400).json({ error: "File size exceeds 3000MB limit" });
      }


      const writer = fs.createWriteStream(tempFilePath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });


      const stats = fs.statSync(tempFilePath);


      const { BackupService } = await import('./services/backup-service');
      const backupService = new BackupService();

      let parsedStorageLocations = ['local'];
      if (storage_locations) {
        try {
          parsedStorageLocations = Array.isArray(storage_locations)
            ? storage_locations
            : [storage_locations];
        } catch (e) {
          parsedStorageLocations = ['local'];
        }
      }

      const result = await backupService.processUploadedBackup({
        filePath: tempFilePath,
        originalName: urlFilename,
        filename: filename,
        size: stats.size,
        description: description || `Uploaded backup from URL: ${urlFilename}`,
        storage_locations: parsedStorageLocations
      });

      res.json(result);
    } catch (error) {



      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch (cleanupError) {

        }
      }

      if (axios.isAxiosError(error)) {
        if (error.response) {
          return res.status(400).json({
            error: `Failed to download from URL: ${error.response.status} ${error.response.statusText}`
          });
        } else if (error.code === 'ECONNREFUSED') {
          return res.status(400).json({
            error: "Connection refused - URL is not accessible"
          });
        } else if (error.code === 'ETIMEDOUT') {
          return res.status(400).json({
            error: "Request timed out - URL is not accessible"
          });
        } else if (error.code === 'ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED') {
          return res.status(400).json({
            error: "File size exceeds 3000MB limit"
          });
        }
      }

      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to upload backup from URL"
      });
    }
  });

  app.get("/api/admin/backup/google-drive/auth-url", ensureSuperAdmin, async (_req, res) => {
    try {
      const { GoogleDriveService } = await import('./services/google-drive-service');
      const googleDriveService = new GoogleDriveService();

      const authUrl = await googleDriveService.getAuthUrl();
      res.json({ authUrl });
    } catch (error) {

      res.status(500).json({ error: "Failed to get Google Drive auth URL" });
    }
  });

  app.post("/api/admin/backup/google-drive/callback", ensureSuperAdmin, async (req, res) => {
    try {
      const { code } = req.body;
      const { GoogleDriveService } = await import('./services/google-drive-service');
      const googleDriveService = new GoogleDriveService();

      const tokens = await googleDriveService.exchangeCodeForTokens(code);

      const config = await storage.getAppSetting('backup_config');
      const updatedConfig = {
        ...(config?.value as any) || {},
        google_drive: {
          ...((config?.value as any)?.google_drive) || {},
          enabled: true,
          credentials: tokens
        }
      };

      await storage.saveAppSetting('backup_config', updatedConfig);

      res.json({ message: "Google Drive connected successfully" });
    } catch (error) {

      res.status(500).json({ error: "Failed to connect Google Drive" });
    }
  });

  app.post("/api/admin/backup/google-drive/test", ensureSuperAdmin, async (_req, res) => {
    try {
      const { GoogleDriveService } = await import('./services/google-drive-service');
      const googleDriveService = new GoogleDriveService();

      const result = await googleDriveService.testConnection();
      res.json(result);
    } catch (error) {

      res.status(500).json({ error: "Failed to test Google Drive connection" });
    }
  });

  app.get("/api/admin/backup/google-drive/oauth-config", ensureSuperAdmin, async (_req, res) => {
    try {
      const { GoogleDriveService } = await import('./services/google-drive-service');
      const googleDriveService = new GoogleDriveService();

      const config = await googleDriveService.getOAuthConfig();
      res.json(config);
    } catch (error) {

      res.status(500).json({ error: "Failed to get OAuth configuration" });
    }
  });

  app.post("/api/admin/backup/google-drive/oauth-config", ensureSuperAdmin, async (req, res) => {
    try {
      const { client_id, client_secret, redirect_uri } = req.body;

      if (!client_id || !client_secret) {
        return res.status(400).json({ error: "Client ID and Client Secret are required" });
      }

      const { GoogleDriveService } = await import('./services/google-drive-service');
      const googleDriveService = new GoogleDriveService();

      const result = await googleDriveService.saveOAuthConfig({
        client_id,
        client_secret,
        redirect_uri
      });

      res.json(result);
    } catch (error) {

      res.status(500).json({ error: "Failed to save OAuth configuration" });
    }
  });

  app.delete("/api/admin/backup/google-drive/oauth-config", ensureSuperAdmin, async (_req, res) => {
    try {
      const { GoogleDriveService } = await import('./services/google-drive-service');
      const googleDriveService = new GoogleDriveService();

      const result = await googleDriveService.clearOAuthConfig();
      res.json(result);
    } catch (error) {

      res.status(500).json({ error: "Failed to clear OAuth configuration" });
    }
  });

  app.post("/api/admin/backup/google-drive/oauth-validate", ensureSuperAdmin, async (req, res) => {
    try {
      const { GoogleDriveService } = await import('./services/google-drive-service');
      const googleDriveService = new GoogleDriveService();

      const result = await googleDriveService.validateOAuthConfig();
      res.json(result);
    } catch (error) {

      res.status(500).json({ error: "Failed to validate OAuth configuration" });
    }
  });

  app.get("/api/admin/backup/stats", ensureSuperAdmin, async (req, res) => {
    try {
      const { BackupService } = await import('./services/backup-service');
      const backupService = new BackupService();

      const stats = await backupService.getBackupStats();
      res.json(stats);
    } catch (error) {

      res.status(500).json({ error: "Failed to get backup statistics" });
    }
  });

  app.get("/api/admin/backup/tools", ensureSuperAdmin, async (_req, res) => {
    try {
      const { BackupService } = await import('./services/backup-service');
      const backupService = new BackupService();

      const tools = await backupService.checkPostgresTools();
      res.json(tools);
    } catch (error) {

      res.status(500).json({ error: "Failed to check PostgreSQL tools" });
    }
  });




  app.get('/api/admin/partner-configurations/:provider', ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const { provider } = req.params;
      const config = await storage.getPartnerConfiguration(provider);

      if (!config) {
        return res.status(404).json({ error: 'Partner configuration not found' });
      }

      res.json(config);
    } catch (error) {

      res.status(500).json({ error: 'Failed to get partner configuration' });
    }
  });


  app.post('/api/admin/partner-configurations', ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const configData = req.body;
      

      if (configData.provider === 'meta') {

        if (!configData.partnerApiKey) {
          return res.status(400).json({ error: 'App ID (partnerApiKey) is required for Meta provider' });
        }
        

        if (!configData.webhookVerifyToken) {

          configData.webhookVerifyToken = generateWebhookVerifyToken(32);
          
        } else {

          const tokenValidation = validateWebhookToken(configData.webhookVerifyToken);
          if (!tokenValidation.isValid) {
            configData.webhookVerifyToken = generateWebhookVerifyToken(32);
          }
        }
      }
      

      const allConfigs = await storage.getAllPartnerConfigurations();
      const existingConfig = allConfigs.find(c => c.provider === configData.provider);
      
      if (existingConfig) {

        const config = await storage.updatePartnerConfiguration(existingConfig.id, configData);
        return res.status(200).json(config);
      }
      

      const config = await storage.createPartnerConfiguration(configData);
      res.status(201).json(config);
    } catch (error) {
      console.error('Error creating/updating partner configuration:', error);

      res.status(500).json({ error: 'Failed to create partner configuration' });
    }
  });


  app.put('/api/admin/partner-configurations/:id', ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const configData = req.body;
      

      const allConfigs = await storage.getAllPartnerConfigurations();
      const existingConfig = allConfigs.find(c => c.id === parseInt(id));
      

      if (existingConfig?.provider === 'meta' || configData.provider === 'meta') {

        if (!configData.webhookVerifyToken && !existingConfig?.webhookVerifyToken) {

          configData.webhookVerifyToken = generateWebhookVerifyToken(32);
          
        } else if (configData.webhookVerifyToken) {

          const tokenValidation = validateWebhookToken(configData.webhookVerifyToken);
          if (!tokenValidation.isValid) {
            configData.webhookVerifyToken = generateWebhookVerifyToken(32);
          }
        }
      }
      
      const config = await storage.updatePartnerConfiguration(parseInt(id), configData);
      res.json(config);
    } catch (error) {

      res.status(500).json({ error: 'Failed to update partner configuration' });
    }
  });


  app.post('/api/admin/partner-configurations/validate', ensureSuperAdmin, async (req: Request, res: Response) => {
    const { provider, partnerApiKey, partnerId, appId, appSecret, businessManagerId, accessToken } = req.body;

    try {
      if (provider === 'meta') {

        if (!appId || !appSecret || !businessManagerId) {
          return res.status(400).json({ valid: false, error: 'App ID, App Secret, and Business Manager ID are required' });
        }

        const validationResults: any = {
          credentials: { valid: false, error: null },
          webhook: { reachable: false, error: null }
        };


        try {
          const testUrl = `https://graph.facebook.com/v24.0/${businessManagerId}`;
          const response = await axios.get(testUrl, {
            params: {
              access_token: accessToken || `${appId}|${appSecret}`,
              fields: 'id,name'
            },
            timeout: 10000
          });

          if (response.status === 200 && response.data.id === businessManagerId) {
            validationResults.credentials.valid = true;
          } else {
            validationResults.credentials.error = 'Business Manager ID mismatch';
          }
        } catch (error: any) {
          validationResults.credentials.error = error.response?.data?.error?.message || 'Invalid credentials';
        }


        const { webhookUrl, webhookVerifyToken } = req.body;
        if (webhookUrl) {
          try {
            const webhookTest = await testWebhookDelivery(webhookUrl, webhookVerifyToken || '');
            validationResults.webhook.reachable = webhookTest.success;
            if (!webhookTest.success) {
              validationResults.webhook.error = webhookTest.message;
            }
          } catch (error: any) {
            validationResults.webhook.error = error.message || 'Webhook test failed';
          }
        } else {
          validationResults.webhook.error = 'Webhook URL not provided';
        }

        const allValid = validationResults.credentials.valid && validationResults.webhook.reachable;
        
        if (allValid) {
          res.json({ 
            valid: true, 
            message: 'Meta Partner API credentials and webhook are valid',
            details: validationResults
          });
        } else {
          res.status(400).json({ 
            valid: false, 
            error: 'Validation failed',
            details: validationResults
          });
        }
      } else if (provider === 'tiktok') {

        const { clientKey, clientSecret } = req.body;

        if (!clientKey || !clientSecret) {
          return res.status(400).json({
            valid: false,
            error: 'Client Key and Client Secret are required'
          });
        }

     




        try {


          if (clientKey.length < 10 || clientSecret.length < 10) {
            return res.status(400).json({
              valid: false,
              error: 'Client Key and Client Secret appear to be invalid (too short)'
            });
          }



          res.json({
            valid: true,
            message: 'TikTok credentials format is valid. Full validation will occur during OAuth flow.',
            warning: 'TikTok Business Messaging API requires partner access. Ensure you have been approved as a TikTok Messaging Partner.'
          });
        } catch (validationError: any) {

          res.status(400).json({
            valid: false,
            error: 'Failed to validate TikTok credentials',
            details: validationError.message
          });
        }
      } else {
        res.status(400).json({ valid: false, error: 'Unsupported provider' });
      }
    } catch (error: any) {

      res.status(400).json({
        valid: false,
        error: error.response?.data?.message || 'Failed to validate partner credentials'
      });
    }
  });


  app.get('/api/admin/partner-configurations', ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const configs = await storage.getAllPartnerConfigurations();
      

      const configsWithStats = await Promise.all(configs.map(async (config) => {
        let usageCount = 0;
        
        if (config.provider === 'meta') {

          try {
            const result = await pool.query(
              'SELECT COUNT(DISTINCT company_id) as count FROM meta_whatsapp_clients'
            );
            usageCount = parseInt(result.rows[0]?.count || '0', 10);
          } catch (error) {

          }
        }
        
        return {
          ...config,
          usageCount,
          lastUsedAt: config.lastUsedAt || null
        };
      }));
      
      res.json(configsWithStats);
    } catch (error) {

      res.status(500).json({ error: 'Failed to get partner configurations' });
    }
  });


  app.delete('/api/admin/partner-configurations/:id', ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await storage.deletePartnerConfiguration(parseInt(id));
      res.status(204).send();
    } catch (error) {

      res.status(500).json({ error: 'Failed to delete partner configuration' });
    }
  });


  app.post('/api/admin/partner-configurations/test-webhook', ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const { webhookUrl, webhookVerifyToken } = req.body;

      if (!webhookUrl) {
        return res.status(400).json({ error: 'Webhook URL is required' });
      }

      const result = await testWebhookDelivery(webhookUrl, webhookVerifyToken || '');

      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(400).json({ success: false, error: result.message, details: result.error });
      }
    } catch (error: any) {

      res.status(500).json({ error: 'Failed to test webhook', details: error.message });
    }
  });


  app.get('/api/admin/partner-configurations/:provider/health', ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const { provider } = req.params;
      const config = await storage.getPartnerConfiguration(provider);

      if (!config) {
        return res.status(404).json({ error: 'Configuration not found' });
      }

      const healthResult = await checkConfigurationHealth(config.id);


      const configMetadata: any = {};
      if (config.apiVersion) {
        configMetadata.apiVersion = config.apiVersion;
      }
      

      let webhookFieldSubscriptions: { [field: string]: { subscribed: boolean } } = {
        messages: { subscribed: false },
        message_template_status_update: { subscribed: false }
      };

      if (config.partnerApiKey && config.partnerSecret) {
        try {
          
          const subscriptionsResult = await getAppWebhookFieldSubscriptions(
            config.partnerApiKey,
            config.partnerSecret,
            config.accessToken ?? undefined
          );

          if (subscriptionsResult.success) {
            webhookFieldSubscriptions = subscriptionsResult.fields;
            
            

            await storage.updatePartnerConfiguration(config.id, {
              webhookFieldSubscriptions: webhookFieldSubscriptions
            });
          } else {


            if (config.webhookFieldSubscriptions) {
              if (typeof config.webhookFieldSubscriptions === 'string') {
                try {
                  const parsed = JSON.parse(config.webhookFieldSubscriptions);
                  webhookFieldSubscriptions = parsed;
                } catch (e) {

                }
              } else if (typeof config.webhookFieldSubscriptions === 'object') {
                webhookFieldSubscriptions = config.webhookFieldSubscriptions as any;
              }
            }
          }
        } catch (error: any) {


          if (config.webhookFieldSubscriptions) {
            if (typeof config.webhookFieldSubscriptions === 'string') {
              try {
                const parsed = JSON.parse(config.webhookFieldSubscriptions);
                webhookFieldSubscriptions = parsed;
              } catch (e) {

              }
            } else if (typeof config.webhookFieldSubscriptions === 'object') {
              webhookFieldSubscriptions = config.webhookFieldSubscriptions as any;
            }
          }
        }
      } else {

        if (config.webhookFieldSubscriptions) {
          if (typeof config.webhookFieldSubscriptions === 'string') {
            try {
              webhookFieldSubscriptions = JSON.parse(config.webhookFieldSubscriptions);
            } catch (e) {

            }
          } else if (typeof config.webhookFieldSubscriptions === 'object') {
            webhookFieldSubscriptions = config.webhookFieldSubscriptions as any;
          }
        }
      }


      const expectedFields = ['messages', 'message_template_status_update'];
      const formattedSubscriptions: any = {};
      for (const field of expectedFields) {
        if (webhookFieldSubscriptions[field]) {
          formattedSubscriptions[field] = typeof webhookFieldSubscriptions[field] === 'object' 
            ? webhookFieldSubscriptions[field]
            : { subscribed: !!webhookFieldSubscriptions[field] };
        } else {
          formattedSubscriptions[field] = { subscribed: false };
        }
      }
      configMetadata.webhookFieldSubscriptions = formattedSubscriptions;

      res.json({
        configId: config.id,
        provider: config.provider,
        health: healthResult,
        lastValidatedAt: config.lastValidatedAt,
        usageCount: config.usageCount || 0,
        lastUsedAt: config.lastUsedAt,
        config: configMetadata
      });
    } catch (error: any) {

      res.status(500).json({ error: 'Failed to check configuration health', details: error.message });
    }
  });


  app.get('/api/admin/partner-configurations/tiktok', ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const config = await storage.getPartnerConfiguration('tiktok');

      if (!config) {
        return res.status(404).json({ error: 'TikTok partner configuration not found' });
      }

      res.json(config);
    } catch (error) {

      res.status(500).json({ error: 'Failed to get TikTok partner configuration' });
    }
  });

  app.post('/api/admin/partner-configurations/tiktok', ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const configData = {
        ...req.body,
        provider: 'tiktok'
      };


      if (!configData.webhookVerifyToken) {
        configData.webhookVerifyToken = randomBytes(32).toString('hex');
      }

      const existingConfig = await storage.getPartnerConfiguration('tiktok');
      if (existingConfig) {
        return res.status(400).json({
          error: 'TikTok partner configuration already exists. Use PUT to update.'
        });
      }

      const config = await storage.createPartnerConfiguration(configData);
      res.status(201).json(config);
    } catch (error) {

      res.status(500).json({ error: 'Failed to create TikTok partner configuration' });
    }
  });

  app.put('/api/admin/partner-configurations/tiktok', ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const existingConfig = await storage.getPartnerConfiguration('tiktok');

      if (!existingConfig) {
        return res.status(404).json({ error: 'TikTok partner configuration not found' });
      }

      const configData = {
        ...req.body,
        provider: 'tiktok'
      };


      if (!configData.webhookVerifyToken && !existingConfig.webhookVerifyToken) {
        configData.webhookVerifyToken = randomBytes(32).toString('hex');
      }

      const config = await storage.updatePartnerConfiguration(existingConfig.id, configData);
      res.json(config);
    } catch (error) {

      res.status(500).json({ error: 'Failed to update TikTok partner configuration' });
    }
  });

  app.delete('/api/admin/partner-configurations/tiktok', ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const existingConfig = await storage.getPartnerConfiguration('tiktok');

      if (!existingConfig) {
        return res.status(404).json({ error: 'TikTok partner configuration not found' });
      }

      await storage.deletePartnerConfiguration(existingConfig.id);
      res.status(204).send();
    } catch (error) {

      res.status(500).json({ error: 'Failed to delete TikTok partner configuration' });
    }
  });

  app.post('/api/admin/partner-configurations/tiktok/validate', ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const { clientKey, clientSecret } = req.body;

      if (!clientKey || !clientSecret) {
        return res.status(400).json({
          valid: false,
          error: 'Client Key and Client Secret are required'
        });
      }

   

      if (clientKey.length < 10 || clientSecret.length < 10) {
        return res.status(400).json({
          valid: false,
          error: 'Client Key and Client Secret appear to be invalid (too short)'
        });
      }



      res.json({
        valid: true,
        message: 'TikTok credentials format is valid. Full validation will occur during OAuth flow.',
        warning: 'TikTok Business Messaging API requires partner access. Ensure you have been approved as a TikTok Messaging Partner.'
      });
    } catch (error) {

      res.status(500).json({
        valid: false,
        error: 'Failed to validate TikTok credentials'
      });
    }
  });


  app.get("/api/admin/websites", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const websites = await storage.getAllWebsites();
      res.json(websites);
    } catch (error) {

      res.status(500).json({ error: "Failed to fetch websites" });
    }
  });

  app.get("/api/admin/websites/:id", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const websiteId = parseInt(req.params.id);
      const website = await storage.getWebsite(websiteId);

      if (!website) {
        return res.status(404).json({ error: "Website not found" });
      }

      res.json(website);
    } catch (error) {

      res.status(500).json({ error: "Failed to fetch website" });
    }
  });

  app.post("/api/admin/websites", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const {
        title,
        slug,
        description,
        metaTitle,
        metaDescription,
        metaKeywords,
        grapesData,
        grapesHtml,
        grapesCss,
        grapesJs,
        favicon,
        customCss,
        customJs,
        customHead,
        status,
        googleAnalyticsId,
        facebookPixelId,
        theme
      } = req.body;

      if (!title || !slug) {
        return res.status(400).json({ error: "Title and slug are required" });
      }


      const existingWebsite = await storage.getWebsiteBySlug(slug);
      if (existingWebsite) {
        return res.status(400).json({ error: "A website with this slug already exists" });
      }

      const user = req.user as any;
      const newWebsite = await storage.createWebsite({
        title,
        slug,
        description,
        metaTitle,
        metaDescription,
        metaKeywords,
        grapesData: grapesData || {},
        grapesHtml,
        grapesCss,
        grapesJs,
        favicon,
        customCss,
        customJs,
        customHead,
        status: status || 'draft',
        googleAnalyticsId,
        facebookPixelId,
        theme: theme || 'default',
        createdById: user.id
      });

      res.status(201).json(newWebsite);
    } catch (error) {

      res.status(500).json({ error: "Failed to create website" });
    }
  });

  app.put("/api/admin/websites/:id", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const websiteId = parseInt(req.params.id);
      const {
        title,
        slug,
        description,
        metaTitle,
        metaDescription,
        metaKeywords,
        grapesData,
        grapesHtml,
        grapesCss,
        grapesJs,
        favicon,
        customCss,
        customJs,
        customHead,
        status,
        googleAnalyticsId,
        facebookPixelId,
        theme
      } = req.body;

      const existingWebsite = await storage.getWebsite(websiteId);
      if (!existingWebsite) {
        return res.status(404).json({ error: "Website not found" });
      }


      if (slug && slug !== existingWebsite.slug) {
        const conflictingWebsite = await storage.getWebsiteBySlug(slug);
        if (conflictingWebsite && conflictingWebsite.id !== websiteId) {
          return res.status(400).json({ error: "A website with this slug already exists" });
        }
      }

      const updatedWebsite = await storage.updateWebsite(websiteId, {
        title,
        slug,
        description,
        metaTitle,
        metaDescription,
        metaKeywords,
        grapesData,
        grapesHtml,
        grapesCss,
        grapesJs,
        favicon,
        customCss,
        customJs,
        customHead,
        status,
        googleAnalyticsId,
        facebookPixelId,
        theme
      });

      res.json(updatedWebsite);
    } catch (error) {

      res.status(500).json({ error: "Failed to update website" });
    }
  });

  app.delete("/api/admin/websites/:id", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const websiteId = parseInt(req.params.id);
      const success = await storage.deleteWebsite(websiteId);

      if (!success) {
        return res.status(404).json({ error: "Website not found" });
      }

      res.json({ message: "Website deleted successfully" });
    } catch (error) {

      res.status(500).json({ error: "Failed to delete website" });
    }
  });

  app.post("/api/admin/websites/:id/publish", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const websiteId = parseInt(req.params.id);
      const publishedWebsite = await storage.publishWebsite(websiteId);
      res.json(publishedWebsite);
    } catch (error) {

      res.status(500).json({ error: "Failed to publish website" });
    }
  });

  app.post("/api/admin/websites/:id/unpublish", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const websiteId = parseInt(req.params.id);
      const unpublishedWebsite = await storage.unpublishWebsite(websiteId);
      res.json(unpublishedWebsite);
    } catch (error) {

      res.status(500).json({ error: "Failed to unpublish website" });
    }
  });



  registerAffiliateRoutes(app);


  app.use('/api/admin/ai-credentials', adminAiCredentialsRoutes);


  app.get("/api/admin/companies/:id/data-preview", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const companyId = parseInt(req.params.id);

      if (isNaN(companyId)) {
        return res.status(400).json({ error: "Invalid company ID" });
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }


      const [
        contactsData,
        conversationsCount,
        messagesCount,
        channelConnectionsData,
        usersData,
        templatesData,
        campaignsData
      ] = await Promise.all([
        storage.getContacts({ companyId }),
        storage.getConversationsCountByCompany(companyId),
        storage.getMessagesCountByCompany(companyId),
        storage.getChannelConnectionsByCompany(companyId),
        storage.getUsersByCompany(companyId),
        storage.getFollowUpTemplatesByCompany(companyId),
        Promise.resolve([]) // Campaigns - placeholder for now
      ]);

      const contactsCount = contactsData.total;
      const channelConnectionsCount = channelConnectionsData.length;
      const usersCount = usersData.length;
      const templatesCount = templatesData.length;
      const campaignsCount = campaignsData.length;

      const dataCategories = [
        {
          id: 'media',
          name: 'Media Files',
          description: 'Images, documents, videos, and other uploaded files',
          icon: 'Files',
          count: 0, // TODO: Implement media count
          estimatedSize: '0 MB',
          color: 'text-blue-600',
          canClear: true,
          warning: 'This will permanently delete all uploaded media files'
        },
        {
          id: 'contacts',
          name: 'Contacts & Lists',
          description: 'Contact information, contact lists, and contact groups',
          icon: 'Users',
          count: contactsCount,
          color: 'text-green-600',
          canClear: true,
          warning: 'This will remove all contact information and lists'
        },
        {
          id: 'conversations',
          name: 'Conversation History',
          description: 'All conversation threads and message history',
          icon: 'MessageSquare',
          count: conversationsCount,
          color: 'text-purple-600',
          canClear: true,
          warning: 'This will permanently delete all conversation history'
        },
        {
          id: 'messages',
          name: 'Individual Messages',
          description: 'All individual messages within conversations',
          icon: 'Mail',
          count: messagesCount,
          color: 'text-indigo-600',
          canClear: true,
          warning: 'This will delete all message content and attachments'
        },
        {
          id: 'templates',
          name: 'Message Templates',
          description: 'Saved message templates and quick replies',
          icon: 'Settings',
          count: templatesCount,
          color: 'text-orange-600',
          canClear: true
        },
        {
          id: 'campaigns',
          name: 'Marketing Campaigns',
          description: 'Campaign data, broadcast messages, and campaign analytics',
          icon: 'BarChart3',
          count: campaignsCount,
          color: 'text-pink-600',
          canClear: true,
          warning: 'This will remove all campaign history and analytics'
        },
        {
          id: 'analytics',
          name: 'Analytics Data',
          description: 'Performance metrics, reports, and statistical data',
          icon: 'BarChart3',
          count: 0, // TODO: Implement analytics count
          color: 'text-cyan-600',
          canClear: true,
          warning: 'This will clear all historical analytics and reports'
        },
        {
          id: 'channel_connections',
          name: 'Channel Connections',
          description: 'WhatsApp, SMS, and other messaging channel configurations',
          icon: 'Settings',
          count: channelConnectionsCount,
          color: 'text-red-600',
          canClear: false,
          warning: 'Channel connections cannot be cleared - they must be manually disconnected'
        },
        {
          id: 'users',
          name: 'User Accounts',
          description: 'Company user accounts and permissions',
          icon: 'Users',
          count: usersCount,
          color: 'text-gray-600',
          canClear: false,
          warning: 'User accounts cannot be cleared through this interface'
        }
      ];

      const warnings = [
        'Data clearing is permanent and cannot be undone',
        'Users and channel connections will remain active',
        'Company settings and configuration will be preserved',
        'Billing and subscription information will not be affected'
      ];

      const totalEstimatedSize = '0 MB'; // TODO: Calculate total data size

      res.json({
        companyId,
        companyName: company.name,
        dataCategories,
        warnings,
        totalEstimatedSize
      });
    } catch (error) {

      res.status(500).json({ error: "Failed to fetch company data preview" });
    }
  });

  app.post("/api/admin/companies/:id/clear-data", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const companyId = parseInt(req.params.id);
      const { categories, confirmationName } = req.body;

      if (isNaN(companyId)) {
        return res.status(400).json({ error: "Invalid company ID" });
      }

      if (!categories || !Array.isArray(categories) || categories.length === 0) {
        return res.status(400).json({ error: "At least one data category must be selected" });
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      if (confirmationName !== company.name) {
        return res.status(400).json({ error: "Company name confirmation does not match" });
      }

      if (company.slug === 'system') {
        return res.status(400).json({ error: "Cannot clear data for the system company" });
      }

      let clearedItems = 0;
      const results: string[] = [];


      for (const category of categories) {
        try {
          switch (category) {
            case 'contacts':
              const contactsResult = await storage.clearCompanyContacts(companyId);
              clearedItems += contactsResult.deletedCount;
              results.push(`Cleared ${contactsResult.deletedCount} contacts`);
              break;

            case 'conversations':
              const conversationsResult = await storage.clearCompanyConversations(companyId);
              clearedItems += conversationsResult.deletedCount;
              results.push(`Cleared ${conversationsResult.deletedCount} conversations`);
              break;

            case 'messages':
              const messagesResult = await storage.clearCompanyMessages(companyId);
              clearedItems += messagesResult.deletedCount;
              results.push(`Cleared ${messagesResult.deletedCount} messages`);
              break;

            case 'templates':
              const templatesResult = await storage.clearCompanyTemplates(companyId);
              clearedItems += templatesResult.deletedCount;
              results.push(`Cleared ${templatesResult.deletedCount} templates`);
              break;

            case 'campaigns':
              const campaignsResult = await storage.clearCompanyCampaigns(companyId);
              clearedItems += campaignsResult.deletedCount;
              results.push(`Cleared ${campaignsResult.deletedCount} campaigns`);
              break;

            case 'media':
              const mediaResult = await storage.clearCompanyMedia(companyId);
              clearedItems += mediaResult.deletedCount;
              results.push(`Cleared ${mediaResult.deletedCount} media files`);
              break;

            case 'analytics':
              const analyticsResult = await storage.clearCompanyAnalytics(companyId);
              clearedItems += analyticsResult.deletedCount;
              results.push(`Cleared ${analyticsResult.deletedCount} analytics records`);
              break;

            default:

          }
        } catch (categoryError) {

          results.push(`Failed to clear ${category}: ${categoryError instanceof Error ? categoryError.message : 'Unknown error'}`);
        }
      }

      res.json({
        message: `Successfully cleared data for ${company.name}. ${clearedItems} total items cleared.`,
        details: results,
        clearedCategories: categories,
        totalItemsCleared: clearedItems
      });
    } catch (error) {

      res.status(500).json({ error: "Failed to clear company data" });
    }
  });
}

export { registerAdminRoutes };
