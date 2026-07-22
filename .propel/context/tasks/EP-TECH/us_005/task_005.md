---
id: task_005
us_id: us_005
epic: EP-TECH
title: "Validate All Security, Logging, and Observability Scenarios — DoD Sign-off"
status: not-started
layer: backend
effort: 3h
priority: critical
created: 2026-07-22
---

# TASK-005 — Validate All Security, Logging, and Observability Scenarios — DoD Sign-off

## Context

**User Story**: US-005 — Security Middleware, Structured Logging, and OpenTelemetry Observability  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses**: All 4 acceptance criteria scenarios + all Definition of Done items

This task executes structured validation evidence for each acceptance criterion, verifies the `securityheaders.com` grade reaches ≥ A, updates the user story status to `done`, and removes any temporary scaffolding introduced during implementation.

---

## Objective

Run all validation checks in sequence against the Railway staging environment, collect evidence (terminal output + screenshots where specified), confirm all 4 scenarios pass, achieve a securityheaders.com grade ≥ A, and update `us_005.md` to `status: done`.

---

## Pre-Validation Checklist

Before running validation, confirm all prerequisite tasks are merged and deployed to staging:

| Task | Description | Status |
|------|-------------|--------|
| TASK-001 | Helmet security headers | ☐ Deployed |
| TASK-002 | Pino structured logging + PII masking | ☐ Deployed |
| TASK-003 | OpenTelemetry SDK + Grafana Cloud | ☐ Deployed |
| TASK-004 | HTTP → HTTPS redirect middleware | ☐ Deployed |

---

## Validation Scenarios

### Scenario 1 — Security Headers (OWASP Baseline)

**Acceptance Criterion**: Response headers include HSTS with preload, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, CSP `default-src 'none'`, `Referrer-Policy: strict-origin`. Score ≥ A on securityheaders.com.

#### Step 1a — Verify headers with curl

```bash
STAGING_HTTPS_URL="https://api-staging.ai-interview.railway.app"

curl -I "${STAGING_HTTPS_URL}/health" 2>&1 | grep -i \
  -e "strict-transport-security" \
  -e "x-frame-options" \
  -e "x-content-type-options" \
  -e "content-security-policy" \
  -e "referrer-policy" \
  -e "permissions-policy"
```

**Expected output**:

```
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-frame-options: DENY
x-content-type-options: nosniff
content-security-policy: default-src 'none'; ...
referrer-policy: strict-origin
permissions-policy: camera=(), microphone=(), geolocation=()
```

**Evidence**: Paste terminal output in `validation-evidence.md`.

#### Step 1b — securityheaders.com scan

1. Open `https://securityheaders.com` in browser
2. Enter the staging HTTPS URL
3. Click **Scan**
4. Screenshot the report — grade must be **A** or higher
5. Save screenshot as `docs/validation/us_005_securityheaders_score.png`

**Evidence**: Screenshot saved.

---

### Scenario 2 — OpenTelemetry Trace in Grafana Cloud

**Acceptance Criterion**: `POST /api/applications` (or any instrumented route) produces a trace with HTTP, Prisma query, and BullMQ enqueue spans visible in Grafana within 30 seconds.

#### Step 2a — Trigger a traced request

```bash
STAGING_HTTPS_URL="https://api-staging.ai-interview.railway.app"

curl -X POST "${STAGING_HTTPS_URL}/ping" \
  -H "Content-Type: application/json" \
  -w "\nHTTP Status: %{http_code}\n"
```

(The `/ping` route from US-003/TASK-003 validates the infrastructure. The `POST /api/applications` endpoint will be implemented in EP-001.)

#### Step 2b — Verify trace in Grafana Cloud

1. Open **Grafana Cloud → Explore → Tempo**
2. In Query, set **Search** mode
3. Set `service.name = ai-interview-backend`
4. Click **Run query**
5. Within 30 s of the curl above, a trace for `GET /ping` (or `POST /ping`) should appear
6. Click on the trace to expand — confirm HTTP span is present

**Expected span structure**:

```
ai-interview-backend
  └─ HTTP GET /ping          [duration: ~10ms]
       └─ middleware - query (Express)
```

**Evidence**: Screenshot of Grafana Tempo trace panel saved as `docs/validation/us_005_grafana_trace.png`.

---

### Scenario 3 — PII Redaction in Log Output

**Acceptance Criterion**: `POST` with `email` + `password` body → `password` absent from logs, `email` masked to `j***@example.com` format. Log fields: `requestId`, `userId`, `method`, `path`, `statusCode`, `durationMs`.

#### Step 3a — Send a request with PII body fields

```bash
STAGING_HTTPS_URL="https://api-staging.ai-interview.railway.app"

curl -X POST "${STAGING_HTTPS_URL}/api/test" \
  -H "Content-Type: application/json" \
  -d '{"email":"john.doe@example.com","password":"super-secret-123","name":"Test User"}'
```

(The `/api/test` route may return 404 — that is acceptable. The request still generates a log line.)

#### Step 3b — Check Railway log output

In Railway dashboard → Staging → Logs, filter for the log line corresponding to the request above.

**Expected log line (NDJSON)**:

```json
{
  "level": "warn",
  "time": "2026-07-22T10:00:00.000Z",
  "service": "ai-interview-backend",
  "requestId": "abc-123-def-456",
  "userId": null,
  "method": "POST",
  "path": "/api/test",
  "statusCode": 404,
  "durationMs": 8,
  "req": {
    "body": {
      "email": "j***@example.com",
      "name": "Test User"
    }
  }
}
```

