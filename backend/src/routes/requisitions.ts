import { Router, Request, Response } from 'express';
import * as requisitionService from '../services/requisitionService';
import { hasDraft } from '../services/applicationDraftService';
import { checkApplicationEligibility } from '../services/applicationStatusService';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';
import { uploadCSV } from '../middleware/upload';
import {
    generateErrorReportCSV,
    importRequisitionsFromCSV
} from '../services/csvImportService';
import { redis } from '../db/redis';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import logger from '../utils/logger';

const router = Router();

// Validation schema for query parameters
const ListRequisitionsSchema = z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
    department: z.string().optional(),
    location: z.string().optional(),
    jobType: z.enum(['full_time', 'part_time', 'contract', 'internship']).optional(),
    experienceLevel: z.coerce.number().int().min(0).optional(),
    keyword: z.string().optional(),
    status: z.string().optional().default('open'),
});

/**
 * GET /api/requisitions
 * List requisitions with filters and pagination
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const params = ListRequisitionsSchema.parse(req.query);

        const result = await requisitionService.listRequisitions({
            page: params.page,
            pageSize: params.pageSize,
            filters: {
                department: params.department,
                location: params.location,
                jobType: params.jobType,
                experienceLevel: params.experienceLevel,
                keyword: params.keyword,
                status: params.status,
            },
        });

        res.status(200).json(result);
    } catch (error) {
        if (error instanceof z.ZodError) {
            logger.warn({ error: error.errors }, 'Invalid requisition list query parameters');
            res.status(400).json({
                error: {
                    code: 'INVALID_QUERY_PARAMS',
                    message: 'Invalid query parameters',
                    details: error.errors,
                },
            });
            return;
        }

        logger.error({ error }, 'Error listing requisitions');
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Unable to retrieve requisitions',
            },
        });
    }
});

/**
 * GET /api/requisitions/filters
 * Get available filter options for UI dropdowns
 */
router.get('/filters', async (req: Request, res: Response) => {
    try {
        const options = await requisitionService.getFilterOptions();
        res.status(200).json(options);
    } catch (error) {
        logger.error({ error }, 'Error fetching filter options');
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Unable to retrieve filter options',
            },
        });
    }
});

/**
 * POST /api/requisitions/bulk-import
 * Upload and process requisition CSV.
 */
