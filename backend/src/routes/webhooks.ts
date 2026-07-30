import express from 'express';
import { z } from 'zod';
import { processScanResult, ScanWebhookError } from '../services/scanWebhookService';
import { processParseResult, ParseResultError } from '../services/parseResultService';
import { processWebhookScore, SessionNotFoundError } from '../services/assessmentScoreService';
import { validateWebhookSignature } from '../middleware/validateWebhookSignature';
import { 
    validateAssessmentScoreWebhook, 
    safeValidateAssessmentScoreWebhook 
} from '../schemas/webhookSchemas';
import { env } from '../config/env';
import logger from '../utils/logger';
import prisma from '../db/prisma';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

const ScanResultSchema = z.object({
    resumeId: z.string().uuid(),
    status: z.enum(['clean', 'infected']),
    threats: z.array(z.string()).optional(),
    scannerVersion: z.string().optional(),
    scanTime: z.string().datetime().optional(),
});

/**
 * POST /api/webhooks/scan-result
 * Receive malware scan results from antivirus service
 */
router.post('/scan-result', async (req, res) => {
    try {
        // Validate webhook signature/token
        const webhookToken = req.headers['x-webhook-token'];
        if (webhookToken !== env.SCAN_WEBHOOK_SECRET) {
            logger.warn('Invalid webhook token', {
                ip: req.ip,
                headers: req.headers,
            });
            return res.status(401).json({
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Invalid webhook token',
                },
            });
        }

        // Validate payload
        const validation = ScanResultSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: {
                    code: 'INVALID_PAYLOAD',
                    message: 'Invalid scan result payload',
                    details: validation.error.errors,
                },
            });
        }

        const scanResult = validation.data;

        await processScanResult({
            ...scanResult,
            scanTime: scanResult.scanTime ? new Date(scanResult.scanTime) : undefined,
        });

        return res.status(200).json({ received: true });
    } catch (error) {
        if (error instanceof ScanWebhookError) {
            return res.status(404).json({
                error: {
                    code: error.code,
                    message: error.message,
                },
            });
        }

        logger.error('Webhook processing error', {
            error: error instanceof Error ? error.message : String(error),
        });

        return res.status(500).json({
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to process scan result',
            },
        });
    }
});

const ParseResultSchema = z.object({
    resumeId: z.string().uuid(),
    status: z.enum(['success', 'failed']),
    parsedData: z
        .object({
            name: z.string(),
            email: z.string().optional(),
            phone: z.string().optional(),
            skills: z.array(z.string()),
            experience_years: z.number().int().min(0),
            employers: z.array(
                z.object({
                    name: z.string(),
                    title: z.string(),
                    duration: z.string().optional(),
                })
            ),
            education: z.array(
                z.object({
                    degree: z.string(),
                    field: z.string(),
                    institution: z.string(),
                })
            ),
            raw_text: z.string().optional(),
            extracted_at: z.string(),
        })
        .optional(),
    error: z.string().optional(),
});

/**
 * POST /api/webhooks/parse-result
 * Receive parsed resume data from Python worker
 */
router.post('/parse-result', async (req, res) => {
    try {
        // Validate worker token
        const workerToken = req.headers['x-worker-token'];
        if (!workerToken || workerToken !== env.WORKER_TOKEN) {
            logger.warn('Invalid worker token', {
                ip: req.ip,
            });
            return res.status(401).json({
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Unauthorized',
                },
            });
        }

        // Validate payload
        const validation = ParseResultSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid payload',
                    details: validation.error.errors,
                },
            });
        }

        const payload = validation.data;

        await processParseResult(payload);

        return res.status(200).json({
            success: true,
            message: 'Parse result processed successfully',
        });
    } catch (error) {
        if (error instanceof ParseResultError) {
            return res.status(error.statusCode).json({
                error: {
                    code: error.code,
                    message: error.message,
                },
            });
        }

        logger.error('Parse result webhook error', {
            error: error instanceof Error ? error.message : String(error),
        });

        return res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to process parse result',
            },
        });
    }
});

// ==================== Assessment Score Webhook ====================

/**
 * POST /api/webhooks/assessment-score
 * Receive assessment completion scores from external providers
 * 
 * Security:
 * - HMAC-SHA256 signature validation required
 * - No bearer token needed (provider authentication via HMAC)
 * - Idempotency enforced via session token
 * 
 * Request Headers:
 * - X-Signature-HMAC-SHA256: Hex-encoded HMAC signature
 * - X-Correlation-Id: Optional correlation ID for tracing
 * 
 * Request Body:
 * {
 *   "sessionToken": "sess_xxx",
 *   "score": 85,
 *   "completedAt": "2026-07-27T12:00:00Z",
 *   "metadata": { "optional": "provider-specific data" }
 * }
 * 
 * Response Codes:
 * - 200: Success (score processed or duplicate detected)
 * - 400: Validation error (invalid payload format)
 * - 401: Authentication error (invalid or missing signature)
 * - 404: Not found (session token doesn't exist)
 * - 500: Server error
 */
