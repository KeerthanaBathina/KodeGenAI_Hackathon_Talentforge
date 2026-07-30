/**
 * Admin User Management Routes
 * 
 * REST API endpoints for managing internal staff users (admin, recruiter, hr_reviewer, etc.)
 * All routes require admin authentication.
 * 
 * @module routes/admin/users
 */

import express, { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import {
    createUser,
    getUserById,
    getAllUsers,
    updateUserRole,
    deactivateUser,
    reactivateUser,
    UserManagementError,
    type CreateUserInput,
    type UserFilters
} from '../../services/userManagementService';
import logger from '../../utils/logger';

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(authorize(['admin']));

// ============================================================================
// POST /api/admin/users - Create User
// ============================================================================

router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { email, fullName, role, timezone } = req.body;

        // Validate required fields
        if (!email || !fullName || !role) {
            res.status(400).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Missing required fields: email, fullName, and role are required'
                }
            });
            return;
        }

        const input: CreateUserInput = {
            email,
            fullName,
            role: role as UserRole,
            timezone,
            actorId: req.user!.id  // Pass the authenticated admin's ID
        };

        const result = await createUser(input);

        logger.info(
            { userId: result.user.id, email: result.user.email, actorId: req.user!.id },
            'User created via API'
        );

        res.status(201).json({
            user: result.user,
            temporaryPassword: result.temporaryPassword // Only returned on creation
        });
    } catch (error) {
        if (error instanceof UserManagementError) {
            if (error.code === 'DUPLICATE_EMAIL') {
                res.status(409).json({
                    error: {
                        code: error.code,
                        message: error.message
                    }
                });
                return;
            }
            
            if (error.code === 'INVALID_ROLE') {
                res.status(400).json({
                    error: {
                        code: error.code,
                        message: error.message
                    }
                });
                return;
            }
        }

        next(error);
    }
});

// ============================================================================
// GET /api/admin/users - List Users
// ============================================================================

router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { role, active, search } = req.query;

        const filters: UserFilters = {};

        if (role) {
            filters.role = role as UserRole;
        }

        if (active !== undefined) {
            filters.active = active === 'true';
        }

        if (search && typeof search === 'string') {
            filters.search = search;
        }

        const users = await getAllUsers(filters);

        res.status(200).json({ users });
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// GET /api/admin/users/:id - Get User by ID
// ============================================================================

router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;

        const user = await getUserById(id);

        if (!user) {
            res.status(404).json({
                error: {
                    code: 'USER_NOT_FOUND',
                    message: 'User not found'
                }
            });
            return;
        }

        res.status(200).json({ user });
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// PATCH /api/admin/users/:id/role - Update User Role
// ============================================================================

router.patch('/:id/role', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        const actorId = req.user!.id;

        if (!role) {
            res.status(400).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Role is required'
                }
            });
            return;
        }

        const updatedUser = await updateUserRole(id, role as UserRole, actorId);

        logger.info(
            { userId: id, newRole: role, actorId },
            'User role updated via API'
        );

        res.status(200).json({ user: updatedUser });
    } catch (error) {
        if (error instanceof UserManagementError) {
            if (error.code === 'USER_NOT_FOUND') {
                res.status(404).json({
                    error: {
                        code: error.code,
                        message: error.message
                    }
                });
                return;
            }

            if (error.code === 'SELF_MODIFICATION_FORBIDDEN') {
                res.status(403).json({
                    error: {
                        code: error.code,
                        message: error.message
                    }
                });
                return;
            }

            if (error.code === 'INVALID_ROLE') {
                res.status(400).json({
                    error: {
                        code: error.code,
                        message: error.message
                    }
                });
                return;
            }
        }

        next(error);
    }
});

// ============================================================================
// PATCH /api/admin/users/:id/deactivate - Deactivate User
// ============================================================================

router.patch('/:id/deactivate', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const actorId = req.user!.id;

        const updatedUser = await deactivateUser(id, actorId);

        logger.info(
            { userId: id, actorId },
            'User deactivated via API'
        );

        res.status(200).json({ user: updatedUser });
    } catch (error) {
        if (error instanceof UserManagementError) {
            if (error.code === 'USER_NOT_FOUND') {
                res.status(404).json({
                    error: {
                        code: error.code,
                        message: error.message
                    }
                });
                return;
            }

            if (error.code === 'SELF_MODIFICATION_FORBIDDEN') {
                res.status(403).json({
                    error: {
                        code: error.code,
                        message: 'Administrators cannot deactivate their own account'
                    }
                });
                return;
            }
        }

        next(error);
    }
});

// ============================================================================
// PATCH /api/admin/users/:id/reactivate - Reactivate User
// ============================================================================

router.patch('/:id/reactivate', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { id } = req.params;
        const actorId = req.user!.id;

        const updatedUser = await reactivateUser(id, actorId);

        logger.info(
            { userId: id, actorId },
            'User reactivated via API'
        );

        res.status(200).json({ user: updatedUser });
    } catch (error) {
        if (error instanceof UserManagementError) {
            if (error.code === 'USER_NOT_FOUND') {
                res.status(404).json({
                    error: {
                        code: error.code,
                        message: error.message
                    }
                });
                return;
            }
        }

        next(error);
    }
});

export default router;
