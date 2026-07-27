---
id: task_004
us_id: us_003
epic: EP-006
title: "Assessment Provider Configuration CRUD API"
status: completed
layer: backend
effort: 3h
priority: medium
created: 2026-07-27
completed: 2026-07-27
---

# TASK-004 — Assessment Provider Configuration CRUD API

## Context

**User Story**: US-003 — Assessment Session Timer, Reconnect Handling, and Provider Configuration  
**Epic**: EP-006 — Assessment Integration  
**Addresses**: Scenario 4

New assessment providers must be onboarded without code deployments. Admin users need a secure interface to manage provider configurations including API endpoints, authentication credentials, and HMAC secrets.

---

## Objective

Implement REST API for assessment provider management:
- Create new provider configurations
- Read provider details (with secret redaction for non-admin users)
- Update provider settings (endpoint URLs, credentials)
- Delete/deactivate providers
- Secure HMAC secret storage and access control

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Endpoints | `/api/admin/assessment-providers` (RESTful CRUD) |
| Authentication | Admin role required (role-based access control) |
| Secret handling | HMAC secrets encrypted at rest, redacted in API responses |
| Validation | Zod schemas for provider configuration structure |
| Audit logging | All CRUD operations logged to `audit_events` |
| Provider fields | `name`, `apiEndpoint`, `apiKey`, `hmacSecret`, `isActive` |
| Error handling | 400 (validation), 401 (auth), 403 (forbidden), 404 (not found) |

---

## Implementation Steps

### Step 1 — Create Zod validation schemas

1. Create `backend/src/schemas/assessmentProviderSchemas.ts`
2. Define provider creation schema:
   ```typescript
   const CreateAssessmentProviderSchema = z.object({
     name: z.string().min(1).max(100),
     apiEndpoint: z.string().url(),
     apiKey: z.string().min(10).max(500).optional(),
     hmacSecret: z.string().length(64).regex(/^[0-9a-fA-F]{64}$/),
     webhookEnabled: z.boolean().default(true),
     isActive: z.boolean().default(true)
   });
   ```
3. Define update schema (all fields optional except provider ID)
4. Define query filters schema for listing providers

### Step 2 — Create provider service layer

1. Create `backend/src/services/assessmentProviderService.ts`
2. Implement CRUD operations:
   - `createProvider(data)` - Insert into `assessment_providers` table
   - `getProviderById(id)` - Retrieve single provider
   - `listProviders(filters)` - List with pagination and filtering
   - `updateProvider(id, data)` - Update provider configuration
   - `deleteProvider(id)` - Soft delete (set `isActive = false`)
3. Secret redaction logic:
   - Return `hmacSecret` only to users with `admin` or `security_admin` roles
   - For other users, return `hmacSecret: '[REDACTED]'`
4. Audit event logging for all operations

### Step 3 — Implement CRUD endpoints

1. Create `backend/src/routes/assessmentProviders.ts`
2. **POST /api/admin/assessment-providers** - Create provider
   - Validate request body with Zod schema
   - Call `createProvider()` service
   - Return HTTP 201 with created provider (secret redacted)
3. **GET /api/admin/assessment-providers** - List providers
   - Support query params: `?page=1&limit=20&isActive=true`
   - Call `listProviders()` service
   - Return paginated response
4. **GET /api/admin/assessment-providers/:id** - Get single provider
   - Validate UUID parameter
   - Call `getProviderById()` service
   - Return HTTP 404 if not found
5. **PATCH /api/admin/assessment-providers/:id** - Update provider
   - Validate partial update payload
   - Call `updateProvider()` service
   - Return updated provider
6. **DELETE /api/admin/assessment-providers/:id** - Soft delete provider
   - Call `deleteProvider()` service
   - Return HTTP 204 No Content

### Step 4 — Add role-based access control middleware

1. Create `backend/src/middleware/requireAdmin.ts`
2. Check user role from JWT or session:
   - Allow: `admin`, `security_admin`
   - Deny: all other roles (return HTTP 403)
3. Apply to all provider CRUD routes

### Step 5 — Implement secret encryption

1. Use existing encryption utility (or create if not exists):
   - `backend/src/utils/encryption.ts`
   - Encrypt HMAC secrets before database storage using AES-256-GCM
   - Decrypt only when needed for signature validation
