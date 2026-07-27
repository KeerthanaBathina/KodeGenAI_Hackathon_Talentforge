/**
 * Unit Tests for Provider Launch Client
 * 
 * Tests request serialization, response parsing, error mapping,
 * and provider-specific logic without database or HTTP dependencies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import {
    launchAssessmentWithProvider,
    ProviderLaunchError,
    type LaunchRequest,
} from '../providerLaunchClient';
import type { AssessmentProvider, Application, Candidate } from '@prisma/client';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// Mock axios.isAxiosError to recognize our mock errors
mockedAxios.isAxiosError = vi.fn((error: any) => {
    return error && error.isAxiosError === true;
});

// Mock logger
vi.mock('../../utils/logger', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

describe('providerLaunchClient', () => {
    const mockProvider: AssessmentProvider = {
        id: 'provider-1',
        name: 'TestProvider',
        apiEndpoint: 'https://api.testprovider.com/launch',
        authMode: 'bearer',
        hmacSecret: 'test-secret-key',
        timeoutSeconds: 30,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const mockCandidate: Candidate = {
        id: 'candidate-1',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        password: 'hashed',
        role: 'candidate',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const mockApplication: Application & { candidate: Candidate } = {
        id: 'app-1',
        candidateId: 'candidate-1',
        requisitionId: 'req-1',
        status: 'shortlisted',
        appliedAt: new Date(),
        updatedAt: new Date(),
        candidate: mockCandidate,
    };

    const mockLaunchRequest: LaunchRequest = {
        provider: mockProvider,
        application: mockApplication,
        correlationId: 'corr-123',
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('launchAssessmentWithProvider - Success Cases', () => {
        it('should successfully launch assessment with valid provider response', async () => {
            mockedAxios.post.mockResolvedValueOnce({
                status: 200,
                data: {
                    testUrl: 'https://testprovider.com/test/abc123',
                    sessionToken: 'sess_abc123xyz',
                    expiresAt: '2026-07-28T12:00:00Z',
                    metadata: {
                        testDuration: 3600,
                    },
                },
            });

            const result = await launchAssessmentWithProvider(mockLaunchRequest);

            expect(result).toEqual({
                testUrl: 'https://testprovider.com/test/abc123',
                sessionToken: 'sess_abc123xyz',
                expiresAt: '2026-07-28T12:00:00Z',
                metadata: {
                    testDuration: 3600,
                },
            });

            // Verify axios was called with correct parameters
            expect(mockedAxios.post).toHaveBeenCalledWith(
                'https://api.testprovider.com/launch',
                {
                    candidate: {
                        id: 'candidate-1',
                        email: 'test@example.com',
                        firstName: 'John',
                        lastName: 'Doe',
                    },
                    assessment: {
                        applicationId: 'app-1',
                        requisitionId: 'req-1',
                    },
                    metadata: {
                        correlationId: 'corr-123',
                        launchedAt: expect.any(String),
                    },
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Correlation-ID': 'corr-123',
                        Authorization: 'Bearer test-secret-key',
                    },
                    timeout: 30000,
                    validateStatus: expect.any(Function),
                }
            );
        });

        it('should handle minimal valid provider response (required fields only)', async () => {
            mockedAxios.post.mockResolvedValueOnce({
                status: 200,
                data: {
                    testUrl: 'https://testprovider.com/test/xyz',
                    sessionToken: 'sess_xyz',
                },
            });

            const result = await launchAssessmentWithProvider(mockLaunchRequest);

            expect(result).toEqual({
                testUrl: 'https://testprovider.com/test/xyz',
                sessionToken: 'sess_xyz',
                expiresAt: undefined,
                metadata: undefined,
            });
        });

        it('should use provider timeout configuration', async () => {
            const providerWithCustomTimeout = {
                ...mockProvider,
                timeoutSeconds: 60,
            };

            mockedAxios.post.mockResolvedValueOnce({
                status: 200,
                data: {
                    testUrl: 'https://testprovider.com/test/abc',
                    sessionToken: 'sess_abc',
                },
            });

            await launchAssessmentWithProvider({
                ...mockLaunchRequest,
                provider: providerWithCustomTimeout,
            });

            expect(mockedAxios.post).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Object),
                expect.objectContaining({
                    timeout: 60000, // 60 seconds
                })
            );
        });
    });

    describe('launchAssessmentWithProvider - Response Validation', () => {
        it('should reject response missing testUrl', async () => {
            mockedAxios.post.mockResolvedValueOnce({
                status: 200,
                data: {
                    sessionToken: 'sess_abc123xyz',
                },
            });

            try {
                await launchAssessmentWithProvider(mockLaunchRequest);
                expect.fail('Should have thrown ProviderLaunchError');
            } catch (error) {
                expect(error).toBeInstanceOf(ProviderLaunchError);
                expect((error as ProviderLaunchError).code).toBe('MISSING_TEST_URL');
                expect((error as ProviderLaunchError).message).toContain('testUrl');
            }
        });

        it('should reject response missing sessionToken', async () => {
            mockedAxios.post.mockResolvedValueOnce({
                status: 200,
                data: {
                    testUrl: 'https://testprovider.com/test/abc',
                },
            });

            try {
                await launchAssessmentWithProvider(mockLaunchRequest);
                expect.fail('Should have thrown ProviderLaunchError');
            } catch (error) {
                expect(error).toBeInstanceOf(ProviderLaunchError);
                expect((error as ProviderLaunchError).code).toBe('MISSING_SESSION_TOKEN');
                expect((error as ProviderLaunchError).message).toContain('sessionToken');
            }
        });

        it('should reject response with empty testUrl', async () => {
            mockedAxios.post.mockResolvedValueOnce({
                status: 200,
                data: {
                    testUrl: '   ',
                    sessionToken: 'sess_abc',
                },
            });

            await expect(launchAssessmentWithProvider(mockLaunchRequest)).rejects.toThrow(
                ProviderLaunchError
            );
        });

        it('should reject response with empty sessionToken', async () => {
            mockedAxios.post.mockResolvedValueOnce({
                status: 200,
                data: {
                    testUrl: 'https://testprovider.com/test/abc',
                    sessionToken: '',
                },
            });

            await expect(launchAssessmentWithProvider(mockLaunchRequest)).rejects.toThrow(
                ProviderLaunchError
            );
        });

        it('should reject response with invalid testUrl format', async () => {
            mockedAxios.post.mockResolvedValueOnce({
                status: 200,
                data: {
                    testUrl: 'not-a-valid-url',
                    sessionToken: 'sess_abc',
                },
            });

            try {
                await launchAssessmentWithProvider(mockLaunchRequest);
            } catch (error) {
                expect(error).toBeInstanceOf(ProviderLaunchError);
                expect((error as ProviderLaunchError).code).toBe('INVALID_TEST_URL');
                expect((error as ProviderLaunchError).message).toContain('invalid testUrl');
            }
        });

        it('should reject non-object response', async () => {
            mockedAxios.post.mockResolvedValueOnce({
                status: 200,
                data: 'string response',
            });

            try {
                await launchAssessmentWithProvider(mockLaunchRequest);
            } catch (error) {
                expect(error).toBeInstanceOf(ProviderLaunchError);
                expect((error as ProviderLaunchError).code).toBe('INVALID_PROVIDER_RESPONSE');
            }
        });

        it('should reject null response', async () => {
            mockedAxios.post.mockResolvedValueOnce({
                status: 200,
                data: null,
            });

            try {
                await launchAssessmentWithProvider(mockLaunchRequest);
            } catch (error) {
                expect(error).toBeInstanceOf(ProviderLaunchError);
                expect((error as ProviderLaunchError).code).toBe('INVALID_PROVIDER_RESPONSE');
            }
        });
    });

    describe('launchAssessmentWithProvider - Error Mapping', () => {
        it('should map timeout error', async () => {
            const timeoutError = new Error('timeout of 30000ms exceeded');
            (timeoutError as any).code = 'ECONNABORTED';
            (timeoutError as any).isAxiosError = true;
            mockedAxios.post.mockRejectedValueOnce(timeoutError);

            try {
                await launchAssessmentWithProvider(mockLaunchRequest);
            } catch (error) {
                expect(error).toBeInstanceOf(ProviderLaunchError);
                expect((error as ProviderLaunchError).code).toBe('PROVIDER_TIMEOUT');
                expect((error as ProviderLaunchError).statusCode).toBe(504);
                expect((error as ProviderLaunchError).message).toContain('did not respond');
            }
        });

        it('should map network connectivity error', async () => {
            const networkError = new Error('Network error');
            (networkError as any).code = 'ENOTFOUND';
            (networkError as any).isAxiosError = true;
            mockedAxios.post.mockRejectedValueOnce(networkError);

            try {
                await launchAssessmentWithProvider(mockLaunchRequest);
            } catch (error) {
                expect(error).toBeInstanceOf(ProviderLaunchError);
                expect((error as ProviderLaunchError).code).toBe('PROVIDER_UNREACHABLE');
                expect((error as ProviderLaunchError).statusCode).toBe(503);
            }
        });

        it('should map 400 validation error', async () => {
            mockedAxios.post.mockRejectedValueOnce({
                isAxiosError: true,
                response: {
                    status: 400,
                    data: { error: 'Invalid request' },
                },
            });

            try {
                await launchAssessmentWithProvider(mockLaunchRequest);
            } catch (error) {
                expect(error).toBeInstanceOf(ProviderLaunchError);
                expect((error as ProviderLaunchError).code).toBe('PROVIDER_VALIDATION_ERROR');
                expect((error as ProviderLaunchError).statusCode).toBe(400);
            }
        });

        it('should map 401 authentication error', async () => {
            mockedAxios.post.mockRejectedValueOnce({
                isAxiosError: true,
                response: {
                    status: 401,
                    data: { error: 'Unauthorized' },
                },
            });

            try {
                await launchAssessmentWithProvider(mockLaunchRequest);
            } catch (error) {
                expect(error).toBeInstanceOf(ProviderLaunchError);
                expect((error as ProviderLaunchError).code).toBe('PROVIDER_AUTH_ERROR');
                expect((error as ProviderLaunchError).statusCode).toBe(500);
            }
        });

        it('should map 403 authorization error', async () => {
            mockedAxios.post.mockRejectedValueOnce({
                isAxiosError: true,
                response: {
                    status: 403,
                    data: { error: 'Forbidden' },
                },
            });

            try {
                await launchAssessmentWithProvider(mockLaunchRequest);
            } catch (error) {
                expect(error).toBeInstanceOf(ProviderLaunchError);
                expect((error as ProviderLaunchError).code).toBe('PROVIDER_AUTH_ERROR');
                expect((error as ProviderLaunchError).statusCode).toBe(500);
            }
        });

        it('should map 429 rate limit error', async () => {
            mockedAxios.post.mockRejectedValueOnce({
                isAxiosError: true,
                response: {
                    status: 429,
                    data: { error: 'Rate limit exceeded' },
                },
            });

            try {
                await launchAssessmentWithProvider(mockLaunchRequest);
            } catch (error) {
                expect(error).toBeInstanceOf(ProviderLaunchError);
                expect((error as ProviderLaunchError).code).toBe('PROVIDER_RATE_LIMIT');
                expect((error as ProviderLaunchError).statusCode).toBe(429);
            }
        });

        it('should map 500 server error', async () => {
            mockedAxios.post.mockRejectedValueOnce({
                isAxiosError: true,
                response: {
                    status: 500,
                    data: { error: 'Internal server error' },
                },
            });

            try {
                await launchAssessmentWithProvider(mockLaunchRequest);
            } catch (error) {
                expect(error).toBeInstanceOf(ProviderLaunchError);
                expect((error as ProviderLaunchError).code).toBe('PROVIDER_SERVER_ERROR');
                expect((error as ProviderLaunchError).statusCode).toBe(502);
            }
        });

        it('should map 503 service unavailable error', async () => {
            mockedAxios.post.mockRejectedValueOnce({
                isAxiosError: true,
                response: {
                    status: 503,
                    data: { error: 'Service unavailable' },
                },
            });

            try {
                await launchAssessmentWithProvider(mockLaunchRequest);
            } catch (error) {
                expect(error).toBeInstanceOf(ProviderLaunchError);
                expect((error as ProviderLaunchError).code).toBe('PROVIDER_SERVER_ERROR');
                expect((error as ProviderLaunchError).statusCode).toBe(502);
            }
        });

        it('should map unknown HTTP error', async () => {
            mockedAxios.post.mockRejectedValueOnce({
                isAxiosError: true,
                response: {
                    status: 418, // I'm a teapot
                    data: { error: 'Teapot' },
                },
            });

            try {
                await launchAssessmentWithProvider(mockLaunchRequest);
            } catch (error) {
                expect(error).toBeInstanceOf(ProviderLaunchError);
                expect((error as ProviderLaunchError).code).toBe('PROVIDER_REQUEST_FAILED');
                expect((error as ProviderLaunchError).statusCode).toBe(418);
            }
        });

        it('should map unknown error', async () => {
            mockedAxios.post.mockRejectedValueOnce(new Error('Unknown error'));

            try {
                await launchAssessmentWithProvider(mockLaunchRequest);
            } catch (error) {
                expect(error).toBeInstanceOf(ProviderLaunchError);
                expect((error as ProviderLaunchError).code).toBe('PROVIDER_LAUNCH_FAILED');
                expect((error as ProviderLaunchError).statusCode).toBe(500);
            }
        });
    });

    describe('launchAssessmentWithProvider - Authentication Headers', () => {
        it('should add Bearer token for bearer auth mode', async () => {
            mockedAxios.post.mockResolvedValueOnce({
                status: 200,
                data: {
                    testUrl: 'https://testprovider.com/test/abc',
                    sessionToken: 'sess_abc',
                },
            });

            await launchAssessmentWithProvider({
                ...mockLaunchRequest,
                provider: { ...mockProvider, authMode: 'bearer' },
            });

            expect(mockedAxios.post).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Object),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: 'Bearer test-secret-key',
                    }),
                })
            );
        });

        it('should add API key header for api_key auth mode', async () => {
            mockedAxios.post.mockResolvedValueOnce({
                status: 200,
                data: {
                    testUrl: 'https://testprovider.com/test/abc',
                    sessionToken: 'sess_abc',
                },
            });

            await launchAssessmentWithProvider({
                ...mockLaunchRequest,
                provider: { ...mockProvider, authMode: 'api_key' },
            });

            expect(mockedAxios.post).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Object),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'X-API-Key': 'test-secret-key',
                    }),
                })
            );
        });

        it('should add Bearer token for hmac auth mode', async () => {
            mockedAxios.post.mockResolvedValueOnce({
                status: 200,
                data: {
                    testUrl: 'https://testprovider.com/test/abc',
                    sessionToken: 'sess_abc',
                },
            });

            await launchAssessmentWithProvider({
                ...mockLaunchRequest,
                provider: { ...mockProvider, authMode: 'hmac' },
            });

            expect(mockedAxios.post).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Object),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: 'Bearer test-secret-key',
                    }),
                })
            );
        });
    });
});
