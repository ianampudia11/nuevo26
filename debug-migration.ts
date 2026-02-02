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
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('DATABASE_URL:', process.env.DATABASE_URL);
}

(async () => {
    try {
        const { migrationSystem } = await import('./server/migration-system');
        const { pool } = await import('./server/db');

        console.log('Starting migrations...');
        await migrationSystem.runPendingMigrations();
        console.log('Migrations completed successfully');

        await pool.end();
    } catch (error) {
        console.error('Migration failed:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : '';
        fs.writeFileSync('migration-error.log', JSON.stringify(error, null, 2) + '\n' + errorMessage + '\n' + errorStack);
        process.exit(1);
    }
})();
