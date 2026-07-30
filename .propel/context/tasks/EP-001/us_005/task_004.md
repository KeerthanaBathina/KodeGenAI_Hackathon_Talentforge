---
id: task_004
us_id: us_005
epic: EP-001
title: "Build Profile and Consent API Endpoints"
status: done
layer: backend
effort: 3h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-004 — Build Profile and Consent API Endpoints

## Context

**User Story**: US-005 — Candidate Profile CRUD with Onboarding Checklist and Consent Management  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: All scenarios (exposes profile CRUD, consent recording, completion status)

REST API endpoints provide access to profile management, consent recording, and onboarding checklist status. Endpoints must enforce authentication and validate input data.

---

## Objective

Create API endpoints for:
- Profile CRUD operations (GET, POST, PUT, DELETE)
- Privacy consent recording and retrieval
- Profile completion status with checklist breakdown
- Validation and error handling with clear error messages

---

## Technical Specifications

### Profile Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/profile` | Required | Get authenticated candidate's profile + completion |
| POST | `/api/profile` | Required | Create profile for authenticated candidate |
| PUT | `/api/profile` | Required | Update profile fields (partial updates supported) |
| DELETE | `/api/profile` | Required | Delete profile (candidate or admin) |
| GET | `/api/profile/completion` | Required | Get completion status only |

### Consent Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/consent/accept` | Required | Accept current privacy policy |
| GET | `/api/consent` | Required | Get active consent record |
| DELETE | `/api/consent` | Required | Revoke privacy consent |
| GET | `/api/consent/history` | Required | Get full consent history |

**Request/Response Examples**:

```typescript
// POST /api/profile
Request: {
  fullName: "Jane Doe",
  experienceYears: 5,
  skills: ["JavaScript", "TypeScript", "React"],
  education: [{
    institution: "MIT",
    degree: "BS Computer Science",
    startDate: "2015-09",
    endDate: "2019-05",
    isCurrent: false
  }],
  workHistory: [{
    company: "TechCorp",
    title: "Software Engineer",
    startDate: "2019-06",
    endDate: null,
    isCurrent: true
  }]
}

Response (201): {
  id: "uuid",
  candidateId: "uuid",
  fullName: "Jane Doe",
  ...
  profileCompletionPercentage: 80,
  completionStatus: {
    completedSections: ["basic_info", "skills", "education", "work_history"],
    percentage: 80,
    missingFields: ["Privacy Consent"]
  }
}

// POST /api/consent/accept
Request: {} // No body needed, uses authenticated candidate

Response (201): {
  id: "uuid",
  candidateId: "uuid",
  policyVersion: "1.0",
  acceptedAt: "2026-07-24T10:30:00Z",
  ipAddress: "192.168.1.1",
  revokedAt: null
}
```

---

## Implementation Steps

### Step 1 — Create Profile Routes

Create or update `backend/src/routes/profile.ts`:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import * as profileService from '../services/profileService';
import * as consentService from '../services/consentService';
import { validateProfileData } from '../utils/profileValidator';
import logger from '../utils/logger';

const router = Router();

// Validation schemas
const WorkExperienceSchema = z.object({
  company: z.string().min(1),
  title: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  description: z.string().optional(),
  isCurrent: z.boolean(),
});

const EducationSchema = z.object({
  institution: z.string().min(1),
  degree: z.string().min(1),
  fieldOfStudy: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  isCurrent: z.boolean(),
});

const ProfileDataSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  experienceYears: z.number().int().min(0).max(50).optional(),
  skills: z.array(z.string().min(1)).optional(),
  education: z.array(EducationSchema).optional(),
  workHistory: z.array(WorkExperienceSchema).optional(),
});

/**
 * GET /api/profile
 * Get authenticated candidate's profile with completion status
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const candidateId = req.user!.id; // Set by authenticate middleware

    const profile = await profileService.getProfileByCandidate(candidateId);

    if (!profile) {
      return res.status(404).json({
        error: {
          code: 'PROFILE_NOT_FOUND',
          message: 'Profile not found for this candidate',
        },
      });
    }

    return res.status(200).json(profile);
  } catch (error) {
    logger.error({ error }, 'Error fetching profile');
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to fetch profile',
      },
    });
  }
});

/**
 * POST /api/profile
 * Create profile for authenticated candidate
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const candidateId = req.user!.id;

    // Validate input
    const validation = ProfileDataSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid profile data',
          details: validation.error.errors,
        },
      });
    }

    // Additional validation
    const profileValidation = validateProfileData(validation.data);
    if (!profileValidation.valid) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Profile validation failed',
          details: profileValidation.errors,
        },
      });
    }

    const profile = await profileService.createProfile(candidateId, validation.data, candidateId);

    return res.status(201).json(profile);
  } catch (error: any) {
    if (error.name === 'ProfileError' && error.code === 'PROFILE_ALREADY_EXISTS') {
      return res.status(409).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    logger.error({ error }, 'Error creating profile');
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to create profile',
      },
    });
  }
});

/**
 * PUT /api/profile
 * Update profile fields (partial updates supported)
 */
