/**
 * System Status API Routes
 * 
 * Endpoints:
 * - GET /api/admin/system-status/fallback-mode - Get fallback mode state
 * - POST /api/admin/system-status/fallback-mode/enable - Manually enable fallback mode
 * - POST /api/admin/system-status/fallback-mode/disable - Manually disable fallback mode
 */

import express from 'express';
import { FallbackModeService } from '../../services/fallbackModeService';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * GET /api/admin/system-status/fallback-mode
 * 
 * Get current fallback mode state
 */
router.get('/fallback-mode', async (req, res) => {
    try {
        const state = await FallbackModeService.getFallbackModeState();
        res.json(state);
    } catch (error) {
        console.error('[SystemStatus] Failed to get fallback mode state:', error);
        res.status(500).json({ error: 'Failed to get fallback mode state' });
    }
});

/**
 * POST /api/admin/system-status/fallback-mode/enable
 * 
 * Manually enable fallback mode (admin only)
 */
router.post(
    '/fallback-mode/enable',
    authorize(['admin']),
    async (req, res) => {
        try {
            await FallbackModeService.manuallyEnableFallbackMode();
            res.json({
                success: true,
                message: 'Fallback mode manually enabled',
            });
        } catch (error) {
            console.error('[SystemStatus] Failed to enable fallback mode:', error);
            res.status(500).json({ error: 'Failed to enable fallback mode' });
        }
    }
);

/**
 * POST /api/admin/system-status/fallback-mode/disable
 * 
 * Manually disable fallback mode (admin only)
 */
router.post(
    '/fallback-mode/disable',
    authorize(['admin']),
    async (req, res) => {
        try {
            await FallbackModeService.manuallyDisableFallbackMode();
            res.json({
                success: true,
                message: 'Fallback mode manually disabled',
            });
        } catch (error) {
            console.error('[SystemStatus] Failed to disable fallback mode:', error);
            res.status(500).json({ error: 'Failed to disable fallback mode' });
        }
    }
);

export default router;
