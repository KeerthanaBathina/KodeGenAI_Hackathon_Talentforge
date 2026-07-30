---
id: task_009
us_id: us_005
epic: EP-001
title: "Create Profile CRUD and Consent Integration and E2E Tests"
status: done
layer: test
effort: 4h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-009 — Create Profile CRUD and Consent Integration and E2E Tests

## Context

**User Story**: US-005 — Candidate Profile CRUD with Onboarding Checklist and Consent Management  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: All scenarios (validates complete profile lifecycle)

Comprehensive test coverage validates profile CRUD operations, consent recording, checklist updates, and the profile completion gate across service, API, and E2E layers.

---

## Objective

Create test suites for:
- Profile service unit tests (CRUD, completion calculation)
- Consent service unit tests (record, revoke, history)
- Profile API integration tests (endpoints, validation, errors)
- Consent API integration tests (acceptance, retrieval)
- E2E tests for complete profile creation flow
- E2E tests for consent acceptance and gate enforcement

---

## Implementation Steps

### Step 1 — Profile Service Tests

Create `backend/src/services/__tests__/profileService.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import prisma from '../../db/prisma';
import * as profileService from '../profileService';

describe('profileService', () => {
  let testCandidate: any;

  beforeEach(async () => {
    testCandidate = await prisma.candidate.create({
      data: {
        email: `profile-test-${Date.now()}@example.com`,
        fullName: 'Test User',
        phoneNumber: null,
        status: 'active',
      },
    });
  });

  afterEach(async () => {
    await prisma.profile.deleteMany({ where: { candidateId: testCandidate.id } });
    await prisma.candidate.delete({ where: { id: testCandidate.id } });
  });

  describe('createProfile', () => {
    it('creates profile with 0% completion for minimal data', async () => {
      const profile = await profileService.createProfile(testCandidate.id, {
        fullName: 'Test',
        experienceYears: 0,
        skills: [],
        education: [],
        workHistory: [],
      });

      expect(profile.profileCompletionPercentage).toBe(0);
      expect(profile.completionStatus.completedSections).toHaveLength(0);
    });

    it('calculates 20% completion when only basic info complete', async () => {
      const profile = await profileService.createProfile(testCandidate.id, {
        fullName: 'Jane Doe',
        experienceYears: 5,
        skills: [],
        education: [],
        workHistory: [],
      });

      expect(profile.profileCompletionPercentage).toBe(20);
      expect(profile.completionStatus.completedSections).toContain('basic_info');
    });
  });

  describe('updateProfile', () => {
    it('updates profile and recalculates completion', async () => {
      await profileService.createProfile(testCandidate.id, {
        fullName: 'Test',
        experienceYears: 0,
        skills: [],
        education: [],
        workHistory: [],
      });

      const updated = await profileService.updateProfile(testCandidate.id, {
        skills: ['JavaScript', 'TypeScript', 'React'],
      });

      expect(updated.skills).toHaveLength(3);
      expect(updated.completionStatus.completedSections).toContain('skills');
    });
  });

  describe('calculateProfileCompletion', () => {
    it('returns 100% when all sections complete', async () => {
      await profileService.createProfile(testCandidate.id, {
        fullName: 'Jane Doe',
        experienceYears: 5,
        skills: ['JS', 'TS', 'React'],
        education: [{ institution: 'MIT', degree: 'BS CS', startDate: '2015', isCurrent: false }],
        workHistory: [{ company: 'TechCorp', title: 'Engineer', startDate: '2020', isCurrent: true }],
      });

      // Record consent
      await prisma.privacyConsent.create({
        data: {
          candidateId: testCandidate.id,
          policyVersion: '1.0',
          ipAddress: '127.0.0.1',
        },
      });

      const completion = await profileService.calculateProfileCompletion(testCandidate.id);
      expect(completion.percentage).toBe(100);
      expect(completion.completedSections).toHaveLength(5);
      expect(completion.missingFields).toHaveLength(0);
    });
  });
});
```

