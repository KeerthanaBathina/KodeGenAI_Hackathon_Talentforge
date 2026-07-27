/**
 * Webhook Signature Validation Middleware
 * 
 * Validates HMAC-SHA256 signatures for incoming webhook requests from assessment providers.
 * Provides cryptographic verification to prevent forged webhook payloads.
 * 
 * @module middleware/validateWebhookSignature
 */

import { Request, Response, NextFunction } from 'express';
import prisma from '../db/prisma';
import { validateHmacSignature, extractSignatureHeader } from '../utils/hmac';
import logger from '../utils/logger';

/**
 * Custom error class for signature validation failures
 */
export class SignatureValidationError extends Error {
    constructor(
        public code: 'MISSING_SIGNATURE' | 'INVALID_SIGNATURE' | 'INVALID_FORMAT' | 'PROVIDER_NOT_FOUND',
        message: string,
        public statusCode: number = 401,
        public providerId?: string,
        public correlationId?: string
    ) {
        super(message);
        this.name = 'SignatureValidationError';
    }
}

/**
 * Express request extended with webhook context
 */
export interface WebhookRequest extends Request {
    webhookContext?: {
        providerId: string;
        providerName: string;
        validated: boolean;
        correlationId: string;
    };
}

/**
 * Middleware to validate HMAC-SHA256 signature for webhook requests
 * 
 * Flow:
 * 1. Extract signature from X-Signature-HMAC-SHA256 header
 * 2. Identify provider from request context (session token in body)
 * 3. Retrieve provider's HMAC secret from database
 * 4. Validate signature using constant-time comparison
 * 5. Create audit event on validation failure
 * 6. Pass control to next middleware on success
 * 
 * @param req - Express request (must have raw body buffer)
 * @param res - Express response
 * @param next - Express next function
 */
