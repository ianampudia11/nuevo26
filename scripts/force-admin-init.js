
const { Pool } = require('pg');

// Configuration immediately from user's env vars
const connectionString = process.env.DATABASE_URL || 'postgres://postgres:74b13560576f93fe7d42@aplicar_postgres:5432/aplicar?sslmode=disable';

console.log('🔌 Connecting to:', connectionString.replace(/:[^:@]*@/, ':****@'));

const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=disable') ? false : { rejectUnauthorized: false }
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('✅ Connected to database');

        // 1. Check Companies
        console.log('🏢 Checking companies...');
        let companyReq = await client.query("SELECT id FROM companies WHERE slug = 'compania1'");
        let companyId;

        if (companyReq.rows.length === 0) {
            console.log('⚠️ Company not found. Creating Compania1...');
            const companyRes = await client.query(`
            INSERT INTO companies (name, slug, active, plan, max_users, primary_color, subscription_status, subscription_start_date)
            VALUES ('Compania1', 'compania1', true, 'free', 50, '#363636', 'active', NOW())
            RETURNING id
        `);
            companyId = companyRes.rows[0].id;
            console.log('✅ Company created with ID:', companyId);
        } else {
            companyId = companyReq.rows[0].id;
            console.log('✅ Company found with ID:', companyId);
        }

        // 2. Force Create/Update Super Admin
        console.log('👤 Checking super admin...');
        const targetEmail = 'admin@bot.com';
        // scrypt hash for 'admin123' generated previously
        const passwordHash = '8172229941d7167cc321880bccf1349e4c7c076891c3ad1d11009ff05a90be83b93971cf7883cf3333ad7f8c0d75adb2cc8ba33034d98bbe863637c530f0d951.1c4961529d604fd3cc01e7ae68b1a30d';

        // Delete potential conflicts first to be absolutely sure
        await client.query("DELETE FROM users WHERE username = 'superadmin'");
        await client.query("DELETE FROM users WHERE email = $1", [targetEmail]);

        // Insert
        console.log('✨ Creating super admin user...');
        const userRes = await client.query(`
        INSERT INTO users 
        (username, password, full_name, email, role, company_id, is_super_admin, active, language_preference, created_at, updated_at)
        VALUES 
        ('superadmin', $1, 'Super Administrator', $2, 'super_admin', $3, true, true, 'es', NOW(), NOW())
        RETURNING id, email, username;
    `, [passwordHash, targetEmail, companyId]);

        console.log('✅ SUPER ADMIN CREATED SUCCESSFULLY:');
        console.log(userRes.rows[0]);

    } catch (err) {
        console.error('❌ Error executing script:', err);
    } finally {
        client.release();
        pool.end();
    }
}

run();
