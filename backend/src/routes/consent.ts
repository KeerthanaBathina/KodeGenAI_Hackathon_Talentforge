import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import * as consentService from '../services/consentService';
import {
    GdprErasureRequestError,
    submitGdprErasureRequest,
} from '../services/gdprErasureRequestService';
import logger from '../utils/logger';

const router = Router();

const erasureRequestPayloadSchema = z.object({
    requestReason: z.string().trim().min(1).max(500).optional(),
}).strict();

/**
 * POST /api/consent/accept
 * Accept current privacy policy
 */
router.post('/accept', authenticate, async (req, res) => {
    try {
        const candidateId = req.user!.id;
        const ipAddress = req.ip || 'unknown';
        const userAgent = req.headers['user-agent'];
        const policyVersion = consentService.getCurrentPolicyVersion();

        const consent = await consentService.recordConsent(candidateId, policyVersion, ipAddress, userAgent);

        return res.status(201).json(consent);
    } catch (error) {
        logger.error({ error }, 'Error recording consent');
        return res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Unable to record consent',
            },
        });
    }
});

/**
 * POST /api/consent/erasure-request
 * Submit GDPR erasure request (idempotent for pending requests)
 */
router.post('/erasure-request', authenticate, async (req, res) => {
    try {
        if (req.user?.role !== 'candidate') {
            return res.status(403).json({
                error: {
                    code: 'FORBIDDEN',
                    message: 'Only candidates can submit erasure requests',
                },
            });
        }

        const payload = erasureRequestPayloadSchema.parse(req.body ?? {});
        const candidateId = req.user.candidateId || req.user.id;

        const submission = await submitGdprErasureRequest({
            candidateId,
            actorId: req.user.id,
            actorRole: req.user.role,
            ipAddress: req.ip || null,
            userAgent: req.headers['user-agent'] || null,
            requestReason: payload.requestReason,
        });

        const statusCode = submission.idempotent ? 200 : 201;
        return res.status(statusCode).json({
            ...submission.request,
            idempotent: submission.idempotent,
        });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                error: {
                    code: 'INVALID_REQUEST_PAYLOAD',
                    message: 'Invalid erasure request payload',
                    details: error.issues,
                },
            });
        }

        if (error instanceof GdprErasureRequestError && error.code === 'CANDIDATE_NOT_FOUND') {
            return res.status(404).json({
                error: {
                    code: error.code,
                    message: error.message,
                },
            });
        }

        logger.error({ error }, 'Error submitting GDPR erasure request');
        return res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Unable to submit erasure request',
            },
        });
    }
});

/**
 * GET /api/consent
 * Get active consent record
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const candidateId = req.user!.id;

        const consent = await consentService.getActiveConsent(candidateId);

        if (!consent) {
            return res.status(404).json({
                error: {
                    code: 'CONSENT_NOT_FOUND',
                    message: 'No active consent found',
                },
            });
        }

        return res.status(200).json(consent);
    } catch (error) {
        logger.error({ error }, 'Error fetching consent');
        return res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Unable to fetch consent',
            },
        });
    }
});

/**
 * DELETE /api/consent
 * Revoke privacy consent
 */
router.delete('/', authenticate, async (req, res) => {
    try {
        const candidateId = req.user!.id;
        const ipAddress = req.ip;

        await consentService.revokeConsent(candidateId, candidateId, ipAddress);

        return res.status(200).json({
            message: 'Consent revoked successfully',
        });
    } catch (error: any) {
        if (error.name === 'ConsentError' && error.code === 'CONSENT_NOT_FOUND') {
            return res.status(404).json({
                error: {
                    code: error.code,
                    message: error.message,
                },
            });
        }

        logger.error({ error }, 'Error revoking consent');
        return res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Unable to revoke consent',
            },
        });
    }
});

/**
 * GET /api/consent/history
 * Get full consent history
 */
router.get('/history', authenticate, async (req, res) => {
    try {
        const candidateId = req.user!.id;

        const history = await consentService.getConsentHistory(candidateId);

        return res.status(200).json(history);
    } catch (error) {
        logger.error({ error }, 'Error fetching consent history');
        return res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Unable to fetch consent history',
            },
        });
    }
});

export default router;
