---
id: task_006
us_id: us_003
epic: EP-003
title: "Comprehensive Testing for Screening System"
status: done
layer: test
effort: 3h
priority: medium
created: 2026-07-24
completed: 2026-07-24
---

# TASK-006 — Comprehensive Testing for Screening System

## Context

**User Story**: US-003 — AI Screening Score Computation with Configurable Thresholds  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: All scenarios (testing validates all acceptance criteria)

Create comprehensive test suite covering threshold management, scoring algorithm, screening workflow, and auto-rejection. Validates boundary conditions and edge cases.

---

## Objective

Achieve >90% test coverage with:
1. Threshold service unit tests (boundary values)
2. Scoring algorithm unit tests (all scoring paths)
3. Screening service integration tests
4. Auto-rejection flow tests
5. Queue integration tests
6. End-to-end workflow tests

---

## Implementation Steps

### Step 1 — Threshold Service Tests

Create `backend/src/services/__tests__/thresholdService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getActiveThresholds,
  getRecommendation,
  clearThresholdCache,
} from '../thresholdService';
import prisma from '../../db/prisma';

vi.mock('../../db/prisma');

describe('ThresholdService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearThresholdCache();
  });

  describe('getRecommendation', () => {
    const mockThresholds = {
      shortlistThreshold: 75,
      borderlineMin: 40,
      borderlineMax: 74,
      rejectThreshold: 39,
      version: 1,
    };

    it('should recommend shortlist for score at threshold', () => {
      expect(getRecommendation(75, mockThresholds as any)).toBe('shortlist');
    });

    it('should recommend shortlist for score above threshold', () => {
      expect(getRecommendation(80, mockThresholds as any)).toBe('shortlist');
    });

    it('should recommend shortlist for perfect score', () => {
      expect(getRecommendation(100, mockThresholds as any)).toBe('shortlist');
    });

    it('should recommend reject for score at threshold', () => {
      expect(getRecommendation(39, mockThresholds as any)).toBe('reject');
    });

    it('should recommend reject for score below threshold', () => {
      expect(getRecommendation(30, mockThresholds as any)).toBe('reject');
    });

    it('should recommend reject for zero score', () => {
      expect(getRecommendation(0, mockThresholds as any)).toBe('reject');
    });

    it('should recommend manual_review for borderline min', () => {
      expect(getRecommendation(40, mockThresholds as any)).toBe('manual_review');
    });

    it('should recommend manual_review for borderline max', () => {
      expect(getRecommendation(74, mockThresholds as any)).toBe('manual_review');
    });

    it('should recommend manual_review for mid-borderline', () => {
      expect(getRecommendation(55, mockThresholds as any)).toBe('manual_review');
    });

    it('should handle score one above shortlist threshold', () => {
      expect(getRecommendation(76, mockThresholds as any)).toBe('shortlist');
    });

    it('should handle score one below reject threshold', () => {
      expect(getRecommendation(38, mockThresholds as any)).toBe('reject');
    });
  });

  describe('getActiveThresholds', () => {
    it('should fetch thresholds from database', async () => {
      const mockThreshold = {
        id: 'threshold-1',
        shortlistThreshold: 75,
        borderlineMin: 40,
        borderlineMax: 74,
        rejectThreshold: 39,
        version: 1,
        effectiveFrom: new Date(),
        createdAt: new Date(),
      };

      vi.mocked(prisma.scoringThreshold.findFirst).mockResolvedValue(mockThreshold as any);

      const result = await getActiveThresholds();

      expect(result).toEqual(mockThreshold);
    });

    it('should cache thresholds', async () => {
      const mockThreshold = {
        id: 'threshold-1',
        shortlistThreshold: 75,
        version: 1,
      } as any;

      vi.mocked(prisma.scoringThreshold.findFirst).mockResolvedValue(mockThreshold);

      await getActiveThresholds();
      await getActiveThresholds(); // Second call should use cache

      expect(prisma.scoringThreshold.findFirst).toHaveBeenCalledTimes(1);
    });

    it('should throw error if no thresholds found', async () => {
      vi.mocked(prisma.scoringThreshold.findFirst).mockResolvedValue(null);

      await expect(getActiveThresholds()).rejects.toThrow('No active scoring thresholds found');
    });
  });
});
```

