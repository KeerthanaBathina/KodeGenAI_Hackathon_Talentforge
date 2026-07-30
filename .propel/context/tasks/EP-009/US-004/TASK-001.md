---
id: TASK-001
user_story: US-004
title: "Backend - CSV Import Service Layer with Validation"
status: done
priority: high
assigned_to: backend-team
estimated_hours: 8
layer: backend
dependencies: []
---

# TASK-001 — Backend - CSV Import Service Layer with Validation

## Objective

Implement comprehensive CSV parsing, validation, duplicate detection, and batch import service for bulk requisition creation with per-row error reporting.

## Scope

Create service layer that handles CSV parsing, column validation, row-by-row validation, duplicate detection based on (title, department, location), and generates detailed error reports for invalid rows while importing valid ones.

## Technical Requirements

### 1. CSV Import Service

Create `/backend/src/services/csvImportService.ts`:

#### CSV Schema Definition

```typescript
interface RequisitionCSVRow {
  role_title: string;
  department: string;
  location: string;
  job_type: "full_time" | "part_time" | "contract" | "internship";
  slots: number;
  job_family: string; // Job family name (will be looked up)
  required_skills?: string; // Comma-separated
  preferred_skills?: string; // Comma-separated
  min_experience_years?: number;
  education_level?: string;
  eligibility_criteria?: string; // JSON string
}

// Required CSV columns
const REQUIRED_COLUMNS = [
  "role_title",
  "department",
  "location",
  "job_type",
  "slots",
  "job_family",
] as const;

// Optional CSV columns
const OPTIONAL_COLUMNS = [
  "required_skills",
  "preferred_skills",
  "min_experience_years",
  "education_level",
  "eligibility_criteria",
] as const;
```

#### CSV Parsing with papa-parse

```typescript
import Papa from "papaparse";

interface ParsedCSVResult {
  data: Record<string, any>[];
  errors: Papa.ParseError[];
  meta: Papa.ParseMeta;
}

async function parseCSVFile(fileBuffer: Buffer): Promise<ParsedCSVResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(fileBuffer.toString("utf-8"), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim().toLowerCase(),
      complete: (results) => resolve(results),
      error: (error) => reject(error),
    });
  });
}
```

#### Column Validation

```typescript
interface ValidationResult {
  valid: boolean;
  errors: Array<{
    type: "column_missing" | "column_extra";
    column: string;
    message: string;
  }>;
}

function validateCSVColumns(headers: string[]): ValidationResult {
  const errors: ValidationResult["errors"] = [];

  // Check for missing required columns
  for (const requiredCol of REQUIRED_COLUMNS) {
    if (!headers.includes(requiredCol)) {
      errors.push({
        type: "column_missing",
        column: requiredCol,
        message: `Missing required column: ${requiredCol}`,
      });
    }
  }

  // Check for unknown columns (warn but don't block)
  const validColumns = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];
  for (const header of headers) {
    if (!validColumns.includes(header as any)) {
      errors.push({
        type: "column_extra",
        column: header,
        message: `Unknown column: ${header} (will be ignored)`,
      });
    }
  }

  return {
    valid: errors.filter((e) => e.type === "column_missing").length === 0,
    errors,
  };
}
```

#### Row Validation

