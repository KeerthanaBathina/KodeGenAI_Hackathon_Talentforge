/**
 * Unit Tests for Authentication Middleware
 * 
 * Tests JWT verification and user active status checking
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate } from '../../authenticate';
import { JwtService } from '../../../services/jwtService';
import prisma from '../../../db/prisma';

describe('Authentication Middleware', () => {
    let activeUser: any;
    let deactivatedUser: any;
    let activeUserToken: string;
    let deactivatedUserToken: string;

    beforeAll(async () => {
        // Clean up test data
        await prisma.userCredential.deleteMany({
            where: {
                user: {
                    email: {
                        contains: '@auth-middleware-test.com'
                    }
                }
            }
        });
        await prisma.user.deleteMany({
            where: {
                email: {
                    contains: '@auth-middleware-test.com'
                }
            }
        });

        // Create active user
        activeUser = await prisma.user.create({
            data: {
                email: 'active-middleware@auth-middleware-test.com',
                fullName: 'Active Middleware User',
                role: UserRole.admin,
                timezone: 'UTC',
                active: true
            }
        });

        // Create deactivated user
        deactivatedUser = await prisma.user.create({
            data: {
                email: 'deactivated-middleware@auth-middleware-test.com',
                fullName: 'Deactivated Middleware User',
                role: UserRole.recruiter,
                timezone: 'UTC',
                active: false
            }
        });

        // Generate tokens
        activeUserToken = JwtService.sign({
            sub: activeUser.id,
            email: activeUser.email,
            role: activeUser.role
        });

        deactivatedUserToken = JwtService.sign({
            sub: deactivatedUser.id,
            email: deactivatedUser.email,
            role: deactivatedUser.role
        });
    });

    afterAll(async () => {
        // Clean up test data
        await prisma.userCredential.deleteMany({
            where: {
                user: {
                    email: {
                        contains: '@auth-middleware-test.com'
                    }
                }
            }
        });
        await prisma.user.deleteMany({
            where: {
                email: {
                    contains: '@auth-middleware-test.com'
                }
            }
        });
        await prisma.$disconnect();
    });

    const createMockRequest = (token?: string): Partial<Request> => ({
        cookies: token ? { auth_token: token } : {}
    });

    const createMockResponse = (): Partial<Response> => {
        const res: any = {
            statusCode: 200,
            jsonData: null
        };
        res.status = vi.fn((code: number) => {
            res.statusCode = code;
            return res;
        });
        res.json = vi.fn((data: any) => {
            res.jsonData = data;
            return res;
        });
        return res;
    };

    const createMockNext = (): NextFunction => vi.fn();

    describe('Token validation', () => {
        it('should reject request without token', async () => {
            const req = createMockRequest();
            const res = createMockResponse();
            const next = createMockNext();

            await authenticate(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Authentication required'
                }
            });
            expect(next).not.toHaveBeenCalled();
        });

        it('should reject request with invalid token', async () => {
            const req = createMockRequest('invalid-token');
            const res = createMockResponse();
            const next = createMockNext();

            await authenticate(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });

        it('should accept request with valid token for active user', async () => {
            const req = createMockRequest(activeUserToken);
            const res = createMockResponse();
            const next = createMockNext();

            await authenticate(req as Request, res as Response, next);

            expect(next).toHaveBeenCalled();
            expect(req.user).toBeDefined();
            expect(req.user!.id).toBe(activeUser.id);
            expect(req.user!.email).toBe(activeUser.email);
            expect(req.user!.role).toBe(activeUser.role);
        });
    });

    describe('Active status checking', () => {
        it('should reject deactivated user with specific error', async () => {
            const req = createMockRequest(deactivatedUserToken);
            const res = createMockResponse();
            const next = createMockNext();

            await authenticate(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                error: {
                    code: 'ACCOUNT_DEACTIVATED',
                    message: 'Your account has been deactivated — contact your administrator'
                }
            });
            expect(next).not.toHaveBeenCalled();
        });

        it('should check database on every request', async () => {
            // First request - user is active
            const req1 = createMockRequest(activeUserToken);
            const res1 = createMockResponse();
            const next1 = createMockNext();

            await authenticate(req1 as Request, res1 as Response, next1);

            expect(next1).toHaveBeenCalled();

            // Deactivate user
            await prisma.user.update({
                where: { id: activeUser.id },
                data: { active: false }
            });

            // Second request - same token but user now deactivated
            const req2 = createMockRequest(activeUserToken);
            const res2 = createMockResponse();
            const next2 = createMockNext();

            await authenticate(req2 as Request, res2 as Response, next2);

            expect(res2.status).toHaveBeenCalledWith(401);
            expect(res2.json).toHaveBeenCalledWith({
                error: {
                    code: 'ACCOUNT_DEACTIVATED',
                    message: 'Your account has been deactivated — contact your administrator'
                }
            });
            expect(next2).not.toHaveBeenCalled();

            // Reactivate user for other tests
            await prisma.user.update({
                where: { id: activeUser.id },
                data: { active: true }
            });
        });
    });

    describe('Role handling', () => {
        it('should use current role from database, not JWT', async () => {
            const req = createMockRequest(activeUserToken);
            const res = createMockResponse();
            const next = createMockNext();

            // Change role in database
            await prisma.user.update({
                where: { id: activeUser.id },
                data: { role: UserRole.hr_reviewer }
            });

            await authenticate(req as Request, res as Response, next);

            expect(next).toHaveBeenCalled();
            // Should get updated role from database
            expect(req.user!.role).toBe(UserRole.hr_reviewer);

            // Restore original role
            await prisma.user.update({
                where: { id: activeUser.id },
                data: { role: UserRole.admin }
            });
        });

        it('should handle all internal user roles', async () => {
            const roles: UserRole[] = [
                UserRole.admin,
                UserRole.recruiter,
                UserRole.hr_reviewer,
                UserRole.hr_manager,
                UserRole.tech_interviewer,
                'compliance' as UserRole
            ];

            for (const role of roles) {
                const user = await prisma.user.create({
                    data: {
                        email: `${role}@auth-middleware-test.com`,
                        fullName: `${role} User`,
                        role,
                        timezone: 'UTC',
                        active: true
                    }
                });

                const token = JwtService.sign({
                    sub: user.id,
                    email: user.email,
                    role: user.role
                });

                const req = createMockRequest(token);
                const res = createMockResponse();
                const next = createMockNext();

                await authenticate(req as Request, res as Response, next);

                expect(next).toHaveBeenCalled();
                expect(req.user!.role).toBe(role);
            }
        });
    });

    describe('User existence validation', () => {
        it('should reject token for non-existent user', async () => {
            const nonExistentToken = JwtService.sign({
                sub: '00000000-0000-0000-0000-000000000000',
                email: 'nonexistent@example.com',
                role: UserRole.admin
            });

            const req = createMockRequest(nonExistentToken);
            const res = createMockResponse();
            const next = createMockNext();

            await authenticate(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Authentication required'
                }
            });
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('Request object population', () => {
        it('should populate req.user with database values', async () => {
            const req = createMockRequest(activeUserToken);
            const res = createMockResponse();
            const next = createMockNext();

            await authenticate(req as Request, res as Response, next);

            expect(req.user).toBeDefined();
            expect(req.user!.id).toBe(activeUser.id);
            expect(req.user!.email).toBe(activeUser.email);
            expect(req.user!.role).toBe(activeUser.role);
            expect(req.user!.fullName).toBe(activeUser.fullName);
        });
    });
});
