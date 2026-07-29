# US-004 Implementation Tasks

## Overview

This directory contains implementation tasks for User Story US-004: Bulk Requisition CSV Import with Validation and Error Report.

## Task Breakdown

### TASK-001: Backend - CSV Import Service Layer with Validation

**Status:** Todo  
**Estimated Hours:** 8  
**Layer:** Backend  
**Dependencies:** None

Implement comprehensive CSV parsing service using papaparse library with column validation, row-by-row field validation, job family lookup, duplicate detection based on (title, department, location), and error report generation. Includes batch insertion with transaction handling and audit logging.

### TASK-002: Backend - CSV Import REST API Endpoint

**Status:** Todo  
**Estimated Hours:** 4  
**Layer:** Backend  
**Dependencies:** TASK-001

Create REST API endpoint `/api/requisitions/bulk-import` with multer for multipart file upload handling, file type and size validation, column header pre-validation, import processing, and error report storage in Redis with 1-hour TTL. Includes template download endpoint.

### TASK-003: Frontend - CSV Upload UI Component

**Status:** Todo  
**Estimated Hours:** 7  
**Layer:** Frontend  
**Dependencies:** TASK-001, TASK-002

Build React-based CSV upload interface with drag-and-drop support, file validation, upload progress tracking, import results visualization with statistics breakdown, and error report download functionality. Includes comprehensive format guide and CSV template download.

### TASK-004: Testing - Comprehensive Bulk Import Tests

**Status:** Todo  
**Estimated Hours:** 6  
**Layer:** Testing  
**Dependencies:** TASK-001, TASK-002, TASK-003

Comprehensive test coverage including edge cases (special characters, unicode, large files), duplicate detection scenarios, boundary value testing, concurrency handling, and E2E user workflows with error scenarios.

## Total Effort Estimate

**Total Hours:** 25 hours  
**Sprint Capacity:** Approximately 1-2 sprints for full implementation

## Implementation Order

1. TASK-001 (CSV Import Service) - Core parsing and validation logic
2. TASK-002 (API Endpoint) - REST API with file upload
3. TASK-003 (Frontend UI) - User interface for upload
4. TASK-004 (Testing) - Continuous throughout, finalize after all tasks

## Acceptance Criteria Mapping

| Acceptance Criteria                                    | Primary Task | Supporting Tasks   |
| ------------------------------------------------------ | ------------ | ------------------ |
| AC1: Valid CSV imported and requisitions created       | TASK-001     | TASK-002, TASK-003 |
| AC2: Invalid rows reported without blocking valid rows | TASK-001     | TASK-002, TASK-003 |
| AC3: CSV column headers validated before processing    | TASK-001     | TASK-002           |
| AC4: Import is idempotent with duplicate detection     | TASK-001     | -                  |

## Technical Stack

- **Backend:** Node.js, Express, TypeScript, Prisma, papaparse (CSV parser), multer (file upload)
- **Frontend:** Next.js 14, React, TypeScript, Tailwind CSS
- **Database:** PostgreSQL (Prisma)
- **Storage:** Redis (error report temporary storage)
- **Testing:** Vitest, Playwright, @testing-library/react

## Key Files to Create/Modify

### Backend

- `src/services/csvImportService.ts` (new) - CSV parsing and validation service
- `src/middleware/upload.ts` (new) - Multer file upload configuration
- `src/routes/requisitions.ts` (new or extend) - Bulk import API routes
- `src/routes/index.ts` (update) - Register requisitions routes
- `src/app.ts` (update) - Add multer error handling
- `package.json` (update) - Add papaparse and multer dependencies

### Frontend

- `src/app/requisitions/bulk-import/page.tsx` (new) - Main bulk import page
- `src/components/requisitions/CSVUploader.tsx` (new) - File upload component
- `src/components/requisitions/ImportResults.tsx` (new) - Results display component

### Tests