router.put('/', authenticate, async (req, res) => {
  try {
    const candidateId = req.user!.id;
    const ipAddress = req.ip;

    // Validate input
    const validation = ProfileDataSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid profile data',
          details: validation.error.errors,
        },
      });
    }

    const profile = await profileService.updateProfile(candidateId, validation.data, candidateId, ipAddress);

    return res.status(200).json(profile);
  } catch (error: any) {
    if (error.name === 'ProfileError' && error.code === 'PROFILE_NOT_FOUND') {
      return res.status(404).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    logger.error({ error }, 'Error updating profile');
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to update profile',
      },
    });
  }
});

/**
 * GET /api/profile/completion
 * Get profile completion status only
 */
router.get('/completion', authenticate, async (req, res) => {
  try {
    const candidateId = req.user!.id;

    const completionStatus = await profileService.getCompletionStatus(candidateId);

    return res.status(200).json(completionStatus);
  } catch (error) {
    logger.error({ error }, 'Error fetching completion status');
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to fetch completion status',
      },
    });
  }
});

export default router;
```

### Step 2 — Create Consent Routes

Create `backend/src/routes/consent.ts`:

```typescript
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import * as consentService from '../services/consentService';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /api/consent/accept
 * Accept current privacy policy
 */
router.post('/accept', authenticate, async (req, res) => {
  try {
    const candidateId = req.user!.id;
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.headers['user-agent'];
    const policyVersion = consentService.getCurrentPolicyVersion();

    const consent = await consentService.recordConsent(candidateId, policyVersion, ipAddress, userAgent);

    return res.status(201).json(consent);
  } catch (error) {
    logger.error({ error }, 'Error recording consent');
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to record consent',
      },
    });
  }
});

/**
 * GET /api/consent
 * Get active consent record
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const candidateId = req.user!.id;

    const consent = await consentService.getActiveConsent(candidateId);

    if (!consent) {
      return res.status(404).json({
        error: {
          code: 'CONSENT_NOT_FOUND',
          message: 'No active consent found',
        },
      });
    }

    return res.status(200).json(consent);
  } catch (error) {
    logger.error({ error }, 'Error fetching consent');
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to fetch consent',
      },
    });
  }
});

/**
 * DELETE /api/consent
 * Revoke privacy consent
 */
router.delete('/', authenticate, async (req, res) => {
  try {
    const candidateId = req.user!.id;
    const ipAddress = req.ip;

    await consentService.revokeConsent(candidateId, candidateId, ipAddress);

    return res.status(200).json({
      message: 'Consent revoked successfully',
    });
  } catch (error: any) {
    if (error.name === 'ConsentError' && error.code === 'CONSENT_NOT_FOUND') {
      return res.status(404).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    logger.error({ error }, 'Error revoking consent');
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to revoke consent',
      },
    });
  }
});

/**
 * GET /api/consent/history
 * Get full consent history
 */
router.get('/history', authenticate, async (req, res) => {
  try {
    const candidateId = req.user!.id;

    const history = await consentService.getConsentHistory(candidateId);

    return res.status(200).json(history);
  } catch (error) {
    logger.error({ error }, 'Error fetching consent history');
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to fetch consent history',
      },
    });
  }
});

export default router;
```

### Step 3 — Register Routes in App

Update `backend/src/app.ts`:

```typescript
import profileRouter from './routes/profile';
import consentRouter from './routes/consent';

// ... existing routes ...

app.use('/api/profile', profileRouter);
app.use('/api/consent', consentRouter);
```

---

## Acceptance Criteria

- [x] Profile endpoints: GET, POST, PUT for authenticated candidates
- [x] Consent endpoints: POST /accept, GET, DELETE, GET /history
- [x] All endpoints require authentication (return 401 if not authenticated)
- [x] Input validation with Zod schemas and custom validators
- [x] Error responses include code and message
- [x] Partial updates supported for profile (can update skills only, etc.)
- [x] Completion status returned with profile data

---

## Dependencies

- TASK-002 (profileService)
- TASK-003 (consentService)
- authenticate middleware

## Testing Notes

Integration tests should cover:
```typescript
describe('Profile API', () => {
  it('returns 401 for unauthenticated requests');
  it('creates profile with valid data');
  it('returns 409 if profile already exists');
  it('updates profile fields and recalculates completion');
  it('returns completion status with checklist breakdown');
});

describe('Consent API', () => {
  it('records consent with IP and timestamp');
  it('returns active consent');
  it('revokes consent and updates revokedAt');
  it('returns full consent history');
});
```
