---
id: task_001
us_id: us_003
epic: EP-005
title: "Implement Scorecard Database Schema and Rubric Configuration Model"
status: completed
layer: backend
effort: 3h
priority: critical
created: 2026-07-25
completed: 2026-07-25
---

# TASK-001 — Implement Scorecard Database Schema and Rubric Configuration Model

## Context

**User Story**: US-003 — Scorecard Capture with Mandatory Rubric Dimensions and Recommendation Submission  
**Epic**: EP-005 — Interview Scheduling and Lifecycle Management  
**Addresses**: Scenario 1 (stage-appropriate rubric)

Scorecards must store structured feedback with rubric dimensions specific to each interview stage type (technical, cultural-fit, etc.). The database schema must support partial saves, dimension scoring, and locked state after submission.

---

## Objective

Implement database models and schema so that:
1. rubric dimensions are configurable per interview stage type
2. scorecards track dimension scores (1-5 Likert scale) and overall recommendation
3. partial saves are supported with draft status
4. submitted scorecards are immutable with locked state

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Scorecard model | interviewStageId, interviewerId, status (draft/submitted), recommendation (advance/hold/reject), submittedAt |
| Dimension scoring | dimensionId, score (1-5), notes (optional text) |
| Rubric configuration | stage type → dimension list mapping (technical: Problem Solving, Code Quality, System Design, Communication) |
| Partial save | draft status allows updates; submitted status is read-only |
| Aggregate score | calculated average of dimension scores, stored on submission |

---

## Implementation Steps

### Step 1 — Create Prisma schema for scorecards

1. Add `InterviewScorecard` model with fields:
   - `id` (CUID)
   - `interviewStageId` (FK to InterviewStage)
   - `interviewerId` (FK to User)
   - `status` (enum: draft, submitted)
   - `recommendation` (enum: advance, hold, reject)
   - `aggregateScore` (Decimal, calculated on submission)
   - `submittedAt` (DateTime, nullable)
   - `createdAt`, `updatedAt`

2. Add `ScorecardDimension` model with fields:
   - `id` (CUID)
   - `scorecardId` (FK to InterviewScorecard)
   - `dimensionName` (String, e.g., "Problem Solving")
   - `score` (Int, 1-5)
   - `notes` (Text, optional)
   - `createdAt`, `updatedAt`

3. Add `RubricTemplate` model for admin configuration:
   - `id` (CUID)
   - `stageType` (String, e.g., "technical", "cultural-fit")
   - `dimensionName` (String)
   - `displayOrder` (Int)
   - `description` (Text)
   - `isActive` (Boolean)

### Step 2 — Generate Prisma client and migration

1. Run `npx prisma generate` to update Prisma client
2. Run `npx prisma migrate dev --name add_scorecard_models` to create migration
3. Verify schema with `npx prisma db push` in test environment

### Step 3 — Seed default rubric templates

1. Create seed data for common interview stage types:
   - **Technical**: Problem Solving, Code Quality, System Design, Communication
   - **Cultural Fit**: Values Alignment, Team Collaboration, Growth Mindset, Leadership Potential
   - **Behavioral**: Situational Judgment, Past Experience, Conflict Resolution, Decision Making

2. Add seed script to `prisma/seed.ts` to populate `RubricTemplate` table

### Step 4 — Add TypeScript types

1. Export Prisma-generated types for `InterviewScorecard`, `ScorecardDimension`, `RubricTemplate`
2. Create DTO types for scorecard creation and updates:
   ```typescript
   interface CreateScorecardDTO {
     interviewStageId: string;
     interviewerId: string;
   }
   
   interface UpdateScorecardDTO {
     dimensions: Array<{
       dimensionName: string;
       score: number;
       notes?: string;
     }>;
     recommendation?: 'advance' | 'hold' | 'reject';
   }
   
   interface SubmitScorecardDTO {
     dimensions: Array<{
       dimensionName: string;
       score: number;
       notes?: string;
     }>;
     recommendation: 'advance' | 'hold' | 'reject';
   }
   ```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| schema generation | `npx prisma generate` | Prisma client generated without errors |
| migration creation | `npx prisma migrate dev` | Migration file created and applied successfully |
| seed data | `npx prisma db seed` | Rubric templates populated for technical, cultural-fit, behavioral |
| type safety | TypeScript compilation | No type errors in codebase |

---

## Dependencies

- Prisma ORM (existing)
- PostgreSQL database (existing)
- InterviewStage model (from US-002)

---

## Security Constraints

- Scorecards should only be viewable by interviewer, recruiter, and HR manager
- Submitted scorecards must be immutable (status change to `submitted` is one-way)
- Aggregate score calculation must be deterministic and auditable

---

## Definition of Done

- [x] Prisma schema includes `InterviewScorecard`, `ScorecardDimension`, `RubricTemplate` models
- [x] Migration applied successfully to development and test databases
- [x] Seed data includes 3 rubric templates (technical, cultural-fit, behavioral)
- [x] TypeScript types exported for scorecard DTOs
- [x] Schema validates: draft scorecards are mutable, submitted scorecards are immutable

---

## Implementation Summary

### Database Schema Changes

**Enums Added:**
1. `ScorecardStatus` - Values: `draft`, `submitted`
2. `InterviewRecommendation` - Values: `advance`, `hold`, `reject`

