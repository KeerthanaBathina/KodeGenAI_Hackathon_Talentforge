import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate';
import { AUDIT_LOG_READER_ROLES, authorize } from '../../middleware/authorize';
import { parseAuditLogQueryFilters } from '../../services/auditLogQuerySchema';
import { getAuditLogPage } from '../../services/auditLogQueryService';
import { streamAuditLogCsv } from '../../services/auditLogExportService';
import logger from '../../utils/logger';

const router = express.Router();

router.use(authenticate);
router.use(authorize(AUDIT_LOG_READER_ROLES));

function toValidationErrorPayload(error: z.ZodError) {
    return {
        error: {
            code: 'INVALID_QUERY_PARAMS',
            message: 'Invalid query parameters',
            details: error.issues.map((issue) => ({
                path: issue.path.join('.'),
                code: issue.code,
                message: issue.message
            }))
        }
    };
}

router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const filters = parseAuditLogQueryFilters(req.query);
        const response = await getAuditLogPage(filters);

        res.status(200).json(response);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json(toValidationErrorPayload(error));
            return;
        }

        logger.error(
            {
                error,
                userId: req.user?.id,
                query: req.query
            },
            '[AuditLogRoute] Failed to fetch audit log'
        );

        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to retrieve audit log'
            }
        });
    }
});

router.get('/export.csv', async (req: Request, res: Response): Promise<void> => {
    try {
        const filters = parseAuditLogQueryFilters(req.query);
        await streamAuditLogCsv(filters, res);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json(toValidationErrorPayload(error));
            return;
        }

        logger.error(
            {
                error,
                userId: req.user?.id,
                query: req.query
            },
            '[AuditLogRoute] Failed to export audit log CSV'
        );

        if (res.headersSent) {
            if (!res.writableEnded) {
                res.end();
            }
            return;
        }

        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to export audit log'
            }
        });
    }
});

export default router;
