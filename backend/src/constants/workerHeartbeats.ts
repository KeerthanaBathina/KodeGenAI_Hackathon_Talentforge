/**
 * Worker Heartbeat Constants
 * Centralized configuration for worker heartbeat keys and thresholds
 */

export const WORKER_HEARTBEAT_KEYS = {
  SCREENING: 'worker:screening:heartbeat',
  RESUME_PARSE: 'worker:resume-parse:heartbeat',
  EMAIL_DELIVERY: 'worker:email:heartbeat',
  OFFER_PROCESSING: 'worker:offer:heartbeat',
} as const;

/**
 * Heartbeat thresholds for worker status determination
 */
export const HEARTBEAT_THRESHOLDS = {
  ONLINE_MAX_MINUTES: 2,
  DEGRADED_MAX_MINUTES: 5,
  TTL_SECONDS: 600, // 10 minutes - how long heartbeat is stored in Redis
} as const;

/**
 * Worker configuration for health checks
 * Maps worker key to display name
 */
export const WORKER_CONFIGS = [
  {
    key: WORKER_HEARTBEAT_KEYS.SCREENING,
    name: 'AI Screening Worker',
  },
  {
    key: WORKER_HEARTBEAT_KEYS.RESUME_PARSE,
    name: 'Resume Parser Worker',
  },
  {
    key: WORKER_HEARTBEAT_KEYS.EMAIL_DELIVERY,
    name: 'Email Delivery Worker',
  },
  {
    key: WORKER_HEARTBEAT_KEYS.OFFER_PROCESSING,
    name: 'Offer Processing Worker',
  },
] as const;
