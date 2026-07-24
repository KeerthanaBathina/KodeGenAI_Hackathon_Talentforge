import express from 'express';
import { z } from 'zod';
import { processScanResult, ScanWebhookError } from '../services/scanWebhookService';
import { processParseResult, ParseResultError } from '../services/parseResultService';
import { env } from '../config/env';
import logger from '../utils/logger';

const router = express.Router();

const ScanResultSchema = z.object({
    resumeId: z.string().uuid(),
    status: z.enum(['clean', 'infected']),
    threats: z.array(z.string()).optional(),
    scannerVersion: z.string().optional(),
    scanTime: z.string().datetime().optional(),
});

/**
 * POST /api/webhooks/scan-result
 * Receive malware scan results from antivirus service
 */
router.post('/scan-result', async (req, res) => {
    try {
        // Validate webhook signature/token
        const webhookToken = req.headers['x-webhook-token'];
        if (webhookToken !== env.SCAN_WEBHOOK_SECRET) {
            logger.warn('Invalid webhook token', {
                ip: req.ip,
                headers: req.headers,
            });
            return res.status(401).json({
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Invalid webhook token',
                },
            });
        }

        // Validate payload
        const validation = ScanResultSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: {
                    code: 'INVALID_PAYLOAD',
                    message: 'Invalid scan result payload',
                    details: validation.error.errors,
                },
            });
        }

        const scanResult = validation.data;

        await processScanResult({
            ...scanResult,
            scanTime: scanResult.scanTime ? new Date(scanResult.scanTime) : undefined,
        });

        return res.status(200).json({ received: true });
    } catch (error) {
        if (error instanceof ScanWebhookError) {
            return res.status(404).json({
                error: {
                    code: error.code,
                    message: error.message,
                },
            });
        }

        logger.error('Webhook processing error', {
            error: error instanceof Error ? error.message : String(error),
        });

        return res.status(500).json({
            error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to process scan result',
            },
        });
    }
});

const ParseResultSchema = z.object({
    resumeId: z.string().uuid(),
    status: z.enum(['success', 'failed']),
    parsedData: z
        .object({
            name: z.string(),
            email: z.string().optional(),
            phone: z.string().optional(),
            skills: z.array(z.string()),
            experience_years: z.number().int().min(0),
            employers: z.array(
                z.object({
                    name: z.string(),
                    title: z.string(),
                    duration: z.string().optional(),
                })
            ),
            education: z.array(
                z.object({
                    degree: z.string(),
                    field: z.string(),
                    institution: z.string(),
                })
            ),
            raw_text: z.string().optional(),
            extracted_at: z.string(),
        })
        .optional(),
    error: z.string().optional(),
});

/**
 * POST /api/webhooks/parse-result
 * Receive parsed resume data from Python worker
 */
router.post('/parse-result', async (req, res) => {
    try {
        // Validate worker token
        const workerToken = req.headers['x-worker-token'];
        if (!workerToken || workerToken !== env.WORKER_TOKEN) {
            logger.warn('Invalid worker token', {
                ip: req.ip,
            });
            return res.status(401).json({
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Unauthorized',
                },
            });
        }

        // Validate payload
        const validation = ParseResultSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid payload',
                    details: validation.error.errors,
                },
            });
        }

        const payload = validation.data;

        await processParseResult(payload);

        return res.status(200).json({
            success: true,
            message: 'Parse result processed successfully',
        });
    } catch (error) {
        if (error instanceof ParseResultError) {
            return res.status(error.statusCode).json({
                error: {
                    code: error.code,
                    message: error.message,
                },
            });
        }

        logger.error('Parse result webhook error', {
            error: error instanceof Error ? error.message : String(error),
        });

        return res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to process parse result',
            },
        });
    }
});

export default router;
