import { Redis } from '@upstash/redis';
import { env } from '../config/env';

export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
  retry: {
    retries: 3,
    backoff: (retryCount) => Math.min(200 * Math.pow(2, retryCount), 2000)
  }
});

export async function pingRedis(): Promise<number> {
  const start = Date.now();
  const result = await redis.ping();
  const latencyMs = Date.now() - start;

  if (result !== 'PONG') {
    throw new Error(`Unexpected PING response: ${String(result)}`);
  }

  return latencyMs;
}
