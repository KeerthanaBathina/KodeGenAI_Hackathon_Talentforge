# US-004 Implementation Task Summary

**User Story**: Offer Letter Generation, Candidate Response Tracking, and Auto-Expiry  
**Epic**: EP-007 — Final Hiring Decision  
**Status**: Planned  
**Created**: 2026-07-27  
**Total Effort**: 19 hours

---

## Task Breakdown

### TASK-001: Offer Letter Template Processing and PDF Generation Service
**Layer**: Backend  
**Effort**: 6 hours  
**Priority**: Critical

**Deliverables**:
- Database schema: Offer model with status tracking
- Template resolution service (Handlebars)
- PDF generation service (Puppeteer)
- Supabase Storage integration
- Offer orchestration service
- Unit tests (8+ tests)

**Key Components**:
- `backend/src/services/offerTemplateService.ts`
- `backend/src/services/offerPdfService.ts`
- `backend/src/services/offerOrchestrator.ts`
- Database migration for Offer model

**Dependencies**: US-003 (approval chain completion)

---

### TASK-002: Offer Response API Endpoints - Accept and Decline
**Layer**: Backend  
**Effort**: 4 hours  
**Priority**: Critical

**Deliverables**:
- Offer response service (accept/decline)
- Offer access token service (JWT)
- REST API routes (3 endpoints)
- Request validation (Zod schemas)
- Unit tests (10+ tests)

**Key Components**:
- `backend/src/services/offerResponseService.ts`
- `backend/src/services/offerTokenService.ts`
- `backend/src/routes/offers.ts`
- Route registration in app.ts

**Dependencies**: TASK-001

---

### TASK-003: Offer Expiry Scheduler with BullMQ
**Layer**: Backend  
**Effort**: 5 hours  
**Priority**: High

**Deliverables**:
- BullMQ queue configuration
- Offer expiry service
- BullMQ worker implementation
- Job scheduling/cancellation
- Deadline extension support
- Unit tests (6+ tests)

**Key Components**:
- `backend/src/queues/offerQueue.ts`
- `backend/src/services/offerExpiryService.ts`
- `backend/src/workers/offerWorker.ts`
- `backend/src/startWorkers.ts`

**Dependencies**: TASK-001, TASK-002, Redis installation

---

### TASK-004: Integration Testing for Offer Letter Workflow
**Layer**: Integration  
**Effort**: 4 hours  
**Priority**: High

**Deliverables**:
- Offer generation integration tests
- API endpoint integration tests
- Expiry processing integration tests
- Database transaction validation
- Test environment configuration
- Integration tests (10+ tests)

**Key Components**:
- `backend/src/services/__tests__/offerWorkflow.integration.test.ts`
- `backend/src/routes/__tests__/offers.integration.test.ts`
- `backend/src/services/__tests__/offerExpiry.integration.test.ts`

**Dependencies**: TASK-001, TASK-002, TASK-003

---

## Dependency Chain

```
US-003 (Approval Chain)
    ↓
TASK-001 (PDF Generation)
    ↓
TASK-002 (API Endpoints) ← TASK-003 (Expiry Scheduler)
    ↓
TASK-004 (Integration Testing)
```

---

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Template Engine | Handlebars |
| PDF Generation | Puppeteer |
| Storage | Supabase Storage |
| Queue System | BullMQ + Redis |
| Token Security | JWT (jsonwebtoken) |
| Validation | Zod |
| Testing | Vitest + Supertest |

---

## New Dependencies

```json
{
  "dependencies": {
    "handlebars": "^4.7.8",
    "puppeteer": "^21.6.1",
    "@supabase/supabase-js": "^2.38.4",
    "bullmq": "^5.0.0",
    "ioredis": "^5.3.2"
  },
  "devDependencies": {
    "@types/ioredis": "^5.0.0"
  }
}
```

---

## Database Schema Changes

### New Model: Offer

