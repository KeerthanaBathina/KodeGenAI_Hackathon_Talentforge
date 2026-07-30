---
id: task_002
us_id: us_003
epic: EP-003
title: "Implement AI Scoring Algorithm with Factor Analysis"
status: done
layer: backend
effort: 4h
priority: critical
created: 2026-07-24
completed: 2026-07-24
---

# TASK-002 — Implement AI Scoring Algorithm with Factor Analysis

## Context

**User Story**: US-003 — AI Screening Score Computation with Configurable Thresholds  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: Scenario 1 (score 0-100), all scenarios (factor identification)

Implement the core AI screening algorithm that computes a match score (0-100) by comparing parsed resume data against requisition requirements. Identifies positive factors and skill gaps.

---

## Objective

Create scoring algorithm that:
1. Computes weighted score based on skill match, experience, education
2. Identifies positive factors (matched requirements)
3. Identifies skill gaps (missing requirements)
4. Returns structured output for storage in `screenings.factors` JSONB

---

## Implementation Steps

### Step 1 — Create Scoring Service

Create `backend/src/services/scoringService.ts`:

```typescript
import logger from '../utils/logger';

export interface ScoringFactors {
  positiveFactors: string[];
  skillGaps: string[];
  scoreBreakdown: {
    skillMatch: number; // 0-50 points
    experienceMatch: number; // 0-30 points
    educationMatch: number; // 0-20 points
  };
}

export interface ScoringInput {
  // From parsed resume
  parsedData: {
    skills: string[];
    experience_years: number;
    education: Array<{
      degree: string;
      field: string;
      institution: string;
    }>;
    employers: Array<{
      name: string;
      title: string;
    }>;
  };
  // From requisition
  requisition: {
    requiredSkills: string[];
    preferredSkills: string[];
    minExperienceYears: number;
    educationLevel: string; // "high_school" | "bachelors" | "masters" | "phd"
  };
}

const EDUCATION_HIERARCHY: Record<string, number> = {
  high_school: 0,
  associate: 1,
  bachelors: 2,
  bachelor: 2, // Alias
  masters: 3,
  master: 3, // Alias
  phd: 4,
  doctorate: 4, // Alias
};

export function computeScreeningScore(input: ScoringInput): {
  score: number;
  factors: ScoringFactors;
} {
  const { parsedData, requisition } = input;

  // 1. Skill Match (0-50 points)
  const skillScore = computeSkillScore(
    parsedData.skills,
    requisition.requiredSkills,
    requisition.preferredSkills
  );

  // 2. Experience Match (0-30 points)
  const experienceScore = computeExperienceScore(
    parsedData.experience_years,
    requisition.minExperienceYears
  );

  // 3. Education Match (0-20 points)
  const educationScore = computeEducationScore(
    parsedData.education,
    requisition.educationLevel
  );

  const totalScore = Math.round(
    skillScore.score + experienceScore.score + educationScore.score
  );

  // Compile factors
  const positiveFactors: string[] = [
    ...skillScore.matchedSkills.map((s) => `Skill: ${s}`),
    ...experienceScore.factors,
    ...educationScore.factors,
  ];

  const skillGaps: string[] = [
    ...skillScore.missingRequired.map((s) => `Missing required skill: ${s}`),
    ...skillScore.missingPreferred.map((s) => `Missing preferred skill: ${s}`),
  ];

  const factors: ScoringFactors = {
    positiveFactors,
    skillGaps,
    scoreBreakdown: {
      skillMatch: Math.round(skillScore.score),
      experienceMatch: Math.round(experienceScore.score),
      educationMatch: Math.round(educationScore.score),
    },
  };

  logger.info('Screening score computed', {
    totalScore,
    breakdown: factors.scoreBreakdown,
    positiveCount: positiveFactors.length,
    gapCount: skillGaps.length,
  });

  return {
    score: Math.min(100, Math.max(0, totalScore)), // Clamp to 0-100
    factors,
  };
}

function computeSkillScore(
  candidateSkills: string[],
  requiredSkills: string[],
  preferredSkills: string[]
): {
  score: number;
  matchedSkills: string[];
  missingRequired: string[];
  missingPreferred: string[];
} {
  const normalizedCandidate = candidateSkills.map((s) => s.toLowerCase().trim());

  // Required skills: 30 points max (essential)
  const normalizedRequired = requiredSkills.map((s) => s.toLowerCase().trim());
  const matchedRequired = normalizedRequired.filter((req) =>
    normalizedCandidate.some((cand) => cand.includes(req) || req.includes(cand))
  );
  const missingRequired = normalizedRequired.filter((req) => !matchedRequired.includes(req));

  const requiredScore =
    requiredSkills.length > 0 ? (matchedRequired.length / requiredSkills.length) * 30 : 0;

  // Preferred skills: 20 points max (nice-to-have)
  const normalizedPreferred = preferredSkills.map((s) => s.toLowerCase().trim());
  const matchedPreferred = normalizedPreferred.filter((pref) =>
    normalizedCandidate.some((cand) => cand.includes(pref) || pref.includes(cand))
  );
  const missingPreferred = normalizedPreferred.filter((pref) => !matchedPreferred.includes(pref));

  const preferredScore =
    preferredSkills.length > 0 ? (matchedPreferred.length / preferredSkills.length) * 20 : 0;

  return {
    score: requiredScore + preferredScore,
    matchedSkills: [...requiredSkills.filter((s) => matchedRequired.includes(s.toLowerCase())), ...preferredSkills.filter((s) => matchedPreferred.includes(s.toLowerCase()))],
    missingRequired: requiredSkills.filter((s) => missingRequired.includes(s.toLowerCase())),
    missingPreferred: preferredSkills.filter((s) => missingPreferred.includes(s.toLowerCase())),
  };
}

function computeExperienceScore(
  candidateYears: number,
  requiredYears: number
): {
  score: number;
  factors: string[];
} {
  if (requiredYears === 0) {
    return { score: 30, factors: ['No experience requirement'] };
  }

  const ratio = candidateYears / requiredYears;

  let score = 0;
  const factors: string[] = [];

  if (ratio >= 1.5) {
    score = 30;
    factors.push(`${candidateYears} years experience (significantly exceeds ${requiredYears} required)`);
  } else if (ratio >= 1.0) {
    score = 25;
    factors.push(`${candidateYears} years experience (meets ${requiredYears} required)`);
  } else if (ratio >= 0.75) {
    score = 20;
    factors.push(`${candidateYears} years experience (close to ${requiredYears} required)`);
  } else if (ratio >= 0.5) {
    score = 10;
    factors.push(`${candidateYears} years experience (below ${requiredYears} required)`);
  } else {
    score = 0;
    factors.push(`${candidateYears} years experience (significantly below ${requiredYears} required)`);
  }

  return { score, factors };
}

function computeEducationScore(
  candidateEducation: Array<{ degree: string; field: string }>,
  requiredLevel: string
): {
  score: number;
  factors: string[];
} {
  if (!requiredLevel || requiredLevel === 'none') {
    return { score: 20, factors: ['No education requirement'] };
  }

  const requiredRank = EDUCATION_HIERARCHY[requiredLevel.toLowerCase()] ?? 0;

  // Find highest education level
  let highestRank = -1;
  let highestDegree = '';

  for (const edu of candidateEducation) {
    const degreeNormalized = edu.degree.toLowerCase();
    for (const [level, rank] of Object.entries(EDUCATION_HIERARCHY)) {
      if (degreeNormalized.includes(level)) {
        if (rank > highestRank) {
          highestRank = rank;
          highestDegree = edu.degree;
        }
      }
    }
  }

  if (highestRank === -1) {
    return { score: 0, factors: ['No recognized degree found'] };
  }

  let score = 0;
  const factors: string[] = [];

  if (highestRank > requiredRank) {
    score = 20;
    factors.push(`${highestDegree} (exceeds requirement)`);
  } else if (highestRank === requiredRank) {
    score = 18;
    factors.push(`${highestDegree} (meets requirement)`);
  } else if (highestRank === requiredRank - 1) {
    score = 10;
    factors.push(`${highestDegree} (one level below requirement)`);
  } else {
    score = 0;
    factors.push(`${highestDegree} (below requirement)`);
  }

  return { score, factors };
}
```

