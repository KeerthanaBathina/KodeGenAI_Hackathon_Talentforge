import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMocks = vi.hoisted(() => ({
    userFindMany: vi.fn(),
    interviewStageFindMany: vi.fn(),
}));

vi.mock('../../db/prisma', () => ({
    prisma: {
        user: {
            findMany: prismaMocks.userFindMany,
        },
        interviewStage: {
            findMany: prismaMocks.interviewStageFindMany,
        },
    },
}));

import { getPanelistAvailability } from '../interviewSchedulingService';

describe('interview availability service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns available and booked slots for panelists', async () => {
        prismaMocks.userFindMany.mockResolvedValue([
            {
                id: 'panel-1',
                fullName: 'Arun Menon',
                timezone: 'UTC',
                panelAvailability: [
                    {
                        weekday: 2,
                        startHour: 9,
                        endHour: 11,
                        timezone: 'UTC',
                    },
                ],
            },
        ]);
        prismaMocks.interviewStageFindMany.mockResolvedValue([
            {
                scheduledAt: new Date('2026-07-26T09:00:00.000Z'),
                endAt: new Date('2026-07-26T09:45:00.000Z'),
                timezone: 'UTC',
                panelMembers: ['panel-1'],
            },
        ]);

        const result = await getPanelistAvailability([]);

        expect(result).toHaveLength(1);
        expect(result[0]?.panelMemberName).toBe('Arun Menon');
        expect(result[0]?.slots.some((slot) => slot.available === false)).toBe(true);
        expect(result[0]?.slots.some((slot) => slot.available === true)).toBe(true);
    });
});