```prisma
enum OfferStatus {
  pending
  accepted
  declined
  expired
}

model Offer {
  id             String      @id @default(uuid()) @db.Uuid
  decisionId     String      @unique @db.Uuid
  applicationId  String      @db.Uuid
  pdfUrl         String?     @db.Text
  pdfStoragePath String?     @db.Text
  status         OfferStatus @default(pending)
  expiresAt      DateTime
  respondedAt    DateTime?
  responseReason String?     @db.Text
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  
  decision    Decision    @relation(fields: [decisionId], references: [id])
  application Application @relation(fields: [applicationId], references: [id])
  
  @@index([status, expiresAt])
  @@index([applicationId])
  @@map("offers")
}
```

### Schema Updates

- Add `offer Offer?` relation to Decision model
- Add `offers Offer[]` relation to Application model

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/offers/:id/accept` | Token | Accept offer |
| POST | `/api/offers/:id/decline` | Token | Decline offer |
| GET | `/api/offers/:id` | Token | View offer details |

---

## Environment Variables

```env
# PDF Generation
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

# Offer Configuration
OFFER_TOKEN_SECRET=strong-random-secret
OFFER_EXPIRY_DAYS=5

# Queue System
REDIS_URL=redis://localhost:6379

# Frontend URL for email links
FRONTEND_URL=https://your-domain.com
```

---

## Acceptance Criteria Coverage

| Scenario | Tasks | Status |
|----------|-------|--------|
| Scenario 1: Offer generated with token resolution | TASK-001 | ✅ Planned |
| Scenario 2: Candidate accepts offer | TASK-002 | ✅ Planned |
| Scenario 3: Candidate declines offer | TASK-002 | ✅ Planned |
| Scenario 4: Offer auto-expires after deadline | TASK-003 | ✅ Planned |
| Integration validation | TASK-004 | ✅ Planned |

---

## Test Coverage Summary

| Task | Unit Tests | Integration Tests | Total |
|------|-----------|------------------|-------|
| TASK-001 | 8+ | 3+ | 11+ |
| TASK-002 | 10+ | 5+ | 15+ |
| TASK-003 | 6+ | 2+ | 8+ |
| TASK-004 | — | 10+ | 10+ |
| **Total** | **24+** | **20+** | **44+** |

**Target Coverage**: >85% overall

---

## Implementation Sequence

### Phase 1: Foundation (TASK-001)
- Create database migration
- Implement template and PDF services
- Set up Supabase Storage
- Unit test coverage

### Phase 2: API Layer (TASK-002)
- Implement response services
- Create API endpoints
- Token generation and validation
- Unit test coverage

### Phase 3: Automation (TASK-003)
- Install and configure BullMQ
- Implement expiry service
- Create worker process
- Job scheduling integration
- Unit test coverage

### Phase 4: Validation (TASK-004)
- End-to-end integration tests
- Database transaction validation
- Queue interaction testing
- Coverage verification

---

## Success Metrics

- ✅ All 4 tasks completed
- ✅ 44+ tests passing (100%)
- ✅ >85% code coverage
- ✅ All acceptance criteria validated
- ✅ Zero TypeScript compilation errors
- ✅ API endpoints responding correctly
- ✅ Queue processing reliably
- ✅ PDF generation working
- ✅ Storage integration functional

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Puppeteer performance | Mock in tests, consider queue for production |
| Supabase Storage quota | Monitor usage, implement cleanup policy |
| Redis availability | Use Redis Sentinel/Cluster in production |
| PDF template complexity | Start simple, iterate based on feedback |
| Queue job failures | Implement retry logic with exponential backoff |
| Token expiry mismatch | Align token and PDF URL expiry (30 days) |

---

## Next Steps

1. Review and approve task specifications
2. Allocate developers to tasks
3. Begin TASK-001 implementation
4. Set up infrastructure (Redis, Supabase Storage bucket)
5. Install required npm packages
6. Create database migration
7. Follow systematic implementation workflow

---

## Notes

- TASK-002 and TASK-003 can be implemented in parallel after TASK-001
- Email notification implementation deferred (can be separate task)
- Onboarding workflow integration deferred (separate epic)
- Frontend offer portal not included (backend-only project)
- Consider BullMQ Board for development monitoring
- Puppeteer requires system dependencies in production (fonts, libs)
