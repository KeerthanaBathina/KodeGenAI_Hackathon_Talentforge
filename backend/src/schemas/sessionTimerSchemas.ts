/**
 * Session Timer Validation Schemas
 * 
 * Zod schemas for validating session timer API requests
 */

import { z } from 'zod';

/**
 * Session ID parameter validation
 * Must be a valid UUID
 */
export const SessionIdParamSchema = z.object({
    sessionId: z.string().uuid('Invalid session ID format')
});

/**
 * Type for validated session ID parameter
 */
export type SessionIdParam = z.infer<typeof SessionIdParamSchema>;
