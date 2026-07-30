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
import { env } from '../config/env';
import prisma from '../db/prisma';
import { JwtService } from './jwtService';
import { auditService } from './auditService';
import logger from '../utils/logger';
import type { UserRole } from '@prisma/client';

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
        public code: 'INVALID_CODE' | 'PROFILE_FETCH_FAILED' | 'EMAIL_REQUIRED' | 'ACCOUNT_CREATION_FAILED'
    ) {
        super(message);
        this.name = 'OAuthError';
    }
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
    const email = profile.email.toLowerCase();

    // Check if account already exists
    let candidate = await prisma.candidate.findUnique({
        where: { email },
        include: { credentials: true },
    });

    const isNewAccount = !candidate;

    if (!candidate) {
        // Create new candidate account with active status (OAuth users are pre-verified)
        try {
            candidate = await prisma.candidate.create({
                data: {
                    email,
                    fullName: profile.name || email.split('@')[0],
                    phoneNumber: null,
                    status: 'active', // OAuth users bypass OTP verification
                    emailVerifiedAt: new Date(),
                    credentials: {
                        create: {
                            passwordHash: null, // No password for OAuth-only accounts
                        },
                    },
                },
                include: { credentials: true },
            });

            logger.info({ email, provider: profile.provider }, 'New OAuth account created');

            // Audit: account created via OAuth
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
        // Existing account - link OAuth provider if not already linked
        logger.info({ email, provider: profile.provider, isNewAccount: false }, 'OAuth login for existing account');

        // Update last successful login
        await prisma.candidate.update({
            where: { id: candidate.id },
            data: {
                lastSuccessfulLoginAt: new Date(),
                failedLoginAttempts: 0, // Reset on successful OAuth login
            },
        });

        // Audit: OAuth login
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
    const params = new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID!,
        redirect_uri: env.GITHUB_REDIRECT_URI!,
        scope: 'user:email',
        ...(state && { state }),
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
}
