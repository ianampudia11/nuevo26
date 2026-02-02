import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

(async () => {
    try {
        const { storage } = await import('./server/storage');
        const { pool } = await import('./server/db');

        console.log('Checking registration settings...');
        const setting = await storage.getAppSetting('registration_settings');
        console.log('Current setting in DB:', JSON.stringify(setting, null, 2));

        if (setting && setting.value) {
            console.log('Parsed value:', setting.value);
        } else {
            console.log('Setting not found or empty.');
        }

        await pool.end();
        process.exit(0);
    } catch (error) {
        console.error('Failed to check registration:', error);
        process.exit(1);
    }
})();
