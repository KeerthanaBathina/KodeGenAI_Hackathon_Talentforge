-- No-Show Metrics and 30-Day Trend Aggregation
-- Compute rolling 7-day no-show rates and daily 30-day trend points
-- for dashboard freshness and digest skip logic

-- Drop existing views if they exist
DROP MATERIALIZED VIEW IF EXISTS "no_show_kpi_metrics_mv";
DROP MATERIALIZED VIEW IF EXISTS "no_show_trend_30d_mv";
DROP TABLE IF EXISTS "weekly_activity_signals";

-- Table to track analytics refresh runs for no-show metrics
INSERT INTO "analytics_refresh_runs" ("analytics_key", "status", "last_refreshed_at", "duration_ms", "updated_at")
VALUES 
  ('no_show_kpi', 'initialized', NOW(), 0, NOW()),
  ('no_show_trend_30d', 'initialized', NOW(), 0, NOW()),
  ('weekly_activity_signals', 'initialized', NOW(), 0, NOW())
ON CONFLICT ("analytics_key") DO NOTHING;

-- No-Show KPI Materialized View
-- Compute rolling 7-day no-show metrics by requisition
CREATE MATERIALIZED VIEW "no_show_kpi_metrics_mv" AS
WITH rolling_7d_interviews AS (
  -- Get all scheduled and no-show interview stages from last 7 days
  SELECT
    a."requisition_id",
    ist."state",
    COUNT(*)::BIGINT AS count_by_state
  FROM "interview_stages" ist
  INNER JOIN "applications" a ON a."id" = ist."application_id"
  WHERE ist."scheduled_at" >= NOW() - INTERVAL '7 days'
    AND ist."state" IN ('scheduled', 'no_show')
  GROUP BY a."requisition_id", ist."state"
)
SELECT
  NULL::UUID AS requisition_id,
  COALESCE(SUM(CASE WHEN state = 'scheduled' THEN count_by_state ELSE 0 END), 0)::BIGINT AS scheduled_count_7d,
  COALESCE(SUM(CASE WHEN state = 'no_show' THEN count_by_state ELSE 0 END), 0)::BIGINT AS no_show_count_7d,
  CASE
    WHEN COALESCE(SUM(CASE WHEN state = 'scheduled' THEN count_by_state ELSE 0 END), 0) = 0 THEN 0.0::NUMERIC(7, 2)
    ELSE ROUND(
      (COALESCE(SUM(CASE WHEN state = 'no_show' THEN count_by_state ELSE 0 END), 0)::NUMERIC * 100.0) /
      COALESCE(SUM(CASE WHEN state = 'scheduled' THEN count_by_state ELSE 0 END), 0)::NUMERIC,
      2
    )::NUMERIC(7, 2)
  END AS no_show_rate_pct_7d,
  NOW() AS refreshed_at,
  'global'::VARCHAR AS scope
FROM rolling_7d_interviews

UNION ALL

-- Per-requisition no-show metrics
SELECT
  requisition_id,
  COALESCE(SUM(CASE WHEN state = 'scheduled' THEN count_by_state ELSE 0 END), 0)::BIGINT,
  COALESCE(SUM(CASE WHEN state = 'no_show' THEN count_by_state ELSE 0 END), 0)::BIGINT,
  CASE
    WHEN COALESCE(SUM(CASE WHEN state = 'scheduled' THEN count_by_state ELSE 0 END), 0) = 0 THEN 0.0::NUMERIC(7, 2)
    ELSE ROUND(
      (COALESCE(SUM(CASE WHEN state = 'no_show' THEN count_by_state ELSE 0 END), 0)::NUMERIC * 100.0) /
      COALESCE(SUM(CASE WHEN state = 'scheduled' THEN count_by_state ELSE 0 END), 0)::NUMERIC,
      2
    )::NUMERIC(7, 2)
  END AS no_show_rate_pct_7d,
  NOW(),
  'by_requisition'::VARCHAR
