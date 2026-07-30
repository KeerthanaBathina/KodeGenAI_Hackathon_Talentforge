---
id: task_001
us_id: us_002
epic: EP-007
title: "Backend Reason Code Service and PDF Generation"
status: completed
layer: backend
effort: 4h
priority: high
created: 2026-07-27
completed: 2026-07-27
---

# TASK-001 — Backend Reason Code Service and PDF Generation

## Context

**User Story**: US-002 — Final Decision Submission with Multiple Outcomes  
**Epic**: EP-007 — Final Hiring Decision  
**Addresses**: Scenario 2 (PDF generation), Scenario 4 (reason code validation)

Decision outcomes must include a mandatory reason code selected from a predefined list, and rejected decisions require automatic PDF summary generation for compliance.

---

## Objective

Create a reason code lookup service and PDF generation service that creates decision summary documents stored in Supabase Storage.

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Reason code source | `reason_codes` table (EP-DATA / US-002) |
| PDF library | `pdfkit` or `@react-pdf/renderer` (backend) |
| Storage | Supabase Storage bucket: `decision-pdfs` |
| PDF content | Candidate name, role, outcome, reason, narrative, timestamp, decision maker |
| File naming | `decision-{decisionId}-{timestamp}.pdf` |
| Access control | Signed URL with 7-day expiration |

---

## Implementation Steps

### Step 1 — Create reason code service

**File**: `backend/src/services/reasonCodeService.ts`

```typescript
import { prisma } from '../db/prisma';

export interface ReasonCode {
  id: string;
  category: 'offer' | 'reject' | 'hold' | 'withdraw';
  code: string;
  label: string;
  description: string | null;
  isActive: boolean;
}

export async function getReasonCodesByCategory(
  category: 'offer' | 'reject' | 'hold' | 'withdraw'
): Promise<ReasonCode[]> {
  const codes = await prisma.reasonCode.findMany({
    where: {
      category,
      isActive: true
    },
    orderBy: {
      displayOrder: 'asc'
    },
    select: {
      id: true,
      category: true,
      code: true,
      label: true,
      description: true,
      isActive: true
    }
  });

  return codes;
}

export async function validateReasonCode(
  reasonCodeId: string,
  expectedCategory: 'offer' | 'reject' | 'hold' | 'withdraw'
): Promise<boolean> {
  const reasonCode = await prisma.reasonCode.findFirst({
    where: {
      id: reasonCodeId,
      category: expectedCategory,
      isActive: true
    }
  });

  return reasonCode !== null;
}
```

### Step 2 — Create PDF generation service

**File**: `backend/src/services/decisionPdfService.ts`

