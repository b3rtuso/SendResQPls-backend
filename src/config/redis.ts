import { Redis } from 'ioredis';
import 'dotenv/config';

let redisClient: Redis | null = null;

if (process.env.UPSTASH_REDIS_URL) {
  try {
    redisClient = new Redis(process.env.UPSTASH_REDIS_URL, {
      maxRetriesPerRequest: null, // Required by BullMQ — disables per-command retry limit
      tls: { rejectUnauthorized: false },
      enableReadyCheck: false,
    });
    redisClient.on('connect', () => console.log('✅ Redis connected (Upstash)'));
    redisClient.on('error', (err) => console.error('❌ Redis error:', err.message));
  } catch (err: any) {
    console.warn('⚠️ Failed to initialize Redis client:', err.message);
    redisClient = null;
  }
} else {
  console.warn('⚠️ UPSTASH_REDIS_URL is not set. BullMQ background queue will fallback to direct async execution.');
}

/**
 * Shared ioredis client for BullMQ.
 * Uses Upstash's native Redis-protocol endpoint (rediss://).
 */
export const redis = redisClient;
