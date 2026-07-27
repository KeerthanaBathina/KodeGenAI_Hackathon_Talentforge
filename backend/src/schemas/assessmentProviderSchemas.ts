import { z } from 'zod';

/**
 * Validation schemas for assessment provider CRUD operations
 */

/**
 * Schema for creating a new assessment provider
 */
export const CreateAssessmentProviderSchema = z.object({
    name: z.string()
        .min(1, 'Provider name is required')
        .max(100, 'Provider name must not exceed 100 characters')
        .trim(),
    apiEndpoint: z.string()
        .url('API endpoint must be a valid URL')
        .max(500, 'API endpoint must not exceed 500 characters'),
    authMode: z.string()
        .min(1, 'Authentication mode is required')
        .max(50, 'Authentication mode must not exceed 50 characters'),
    hmacSecret: z.string()
        .length(64, 'HMAC secret must be exactly 64 characters')
        .regex(/^[0-9a-fA-F]{64}$/, 'HMAC secret must be a valid hex string')
        .optional(),
    timeoutSeconds: z.number()
        .int('Timeout must be an integer')
        .min(5, 'Timeout must be at least 5 seconds')
        .max(300, 'Timeout must not exceed 300 seconds')
        .default(30),
    active: z.boolean().default(true),
});

export type CreateAssessmentProviderInput = z.infer<typeof CreateAssessmentProviderSchema>;

/**
 * Schema for updating an assessment provider
 * All fields are optional except the ID parameter
 */
export const UpdateAssessmentProviderSchema = z.object({
    name: z.string()
        .min(1, 'Provider name is required')
        .max(100, 'Provider name must not exceed 100 characters')
        .trim()
        .optional(),
    apiEndpoint: z.string()
        .url('API endpoint must be a valid URL')
        .max(500, 'API endpoint must not exceed 500 characters')
        .optional(),
    authMode: z.string()
        .min(1, 'Authentication mode is required')
        .max(50, 'Authentication mode must not exceed 50 characters')
        .optional(),
    hmacSecret: z.string()
        .length(64, 'HMAC secret must be exactly 64 characters')
        .regex(/^[0-9a-fA-F]{64}$/, 'HMAC secret must be a valid hex string')
        .optional()
        .nullable(),
    timeoutSeconds: z.number()
        .int('Timeout must be an integer')
        .min(5, 'Timeout must be at least 5 seconds')
        .max(300, 'Timeout must not exceed 300 seconds')
        .optional(),
    active: z.boolean().optional(),
}).strict();

export type UpdateAssessmentProviderInput = z.infer<typeof UpdateAssessmentProviderSchema>;

/**
 * Schema for provider ID parameter validation
 */
export const ProviderIdParamSchema = z.object({
    id: z.string().uuid('Invalid provider ID format'),
});

export type ProviderIdParam = z.infer<typeof ProviderIdParamSchema>;

/**
 * Schema for listing providers with filters and pagination
 */
export const ListProvidersQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    active: z.enum(['true', 'false', 'all']).default('all').transform((val) => {
        if (val === 'true') return true;
        if (val === 'false') return false;
        return undefined;
    }),
    search: z.string().max(100).trim().optional(),
});

export type ListProvidersQuery = z.infer<typeof ListProvidersQuerySchema>;
