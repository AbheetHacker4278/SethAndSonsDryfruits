import IORedis, { Redis } from 'ioredis';
import type { AppConfig } from '../config.ts';

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  invalidations: number;
  backend: 'redis' | 'memory';
  isRedisConnected: boolean;
}

export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: any, ttlSeconds?: number): Promise<void>;
  del(key: string | string[]): Promise<void>;
  invalidateCatalog(): Promise<void>;
  getStats(): CacheStats;
  close(): Promise<void>;
}

interface MemoryEntry {
  val: string;
  expiresAt: number;
}

/**
 * Production-ready Cache Service with graceful Redis fallback to in-memory TTL storage.
 * 
 * Strict Financial Boundary Enforcement:
 * - Authoritative transactional state (Stock, Payments, Refunds, Coupons, Loyalty, Idempotency)
 *   MUST ALWAYS bypass cache and query MongoDB directly.
 * - Cache is strictly restricted to read-heavy public catalog metadata and configuration.
 */
export function createCacheService(config?: Partial<AppConfig>): CacheService {
  const redisUrl = config?.redisUrl || process.env.REDIS_URL || '';
  let redisClient: Redis | null = null;
  let isRedisConnected = false;

  const memoryStore = new Map<string, MemoryEntry>();
  let hits = 0;
  let misses = 0;
  let sets = 0;
  let invalidations = 0;

  if (redisUrl && redisUrl.startsWith('redis://')) {
    try {
      redisClient = new IORedis(redisUrl, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        retryStrategy(times) {
          if (times > 3) return null; // stop retrying after 3 attempts
          return Math.min(times * 200, 1000);
        },
        lazyConnect: true,
      });

      redisClient.on('connect', () => {
        isRedisConnected = true;
      });

      redisClient.on('error', () => {
        isRedisConnected = false;
      });

      redisClient.on('close', () => {
        isRedisConnected = false;
      });

      // Attempt async connection without blocking app startup
      redisClient.connect().catch(() => {
        isRedisConnected = false;
      });
    } catch {
      isRedisConnected = false;
      redisClient = null;
    }
  }

  function getMemory<T>(key: string): T | null {
    const entry = memoryStore.get(key);
    if (!entry) {
      misses++;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      memoryStore.delete(key);
      misses++;
      return null;
    }
    hits++;
    try {
      return JSON.parse(entry.val) as T;
    } catch {
      return null;
    }
  }

  function setMemory(key: string, value: any, ttlSeconds: number = 60): void {
    sets++;
    // Enforce memory store bounded capacity (LRU-like eviction if over 1000 items)
    if (memoryStore.size >= 1000) {
      const oldestKey = memoryStore.keys().next().value;
      if (oldestKey) memoryStore.delete(oldestKey);
    }
    memoryStore.set(key, {
      val: JSON.stringify(value),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  return {
    async get<T>(key: string): Promise<T | null> {
      if (redisClient && isRedisConnected) {
        try {
          const raw = await redisClient.get(key);
          if (raw) {
            hits++;
            return JSON.parse(raw) as T;
          }
          misses++;
          return null;
        } catch {
          // Graceful fallback to in-memory on Redis error
          return getMemory<T>(key);
        }
      }
      return getMemory<T>(key);
    },

    async set(key: string, value: any, ttlSeconds: number = 60): Promise<void> {
      if (redisClient && isRedisConnected) {
        try {
          sets++;
          const serialized = JSON.stringify(value);
          await redisClient.set(key, serialized, 'EX', ttlSeconds);
          return;
        } catch {
          // Fallback to in-memory on Redis error
          setMemory(key, value, ttlSeconds);
          return;
        }
      }
      setMemory(key, value, ttlSeconds);
    },

    async del(key: string | string[]): Promise<void> {
      invalidations++;
      const keys = Array.isArray(key) ? key : [key];
      for (const k of keys) {
        memoryStore.delete(k);
      }
      if (redisClient && isRedisConnected) {
        try {
          await redisClient.del(...keys);
        } catch {
          // Non-blocking fallback
        }
      }
    },

    async invalidateCatalog(): Promise<void> {
      invalidations++;
      for (const k of Array.from(memoryStore.keys())) {
        if (k.startsWith('public:')) {
          memoryStore.delete(k);
        }
      }
      if (redisClient && isRedisConnected) {
        try {
          const keys = await redisClient.keys('public:*');
          if (keys.length > 0) {
            await redisClient.del(...keys);
          }
        } catch {
          // Non-blocking fallback
        }
      }
    },

    getStats(): CacheStats {
      return {
        hits,
        misses,
        sets,
        invalidations,
        backend: isRedisConnected ? 'redis' : 'memory',
        isRedisConnected,
      };
    },

    async close(): Promise<void> {
      memoryStore.clear();
      if (redisClient) {
        try {
          await redisClient.quit();
        } catch {
          // Graceful shutdown
        }
      }
    },
  };
}
