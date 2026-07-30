-- Funnel Stage Aggregation View
-- Compute canonical funnel stage counts and conversion rates with requisition filtering support

DROP MATERIALIZED VIEW IF EXISTS "funnel_stage_metrics_mv";

CREATE MATERIALIZED VIEW "funnel_stage_metrics_mv" AS
WITH stage_counts AS (
  SELECT
    a."requisition_id" AS requisition_id,
    'applications' AS stage_name,
    COUNT(*)::BIGINT AS stage_count,
    NULL::BIGINT AS prior_stage_count
  FROM "applications" a
  WHERE a."status" <> 'draft'
  GROUP BY a."requisition_id"
  
  UNION ALL
  
  SELECT
    a."requisition_id",
    'shortlisted',
    COUNT(*)::BIGINT,
    COUNT(*) OVER (PARTITION BY a."requisition_id")::BIGINT
  FROM "applications" a
  WHERE a."status" = 'shortlisted'
  GROUP BY a."requisition_id"
  
  UNION ALL
  
  SELECT
    a."requisition_id",
    'interviews_complete',
    COUNT(DISTINCT a."id")::BIGINT,
    NULL::BIGINT
  FROM "applications" a
  INNER JOIN "interview_stages" ist ON ist."application_id" = a."id"
  WHERE ist."state" = 'completed'
  GROUP BY a."requisition_id"
  
  UNION ALL
  
  SELECT
    a."requisition_id",
    'offer_extended',
    COUNT(DISTINCT a."id")::BIGINT,
    NULL::BIGINT
  FROM "applications" a
  INNER JOIN "offers" o ON o."application_id" = a."id"
  WHERE o."status" IN ('pending', 'accepted', 'declined')
  GROUP BY a."requisition_id"
  
  UNION ALL
  
  SELECT
    a."requisition_id",
    'offer_accepted',
    COUNT(DISTINCT a."id")::BIGINT,
    NULL::BIGINT
  FROM "applications" a
  INNER JOIN "offers" o ON o."application_id" = a."id"
  WHERE o."status" = 'accepted'
  GROUP BY a."requisition_id"
),
with_conversions AS (
  SELECT
    requisition_id,
    stage_name,
    stage_count,
    CASE
      WHEN stage_name = 'applications' THEN 100.0::NUMERIC(7, 2)
      WHEN LAG(stage_count) OVER (
        PARTITION BY requisition_id 
        ORDER BY 
          CASE stage_name
            WHEN 'applications' THEN 1
            WHEN 'shortlisted' THEN 2
            WHEN 'interviews_complete' THEN 3
            WHEN 'offer_extended' THEN 4
            WHEN 'offer_accepted' THEN 5
          END
      ) = 0 THEN 0.0::NUMERIC(7, 2)
      ELSE ROUND(
        (stage_count::NUMERIC * 100.0) / 
        LAG(stage_count) OVER (
          PARTITION BY requisition_id 
          ORDER BY 
            CASE stage_name
              WHEN 'applications' THEN 1
              WHEN 'shortlisted' THEN 2
              WHEN 'interviews_complete' THEN 3
              WHEN 'offer_extended' THEN 4
              WHEN 'offer_accepted' THEN 5
            END
        )::NUMERIC,
        2
      )::NUMERIC(7, 2)
    END AS conversion_rate_pct,
    LAG(stage_count) OVER (
      PARTITION BY requisition_id 
      ORDER BY 
        CASE stage_name
          WHEN 'applications' THEN 1
          WHEN 'shortlisted' THEN 2
          WHEN 'interviews_complete' THEN 3
          WHEN 'offer_extended' THEN 4
          WHEN 'offer_accepted' THEN 5
        END
    )::BIGINT - stage_count AS drop_count
  FROM stage_counts
  WHERE stage_count > 0
),
with_drop_rates AS (
  SELECT
    requisition_id,
    stage_name,
    stage_count,
    conversion_rate_pct,
    COALESCE(drop_count, 0)::BIGINT AS drop_count,
    CASE
      WHEN drop_count IS NULL OR drop_count = 0 THEN 0.0::NUMERIC(7, 2)
      ELSE ROUND(
        (drop_count::NUMERIC * 100.0) / 
        LAG(stage_count) OVER (
          PARTITION BY requisition_id 
          ORDER BY 
            CASE stage_name
              WHEN 'applications' THEN 1
              WHEN 'shortlisted' THEN 2
              WHEN 'interviews_complete' THEN 3
              WHEN 'offer_extended' THEN 4
              WHEN 'offer_accepted' THEN 5
            END
        )::NUMERIC,
        2
      )::NUMERIC(7, 2)
    END AS drop_rate_pct
  FROM with_conversions
),
with_largest_drop AS (
  SELECT
    requisition_id,
    stage_name,
    stage_count,
    conversion_rate_pct,
    drop_count,
    drop_rate_pct,
    ROW_NUMBER() OVER (PARTITION BY requisition_id ORDER BY drop_count DESC) = 1 AS is_largest_drop_transition
  FROM with_drop_rates
)
SELECT
  requisition_id,
  stage_name,
  stage_count,
  conversion_rate_pct,
  drop_count,
  drop_rate_pct,
  is_largest_drop_transition,
  NOW() AS refreshed_at
FROM with_largest_drop
ORDER BY requisition_id, stage_name;

CREATE INDEX IF NOT EXISTS "idx_funnel_stage_metrics_requisition"
  ON "funnel_stage_metrics_mv" ("requisition_id");

