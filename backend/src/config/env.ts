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
  OTP_HASH_SALT: z.string().min(16, 'OTP_HASH_SALT must be at least 16 characters').default('dev-only-otp-salt-change-me'),
  OTP_EXPIRY_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  EMAIL_PROVIDER: z.enum(['mock', 'smtp']).default('mock'),
  EMAIL_FROM: z.string().email('EMAIL_FROM must be a valid email').default('no-reply@ai-interview.local'),
  // JWT Configuration (RS256 or HS256)
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').optional(),
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_EXPIRES_IN: z.string().default('24h'),
  // OAuth Configuration
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_REDIRECT_URI: z.string().url().optional(),
  PRIVACY_POLICY_VERSION: z.string().default('1.0'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url('OTEL_EXPORTER_OTLP_ENDPOINT must be a valid URL').optional(),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().default('ai-interview-backend'),
  // Resume Upload & Scanning
  SCAN_WEBHOOK_SECRET: z.string().min(32, 'SCAN_WEBHOOK_SECRET must be at least 32 characters').default('dev-only-scan-webhook-secret-change-in-production'),
  WORKER_TOKEN: z.string().min(32, 'WORKER_TOKEN must be at least 32 characters').default('dev-only-worker-token-change-in-production'),
  // Redis for BullMQ
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379'),
  REDIS_PASSWORD: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[env] Missing or invalid environment variables');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

// Validate JWT configuration
if (!parsed.data.JWT_SECRET && (!parsed.data.JWT_PRIVATE_KEY || !parsed.data.JWT_PUBLIC_KEY)) {
  console.error('[env] JWT configuration error: Either JWT_SECRET or both JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be set');
  process.exit(1);
}

export const env = parsed.data;
