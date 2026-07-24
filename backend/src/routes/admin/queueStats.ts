import { Router } from 'express';
import { getQueueHealth } from '../../queues/resumeParseQueue';
import { getScreeningQueueHealth } from '../../queues/screeningQueue';
import { authenticate } from '../../middleware/authenticate';
import logger from '../../utils/logger';

const router = Router();

/**
 * GET /api/admin/queue-stats
 * Get queue statistics and health status
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const [parseStats, screeningStats] = await Promise.all([
            getQueueHealth(),
            getScreeningQueueHealth(),
        ]);

        res.json({
            resumeParse: parseStats,
            screening: screeningStats,
            overallHealthy: parseStats.healthy && screeningStats.healthy,
        });
    } catch (error) {
        logger.error('Failed to fetch queue stats', { error });
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch queue stats',
            },
        });
    }
});

export default router;
