/**
 * Session Timer API Routes
 * 
 * REST endpoints for session timer operations:
 * - GET /api/sessions/:sessionId/timer - Get remaining time
 * - POST /api/sessions/:sessionId/heartbeat - Update heartbeat
 */

import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import logger from '../utils/logger';
import prisma from '../db/prisma';
import {
    getSessionTimer,
    updateHeartbeat
} from '../services/sessionTimerService';
import { SessionIdParamSchema } from '../schemas/sessionTimerSchemas';

const router = express.Router();

/**
 * Rate limiter for heartbeat endpoints
 * In-memory store tracking last heartbeat timestamp per session
 */
const heartbeatRateLimiter = new Map<string, number>();
const HEARTBEAT_RATE_LIMIT_MS = 10000; // 10 seconds

/**
 * Middleware to validate session token
 * Extracts token from Authorization header and verifies it matches the session
 */
async function validateSessionToken(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const { sessionId } = req.params;
        
        // Extract token from Authorization header (Bearer token)
        const authHeader = req.headers.authorization;
        const token = authHeader?.startsWith('Bearer ')
            ? authHeader.substring(7)
            : req.query.token as string | undefined; // Fallback to query param

        if (!token) {
            res.status(401).json({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Session token required'
                }
            });
            return;
        }

        // Verify token matches session
        const session = await prisma.assessmentSession.findUnique({
            where: { id: sessionId },
            select: {
                id: true,
                sessionToken: true,
                status: true
            }
        });

        if (!session) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'SESSION_NOT_FOUND',
                    message: 'Assessment session not found'
                }
            });
            return;
        }

        if (session.sessionToken !== token) {
            res.status(401).json({
                success: false,
                error: {
                    code: 'INVALID_TOKEN',
                    message: 'Invalid session token'
                }
            });
            return;
        }

        // Attach session to request for downstream use
        (req as any).session = session;
        next();
    } catch (error) {
        logger.error({
            error,
            sessionId: req.params.sessionId
        }, 'Session token validation failed');

        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error'
            }
        });
    }
}

/**
 * Middleware to validate session ID parameter format
 */
function validateSessionId(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const validationResult = SessionIdParamSchema.safeParse(req.params);

    if (!validationResult.success) {
        res.status(400).json({
            success: false,
            error: {
                code: 'INVALID_SESSION_ID',
                message: 'Invalid session ID format',
                details: validationResult.error.errors
            }
        });
        return;
    }

    next();
}

/**
 * Middleware to enforce heartbeat rate limiting
 * Maximum 1 heartbeat per 10 seconds per session
 */
function enforceHeartbeatRateLimit(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const { sessionId } = req.params;
    const now = Date.now();
    const lastHeartbeat = heartbeatRateLimiter.get(sessionId);

    if (lastHeartbeat && (now - lastHeartbeat) < HEARTBEAT_RATE_LIMIT_MS) {
        const retryAfter = Math.ceil((HEARTBEAT_RATE_LIMIT_MS - (now - lastHeartbeat)) / 1000);
        
        res.status(429).json({
            success: false,
            error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Heartbeat rate limit exceeded. Try again in a few seconds.',
                retryAfter
            }
        });
        return;
    }

    // Update last heartbeat timestamp
    heartbeatRateLimiter.set(sessionId, now);
    
    // Cleanup old entries (older than 1 hour)
    const oneHourAgo = now - (60 * 60 * 1000);
    for (const [key, value] of heartbeatRateLimiter.entries()) {
        if (value < oneHourAgo) {
            heartbeatRateLimiter.delete(key);
        }
    }

    next();
}

/**
 * GET /api/sessions/:sessionId/timer
 * 
 * Get current timer state for a session
 * 
 * Headers:
 * - Authorization: Bearer <session_token>
 * 
 * Response 200:
 * {
 *   "success": true,
 *   "data": {
 *     "sessionId": "uuid",
 *     "remainingMinutes": 42.5,
 *     "status": "active",
 *     "lastHeartbeat": "2026-07-27T14:30:00Z"
 *   }
 * }
 * 
 * Response 404: Session not found
 * Response 410: Session expired
 * Response 401: Invalid or missing token
 */
router.get(
    '/:sessionId/timer',
    validateSessionId,
    validateSessionToken,
    async (req: Request, res: Response) => {
        const { sessionId } = req.params;
        const correlationId = crypto.randomUUID();

        try {
            logger.debug({
                sessionId,
                correlationId
            }, 'Fetching session timer');

            const timerState = await getSessionTimer(sessionId);

            if (!timerState) {
                return res.status(404).json({
                    success: false,
                    error: {
                        code: 'TIMER_NOT_FOUND',
                        message: 'Session timer not found',
                        correlationId
                    }
                });
            }

            // Check if session expired
            if (timerState.status === 'expired') {
                return res.status(410).json({
                    success: false,
                    error: {
                        code: 'SESSION_EXPIRED',
                        message: 'Your session has expired. Please contact HR to reschedule.',
                        correlationId
                    }
                });
            }

            return res.status(200).json({
                success: true,
                data: {
                    sessionId: timerState.sessionId,
                    remainingMinutes: timerState.remainingMinutes,
                    status: timerState.status,
                    lastHeartbeat: timerState.lastHeartbeat
                },
                correlationId
            });
        } catch (error) {
            logger.error({
                error,
                sessionId,
                correlationId
            }, 'Failed to fetch session timer');

            return res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to fetch session timer',
                    correlationId
                }
            });
        }
    }
);

/**
 * POST /api/sessions/:sessionId/heartbeat
 * 
 * Update heartbeat timestamp for a session
 * 
 * Headers:
 * - Authorization: Bearer <session_token>
 * 
 * Response 200:
 * {
 *   "success": true,
 *   "data": {
 *     "sessionId": "uuid",
 *     "remainingMinutes": 42.3,
 *     "status": "active",
 *     "lastHeartbeat": "2026-07-27T14:31:00Z"
 *   }
 * }
 * 
 * Response 404: Session not found
 * Response 410: Session expired
 * Response 429: Rate limit exceeded
 * Response 401: Invalid or missing token
 */
router.post(
    '/:sessionId/heartbeat',
    validateSessionId,
    validateSessionToken,
    enforceHeartbeatRateLimit,
    async (req: Request, res: Response) => {
        const { sessionId } = req.params;
        const correlationId = crypto.randomUUID();

        try {
            logger.debug({
                sessionId,
                correlationId
            }, 'Updating session heartbeat');

            const timerState = await updateHeartbeat(sessionId);

            if (!timerState) {
                return res.status(404).json({
                    success: false,
                    error: {
                        code: 'TIMER_NOT_FOUND',
                        message: 'Session timer not found',
                        correlationId
                    }
                });
            }

            // Check if session expired
            if (timerState.status === 'expired') {
                return res.status(410).json({
                    success: false,
                    error: {
                        code: 'SESSION_EXPIRED',
                        message: 'Your session has expired. Please contact HR to reschedule.',
                        correlationId
                    }
                });
            }

            return res.status(200).json({
                success: true,
                data: {
                    sessionId: timerState.sessionId,
                    remainingMinutes: timerState.remainingMinutes,
                    status: timerState.status,
                    lastHeartbeat: timerState.lastHeartbeat
                },
                correlationId
            });
        } catch (error) {
            logger.error({
                error,
                sessionId,
                correlationId
            }, 'Failed to update session heartbeat');

            return res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to update heartbeat',
                    correlationId
                }
            });
        }
    }
);

export default router;
