import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL || '';
const isLocal = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');
const isInternal = databaseUrl.includes('.railway.internal');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal || isInternal ? false : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export default pool;
export { pool };
