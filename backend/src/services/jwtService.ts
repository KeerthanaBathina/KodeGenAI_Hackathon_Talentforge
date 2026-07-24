import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface JwtPayload {
    sub: string; // User ID
    role: string;
    candidateId?: string;
}

export interface JwtCookieOptions {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'strict' | 'lax' | 'none';
    maxAge: number; // milliseconds
    path: string;
}

const EXPIRY_24H = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export class JwtService {
    private static privateKey: string;
    private static publicKey: string;
    private static algorithm: 'RS256' | 'HS256' = 'HS256'; // Default to HS256 for development

    static initialize() {
        // Check if RS256 keys are configured
        if (env.JWT_PRIVATE_KEY && env.JWT_PUBLIC_KEY) {
            // Convert pipe-separated format back to newlines
            this.privateKey = env.JWT_PRIVATE_KEY.replace(/\|/g, '\n');
            this.publicKey = env.JWT_PUBLIC_KEY.replace(/\|/g, '\n');
            this.algorithm = 'RS256';
        } else if (env.JWT_SECRET) {
            // Fallback to HS256 with shared secret
            this.privateKey = env.JWT_SECRET;
            this.publicKey = env.JWT_SECRET;
            this.algorithm = 'HS256';
        } else {
            throw new Error('JWT configuration missing: Either JWT_PRIVATE_KEY/JWT_PUBLIC_KEY or JWT_SECRET must be set');
        }
    }

    /**
     * Generate JWT with RS256 or HS256 signing
     */
    static sign(payload: JwtPayload): string {
        if (!this.privateKey) this.initialize();

        return jwt.sign(payload, this.privateKey, {
            algorithm: this.algorithm,
            expiresIn: env.JWT_EXPIRES_IN || '24h',
        });
    }

    /**
     * Verify and decode JWT
     */
    static verify(token: string): JwtPayload {
        if (!this.publicKey) this.initialize();

        try {
            const decoded = jwt.verify(token, this.publicKey, {
                algorithms: [this.algorithm],
            }) as JwtPayload & { iat: number; exp: number };

            return {
                sub: decoded.sub,
                role: decoded.role,
                candidateId: decoded.candidateId,
            };
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                throw new Error('Token expired');
            }
            if (error instanceof jwt.JsonWebTokenError) {
                throw new Error('Invalid token');
            }
            throw error;
        }
    }

    /**
     * Get cookie configuration for httpOnly JWT storage
     */
    static getCookieOptions(): JwtCookieOptions {
        return {
            httpOnly: true,
            secure: env.NODE_ENV === 'production', // HTTPS only in production
            sameSite: 'lax',
            maxAge: EXPIRY_24H,
            path: '/',
        };
    }

    /**
     * Generate token and cookie options in one call
     */
    static createAuthCookie(payload: JwtPayload): { token: string; options: JwtCookieOptions } {
        return {
            token: this.sign(payload),
            options: this.getCookieOptions(),
        };
    }
}

// Initialize on module load
JwtService.initialize();
