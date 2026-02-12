import pg from 'pg';
const { Pool } = pg;

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
        const targetUsername = 'superadmin';
        // scrypt hash for 'admin123' generated previously
        const passwordHash = '8172229941d7167cc321880bccf1349e4c7c076891c3ad1d11009ff05a90be83b93971cf7883cf3333ad7f8c0d75adb2cc8ba33034d98bbe863637c530f0d951.1c4961529d604fd3cc01e7ae68b1a30d';

        // 3. Clear email conflicts (users who have the email but are not the superadmin)
        // We update them to a dummy email so we can release the 'admin@bot.com' address
        await client.query(`
        UPDATE users 
        SET email = 'conflict_' || id || '@bot.com'
        WHERE email = $1 AND username != $2
    `, [targetEmail, targetUsername]);

        // 4. UPSERT Super Admin (Insert or Update if exists)
        // This avoids Foreign Key violations because we don't delete the user, we just update it.
        console.log('✨ Creating/Updating super admin user...');

        // Check if user exists to decide on log message, but use UPSERT for atomicity
        const paramValues = [
            targetUsername,
            passwordHash,
            'Super Administrator',
            targetEmail,
            'super_admin',
            companyId,
            true,
            true,
            'es'
        ];

        const upsertQuery = `
        INSERT INTO users (username, password, full_name, email, role, company_id, is_super_admin, active, language_preference, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        ON CONFLICT (username) DO UPDATE SET
            password = EXCLUDED.password,
            email = EXCLUDED.email,
            is_super_admin = true,
            role = 'super_admin',
            active = true,
            updated_at = NOW()
        RETURNING id, email, username;
    `;

        const userRes = await client.query(upsertQuery, paramValues);

        console.log('✅ SUPER ADMIN SECURED SUCCESSFULLY:');
        console.log(userRes.rows[0]);

    } catch (err) {
        console.error('❌ Error executing script:', err);
        // Don't exit with error, just log it so container doesn't crash loop
    } finally {
        client.release();
        pool.end();
    }
}

run();
