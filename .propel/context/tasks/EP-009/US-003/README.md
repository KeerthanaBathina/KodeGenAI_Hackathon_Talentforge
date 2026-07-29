# US-003 Implementation Tasks

## Overview

This directory contains implementation tasks for User Story US-003: Platform Health Dashboard — BullMQ Queue Depth, AI Worker Status, and Email Rate with 60-second auto-refresh.

## Task Breakdown

### TASK-001: Backend - Health Metrics Collection Service

**Status:** Todo  
**Estimated Hours:** 6  
**Layer:** Backend  
**Dependencies:** None

Implement service layer to collect real-time health metrics from BullMQ queues (active, waiting, failed, delayed counts), worker heartbeats with status logic (online/degraded/offline), and email delivery success rates from Communication table.

### TASK-002: Backend - Health Dashboard REST API Endpoint

**Status:** Todo  
**Estimated Hours:** 3  
**Layer:** Backend  
**Dependencies:** TASK-001

Create admin-only REST API endpoint `/api/admin/health` that returns comprehensive health metrics in JSON format with performance metadata. Includes detail endpoints for specific queues and failed email DLQ viewer.

### TASK-003: Frontend - Health Dashboard UI with Auto-Refresh

**Status:** Todo  
**Estimated Hours:** 10  
**Layer:** Frontend  
**Dependencies:** TASK-001, TASK-002

Build Next.js dashboard page at `/admin/health` displaying worker status cards, queue metrics table, and email delivery stats with automatic 60-second refresh without full page reload. Includes toggle for auto-refresh control.

### TASK-004: Testing - Comprehensive Health Dashboard Tests

**Status:** Todo  
**Estimated Hours:** 6  
**Layer:** Testing  
**Dependencies:** TASK-001, TASK-002, TASK-003

Comprehensive test coverage including backend unit tests, API integration tests, frontend component tests, and E2E tests with focus on auto-refresh behavior, data accuracy, and worker status thresholds.

## Total Effort Estimate

**Total Hours:** 25 hours  
**Sprint Capacity:** Approximately 1-2 sprints for full implementation

## Implementation Order

1. TASK-001 (Health Metrics Service) - Core data collection logic
2. TASK-002 (API Endpoint) - Expose metrics via REST API
3. TASK-003 (Frontend Dashboard UI) - User interface with auto-refresh
4. TASK-004 (Testing) - Continuous throughout, finalize after all tasks

## Acceptance Criteria Mapping

| Acceptance Criteria                                    | Primary Task       | Supporting Tasks |
| ------------------------------------------------------ | ------------------ | ---------------- |
| AC1: Dashboard shows current queue depths              | TASK-001, TASK-003 | TASK-002         |
| AC2: AI worker offline shown in amber                  | TASK-001, TASK-003 | -                |
| AC3: Email delivery rate displayed                     | TASK-001, TASK-003 | TASK-002         |
| AC4: Dashboard auto-refreshes without full page reload | TASK-003           | -                |

## Technical Stack

- **Backend:** Node.js, Express, TypeScript, BullMQ, Redis
- **Frontend:** Next.js 14, React, TypeScript, Tailwind CSS
- **Database:** PostgreSQL (Prisma)
- **Testing:** Vitest, Playwright, @testing-library/react

## Key Files to Create/Modify

### Backend

- `src/services/healthMetricsService.ts` (new)
- `src/constants/workerHeartbeats.ts` (new)
- `src/routes/admin/health.ts` (new)
- `src/routes/admin/index.ts` (update - register health routes)
- `src/workers/screeningWorker.ts` (update - add heartbeats)
- `src/workers/emailDeliveryWorker.ts` (update - add heartbeats)
- `src/workers/offerWorker.ts` (update - add heartbeats)

### Frontend

- `src/app/admin/health/page.tsx` (new)
- `src/components/admin/WorkerHealthSection.tsx` (new)
- `src/components/admin/QueueMetricsSection.tsx` (new)
- `src/components/admin/EmailDeliverySection.tsx` (new)