```typescript
interface RowValidationError {
  rowNumber: number;
  field: string;
  value: any;
  message: string;
}

interface ValidatedRow {
  valid: boolean;
  rowNumber: number;
  data: RequisitionCSVRow;
  errors: RowValidationError[];
}

async function validateRow(
  row: Record<string, any>,
  rowNumber: number,
  jobFamilyCache: Map<string, string>,
): Promise<ValidatedRow> {
  const errors: RowValidationError[] = [];

  // Validate required fields
  if (!row.role_title || row.role_title.trim() === "") {
    errors.push({
      rowNumber,
      field: "role_title",
      value: row.role_title,
      message: "Role title is required",
    });
  } else if (row.role_title.length > 255) {
    errors.push({
      rowNumber,
      field: "role_title",
      value: row.role_title,
      message: "Role title exceeds 255 characters",
    });
  }

  if (!row.department || row.department.trim() === "") {
    errors.push({
      rowNumber,
      field: "department",
      value: row.department,
      message: "Department is required",
    });
  }

  if (!row.location || row.location.trim() === "") {
    errors.push({
      rowNumber,
      field: "location",
      value: row.location,
      message: "Location is required",
    });
  }

  // Validate job_type enum
  const validJobTypes = ["full_time", "part_time", "contract", "internship"];
  if (!row.job_type || !validJobTypes.includes(row.job_type)) {
    errors.push({
      rowNumber,
      field: "job_type",
      value: row.job_type,
      message: `Invalid job type. Must be one of: ${validJobTypes.join(", ")}`,
    });
  }

  // Validate slots
  const slots = parseInt(row.slots);
  if (isNaN(slots) || slots < 1) {
    errors.push({
      rowNumber,
      field: "slots",
      value: row.slots,
      message: "Slots must be a positive integer",
    });
  }

  // Validate job_family (lookup)
  if (!row.job_family) {
    errors.push({
      rowNumber,
      field: "job_family",
      value: row.job_family,
      message: "Job family is required",
    });
  } else {
    // Check if job family exists in cache
    if (!jobFamilyCache.has(row.job_family.toLowerCase())) {
      errors.push({
        rowNumber,
        field: "job_family",
        value: row.job_family,
        message: `Job family "${row.job_family}" not found in system`,
      });
    }
  }

  // Validate optional fields
  if (
    row.min_experience_years !== undefined &&
    row.min_experience_years !== ""
  ) {
    const experience = parseInt(row.min_experience_years);
    if (isNaN(experience) || experience < 0) {
      errors.push({
        rowNumber,
        field: "min_experience_years",
        value: row.min_experience_years,
        message: "Minimum experience years must be a non-negative integer",
      });
    }
  }

  // Validate eligibility_criteria JSON if provided
  if (row.eligibility_criteria) {
    try {
      JSON.parse(row.eligibility_criteria);
    } catch (e) {
      errors.push({
        rowNumber,
        field: "eligibility_criteria",
        value: row.eligibility_criteria,
        message: "Eligibility criteria must be valid JSON",
      });
    }
  }

  return {
    valid: errors.length === 0,
    rowNumber,
    data: row as RequisitionCSVRow,
    errors,
  };
}
```

#### Duplicate Detection

```typescript
interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingRequisitionId?: string;
}

async function checkDuplicate(
  title: string,
  department: string,
  location: string,
): Promise<DuplicateCheckResult> {
  const existing = await prisma.requisition.findFirst({
    where: {
      title: { equals: title, mode: "insensitive" },
      department: { equals: department, mode: "insensitive" },
      location: { equals: location, mode: "insensitive" },
      status: { notIn: ["cancelled"] }, // Exclude cancelled requisitions
    },
    select: { id: true },
  });

  return {
    isDuplicate: existing !== null,
    existingRequisitionId: existing?.id,
  };
}
```

#### Batch Import with Validation