FROM rolling_7d_interviews
GROUP BY requisition_id;

-- Create index on no_show_kpi_metrics_mv for efficient lookups
CREATE INDEX "idx_no_show_kpi_requisition" ON "no_show_kpi_metrics_mv" (requisition_id);

-- 30-Day No-Show Trend Aggregation
-- Daily breakdown for last 30 calendar days
CREATE MATERIALIZED VIEW "no_show_trend_30d_mv" AS
WITH date_series AS (
  -- Generate series for last 30 calendar days
  SELECT GENERATE_SERIES(
    CURRENT_DATE - INTERVAL '29 days',
    CURRENT_DATE,
    INTERVAL '1 day'
  )::DATE AS trend_date
),
daily_interview_counts AS (
  -- Count scheduled and no-show interviews by date
  SELECT
    CAST(ist."scheduled_at" AS DATE) AS interview_date,
    ist."state",
    COUNT(*)::BIGINT AS daily_count
  FROM "interview_stages" ist
  WHERE ist."scheduled_at" >= (CURRENT_DATE - INTERVAL '29 days')
    AND ist."state" IN ('scheduled', 'no_show')
  GROUP BY CAST(ist."scheduled_at" AS DATE), ist."state"
)
SELECT
  ds.trend_date AS date,
  COALESCE(SUM(CASE WHEN daic.state = 'scheduled' THEN daic.daily_count ELSE 0 END), 0)::BIGINT AS scheduled_count,
  COALESCE(SUM(CASE WHEN daic.state = 'no_show' THEN daic.daily_count ELSE 0 END), 0)::BIGINT AS no_show_count,
  CASE
    WHEN COALESCE(SUM(CASE WHEN daic.state = 'scheduled' THEN daic.daily_count ELSE 0 END), 0) = 0 THEN 0.0::NUMERIC(7, 2)
    ELSE ROUND(
      (COALESCE(SUM(CASE WHEN daic.state = 'no_show' THEN daic.daily_count ELSE 0 END), 0)::NUMERIC * 100.0) /
      COALESCE(SUM(CASE WHEN daic.state = 'scheduled' THEN daic.daily_count ELSE 0 END), 0)::NUMERIC,
      2
    )::NUMERIC(7, 2)
  END AS no_show_rate_pct,
  NOW() AS refreshed_at
FROM date_series ds
LEFT JOIN daily_interview_counts daic ON daic.interview_date = ds.trend_date
GROUP BY ds.trend_date
ORDER BY ds.trend_date DESC;

-- Create index on trend date for efficient time-series queries
CREATE INDEX "idx_no_show_trend_date" ON "no_show_trend_30d_mv" (date);

-- Weekly Activity Signals Table (for digest skip logic)
-- Tracks prior week application and interview activity
CREATE TABLE "weekly_activity_signals" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "week_ending_date" DATE NOT NULL,
  "application_count_prior_week" BIGINT NOT NULL DEFAULT 0,
  "interview_count_prior_week" BIGINT NOT NULL DEFAULT 0,
  "has_activity" BOOLEAN NOT NULL DEFAULT false,
  "refreshed_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE("week_ending_date")
);

-- Create index on week ending date for efficient lookups
CREATE INDEX "idx_weekly_activity_signals_week_ending" ON "weekly_activity_signals" (week_ending_date);

-- Supporting indexes for no-show queries
CREATE INDEX "idx_interview_stages_scheduled_at_state" 
  ON "interview_stages" (scheduled_at DESC, state)
  WHERE state IN ('scheduled', 'no_show');

CREATE INDEX "idx_interview_stages_app_id_state_scheduled"
  ON "interview_stages" (application_id, state, scheduled_at)
  WHERE state IN ('scheduled', 'no_show', 'completed', 'cancelled');

-- Composite index for applications requisition lookup
CREATE INDEX "idx_applications_requisition_submitted_at"
  ON "applications" (requisition_id, submitted_at DESC)
  WHERE status <> 'draft';
