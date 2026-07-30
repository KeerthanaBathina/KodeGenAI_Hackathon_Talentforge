import prisma from '../db/prisma';
import logger from '../utils/logger';
import type { AssessmentProvider, Application, Requisition } from '@prisma/client';

/**
 * Assessment Provider Resolution Service
 * 
 * Resolves provider configuration from requisition mappings
 * and validates provider eligibility for launching assessments.
 */

export class ProviderResolutionError extends Error {
    constructor(
        public code: string,
        message: string
    ) {
        super(message);
        this.name = 'ProviderResolutionError';
    }
}

export interface ResolveProviderParams {
    applicationId: string;
    providerId?: string;
}

export interface ResolvedProvider {
    provider: AssessmentProvider;
    application: Application & {
        requisition: Requisition;
    };
}

/**
 * Resolve provider configuration for an assessment launch
 * 
 * Resolution strategy:
 * 1. If providerId override is provided (admin/internal use), validate and return it
 * 2. Otherwise, resolve from application -> requisition -> provider mapping
 * 3. Validate provider is active and has required configuration
 */
export async function resolveProvider(
    params: ResolveProviderParams
): Promise<ResolvedProvider> {
    const { applicationId, providerId } = params;

    try {
        logger.debug('Resolving assessment provider', { applicationId, providerId });

        // Fetch application with requisition
        const application = await prisma.application.findUnique({
            where: { id: applicationId },
            include: {
                requisition: true,
            },
        });

        if (!application) {
            throw new ProviderResolutionError(
                'APPLICATION_NOT_FOUND',
                `Application ${applicationId} not found`
            );
        }

        // Check application is in eligible state for assessment launch
        const eligibleStatuses = ['shortlisted', 'interviewing'];
        if (!eligibleStatuses.includes(application.status)) {
            throw new ProviderResolutionError(
                'APPLICATION_INELIGIBLE',
                `Application must be in ${eligibleStatuses.join(' or ')} status to launch assessment`
            );
        }

        // Resolve provider ID from override or requisition mapping
        let resolvedProviderId: string;

        if (providerId) {
            // Override provided - validate it exists
            logger.debug('Using provider override', { providerId });
            resolvedProviderId = providerId;
        } else {
            // TODO: Implement requisition -> provider mapping
            // For now, fetch the first active provider as default
            const defaultProvider = await prisma.assessmentProvider.findFirst({
                where: { active: true },
            });

            if (!defaultProvider) {
                throw new ProviderResolutionError(
                    'NO_PROVIDER_CONFIGURED',
                    'No active assessment provider configured'
                );
            }

            resolvedProviderId = defaultProvider.id;
            logger.debug('Resolved provider from default', {
                providerId: resolvedProviderId,
                providerName: defaultProvider.name,
            });
        }

        // Fetch and validate provider configuration
        const provider = await prisma.assessmentProvider.findUnique({
            where: { id: resolvedProviderId },
        });

        if (!provider) {
            throw new ProviderResolutionError(
                'PROVIDER_NOT_FOUND',
                `Assessment provider ${resolvedProviderId} not found`
            );
        }

        if (!provider.active) {
            throw new ProviderResolutionError(
                'PROVIDER_INACTIVE',
                `Assessment provider ${provider.name} is inactive`
            );
        }

        // Validate required configuration fields
        if (!provider.apiEndpoint || !provider.authMode) {
            throw new ProviderResolutionError(
                'PROVIDER_MISCONFIGURED',
                `Provider ${provider.name} is missing required configuration`
            );
        }

        logger.info('Provider resolved successfully', {
            applicationId,
            providerId: provider.id,
            providerName: provider.name,
        });

        return {
            provider,
            application,
        };
    } catch (error) {
        if (error instanceof ProviderResolutionError) {
            throw error;
        }

        logger.error('Error resolving provider', {
            applicationId,
            providerId,
            error: error instanceof Error ? error.message : String(error),
        });

        throw new ProviderResolutionError(
            'PROVIDER_RESOLUTION_FAILED',
            'Failed to resolve assessment provider'
        );
    }
}

/**
 * Check if duplicate active assessment session already exists
 */
export async function checkDuplicateLaunch(
    applicationId: string
): Promise<boolean> {
    const existingSession = await prisma.assessmentSession.findFirst({
        where: {
            applicationId,
            status: {
                in: ['in_progress'],
            },
        },
    });

    return existingSession !== null;
}

/**
 * ==================== CRUD Operations for Assessment Providers ====================
 */

import { encrypt, decrypt, isEncrypted } from '../utils/encryption';
import type {
    CreateAssessmentProviderInput,
    UpdateAssessmentProviderInput,
    ListProvidersQuery,
} from '../schemas/assessmentProviderSchemas';

export interface ProviderWithRedactedSecrets extends Omit<AssessmentProvider, 'hmacSecret'> {
    hmacSecret: string | null;
}

