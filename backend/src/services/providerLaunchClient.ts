/**
 * Provider Launch Client
 * 
 * HTTP client adapter for launching assessments with external assessment providers.
 * Handles request serialization, response parsing, timeout enforcement, and error mapping.
 * 
 * @module services/providerLaunchClient
 */

import axios, { AxiosError } from 'axios';
import type { AssessmentProvider, Application, Candidate } from '@prisma/client';
import logger from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface LaunchRequest {
    provider: AssessmentProvider;
    application: Application & {
        candidate: Candidate;
    };
    correlationId: string;
}

export interface LaunchResponse {
    testUrl: string;
    sessionToken: string;
    expiresAt?: string;
    metadata?: Record<string, unknown>;
}

export class ProviderLaunchError extends Error {
    constructor(
        public code: string,
        message: string,
        public statusCode?: number,
        public providerResponse?: unknown
    ) {
        super(message);
        this.name = 'ProviderLaunchError';
    }
}

// ============================================================================
// Launch Client
// ============================================================================

/**
 * Launch assessment session with external provider
 * 
 * Makes HTTP POST request to provider API endpoint with:
 * - Candidate information
 * - Application context
 * - Correlation ID for traceability
 * - Configured timeout enforcement
 * 
 * @throws {ProviderLaunchError} On validation, network, or provider errors
 */
export async function launchAssessmentWithProvider(
    request: LaunchRequest
): Promise<LaunchResponse> {
    const { provider, application, correlationId } = request;

    try {
        logger.info('Launching assessment with provider', {
            providerId: provider.id,
            providerName: provider.name,
            applicationId: application.id,
            candidateId: application.candidateId,
            correlationId,
        });

        // Build provider request payload
        const payload = serializeProviderRequest(request);

        // Determine timeout (use provider config or default to 30 seconds)
        const timeoutMs = (provider.timeoutSeconds || 30) * 1000;

        // Make HTTP request to provider API
        const response = await axios.post(provider.apiEndpoint, payload, {
            headers: {
                'Content-Type': 'application/json',
                'X-Correlation-ID': correlationId,
                ...buildAuthHeaders(provider),
            },
            timeout: timeoutMs,
            validateStatus: (status) => status >= 200 && status < 300,
        });

        // Parse and validate provider response
        const launchResponse = parseProviderResponse(response.data, provider.name);

        logger.info('Assessment launched successfully with provider', {
            providerId: provider.id,
            providerName: provider.name,
            applicationId: application.id,
            testUrl: sanitizeUrlForLogging(launchResponse.testUrl),
            correlationId,
        });

        return launchResponse;
    } catch (error) {
        // Map errors to canonical internal error types
        throw mapProviderError(error, provider, correlationId);
    }
}

// ============================================================================
// Request Serialization
// ============================================================================

/**
 * Serialize internal launch model to provider-specific request format
 */
function serializeProviderRequest(request: LaunchRequest): unknown {
    const { application } = request;

    // Normalize to common provider format
    // This can be extended to support provider-specific schemas
    return {
        candidate: {
            id: application.candidateId,
            email: application.candidate.email,
            firstName: application.candidate.firstName,
            lastName: application.candidate.lastName,
        },
        assessment: {
            applicationId: application.id,
            requisitionId: application.requisitionId,
        },
        metadata: {
            correlationId: request.correlationId,
            launchedAt: new Date().toISOString(),
        },
    };
}

/**
 * Build authentication headers based on provider auth mode
 */
