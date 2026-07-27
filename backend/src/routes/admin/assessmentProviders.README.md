# Assessment Provider Configuration CRUD API

Secure admin API for managing assessment provider configurations with encrypted secrets, role-based access control, and comprehensive audit logging.

## Features

- 🔒 **Encrypted secrets** - HMAC secrets encrypted at rest with AES-256-GCM
- 👮 **Admin-only access** - Role-based access control via middleware
- 🕵️ **Secret redaction** - Automatic redaction of sensitive fields in responses
- 📝 **Audit logging** - All CRUD operations logged to `audit_events` table
- ✅ **Validation** - Zod schemas for request validation
- 🔍 **Filtering & pagination** - List providers with search and active filter

## API Endpoints

### Create Provider

```http
POST /api/admin/assessment-providers
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "name": "HackerRank Advanced",
  "apiEndpoint": "https://api.hackerrank.com/v2",
  "authMode": "bearer",
  "hmacSecret": "a1b2c3d4e5f6789012345678901234567890123456789012345678901234",
  "timeoutSeconds": 45,
  "active": true
}
```

**Response (201 Created)**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "HackerRank Advanced",
    "apiEndpoint": "https://api.hackerrank.com/v2",
    "authMode": "bearer",
    "hmacSecret": "[REDACTED]",
    "timeoutSeconds": 45,
    "active": true,
    "createdAt": "2026-07-27T15:00:00Z",
    "updatedAt": "2026-07-27T15:00:00Z"
  }
}
```

### List Providers

```http
GET /api/admin/assessment-providers?page=1&limit=20&active=true&search=HackerRank
Authorization: Bearer <admin_token>
```

**Query Parameters:**
- `page` (number, default: 1) - Page number
- `limit` (number, default: 20, max: 100) - Items per page
- `active` (enum: 'true' | 'false' | 'all', default: 'all') - Filter by active status
- `search` (string, optional) - Search by name or endpoint

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "providers": [
      {
        "id": "uuid",
        "name": "HackerRank Advanced",
        "apiEndpoint": "https://api.hackerrank.com/v2",
        "authMode": "bearer",
        "hmacSecret": "[REDACTED]",
        "timeoutSeconds": 45,
        "active": true,
        "createdAt": "2026-07-27T15:00:00Z",
        "updatedAt": "2026-07-27T15:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 3,
      "totalPages": 1
    }
  }
}
```

### Get Single Provider

```http
GET /api/admin/assessment-providers/:id
Authorization: Bearer <admin_token>
```

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "HackerRank Advanced",
    "apiEndpoint": "https://api.hackerrank.com/v2",
    "authMode": "bearer",
    "hmacSecret": "[REDACTED]",
    "timeoutSeconds": 45,
    "active": true,
    "createdAt": "2026-07-27T15:00:00Z",
    "updatedAt": "2026-07-27T15:00:00Z"
  }
}
```

### Update Provider

```http
PATCH /api/admin/assessment-providers/:id
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "apiEndpoint": "https://api.hackerrank.com/v3",
  "timeoutSeconds": 60
}
```

**Response (200 OK)**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "HackerRank Advanced",
    "apiEndpoint": "https://api.hackerrank.com/v3",
    "authMode": "bearer",
    "hmacSecret": "[REDACTED]",
    "timeoutSeconds": 60,
    "active": true,
    "createdAt": "2026-07-27T15:00:00Z",
    "updatedAt": "2026-07-27T16:00:00Z"
  }
}
```

### Delete Provider (Soft Delete)

```http
DELETE /api/admin/assessment-providers/:id
Authorization: Bearer <admin_token>
```

**Response (204 No Content)**

## Error Responses

