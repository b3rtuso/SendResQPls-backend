import { Redis } from 'ioredis';
import 'dotenv/config';

if (!process.env.UPSTASH_REDIS_URL) {
  throw new Error('UPSTASH_REDIS_URL is not set in environment variables');
}

/**
 * Shared ioredis client for BullMQ.
 * Uses Upstash's native Redis-protocol endpoint (rediss://).
 * TLS is required by Upstash — rejectUnauthorized: false allows self-signed certs.
 */
export const redis = new Redis(process.env.UPSTASH_REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ — disables per-command retry limit
  tls: { rejectUnauthorized: false },
  enableReadyCheck: false,
});

redis.on('connect', () => console.log('✅ Redis connected (Upstash)'));
redis.on('error', (err) => console.error('❌ Redis error:', err.message));
