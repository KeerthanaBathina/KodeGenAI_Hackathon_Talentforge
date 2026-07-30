import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '../db/redis';

export const publicLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '60 s'),
  analytics: false,
  prefix: 'rl:public'
});

export const authLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1000, '60 s'),
  analytics: false,
  prefix: 'rl:auth'
});