-- AI Confusion Matrix Aggregation View
-- Compute TP, FP, TN, FN from screening recommendation vs HR decision
-- Precision, Recall, F1 derived metrics

DROP MATERIALIZED VIEW IF EXISTS "ai_confusion_matrix_mv";

CREATE MATERIALIZED VIEW "ai_confusion_matrix_mv" AS
WITH decision_pairs AS (
  SELECT
    a."requisition_id" AS requisition_id,
    COALESCE(s."recommendation", 'manual_review') AS screening_recommendation,
    d."outcome" AS decision_outcome
  FROM "applications" a
  LEFT JOIN "screenings" s ON s."application_id" = a."id" 
    AND s."version" = (
      SELECT MAX("version") 
      FROM "screenings" 
      WHERE "application_id" = a."id"
    )
  LEFT JOIN "decisions" d ON d."application_id" = a."id"
  WHERE d."outcome" IS NOT NULL
),
confusion_counts AS (
  SELECT
    requisition_id,
    SUM(CASE 
      WHEN screening_recommendation = 'shortlist' AND decision_outcome = 'offer' THEN 1 
      ELSE 0 
    END)::BIGINT AS true_positives,
    SUM(CASE 
      WHEN screening_recommendation = 'shortlist' AND decision_outcome IN ('reject', 'hold') THEN 1 
      ELSE 0 
    END)::BIGINT AS false_positives,
    SUM(CASE 
      WHEN screening_recommendation IN ('reject', 'manual_review') AND decision_outcome IN ('reject', 'hold') THEN 1 
      ELSE 0 
    END)::BIGINT AS true_negatives,
    SUM(CASE 
      WHEN screening_recommendation IN ('reject', 'manual_review') AND decision_outcome = 'offer' THEN 1 
      ELSE 0 
    END)::BIGINT AS false_negatives
  FROM decision_pairs
  GROUP BY requisition_id
),
with_metrics AS (
  SELECT
    requisition_id,
    true_positives,
    false_positives,
    true_negatives,
    false_negatives,
    CASE
      WHEN (true_positives + false_positives) = 0 THEN 0.0::NUMERIC(7, 4)
      ELSE ROUND(
        (true_positives::NUMERIC / (true_positives::NUMERIC + false_positives::NUMERIC)),
        4
      )::NUMERIC(7, 4)
    END AS precision,
    CASE
      WHEN (true_positives + false_negatives) = 0 THEN 0.0::NUMERIC(7, 4)
      ELSE ROUND(
        (true_positives::NUMERIC / (true_positives::NUMERIC + false_negatives::NUMERIC)),
        4
      )::NUMERIC(7, 4)
    END AS recall
  FROM confusion_counts
)
SELECT
  requisition_id,
  true_positives,
  false_positives,
  true_negatives,
  false_negatives,
  precision,
  recall,
  CASE
    WHEN precision + recall = 0 THEN 0.0::NUMERIC(7, 4)
    ELSE ROUND(
      (2.0 * precision * recall) / (precision + recall),
      4
    )::NUMERIC(7, 4)
  END AS f1_score,
  NOW() AS refreshed_at
FROM with_metrics;

CREATE INDEX IF NOT EXISTS "idx_confusion_matrix_requisition"
  ON "ai_confusion_matrix_mv" ("requisition_id");

-- Global aggregates for funnel and confusion matrix (requisition_id IS NULL)
CREATE OR REPLACE VIEW "funnel_stage_metrics_global_vw" AS
SELECT
  NULL::UUID AS requisition_id,
  stage_name,
  SUM(stage_count)::BIGINT AS stage_count,
  ROUND(
    AVG(conversion_rate_pct),
    2
  )::NUMERIC(7, 2) AS avg_conversion_rate_pct,
  MAX(is_largest_drop_transition) AS has_largest_drop,
  NOW() AS refreshed_at
FROM "funnel_stage_metrics_mv"
GROUP BY stage_name;

CREATE OR REPLACE VIEW "ai_confusion_matrix_global_vw" AS
SELECT
  NULL::UUID AS requisition_id,
  SUM(true_positives)::BIGINT AS true_positives,
  SUM(false_positives)::BIGINT AS false_positives,
  SUM(true_negatives)::BIGINT AS true_negatives,
  SUM(false_negatives)::BIGINT AS false_negatives,
  ROUND(
    SUM(true_positives)::NUMERIC / 
    NULLIF(SUM(true_positives + false_positives), 0)::NUMERIC,
    4
  )::NUMERIC(7, 4) AS precision,
  ROUND(
    SUM(true_positives)::NUMERIC / 
    NULLIF(SUM(true_positives + false_negatives), 0)::NUMERIC,
    4
  )::NUMERIC(7, 4) AS recall,
  NOW() AS refreshed_at
FROM "ai_confusion_matrix_mv";

-- Add supporting indexes for analytics joins
CREATE INDEX IF NOT EXISTS "idx_screenings_application_latest"
  ON "screenings"("application_id", "version" DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS "idx_decisions_outcome"
  ON "decisions"("outcome");

CREATE INDEX IF NOT EXISTS "idx_interview_stages_state"
  ON "interview_stages"("state");

-- Ensure analytics_refresh_runs is updated for funnel/confusion sources
INSERT INTO "analytics_refresh_runs" (
  "analytics_key",
  "last_refreshed_at",
  "duration_ms",
  "status"
) VALUES
  ('funnel_stage_metrics', NOW(), 0, 'initialized'),
  ('ai_confusion_matrix', NOW(), 0, 'initialized')
ON CONFLICT ("analytics_key") DO NOTHING;
