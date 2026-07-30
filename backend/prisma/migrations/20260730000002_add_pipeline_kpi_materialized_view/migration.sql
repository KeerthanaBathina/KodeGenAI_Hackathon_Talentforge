-- Analytics refresh metadata table
CREATE TABLE IF NOT EXISTS "analytics_refresh_runs" (
  "analytics_key" TEXT PRIMARY KEY,
  "last_refreshed_at" TIMESTAMPTZ NOT NULL,
  "duration_ms" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "error_message" TEXT,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Supporting indexes for KPI aggregation and requisition filtering.
CREATE INDEX IF NOT EXISTS "idx_applications_requisition_submitted_at"
  ON "applications"("requisition_id", "submitted_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_offers_application_status_responded_at"
  ON "offers"("application_id", "status", "responded_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_decisions_application_decided_at"
  ON "decisions"("application_id", "decided_at" DESC);

DROP MATERIALIZED VIEW IF EXISTS "pipeline_kpi_metrics_mv";

CREATE MATERIALIZED VIEW "pipeline_kpi_metrics_mv" AS
WITH per_requisition AS (
  SELECT
    a."requisition_id" AS requisition_id,
    COUNT(*) FILTER (WHERE a."status" <> 'draft')::BIGINT AS total_applications,
    COUNT(*) FILTER (
      WHERE a."status" IN (
        'shortlisted',
        'interviewing',
        'offer_pending',
        'offered',
        'hired',
        'closed'
      )
    )::BIGINT AS shortlisted_count,
    COUNT(o."id")::BIGINT AS offers_extended,
    COUNT(o."id") FILTER (WHERE o."status" = 'accepted')::BIGINT AS offers_accepted,
    COUNT(*) FILTER (
      WHERE o."status" = 'accepted'
        AND a."status" NOT IN ('draft', 'withdrawn')
        AND o."responded_at" IS NOT NULL
    )::BIGINT AS time_to_hire_count,
    COALESCE(
      SUM(
        EXTRACT(EPOCH FROM (o."responded_at" - a."submitted_at")) / 86400.0
      ) FILTER (
        WHERE o."status" = 'accepted'
          AND a."status" NOT IN ('draft', 'withdrawn')
          AND o."responded_at" IS NOT NULL
      ),
      0
    )::DOUBLE PRECISION AS time_to_hire_days_sum
  FROM "applications" a
  LEFT JOIN "offers" o ON o."application_id" = a."id"
  GROUP BY a."requisition_id"
),
all_scopes AS (
  SELECT
    requisition_id,
    total_applications,
    shortlisted_count,
    offers_extended,
    offers_accepted,
    time_to_hire_count,
    time_to_hire_days_sum
  FROM per_requisition
  UNION ALL
  SELECT
    NULL::UUID AS requisition_id,
    COALESCE(SUM(total_applications), 0)::BIGINT,
    COALESCE(SUM(shortlisted_count), 0)::BIGINT,
    COALESCE(SUM(offers_extended), 0)::BIGINT,
    COALESCE(SUM(offers_accepted), 0)::BIGINT,
    COALESCE(SUM(time_to_hire_count), 0)::BIGINT,
    COALESCE(SUM(time_to_hire_days_sum), 0)::DOUBLE PRECISION
  FROM per_requisition
)
SELECT
  requisition_id,
  total_applications,
  shortlisted_count,
  CASE
    WHEN total_applications = 0 THEN 0::NUMERIC(7, 2)
    ELSE ROUND((shortlisted_count::NUMERIC * 100.0) / total_applications::NUMERIC, 2)::NUMERIC(7, 2)
  END AS shortlist_rate_pct,
  offers_extended,
  offers_accepted,
  CASE
    WHEN offers_extended = 0 THEN 0::NUMERIC(7, 2)
    ELSE ROUND((offers_accepted::NUMERIC * 100.0) / offers_extended::NUMERIC, 2)::NUMERIC(7, 2)
  END AS offer_acceptance_rate_pct,
  time_to_hire_count,
  CASE
    WHEN time_to_hire_count = 0 THEN 0::NUMERIC(10, 2)
    ELSE ROUND((time_to_hire_days_sum::NUMERIC / time_to_hire_count::NUMERIC), 2)::NUMERIC(10, 2)
  END AS avg_time_to_hire_days,
  NOW() AS refreshed_at
FROM all_scopes;

CREATE INDEX IF NOT EXISTS "idx_pipeline_kpi_metrics_requisition_id"
  ON "pipeline_kpi_metrics_mv"("requisition_id");

CREATE INDEX IF NOT EXISTS "idx_pipeline_kpi_metrics_refreshed_at"
  ON "pipeline_kpi_metrics_mv"("refreshed_at" DESC);

INSERT INTO "analytics_refresh_runs" ("analytics_key", "last_refreshed_at", "duration_ms", "status", "error_message", "updated_at")
VALUES ('pipeline_kpi', NOW(), 0, 'initialized', NULL, NOW())
ON CONFLICT ("analytics_key") DO UPDATE SET
  "last_refreshed_at" = EXCLUDED."last_refreshed_at",
  "duration_ms" = EXCLUDED."duration_ms",
  "status" = EXCLUDED."status",
  "error_message" = EXCLUDED."error_message",
  "updated_at" = NOW();
