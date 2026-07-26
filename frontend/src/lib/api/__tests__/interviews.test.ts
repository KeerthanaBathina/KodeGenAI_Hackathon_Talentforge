import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPanelistAvailability, scheduleInterview } from '../interviews';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('interviews api client', () => {
    beforeEach(() => {
        fetchMock.mockReset();
    });

    it('fetches panelist availability with query parameters', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => [],
        } as Response);

        await getPanelistAvailability('app-1', ['panel-1']);

        expect(fetchMock).toHaveBeenCalledWith(
            '/api/interviews/availability?applicationId=app-1&panelMemberIds=panel-1',
            expect.objectContaining({ credentials: 'include' })
        );
    });

    it('throws conflicts from schedule interview failures', async () => {
        fetchMock.mockResolvedValue({
            ok: false,
            status: 422,
            json: async () => ({
                error: 'Conflict detected',
                conflicts: [{ panelMemberId: 'panel-1' }],
            }),
        } as Response);

        await expect(
            scheduleInterview({
                applicationId: 'app-1',
                type: 'technical',
                startAt: '2026-07-25T04:30:00.000Z',
                endAt: '2026-07-25T05:00:00.000Z',
                timezone: 'UTC',
                panelMemberIds: ['panel-1'],
            })
        ).rejects.toMatchObject({
            message: 'Conflict detected',
            conflicts: [{ panelMemberId: 'panel-1' }],
        });
    });
});