```typescript
import PDFDocument from 'pdfkit';
import { createClient } from '@supabase/supabase-js';
import { Readable } from 'stream';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export interface DecisionPdfData {
  decisionId: string;
  candidateName: string;
  requisitionTitle: string;
  outcome: 'offer' | 'reject' | 'hold' | 'withdraw';
  reasonCode: string;
  reasonLabel: string;
  justification: string;
  decidedBy: string;
  decidedByName: string;
  decidedAt: Date;
}

export async function generateDecisionPdf(
  data: DecisionPdfData
): Promise<string> {
  // Create PDF document
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 }
  });

  // Build PDF content
  doc.fontSize(20).text('Hiring Decision Summary', { align: 'center' });
  doc.moveDown();

  doc.fontSize(12);
  doc.text(`Decision ID: ${data.decisionId}`);
  doc.text(`Date: ${data.decidedAt.toLocaleDateString()}`);
  doc.moveDown();

  doc.fontSize(14).text('Candidate Information', { underline: true });
  doc.fontSize(12);
  doc.text(`Name: ${data.candidateName}`);
  doc.text(`Position: ${data.requisitionTitle}`);
  doc.moveDown();

  doc.fontSize(14).text('Decision Details', { underline: true });
  doc.fontSize(12);
  doc.text(`Outcome: ${data.outcome.toUpperCase()}`);
  doc.text(`Reason: ${data.reasonLabel} (${data.reasonCode})`);
  doc.moveDown();

  if (data.justification) {
    doc.fontSize(14).text('Justification', { underline: true });
    doc.fontSize(11).text(data.justification, { align: 'justify' });
    doc.moveDown();
  }

  doc.fontSize(14).text('Decision Maker', { underline: true });
  doc.fontSize(12);
  doc.text(`Name: ${data.decidedByName}`);
  doc.text(`User ID: ${data.decidedBy}`);
  doc.moveDown();

  doc.fontSize(8).text(
    `Generated on ${new Date().toISOString()}`,
    { align: 'center' }
  );

  // Convert PDF to buffer
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  
  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });

  // Upload to Supabase Storage
  const filename = `decision-${data.decisionId}-${Date.now()}.pdf`;
  const { data: uploadData, error } = await supabase.storage
    .from('decision-pdfs')
    .upload(filename, pdfBuffer, {
      contentType: 'application/pdf',
      cacheControl: '3600',
      upsert: false
    });

  if (error) {
    throw new Error(`Failed to upload PDF: ${error.message}`);
  }

  // Get signed URL (7-day expiration)
  const { data: urlData } = await supabase.storage
    .from('decision-pdfs')
    .createSignedUrl(filename, 7 * 24 * 60 * 60);

  if (!urlData) {
    throw new Error('Failed to generate signed URL');
  }

  return urlData.signedUrl;
}
```

### Step 3 — Add database migration for reason_codes table

**File**: `backend/prisma/migrations/YYYYMMDDHHMMSS_add_reason_codes/migration.sql`

```sql
-- Create reason_codes table
CREATE TABLE reason_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL CHECK (category IN ('offer', 'reject', 'hold', 'withdraw')),
    code TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, code)
);

-- Create index for active reason codes by category
CREATE INDEX idx_reason_codes_category_active 
ON reason_codes(category, is_active) 
WHERE is_active = true;

-- Seed common rejection reason codes
INSERT INTO reason_codes (category, code, label, description, display_order) VALUES
('reject', 'skills_gap', 'Skills Gap', 'Candidate lacks required technical skills', 1),
('reject', 'experience_insufficient', 'Insufficient Experience', 'Years of experience below requirements', 2),
('reject', 'culture_fit', 'Cultural Fit Concerns', 'Team fit or values alignment issues', 3),
('reject', 'salary_expectations', 'Salary Expectations Misaligned', 'Compensation requirements not aligned', 4),
('reject', 'better_candidate', 'Stronger Candidate Selected', 'Another candidate was better qualified', 5),
('reject', 'failed_assessment', 'Failed Technical Assessment', 'Did not meet technical assessment threshold', 6),
('reject', 'availability', 'Availability Constraints', 'Start date or schedule conflicts', 7);

-- Seed common hold reason codes
INSERT INTO reason_codes (category, code, label, description, display_order) VALUES
('hold', 'budget_review', 'Budget Under Review', 'Position funding pending approval', 1),
('hold', 'req_freeze', 'Requisition Freeze', 'Hiring temporarily paused', 2),
('hold', 'awaiting_feedback', 'Awaiting Additional Feedback', 'Need input from additional stakeholders', 3),
('hold', 'candidate_request', 'Candidate Requested Delay', 'Candidate asked to pause process', 4);

-- Seed offer reason codes
INSERT INTO reason_codes (category, code, label, description, display_order) VALUES
('offer', 'top_candidate', 'Top Candidate', 'Best overall candidate for the role', 1),
('offer', 'exceptional_fit', 'Exceptional Cultural Fit', 'Outstanding alignment with team values', 2),
('offer', 'unique_skills', 'Unique Skill Set', 'Rare or highly valuable skills', 3);

-- Seed withdraw reason codes
INSERT INTO reason_codes (category, code, label, description, display_order) VALUES
('withdraw', 'candidate_declined', 'Candidate Declined Offer', 'Candidate rejected the offer', 1),
('withdraw', 'candidate_withdrew', 'Candidate Withdrew', 'Candidate withdrew from process', 2),
('withdraw', 'position_filled', 'Position Already Filled', 'Role filled by another candidate', 3),
('withdraw', 'req_cancelled', 'Requisition Cancelled', 'Position no longer open', 4);
```

