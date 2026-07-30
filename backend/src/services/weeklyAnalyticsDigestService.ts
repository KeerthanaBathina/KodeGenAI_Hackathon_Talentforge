import logger from '../utils/logger';
import { getPipelineAnalytics } from './pipelineAnalyticsService';
import { getNoShowAnalytics } from './noShowAnalyticsService';
import { getLatestWeeklyActivitySignal } from '../db/weeklyActivitySignals';
import prisma from '../db/prisma';
import { UserRole } from '@prisma/client';

export interface WeeklyAnalyticsDigestPayload {
  totalApplications: number;
  shortlistRatePct: number;
  avgTimeToHireDays: number;
  offerAcceptanceRatePct: number;
  noShowRatePct: number;
  generatedAt: string;
}

export interface DigestJobData {
  requisitionId?: string;
  recipientEmail?: string;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Compose weekly analytics digest payload with all five KPIs
 * Fetches aggregated metrics from:
 * - Pipeline KPI: applications, shortlist rate, time-to-hire, offer acceptance rate
 * - No-show analytics: no-show rate
 */
export async function composeWeeklyAnalyticsDigestPayload(
  requisitionId?: string
): Promise<WeeklyAnalyticsDigestPayload> {
  const [pipelineAnalytics, noShowAnalytics] = await Promise.all([
    getPipelineAnalytics(requisitionId),
    getNoShowAnalytics(requisitionId)
  ]);

  return {
    totalApplications: pipelineAnalytics.totalApplications,
    shortlistRatePct: pipelineAnalytics.shortlistRatePct,
    avgTimeToHireDays: pipelineAnalytics.avgTimeToHireDays,
    offerAcceptanceRatePct: pipelineAnalytics.offerAcceptanceRatePct,
    noShowRatePct: noShowAnalytics.noShowRatePct,
    generatedAt: pipelineAnalytics.generatedAt
  };
}

/**
 * Check if prior week has activity for digest skip decision
 * Returns true if there was activity (send digest), false if no activity (skip digest)
 */
export async function shouldSendWeeklyDigest(): Promise<boolean> {
  try {
    const activitySignal = await getLatestWeeklyActivitySignal();

    if (!activitySignal) {
      logger.warn('[WeeklyDigestService] No activity signal found, defaulting to send digest');
      return true;
    }

    const shouldSend = activitySignal.hasActivity;

    logger.info(
      {
        weekEndingDate: activitySignal.weekEndingDate,
        applicationCount: activitySignal.applicationCountPriorWeek,
        interviewCount: activitySignal.interviewCountPriorWeek,
        hasActivity: activitySignal.hasActivity,
        shouldSend
      },
      '[WeeklyDigestService] activity signal evaluated'
    );

    return shouldSend;
  } catch (error) {
    logger.error({ error }, '[WeeklyDigestService] failed to check activity signal, defaulting to send');
    return true; // Default to sending on error to avoid silently skipping
  }
}

/**
 * Resolve recruiting manager recipients for digest
 * Returns array of user emails with role='recruiting_manager' or equivalent
 */
export async function resolveDigestRecipients(): Promise<string[]> {
  try {
    const users = await prisma.user.findMany({
      where: {
        active: true,
        role: UserRole.hr_manager
      },
      select: {
        email: true
      }
    });

    const recipients = Array.from(
      new Set(
        users
          .map((user) => normalizeEmail(user.email))
          .filter((email) => email.length > 0)
      )
    );

    logger.info(
      {
        recipientCount: recipients.length
      },
      '[WeeklyDigestService] digest recipients resolved'
    );

    return recipients;
  } catch (error) {
    logger.error({ error }, '[WeeklyDigestService] failed to resolve digest recipients');
    return [];
  }
}
