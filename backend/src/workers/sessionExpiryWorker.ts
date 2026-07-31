/**
 * Session Expiry Worker
 * 
 * Monitors session timers and expires stale sessions
 * Runs as a cron job every 1 minute
 * 
 * Checks:
 * - Reconnect window (10 minutes since last heartbeat)
 * - Time limit reached (assessment duration exceeded)
 * 
 * Actions:
 * - Expires sessions exceeding reconnect window
 * - Creates audit events for expired sessions
 * - Cleans up Redis keys for expired sessions
 */

import cron from 'node-cron';
import logger from '../utils/logger';
import { 
    getActiveSessionIds, 
    checkReconnectWindow 
} from '../services/sessionTimerService';

const SESSION_EXPIRY_WORKER_ENABLED =
    process.env.ENABLE_REDIS_QUEUES === 'true' || process.env.NODE_ENV !== 'development';

/**
 * Statistics for monitoring
 */
interface ExpiryStats {
    checked: number;
    expired: number;
    errors: number;
}

/**
 * Check all active sessions for expiry
 */
async function checkSessionExpiry(): Promise<ExpiryStats> {
    const stats: ExpiryStats = {
        checked: 0,
        expired: 0,
        errors: 0
    };

    try {
        const sessionIds = await getActiveSessionIds();
        stats.checked = sessionIds.length;

        if (sessionIds.length === 0) {
            return stats;
        }

        logger.debug({
            activeSessionCount: sessionIds.length
        }, 'Checking session timers for expiry');

        // Check each session
        for (const sessionId of sessionIds) {
            try {
                const result = await checkReconnectWindow(sessionId);
                
                if (result.isExpired) {
                    stats.expired++;
                    logger.info({
                        sessionId,
                        remainingMinutes: result.remainingMinutes
                    }, 'Session expired by background job');
                }
            } catch (error) {
                stats.errors++;
                logger.error({
                    error,
                    sessionId
                }, 'Error checking session expiry');
            }
        }

        if (stats.expired > 0 || stats.errors > 0) {
            logger.info({
                ...stats
            }, 'Session expiry check completed');
        }
    } catch (error) {
        logger.error({
            error
        }, 'Session expiry job failed');
        stats.errors++;
    }

    return stats;
}

/**
 * Start session expiry monitoring cron job
 */
export function startSessionExpiryWorker(): void {
    if (!SESSION_EXPIRY_WORKER_ENABLED) {
        logger.warn('Session expiry worker disabled in development (set ENABLE_REDIS_QUEUES=true to enable)');
        return;
    }

    logger.info('Starting session expiry monitoring (every 1 minute)');

    // Run every minute
    cron.schedule('* * * * *', async () => {
        await checkSessionExpiry();
    });

    // Run initial check after 10 seconds (allow server to fully start)
    setTimeout(() => {
        checkSessionExpiry().catch((error) => {
            logger.error({
                error
            }, 'Initial session expiry check failed');
        });
    }, 10000);
}

export const SessionExpiryWorker = {
    startSessionExpiryWorker,
    checkSessionExpiry
};
