import { Router } from 'express';
import { z } from 'zod';
import {
  acceptOffer,
  declineOffer,
  getOfferDetails,
  OfferNotFoundError,
  OfferAccessDeniedError,
  OfferAlreadyRespondedError,
  OfferExpiredError
} from '../services/offerResponseService';
import { verifyOfferToken } from '../services/offerTokenService';
import logger from '../utils/logger';

const router = Router();

// Validation schemas
const AcceptOfferSchema = z.object({
  token: z.string().min(1, 'Token is required')
});

const DeclineOfferSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  reason: z.string().optional()
});

/**
 * POST /api/offers/:id/accept
 * Accept an offer
 */
router.post('/:id/accept', async (req, res) => {
  try {
    const offerId = req.params.id;

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(offerId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid offer ID format'
        }
      });
    }

    // Validate request body
    const validation = AcceptOfferSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: validation.error.format()
        }
      });
    }

    const { token } = validation.data;

    // Verify token
    let candidateId: string;
    try {
      const payload = verifyOfferToken(token);
      candidateId = payload.candidateId;

      // Validate token is for this offer
      if (payload.offerId !== offerId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'TOKEN_MISMATCH',
            message: 'Token is not valid for this offer'
          }
        });
      }
    } catch (error: any) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: error.message
        }
      });
    }

    // Process acceptance
    await acceptOffer({ offerId, candidateId });

    res.status(200).json({
      success: true,
      data: {
        message: 'Offer accepted successfully',
        offerId,
        status: 'accepted'
      }
    });
  } catch (error: any) {
    logger.error({ error: error.message, offerId: req.params.id }, 'Offer acceptance failed');

    if (error instanceof OfferNotFoundError) {
      return res.status(404).json({
        success: false,
        error: { code: 'OFFER_NOT_FOUND', message: error.message }
      });
    }

    if (error instanceof OfferAccessDeniedError) {
      return res.status(403).json({
        success: false,
        error: { code: 'ACCESS_DENIED', message: error.message }
      });
    }

    if (error instanceof OfferAlreadyRespondedError) {
      return res.status(409).json({
        success: false,
        error: { code: 'ALREADY_RESPONDED', message: error.message }
      });
    }

    if (error instanceof OfferExpiredError) {
      return res.status(410).json({
        success: false,
        error: { code: 'OFFER_EXPIRED', message: error.message }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to accept offer'
      }
    });
  }
});

/**
 * POST /api/offers/:id/decline
 * Decline an offer
 */
router.post('/:id/decline', async (req, res) => {
  try {
    const offerId = req.params.id;

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(offerId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid offer ID format'
        }
      });
    }

    // Validate request body
    const validation = DeclineOfferSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: validation.error.format()
        }
      });
    }

    const { token, reason } = validation.data;

    // Verify token
    let candidateId: string;
    try {
      const payload = verifyOfferToken(token);
      candidateId = payload.candidateId;

      // Validate token is for this offer
      if (payload.offerId !== offerId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'TOKEN_MISMATCH',
            message: 'Token is not valid for this offer'
          }
        });
      }
    } catch (error: any) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: error.message
        }
      });
    }

    // Process declination
    await declineOffer({ offerId, candidateId, reason });

    res.status(200).json({
      success: true,
      data: {
        message: 'Offer declined successfully',
        offerId,
        status: 'declined'
      }
    });
  } catch (error: any) {
    logger.error({ error: error.message, offerId: req.params.id }, 'Offer declination failed');

    if (error instanceof OfferNotFoundError) {
      return res.status(404).json({
        success: false,
        error: { code: 'OFFER_NOT_FOUND', message: error.message }
      });
    }

    if (error instanceof OfferAccessDeniedError) {
      return res.status(403).json({
        success: false,
        error: { code: 'ACCESS_DENIED', message: error.message }
      });
    }

    if (error instanceof OfferAlreadyRespondedError) {
      return res.status(409).json({
        success: false,
        error: { code: 'ALREADY_RESPONDED', message: error.message }
      });
    }

    if (error instanceof OfferExpiredError) {
      return res.status(410).json({
        success: false,
        error: { code: 'OFFER_EXPIRED', message: error.message }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to decline offer'
      }
    });
  }
});

/**
 * GET /api/offers/:id
 * Get offer details (requires valid token)
 */
router.get('/:id', async (req, res) => {
  try {
    const offerId = req.params.id;
    const token = req.query.token as string;

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Access token required'
        }
      });
    }

    // Verify token
    try {
      const payload = verifyOfferToken(token);

      // Validate token is for this offer
      if (payload.offerId !== offerId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'TOKEN_MISMATCH',
            message: 'Token is not valid for this offer'
          }
        });
      }
    } catch (error: any) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: error.message
        }
      });
    }

    // Fetch offer details
    const offer = await getOfferDetails(offerId);

    res.status(200).json({
      success: true,
      data: {
        id: offer.id,
        status: offer.status,
        pdfUrl: offer.pdfUrl,
        expiresAt: offer.expiresAt,
        respondedAt: offer.respondedAt,
        candidate: {
          fullName: offer.application.candidate.fullName,
          email: offer.application.candidate.email
        },
        position: {
          title: offer.application.requisition.title,
          department: offer.application.requisition.department
        },
        compensationBand: offer.decision.compensationBand
      }
    });
  } catch (error: any) {
    logger.error({ error: error.message, offerId: req.params.id }, 'Offer retrieval failed');

    if (error instanceof OfferNotFoundError) {
      return res.status(404).json({
        success: false,
        error: { code: 'OFFER_NOT_FOUND', message: error.message }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve offer'
      }
    });
  }
});

export default router;
