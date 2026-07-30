import { Request, Response, NextFunction } from 'express';

/**
 * Authorization middleware that enforces role-based access control.
 */
export const AUDIT_LOG_READER_ROLES = ['admin', 'compliance'] as const;

export function authorize(allowedRoles: readonly string[]) {
    const allowedRoleSet = new Set(allowedRoles);

    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Authentication required',
                },
            });
            return;
        }

        if (!allowedRoleSet.has(req.user.role)) {
            res.status(403).json({
                error: {
                    code: 'FORBIDDEN',
                    message: 'You do not have permission to access this resource',
                },
            });
            return;
        }

        next();
    };
}

/**
 * Alias for authorize function for better semantic clarity
 */
export const requireRole = authorize;