# US-003 Task Planning Summary

## Overview

**User Story**: US-003 — Assessment Session Timer, Reconnect Handling, and Provider Configuration  
**Epic**: EP-006 — Assessment Integration  
**Total Story Points**: 5  
**Total Effort**: 17 hours across 5 tasks  
**Created**: 2026-07-27

---

## Task Breakdown

| Task ID | Title | Layer | Effort | Priority | Dependencies |
|---------|-------|-------|--------|----------|--------------|
| TASK-001 | Server-Side Session Timer with Redis Storage | Backend | 4h | Critical | None (requires Redis setup) |
| TASK-002 | Session Timer API Endpoints | Backend | 3h | High | TASK-001 |
| TASK-003 | Frontend Timer Component with Server Sync | Frontend | 4h | High | TASK-002 |
| TASK-004 | Assessment Provider Configuration CRUD API | Backend | 3h | Medium | None (independent) |
| TASK-005 | Session Timer Integration Testing and Validation | Test | 3h | High | TASK-001, TASK-002, TASK-003, TASK-004 |

**Total Effort**: 17 hours

---

## Implementation Sequence

### Phase 1: Backend Foundation (Day 1)
**Duration**: 7 hours

1. **TASK-001**: Server-Side Session Timer with Redis Storage (4h)
   - Set up Redis client and connection
   - Implement session timer service (start, get, update, expire)
   - Add reconnect window logic (10-minute timeout)
   - Create background expiry job
   - **Deliverable**: Redis-backed timer service with reconnect handling

2. **TASK-002**: Session Timer API Endpoints (3h)
   - Implement GET `/api/sessions/:sessionId/timer`
   - Implement POST `/api/sessions/:sessionId/heartbeat`
   - Add authentication and rate limiting
   - **Deliverable**: REST API for timer operations

### Phase 2: Frontend & Admin Features (Day 2)
**Duration**: 7 hours

3. **TASK-003**: Frontend Timer Component with Server Sync (4h)
   - Create React AssessmentTimer component
   - Implement countdown with server sync
   - Add reconnect detection and heartbeat mechanism
   - Build expiry modal and accessibility features
   - **Deliverable**: Production-ready timer component

4. **TASK-004**: Assessment Provider Configuration CRUD API (3h)
   - Create Zod validation schemas
   - Implement provider CRUD service and endpoints
   - Add role-based access control and secret encryption
   - **Deliverable**: Admin API for provider management

### Phase 3: Testing & Validation (Day 3)
**Duration**: 3 hours

5. **TASK-005**: Session Timer Integration Testing and Validation (3h)
   - Unit tests for timer service and API endpoints
   - Scenario-based integration tests (all 4 scenarios)
   - Frontend component tests
   - Load testing (100 concurrent sessions)
   - **Deliverable**: Comprehensive test suite with 90%+ coverage

---

## Task Dependencies Graph

```
TASK-001 (Server-Side Timer)
    ↓
TASK-002 (Timer API)
    ↓
TASK-003 (Frontend Component)
    ↓
    ↓ ←──────── TASK-004 (Provider CRUD) [Independent]
    ↓                      ↓
    └──────────→ TASK-005 (Testing) ←─────┘
```

**Critical Path**: TASK-001 → TASK-002 → TASK-003 → TASK-005 (14h)  
**Parallel Work**: TASK-004 can be developed concurrently with TASK-001/TASK-002

---

## Acceptance Criteria Coverage

| Scenario | Covered By | Test Cases |
|----------|------------|------------|
| **Scenario 1**: Timer persists across page reload | TASK-001, TASK-002, TASK-003 | 12 tests |
| **Scenario 2**: Reconnect within 10 minutes resumes session | TASK-001, TASK-002, TASK-003 | 8 tests |
| **Scenario 3**: Session expires after 10-minute timeout | TASK-001, TASK-002, TASK-003 | 6 tests |
| **Scenario 4**: Provider added without code deployment | TASK-004 | 15 tests |

**Total Test Coverage**: ~106 automated tests

---

## Definition of Done Mapping

| DoD Item | Implemented By |
|----------|----------------|
| Session remaining time stored in Redis | TASK-001 |
| Timer component reads from server on page load/reconnect | TASK-003 |
| 10-minute reconnect window enforced | TASK-001, TASK-002 |
| `assessment_providers` admin CRUD | TASK-004 |
| Session expiry events logged to `audit_events` | TASK-001 |
| Unit tests cover timer drift ≤ 1 second | TASK-005 |

---

## Risk Assessment

