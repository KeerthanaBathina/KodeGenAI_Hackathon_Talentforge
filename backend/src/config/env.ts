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
  EMAIL_PROVIDER: z.enum(['mock', 'smtp', 'brevo']).default('mock'),
  EMAIL_FROM: z.string().email('EMAIL_FROM must be a valid email').default('no-reply@ai-interview.local'),
  BREVO_API_KEY: z.string().min(10, 'BREVO_API_KEY must be at least 10 characters').optional(),
  BREVO_SENDER_NAME: z.string().min(1).optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z.coerce.boolean().optional(),
  // Resend API Configuration
  RESEND_API_KEY: z.string().min(10, 'RESEND_API_KEY must be at least 10 characters').optional(),
  RESEND_FROM_EMAIL: z.string().email('RESEND_FROM_EMAIL must be a valid email').optional(),
  // Alert Configuration
  ALERT_WEBHOOK_URL: z.string().url('ALERT_WEBHOOK_URL must be a valid URL').optional(),
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
  // Redis Configuration (for BullMQ)
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL').default('redis://localhost:6379'),
  // Offer Token Configuration
  OFFER_TOKEN_SECRET: z.string().min(32, 'OFFER_TOKEN_SECRET must be at least 32 characters').optional(),
  // Resume Upload & Scanning
  SCAN_WEBHOOK_SECRET: z.string().min(32, 'SCAN_WEBHOOK_SECRET must be at least 32 characters').default('dev-only-scan-webhook-secret-change-in-production'),
  WORKER_TOKEN: z.string().min(32, 'WORKER_TOKEN must be at least 32 characters').default('dev-only-worker-token-change-in-production'),
  RESUME_PARSER_ENDPOINT: z.string().url('RESUME_PARSER_ENDPOINT must be a valid URL').optional(),
  RESUME_PARSER_API_KEY: z.string().optional(),
  RESUME_PARSER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
  // Redis for BullMQ
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379'),
  REDIS_PASSWORD: z.string().optional(),
  REVIEW_QUEUE_SLA_HOURS: z.coerce.number().int().min(1).max(168).default(48),
  GDPR_ANONYMIZATION_SLA_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  AUDIT_RETENTION_YEARS: z.coerce.number().int().min(1).max(50).default(7),
  AUDIT_ARCHIVE_BUCKET: z.string().min(1).default('local-audit-archive'),
  AUDIT_ARCHIVE_PATH_PREFIX: z.string().min(1).default('audit-events'),
  AUDIT_ARCHIVE_BATCH_SIZE: z.coerce.number().int().min(100).max(200000).default(5000),
  AUDIT_ARCHIVE_CHUNK_SIZE: z.coerce.number().int().min(100).max(50000).default(1000),
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

if (parsed.data.AUDIT_ARCHIVE_CHUNK_SIZE > parsed.data.AUDIT_ARCHIVE_BATCH_SIZE) {
  console.error('[env] AUDIT_ARCHIVE_CHUNK_SIZE must be less than or equal to AUDIT_ARCHIVE_BATCH_SIZE');
  process.exit(1);
}

export const env = parsed.data;
