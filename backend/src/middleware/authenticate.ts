import { Request, Response, NextFunction } from 'express';
import { JwtService } from '../services/jwtService';
import prisma from '../db/prisma';
import logger from '../utils/logger';

// Extend Express Request type to include user
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                email: string;
                role: string;
                fullName?: string;
                candidateId?: string;
            };
        }
    }
}

const jwtService = new JwtService();

/**
 * Authentication middleware that verifies JWT token from cookie.
 * Checks user active status from database on every request.
 * Sets req.user if valid, returns 401 if invalid, missing, or deactivated.
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

        // Determine if this is an internal user or candidate based on role
        const isInternalUser = ['admin', 'recruiter', 'hr_reviewer', 'hr_manager', 'tech_interviewer'].includes(payload.role);

        if (isInternalUser) {
            // Check internal user active status from database
            const user = await prisma.user.findUnique({
                where: { id: payload.sub },
                select: {
                    id: true,
                    email: true,
                    fullName: true,
                    role: true,
                    active: true
                }
            });

            if (!user) {
                logger.warn({ userId: payload.sub, email: payload.email }, 'JWT token references non-existent user');
                res.status(401).json({
                    error: {
                        code: 'UNAUTHORIZED',
                        message: 'Authentication required',
                    },
                });
                return;
            }

            // Check if user is deactivated
            if (!user.active) {
                logger.warn({ userId: user.id, email: user.email, role: user.role }, 'Deactivated user attempted to access protected resource');
                res.status(401).json({
                    error: {
                        code: 'ACCOUNT_DEACTIVATED',
                        message: 'Your account has been deactivated — contact your administrator',
                    },
                });
                return;
            }

            // Set user on request with current data from database
            req.user = {
                id: user.id,
                email: user.email,
                role: user.role, // Use role from database (handles role changes)
                fullName: user.fullName
            };
        } else {
            // Handle candidate authentication (existing logic)
            // Candidates don't have active status check, but we still validate existence
            const candidate = await prisma.candidate.findUnique({
                where: { id: payload.candidateId || payload.sub },
                select: {
                    id: true,
                    email: true,
                    status: true
                }
            });

            if (!candidate) {
                logger.warn({ candidateId: payload.candidateId, email: payload.email }, 'JWT token references non-existent candidate');
                res.status(401).json({
                    error: {
                        code: 'UNAUTHORIZED',
                        message: 'Authentication required',
                    },
                });
                return;
            }

            // Set user on request
            req.user = {
                id: payload.sub,
                email: payload.email,
                role: payload.role || 'candidate',
                candidateId: payload.candidateId
            };
        }

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