- Backend unit tests for csvImportService (parsing, validation, duplicates)
- Backend integration tests for API endpoints (auth, file validation, error handling)
- Backend edge case tests (special characters, large files, concurrency)
- Frontend component tests for uploader and results
- E2E tests for complete upload workflows and error scenarios

## Definition of Done

- [ ] All tasks completed (TASK-001 through TASK-004)
- [ ] All acceptance criteria verified
- [ ] Code reviewed and approved
- [ ] Tests passing with minimum 90% coverage
- [ ] CSV upload accessible at `/requisitions/bulk-import` (recruiter/admin only)
- [ ] Column validation rejects invalid CSVs before processing
- [ ] Row validation collects all errors without stopping import
- [ ] Duplicate detection works case-insensitively
- [ ] Error report downloadable as CSV
- [ ] Valid rows imported with status='open'
- [ ] Audit logging captures import statistics
- [ ] Documentation updated (API docs, user guide)
- [ ] Deployed to staging environment
- [ ] User acceptance testing completed
- [ ] No blocking bugs
- [ ] Performance benchmarks met (<30s for 1000 rows)

## Critical Success Factors

### 1. Data Validation

**Critical:** All validation must occur before any database inserts to maintain data integrity.

**Validation Layers:**

- **Column validation:** Required columns present
- **Row validation:** Field-level validation (type, length, format)
- **Business validation:** Job family exists, slots > 0
- **Duplicate detection:** Case-insensitive check on (title, department, location)

**Verification:**

- Test with various invalid CSVs
- Verify error messages are clear and actionable
- Ensure valid rows still import when invalid rows present

### 2. Error Reporting

**Critical:** Users must receive detailed error information to fix and re-upload.

**Error Report Requirements:**

- Row number (1-based, excluding header)
- Field name
- Invalid value
- Clear error message
- Error type (validation, duplicate)
- Downloadable as CSV

**Verification:**

- Test error report generation
- Verify CSV format is valid
- Ensure error messages help users fix issues

### 3. Duplicate Detection

**Critical:** Prevents duplicate requisitions from being created.

**Detection Logic:**

- Match on (title, department, location)
- Case-insensitive comparison
- Exclude cancelled requisitions
- Check within CSV batch and database

**Verification:**

- Test case variations
- Test with existing requisitions
- Test within-batch duplicates
- Verify cancelled exclusion

### 4. Performance

**Critical:** Large file imports must complete in reasonable time.

**Performance Targets:**

- 10 rows: < 1 second
- 100 rows: < 5 seconds
- 1000 rows: < 30 seconds

**Optimization:**

- Parallel job family lookup caching
- Batch inserts where possible
- Efficient duplicate detection queries
- Progress indication for user feedback

## Architecture Highlights

### CSV Processing Flow

```
Upload File → Column Validation → Parse Rows → Validate Each Row
                     ↓ fail                          ↓
              Reject (400)                    Separate valid/invalid
                                                     ↓
                                         Check Duplicates (valid rows)
                                                     ↓
                                         Batch Insert (non-duplicate)
                                                     ↓
                                         Generate Error Report
                                                     ↓
                                         Return Results + Error URL
```

### Duplicate Detection Strategy

```typescript
// 1. Pre-load existing requisitions (cached query)
const existing = await prisma.requisition.findMany({
  where: { status: { notIn: ["cancelled"] } },
  select: { title: true, department: true, location: true },
});

// 2. Check each valid row against existing + within-batch
for (const row of validRows) {
  const key = `${row.title}|${row.department}|${row.location}`.toLowerCase();

  if (existingSet.has(key) || importedSet.has(key)) {
    duplicates.push(row);
  } else {
    toImport.push(row);
    importedSet.add(key);
  }
}
```

### Error Report Format

```csv
row_number,error_type,field,value,message
2,validation,role_title,,Role title is required
3,validation,job_type,invalid_type,Invalid job type. Must be one of: full_time, part_time, contract, internship
4,duplicate,"role_title, department, location","Senior Engineer, Engineering, Remote",Duplicate requisition (existing ID: req-abc-123)
```

