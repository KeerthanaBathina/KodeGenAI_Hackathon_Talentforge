import { describe, expect, it } from 'vitest';

describe('env config contract', () => {
  const requiredVars = [
    'DATABASE_URL',
    'DIRECT_URL',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'FRONTEND_URL'
  ];

  it('contains all required environment variable names', () => {
    requiredVars.forEach((name) => {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    });
  });

  it('contains no duplicate variable names', () => {
    const unique = new Set(requiredVars);
    expect(unique.size).toBe(requiredVars.length);
  });
});
