---
id: TASK-002
user_story: US-004
title: "Backend - CSV Import REST API Endpoint"
status: done
priority: high
assigned_to: backend-team
estimated_hours: 4
layer: backend
dependencies: [TASK-001]
---

# TASK-002 — Backend - CSV Import REST API Endpoint

## Objective

Create REST API endpoint for multipart CSV file upload with validation, import processing, and error report download support.

## Scope

Implement `/api/requisitions/bulk-import` endpoint that accepts CSV file uploads, processes them using the CSV import service, and returns import results with downloadable error reports.

## Technical Requirements

### 1. File Upload Middleware

Configure multer for file uploads in `/backend/src/middleware/upload.ts`:

```typescript
import multer from "multer";
import path from "path";

// Memory storage for immediate processing
const storage = multer.memoryStorage();

// File filter - only accept CSV files
const fileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedExtensions = [".csv"];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only CSV files are allowed"));
  }
};

// Configure multer with limits
export const uploadCSV = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
    files: 1, // Only one file at a time
  },
});
```

### 2. Bulk Import API Route

Create `/backend/src/routes/requisitions.ts` (or update existing):

```typescript
import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/authenticate";
import { requireRole } from "../middleware/requireRole";
import { uploadCSV } from "../middleware/upload";
import {
  importRequisitionsFromCSV,
  generateErrorReportCSV,
} from "../services/csvImportService";
import logger from "../utils/logger";

const router = Router();

/**
 * POST /api/requisitions/bulk-import
 *
 * Upload CSV file to bulk import requisitions
 *
 * Request:
 * - Content-Type: multipart/form-data
 * - Body: file (CSV file)
 *
 * Response Schema:
 * {
 *   success: boolean;
 *   message: string;
 *   results: {
 *     totalRows: number;
 *     importedCount: number;
 *     invalidCount: number;
 *     duplicateCount: number;
 *     importedRequisitions: string[];
 *   };
 *   errorReportUrl?: string; // Present if errors occurred
 * }
 *
 * @middleware authenticate - Requires valid JWT token
 * @middleware requireRole('recruiter') - Requires recruiter or admin role
 * @middleware uploadCSV.single('file') - Handles file upload
 * @returns 200 - Import completed (with or without errors)
 * @returns 400 - Invalid file or column validation failed
 * @returns 401 - Unauthorized
 * @returns 403 - Forbidden (insufficient permissions)
 * @returns 413 - File too large
 * @returns 500 - Server error
 */
router.post(
  "/bulk-import",
  authenticate,
  requireRole(["recruiter", "admin"]),
  uploadCSV.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Verify file uploaded
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: "No file uploaded",
          message: "Please upload a CSV file",
        });
        return;
      }

      logger.info("[BulkImport] Processing CSV upload", {
        filename: req.file.originalname,
        size: req.file.size,
        userId: req.user?.id,
      });

      // Process CSV import
      const startTime = Date.now();
      const result = await importRequisitionsFromCSV(
        req.file.buffer,
        req.user!.id,
      );
      const duration = Date.now() - startTime;

      logger.info("[BulkImport] Import completed", {
        duration,
        totalRows: result.totalRows,
        imported: result.importedRequisitions.length,
        invalid: result.invalidRows,
        duplicates: result.duplicateRows,
        userId: req.user?.id,
      });

      // Generate error report if there are errors or duplicates
      let errorReportUrl: string | undefined;
      if (result.errors.length > 0 || result.duplicates.length > 0) {
        // Store error report temporarily (can be enhanced with S3/blob storage)
        const errorCSV = generateErrorReportCSV(result);
        const reportId = `error-report-${Date.now()}-${req.user!.id}`;

        // Store in Redis with 1-hour expiration
        await redis.set(
          `csv-error-report:${reportId}`,
          errorCSV,
          "EX",
          3600, // 1 hour
        );

        errorReportUrl = `/api/requisitions/bulk-import/error-report/${reportId}`;
      }

      // Return comprehensive result
      res.status(200).json({
        success: result.success,
        message: result.success
          ? `Successfully imported ${result.importedRequisitions.length} requisition(s)`
          : "Import completed with errors",
        results: {
          totalRows: result.totalRows,
          importedCount: result.importedRequisitions.length,
          invalidCount: result.invalidRows,
          duplicateCount: result.duplicateRows,
          importedRequisitions: result.importedRequisitions,
        },
        errorReportUrl,
        processingTime: duration,
      });
    } catch (error) {
      logger.error("[BulkImport] Import failed:", error);

      // Handle specific error types
      if (error instanceof Error) {
        if (error.message.includes("Missing required column")) {
          res.status(400).json({
            success: false,
            error: "INVALID_CSV_FORMAT",
            message: error.message,
          });
          return;
        }

        if (error.message.includes("CSV parsing failed")) {
          res.status(400).json({
            success: false,
            error: "CSV_PARSE_ERROR",
            message: error.message,
          });
          return;
        }
      }

      res.status(500).json({
        success: false,
        error: "IMPORT_FAILED",
        message: "Failed to import requisitions",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

/**
 * GET /api/requisitions/bulk-import/error-report/:reportId
 *
 * Download error report CSV for a previous import
 *
 * @param reportId - Error report identifier
 * @returns CSV file download
 * @returns 404 - Report not found or expired
 */
router.get(
  "/bulk-import/error-report/:reportId",
  authenticate,
  requireRole(["recruiter", "admin"]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { reportId } = req.params;

      // Retrieve error report from Redis
      const errorCSV = await redis.get(`csv-error-report:${reportId}`);

      if (!errorCSV) {
        res.status(404).json({
          error: "Report not found or expired",
          message: "Error report may have expired after 1 hour",
        });
        return;
      }

      // Set headers for CSV download
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="import-errors-${reportId}.csv"`,
      );
      res.status(200).send(errorCSV);
    } catch (error) {
      logger.error("[BulkImport] Failed to retrieve error report:", error);

      res.status(500).json({
        error: "Failed to retrieve error report",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

/**
 * GET /api/requisitions/bulk-import/template
 *
 * Download CSV template with example data
 *
 * @returns CSV template file
 */
router.get(
  "/bulk-import/template",
  authenticate,
  requireRole(["recruiter", "admin"]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const templateCSV = `role_title,department,location,job_type,slots,job_family,required_skills,preferred_skills,min_experience_years,education_level,eligibility_criteria
Senior Software Engineer,Engineering,San Francisco,full_time,2,Software Development,"JavaScript,TypeScript,React","Node.js,AWS",5,Bachelor's,"{""citizenship"": ""US Citizen""}"
Product Manager,Product,Remote,full_time,1,Product Management,"Product Strategy,Roadmapping","Agile,Scrum",3,Bachelor's,"{}"
Data Analyst,Analytics,New York,contract,3,Data & Analytics,"SQL,Python,Tableau","R,Power BI",2,Bachelor's,"{}"`;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="requisition-import-template.csv"',
      );
      res.status(200).send(templateCSV);
    } catch (error) {
      logger.error("[BulkImport] Failed to generate template:", error);

      res.status(500).json({
        error: "Failed to generate template",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

export default router;
```

### 3. Error Handling Middleware

Multer error handling in `/backend/src/app.ts`:

```typescript
import { MulterError } from "multer";

// Add after route registration
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        error: "FILE_TOO_LARGE",
        message: "File size exceeds 5MB limit",
      });
    }

    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        error: "TOO_MANY_FILES",
        message: "Only one file can be uploaded at a time",
      });
    }

    return res.status(400).json({
      success: false,
      error: "UPLOAD_ERROR",
      message: err.message,
    });
  }

  if (err.message === "Only CSV files are allowed") {
    return res.status(400).json({
      success: false,
      error: "INVALID_FILE_TYPE",
      message: "Only CSV files are allowed",
    });
  }

  next(err);
});
```

### 4. Register Routes

Update `/backend/src/routes/index.ts`:

```typescript
import requisitionsRouter from "./requisitions";

