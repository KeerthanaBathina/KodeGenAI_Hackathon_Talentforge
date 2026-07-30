---
id: TASK-002
user_story: US-003
title: "Backend - No-Show Analytics API and Weekly Digest Job"
status: done
priority: medium
assigned_to: backend-team
estimated_hours: 7
layer: backend
dependencies: [TASK-001]
---

# TASK-002 - Backend - No-Show Analytics API and Weekly Digest Job

## Objective

Implement backend services and scheduling to expose no-show analytics data and send weekly KPI digest emails every Monday at 08:00.


Create:
- analytics endpoint(s) for no-show summary and trend
- BullMQ cron job for weekly digest
- skip-if-no-activity behavior
- audit logging for digest execution and recipient counts

## Technical Requirements

Endpoint(s):
- `GET /api/analytics/no-show`

Response:
- `noShowRatePct`
- `noShowCount`
- `scheduledCount`
- `trend30d[]`
- `generatedAt` and freshness metadata

### 2. Weekly Digest Service
Create service that composes prior-week KPI payload:
- applications
- shortlist rate
- time-to-hire
- no-show rate
- offer acceptance rate

Use existing email delivery infrastructure and template key `weekly_analytics_digest`.

### 3. BullMQ Cron Job

Schedule:
- `0 8 * * 1` (Monday 08:00 platform timezone)

Behavior:
- resolve recruiting-manager recipients
- skip send when prior-week activity is zero
- log "No activity - digest skipped" message

### 4. Observability and Audit

- write digest run event to `audit_events`
- include recipient count, skip reason, and run timestamp
- structured error handling and retries

## Acceptance Criteria

- [ ] No-show API returns accurate KPI and 30-day trend payload
- [ ] Digest job executes every Monday 08:00
- [ ] Digest includes all five required KPIs
- [ ] Job skips email on no-activity week and logs reason
- [ ] Audit log captures run metadata and recipient count

## Testing Requirements

- [ ] Integration tests for analytics endpoint payload
- [ ] Unit tests for digest payload composition
- [ ] Scheduler tests for cron expression and skip/send branches

## Files to Create/Modify

- `backend/src/routes/analytics.ts` (or equivalent)
- `backend/src/services/noShowAnalyticsService.ts`
- `backend/src/services/weeklyAnalyticsDigestService.ts`
- `backend/src/workers/*weekly-analytics-digest*.ts`
- `backend/src/**/__tests__/*digest*.test.ts`

## Dependencies

- TASK-001 aggregation and activity signal
- EP-008 / US-002 email infrastructure

## Notes

- Ensure idempotent digest behavior for duplicate worker triggers.
