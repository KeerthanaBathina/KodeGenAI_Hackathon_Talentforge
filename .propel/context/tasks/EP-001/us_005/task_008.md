---
id: task_008
us_id: us_005
epic: EP-001
title: "Implement Profile Completion Gate Middleware"
status: done
layer: backend
effort: 1h
priority: medium
created: 2026-07-24
completed: 2026-07-24
---

# TASK-008 — Implement Profile Completion Gate Middleware

## Context

**User Story**: US-005 — Candidate Profile CRUD with Onboarding Checklist and Consent Management  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: Scenario 5 (profile completion gate for applications)

The profile completion gate prevents candidates with incomplete profiles (< 80%) from submitting job applications. The middleware returns a clear error message directing them to complete their profile first.

---

## Objective

Create middleware that:
- Checks profile completion percentage before allowing application submission
- Returns HTTP 403 with completion status if < 80%
- Allows applications to proceed if ≥ 80%
- Logs gate enforcement events to audit log

---

## Technical Specifications

**Completion Threshold**: 80% (4 of 5 sections completed)

**Gate Behavior**:
- If completion < 80%: Return 403 with error code `PROFILE_INCOMPLETE`
- If completion ≥ 80%: Allow request to proceed
- If profile not found: Return 404 with error code `PROFILE_NOT_FOUND`

---

## Implementation Steps

### Step 1 — Create Middleware

Create `backend/src/middleware/profileCompletionGate.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import * as profileService from '../services/profileService';
import logger from '../utils/logger';

const COMPLETION_THRESHOLD = 80; // 80% required to apply

/**
 * Middleware to enforce profile completion threshold for job applications.
 * Returns 403 if profile completion < 80%.
 */
export async function profileCompletionGate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Require authenticated user
    if (!req.user || !req.user.id) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    const candidateId = req.user.id;

    // Get profile completion status
    const completionStatus = await profileService.getCompletionStatus(candidateId);

    // Check if profile exists
    if (completionStatus.percentage === 0 && completionStatus.missingFields.includes('Profile not created')) {
      res.status(404).json({
        error: {
          code: 'PROFILE_NOT_FOUND',
          message: 'Profile not found. Please create your profile first.',
        },
      });
      return;
    }

    // Enforce completion threshold
    if (completionStatus.percentage < COMPLETION_THRESHOLD) {
      logger.info(
        { candidateId, completion: completionStatus.percentage, threshold: COMPLETION_THRESHOLD },
        'Profile completion gate blocked application'
      );

      res.status(403).json({
        error: {
          code: 'PROFILE_INCOMPLETE',
          message: `Profile must be at least ${COMPLETION_THRESHOLD}% complete to apply for jobs. Current completion: ${completionStatus.percentage}%`,
          details: {
            currentCompletion: completionStatus.percentage,
            requiredCompletion: COMPLETION_THRESHOLD,
            missingFields: completionStatus.missingFields,
            completedSections: completionStatus.completedSections,
          },
        },
      });
      return;
    }

    // Profile meets threshold - allow request to proceed
    logger.debug(
      { candidateId, completion: completionStatus.percentage },
      'Profile completion gate passed'
    );

    next();
  } catch (error) {
    logger.error({ error }, 'Error in profile completion gate');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unable to verify profile completion',
      },
    });
  }
}
```

### Step 2 — Apply to Application Routes

Update `backend/src/routes/application.ts`:

```typescript
import { profileCompletionGate } from '../middleware/profileCompletionGate';

// Apply gate to application submission endpoint
router.post('/', authenticate, profileCompletionGate, async (req, res) => {
  // Application submission logic...
});
```

### Step 3 — Frontend Handling

Update frontend application submission to handle 403 response:

```typescript
// In application submission component
async function submitApplication() {
  try {
    const response = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(applicationData),
    });

    if (response.status === 403) {
      const error = await response.json();
      
      if (error.error.code === 'PROFILE_INCOMPLETE') {
        // Redirect to profile with message
        router.push('/profile?message=complete_profile_to_apply');
        return;
      }
    }

    // Handle other responses...
  } catch (err) {
    // Handle error...
  }
}
```

---

## Acceptance Criteria

- [x] Middleware checks profile completion before allowing application submission
- [x] Returns HTTP 403 with clear error message if completion < 80%
- [x] Returns completion percentage and missing fields in error response
- [x] Allows request to proceed if completion ≥ 80%
- [x] Gate enforcement logged to audit log
- [x] Frontend displays completion prompt when gate blocks application

---

## Dependencies

- TASK-002 (profileService.getCompletionStatus)
- Application submission routes

## Testing Notes

Integration tests should verify:
- 403 returned when profile at 60% (3 sections)
- 403 includes list of missing fields
- Request proceeds when profile at 80% (4 sections)
- Request proceeds when profile at 100% (5 sections)
- 404 returned if profile doesn't exist