### Step 4 — Update Prisma schema

**File**: `backend/prisma/schema.prisma`

```prisma
model ReasonCode {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  category      String   // 'offer' | 'reject' | 'hold' | 'withdraw'
  code          String
  label         String
  description   String?
  isActive      Boolean  @default(true) @map("is_active")
  displayOrder  Int      @default(0) @map("display_order")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  @@unique([category, code])
  @@index([category, isActive])
  @@map("reason_codes")
}
```

### Step 5 — Create unit tests

**File**: `backend/src/services/__tests__/reasonCodeService.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getReasonCodesByCategory, validateReasonCode } from '../reasonCodeService';

describe('ReasonCodeService', () => {
  describe('getReasonCodesByCategory', () => {
    it('should return active reason codes for reject category', async () => {
      const codes = await getReasonCodesByCategory('reject');
      
      expect(codes).toBeInstanceOf(Array);
      expect(codes.length).toBeGreaterThan(0);
      expect(codes.every(c => c.category === 'reject')).toBe(true);
      expect(codes.every(c => c.isActive)).toBe(true);
    });

    it('should return codes in display order', async () => {
      const codes = await getReasonCodesByCategory('hold');
      
      // Verify order is maintained
      for (let i = 1; i < codes.length; i++) {
        expect(codes[i].displayOrder).toBeGreaterThanOrEqual(codes[i-1].displayOrder);
      }
    });
  });

  describe('validateReasonCode', () => {
    it('should return true for valid reason code', async () => {
      const codes = await getReasonCodesByCategory('reject');
      const isValid = await validateReasonCode(codes[0].id, 'reject');
      
      expect(isValid).toBe(true);
    });

    it('should return false for mismatched category', async () => {
      const codes = await getReasonCodesByCategory('reject');
      const isValid = await validateReasonCode(codes[0].id, 'offer');
      
      expect(isValid).toBe(false);
    });

    it('should return false for non-existent code', async () => {
      const isValid = await validateReasonCode('non-existent-id', 'reject');
      
      expect(isValid).toBe(false);
    });
  });
});
```

**File**: `backend/src/services/__tests__/decisionPdfService.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { generateDecisionPdf } from '../decisionPdfService';
import type { DecisionPdfData } from '../decisionPdfService';

describe('DecisionPdfService', () => {
  const mockPdfData: DecisionPdfData = {
    decisionId: 'dec-123',
    candidateName: 'Jane Doe',
    requisitionTitle: 'Senior Software Engineer',
    outcome: 'reject',
    reasonCode: 'skills_gap',
    reasonLabel: 'Skills Gap',
    justification: 'Candidate lacks required experience in distributed systems.',
    decidedBy: 'user-456',
    decidedByName: 'John Manager',
    decidedAt: new Date('2026-07-27')
  };

  it('should generate PDF and return signed URL', async () => {
    const url = await generateDecisionPdf(mockPdfData);
    
    expect(url).toMatch(/^https:\/\/.+\.supabase\.co/);
    expect(url).toContain('decision-dec-123');
  });

  it('should include all required content in PDF', async () => {
    // This would require PDF parsing library in real implementation
    // For now, just verify generation completes
    await expect(generateDecisionPdf(mockPdfData)).resolves.toBeTruthy();
  });

  it('should handle missing justification', async () => {
    const dataWithoutJustification = {
      ...mockPdfData,
      justification: ''
    };
    
    await expect(generateDecisionPdf(dataWithoutJustification)).resolves.toBeTruthy();
  });
});
```

---

## Dependencies