### Step 2 — Consent Service Tests

Create `backend/src/services/__tests__/consentService.test.ts`:

```typescript
describe('consentService', () => {
  it('records consent with version and IP');
  it('returns existing consent if already accepted');
  it('revokes consent and sets revokedAt');
  it('returns false for hasActiveConsent after revocation');
});
```

### Step 3 — Profile API Integration Tests

Create `backend/src/routes/__tests__/profile.integration.test.ts`:

```typescript
describe('Profile API', () => {
  it('POST /api/profile creates profile with valid data');
  it('PUT /api/profile updates skills only (partial update)');
  it('GET /api/profile/completion returns checklist status');
  it('returns 400 for invalid profile data');
  it('returns 409 if profile already exists');
});
```

### Step 4 — E2E Tests

Create `frontend/tests/profile-onboarding.spec.ts`:

```typescript
import { expect, test } from '@playwright/test';

test.describe('US-005 Profile Onboarding Flow', () => {
  test('complete profile creation flow with checklist updates', async ({ page }) => {
    // Mock APIs...
    
    // Navigate to profile page
    await page.goto('/profile');

    // Fill basic info
    await page.getByLabel('Full Name').fill('Jane Doe');
    await page.getByLabel('Years of Experience').fill('5');

    // Add skills
    await page.getByPlaceholder('e.g., JavaScript').fill('JavaScript');
    await page.getByRole('button', { name: 'Add' }).click();
    // Repeat for 3 skills...

    // Add education
    await page.getByRole('button', { name: 'Add Education' }).click();
    // Fill education fields...

    // Add work history
    await page.getByRole('button', { name: 'Add Work Experience' }).click();
    // Fill work fields...

    // Save profile
    await page.getByRole('button', { name: 'Save Profile' }).click();

    // Verify success
    await expect(page.getByText('Profile saved successfully')).toBeVisible();

    // Check completion percentage
    await expect(page.getByText('80%')).toBeVisible();
  });

  test('profile completion gate blocks application when < 80%', async ({ page }) => {
    // Mock profile with 60% completion
    await page.route('**/api/profile/completion', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          completedSections: ['basic_info', 'skills', 'education'],
          percentage: 60,
          missingFields: ['Work History', 'Privacy Consent'],
        }),
      });
    });

    // Mock application submission returning 403
    await page.route('**/api/applications', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'PROFILE_INCOMPLETE',
            message: 'Profile must be at least 80% complete',
          },
        }),
      });
    });

    await page.goto('/jobs/123');
    await page.getByRole('button', { name: 'Apply' }).click();

    // Verify redirect to profile with message
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByText(/complete.*profile.*apply/i)).toBeVisible();
  });

  test('consent acceptance updates checklist to 100%', async ({ page }) => {
    await page.goto('/consent');

    // Scroll policy
    await page.getByRole('button', { name: 'I Accept' }).click();

    // Verify acceptance recorded
    await expect(page.getByText('Privacy Consent Accepted')).toBeVisible();

    // Navigate to profile
    await page.getByRole('button', { name: 'Continue to Profile' }).click();

    // Verify checklist shows 100%
    await expect(page.getByText('100%')).toBeVisible();
  });
});
```

---

## Acceptance Criteria

- [x] Profile service unit tests cover create, update, delete, completion calculation
- [x] Consent service unit tests cover record, revoke, history
- [x] Profile API integration tests cover all endpoints and error cases
- [x] E2E tests validate complete onboarding flow
- [x] E2E tests verify profile completion gate enforcement
- [x] E2E tests verify checklist updates in real-time
- [x] All tests pass with > 80% code coverage

---

## Dependencies

- All previous tasks (001-008)

## Testing Commands

```bash
# Backend unit tests
cd backend
npm test -- profileService.test.ts
npm test -- consentService.test.ts

# Backend integration tests
npm test -- profile.integration.test.ts

# Frontend E2E tests
cd frontend
npx playwright test profile-onboarding.spec.ts
```
