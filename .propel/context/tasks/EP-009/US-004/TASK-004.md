---
id: TASK-004
user_story: US-004
title: "Testing - Comprehensive Bulk Import Tests"
status: todo
priority: high
assigned_to: qa-team
estimated_hours: 6
layer: testing
dependencies: [TASK-001, TASK-002, TASK-003]
---

# TASK-004 — Testing - Comprehensive Bulk Import Tests

## Objective

Implement comprehensive test coverage for CSV bulk import functionality including unit tests, integration tests, and E2E tests with focus on validation logic, duplicate detection, and error reporting.

## Scope

Create tests for CSV parsing service, API endpoints, frontend components, and end-to-end user workflows with emphasis on data accuracy, error handling, and edge cases.

## Testing Requirements

### 1. Backend Unit Tests - Edge Cases

#### File: `/backend/src/__tests__/services/csvImportService.edge-cases.test.ts`

```typescript
describe("CSV Import Edge Cases", () => {
  describe("Large File Handling", () => {
    it("should handle CSV with 1000 rows efficiently", async () => {
      const rows = Array(1000)
        .fill(null)
        .map(
          (_, i) =>
            `Engineer ${i},Engineering,Remote,full_time,1,Software Development`,
        );
      const csv = `role_title,department,location,job_type,slots,job_family\n${rows.join("\n")}`;

      const startTime = Date.now();
      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );
      const duration = Date.now() - startTime;

      expect(result.totalRows).toBe(1000);
      expect(duration).toBeLessThan(30000); // Should complete in under 30 seconds
    });
  });

  describe("Special Characters in Data", () => {
    it("should handle commas within quoted fields", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family
"Senior Engineer, Backend",Engineering,Remote,full_time,2,Software Development`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      expect(result.importedRequisitions).toHaveLength(1);

      const requisition = await prisma.requisition.findFirst({
        where: { id: result.importedRequisitions[0] },
      });

      expect(requisition?.title).toBe("Senior Engineer, Backend");
    });

    it("should handle newlines within quoted fields", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family
"Senior Engineer
Full Stack",Engineering,Remote,full_time,2,Software Development`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      expect(result.importedRequisitions).toHaveLength(1);
    });

    it("should handle special characters in skills", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family,required_skills
Senior Engineer,Engineering,Remote,full_time,2,Software Development,"C#, .NET, SQL Server"`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      const requisition = await prisma.requisition.findFirst({
        where: { id: result.importedRequisitions[0] },
      });

      expect(requisition?.requiredSkills).toEqual(["C#", ".NET", "SQL Server"]);
    });

    it("should handle unicode characters", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family
Ingénieur Logiciel,Ingénierie,Montréal,full_time,2,Software Development`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      expect(result.importedRequisitions).toHaveLength(1);
    });
  });

  describe("Empty and Whitespace Handling", () => {
    it("should trim whitespace from fields", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family
  Senior Engineer  ,  Engineering  ,  Remote  ,full_time,2,Software Development`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      const requisition = await prisma.requisition.findFirst({
        where: { id: result.importedRequisitions[0] },
      });

      expect(requisition?.title).toBe("Senior Engineer");
      expect(requisition?.department).toBe("Engineering");
    });

    it("should skip completely empty rows", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Software Development

Product Manager,Product,San Francisco,full_time,1,Product Management`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      expect(result.totalRows).toBe(2); // Empty row should be skipped
      expect(result.importedRequisitions).toHaveLength(2);
    });

    it("should handle optional fields left empty", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family,required_skills,min_experience_years
Senior Engineer,Engineering,Remote,full_time,2,Software Development,,`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      expect(result.importedRequisitions).toHaveLength(1);

      const requisition = await prisma.requisition.findFirst({
        where: { id: result.importedRequisitions[0] },
      });

      expect(requisition?.requiredSkills).toEqual([]);
      expect(requisition?.minExperienceYears).toBe(0);
    });
  });

  describe("JSON Eligibility Criteria", () => {
    it("should parse valid JSON eligibility criteria", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family,eligibility_criteria
Senior Engineer,Engineering,Remote,full_time,2,Software Development,"{""citizenship"": ""US Citizen"", ""clearance"": ""Secret""}"`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      const requisition = await prisma.requisition.findFirst({
        where: { id: result.importedRequisitions[0] },
      });

      expect(requisition?.eligibilityCriteria).toEqual({
        citizenship: "US Citizen",
        clearance: "Secret",
      });
    });

    it("should reject invalid JSON in eligibility criteria", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family,eligibility_criteria
Senior Engineer,Engineering,Remote,full_time,2,Software Development,"{invalid json}"`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      expect(result.invalidRows).toBe(1);
      expect(result.errors[0].field).toBe("eligibility_criteria");
    });
  });

  describe("Duplicate Detection Edge Cases", () => {
    it("should detect case-insensitive duplicates", async () => {
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

      const csv = `role_title,department,location,job_type,slots,job_family
senior engineer,engineering,remote,full_time,2,Software Development`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      expect(result.duplicateRows).toBe(1);
      expect(result.importedRequisitions).toHaveLength(0);
    });

    it("should not flag different location as duplicate", async () => {
      await prisma.requisition.create({
        data: {
          title: "Senior Engineer",
          department: "Engineering",
          location: "San Francisco",
          jobType: "full_time",
          slots: 2,
          jobFamilyId: "jf-123",
          status: "open",
        },
      });

      const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Software Development`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      expect(result.duplicateRows).toBe(0);
      expect(result.importedRequisitions).toHaveLength(1);
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

      const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Software Development`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      expect(result.duplicateRows).toBe(0);
      expect(result.importedRequisitions).toHaveLength(1);
    });

    it("should detect duplicates within the same CSV", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Software Development
Product Manager,Product,San Francisco,full_time,1,Product Management
Senior Engineer,Engineering,Remote,full_time,3,Software Development`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      // First occurrence imported, second flagged as duplicate
      expect(result.importedRequisitions).toHaveLength(2);
      expect(result.duplicateRows).toBe(1);
    });
  });

  describe("Job Family Lookup", () => {
    it("should perform case-insensitive job family lookup", async () => {
      await prisma.jobFamily.create({
        data: {
          id: "jf-123",
          name: "Software Development",
        },
      });

      const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,software development`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      expect(result.importedRequisitions).toHaveLength(1);
    });

    it("should reject non-existent job family", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Non-Existent Family`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      expect(result.invalidRows).toBe(1);
      expect(result.errors[0].field).toBe("job_family");
    });
  });

  describe("Boundary Value Testing", () => {
    it("should accept minimum valid slot count", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,1,Software Development`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      expect(result.importedRequisitions).toHaveLength(1);
    });

    it("should reject zero slots", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,0,Software Development`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      expect(result.invalidRows).toBe(1);
      expect(result.errors[0].field).toBe("slots");
    });

    it("should reject negative slots", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,-1,Software Development`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      expect(result.invalidRows).toBe(1);
      expect(result.errors[0].field).toBe("slots");
    });

    it("should reject role_title exceeding 255 characters", async () => {
      const longTitle = "A".repeat(256);
      const csv = `role_title,department,location,job_type,slots,job_family
${longTitle},Engineering,Remote,full_time,2,Software Development`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      expect(result.invalidRows).toBe(1);
      expect(result.errors[0].field).toBe("role_title");
    });

    it("should accept minimum experience years of 0", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family,min_experience_years
Senior Engineer,Engineering,Remote,full_time,2,Software Development,0`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      expect(result.importedRequisitions).toHaveLength(1);
    });

    it("should reject negative experience years", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family,min_experience_years
Senior Engineer,Engineering,Remote,full_time,2,Software Development,-1`;

      const result = await importRequisitionsFromCSV(
        Buffer.from(csv),
        "user-123",
      );

      expect(result.invalidRows).toBe(1);
      expect(result.errors[0].field).toBe("min_experience_years");
    });
  });

  describe("Error Report Generation", () => {
    it("should include all error types in report", async () => {
      const result: ImportResult = {
        success: false,
        totalRows: 3,
        validRows: 0,
        invalidRows: 2,
        duplicateRows: 1,
        importedRequisitions: [],
        errors: [
          {
            rowNumber: 2,
            field: "role_title",
            value: "",
            message: "Role title is required",
          },
          {
            rowNumber: 3,
            field: "job_type",
            value: "invalid",
            message: "Invalid job type",
          },
        ],
        duplicates: [
          {
            rowNumber: 4,
            title: "Senior Engineer",
            department: "Engineering",
            location: "Remote",
            existingRequisitionId: "req-123",
          },
        ],
      };

      const csv = generateErrorReportCSV(result);

      expect(csv).toContain("validation");
      expect(csv).toContain("duplicate");
      expect(csv).toContain("Role title is required");
      expect(csv).toContain("Invalid job type");
      expect(csv).toContain("req-123");
    });

    it("should generate valid CSV format", async () => {
      const result: ImportResult = {
        success: false,
        totalRows: 1,
        validRows: 0,
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
      const lines = csv.trim().split("\n");

      expect(lines.length).toBe(2); // Header + 1 error row
      expect(lines[0]).toContain("row_number,error_type,field,value,message");
    });
  });
});
```

### 2. Backend Integration Tests - Concurrency

#### File: `/backend/src/routes/__tests__/requisitions-bulk-import-concurrency.test.ts`

```typescript
describe("Bulk Import Concurrency", () => {
  it("should handle multiple simultaneous uploads", async () => {
    const csv1 = `role_title,department,location,job_type,slots,job_family
Engineer A,Engineering,Remote,full_time,2,Software Development`;

    const csv2 = `role_title,department,location,job_type,slots,job_family
Manager B,Product,San Francisco,full_time,1,Product Management`;

    const [response1, response2] = await Promise.all([
      request(app)
        .post("/api/requisitions/bulk-import")
        .set("Authorization", `Bearer ${recruiterToken}`)
        .attach("file", Buffer.from(csv1), "file1.csv"),
      request(app)
        .post("/api/requisitions/bulk-import")
        .set("Authorization", `Bearer ${recruiterToken}`)
        .attach("file", Buffer.from(csv2), "file2.csv"),
    ]);

    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    expect(response1.body.results.importedCount).toBe(1);
    expect(response2.body.results.importedCount).toBe(1);
  });

  it("should detect race condition duplicates", async () => {
    const csv = `role_title,department,location,job_type,slots,job_family
Same Engineer,Engineering,Remote,full_time,2,Software Development`;

    // Upload same CSV twice simultaneously
    const [response1, response2] = await Promise.all([
      request(app)
        .post("/api/requisitions/bulk-import")
        .set("Authorization", `Bearer ${recruiterToken}`)
        .attach("file", Buffer.from(csv), "file1.csv"),
      request(app)
        .post("/api/requisitions/bulk-import")
        .set("Authorization", `Bearer ${recruiterToken}`)
        .attach("file", Buffer.from(csv), "file2.csv"),
    ]);

    // One should succeed, one should detect duplicate
    const imported = [
      response1.body.results.importedCount,
      response2.body.results.importedCount,
    ].filter((c) => c > 0);

    const duplicates = [
      response1.body.results.duplicateCount,
      response2.body.results.duplicateCount,
    ].filter((c) => c > 0);

    expect(imported.length).toBe(1);
    expect(duplicates.length).toBe(1);
  });
});
```

### 3. Frontend E2E Tests - Error Scenarios

#### File: `/frontend/tests/e2e/bulk-import-errors.spec.ts`

```typescript
test.describe("Bulk Import Error Handling", () => {
  test("should display column validation error", async ({ page }) => {
    await page.goto("/requisitions/bulk-import");

    const csvMissingColumn = `role_title,department,location,slots,job_family
Senior Engineer,Engineering,Remote,2,Software Development`;

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.click('button:has-text("Select File")');
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles({
      name: "invalid.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvMissingColumn),
    });

    await page.click('button:has-text("Upload and Import")');

    // Should show error message about missing column
    await expect(page.locator("text=job_type")).toBeVisible({ timeout: 5000 });
  });

  test("should show validation errors in results", async ({ page }) => {
    await page.goto("/requisitions/bulk-import");

    const csvWithErrors = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Software Development
,Marketing,New York,invalid_type,abc,Non-Existent Family`;

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.click('button:has-text("Select File")');
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles({
      name: "errors.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvWithErrors),
    });

    await page.click('button:has-text("Upload and Import")');

    // Verify results show correct counts
    await expect(page.locator("text=Imported")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Invalid")).toBeVisible();

    // Verify error report button present
    await expect(
      page.locator('button:has-text("Download Error Report")'),
    ).toBeVisible();
  });

  test("should handle network error gracefully", async ({ page }) => {
    await page.goto("/requisitions/bulk-import");

    // Intercept and fail the request
    await page.route("/api/requisitions/bulk-import", (route) => {
      route.abort("failed");
    });

    const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Software Development`;

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.click('button:has-text("Select File")');
    const fileChooser = await fileChooserPromise;

    await fileChooser.setFiles({
      name: "requisitions.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });

    await page.click('button:has-text("Upload and Import")');

    // Should show error toast
    await expect(page.locator(".toast-error")).toBeVisible({ timeout: 5000 });
  });
});
```

## Acceptance Criteria

- [ ] All unit tests pass for CSV parsing and validation logic
- [ ] Edge cases tested: special characters, unicode, whitespace, empty fields
- [ ] Large file test confirms 1000+ row handling under 30 seconds
- [ ] Duplicate detection tests verify case-insensitive matching
- [ ] Duplicate detection excludes cancelled requisitions
- [ ] Job family lookup is case-insensitive
- [ ] Boundary value tests cover min/max for all numeric fields
- [ ] JSON eligibility criteria parsing tested with valid and invalid JSON
- [ ] Error report generation includes all error types
- [ ] Concurrency tests verify simultaneous upload handling
- [ ] Race condition duplicate detection tested
- [ ] Frontend E2E tests cover column validation errors
- [ ] Frontend E2E tests cover row validation errors
- [ ] Frontend E2E tests verify error report download
- [ ] Network error handling tested in frontend
- [ ] Test coverage minimum 90% for CSV import code

## Performance Benchmarks

- **Small file (10 rows):** < 1 second
- **Medium file (100 rows):** < 5 seconds
- **Large file (1000 rows):** < 30 seconds
- **Error report generation:** < 500ms
- **Duplicate check per row:** < 50ms

## Files to Create

- `/backend/src/__tests__/services/csvImportService.edge-cases.test.ts`
- `/backend/src/routes/__tests__/requisitions-bulk-import-concurrency.test.ts`
- `/frontend/tests/e2e/bulk-import-errors.spec.ts`
- `/backend/src/__tests__/services/csvImportService.performance.test.ts` (performance tests)

## Dependencies

- All previous tasks (TASK-001, TASK-002, TASK-003)
- Test infrastructure (Vitest, Playwright)
- Test database with JobFamily records
- Mock authentication tokens

## Related User Story

**US-004 All Acceptance Criteria Tested:**

- ✅ Scenario 1: Valid CSV imported (success path tested)
- ✅ Scenario 2: Invalid rows reported (error handling tested)
- ✅ Scenario 3: Column validation (pre-processing check tested)
- ✅ Scenario 4: Idempotency (duplicate detection tested)

## Notes

- Edge case testing critical for production reliability
- Special character handling prevents data corruption
- Duplicate detection within same CSV prevents batch duplicates
- Concurrency tests ensure thread-safe imports
- Performance benchmarks set expectations for user experience
- Error report format verified for downstream processing
- Boundary value testing catches off-by-one errors
- Unicode support ensures international compatibility
- Case-insensitive lookups improve user experience
- Race condition tests verify database transaction handling
