import cron from 'node-cron';
import logger from '../utils/logger';
import {
  composeWeeklyAnalyticsDigestPayload,
  shouldSendWeeklyDigest,
  resolveDigestRecipients,
  type WeeklyAnalyticsDigestPayload
} from '../services/weeklyAnalyticsDigestService';
import { auditEvent } from '../services/auditService';
import { TemplateType } from '@prisma/client';
import { sendTemplatedEmail } from '../services/emailService';

let digestJobInFlight = false;
let lastDispatchedWindowKey: string | null = null;

const WEEKLY_DIGEST_TEMPLATE_TYPE = 'weekly_analytics_digest' as unknown as TemplateType;

function toWeekWindowKey(now: Date): string {
  const utcDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayOfWeek = utcDate.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - daysSinceMonday);

  return utcDate.toISOString().slice(0, 10);
}

function toTemplateTokens(payload: WeeklyAnalyticsDigestPayload): Record<string, string> {
  return {
    totalApplications: payload.totalApplications.toString(),
    shortlistRatePct: payload.shortlistRatePct.toString(),
    avgTimeToHireDays: payload.avgTimeToHireDays.toString(),
    offerAcceptanceRatePct: payload.offerAcceptanceRatePct.toString(),
    noShowRatePct: payload.noShowRatePct.toString(),
    generatedAt: payload.generatedAt
  };
}

/**
 * Send weekly analytics digest to recruiting managers
 * Behavior:
 * - Skips if prior week had no activity (applications + interviews = 0)
 * - Composes payload with five KPIs (pipeline metrics + no-show rate)
 * - Sends templated digest email for each recipient
 * - Logs audit event with recipient count and skip reason
 */