export interface ListProvidersResult {
    providers: ProviderWithRedactedSecrets[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

/**
 * Redact HMAC secret unless user has admin role
 */
function redactSecret(
    provider: AssessmentProvider,
    userRole?: string
): ProviderWithRedactedSecrets {
    const allowedRoles = ['admin', 'security_admin'];
    const shouldRedact = !userRole || !allowedRoles.includes(userRole);

    return {
        ...provider,
        hmacSecret: shouldRedact && provider.hmacSecret ? '[REDACTED]' : provider.hmacSecret,
    };
}

/**
 * Create a new assessment provider
 */
export async function createProvider(
    data: CreateAssessmentProviderInput,
    actorId: string
): Promise<ProviderWithRedactedSecrets> {
    try {
        logger.debug('Creating assessment provider', { name: data.name, actorId });

        // Encrypt HMAC secret if provided
        const hmacSecretEncrypted = data.hmacSecret ? encrypt(data.hmacSecret) : null;

        const provider = await prisma.assessmentProvider.create({
            data: {
                name: data.name,
                apiEndpoint: data.apiEndpoint,
                authMode: data.authMode,
                hmacSecret: hmacSecretEncrypted,
                timeoutSeconds: data.timeoutSeconds ?? 30,
                active: data.active ?? true,
            },
        });

        // Log audit event
        await prisma.auditEvent.create({
            data: {
                actorId,
                eventType: 'PROVIDER_CREATED',
                entityType: 'assessment_provider',
                entityId: provider.id,
                payloadJson: {
                    name: provider.name,
                    apiEndpoint: provider.apiEndpoint,
                    authMode: provider.authMode,
                    active: provider.active,
                },
            },
        });

        logger.info('Assessment provider created', {
            providerId: provider.id,
            name: provider.name,
            actorId,
        });

        return redactSecret(provider);
    } catch (error) {
        logger.error('Failed to create provider', {
            name: data.name,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}

/**
 * Get a single provider by ID
 */
export async function getProviderById(
    id: string,
    userRole?: string
): Promise<ProviderWithRedactedSecrets | null> {
    const provider = await prisma.assessmentProvider.findUnique({
        where: { id },
    });

    if (!provider) {
        return null;
    }

    return redactSecret(provider, userRole);
}

/**
 * List providers with filtering and pagination
 */
export async function listProviders(
    filters: ListProvidersQuery,
    userRole?: string
): Promise<ListProvidersResult> {
    const { page, limit, active, search } = filters;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};
    
    if (active !== undefined) {
        where.active = active;
    }
    
    if (search) {
        where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { apiEndpoint: { contains: search, mode: 'insensitive' } },
        ];
    }

    // Execute query with pagination
    const [providers, total] = await Promise.all([
        prisma.assessmentProvider.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
        }),
        prisma.assessmentProvider.count({ where }),
    ]);

    return {
        providers: providers.map((p) => redactSecret(p, userRole)),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

/**
 * Update a provider configuration
 */
export async function updateProvider(
    id: string,
    data: UpdateAssessmentProviderInput,
    actorId: string
): Promise<ProviderWithRedactedSecrets> {
    try {
        // Check if provider exists
        const existingProvider = await prisma.assessmentProvider.findUnique({
            where: { id },
        });

        if (!existingProvider) {
            throw new Error('Provider not found');
        }

        // Prepare update data
        const updateData: any = { ...data };

        // Encrypt HMAC secret if being updated
        if (data.hmacSecret !== undefined) {
            updateData.hmacSecret = data.hmacSecret ? encrypt(data.hmacSecret) : null;
        }

        const updatedProvider = await prisma.assessmentProvider.update({
            where: { id },
            data: updateData,
        });

        // Track changed fields for audit
        const changedFields = Object.keys(data).filter(
            (key) => data[key as keyof UpdateAssessmentProviderInput] !== undefined
        );

        // Log audit event
        await prisma.auditEvent.create({
            data: {
                actorId,
                eventType: 'PROVIDER_UPDATED',
                entityType: 'assessment_provider',
                entityId: updatedProvider.id,
                payloadJson: {
                    changedFields,
                    ...updateData,
                },
            },
        });

        logger.info('Assessment provider updated', {
            providerId: id,
            changedFields,
            actorId,
        });

        return redactSecret(updatedProvider);
    } catch (error) {
        logger.error('Failed to update provider', {
            providerId: id,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}

/**
 * Soft delete a provider (set active = false)
 */
export async function deleteProvider(id: string, actorId: string): Promise<void> {
    try {
        // Check if provider exists
        const existingProvider = await prisma.assessmentProvider.findUnique({
            where: { id },
        });

        if (!existingProvider) {
            throw new Error('Provider not found');
        }

        // Soft delete
        await prisma.assessmentProvider.update({
            where: { id },
            data: { active: false },
        });

        // Log audit event
        await prisma.auditEvent.create({
            data: {
                actorId,
                eventType: 'PROVIDER_DELETED',
                entityType: 'assessment_provider',
                entityId: id,
                payloadJson: {
                    name: existingProvider.name,
                },
            },
        });

        logger.info('Assessment provider deleted', { providerId: id, actorId });
    } catch (error) {
        logger.error('Failed to delete provider', {
            providerId: id,
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
}

/**
 * Decrypt HMAC secret for webhook signature validation
 * This should only be called internally for signature verification
 */
export function decryptHmacSecret(encryptedSecret: string): string {
    if (!isEncrypted(encryptedSecret)) {
        // Legacy support for unencrypted secrets during migration
        logger.warn('HMAC secret is not encrypted, returning as-is (migration phase)');
        return encryptedSecret;
    }
    return decrypt(encryptedSecret);
}
