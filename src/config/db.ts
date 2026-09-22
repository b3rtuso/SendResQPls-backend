import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const connectionString = `${process.env.DATABASE_URL}`;

const pool = new Pool({
  connectionString,
  max: 12,                    // Balanced pool size to prevent Supabase/Postgres connection exhaustion
  idleTimeoutMillis: 30000,   // Close idle connections after 30s
  connectionTimeoutMillis: 10000, // Allow 10s headroom for connection spikes under surge load
  keepAlive: true,            // Send TCP keep-alive to keep connection healthy across firewalls
});

// Prevent unhandled error exceptions on idle clients from crashing Node process
pool.on('error', (err) => {
  console.warn('⚠️ Unexpected PostgreSQL pool error on idle client:', err.message);
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

// Graceful shutdown handling
const handleShutdown = async () => {
  try {
    await prisma.$disconnect();
    await pool.end();
  } catch {
    // Ignore on exit
  }
};

process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);