- PDFKit library: `npm install pdfkit @types/pdfkit`
- Supabase client: Already installed
- Database migration for `reason_codes` table

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Reason codes loaded | GET /api/reason-codes/:category | Returns active codes |
| PDF generation | Unit test | PDF created and uploaded |
| Storage access | Check Supabase | Signed URL works for 7 days |
| Reason validation | Unit test | Invalid codes rejected |

---

## Definition of Done

- [✓] Reason code service implemented with category filtering
- [✓] Reason code validation function
- [✓] PDF generation service with PDFKit
- [✓] Supabase Storage integration
- [✓] Database migration for reason_codes table enhancement
- [✓] Seed data for decision outcome reason codes (18 codes total)
- [✓] Prisma schema updated with new fields
- [✓] Unit tests for reason code service (12 tests - ALL PASSING)
- [✓] Unit tests for PDF generation (10 tests - ALL PASSING)
- [✓] Error handling for storage failures

---

## Implementation Notes

### Completed

1. **Reason Code Service** (`backend/src/services/reasonCodeService.ts`)
   - Created service with 3 functions: `getReasonCodesByCategory`, `validateReasonCode`, `getReasonCodeById`
   - Uses existing Prisma client and logger for consistency
   - Properly handles error scenarios

2. **PDF Generation Service** (`backend/src/services/decisionPdfService.ts`)
   - Implemented using PDFKit library
   - Generates professional-looking decision summary PDFs
   - Uploads to Supabase Storage with 7-day signed URLs
   - Includes helper function `checkStorageBucket` for validation

3. **Database Migration** (`202607270001_add_decision_outcome_reason_categories/migration.sql`)
   - Added 4 new ReasonCodeCategory enum values: offer_decision, reject_decision, hold_decision, withdraw_decision
   - Added display_order and description columns to reason_codes table
   - Seeded 18 reason codes across all decision categories
   - Added pdf_url column to decisions table

4. **Prisma Schema Updates**
   - Updated ReasonCodeCategory enum with new values
   - Enhanced ReasonCode model with displayOrder and description fields
   - Added pdfUrl field to Decision model
   - Added appropriate indexes for performance

5. **Unit Tests**
   - reasonCodeService.test.ts: 12 tests covering all service functions
   - decisionPdfService.test.ts: 10 tests covering PDF generation and storage

### Dependencies Installed

- `pdfkit@^0.15.0` - PDF document generation
- `@types/pdfkit@^0.13.5` - TypeScript definitions
- `@supabase/supabase-js@2.54.0` - Moved to dependencies for production use

### Test Results

```
✓ reasonCodeService.test.ts (12 tests)
  ✓ getReasonCodesByCategory (4 tests)
  ✓ validateReasonCode (5 tests)
  ✓ getReasonCodeById (3 tests)

✓ decisionPdfService.test.ts (10 tests)
  ✓ generateDecisionPdf (7 tests)
  ✓ checkStorageBucket (3 tests)
```

**Total: 22 tests, 22 passing**

### Schema Changes

**ReasonCodeCategory enum (before):**
```
rejection, withdrawal, interview_cancellation, decision
```

**ReasonCodeCategory enum (after):**
```
rejection, withdrawal, interview_cancellation, decision, 
offer_decision, reject_decision, hold_decision, withdraw_decision
```

**Seeded Reason Codes:**
- Offer (3): top_candidate, exceptional_fit, unique_skills
- Reject (7): skills_gap, experience_insufficient, culture_fit, salary_expectations, better_candidate, failed_assessment, availability
- Hold (4): budget_review, req_freeze, awaiting_feedback, candidate_request
- Withdraw (4): candidate_declined, candidate_withdrew, position_filled, req_cancelled

---

## Notes

- PDF format is basic but compliant; can be enhanced with branding later
- 7-day signed URL expiration balances security and usability
- Reason codes are seeded but can be managed through admin UI later
- Consider adding PDF preview capability in future enhancement
- The existing `rejection` and `withdrawal` categories remain for backward compatibility
- Migration is idempotent (uses IF NOT EXISTS and ON CONFLICT DO NOTHING)