## CSV Format Specification

### Required Columns

| Column Name  | Type    | Validation                                         | Example                     |
| ------------ | ------- | -------------------------------------------------- | --------------------------- |
| `role_title` | String  | Required, max 255 chars                            | "Senior Software Engineer"  |
| `department` | String  | Required, max 100 chars                            | "Engineering"               |
| `location`   | String  | Required, max 255 chars                            | "San Francisco" or "Remote" |
| `job_type`   | Enum    | One of: full_time, part_time, contract, internship | "full_time"                 |
| `slots`      | Integer | Required, > 0                                      | "2"                         |
| `job_family` | String  | Must exist in JobFamily table                      | "Software Development"      |

### Optional Columns

| Column Name            | Type     | Validation        | Example                               |
| ---------------------- | -------- | ----------------- | ------------------------------------- |
| `required_skills`      | String[] | Comma-separated   | "JavaScript,TypeScript,React"         |
| `preferred_skills`     | String[] | Comma-separated   | "Node.js,AWS"                         |
| `min_experience_years` | Integer  | >= 0              | "5"                                   |
| `education_level`      | String   | Optional          | "Bachelor's"                          |
| `eligibility_criteria` | JSON     | Valid JSON string | `"{\"citizenship\": \"US Citizen\"}"` |

### Example CSV

```csv
role_title,department,location,job_type,slots,job_family,required_skills,preferred_skills,min_experience_years,education_level,eligibility_criteria
Senior Software Engineer,Engineering,San Francisco,full_time,2,Software Development,"JavaScript,TypeScript,React","Node.js,AWS",5,Bachelor's,"{""citizenship"": ""US Citizen""}"
Product Manager,Product,Remote,full_time,1,Product Management,"Product Strategy,Roadmapping","Agile,Scrum",3,Bachelor's,"{}"
Data Analyst,Analytics,New York,contract,3,Data & Analytics,"SQL,Python,Tableau","R,Power BI",2,Bachelor's,"{}"
```

## Operational Considerations

### 1. File Upload Limits

- **File size:** 5MB maximum (configurable via multer)
- **Row limit:** No hard limit, but 1000+ rows may take longer
- **File type:** .csv only (validated by extension and content type)

### 2. Error Report Storage

- **Storage:** Redis with 1-hour TTL
- **Enhancement:** Can be moved to S3/blob storage for longer retention
- **Access:** Requires authentication and same user who uploaded

### 3. Duplicate Detection Performance

- **Cache strategy:** Pre-load existing requisitions into memory
- **Query optimization:** Use database index on (title, department, location)
- **Within-batch tracking:** Use Set for O(1) lookup

### 4. Audit Logging

- **Event:** `requisition.bulk_import`
- **Metadata:** totalRows, validRows, invalidRows, duplicateRows, importedCount
- **User tracking:** uploadedBy field captures user ID

## User Experience Flow

### Happy Path

1. User navigates to `/requisitions/bulk-import`
2. Downloads CSV template
3. Fills in requisition data
4. Uploads completed CSV (drag-and-drop or file picker)
5. Sees upload progress indicator
6. Receives success message: "Successfully imported 10 requisition(s)"
7. Views statistics: 10 total, 10 imported, 0 invalid, 0 duplicates
8. Returns to requisitions list

### Error Path

1. User uploads CSV with 3 valid rows, 2 invalid rows, 1 duplicate
2. Sees partial success message: "Import completed with errors"
3. Views statistics: 6 total, 3 imported, 2 invalid, 1 duplicate
4. Clicks "Download Error Report"
5. Reviews error CSV with row numbers and messages
6. Fixes errors in original CSV
7. Re-uploads corrected file

### Validation Error Path

1. User uploads CSV missing required column
2. Receives immediate error: "Missing required column: job_type"
3. No rows processed
4. User fixes CSV structure and re-uploads