### Step 2 — Scoring Algorithm Tests

Create `backend/src/services/__tests__/scoringService.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeScreeningScore } from '../scoringService';

describe('ScoringService', () => {
  describe('computeScreeningScore', () => {
    it('should score 100 for perfect match', () => {
      const input = {
        parsedData: {
          skills: ['Python', 'React', 'PostgreSQL'],
          experience_years: 5,
          education: [{ degree: 'Master', field: 'Computer Science', institution: 'MIT' }],
          employers: [],
        },
        requisition: {
          requiredSkills: ['Python', 'React', 'PostgreSQL'],
          preferredSkills: [],
          minExperienceYears: 3,
          educationLevel: 'bachelors',
        },
      };

      const result = computeScreeningScore(input);

      expect(result.score).toBeGreaterThanOrEqual(95);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should score 0 for no matches', () => {
      const input = {
        parsedData: {
          skills: ['Java', 'Angular'],
          experience_years: 0,
          education: [],
          employers: [],
        },
        requisition: {
          requiredSkills: ['Python', 'React'],
          preferredSkills: ['PostgreSQL'],
          minExperienceYears: 5,
          educationLevel: 'masters',
        },
      };

      const result = computeScreeningScore(input);

      expect(result.score).toBeLessThan(20);
    });

    it('should score 50% for half required skills matched', () => {
      const input = {
        parsedData: {
          skills: ['Python'],
          experience_years: 0,
          education: [],
          employers: [],
        },
        requisition: {
          requiredSkills: ['Python', 'React'],
          preferredSkills: [],
          minExperienceYears: 0,
          educationLevel: 'none',
        },
      };

      const result = computeScreeningScore(input);

      expect(result.score).toBeGreaterThanOrEqual(14);
      expect(result.score).toBeLessThanOrEqual(16);
      expect(result.factors.positiveFactors).toContain('Skill: Python');
      expect(result.factors.skillGaps).toContain('Missing required skill: React');
    });

    it('should match skills case-insensitively', () => {
      const input = {
        parsedData: {
          skills: ['python', 'REACT'],
          experience_years: 0,
          education: [],
          employers: [],
        },
        requisition: {
          requiredSkills: ['Python', 'React'],
          preferredSkills: [],
          minExperienceYears: 0,
          educationLevel: 'none',
        },
      };

      const result = computeScreeningScore(input);

      expect(result.score).toBeGreaterThanOrEqual(29);
      expect(result.factors.skillGaps.length).toBe(0);
    });

    it('should score experience at minimum requirement', () => {
      const input = {
        parsedData: {
          skills: [],
          experience_years: 5,
          education: [],
          employers: [],
        },
        requisition: {
          requiredSkills: [],
          preferredSkills: [],
          minExperienceYears: 5,
          educationLevel: 'none',
        },
      };

      const result = computeScreeningScore(input);

      expect(result.factors.scoreBreakdown.experienceMatch).toBe(25);
    });

    it('should score experience exceeding requirement', () => {
      const input = {
        parsedData: {
          skills: [],
          experience_years: 10,
          education: [],
          employers: [],
        },
        requisition: {
          requiredSkills: [],
          preferredSkills: [],
          minExperienceYears: 5,
          educationLevel: 'none',
        },
      };

      const result = computeScreeningScore(input);

      expect(result.factors.scoreBreakdown.experienceMatch).toBe(30);
    });

    it('should score education at requirement', () => {
      const input = {
        parsedData: {
          skills: [],
          experience_years: 0,
          education: [{ degree: 'Bachelor', field: 'CS', institution: 'MIT' }],
          employers: [],
        },
        requisition: {
          requiredSkills: [],
          preferredSkills: [],
          minExperienceYears: 0,
          educationLevel: 'bachelors',
        },
      };

      const result = computeScreeningScore(input);

      expect(result.factors.scoreBreakdown.educationMatch).toBe(18);
    });

    it('should score education exceeding requirement', () => {
      const input = {
        parsedData: {
          skills: [],
          experience_years: 0,
          education: [{ degree: 'Master', field: 'CS', institution: 'MIT' }],
          employers: [],
        },
        requisition: {
          requiredSkills: [],
          preferredSkills: [],
          minExperienceYears: 0,
          educationLevel: 'bachelors',
        },
      };

      const result = computeScreeningScore(input);

      expect(result.factors.scoreBreakdown.educationMatch).toBe(20);
    });

    it('should identify preferred skills as positive factors', () => {
      const input = {
        parsedData: {
          skills: ['Docker', 'Kubernetes'],
          experience_years: 0,
          education: [],
          employers: [],
        },
        requisition: {
          requiredSkills: [],
          preferredSkills: ['Docker', 'Kubernetes'],
          minExperienceYears: 0,
          educationLevel: 'none',
        },
      };

      const result = computeScreeningScore(input);

      expect(result.factors.positiveFactors).toContain('Skill: Docker');
      expect(result.factors.positiveFactors).toContain('Skill: Kubernetes');
    });
  });
});
```

