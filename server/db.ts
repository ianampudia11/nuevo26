import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "../shared/schema";
import { secureEnv } from "./utils/secure-env";


if (!secureEnv.validateIntegrity()) {
  throw new Error("Environment integrity check failed");
}

const sslConfig = () => {
  const sslMode = process.env.PGSSLMODE || 'disable';

  if (sslMode === 'disable') {
    return false;
  }

  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL?.includes('localhost')) {
    return { rejectUnauthorized: false };
  }
  return false;
};


let poolInstance = new Pool({
  connectionString: secureEnv.getDatabaseUrl(),
  ssl: sslConfig(),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

poolInstance.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});


let isPoolDrained = false;

/**
 * Get the current pool instance
 * Always returns the live pool reference, even after reinitialization
 */
export function getPool(): Pool {
  if (isPoolDrained) {
    throw new Error('Database pool is drained. Pool is being reinitialized during maintenance.');
  }
  return poolInstance;
}

/**
 * Get the current db instance
 * Always returns the live db reference, even after reinitialization
 */
export function getDb() {
  if (isPoolDrained) {
    throw new Error('Database pool is drained. Database is being reinitialized during maintenance.');
  }
  return db;
}



export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    return (getPool() as any)[prop];
  },
  set(_target, prop, value) {
    (getPool() as any)[prop] = value;
    return true;
  }
}) as Pool;


export let db = drizzle(poolInstance, { schema });

/**
 * Drain and end the current pool
 * Used during maintenance operations like database restore
 */
export async function drainPool(): Promise<void> {
  
  isPoolDrained = true;
  await poolInstance.end();
  
}

/**
 * Reinitialize the pool after it has been drained
 * Used after maintenance operations like database restore
 */
export function reinitializePool(): void {
  

  poolInstance = new Pool({
    connectionString: secureEnv.getDatabaseUrl(),
    ssl: sslConfig(),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  poolInstance.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
  });


  db = drizzle(poolInstance, { schema });


  isPoolDrained = false;

  
}