```typescript
interface ImportResult {
  success: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  importedRequisitions: string[]; // Array of created requisition IDs
  errors: RowValidationError[];
  duplicates: Array<{
    rowNumber: number;
    title: string;
    department: string;
    location: string;
    existingRequisitionId: string;
  }>;
}

export async function importRequisitionsFromCSV(
  fileBuffer: Buffer,
  uploadedBy: string, // User ID for audit
): Promise<ImportResult> {
  // 1. Parse CSV
  const parseResult = await parseCSVFile(fileBuffer);

  if (parseResult.errors.length > 0) {
    throw new Error(`CSV parsing failed: ${parseResult.errors[0].message}`);
  }

  // 2. Validate columns
  const headers = parseResult.meta.fields || [];
  const columnValidation = validateCSVColumns(headers);

  if (!columnValidation.valid) {
    throw new Error(columnValidation.errors[0].message);
  }

  // 3. Pre-load job families into cache
  const jobFamilies = await prisma.jobFamily.findMany({
    select: { id: true, name: true },
  });
  const jobFamilyCache = new Map(
    jobFamilies.map((jf) => [jf.name.toLowerCase(), jf.id]),
  );

  // 4. Validate all rows
  const validatedRows = await Promise.all(
    parseResult.data.map(
      (row, index) => validateRow(row, index + 2, jobFamilyCache), // +2 for header row + 1-based indexing
    ),
  );

  // 5. Separate valid and invalid rows
  const validRows = validatedRows.filter((r) => r.valid);
  const invalidRows = validatedRows.filter((r) => !r.valid);

  // 6. Check for duplicates in valid rows
  const duplicates: ImportResult["duplicates"] = [];
  const rowsToImport: ValidatedRow[] = [];

  for (const validRow of validRows) {
    const duplicateCheck = await checkDuplicate(
      validRow.data.role_title,
      validRow.data.department,
      validRow.data.location,
    );

    if (duplicateCheck.isDuplicate) {
      duplicates.push({
        rowNumber: validRow.rowNumber,
        title: validRow.data.role_title,
        department: validRow.data.department,
        location: validRow.data.location,
        existingRequisitionId: duplicateCheck.existingRequisitionId!,
      });
    } else {
      rowsToImport.push(validRow);
    }
  }

  // 7. Batch insert valid, non-duplicate rows
  const importedRequisitions: string[] = [];

  for (const row of rowsToImport) {
    try {
      const requisition = await prisma.requisition.create({
        data: {
          title: row.data.role_title.trim(),
          department: row.data.department.trim(),
          location: row.data.location.trim(),
          jobType: row.data.job_type,
          slots: parseInt(row.data.slots.toString()),
          jobFamilyId: jobFamilyCache.get(row.data.job_family.toLowerCase())!,
          requiredSkills: row.data.required_skills
            ? row.data.required_skills
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
          preferredSkills: row.data.preferred_skills
            ? row.data.preferred_skills
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
          minExperienceYears: row.data.min_experience_years
            ? parseInt(row.data.min_experience_years.toString())
            : 0,
          educationLevel: row.data.education_level || null,
          eligibilityCriteria: row.data.eligibility_criteria
            ? JSON.parse(row.data.eligibility_criteria)
            : {},
          status: "open",
          openedAt: new Date(),
        },
      });

      importedRequisitions.push(requisition.id);
    } catch (error) {
      // Log insert error but continue with other rows
      logger.error("[CSVImport] Failed to insert requisition", {
        row: row.rowNumber,
        error,
      });

      invalidRows.push({
        valid: false,
        rowNumber: row.rowNumber,
        data: row.data,
        errors: [
          {
            rowNumber: row.rowNumber,
            field: "general",
            value: null,
            message: `Database error: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
      });
    }
  }

  // 8. Create audit log
  await prisma.auditEvent.create({
    data: {
      userId: uploadedBy,
      action: "requisition.bulk_import",
      entityType: "requisition",
      entityId: null,
      metadata: {
        totalRows: parseResult.data.length,
        validRows: validRows.length,
        invalidRows: invalidRows.length,
        duplicateRows: duplicates.length,
        importedCount: importedRequisitions.length,
      },
    },
  });

  // 9. Return comprehensive result
  return {
    success: importedRequisitions.length > 0,
    totalRows: parseResult.data.length,
    validRows: validRows.length,
    invalidRows: invalidRows.length,
    duplicateRows: duplicates.length,
    importedRequisitions,
    errors: invalidRows.flatMap((row) => row.errors),
    duplicates,
  };
}
```

#### Error Report Generation

```typescript
export function generateErrorReportCSV(result: ImportResult): string {
  const errorRows: Array<{
    row_number: number;
    error_type: string;
    field: string;
    value: string;
    message: string;
  }> = [];

  // Add validation errors
  for (const error of result.errors) {
    errorRows.push({
      row_number: error.rowNumber,
      error_type: "validation",
      field: error.field,
      value: String(error.value || ""),
      message: error.message,
    });
  }

  // Add duplicate errors
  for (const duplicate of result.duplicates) {
    errorRows.push({
      row_number: duplicate.rowNumber,
      error_type: "duplicate",
      field: "role_title, department, location",
      value: `${duplicate.title}, ${duplicate.department}, ${duplicate.location}`,
      message: `Duplicate requisition (existing ID: ${duplicate.existingRequisitionId})`,
    });
  }

  // Convert to CSV using papa-parse
  return Papa.unparse(errorRows, {
    header: true,
    columns: ["row_number", "error_type", "field", "value", "message"],
  });
}
```

### 2. Dependencies Installation

Add to `/backend/package.json`:

```json
{
  "dependencies": {
    "papaparse": "^5.4.1"
  },
  "devDependencies": {
    "@types/papaparse": "^5.3.7"
  }
}
```

## Acceptance Criteria

- [ ] CSV parsing handles files with proper header detection
- [ ] Column validation rejects files missing required columns immediately
- [ ] Row validation checks all required and optional fields with appropriate error messages
- [ ] Job family lookup validates against existing JobFamily records
- [ ] Duplicate detection checks (title, department, location) case-insensitively
- [ ] Valid rows are inserted with status='open' and openedAt=now()
- [ ] Invalid rows are collected with row number, field, and message
- [ ] Duplicate rows are skipped with reference to existing requisition ID
- [ ] Error report CSV generated with all validation and duplicate errors
- [ ] Audit event logged with import statistics
- [ ] Service handles large CSV files (1000+ rows) efficiently
- [ ] Transaction handling ensures data consistency

## Testing Requirements

### Unit Tests

File: `/backend/src/services/__tests__/csvImportService.test.ts`

```typescript
describe("CSV Import Service", () => {
  describe("parseCSVFile", () => {
    it("should parse valid CSV with headers", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Software Development`;

      const result = await parseCSVFile(Buffer.from(csv));

      expect(result.data).toHaveLength(1);
      expect(result.data[0].role_title).toBe("Senior Engineer");
    });

    it("should handle empty lines", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family

Senior Engineer,Engineering,Remote,full_time,2,Software Development

`;
      const result = await parseCSVFile(Buffer.from(csv));
      expect(result.data).toHaveLength(1);
    });
  });

  describe("validateCSVColumns", () => {
    it("should pass with all required columns", () => {
      const headers = [
        "role_title",
        "department",
        "location",
        "job_type",
        "slots",
        "job_family",
      ];
      const result = validateCSVColumns(headers);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail with missing required column", () => {
      const headers = [
        "role_title",
        "department",
        "location",
        "slots",
        "job_family",
      ];
      const result = validateCSVColumns(headers);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: "column_missing",
          column: "job_type",
        }),
      );
    });

    it("should warn about unknown columns", () => {
      const headers = [
        "role_title",
        "department",
        "location",
        "job_type",
        "slots",
        "job_family",
        "unknown_column",
      ];
      const result = validateCSVColumns(headers);

      expect(result.valid).toBe(true);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: "column_extra",
          column: "unknown_column",
        }),
      );
    });
  });

  describe("validateRow", () => {
    it("should validate row with all required fields", async () => {
      const jobFamilyCache = new Map([["software development", "jf-123"]]);
      const row = {
        role_title: "Senior Engineer",
        department: "Engineering",
        location: "Remote",
        job_type: "full_time",
        slots: "2",
        job_family: "Software Development",
      };

      const result = await validateRow(row, 2, jobFamilyCache);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject row with missing required field", async () => {
      const jobFamilyCache = new Map([["software development", "jf-123"]]);
      const row = {
        role_title: "",
        department: "Engineering",
        location: "Remote",
        job_type: "full_time",
        slots: "2",
        job_family: "Software Development",
      };

      const result = await validateRow(row, 2, jobFamilyCache);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: "role_title",
          message: "Role title is required",
        }),
      );
    });

    it("should reject row with invalid job_type", async () => {
      const jobFamilyCache = new Map([["software development", "jf-123"]]);
      const row = {
        role_title: "Engineer",
        department: "Engineering",
        location: "Remote",
        job_type: "invalid_type",
        slots: "2",
        job_family: "Software Development",
      };

      const result = await validateRow(row, 2, jobFamilyCache);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: "job_type",
          message: expect.stringContaining("Invalid job type"),
        }),
      );
    });

    it("should reject row with non-existent job family", async () => {
      const jobFamilyCache = new Map([["software development", "jf-123"]]);
      const row = {
        role_title: "Engineer",
        department: "Engineering",
        location: "Remote",
        job_type: "full_time",
        slots: "2",
        job_family: "Non-Existent Family",
      };

      const result = await validateRow(row, 2, jobFamilyCache);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: "job_family",
          message: expect.stringContaining("not found in system"),
        }),
      );
    });
  });

  describe("checkDuplicate", () => {
    it("should detect duplicate requisition", async () => {
      await prisma.requisition.create({
        data: {
          title: "Senior Engineer",
          department: "Engineering",
          location: "Remote",
          jobType: "full_time",
          slots: 2,
          jobFamilyId: "jf-123",
          status: "open",
        },
      });

      const result = await checkDuplicate(
        "Senior Engineer",
        "Engineering",
        "Remote",
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.existingRequisitionId).toBeDefined();
    });

    it("should not flag cancelled requisitions as duplicates", async () => {
      await prisma.requisition.create({
        data: {
          title: "Senior Engineer",
          department: "Engineering",
          location: "Remote",
          jobType: "full_time",
          slots: 2,
          jobFamilyId: "jf-123",
          status: "cancelled",
        },
      });

      const result = await checkDuplicate(
        "Senior Engineer",
        "Engineering",
        "Remote",
      );

      expect(result.isDuplicate).toBe(false);
    });

    it("should perform case-insensitive duplicate check", async () => {
      await prisma.requisition.create({
        data: {
          title: "SENIOR ENGINEER",
          department: "ENGINEERING",
          location: "REMOTE",
          jobType: "full_time",
          slots: 2,
          jobFamilyId: "jf-123",
          status: "open",
        },
      });

      const result = await checkDuplicate(
        "senior engineer",
        "engineering",
        "remote",
      );

      expect(result.isDuplicate).toBe(true);
    });
  });

  describe("importRequisitionsFromCSV", () => {
    it("should import valid CSV with multiple rows", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Software Development
Product Manager,Product,San Francisco,full_time,1,Product Management`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      expect(result.success).toBe(true);
      expect(result.totalRows).toBe(2);
      expect(result.validRows).toBe(2);
      expect(result.importedRequisitions).toHaveLength(2);
    });

    it("should skip invalid rows but import valid ones", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Software Development
,Marketing,New York,full_time,1,Marketing
Product Manager,Product,San Francisco,full_time,1,Product Management`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      expect(result.totalRows).toBe(3);
      expect(result.validRows).toBe(2);
      expect(result.invalidRows).toBe(1);
      expect(result.importedRequisitions).toHaveLength(2);
      expect(result.errors[0].field).toBe("role_title");
    });

    it("should detect and skip duplicates", async () => {
      // Create existing requisition
      await prisma.requisition.create({
        data: {
          title: "Senior Engineer",
          department: "Engineering",
          location: "Remote",
          jobType: "full_time",
          slots: 2,
          jobFamilyId: "jf-123",
          status: "open",
        },
      });

      const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Software Development
Product Manager,Product,San Francisco,full_time,1,Product Management`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      expect(result.duplicateRows).toBe(1);
      expect(result.importedRequisitions).toHaveLength(1);
      expect(result.duplicates[0].title).toBe("Senior Engineer");
    });

    it("should create audit log on import", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Software Development`;

      await importRequisitionsFromCSV(Buffer.from(csv), "user-123");

      const auditEvent = await prisma.auditEvent.findFirst({
        where: {
          action: "requisition.bulk_import",
          userId: "user-123",
        },
      });

      expect(auditEvent).toBeDefined();
      expect(auditEvent?.metadata).toMatchObject({
        totalRows: 1,
        importedCount: 1,
      });
    });
  });

  describe("generateErrorReportCSV", () => {
    it("should generate CSV with validation errors", () => {
      const result: ImportResult = {
        success: false,
        totalRows: 2,
        validRows: 1,
        invalidRows: 1,
        duplicateRows: 0,
        importedRequisitions: [],
        errors: [
          {
            rowNumber: 2,
            field: "role_title",
            value: "",
            message: "Role title is required",
          },
        ],
        duplicates: [],
      };

      const csv = generateErrorReportCSV(result);

      expect(csv).toContain("row_number");
      expect(csv).toContain("error_type");
      expect(csv).toContain("validation");
      expect(csv).toContain("Role title is required");
    });

    it("should include duplicate errors in report", () => {
      const result: ImportResult = {
        success: true,
        totalRows: 2,
        validRows: 1,
        invalidRows: 0,
        duplicateRows: 1,
        importedRequisitions: ["req-123"],
        errors: [],
        duplicates: [
          {
            rowNumber: 2,
            title: "Senior Engineer",
            department: "Engineering",
            location: "Remote",
            existingRequisitionId: "req-existing",
          },
        ],
      };

      const csv = generateErrorReportCSV(result);

      expect(csv).toContain("duplicate");
      expect(csv).toContain("req-existing");
    });
  });
});
```

## Files to Create/Modify

### Create

- `/backend/src/services/csvImportService.ts` - Main CSV import service
- `/backend/src/__tests__/services/csvImportService.test.ts` - Unit tests

### Modify

- `/backend/package.json` - Add papaparse dependency

## Dependencies

- Prisma ORM for database operations
- papaparse library for CSV parsing
- Existing JobFamily and Requisition models
- Audit logging infrastructure

## Related User Story

**US-004 Scenario Mapping:**

- ✅ Scenario 1: Valid CSV imported and requisitions created
- ✅ Scenario 2: Invalid rows reported without blocking valid rows
- ✅ Scenario 3: CSV column headers validated before processing
- ✅ Scenario 4: Import is idempotent with duplicate detection

## Notes

- Case-insensitive duplicate detection prevents common user errors
- Job family lookup pre-loaded into cache for performance
- Error report includes both validation and duplicate errors
- Skills parsed from comma-separated strings in CSV
- Eligibility criteria expected as JSON string in CSV
- Status automatically set to 'open' for imported requisitions
- Transaction handling ensures atomicity per row
- Large file handling: process in batches if needed (future enhancement)
