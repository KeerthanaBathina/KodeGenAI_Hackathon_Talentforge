import { trace } from '@opentelemetry/api';
import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'ai-interview-backend',
    env: env.NODE_ENV
  },
  redact: {
    paths: [
      'password',
      'confirmPassword',
      'currentPassword',
      'req.body.password',
      'req.body.confirmPassword',
      'req.body.currentPassword',
      '*.password',
      '*.confirmPassword',
      'authorization',
      'req.headers.authorization',
      'cookie',
      'req.headers.cookie'
    ],
    censor: '[REDACTED]'
  },
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
          }
        }
      : undefined,
  mixin() {
    const activeSpan = trace.getActiveSpan();
    if (!activeSpan) {
      return {};
    }

    const { traceId, spanId } = activeSpan.spanContext();
    return { traceId, spanId };
  }
});

export default logger;
