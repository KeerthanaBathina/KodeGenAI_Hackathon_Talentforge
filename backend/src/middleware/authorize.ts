import { Request, Response, NextFunction } from 'express';

/**
 * Authorization middleware that enforces role-based access control.
 */
export function authorize(allowedRoles: string[]) {
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

        if (!allowedRoles.includes(req.user.role)) {
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