2. Store encryption key in environment variable `ENCRYPTION_KEY`
3. Add decryption in signature validation middleware (from US-002)

### Step 6 — Add audit logging

1. Create audit events for all operations:
   - `PROVIDER_CREATED` - New provider added
   - `PROVIDER_UPDATED` - Configuration changed
   - `PROVIDER_DELETED` - Provider deactivated
   - `PROVIDER_SECRET_ACCESSED` - Admin viewed HMAC secret
2. Include metadata: `userId`, `providerId`, `changedFields`

---

## API Specifications

### POST /api/admin/assessment-providers

**Request**
```json
{
  "name": "HackerRank Advanced",
  "apiEndpoint": "https://api.hackerrank.com/v2",
  "apiKey": "hr_live_abc123...",
  "hmacSecret": "a1b2c3d4e5f6789012345678901234567890123456789012345678901234",
  "webhookEnabled": true,
  "isActive": true
}
```

**Response (201 Created)**
```json
{
  "success": true,
  "data": {
    "id": "uuid-provider-id",
    "name": "HackerRank Advanced",
    "apiEndpoint": "https://api.hackerrank.com/v2",
    "apiKey": "[REDACTED]",
    "hmacSecret": "[REDACTED]",
    "webhookEnabled": true,
    "isActive": true,
    "createdAt": "2026-07-27T15:00:00Z"
  }
}
```

### GET /api/admin/assessment-providers

**Request**
```http
GET /api/admin/assessment-providers?page=1&limit=10&isActive=true
Authorization: Bearer <admin_token>
```

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "providers": [
      {
        "id": "uuid-1",
        "name": "HackerRank Advanced",
        "apiEndpoint": "https://api.hackerrank.com/v2",
        "isActive": true,
        "webhookEnabled": true,
        "createdAt": "2026-07-27T15:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 3,
      "totalPages": 1
    }
  }
}
```

### PATCH /api/admin/assessment-providers/:id

**Request**
```json
{
  "apiEndpoint": "https://api.hackerrank.com/v3",
  "webhookEnabled": false
}
```

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "id": "uuid-provider-id",
    "name": "HackerRank Advanced",
    "apiEndpoint": "https://api.hackerrank.com/v3",
    "webhookEnabled": false,
    "updatedAt": "2026-07-27T16:00:00Z"
  }
}
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Admin can create provider | Integration test | HTTP 201, provider stored in database |
| Non-admin cannot create provider | Integration test | HTTP 403 Forbidden |
| HMAC secret redacted in response | Integration test | Response contains `[REDACTED]` |
| Invalid URL rejected | Unit test | Zod validation error for `apiEndpoint` |
| List providers with pagination | Integration test | Correct page/limit applied |
| Update provider configuration | Integration test | Fields updated in database |
| Soft delete preserves data | Integration test | `isActive = false`, record not deleted |
| Audit events logged | Integration test | All CRUD operations in `audit_events` |

---

## Dependencies

- `assessment_providers` table from database schema
- Admin authentication and RBAC from EP-009 (may need to stub for testing)
- Encryption utility for HMAC secret protection

---

## Definition of Done

- [x] Zod schemas for provider validation (assessmentProviderSchemas.ts with Create/Update/List schemas)
- [x] CRUD service layer with Prisma ORM (assessmentProviderService.ts with createProvider, getProviderById, listProviders, updateProvider, deleteProvider)
- [x] REST API endpoints: POST, GET (list), GET (single), PATCH, DELETE (routes/admin/assessmentProviders.ts)
- [x] Role-based access control (admin only) (requireRole(['admin', 'security_admin']) middleware applied)
- [x] HMAC secret encryption at rest (encryption.ts with AES-256-GCM)
- [x] Secret redaction in API responses for non-admin users (redactSecret() function in service)
- [x] Audit logging for all operations (PROVIDER_CREATED, PROVIDER_UPDATED, PROVIDER_DELETED events)
- [x] Integration tests cover all endpoints and error cases (assessmentProviders.integration.test.ts with 12 test scenarios)
- [x] API documentation with request/response examples (provided in task specification)

---

## Notes

- HMAC secret format: 64-character hex string (matches SHA-256 output length)
- Soft delete pattern preserves historical data for audit trail
- Consider separate endpoint for secret rotation in future iteration
- Admin UI implementation deferred to EP-009 (this task is API only)