export async function validateWebhookSignature(
    req: WebhookRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    const correlationId = req.headers['x-correlation-id'] as string || `webhook-${Date.now()}`;

    try {
        // Extract signature from header
        const signature = extractSignatureHeader(req.headers as Record<string, string | string[] | undefined>);

        if (!signature) {
            logger.warn('Webhook received without signature header', {
                correlationId,
                headers: Object.keys(req.headers),
            });

            // Create security audit event
            await createSecurityAuditEvent({
                eventType: 'webhook_signature_missing',
                correlationId,
                ipAddress: req.ip,
            });

            throw new SignatureValidationError(
                'MISSING_SIGNATURE',
                'X-Signature-HMAC-SHA256 header is required for webhook requests',
                401,
                undefined,
                correlationId
            );
        }

        // Validate signature format (64-character hex string)
        if (!/^[0-9a-f]{64}$/i.test(signature)) {
            logger.warn('Invalid signature format received', {
                correlationId,
                signatureLength: signature.length,
            });

            await createSecurityAuditEvent({
                eventType: 'webhook_signature_invalid_format',
                correlationId,
                ipAddress: req.ip,
            });

            throw new SignatureValidationError(
                'INVALID_FORMAT',
                'Signature must be a 64-character hex-encoded string',
                401,
                undefined,
                correlationId
            );
        }

        // Get raw body buffer (must be preserved by express.raw() middleware)
        const rawBody = (req as any).rawBody as Buffer;

        if (!rawBody || !Buffer.isBuffer(rawBody)) {
            logger.error('Raw body buffer not available for signature validation', {
                correlationId,
                bodyType: typeof (req as any).rawBody,
            });

            throw new SignatureValidationError(
                'INVALID_FORMAT',
                'Request body must be preserved as Buffer for signature validation',
                500,
                undefined,
                correlationId
            );
        }

        // Parse body to extract session token for provider lookup
        // Note: We parse here only to identify provider; full validation happens after signature check
        let parsedBody: any;
        try {
            parsedBody = JSON.parse(rawBody.toString('utf-8'));
        } catch (error) {
            logger.warn('Failed to parse webhook body as JSON', {
                correlationId,
                error: error instanceof Error ? error.message : String(error),
            });

            throw new SignatureValidationError(
                'INVALID_FORMAT',
                'Request body must be valid JSON',
                400,
                undefined,
                correlationId
            );
        }

        // Look up provider by session token
        const sessionToken = parsedBody.sessionToken;
        if (!sessionToken) {
            logger.warn('Session token missing from webhook payload', {
                correlationId,
            });

            throw new SignatureValidationError(
                'INVALID_FORMAT',
                'sessionToken is required in webhook payload',
                400,
                undefined,
                correlationId
            );
        }

        // Find assessment session to get provider ID
        const session = await prisma.assessmentSession.findUnique({
            where: { sessionToken },
            include: { provider: true },
        });

        if (!session) {
            logger.warn('Assessment session not found for webhook', {
                correlationId,
                sessionToken: sessionToken.substring(0, 8) + '...',
            });

            throw new SignatureValidationError(
                'PROVIDER_NOT_FOUND',
                'Assessment session not found',
                404,
                undefined,
                correlationId
            );
        }

        const provider = session.provider;

        if (!provider.hmacSecret) {
            logger.error('Provider HMAC secret not configured', {
                correlationId,
                providerId: provider.id,
                providerName: provider.name,
            });

            throw new SignatureValidationError(
                'INVALID_FORMAT',
                'Provider signature validation not configured',
                500,
                provider.id,
                correlationId
            );
        }

        // Validate HMAC signature using constant-time comparison
        const isValid = validateHmacSignature(rawBody, signature, provider.hmacSecret);

        if (!isValid) {
            logger.warn('HMAC signature validation failed', {
                correlationId,
                providerId: provider.id,
                providerName: provider.name,
                sessionToken: sessionToken.substring(0, 8) + '...',
            });

            // Create security audit event for failed validation
            await createSecurityAuditEvent({
                eventType: 'webhook_signature_invalid',
                correlationId,
                providerId: provider.id,
                sessionToken,
                ipAddress: req.ip,
            });

            throw new SignatureValidationError(
                'INVALID_SIGNATURE',
                'Signature validation failed',
                401,
                provider.id,
                correlationId
            );
        }

        // Signature validated successfully - attach provider context to request
        req.webhookContext = {
            providerId: provider.id,
            providerName: provider.name,
            validated: true,
            correlationId,
        };

        logger.info('Webhook signature validated successfully', {
            correlationId,
            providerId: provider.id,
            providerName: provider.name,
        });

        next();
    } catch (error) {
        if (error instanceof SignatureValidationError) {
            res.status(error.statusCode).json({
                success: false,
                error: {
                    code: error.code,
                    message: error.message,
                    correlationId: error.correlationId,
                },
            });
            return;
        }

        // Unexpected error
        logger.error('Unexpected error in signature validation middleware', {
            correlationId,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        });

        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error during signature validation',
                correlationId,
            },
        });
    }
}

/**
 * Create security audit event for signature validation failures
 */
async function createSecurityAuditEvent(params: {
    eventType: string;
    correlationId: string;
    providerId?: string;
    sessionToken?: string;
    ipAddress?: string;
}): Promise<void> {
    try {
        await prisma.auditEvent.create({
            data: {
                eventType: params.eventType,
                entityType: 'webhook',
                entityId: params.correlationId,
                actorId: params.providerId || 'system',
                payloadJson: {
                    correlationId: params.correlationId,
                    providerId: params.providerId,
                    sessionToken: params.sessionToken,
                    ipAddress: params.ipAddress,
                    timestamp: new Date().toISOString(),
                },
            },
        });
    } catch (error) {
        // Don't fail the request if audit logging fails
        logger.error('Failed to create security audit event', {
            eventType: params.eventType,
            correlationId: params.correlationId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
