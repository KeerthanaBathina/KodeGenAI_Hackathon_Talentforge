import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import * as consentService from '../services/consentService';
import logger from '../utils/logger';

const router = Router();

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
