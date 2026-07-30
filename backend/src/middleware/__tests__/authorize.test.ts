import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { authorize } from '../authorize';

type MockResponse = Partial<Response> & {
    statusCode: number;
    jsonData: unknown;
};

function createMockResponse(): MockResponse {
    const res: MockResponse = {
        statusCode: 200,
        jsonData: null
    };

    res.status = vi.fn((code: number) => {
        res.statusCode = code;
        return res as Response;
    });

    res.json = vi.fn((data: unknown) => {
        res.jsonData = data;
        return res as Response;
    });

    return res;
}

function createMockNext(): NextFunction {
    return vi.fn();
}

describe('authorize middleware', () => {
    it('returns 401 when req.user is missing', () => {
        const middleware = authorize(['admin']);
        const req = {} as Request;
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res as Response, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required'
            }
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 when role is not allowed', () => {
        const middleware = authorize(['admin', 'hr_manager']);
        const req = {
            user: {
                id: 'u-1',
                email: 'reviewer@example.com',
                role: 'hr_reviewer'
            }
        } as Request;
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res as Response, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: 'FORBIDDEN',
                message: 'You do not have permission to access this resource'
            }
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('allows compliance role when explicitly granted', () => {
        const middleware = authorize(['admin', 'compliance']);
        const req = {
            user: {
                id: 'u-2',
                email: 'compliance@example.com',
                role: 'compliance'
            }
        } as Request;
        const res = createMockResponse();
        const next = createMockNext();

        middleware(req, res as Response, next);

        expect(next).toHaveBeenCalledOnce();
        expect(res.status).not.toHaveBeenCalled();
    });
});