**Verification checklist**:
- [ ] `password` key is **absent** (not `[REDACTED]`, but completely absent)
- [ ] `email` value is `j***@example.com`
- [ ] `requestId` is present and is a UUID
- [ ] `method` is `POST`
- [ ] `path` is `/api/test` (no query string)
- [ ] `statusCode` is present (integer)
- [ ] `durationMs` is present (integer)

**Evidence**: Copy the raw JSON log line into `validation-evidence.md`.

---

### Scenario 4 — HTTP → HTTPS Redirect (TLS Enforcement)

**Acceptance Criterion**: HTTP client receives HTTP 301 redirect to HTTPS URL.

#### Step 4a — Verify 301 redirect on Railway staging

```bash
# Use HTTP scheme explicitly — Railway may upgrade before reaching our middleware
# Use -v to see the response status and location header
curl -v --max-redirs 0 \
  "http://api-staging.ai-interview.railway.app/api/test" \
  2>&1 | grep -E "HTTP/|location:"
```

**Expected output**:

```
< HTTP/1.1 301 Moved Permanently
< location: https://api-staging.ai-interview.railway.app/api/test
```

> **Note**: Railway may redirect HTTP → HTTPS at the edge before traffic reaches Node.js. If the curl returns a 301 with `location: https://...`, the TLS enforcement is working (whether at Railway edge or our middleware — either satisfies the requirement). To confirm our middleware specifically, check Railway logs for `[httpsRedirect] 301` entries.

#### Step 4b — Confirm `/health` is not redirected

```bash
curl -v "http://api-staging.ai-interview.railway.app/health" 2>&1 | grep "HTTP/"
```

**Expected**: `HTTP/1.1 200 OK` (no 301)

**Evidence**: Paste both terminal outputs in `validation-evidence.md`.

---

## Cleanup Steps

### Remove temporary `/ping` route

The `/ping` route introduced in US-003/TASK-003 for rate-limit testing should be removed from the health router before this validation task is signed off:

1. Open `backend/src/routes/health.ts`
2. Remove the `router.get('/ping', ...)` block
3. Confirm `/health` and `/ready` still return 200
4. Commit with message: `chore: remove temporary /ping test route`

---

## Update User Story Status

Update `us_005.md` status from `in-progress` to `done`:

```bash
# In .propel/context/stories/EP-TECH/us_005.md
# Change:  status: in-progress
# To:      status: done
```

Tick all Definition of Done items in `us_005.md`.

---

## Create Validation Evidence Document

Create `docs/validation/us_005_validation_evidence.md`:

```markdown
# US-005 Validation Evidence

**Date**: YYYY-MM-DD  
**Environment**: Railway Staging  
**Validator**: <your-name>

## Scenario 1 — Security Headers

### curl -I output
\`\`\`
<paste terminal output here>
\`\`\`

### securityheaders.com Grade
- **Grade**: A
- Screenshot: `us_005_securityheaders_score.png`

## Scenario 2 — OpenTelemetry Trace

- Grafana Tempo trace URL: <paste link>
- Screenshot: `us_005_grafana_trace.png`

## Scenario 3 — PII Redaction

### Raw log line
\`\`\`json
<paste NDJSON log line here>
\`\`\`

### Checklist
- [x] password absent
- [x] email masked: j***@example.com
- [x] requestId present
- [x] userId present (null for unauthenticated)
- [x] method present
- [x] path present (no query string)
- [x] statusCode present
- [x] durationMs present

## Scenario 4 — HTTP → HTTPS Redirect

### curl -v output (HTTP → 301)
\`\`\`
<paste terminal output here>
\`\`\`

### /health curl output (no redirect)
\`\`\`
<paste terminal output here>
\`\`\`

## Unit Test Results

\`\`\`
<paste: npm test output showing all test files and pass count>
\`\`\`

## TypeScript Compile

\`\`\`
<paste: npm run type-check output — exit 0>
\`\`\`
```

---

## Final Validation Summary

| Scenario | Criterion | Status |
|----------|-----------|--------|
| 1 | Security headers present; securityheaders.com ≥ A | ☐ |
| 2 | OTel trace with HTTP span in Grafana within 30s | ☐ |
| 3 | password absent, email masked, all required log fields present | ☐ |
| 4 | HTTP 301 → HTTPS; /health exempt | ☐ |
| DoD | All unit tests pass; TypeScript compiles; /ping route removed | ☐ |

---

## Dependencies

- **TASK-001** through **TASK-004** must be complete and deployed to Railway staging
- Grafana Cloud configured with OTel credentials in Railway staging Variables
- Access to Railway staging environment logs

## Security Constraints

- The `docs/validation/` screenshots and log excerpts must NOT contain real credentials, real JWT tokens, or real user email addresses — use only test/synthetic data
- If real email addresses appear in validation evidence, mask them before committing (`j***@example.com` format)
- The temporary `/ping` route MUST be removed before this task is marked done (it is an unauthenticated public endpoint with no business purpose)

---

## Definition of Done

- [ ] All 4 scenario validations pass
- [ ] `securityheaders.com` scan shows grade ≥ A for staging URL
- [ ] OTel trace with at least one HTTP span visible in Grafana within 30s
- [ ] Log evidence shows `password` absent and `email` masked
- [ ] HTTP 301 redirect confirmed on staging; `/health` exempt
- [ ] Temporary `/ping` route removed from `health.ts`
- [ ] `docs/validation/us_005_validation_evidence.md` committed
- [ ] `us_005.md` status updated to `done`
- [ ] All DoD items in `us_005.md` ticked
- [ ] `npm test` exits 0 across all test files
- [ ] `npm run type-check` exits 0

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-005 |
| Epic | EP-TECH |
| Scenarios | 1, 2, 3, 4 |
| NFRs | NFR-004 (TLS), NFR-007 (Logging + OTel) |