### 400 Validation Error
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid provider data",
    "details": [
      {
        "path": ["apiEndpoint"],
        "message": "API endpoint must be a valid URL"
      }
    ]
  }
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to access this resource"
  }
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": {
    "code": "PROVIDER_NOT_FOUND",
    "message": "Assessment provider not found"
  }
}
```

## Validation Rules

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `name` | string | Yes | 1-100 characters |
| `apiEndpoint` | string (URL) | Yes | Valid URL, max 500 characters |
| `authMode` | string | Yes | 1-50 characters |
| `hmacSecret` | string (hex) | No | Exactly 64 hex characters (SHA-256) |
| `timeoutSeconds` | number | No | 5-300, default: 30 |
| `active` | boolean | No | Default: true |

## Security

### Secret Encryption

HMAC secrets are encrypted at rest using AES-256-GCM:
- **Encryption key**: Set via `ENCRYPTION_KEY` environment variable (64 hex characters)
- **Format**: `iv:authTag:encryptedData` (base64-encoded)
- **Algorithm**: AES-256-GCM with random IV and authentication tag

Generate encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Secret Redaction

- **Admin roles** (`admin`, `security_admin`): See full secrets (decrypted)
- **Other roles**: See `[REDACTED]` instead of actual secret
- Secret redaction happens in service layer via `redactSecret()` function

### Authorization

All endpoints require:
1. **Authentication** via `authenticate` middleware (JWT Bearer token)
2. **Authorization** via `requireRole(['admin', 'security_admin'])` middleware

## Audit Logging

All operations logged to `audit_events` table:

| Event Type | Description | Payload |
|------------|-------------|---------|
| `PROVIDER_CREATED` | New provider added | name, apiEndpoint, authMode, active |
| `PROVIDER_UPDATED` | Configuration changed | changedFields, updated values |
| `PROVIDER_DELETED` | Provider deactivated | name |
| `PROVIDER_SECRET_ACCESSED` | Admin viewed secret | providerId (future enhancement) |

Audit event structure:
```typescript
{
  actorId: string;      // User who performed action
  eventType: string;    // See table above
  entityType: 'assessment_provider';
  entityId: string;     // Provider UUID
  payloadJson: object;  // Event-specific data
  ipAddress?: string;   // Request IP (if available)
  userAgent?: string;   // Request user agent (if available)
  createdAt: DateTime;  // Timestamp
}
```

## Implementation Files

| File | Purpose | Lines |
|------|---------|-------|
| [schemas/assessmentProviderSchemas.ts](../schemas/assessmentProviderSchemas.ts) | Zod validation schemas | 88 |
| [utils/encryption.ts](../utils/encryption.ts) | AES-256-GCM encryption utility | 123 |
| [services/assessmentProviderService.ts](../services/assessmentProviderService.ts) | CRUD business logic | +298 (appended) |
| [routes/admin/assessmentProviders.ts](../routes/admin/assessmentProviders.ts) | REST API endpoints | 299 |
| [routes/__tests__/assessmentProviders.integration.test.ts](../routes/__tests__/assessmentProviders.integration.test.ts) | Integration tests | 553 |

## Testing

### Run Integration Tests

```bash
cd backend
npm run test:integration -- src/routes/__tests__/assessmentProviders.integration.test.ts
```

### Test Scenarios (12 total)

1. ✅ Admin can create provider with encrypted secrets
2. ✅ Non-admin cannot create provider (403)
3. ✅ HMAC secret redacted in response
4. ✅ Invalid URL rejected (400)
5. ✅ Invalid HMAC secret format rejected (400)
6. ✅ List providers with pagination
7. ✅ Filter providers by active status
8. ✅ Search providers by name
9. ✅ Get single provider by ID
10. ✅ Provider not found returns 404
11. ✅ Update provider configuration
12. ✅ Soft delete provider

### Prerequisites

- `DATABASE_URL` set in `.env.test`
- `ENCRYPTION_KEY` set (64 hex characters)
- Test database initialized with Prisma migrations
- `assessment_providers` and `audit_events` tables exist

## Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `ENCRYPTION_KEY` | Yes | 32-byte encryption key (64 hex chars) | `a1b2c3d4...` |
| `JWT_SECRET` | Yes | JWT signing secret | - |
| `DATABASE_URL` | Yes | PostgreSQL connection string | - |

## Database Schema

```sql
CREATE TABLE assessment_providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  api_endpoint VARCHAR(500) NOT NULL,
  auth_mode VARCHAR(50) NOT NULL,
  hmac_secret VARCHAR(255), -- Encrypted value
  timeout_seconds INTEGER DEFAULT 30,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_assessment_providers_active ON assessment_providers(active);
```

## Usage Example

### TypeScript Client

```typescript
import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'https://api.example.com',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json',
  },
});

// Create provider
const { data: newProvider } = await apiClient.post('/api/admin/assessment-providers', {
  name: 'CodeSignal',
  apiEndpoint: 'https://api.codesignal.com/v1',
  authMode: 'hmac',
  hmacSecret: 'c1d2e3f4567890123456789012345678901234567890123456789012345678',
  timeoutSeconds: 60,
  active: true,
});

// List active providers
const { data: providers } = await apiClient.get('/api/admin/assessment-providers', {
  params: { active: 'true', page: 1, limit: 20 },
});

// Update provider
await apiClient.patch(`/api/admin/assessment-providers/${providerId}`, {
  timeoutSeconds: 90,
});

// Deactivate provider
await apiClient.delete(`/api/admin/assessment-providers/${providerId}`);
```

## Related Tasks

- TASK-001: Server-Side Session Timer with Redis Storage
- TASK-002: Session Timer API Endpoints
- TASK-003: Frontend Timer Component with Server Sync
- **TASK-004**: Assessment Provider Configuration CRUD API (this task)

## Notes

- **Soft delete pattern**: Deletion sets `active = false` instead of removing records
- **Legacy support**: Encryption utility handles unencrypted secrets during migration
- **Secret rotation**: Future enhancement - dedicated endpoint for rotating HMAC secrets
- **Admin UI**: Deferred to EP-009 (this task is backend API only)
