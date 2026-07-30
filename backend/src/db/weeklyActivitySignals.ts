import prisma from './prisma';

export interface WeeklyActivitySignal {
  id: string;
  weekEndingDate: Date;
  applicationCountPriorWeek: number;
  interviewCountPriorWeek: number;
  hasActivity: boolean;
  refreshedAt: Date;
  updatedAt: Date;
}

/**
 * Get weekly activity signal for a specific week
 * @param weekEndingDate - The Sunday (week-ending) date
 * @returns Activity signal or null if not found
 */
export async function getWeeklyActivitySignal(weekEndingDate: Date): Promise<WeeklyActivitySignal | null> {
  const row = await prisma.$queryRaw<WeeklyActivitySignal[]>`
    SELECT
      "id",
      "week_ending_date" AS "weekEndingDate",
      "application_count_prior_week" AS "applicationCountPriorWeek",
      "interview_count_prior_week" AS "interviewCountPriorWeek",
      "has_activity" AS "hasActivity",
      "refreshed_at" AS "refreshedAt",
      "updated_at" AS "updatedAt"
    FROM "weekly_activity_signals"
    WHERE "week_ending_date" = ${weekEndingDate}
    LIMIT 1
  `;

  if (row.length === 0) {
    return null;
  }

  const result = row[0];
  return {
    ...result,
    weekEndingDate: new Date(result.weekEndingDate),
    applicationCountPriorWeek: Number(result.applicationCountPriorWeek),
    interviewCountPriorWeek: Number(result.interviewCountPriorWeek),
    refreshedAt: new Date(result.refreshedAt),
    updatedAt: new Date(result.updatedAt)
  };
}

/**
 * Get most recent weekly activity signal
 * @returns Most recent activity signal or null if no data
 */
export async function getLatestWeeklyActivitySignal(): Promise<WeeklyActivitySignal | null> {
  const row = await prisma.$queryRaw<WeeklyActivitySignal[]>`
    SELECT
      "id",
      "week_ending_date" AS "weekEndingDate",
      "application_count_prior_week" AS "applicationCountPriorWeek",
      "interview_count_prior_week" AS "interviewCountPriorWeek",
      "has_activity" AS "hasActivity",
      "refreshed_at" AS "refreshedAt",
      "updated_at" AS "updatedAt"
    FROM "weekly_activity_signals"
    ORDER BY "week_ending_date" DESC
    LIMIT 1
  `;

  if (row.length === 0) {
    return null;
  }

  const result = row[0];
  return {
    ...result,
    weekEndingDate: new Date(result.weekEndingDate),
    applicationCountPriorWeek: Number(result.applicationCountPriorWeek),
    interviewCountPriorWeek: Number(result.interviewCountPriorWeek),
    refreshedAt: new Date(result.refreshedAt),
    updatedAt: new Date(result.updatedAt)
  };
}

/**
 * Check if prior week had any activity (used for digest skip logic)
 * @param weekEndingDate - The Sunday (week-ending) date
 * @returns True if prior week had activity, false otherwise
 */
export async function hasPriorWeekActivity(weekEndingDate: Date): Promise<boolean> {
  const signal = await getWeeklyActivitySignal(weekEndingDate);
  return signal?.hasActivity ?? false;
}

/**
 * Update or insert weekly activity signal
 * Used by refresh process to update activity counts
 * @param weekEndingDate - The Sunday (week-ending) date
 * @param applicationCount - Application count in prior week
 * @param interviewCount - Interview count in prior week
 */
export async function upsertWeeklyActivitySignal(
  weekEndingDate: Date,
  applicationCount: number,
  interviewCount: number
): Promise<WeeklyActivitySignal> {
  const hasActivity = applicationCount > 0 || interviewCount > 0;

  const result = await prisma.$queryRaw<WeeklyActivitySignal[]>`
    INSERT INTO "weekly_activity_signals" (
      "week_ending_date",
      "application_count_prior_week",
      "interview_count_prior_week",
      "has_activity",
      "refreshed_at",
      "updated_at"
    )
    VALUES (
      ${weekEndingDate},
      ${applicationCount},
      ${interviewCount},
      ${hasActivity},
      NOW(),
      NOW()
    )
    ON CONFLICT ("week_ending_date") DO UPDATE SET
      "application_count_prior_week" = EXCLUDED."application_count_prior_week",
      "interview_count_prior_week" = EXCLUDED."interview_count_prior_week",
      "has_activity" = EXCLUDED."has_activity",
      "refreshed_at" = NOW(),
      "updated_at" = NOW()
    RETURNING
      "id",
      "week_ending_date" AS "weekEndingDate",
      "application_count_prior_week" AS "applicationCountPriorWeek",
      "interview_count_prior_week" AS "interviewCountPriorWeek",
      "has_activity" AS "hasActivity",
      "refreshed_at" AS "refreshedAt",
      "updated_at" AS "updatedAt"
  `;

  const row = result[0];
  return {
    ...row,
    weekEndingDate: new Date(row.weekEndingDate),
    applicationCountPriorWeek: Number(row.applicationCountPriorWeek),
    interviewCountPriorWeek: Number(row.interviewCountPriorWeek),
    refreshedAt: new Date(row.refreshedAt),
    updatedAt: new Date(row.updatedAt)
  };
}

/**
 * Compute prior week's application and interview counts
 * Prior week is defined as: [week start, week end) of 7 days ago
 */
export async function computePriorWeekActivity(): Promise<{
  applicationCount: number;
  interviewCount: number;
}> {
  // Get the Sunday of the week 7 days ago
  const today = new Date();
  const priorWeekStart = new Date(today);
  priorWeekStart.setDate(today.getDate() - 7 - today.getDay());
  priorWeekStart.setHours(0, 0, 0, 0);

  const priorWeekEnd = new Date(priorWeekStart);
  priorWeekEnd.setDate(priorWeekStart.getDate() + 7);

  // Count applications submitted in prior week
  const appResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::BIGINT AS count
    FROM "applications"
    WHERE "submitted_at" >= ${priorWeekStart}
      AND "submitted_at" < ${priorWeekEnd}
      AND "status" <> 'draft'
  `;

  // Count interviews scheduled in prior week
  const interviewResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::BIGINT AS count
    FROM "interview_stages"
    WHERE "scheduled_at" >= ${priorWeekStart}
      AND "scheduled_at" < ${priorWeekEnd}
      AND "state" IN ('scheduled', 'completed', 'no_show')
  `;

  return {
    applicationCount: Number(appResult[0]?.count ?? 0),
    interviewCount: Number(interviewResult[0]?.count ?? 0)
  };
}

/**
 * Get last refresh timestamp for weekly activity signals
 * @returns Date of last refresh or null if never refreshed
 */
export async function getWeeklyActivitySignalsLastRefreshTimestamp(): Promise<Date | null> {
  const result = await prisma.$queryRaw<
    Array<{ last_refreshed_at: Date | null }>
  >`
    SELECT "last_refreshed_at"
    FROM "analytics_refresh_runs"
    WHERE "analytics_key" = 'weekly_activity_signals'
    LIMIT 1
  `;

  return result.length > 0 && result[0]?.last_refreshed_at ? result[0].last_refreshed_at : null;
}
