import { describe, expect, it } from 'vitest';
import {
    AUDIT_PAYLOAD_REDACTED_VALUE,
    DEFAULT_AUDIT_PAGE_SIZE,
    MAX_AUDIT_PAGE_SIZE,
    buildAuditLogFindManyArgs,
    buildAuditLogWhere,
    parseAuditLogQueryFilters,
    sanitizeAuditPayloadForViewer,
    serializeAuditPayloadForCsv
} from '../auditLogQuerySchema';

describe('Audit Log Query Schema', () => {
    it('applies default pagination values', () => {
        const filters = parseAuditLogQueryFilters({});

        expect(filters.page).toBe(1);
        expect(filters.pageSize).toBe(DEFAULT_AUDIT_PAGE_SIZE);
    });

    it('normalizes actorEmail and eventTypes from query params', () => {
        const filters = parseAuditLogQueryFilters({
            actorEmail: ' Reviewer@Example.COM ',
            eventTypes: [' auth.login.success , auth.login.failure ', 'auth.login.success']
        });

        expect(filters.actorEmail).toBe('reviewer@example.com');
        expect(filters.eventTypes).toEqual(['auth.login.success', 'auth.login.failure']);
    });

    it('rejects pageSize above supported max', () => {
        expect(() => parseAuditLogQueryFilters({ pageSize: MAX_AUDIT_PAGE_SIZE + 1 })).toThrow();
    });

    it('rejects invalid date ranges', () => {
        expect(() =>
            parseAuditLogQueryFilters({
                from: '2026-07-31T10:00:00.000Z',
                to: '2026-07-30T10:00:00.000Z'
            })
        ).toThrow();
    });

    it('builds where clauses for actor, event, entity, and date filters', () => {
        const filters = parseAuditLogQueryFilters({
            actorEmail: 'auditor@example.com',
            eventTypes: 'auth.login.success,auth.logout',
            entityType: 'candidate',
            entityId: 'cand-123',
            from: '2026-07-01T00:00:00.000Z',
            to: '2026-07-31T23:59:59.999Z'
        });

        const where = buildAuditLogWhere(filters);

        expect(where).toMatchObject({
            actor: {
                is: {
                    email: {
                        contains: 'auditor@example.com',
                        mode: 'insensitive'
                    }
                }
            },
            eventType: {
                in: ['auth.login.success', 'auth.logout']
            },
            entityType: 'candidate',
            entityId: 'cand-123'
        });

        expect(where.createdAt).toMatchObject({
            gte: new Date('2026-07-01T00:00:00.000Z'),
            lte: new Date('2026-07-31T23:59:59.999Z')
        });
    });

    it('builds deterministic findMany args with pagination', () => {
        const filters = parseAuditLogQueryFilters({
            page: '3',
            pageSize: '25'
        });

        const args = buildAuditLogFindManyArgs(filters);

        expect(args.skip).toBe(50);
        expect(args.take).toBe(25);
        expect(args.orderBy).toEqual([
            { createdAt: 'desc' },
            { id: 'desc' }
        ]);
    });

    it('redacts sensitive payload keys recursively for viewer responses', () => {
        const payload = {
            password: 'plaintext',
            nested: {
                apiKey: 'key-123',
                sessionToken: 'token-123',
                detail: 'safe'
            },
            items: [
                {
                    authorization: 'Bearer x',
                    action: 'viewed'
                }
            ]
        };

        const sanitized = sanitizeAuditPayloadForViewer(payload);

        expect(sanitized).toEqual({
            items: [
                {
                    action: 'viewed',
                    authorization: AUDIT_PAYLOAD_REDACTED_VALUE
                }
            ],
            nested: {
                apiKey: AUDIT_PAYLOAD_REDACTED_VALUE,
                detail: 'safe',
                sessionToken: AUDIT_PAYLOAD_REDACTED_VALUE
            },
            password: AUDIT_PAYLOAD_REDACTED_VALUE
        });
    });

    it('serializes sanitized payloads for CSV export deterministically', () => {
        const csvPayload = serializeAuditPayloadForCsv({
            zeta: 1,
            alpha: {
                token: 'secret-token',
                scope: 'audit'
            }
        });

        expect(csvPayload).toBe(
            '{"alpha":{"scope":"audit","token":"[REDACTED]"},"zeta":1}'
        );
        expect(serializeAuditPayloadForCsv(null)).toBe('');
        expect(serializeAuditPayloadForCsv('ok')).toBe('ok');
    });
});