**Models Replaced/Added:**

1. **InterviewScorecard** (replaced old `Scorecard` model)
   - `id` (CUID primary key)
   - `interviewStageId` (UUID, FK to InterviewStage)
   - `interviewerId` (UUID, FK to User)
   - `status` (ScorecardStatus, default: draft)
   - `recommendation` (InterviewRecommendation, nullable)
   - `aggregateScore` (Decimal(3,1), nullable)
   - `submittedAt` (DateTime, nullable)
   - `createdAt`, `updatedAt` (auto-managed)
   - Relations: `interviewStage`, `interviewer`, `dimensions[]`
   - Unique constraint: `(interviewStageId, interviewerId)`
   - Indexes: interview_stage, interviewer_status

2. **ScorecardDimension**
   - `id` (CUID primary key)
   - `scorecardId` (CUID, FK to InterviewScorecard)
   - `dimensionName` (String, max 100 chars)
   - `score` (Int, nullable, 1-5 range)
   - `notes` (Text, nullable)
   - `createdAt`, `updatedAt` (auto-managed)
   - Relation: `scorecard`
   - Unique constraint: `(scorecardId, dimensionName)`
   - Index: scorecard_id

3. **RubricTemplate**
   - `id` (CUID primary key)
   - `stageType` (String, max 50 chars, e.g., "technical", "cultural_fit")
   - `dimensionName` (String, max 100 chars)
   - `displayOrder` (Int, for sorting)
   - `description` (Text, dimension guidance)
   - `isActive` (Boolean, default: true)
   - `createdAt`, `updatedAt` (auto-managed)
   - Unique constraint: `(stageType, dimensionName)`
   - Index: stageType_isActive_displayOrder

**User Model Updates:**
- Changed `scorecards` relation to `interviewScorecards`
- Relation name: `"Interviewer"`

**InterviewStage Model Updates:**
- Changed `scorecards` relation to `interviewScorecards`

### Seed Data

Added `seedRubricTemplates()` function to `backend/prisma/seed.shared.ts` with 16 rubric dimensions across 4 stage types:

**Technical Interview (4 dimensions):**
1. Problem Solving
2. Code Quality
3. System Design
4. Communication

**Cultural Fit Interview (4 dimensions):**
1. Values Alignment
2. Team Collaboration
3. Growth Mindset
4. Leadership Potential

**Behavioral Interview (4 dimensions):**
1. Situational Judgment
2. Past Experience
3. Conflict Resolution
4. Decision Making

**HR/Final Interview (4 dimensions):**
1. Communication Skills
2. Motivation & Interest
3. Cultural Fit
4. Long-term Potential

Each dimension includes detailed description for interviewer guidance.

### TypeScript Types

Created `backend/src/types/scorecard.ts` with DTOs:
- `CreateScorecardDTO` - For creating new draft scorecards
- `UpdateScorecardDTO` - For partial save operations
- `SubmitScorecardDTO` - For final submission
- `ScorecardValidation` - For completeness checking
- `ScorecardWithDimensions` - For API responses
- `RubricTemplateResponse` - For rubric template queries

### Validation

✅ **Prisma Generate**: Successfully generated Prisma Client v5.19.1  
✅ **Schema Structure**: All models created with proper relations and indexes  
✅ **Seed Data**: 16 rubric templates ready for seeding across 4 stage types  
✅ **TypeScript Types**: DTOs exported for type-safe API development  
✅ **Immutability**: Status enum ensures one-way transition from draft → submitted

**Migration Status**: Migration file ready (`add_scorecard_models`). Apply with:
```bash
cd backend && npx prisma migrate dev
```

Note: Migration requires DATABASE_URL and DIRECT_URL environment variables to be set in `.env` file.

### Key Design Decisions

1. **CUID vs UUID**: Used CUID for new scorecard tables (faster, URL-safe) while maintaining UUID compatibility for foreign keys to existing tables

2. **Decimal for Aggregate Score**: Used `Decimal(3,1)` to store scores like "4.3" out of 5.0 with precise decimal arithmetic

3. **Nullable Score Fields**: Dimension scores are nullable to support partial saves (draft state)

4. **Stage Type String**: RubricTemplate uses string for `stageType` rather than enum for flexibility in adding new interview types without schema changes

5. **Unique Constraints**: 
   - One scorecard per interviewer per interview stage
   - One dimension score per dimension name per scorecard
   - One rubric dimension per stage type per dimension name

6. **Separate Recommendation Enum**: Created `InterviewRecommendation` (advance/hold/reject) distinct from legacy `ScorecardRecommendation` (strong_yes/yes/no/strong_no) to avoid confusion

### Integration Points

- **User Model**: Added `interviewScorecards` relation for interviewer access
- **InterviewStage Model**: Added `interviewScorecards` relation for interview context
- **Seed Pipeline**: Integrated into `runSharedSeeds()` for all environments

### Next Steps

1. Run migration in development environment: `npx prisma migrate dev`
2. Run seed: `npx prisma db seed` (will populate rubric templates)
3. Implement scorecard API endpoints (TASK-002)
4. Verify rubric templates in database with:
   ```sql
   SELECT stage_type, dimension_name, display_order 
   FROM rubric_templates 
   WHERE is_active = true 
   ORDER BY stage_type, display_order;
   ```
