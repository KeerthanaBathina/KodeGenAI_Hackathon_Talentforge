/**
 * OAuth Service
 * 
 * Handles OAuth 2.0 authentication flows for Google and GitHub providers.
 * Exchanges authorization codes for access tokens, retrieves user profiles,
 * and creates or links accounts.
 * 
 * @module services/oauthService
 */

import axios from 'axios';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { CandidateStatus, type UserRole } from '@prisma/client';
import { env } from '../config/env';
import prisma from '../db/prisma';
import { auditService } from './auditService';
import logger from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface OAuthProfile {
    provider: 'google' | 'github';
    providerId: string;
    email: string;
    emailVerified: boolean;
    name?: string;
    picture?: string;
}

export interface OAuthResult {
    success: boolean;
    user: {
        id: string;
        email: string;
        role: UserRole;
        candidateId?: string;
    };
    isNewAccount: boolean;
}

export class OAuthError extends Error {
    constructor(
        message: string,
        public code:
            | 'INVALID_CODE'
            | 'PROFILE_FETCH_FAILED'
            | 'EMAIL_REQUIRED'
            | 'ACCOUNT_CREATION_FAILED'
            | 'PROVIDER_NOT_CONFIGURED'
            | 'ACCOUNT_UNAVAILABLE'
    ) {
        super(message);
        this.name = 'OAuthError';
    }
}

type OAuthProvider = 'google' | 'github';

const OAUTH_PLACEHOLDER_PASSWORD_ROUNDS = 10;

function ensureProviderConfigured(provider: OAuthProvider): void {
    if (provider === 'google') {
        if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
            throw new OAuthError('Google OAuth is not configured', 'PROVIDER_NOT_CONFIGURED');
        }
        return;
    }

    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.GITHUB_REDIRECT_URI) {
        throw new OAuthError('GitHub OAuth is not configured', 'PROVIDER_NOT_CONFIGURED');
    }
}

function generateCandidatePublicId(): string {
    const token = crypto.randomBytes(6).toString('hex').toUpperCase();
    return `CAND-${token}`;
}

function parseName(name: string | undefined, fallbackEmail: string): {
    fullName: string;
    firstName?: string;
    lastName?: string;
} {
    const normalized = name?.trim();
    if (!normalized) {
        const emailPrefix = fallbackEmail.split('@')[0] ?? 'Candidate';
        return {
            fullName: emailPrefix,
            firstName: emailPrefix,
        };
    }

    const parts = normalized.split(/\s+/).filter(Boolean);
    const firstName = parts[0];
    const lastName = parts.length > 1 ? parts.slice(1).join(' ') : undefined;

    return {
        fullName: normalized,
        firstName,
        lastName,
    };
}

async function generatePlaceholderPasswordHash(provider: OAuthProvider, providerId: string): Promise<string> {
    const randomSuffix = crypto.randomBytes(12).toString('hex');
    const pseudoPassword = `oauth:${provider}:${providerId}:${randomSuffix}`;
    return bcrypt.hash(pseudoPassword, OAUTH_PLACEHOLDER_PASSWORD_ROUNDS);
}

// ============================================================================
// Google OAuth
// ============================================================================

/**
 * Exchange Google authorization code for access token and user profile
 */