| Risk | Impact | Mitigation | Task |
|------|--------|------------|------|
| Redis connection failures | High | Connection pooling, retry logic, fallback to DB | TASK-001 |
| Clock drift accumulation | Medium | Periodic server sync (every 5 min), ≤1s tolerance | TASK-001, TASK-003 |
| Heartbeat rate limit abuse | Low | 1 request per 10 seconds, exponential backoff | TASK-002 |
| HMAC secret exposure | High | Encryption at rest, redaction in responses | TASK-004 |
| Concurrent session handling | Medium | Load testing, Redis connection pool tuning | TASK-005 |

---

## Technical Stack

### Backend
- **Runtime**: Node.js 20 + TypeScript
- **Framework**: Express.js 4.21
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis 7+ with ioredis client
- **Validation**: Zod schemas
- **Testing**: Vitest

### Frontend
- **Framework**: React 18+ with TypeScript
- **State Management**: React hooks
- **API Client**: Fetch API with AbortController
- **Testing**: React Testing Library + Vitest
- **Mocking**: MSW (Mock Service Worker)

### Infrastructure
- **Redis**: Docker container (dev), managed service (prod)
- **Background Jobs**: node-cron for session expiry checks
- **Monitoring**: Correlation IDs, structured logging

---

## Success Metrics

| Metric | Target | Validation Method |
|--------|--------|-------------------|
| Timer accuracy | ≤ 1 second drift over 60 minutes | Automated test (TASK-005) |
| API response time | p95 < 100ms | Load testing (TASK-005) |
| Concurrent sessions | 100+ without degradation | Load testing (TASK-005) |
| Code coverage | ≥ 90% for timer modules | Coverage report (TASK-005) |
| Reconnect recovery | 100% success within 10-minute window | Integration test (TASK-005) |
| Zero data manipulation | No client-side timer tampering possible | Security review (manual) |

---

## Implementation Notes

### Redis Key Structure
```
session:timer:{sessionId} → { startTime, durationMinutes, lastHeartbeat, status }
```

### API Endpoints
```
GET    /api/sessions/:sessionId/timer      - Get remaining time
POST   /api/sessions/:sessionId/heartbeat  - Update heartbeat
GET    /api/admin/assessment-providers     - List providers
POST   /api/admin/assessment-providers     - Create provider
GET    /api/admin/assessment-providers/:id - Get provider
PATCH  /api/admin/assessment-providers/:id - Update provider
DELETE /api/admin/assessment-providers/:id - Soft delete provider
```

### Environment Variables Required
```
REDIS_URL=redis://localhost:6379
ENCRYPTION_KEY=<32-byte-hex-string>  # For HMAC secret encryption
DATABASE_URL=postgresql://...
```

---

## Rollout Plan

### Development (Week 1)
- Day 1: TASK-001, TASK-002 (backend foundation)
- Day 2: TASK-003, TASK-004 (frontend and admin features)
- Day 3: TASK-005 (testing and validation)

### Staging (Week 2)
- Deploy to staging environment
- Manual QA testing (reconnect scenarios, timer accuracy)
- Load testing with 100+ concurrent sessions
- Security review (HMAC secret handling, RBAC)

### Production (Week 3)
- Gradual rollout: 10% → 50% → 100% of sessions
- Monitor Redis performance and connection pool
- Track timer drift metrics via application logs
- Collect user feedback on timer visibility and reconnect UX

---

## Future Enhancements (Out of Scope)

- WebSocket-based real-time timer sync (instead of polling)
- Timer pause/resume functionality (for permitted breaks)
- Multi-region Redis replication for global availability
- Timer adjustment API (for special accommodations)
- Provider-specific timer rules (e.g., HackerRank allows 2-hour sessions)

---

## Questions for Stakeholders

1. **Redis Infrastructure**: Do we use AWS ElastiCache, Azure Cache for Redis, or self-hosted?
2. **Admin Access**: Which user roles should have provider CRUD permissions?
3. **Timer Display**: Should timer be hideable (some candidates find it stressful)?
4. **Reconnect UX**: Should we show "Reconnecting..." immediately or after 5 seconds?
5. **Expiry Notification**: Should we email HR when a session expires due to timeout?

---

## Sign-Off

**Task Breakdown Created**: 2026-07-27  
**Total Tasks**: 5  
**Total Effort**: 17 hours  
**Story Points**: 5 (confirmed based on task breakdown)  
**Ready for Implementation**: ✅ Yes

**Dependencies Verified**:
- ✅ Redis infrastructure available
- ✅ US-001 session creation complete
- ✅ Audit events table exists
- ✅ Frontend routing and session management ready
