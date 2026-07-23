import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production', 'staging']).default('development'),
  PORT: z.string().default('3001'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().min(1, 'DIRECT_URL is required'),
  UPSTASH_REDIS_REST_URL: z.string().url('UPSTASH_REDIS_REST_URL must be a valid URL'),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, 'UPSTASH_REDIS_REST_TOKEN is required'),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url('OTEL_EXPORTER_OTLP_ENDPOINT must be a valid URL').optional(),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().default('ai-interview-backend')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[env] Missing or invalid environment variables');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