export async function exchangeGoogleCode(
    code: string,
    ipAddress?: string,
    userAgent?: string
): Promise<OAuthResult> {
    ensureProviderConfigured('google');

    try {
        // Exchange authorization code for access token
        const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
            code,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: env.GOOGLE_REDIRECT_URI,
            grant_type: 'authorization_code',
        });

        const { access_token } = tokenResponse.data;

        // Fetch user profile from Google
        const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${access_token}` },
        });

        const profile: OAuthProfile = {
            provider: 'google',
            providerId: profileResponse.data.id,
            email: profileResponse.data.email,
            emailVerified: profileResponse.data.verified_email ?? false,
            name: profileResponse.data.name,
            picture: profileResponse.data.picture,
        };

        if (!profile.email) {
            throw new OAuthError('Email is required for account creation', 'EMAIL_REQUIRED');
        }

        return await findOrCreateOAuthAccount(profile, ipAddress, userAgent);
    } catch (error) {
        if (error instanceof OAuthError) {
            throw error;
        }

        if (axios.isAxiosError(error)) {
            logger.error({ error: error.response?.data }, 'Google OAuth code exchange failed');
            throw new OAuthError('Invalid authorization code', 'INVALID_CODE');
        }

        logger.error({ error }, 'Google OAuth failed');
        throw new OAuthError('Failed to retrieve user profile', 'PROFILE_FETCH_FAILED');
    }
}

// ============================================================================
// GitHub OAuth
// ============================================================================

/**
 * Exchange GitHub authorization code for access token and user profile
 */
export async function exchangeGitHubCode(
    code: string,
    ipAddress?: string,
    userAgent?: string
): Promise<OAuthResult> {
    ensureProviderConfigured('github');

    try {
        // Exchange authorization code for access token
        const tokenResponse = await axios.post(
            'https://github.com/login/oauth/access_token',
            {
                client_id: env.GITHUB_CLIENT_ID,
                client_secret: env.GITHUB_CLIENT_SECRET,
                redirect_uri: env.GITHUB_REDIRECT_URI,
                code,
            },
            {
                headers: { Accept: 'application/json' },
            }
        );

        const { access_token } = tokenResponse.data;

        // Fetch user profile from GitHub
        const profileResponse = await axios.get('https://api.github.com/user', {
            headers: {
                Authorization: `Bearer ${access_token}`,
                Accept: 'application/vnd.github.v3+json',
            },
        });

        // GitHub requires separate call to get primary email
        const emailResponse = await axios.get('https://api.github.com/user/emails', {
            headers: {
                Authorization: `Bearer ${access_token}`,
                Accept: 'application/vnd.github.v3+json',
            },
        });

        const primaryEmail = emailResponse.data.find((e: any) => e.primary);

        const profile: OAuthProfile = {
            provider: 'github',
            providerId: profileResponse.data.id.toString(),
            email: primaryEmail?.email || profileResponse.data.email,
            emailVerified: primaryEmail?.verified ?? false,
            name: profileResponse.data.name || profileResponse.data.login,
            picture: profileResponse.data.avatar_url,
        };

        if (!profile.email) {
            throw new OAuthError('Email is required for account creation', 'EMAIL_REQUIRED');
        }

        return await findOrCreateOAuthAccount(profile, ipAddress, userAgent);
    } catch (error) {
        if (error instanceof OAuthError) {
            throw error;
        }

        if (axios.isAxiosError(error)) {
            logger.error({ error: error.response?.data }, 'GitHub OAuth code exchange failed');
            throw new OAuthError('Invalid authorization code', 'INVALID_CODE');
        }

        logger.error({ error }, 'GitHub OAuth failed');
        throw new OAuthError('Failed to retrieve user profile', 'PROFILE_FETCH_FAILED');
    }
}

// ============================================================================
// Account Management
// ============================================================================

/**
 * Find existing account by email or create new one with OAuth profile
 */
async function findOrCreateOAuthAccount(
    profile: OAuthProfile,
    ipAddress?: string,
    userAgent?: string
): Promise<OAuthResult> {
    const email = profile.email.trim().toLowerCase();
    const displayName = parseName(profile.name, email);

    let candidate = await prisma.candidate.findUnique({
        where: { email },
        select: {
            id: true,
            email: true,
            status: true,
            candidatePublicId: true,
            firstName: true,
            lastName: true,
            credential: {
                select: {
                    candidateId: true,
                },
            },
            profile: {
                select: {
                    id: true,
                },
            },
        },
    });

    const isNewAccount = !candidate;

    if (!candidate) {
        try {
            const passwordHash = await generatePlaceholderPasswordHash(profile.provider, profile.providerId);

            candidate = await prisma.$transaction(async (tx) => {
                const created = await tx.candidate.create({
                    data: {
                        email,
                        status: CandidateStatus.active,
                        candidatePublicId: generateCandidatePublicId(),
                        firstName: displayName.firstName,
                        lastName: displayName.lastName,
                        lastSuccessfulLoginAt: new Date(),
                        failedLoginAttempts: 0,
                        lockedUntil: null,
                    },
                    select: {
                        id: true,
                        email: true,
                        status: true,
                        candidatePublicId: true,
                        firstName: true,
                        lastName: true,
                    },
                });

                await tx.candidateCredential.create({
                    data: {
                        candidateId: created.id,
                        passwordHash,
                    },
                });

                await tx.profile.create({
                    data: {
                        candidateId: created.id,
                        fullName: displayName.fullName,
                        experienceYears: 0,
                        skills: [],
                        education: [],
                        workHistory: [],
                        profileCompletionPercentage: 0,
                        lastCompletedSection: null,
                        rawParseJson: {},
                    },
                });

                return {
                    ...created,
                    credential: { candidateId: created.id },
                    profile: { id: created.id },
                };
            });

            logger.info({ email, provider: profile.provider }, 'New OAuth account created');

            await auditService.logEvent({
                eventType: 'oauth_account_created',
                actorId: candidate.id,
                actorRole: 'candidate',
                resourceType: 'candidate',
                resourceId: candidate.id,
                metadata: {
                    provider: profile.provider,
                    emailVerified: profile.emailVerified,
                },
                ipAddress,
                userAgent,
            });
        } catch (error) {
            logger.error({ error, email, provider: profile.provider }, 'OAuth account creation failed');
            throw new OAuthError('Failed to create account', 'ACCOUNT_CREATION_FAILED');
        }
    } else {
        if (candidate.status === CandidateStatus.anonymized) {
            throw new OAuthError('Account is unavailable', 'ACCOUNT_UNAVAILABLE');
        }

        const needsCredential = !candidate.credential;
        const needsProfile = !candidate.profile;

        try {
            const passwordHash = needsCredential
                ? await generatePlaceholderPasswordHash(profile.provider, profile.providerId)
                : null;

            candidate = await prisma.$transaction(async (tx) => {
                const updated = await tx.candidate.update({
                    where: { id: candidate!.id },
                    data: {
                        status: CandidateStatus.active,
                        candidatePublicId: candidate!.candidatePublicId ?? generateCandidatePublicId(),
                        firstName: candidate!.firstName ?? displayName.firstName,
                        lastName: candidate!.lastName ?? displayName.lastName,
                        failedLoginAttempts: 0,
                        lockedUntil: null,
                        lastSuccessfulLoginAt: new Date(),
                    },
                    select: {
                        id: true,
                        email: true,
                        status: true,
                        candidatePublicId: true,
                        firstName: true,
                        lastName: true,
                    },
                });

                if (needsCredential && passwordHash) {
                    await tx.candidateCredential.create({
                        data: {
                            candidateId: updated.id,
                            passwordHash,
                        },
                    });
                }

                if (needsProfile) {
                    await tx.profile.create({
                        data: {
                            candidateId: updated.id,
                            fullName: displayName.fullName,
                            experienceYears: 0,
                            skills: [],
                            education: [],
                            workHistory: [],
                            profileCompletionPercentage: 0,
                            lastCompletedSection: null,
                            rawParseJson: {},
                        },
                    });
                }

                return {
                    ...updated,
                    credential: needsCredential ? { candidateId: updated.id } : candidate!.credential,
                    profile: needsProfile ? { id: updated.id } : candidate!.profile,
                };
            });
        } catch (error) {
            logger.error({ error, email, provider: profile.provider }, 'OAuth account update failed');
            throw new OAuthError('Failed to update account', 'ACCOUNT_CREATION_FAILED');
        }

        logger.info({ email, provider: profile.provider, isNewAccount: false }, 'OAuth login for existing account');

        await auditService.logEvent({
            eventType: 'oauth_login_success',
            actorId: candidate.id,
            actorRole: 'candidate',
            resourceType: 'candidate',
            resourceId: candidate.id,
            metadata: {
                provider: profile.provider,
                emailVerified: profile.emailVerified,
            },
            ipAddress,
            userAgent,
        });
    }

    return {
        success: true,
        user: {
            id: candidate.id,
            email: candidate.email,
            role: 'candidate' as UserRole,
            candidateId: candidate.id,
        },
        isNewAccount,
    };
}

// ============================================================================
// OAuth URL Generators
// ============================================================================

/**
 * Generate Google OAuth authorization URL
 */
export function getGoogleAuthUrl(state?: string): string {
    ensureProviderConfigured('google');

    const params = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID!,
        redirect_uri: env.GOOGLE_REDIRECT_URI!,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'online',
        ...(state && { state }),
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Generate GitHub OAuth authorization URL
 */
export function getGitHubAuthUrl(state?: string): string {
    ensureProviderConfigured('github');

    const params = new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID!,
        redirect_uri: env.GITHUB_REDIRECT_URI!,
        scope: 'user:email',
        ...(state && { state }),
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
}