router.post(
    '/assessment-score',
    express.raw({ type: 'application/json' }),
    validateWebhookSignature,
    async (req, res) => {
        const startTime = Date.now();
        const correlationId = req.headers['x-correlation-id'] as string || uuidv4();

        try {
            // Parse raw body (already validated by HMAC middleware)
            const rawBody = (req as any).rawBody as Buffer;
            if (!rawBody) {
                logger.error({ correlationId }, 'Raw body missing after HMAC validation');
                return res.status(500).json({
                    success: false,
                    error: {
                        code: 'INTERNAL_ERROR',
                        message: 'Request processing error',
                    },
                });
            }

            const bodyStr = rawBody.toString('utf-8');
            const body = JSON.parse(bodyStr);

            // Validate webhook payload schema
            const validation = safeValidateAssessmentScoreWebhook(body);
            if (!validation.success) {
                logger.warn(
                    {
                        correlationId,
                        errors: validation.error.errors,
                    },
                    'Invalid webhook payload format'
                );

                // Create audit event for validation failure
                await createWebhookAuditEvent({
                    eventType: 'webhook_validation_failed',
                    correlationId,
                    payload: body,
                    error: 'Invalid payload format',
                    errors: validation.error.errors,
                });

                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Invalid webhook payload',
                        details: validation.error.errors,
                    },
                });
            }

            const payload = validation.data;

            logger.info(
                {
                    correlationId,
                    sessionToken: payload.sessionToken,
                    score: payload.score,
                },
                'Processing assessment score webhook'
            );

            // Process webhook score (includes idempotency check)
            const result = await processWebhookScore(payload);

            // Calculate processing duration
            const duration = Date.now() - startTime;

            if (result.duplicate) {
                // Duplicate webhook - return success without modification
                logger.info(
                    {
                        correlationId,
                        sessionToken: payload.sessionToken,
                        sessionId: result.sessionId,
                        duration,
                    },
                    'Duplicate webhook detected - no action taken'
                );

                // Create audit event for duplicate
                await createWebhookAuditEvent({
                    eventType: 'webhook_duplicate',
                    correlationId,
                    sessionId: result.sessionId,
                    applicationId: result.applicationId,
                    payload,
                    duration,
                });

                return res.status(200).json({
                    success: true,
                    duplicate: true,
                    message: 'Webhook already processed',
                    sessionId: result.sessionId,
                });
            }

            // First-time processing - score updated successfully
            logger.info(
                {
                    correlationId,
                    sessionId: result.sessionId,
                    applicationId: result.applicationId,
                    score: result.score,
                    duration,
                },
                'Assessment score processed successfully'
            );

            // Create audit event for successful processing
            await createWebhookAuditEvent({
                eventType: 'webhook_received',
                correlationId,
                sessionId: result.sessionId,
                applicationId: result.applicationId,
                payload,
                duration,
            });

            // TODO: Trigger stage progression (TASK-003 Step 3)
            // This will be implemented when stage progression service is available
            // await progressApplicationStage(result.applicationId);

            return res.status(200).json({
                success: true,
                duplicate: false,
                message: 'Assessment score processed',
                sessionId: result.sessionId,
                applicationId: result.applicationId,
            });
        } catch (error) {
            const duration = Date.now() - startTime;

            if (error instanceof SessionNotFoundError) {
                logger.warn(
                    { correlationId, error: error.message, duration },
                    'Session not found for webhook'
                );

                await createWebhookAuditEvent({
                    eventType: 'webhook_rejected',
                    correlationId,
                    payload: (req as any).body,
                    error: error.message,
                    errorCode: 'SESSION_NOT_FOUND',
                    duration,
                });

                return res.status(404).json({
                    success: false,
                    error: {
                        code: 'SESSION_NOT_FOUND',
                        message: error.message,
                    },
                });
            }

            // Unexpected error
            logger.error(
                {
                    correlationId,
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                    duration,
                },
                'Webhook processing error'
            );

            await createWebhookAuditEvent({
                eventType: 'webhook_error',
                correlationId,
                payload: (req as any).body,
                error: error instanceof Error ? error.message : String(error),
                errorCode: 'INTERNAL_ERROR',
                duration,
            });

            return res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Failed to process webhook',
                },
            });
        }
    }
);

/**
 * Create audit event for webhook processing.
 * Failures are logged but don't fail the request.
 */
async function createWebhookAuditEvent(params: {
    eventType: string;
    correlationId: string;
    sessionId?: string;
    applicationId?: string;
    payload?: any;
    error?: string;
    errorCode?: string;
    errors?: any[];
    duration?: number;
}): Promise<void> {
    try {
        await prisma.auditEvent.create({
            data: {
                eventType: params.eventType,
                entityType: 'webhook',
                entityId: params.sessionId || params.correlationId,
                userId: null, // Webhooks have no user context
                metadata: {
                    correlationId: params.correlationId,
                    sessionId: params.sessionId,
                    applicationId: params.applicationId,
                    duration: params.duration,
                },
                payloadJson: {
                    payload: params.payload,
                    error: params.error,
                    errorCode: params.errorCode,
                    errors: params.errors,
                },
            },
        });
    } catch (auditError) {
        // Don't fail webhook processing due to audit failure
        logger.error(
            {
                correlationId: params.correlationId,
                error: auditError instanceof Error ? auditError.message : String(auditError),
            },
            'Failed to create webhook audit event'
        );
    }
}

export default router;