## Security Considerations

- **Authentication:** All endpoints require valid JWT token
- **Authorization:** Only recruiter and admin roles can import
- **File validation:** Type and size checks prevent malicious uploads
- **Input sanitization:** All CSV data validated before database insert
- **SQL injection:** Prisma ORM prevents SQL injection
- **Rate limiting:** Consider rate limit on upload endpoint (optional)
- **Error report access:** Only accessible to authenticated user who uploaded

## Future Enhancements

- **Bulk update:** Support updating existing requisitions
- **Async processing:** Queue large imports for background processing
- **Progress updates:** WebSocket for real-time progress during import
- **Preview mode:** Preview data before committing to database
- **Scheduling:** Schedule bulk imports for specific date/time
- **Notifications:** Email notification when import completes
- **History:** Track all imports with download of original CSV
- **Rollback:** Ability to rollback entire import if issues found
- **Batch size config:** Configurable batch size for inserts
- **S3 storage:** Move error reports to S3 for longer retention
- **Excel support:** Support .xlsx files in addition to .csv

## Related Documentation

- US-004 User Story: [us_004.md](../us_004.md)
- Requisition Schema: `backend/prisma/schema.prisma`
- API Documentation: Update OpenAPI/Swagger specs for bulk import endpoints
- User Guide: Create CSV import guide with examples and troubleshooting

## Risks and Mitigation

| Risk                            | Impact                   | Mitigation                                              |
| ------------------------------- | ------------------------ | ------------------------------------------------------- |
| Large file timeout              | High - User frustration  | Set reasonable timeout, async processing for >1000 rows |
| Memory exhaustion               | High - Server crash      | Stream processing, batch inserts, file size limit       |
| Duplicate detection performance | Medium - Slow imports    | Index database columns, cache existing requisitions     |
| Error report storage            | Low - Disk space         | Redis TTL expiration, move to blob storage              |
| Concurrent uploads              | Medium - Race conditions | Transaction handling, duplicate detection locking       |
| Invalid JSON in CSV             | Medium - Import failure  | JSON validation, clear error messages                   |
| Unicode encoding issues         | Low - Data corruption    | UTF-8 encoding enforcement                              |

## Monitoring and Observability

- **Metrics to track:**
  - Import success rate
  - Average import duration
  - File size distribution
  - Error frequency by type
  - Duplicate detection rate
- **Alerts:**
  - Import failure rate > 10%
  - Import duration > 60s
  - Error report storage > 80% capacity
- **Logging:**
  - All imports logged with statistics
  - Validation errors logged for pattern analysis
  - Performance metrics logged for optimization

## Testing Strategy

### Unit Tests (80 test cases)

- CSV parsing with various formats
- Column validation (missing, extra, correct)
- Row validation (all fields, edge cases)
- Duplicate detection (case sensitivity, exclusions)
- Job family lookup
- Error report generation

### Integration Tests (25 test cases)

- API endpoint authentication
- File upload validation
- End-to-end import flow
- Error report download
- Concurrent upload handling
- Audit log creation

### E2E Tests (15 test cases)

- Complete user workflow
- Upload valid CSV
- Upload CSV with errors
- Download template
- Download error report
- File type validation
- File size validation

### Performance Tests (5 test cases)

- 10 rows import time
- 100 rows import time
- 1000 rows import time
- Duplicate detection time
- Error report generation time

## Notes

- papaparse library chosen for robust CSV parsing with good encoding support
- Multer provides battle-tested file upload handling
- Redis used for temporary error report storage (1-hour TTL)
- Duplicate detection uses case-insensitive comparison for user-friendliness
- Job family lookup cached to avoid N+1 query problem
- Error report format matches CSV for easy re-import after fixes
- Drag-and-drop enhances user experience
- Template download reduces user errors
- Comprehensive validation prevents bad data from entering system
- Audit logging provides traceability for compliance
