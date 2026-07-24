import { Request, Response, NextFunction } from 'express';
import { JwtService } from '../services/jwtService';
import logger from '../utils/logger';

// Extend Express Request type to include user
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                email: string;
                role: string;
            };
        }
    }
}

const jwtService = new JwtService();

/**
 * Authentication middleware that verifies JWT token from cookie.
 * Sets req.user if valid, returns 401 if invalid or missing.
 */
export async function authenticate(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        // Get token from cookie
        const token = req.cookies?.auth_token;

        if (!token) {
            res.status(401).json({
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Authentication required',
                },
            });
            return;
        }

        // Verify and decode token
        const payload = jwtService.verifyToken(token);

        if (!payload || !payload.sub || !payload.email) {
            res.status(401).json({
                error: {
                    code: 'INVALID_TOKEN',
                    message: 'Invalid authentication token',
                },
            });
            return;
        }

        // Set user on request
        req.user = {
            id: payload.sub,
            email: payload.email,
            role: payload.role || 'candidate',
        };

        next();
    } catch (error) {
        logger.error({ error }, 'Authentication middleware error');
        res.status(401).json({
            error: {
                code: 'AUTHENTICATION_FAILED',
                message: 'Authentication failed',
            },
        });
    }
}