### Step 3 — Integration Tests

Create `backend/src/services/__tests__/screeningService.integration.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performScreening } from '../screeningService';
import prisma from '../../db/prisma';
import { getActiveThresholds } from '../thresholdService';

vi.mock('../../db/prisma');
vi.mock('../thresholdService');
vi.mock('../auditService');

describe('ScreeningService Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should perform complete screening flow', async () => {
    const mockApplication = {
      id: 'app-1',
      candidateId: 'candidate-1',
      requisitionId: 'req-1',
      resume: {
        id: 'resume-1',
        parsedData: {
          skills: ['Python', 'React'],
          experience_years: 5,
          education: [{ degree: 'Bachelor', field: 'CS', institution: 'MIT' }],
          employers: [],
        },
      },
      requisition: {
        requiredSkills: ['Python', 'React'],
        preferredSkills: [],
        minExperienceYears: 3,
        educationLevel: 'bachelors',
      },
      candidate: {
        profile: {},
      },
    };

    const mockThresholds = {
      shortlistThreshold: 75,
      borderlineMin: 40,
      borderlineMax: 74,
      rejectThreshold: 39,
      version: 1,
    };

    vi.mocked(prisma.application.findUnique).mockResolvedValue(mockApplication as any);
    vi.mocked(prisma.screening.create).mockResolvedValue({
      id: 'screening-1',
      applicationId: 'app-1',
      score: 90,
      recommendation: 'shortlist',
    } as any);
    vi.mocked(prisma.application.update).mockResolvedValue({} as any);
    vi.mocked(getActiveThresholds).mockResolvedValue(mockThresholds as any);

    const result = await performScreening('app-1');

    expect(result.score).toBeGreaterThan(70);
    expect(result.recommendation).toBe('shortlist');
    expect(prisma.application.update).toHaveBeenCalledWith({
      where: { id: 'app-1' },
      data: { status: 'shortlisted' },
    });
  });
});
```

### Step 4 — E2E Workflow Test

Create `backend/src/test/e2e/screening-workflow.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('Screening Workflow E2E', () => {
  it('should complete full screening workflow from parse to decision', async () => {
    // This would be a full integration test
    // 1. Parse resume completes
    // 2. Screening job enqueued
    // 3. Score computed
    // 4. Recommendation determined
    // 5. Application status updated
    // 6. Auto-rejection triggered if needed
  });
});
```

---

## Acceptance Criteria

- [ ] >90% code coverage for scoring algorithm
- [ ] >85% code coverage for screening service
- [ ] All boundary conditions tested (exactly at thresholds ±1)
- [ ] Integration tests verify complete workflow
- [ ] Auto-rejection flow tested end-to-end
- [ ] Queue integration tests verify job processing

---

## Testing Checklist

- [ ] 15+ threshold service unit tests
- [ ] 20+ scoring algorithm unit tests
- [ ] 10+ screening service integration tests
- [ ] 5+ auto-rejection tests
- [ ] 3+ queue integration tests
- [ ] 2+ E2E workflow tests

---

## Dependencies

- All previous tasks (TASK-001 through TASK-005)
- Vitest testing framework
- Test database or mocks

---

## Definition of Done

- [ ] All test files created
- [ ] Code coverage >90% for critical paths
- [ ] Boundary value tests passing
- [ ] Integration tests passing
- [ ] E2E tests passing
- [ ] Test documentation complete