async function sendWeeklyAnalyticsDigest(): Promise<void> {
  if (digestJobInFlight) {
    logger.warn('[WeeklyDigestWorker] digest job skipped because previous run is still in progress');
    return;
  }

  digestJobInFlight = true;
  const jobStartedAt = new Date();
  const windowKey = toWeekWindowKey(jobStartedAt);

  try {
    logger.info('[WeeklyDigestWorker] starting weekly digest job');

    if (lastDispatchedWindowKey === windowKey) {
      logger.warn(
        {
          windowKey
        },
        '[WeeklyDigestWorker] duplicate trigger detected for weekly digest window, skipping send'
      );

      await auditEvent({
        eventType: 'weekly_digest_skipped',
        entityType: 'analytics_digest',
        entityId: 'weekly_digest',
        payload: {
          reason: 'duplicate_trigger_same_window',
          windowKey,
          timestamp: jobStartedAt.toISOString()
        }
      });

      return;
    }

    // Step 1: Check if prior week had activity
    const hasActivity = await shouldSendWeeklyDigest();

    if (!hasActivity) {
      logger.info('[WeeklyDigestWorker] No activity detected in prior week - digest skipped');

      // Log audit event for skip
      await auditEvent({
        eventType: 'weekly_digest_skipped',
        entityType: 'analytics_digest',
        entityId: 'weekly_digest',
        payload: {
          reason: 'No activity - digest skipped',
          windowKey,
          timestamp: jobStartedAt.toISOString()
        }
      });

      return;
    }

    // Step 2: Resolve recipients
    const recipients = await resolveDigestRecipients();

    if (recipients.length === 0) {
      logger.warn('[WeeklyDigestWorker] No recruiting manager recipients found - digest not sent');

      await auditEvent({
        eventType: 'weekly_digest_failed',
        entityType: 'analytics_digest',
        entityId: 'weekly_digest',
        payload: {
          reason: 'No recipients found',
          windowKey,
          timestamp: jobStartedAt.toISOString()
        }
      });

      return;
    }

    // Step 3: Compose digest payload
    const digestPayload = await composeWeeklyAnalyticsDigestPayload();

    // Mark window as dispatched before send loop to guard retries from duplicate sends.
    lastDispatchedWindowKey = windowKey;

    // Step 4: Send digest for each recipient
    let successfulRecipientCount = 0;
    const failedRecipients: string[] = [];

    for (const recipientEmail of recipients) {
      try {
        await sendTemplatedEmail(recipientEmail, WEEKLY_DIGEST_TEMPLATE_TYPE, toTemplateTokens(digestPayload), 'en');
        successfulRecipientCount += 1;
      } catch (error) {
        failedRecipients.push(recipientEmail);

        logger.error(
          { error, recipientEmail },
          '[WeeklyDigestWorker] failed to send email to recipient'
        );
      }
    }

    const durationMs = Date.now() - jobStartedAt.getTime();

    if (successfulRecipientCount === 0) {
      await auditEvent({
        eventType: 'weekly_digest_failed',
        entityType: 'analytics_digest',
        entityId: 'weekly_digest',
        payload: {
          reason: 'No emails delivered',
          windowKey,
          attemptedRecipientCount: recipients.length,
          recipientCount: 0,
          failedRecipientCount: failedRecipients.length,
          failedRecipients,
          timestamp: jobStartedAt.toISOString(),
          durationMs
        }
      });

      logger.error(
        {
          attemptedRecipientCount: recipients.length,
          failedRecipientCount: failedRecipients.length,
          windowKey,
          durationMs
        },
        '[WeeklyDigestWorker] weekly digest send failed for all recipients'
      );

      return;
    }

    // Step 5: Log audit event with success and recipient count
    await auditEvent({
      eventType: 'weekly_digest_sent',
      entityType: 'analytics_digest',
      entityId: 'weekly_digest',
      payload: {
        windowKey,
        recipientCount: successfulRecipientCount,
        attemptedRecipientCount: recipients.length,
        failedRecipientCount: failedRecipients.length,
        failedRecipients,
        payload: digestPayload,
        timestamp: jobStartedAt.toISOString(),
        durationMs
      }
    });

    logger.info(
      {
        windowKey,
        recipientCount: successfulRecipientCount,
        attemptedRecipientCount: recipients.length,
        failedRecipientCount: failedRecipients.length,
        durationMs
      },
      '[WeeklyDigestWorker] weekly digest sent successfully'
    );
  } catch (error) {
    logger.error({ error }, '[WeeklyDigestWorker] weekly digest job failed');

    // Log audit event for error
    await auditEvent({
      eventType: 'weekly_digest_failed',
      entityType: 'analytics_digest',
      entityId: 'weekly_digest',
      payload: {
        error: error instanceof Error ? error.message : String(error),
        windowKey,
        timestamp: jobStartedAt.toISOString(),
        durationMs: Date.now() - jobStartedAt.getTime()
      }
    }).catch((auditError) => {
      logger.error({ auditError }, '[WeeklyDigestWorker] failed to log audit event');
    });
  } finally {
    digestJobInFlight = false;
  }
}

export function __resetWeeklyAnalyticsDigestWorkerStateForTests(): void {
  digestJobInFlight = false;
  lastDispatchedWindowKey = null;
}

export function startWeeklyAnalyticsDigestWorker(): void {
  logger.info('[WeeklyDigestWorker] scheduling weekly analytics digest every Monday at 08:00');

  // Cron expression: 0 8 * * 1
  // Minute: 0
  // Hour: 8
  // Day of month: * (any)
  // Month: * (any)
  // Day of week: 1 (Monday)
  cron.schedule('0 8 * * 1', async () => {
    try {
      await sendWeeklyAnalyticsDigest();
    } catch (error) {
      logger.error({ error }, '[WeeklyDigestWorker] scheduled digest job failed');
    }
  });

  // Run initial digest immediately for testing (comment out in production)
  // await sendWeeklyAnalyticsDigest().catch((error) => {
  //   logger.error({ error }, '[WeeklyDigestWorker] initial digest failed');
  // });
}