### Step 2 — Add Integration with Requisition Data

Update requisition fetch to include screening criteria:

```typescript
// In screening workflow, fetch requisition with requirements
const requisition = await prisma.requisition.findUnique({
  where: { id: application.requisitionId },
  select: {
    id: true,
    title: true,
    requiredSkills: true,
    preferredSkills: true,
    minExperienceYears: true,
    educationLevel: true,
  },
});
```

---

## Acceptance Criteria

- [ ] Skill match scores 0-50 points (30 required, 20 preferred)
- [ ] Experience match scores 0-30 points (ratio-based)
- [ ] Education match scores 0-20 points (hierarchy-based)
- [ ] Total score clamped to 0-100 range
- [ ] Positive factors list all matched requirements
- [ ] Skill gaps list all missing required/preferred skills
- [ ] Score breakdown stored for transparency

---

## Testing Checklist

- [ ] Unit test: Perfect match scores 100
- [ ] Unit test: No matches scores 0
- [ ] Unit test: Partial skill match (50% required = 15 points)
- [ ] Unit test: Experience exactly at minimum (25 points)
- [ ] Unit test: Experience 50% below minimum (10 points)
- [ ] Unit test: Education exceeds requirement (20 points)
- [ ] Unit test: Education below requirement (0 points)
- [ ] Unit test: Case-insensitive skill matching
- [ ] Unit test: Partial skill keyword matching ("Node" matches "Node.js")

---

## Dependencies

- Parsed resume data from US-002
- Requisition model with screening criteria fields
- No external AI APIs (algorithm is rule-based)

---

## Definition of Done

- [ ] Scoring algorithm implemented with all three components
- [ ] Factor analysis generates positive/negative lists
- [ ] Score breakdown provides transparency
- [ ] All edge cases tested (0, 100, boundaries)
- [ ] Algorithm performance <100ms per screening
- [ ] Documentation of scoring logic