### Tests

- Backend unit tests for healthMetricsService
- Backend integration tests for health API endpoints
- Frontend component tests for all dashboard sections
- E2E tests for auto-refresh behavior and data accuracy

## Definition of Done

- [ ] All tasks completed (TASK-001 through TASK-004)
- [ ] All acceptance criteria verified
- [ ] Code reviewed and approved
- [ ] Tests passing with minimum 85% coverage
- [ ] Health dashboard accessible at `/admin/health` (admin-only)
- [ ] Auto-refresh working correctly (60-second interval)
- [ ] Worker status thresholds validated (online < 2 min, degraded 2-5 min, offline > 5 min)
- [ ] Email delivery rate accurately calculated from Communication table
- [ ] No full page reload during auto-refresh
- [ ] Documentation updated
- [ ] Deployed to staging environment
- [ ] User acceptance testing completed
- [ ] No blocking bugs
- [ ] Performance benchmarks met (<200ms for health check, <500ms API response)

## Critical Success Factors

### 1. Worker Status Logic

**Critical:** Worker status thresholds must be accurate for operational alerts.

**Thresholds:**

- **Online:** < 2 minutes since last heartbeat
- **Degraded (Amber):** 2-5 minutes since last heartbeat
- **Offline:** > 5 minutes since last heartbeat

**Verification:**

- Test with simulated heartbeat delays
- Verify color coding matches status (green/amber/red)
- Validate "Last heartbeat: X min ago" display

### 2. Auto-Refresh Behavior

**Critical:** Dashboard must refresh without disrupting user workflow.

**Requirements:**

- Refresh every 60 seconds (configurable constant)
- No full page reload (React state update only)
- "Last updated" timestamp shown
- Toggle to disable auto-refresh
- Manual "Refresh Now" button available

**Verification:**

- E2E test confirms 60-second refresh
- Verify no URL changes during refresh
- Test manual refresh button
- Test auto-refresh toggle

### 3. Data Accuracy

**Critical:** Metrics must reflect real-time system state accurately.

**Requirements:**

- Queue metrics from BullMQ API (not cached)
- Worker heartbeats from Redis
- Email delivery rate from Communication table (last 60 minutes)
- All queries run in parallel for performance

**Verification:**

- Compare dashboard data with direct database queries
- Test edge cases (empty queues, no heartbeat, 100% failure rate)
- Verify completed job count only includes last 60 minutes

### 4. Performance

**Critical:** Health check must not impact system performance.

**Requirements:**

- Health metrics collection: < 200ms
- API response time: < 500ms
- Optional caching with 10-second TTL

**Verification:**

- Performance tests measure collection time
- Integration tests verify API response time
- Load test with multiple concurrent requests

## Architecture Highlights

### Health Metrics Collection Flow

```
┌─────────────────┐
│  Admin User     │
└────────┬────────┘
         │ GET /api/admin/health
         ↓
┌─────────────────────────────────┐
│  Health API Endpoint            │
│  (authenticate + requireAdmin)  │
└────────┬────────────────────────┘
         │
         ↓
┌─────────────────────────────────┐
│  healthMetricsService           │
│  • getAllQueueMetrics()         │
│  • getAllWorkerHealth()         │
│  • getEmailDeliveryMetrics()    │
└──┬────┬────┬────────────────────┘
   │    │    │
   │    │    └──→ Prisma (Communication table)
   │    └───────→ Redis (worker heartbeats)
   └────────────→ BullMQ Queues (job counts)
```

### Frontend Auto-Refresh

```typescript
useEffect(() => {
  if (!autoRefresh) return;

  const intervalId = setInterval(() => {
    fetchHealthData(); // Updates React state
  }, 60000);

  return () => clearInterval(intervalId);
}, [autoRefresh]);
```

## Operational Considerations

### 1. Worker Heartbeat Management

