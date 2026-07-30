import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { TemplateType } from '@prisma/client';
import * as templateService from '../services/templateService';
import * as templatePreviewService from '../services/templatePreviewService';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import logger from '../utils/logger';

const router = Router();

// Validation schemas
const TemplateFiltersSchema = z.object({
  type: z.nativeEnum(TemplateType).optional(),
  locale: z.string().max(10).optional(),
  active: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
});

const TemplateUpdateSchema = z.object({
  name: z.string().min(1).max(255),
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().min(1),
  bodyText: z.string().min(1),
});

const RollbackRequestSchema = z.object({
  versionNumber: z.number().int().min(1),
});

const PreviewRequestSchema = z.object({
  subject: z.string().max(500),
  bodyHtml: z.string(),
  bodyText: z.string(),
  sampleData: z.record(z.string()).optional(),
  templateType: z.nativeEnum(TemplateType).optional(),
});

/**
 * GET /api/templates
 * List all templates with optional filters
 * Requires: Admin role
 */
router.get(
  '/',
  authenticate,
  authorize(['admin']),
  async (req: Request, res: Response) => {
    try {
      const filters = TemplateFiltersSchema.parse(req.query);

      const templates = await templateService.getTemplates(filters);

      res.status(200).json({
        templates,
        count: templates.length,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn({ error: error.errors }, 'Invalid template list query parameters');
        res.status(400).json({
          error: {
            code: 'INVALID_QUERY_PARAMS',
            message: 'Invalid query parameters',
            details: error.errors,
          },
        });
        return;
      }

      logger.error({ error }, 'Error listing templates');
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unable to retrieve templates',
        },
      });
    }
  }
);

/**
 * GET /api/templates/:id
 * Get single template by ID
 * Requires: Authenticated user
 */
router.get(
  '/:id',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const template = await templateService.getTemplateById(id);

      if (!template) {
        res.status(404).json({
          error: {
            code: 'TEMPLATE_NOT_FOUND',
            message: 'Template not found',
          },
        });
        return;
      }

      res.status(200).json({ template });
    } catch (error) {
      logger.error({ error, templateId: req.params.id }, 'Error retrieving template');
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unable to retrieve template',
        },
      });
    }
  }
);

/**
 * PUT /api/templates/:id
 * Update template and create new version
 * Requires: Admin role
 */
router.put(
  '/:id',
  authenticate,
  authorize(['admin']),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updateData = TemplateUpdateSchema.parse(req.body);

      if (!req.user?.id) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User ID not found in request',
          },
        });
        return;
      }

      const updatedTemplate = await templateService.updateTemplate(
        id,
        updateData,
        req.user.id
      );

      // Get new version number
      const currentVersion = await templateService.getCurrentVersionNumber(id);

      res.status(200).json({
        template: updatedTemplate,
        version: currentVersion,
        message: 'Template updated successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn(
          { error: error.errors, templateId: req.params.id },
          'Invalid template update data'
        );
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST_DATA',
            message: 'Invalid template data',
            details: error.errors,
          },
        });
        return;
      }

      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          error: {
            code: 'TEMPLATE_NOT_FOUND',
            message: error.message,
          },
        });
        return;
      }

      logger.error({ error, templateId: req.params.id }, 'Error updating template');
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unable to update template',
        },
      });
    }
  }
);

/**
 * GET /api/templates/:id/versions
 * Get version history for a template
 * Requires: Admin role
 */
router.get(
  '/:id/versions',
  authenticate,
  authorize(['admin']),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Verify template exists
      const template = await templateService.getTemplateById(id);
      if (!template) {
        res.status(404).json({
          error: {
            code: 'TEMPLATE_NOT_FOUND',
            message: 'Template not found',
          },
        });
        return;
      }

      const versions = await templateService.getTemplateVersions(id);

      res.status(200).json({
        templateId: id,
        versions,
        count: versions.length,
      });
    } catch (error) {
      logger.error(
        { error, templateId: req.params.id },
        'Error retrieving template versions'
      );
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unable to retrieve template versions',
        },
      });
    }
  }
);

/**
 * POST /api/templates/:id/rollback
 * Rollback template to a specific version
 * Requires: Admin role
 */
router.post(
  '/:id/rollback',
  authenticate,
  authorize(['admin']),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { versionNumber } = RollbackRequestSchema.parse(req.body);

      if (!req.user?.id) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User ID not found in request',
          },
        });
        return;
      }

      const rolledBackTemplate = await templateService.rollbackTemplate(
        id,
        versionNumber,
        req.user.id
      );

      // Get new version number
      const currentVersion = await templateService.getCurrentVersionNumber(id);

      res.status(200).json({
        template: rolledBackTemplate,
        restoredFromVersion: versionNumber,
        newVersion: currentVersion,
        message: `Template restored to version ${versionNumber}`,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn(
          { error: error.errors, templateId: req.params.id },
          'Invalid rollback request data'
        );
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST_DATA',
            message: 'Invalid rollback request',
            details: error.errors,
          },
        });
        return;
      }

      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          error: {
            code: 'VERSION_NOT_FOUND',
            message: error.message,
          },
        });
        return;
      }

      logger.error(
        { error, templateId: req.params.id },
        'Error rolling back template'
      );
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unable to rollback template',
        },
      });
    }
  }
);

/**
 * POST /api/templates/preview
 * Preview template with token replacement
 * Requires: Authenticated user
 */
router.post(
  '/preview',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const previewData = PreviewRequestSchema.parse(req.body);

      const preview = templatePreviewService.previewTemplate(previewData);

      res.status(200).json(preview);
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn(
          { error: error.errors },
          'Invalid template preview request data'
        );
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST_DATA',
            message: 'Invalid preview request',
            details: error.errors,
          },
        });
        return;
      }

      logger.error({ error }, 'Error generating template preview');
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unable to generate preview',
        },
      });
    }
  }
);

/**
 * GET /api/templates/sample-data/:type
 * Get sample data for a specific template type
 * Requires: Authenticated user
 */
router.get(
  '/sample-data/:type',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { type } = req.params;

      // Validate template type
      if (!Object.values(TemplateType).includes(type as TemplateType)) {
        res.status(400).json({
          error: {
            code: 'INVALID_TEMPLATE_TYPE',
            message: `Invalid template type: ${type}`,
            validTypes: Object.values(TemplateType),
          },
        });
        return;
      }

      const sampleData = templatePreviewService.getTemplateSampleData(
        type as TemplateType
      );

      res.status(200).json({
        type,
        sampleData,
        tokenCount: Object.keys(sampleData).length,
      });
    } catch (error) {
      logger.error({ error, templateType: req.params.type }, 'Error retrieving sample data');
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unable to retrieve sample data',
        },
      });
    }
  }
);

/**
 * GET /api/templates/fallback-stats
 * Get locale fallback statistics for monitoring and localization planning
 * Returns aggregated data about which locales are being requested but not available
 * Requires: Admin role
 */
router.get(
  '/fallback-stats',
  authenticate,
  authorize(['admin']),
  async (req: Request, res: Response) => {
    try {
      const stats = templateService.getFallbackStats();

      res.status(200).json({
        ...stats,
        message: 'Fallback statistics retrieved successfully',
        note: 'Statistics are based on in-memory tracking since application start',
      });

      logger.debug(
        { totalFallbacks: stats.totalFallbacks },
        'Fallback statistics requested by admin'
      );
    } catch (error) {
      logger.error({ error }, 'Error retrieving fallback statistics');
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unable to retrieve fallback statistics',
        },
      });
    }
  }
);

export default router;