function buildAuthHeaders(provider: AssessmentProvider): Record<string, string> {
    const headers: Record<string, string> = {};

    switch (provider.authMode) {
        case 'hmac':
            // HMAC authentication will be implemented in TASK-004 with retry logic
            // For now, we'll pass a basic authorization header
            if (provider.hmacSecret) {
                headers['Authorization'] = `Bearer ${provider.hmacSecret}`;
            }
            break;
        case 'api_key':
            if (provider.hmacSecret) {
                // Using hmacSecret field to store API key for now
                headers['X-API-Key'] = provider.hmacSecret;
            }
            break;
        case 'bearer':
            if (provider.hmacSecret) {
                headers['Authorization'] = `Bearer ${provider.hmacSecret}`;
            }
            break;
        default:
            logger.warn('Unsupported auth mode', {
                providerId: provider.id,
                authMode: provider.authMode,
            });
    }

    return headers;
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Parse and validate provider response
 * 
 * Enforces strict required-field validation:
 * - testUrl must be present and non-empty
 * - sessionToken must be present and non-empty
 */
function parseProviderResponse(data: unknown, providerName: string): LaunchResponse {
    if (!data || typeof data !== 'object') {
        throw new ProviderLaunchError(
            'INVALID_PROVIDER_RESPONSE',
            `Provider ${providerName} returned invalid response format`,
            500,
            data
        );
    }

    const response = data as Record<string, unknown>;

    // Validate required fields
    const testUrl = response.testUrl;
    const sessionToken = response.sessionToken;

    if (!testUrl || typeof testUrl !== 'string' || testUrl.trim() === '') {
        throw new ProviderLaunchError(
            'MISSING_TEST_URL',
            `Provider ${providerName} response missing required field: testUrl`,
            500,
            data
        );
    }

    if (!sessionToken || typeof sessionToken !== 'string' || sessionToken.trim() === '') {
        throw new ProviderLaunchError(
            'MISSING_SESSION_TOKEN',
            `Provider ${providerName} response missing required field: sessionToken`,
            500,
            data
        );
    }

    // Validate testUrl is a valid URL
    try {
        new URL(testUrl);
    } catch {
        throw new ProviderLaunchError(
            'INVALID_TEST_URL',
            `Provider ${providerName} returned invalid testUrl format`,
            500,
            data
        );
    }

    // Extract optional fields
    const expiresAt = typeof response.expiresAt === 'string' ? response.expiresAt : undefined;
    const metadata =
        response.metadata && typeof response.metadata === 'object'
            ? (response.metadata as Record<string, unknown>)
            : undefined;

    return {
        testUrl,
        sessionToken,
        expiresAt,
        metadata,
    };
}

// ============================================================================
// Error Mapping
// ============================================================================

/**
 * Map provider-specific errors to canonical internal error types
 */
function mapProviderError(
    error: unknown,
    provider: AssessmentProvider,
    correlationId: string
): ProviderLaunchError {
    if (error instanceof ProviderLaunchError) {
        return error;
    }

    if (axios.isAxiosError(error)) {
        return mapAxiosError(error as AxiosError, provider, correlationId);
    }

    // Unknown error type
    logger.error('Unexpected provider launch error', {
        providerId: provider.id,
        providerName: provider.name,
        error: error instanceof Error ? error.message : String(error),
        correlationId,
    });

    return new ProviderLaunchError(
        'PROVIDER_LAUNCH_FAILED',
        `Failed to launch assessment with provider ${provider.name}`,
        500
    );
}

/**
 * Map Axios HTTP errors to provider launch errors
 */
function mapAxiosError(
    error: AxiosError,
    provider: AssessmentProvider,
    correlationId: string
): ProviderLaunchError {
    const statusCode = error.response?.status;
    const responseData = error.response?.data;

    // Timeout error
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        logger.error('Provider API timeout', {
            providerId: provider.id,
            providerName: provider.name,
            timeoutSeconds: provider.timeoutSeconds,
            correlationId,
        });

        return new ProviderLaunchError(
            'PROVIDER_TIMEOUT',
            `Provider ${provider.name} did not respond within ${provider.timeoutSeconds || 30} seconds`,
            504
        );
    }

    // Network connectivity error
    if (!error.response) {
        logger.error('Provider API network error', {
            providerId: provider.id,
            providerName: provider.name,
            errorCode: error.code,
            correlationId,
        });

        return new ProviderLaunchError(
            'PROVIDER_UNREACHABLE',
            `Cannot reach provider ${provider.name} API endpoint`,
            503
        );
    }

    // HTTP error responses
    const sanitizedResponse = sanitizeProviderResponse(responseData);

    logger.error('Provider API returned error', {
        providerId: provider.id,
        providerName: provider.name,
        statusCode,
        response: sanitizedResponse,
        correlationId,
    });

    // Map provider status codes to internal error codes
    if (statusCode === 400) {
        return new ProviderLaunchError(
            'PROVIDER_VALIDATION_ERROR',
            `Provider ${provider.name} rejected request: invalid input`,
            400,
            sanitizedResponse
        );
    }

    if (statusCode === 401 || statusCode === 403) {
        return new ProviderLaunchError(
            'PROVIDER_AUTH_ERROR',
            `Provider ${provider.name} authentication failed`,
            500,
            sanitizedResponse
        );
    }

    if (statusCode === 429) {
        return new ProviderLaunchError(
            'PROVIDER_RATE_LIMIT',
            `Provider ${provider.name} rate limit exceeded`,
            429,
            sanitizedResponse
        );
    }

    if (statusCode && statusCode >= 500) {
        return new ProviderLaunchError(
            'PROVIDER_SERVER_ERROR',
            `Provider ${provider.name} service error`,
            502,
            sanitizedResponse
        );
    }

    // Generic HTTP error
    return new ProviderLaunchError(
        'PROVIDER_REQUEST_FAILED',
        `Provider ${provider.name} request failed with status ${statusCode}`,
        statusCode,
        sanitizedResponse
    );
}

// ============================================================================
// Security & Logging Utilities
// ============================================================================

/**
 * Sanitize provider response for logging (remove sensitive data)
 */
function sanitizeProviderResponse(data: unknown): unknown {
    if (!data || typeof data !== 'object') {
        return data;
    }

    const sanitized = { ...data } as Record<string, unknown>;

    // Remove sensitive fields
    const sensitiveFields = ['sessionToken', 'apiKey', 'secret', 'token', 'password'];
    for (const field of sensitiveFields) {
        if (field in sanitized) {
            sanitized[field] = '[REDACTED]';
        }
    }

    return sanitized;
}

/**
 * Sanitize URL for logging (preserve domain but hide sensitive query params)
 */
function sanitizeUrlForLogging(url: string): string {
    try {
        const parsed = new URL(url);
        return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch {
        return '[INVALID_URL]';
    }
}