- All workers must call `updateWorkerHeartbeat()` during job processing
- Heartbeats expire after 10 minutes (TTL in Redis)
- Centralized constants for heartbeat keys

### 2. Email Delivery Tracking

- Uses existing Communication table
- Queries last 60 minutes only
- Failed emails limited to 100 most recent for DLQ viewer

### 3. Queue Depth Monitoring

- Monitors all BullMQ queues: screening, email-delivery, resume-parse, offer, interview-reminder
- Visual indicators for high failed counts (red) and high waiting counts (yellow)
- Link to queue detail page for debugging

### 4. Admin Access Control

- All health endpoints require admin role
- Prevents sensitive operational data exposure
- Authentication via JWT token

## Performance Targets

- **Health metrics collection:** <200ms
- **API response time:** <500ms
- **Dashboard initial load:** <1s
- **Auto-refresh impact:** minimal (background fetch)
- **Database query count:** optimized with parallel execution

## Security Considerations

- Admin-only access enforced at route level
- No sensitive data in health metrics (no PII, credentials)
- Rate limiting on health endpoints (optional)
- Audit log health dashboard access (optional)

## Future Enhancements

- **WebSocket push updates** instead of polling (reduce latency)
- **Sound/desktop notifications** for critical issues
- **Historical trends** (queue depth over time, charts)
- **Configurable alert thresholds** (email when failed jobs > X)
- **Queue detail page** (/admin/health/queue/:name with job details)
- **Failed email retry** from DLQ viewer
- **Worker restart controls** from dashboard
- **System resource monitoring** (CPU, memory, disk)
- **API error rate tracking** (requires request logging middleware)
- **Export health report** to CSV/PDF

## Related Documentation

- US-003 User Story: [us_003.md](../us_003.md)
- System Health Worker: `backend/src/workers/systemHealthWorker.ts`
- BullMQ Documentation: https://docs.bullmq.io
- Communication Schema: `backend/prisma/schema.prisma`

## Monitoring Integration

Consider integrating with existing monitoring tools:

- **Grafana:** Dashboard visualization
- **Prometheus:** Metrics collection
- **PagerDuty:** Alert escalation
- **Slack:** Webhook notifications

## Risks and Mitigation

| Risk                       | Impact                     | Mitigation                                                        |
| -------------------------- | -------------------------- | ----------------------------------------------------------------- |
| Redis connection failure   | High - No heartbeat data   | Graceful degradation, show "offline" status                       |
| BullMQ API slow response   | Medium - Dashboard timeout | Parallel queries, 500ms timeout, cached response                  |
| Database query performance | Medium - Slow dashboard    | Optimize Communication table indexes, limit query scope to 60 min |
| Auto-refresh memory leak   | Low - Browser slowdown     | Cleanup interval on unmount, test for memory leaks                |
| Worker heartbeat gaps      | Medium - False alarms      | TTL handling, degraded status before offline                      |

## Testing Strategy

### Unit Tests

- Health metrics service functions (mocked dependencies)
- Worker status calculation logic
- Email delivery rate calculation
- Queue metrics aggregation

### Integration Tests

- API endpoints with authentication
- Database queries with real data
- Failed email pagination
- Queue detail retrieval

### E2E Tests

- Auto-refresh behavior (60-second interval)
- Manual refresh button
- Auto-refresh toggle
- Worker status visual indicators
- Failed emails expandable section
- Queue detail navigation

### Performance Tests

- Health check collection time
- API response time under load
- Concurrent request handling
- Memory usage during long sessions

## Notes

- Reuses existing worker heartbeat infrastructure from systemHealthWorker.ts
- Communication table already tracks email delivery status
- BullMQ provides built-in job count methods
- Auto-refresh interval configurable via constant (currently 60s)
- Worker status thresholds match US-003 acceptance criteria (2 min amber threshold)
- Dashboard provides operational visibility without remediation features
- Failed email DLQ viewer supports debugging delivery issues
- Performance optimization critical due to polling frequency