router.post(
    '/bulk-import',
    authenticate,
    requireRole(['recruiter', 'admin']),
    uploadCSV.single('file'),
    async (req: Request, res: Response): Promise<void> => {
        try {
            if (!req.file) {
                res.status(400).json({
                    success: false,
                    error: 'No file uploaded',
                    message: 'Please upload a CSV file'
                });
                return;
            }

            const startedAt = Date.now();
            logger.info(
                {
                    filename: req.file.originalname,
                    size: req.file.size,
                    userId: req.user?.id
                },
                '[bulk-import] processing requisitions CSV'
            );

            const result = await importRequisitionsFromCSV(req.file.buffer, req.user!.id);
            const processingTime = Date.now() - startedAt;

            logger.info(
                {
                    processingTime,
                    totalRows: result.totalRows,
                    importedCount: result.importedRequisitions.length,
                    invalidCount: result.invalidRows,
                    duplicateCount: result.duplicateRows,
                    userId: req.user?.id
                },
                '[bulk-import] requisitions CSV processed'
            );

            let errorReportUrl: string | undefined;
            if (result.errors.length > 0 || result.duplicates.length > 0) {
                const reportId = `bulk-import-${Date.now()}-${randomUUID()}`;
                const redisKey = `csv-error-report:${reportId}`;
                const errorCSV = generateErrorReportCSV(result);
                await redis.setex(redisKey, 3600, errorCSV);
                errorReportUrl = `/api/requisitions/bulk-import/error-report/${reportId}`;
            }

            res.status(200).json({
                success: result.success,
                message: result.success
                    ? `Successfully imported ${result.importedRequisitions.length} requisition(s)`
                    : 'Import completed with errors',
                results: {
                    totalRows: result.totalRows,
                    importedCount: result.importedRequisitions.length,
                    invalidCount: result.invalidRows,
                    duplicateCount: result.duplicateRows,
                    importedRequisitions: result.importedRequisitions
                },
                errorReportUrl,
                processingTime
            });
        } catch (error) {
            logger.error({ error, userId: req.user?.id }, '[bulk-import] requisitions CSV import failed');

            if (error instanceof Error) {
                if (error.message.includes('Missing required column')) {
                    res.status(400).json({
                        success: false,
                        error: 'INVALID_CSV_FORMAT',
                        message: error.message
                    });
                    return;
                }

                if (error.message.includes('CSV parsing failed')) {
                    res.status(400).json({
                        success: false,
                        error: 'CSV_PARSE_ERROR',
                        message: error.message
                    });
                    return;
                }
            }

            res.status(500).json({
                success: false,
                error: 'IMPORT_FAILED',
                message: 'Failed to import requisitions',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
);

/**
 * GET /api/requisitions/bulk-import/error-report/:reportId
 * Download generated CSV import error report.
 */
router.get(
    '/bulk-import/error-report/:reportId',
    authenticate,
    requireRole(['recruiter', 'admin']),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const reportId = req.params.reportId;
            if (!/^[a-zA-Z0-9._-]+$/.test(reportId)) {
                res.status(400).json({
                    error: 'Invalid report ID',
                    message: 'Report identifier format is invalid'
                });
                return;
            }

            const report = await redis.get<string>(`csv-error-report:${reportId}`);
            if (!report) {
                res.status(404).json({
                    error: 'Report not found or expired',
                    message: 'Error report may have expired after 1 hour'
                });
                return;
            }

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="import-errors-${reportId}.csv"`);
            res.status(200).send(report);
        } catch (error) {
            logger.error({ error, reportId: req.params.reportId }, '[bulk-import] failed to retrieve error report');
            res.status(500).json({
                error: 'Failed to retrieve error report',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
);

/**
 * GET /api/requisitions/bulk-import/template
 * Download a CSV template for requisition import.
 */
router.get(
    '/bulk-import/template',
    authenticate,
    requireRole(['recruiter', 'admin']),
    async (_req: Request, res: Response): Promise<void> => {
        try {
            const templateCSV =
                'role_title,department,location,job_type,slots,job_family,required_skills,preferred_skills,min_experience_years,education_level,eligibility_criteria\n' +
                'Senior Software Engineer,Engineering,San Francisco,full_time,2,Software Development,"JavaScript,TypeScript,React","Node.js,AWS",5,Bachelor\'s,"{""citizenship"": ""US Citizen""}"\n' +
                'Product Manager,Product,Remote,full_time,1,Product Management,"Product Strategy,Roadmapping","Agile,Scrum",3,Bachelor\'s,"{}"\n' +
                'Data Analyst,Analytics,New York,contract,3,Data & Analytics,"SQL,Python,Tableau","R,Power BI",2,Bachelor\'s,"{}"';

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="requisition-import-template.csv"');
            res.status(200).send(templateCSV);
        } catch (error) {
            logger.error({ error }, '[bulk-import] failed to generate template');
            res.status(500).json({
                error: 'Failed to generate template',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
);

/**
 * GET /api/requisitions/:id
 * Get single requisition by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const requisition = await requisitionService.getRequisitionById(req.params.id);

        if (!requisition) {
            res.status(404).json({
                error: {
                    code: 'REQUISITION_NOT_FOUND',
                    message: 'Requisition not found',
                },
            });
            return;
        }

        res.status(200).json(requisition);
    } catch (error) {
        logger.error({ error, requisitionId: req.params.id }, 'Error fetching requisition');
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Unable to retrieve requisition',
            },
        });
    }
});

/**
 * GET /api/requisitions/:id/has-draft
 * Check if authenticated candidate has a draft for this requisition
 */
router.get('/:id/has-draft', authenticate, async (req: Request, res: Response) => {
    try {
        const requisitionId = req.params.id;
        const candidateId = req.user!.id;

        const draftExists = await hasDraft({ candidateId, requisitionId });

        res.status(200).json({
            hasDraft: draftExists,
        });
    } catch (error) {
        logger.error({ error, requisitionId: req.params.id }, 'Error checking draft status');
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Unable to check draft status',
            },
        });
    }
});

/**
 * GET /api/requisitions/:id/eligibility
 * Check if authenticated candidate can apply to this requisition
 * Enforces duplicate prevention and 90-day cooling period
 */
router.get('/:id/eligibility', authenticate, async (req: Request, res: Response) => {
    try {
        const requisitionId = req.params.id;
        const candidateId = req.user!.id;

        const eligibility = await checkApplicationEligibility({ candidateId, requisitionId });

        // Build user-friendly message
        let message: string | undefined;
        if (!eligibility.canApply) {
            if (eligibility.reason === 'active_application') {
                message = 'You already have an active application for this position.';
            } else if (eligibility.reason === 'cooling_period') {
                const days = eligibility.daysRemaining ?? 0;
                message = `Re-application available in ${days} day${days !== 1 ? 's' : ''}.`;
            }
        } else if (eligibility.reason === 'eligible') {
            message = 'You are eligible to apply for this position.';
        }

        res.status(200).json({
            canApply: eligibility.canApply,
            reason: eligibility.reason,
            existingApplicationId: eligibility.existingApplicationId,
            daysRemaining: eligibility.daysRemaining,
            rejectedAt: eligibility.rejectedAt?.toISOString(),
            message,
        });
    } catch (error) {
        logger.error({ error, requisitionId: req.params.id }, 'Error checking application eligibility');
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Unable to check application eligibility',
            },
        });
    }
});

export default router;
