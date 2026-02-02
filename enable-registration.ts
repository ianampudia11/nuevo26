import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = path.resolve(process.cwd(), '.env');
console.log('Loading .env from:', envPath);
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.error('Error loading .env:', result.error);
} else {
    console.log('.env loaded successfully');
}

(async () => {
    try {
        const { storage } = await import('./server/storage');
        const { pool } = await import('./server/db');

        console.log('Enabling registration...');
        await storage.saveAppSetting('registration_settings', { enabled: true, requireApproval: false });
        console.log('Registration enabled successfully');

        await pool.end();
        process.exit(0);
    } catch (error) {
        console.error('Failed to enable registration:', error);
        process.exit(1);
    }
})();