// Register requisitions routes
router.use("/requisitions", requisitionsRouter);
```

## Acceptance Criteria

- [ ] POST /api/requisitions/bulk-import accepts CSV file via multipart/form-data
- [ ] Endpoint requires authentication and recruiter/admin role
- [ ] File type validation rejects non-CSV files with 400 error
- [ ] File size limit enforced at 5MB with 413 error
- [ ] Column validation errors returned with 400 status before processing
- [ ] Import results include counts for total, imported, invalid, and duplicate rows
- [ ] Error report URL returned when errors or duplicates exist
- [ ] GET /api/requisitions/bulk-import/error-report/:reportId downloads CSV error report
- [ ] Error reports expire after 1 hour (stored in Redis)
- [ ] GET /api/requisitions/bulk-import/template returns CSV template with examples
- [ ] Processing time logged for performance monitoring
- [ ] Comprehensive error handling for all failure scenarios

## Testing Requirements

### Integration Tests

File: `/backend/src/routes/__tests__/requisitions-bulk-import.integration.test.ts`

```typescript
import request from "supertest";
import { app } from "../../app";
import { generateToken } from "../../utils/auth";
import fs from "fs";
import path from "path";

describe("Bulk Import API", () => {
  let recruiterToken: string;
  let adminToken: string;
  let candidateToken: string;

  beforeAll(async () => {
    recruiterToken = generateToken({ id: "recruiter-1", role: "recruiter" });
    adminToken = generateToken({ id: "admin-1", role: "admin" });
    candidateToken = generateToken({ id: "candidate-1", role: "candidate" });

    // Create job families for testing
    await prisma.jobFamily.createMany({
      data: [
        { id: "jf-1", name: "Software Development" },
        { id: "jf-2", name: "Product Management" },
      ],
    });
  });

  describe("POST /api/requisitions/bulk-import", () => {
    it("should import valid CSV with multiple requisitions", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Software Development
Product Manager,Product,San Francisco,full_time,1,Product Management`;

      const response = await request(app)
        .post("/api/requisitions/bulk-import")
        .set("Authorization", `Bearer ${recruiterToken}`)
        .attach("file", Buffer.from(csv), "requisitions.csv");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.results.importedCount).toBe(2);
      expect(response.body.results.totalRows).toBe(2);
      expect(response.body.results.invalidCount).toBe(0);
      expect(response.body.errorReportUrl).toBeUndefined();
    });

    it("should return error report URL for invalid rows", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Software Development
,Marketing,New York,full_time,1,Product Management`;

      const response = await request(app)
        .post("/api/requisitions/bulk-import")
        .set("Authorization", `Bearer ${recruiterToken}`)
        .attach("file", Buffer.from(csv), "requisitions.csv");

      expect(response.status).toBe(200);
      expect(response.body.results.importedCount).toBe(1);
      expect(response.body.results.invalidCount).toBe(1);
      expect(response.body.errorReportUrl).toBeDefined();
    });

    it("should reject CSV with missing required column", async () => {
      const csv = `role_title,department,location,slots,job_family
Senior Engineer,Engineering,Remote,2,Software Development`;

      const response = await request(app)
        .post("/api/requisitions/bulk-import")
        .set("Authorization", `Bearer ${recruiterToken}`)
        .attach("file", Buffer.from(csv), "requisitions.csv");

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("INVALID_CSV_FORMAT");
      expect(response.body.message).toContain("job_type");
    });

    it("should reject non-CSV files", async () => {
      const txtContent = "This is not a CSV file";

      const response = await request(app)
        .post("/api/requisitions/bulk-import")
        .set("Authorization", `Bearer ${recruiterToken}`)
        .attach("file", Buffer.from(txtContent), "document.txt");

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("INVALID_FILE_TYPE");
    });

    it("should reject request without file", async () => {
      const response = await request(app)
        .post("/api/requisitions/bulk-import")
        .set("Authorization", `Bearer ${recruiterToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("No file uploaded");
    });

    it("should reject files larger than 5MB", async () => {
      const largeCSV =
        "role_title,department,location,job_type,slots,job_family\n" +
        "Engineer,Engineering,Remote,full_time,1,Software Development\n".repeat(
          100000,
        );

      const response = await request(app)
        .post("/api/requisitions/bulk-import")
        .set("Authorization", `Bearer ${recruiterToken}`)
        .attach("file", Buffer.from(largeCSV), "large.csv");

      expect(response.status).toBe(413);
      expect(response.body.error).toBe("FILE_TOO_LARGE");
    });

    it("should require authentication", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Software Development`;

      const response = await request(app)
        .post("/api/requisitions/bulk-import")
        .attach("file", Buffer.from(csv), "requisitions.csv");

      expect(response.status).toBe(401);
    });

    it("should require recruiter or admin role", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Software Development`;

      const response = await request(app)
        .post("/api/requisitions/bulk-import")
        .set("Authorization", `Bearer ${candidateToken}`)
        .attach("file", Buffer.from(csv), "requisitions.csv");

      expect(response.status).toBe(403);
    });

    it("should detect and report duplicates", async () => {
      // Create existing requisition
      await prisma.requisition.create({
        data: {
          title: "Senior Engineer",
          department: "Engineering",
          location: "Remote",
          jobType: "full_time",
          slots: 2,
          jobFamilyId: "jf-1",
          status: "open",
        },
      });

      const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Software Development
Product Manager,Product,San Francisco,full_time,1,Product Management`;

      const response = await request(app)
        .post("/api/requisitions/bulk-import")
        .set("Authorization", `Bearer ${recruiterToken}`)
        .attach("file", Buffer.from(csv), "requisitions.csv");

      expect(response.status).toBe(200);
      expect(response.body.results.duplicateCount).toBe(1);
      expect(response.body.results.importedCount).toBe(1);
      expect(response.body.errorReportUrl).toBeDefined();
    });

    it("should create audit log on successful import", async () => {
      const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Software Development`;

      await request(app)
        .post("/api/requisitions/bulk-import")
        .set("Authorization", `Bearer ${recruiterToken}`)
        .attach("file", Buffer.from(csv), "requisitions.csv");

      const auditEvent = await prisma.auditEvent.findFirst({
        where: {
          action: "requisition.bulk_import",
          userId: "recruiter-1",
        },
        orderBy: { createdAt: "desc" },
      });

      expect(auditEvent).toBeDefined();
      expect(auditEvent?.metadata).toHaveProperty("totalRows");
      expect(auditEvent?.metadata).toHaveProperty("importedCount");
    });
  });

  describe("GET /api/requisitions/bulk-import/error-report/:reportId", () => {
    it("should download error report CSV", async () => {
      // First, create an import with errors
      const csv = `role_title,department,location,job_type,slots,job_family
Senior Engineer,Engineering,Remote,full_time,2,Software Development
,Marketing,New York,full_time,1,Product Management`;

      const importResponse = await request(app)
        .post("/api/requisitions/bulk-import")
        .set("Authorization", `Bearer ${recruiterToken}`)
        .attach("file", Buffer.from(csv), "requisitions.csv");

      const errorReportUrl = importResponse.body.errorReportUrl;
      expect(errorReportUrl).toBeDefined();

      // Extract report ID from URL
      const reportId = errorReportUrl.split("/").pop();

      // Download error report
      const reportResponse = await request(app)
        .get(`/api/requisitions/bulk-import/error-report/${reportId}`)
        .set("Authorization", `Bearer ${recruiterToken}`);

      expect(reportResponse.status).toBe(200);
      expect(reportResponse.headers["content-type"]).toBe("text/csv");
      expect(reportResponse.text).toContain("row_number");
      expect(reportResponse.text).toContain("error_type");
      expect(reportResponse.text).toContain("validation");
    });

    it("should return 404 for expired or non-existent report", async () => {
      const response = await request(app)
        .get("/api/requisitions/bulk-import/error-report/nonexistent-report-id")
        .set("Authorization", `Bearer ${recruiterToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain("not found or expired");
    });

    it("should require authentication", async () => {
      const response = await request(app).get(
        "/api/requisitions/bulk-import/error-report/some-id",
      );

      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/requisitions/bulk-import/template", () => {
    it("should download CSV template", async () => {
      const response = await request(app)
        .get("/api/requisitions/bulk-import/template")
        .set("Authorization", `Bearer ${recruiterToken}`);

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toBe("text/csv");
      expect(response.text).toContain("role_title");
      expect(response.text).toContain("department");
      expect(response.text).toContain("job_family");
      expect(response.text).toContain("Senior Software Engineer");
    });

    it("should require authentication", async () => {
      const response = await request(app).get(
        "/api/requisitions/bulk-import/template",
      );

      expect(response.status).toBe(401);
    });
  });
});
```

## Files to Create/Modify

### Create

- `/backend/src/middleware/upload.ts` - Multer configuration
- `/backend/src/routes/requisitions.ts` - Bulk import routes (or extend existing)
- `/backend/src/routes/__tests__/requisitions-bulk-import.integration.test.ts` - API tests

### Modify

- `/backend/src/routes/index.ts` - Register requisitions routes
- `/backend/src/app.ts` - Add multer error handling middleware
- `/backend/package.json` - Add multer dependency

## Dependencies

- TASK-001 (CSV Import Service must be implemented)
- multer for file upload handling
- Redis for error report temporary storage
- Existing authentication and authorization middleware
- Audit logging infrastructure

## Related User Story

**US-004 All Acceptance Criteria Covered:**

- ✅ Scenario 1: Valid CSV imported and requisitions created
- ✅ Scenario 2: Invalid rows reported without blocking valid rows
- ✅ Scenario 3: CSV column headers validated before processing
- ✅ Scenario 4: Import is idempotent with duplicate detection

## Notes

- Error reports stored in Redis with 1-hour TTL (can be extended to S3/blob storage)
- Template endpoint provides sample CSV for users
- Multer configured with memory storage for immediate processing
- File size limit set to 5MB (configurable)
- Admin and recruiter roles both have import permissions
- Processing time included in response for performance monitoring
- Error report includes both validation errors and duplicate detections
- CSV template includes examples for all field types including JSON eligibility criteria
