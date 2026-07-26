import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InterviewPlannerPage from '../page';

const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

vi.mock('@/components/Toast', () => ({
    default: ({ message, type }: { message: string; type: string }) => (
        <div data-testid={`toast-${type}`}>{message}</div>
    ),
}));

describe('InterviewPlannerPage', () => {
    beforeEach(() => {
        fetchMock.mockReset();
        window.history.replaceState({}, '', '/hr/interviews/app-1');
    });

    it('renders timezone formatted availability and allows selecting an open slot', async () => {
        fetchMock.mockImplementation((input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes('/api/interviews/availability')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ([
                        {
                            panelMemberId: 'panel-1',
                            panelMemberName: 'Arun Menon',
                            timezone: 'Asia/Kolkata',
                            slots: [
                                {
                                    startAt: '2026-07-25T04:30:00.000Z',
                                    endAt: '2026-07-25T05:00:00.000Z',
                                    available: true,
                                    label: '10:00 AM IST',
                                },
                            ],
                        },
                    ]),
                } as Response);
            }

            return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
        });

        render(<InterviewPlannerPage params={{ applicationId: 'app-1' }} />);

        await waitFor(() => {
            expect(screen.getByText('Interview Planner')).toBeInTheDocument();
        });

        expect(await screen.findByText(/Browser timezone:/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Select slot 10:00 AM IST/i })).toBeEnabled();
    });

    it('shows a conflict warning modal and disables confirm when scheduling fails with conflict', async () => {
        fetchMock.mockImplementation((input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes('/api/interviews/availability')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ([
                        {
                            panelMemberId: 'panel-1',
                            panelMemberName: 'Arun Menon',
                            timezone: 'UTC',
                            slots: [
                                {
                                    startAt: '2026-07-25T04:30:00.000Z',
                                    endAt: '2026-07-25T05:00:00.000Z',
                                    available: true,
                                    label: '04:30 UTC',
                                },
                            ],
                        },
                    ]),
                } as Response);
            }

            if (url.endsWith('/api/interviews')) {
                return Promise.resolve({
                    ok: false,
                    status: 422,
                    json: async () => ({
                        error: 'Conflict detected',
                        conflicts: [
                            {
                                panelMemberId: 'panel-1',
                                panelMemberName: 'Arun Menon',
                                interviewStageId: 'stage-2',
                                interviewType: 'hr',
                                requisitionTitle: 'System Design Interview',
                                scheduledAt: '2026-07-25T04:40:00.000Z',
                                timezone: 'UTC',
                            },
                        ],
                    }),
                } as Response);
            }

            return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
        });

        render(<InterviewPlannerPage params={{ applicationId: 'app-1' }} />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Select slot 04:30 UTC/i })).toBeEnabled();
        });

        fireEvent.click(screen.getByRole('button', { name: /Select slot 04:30 UTC/i }));
        fireEvent.click(screen.getByRole('button', { name: /Confirm Interview/i }));

        expect(await screen.findByRole('dialog', { name: /Panelist conflict warning/i })).toBeInTheDocument();
        expect(screen.getByTestId('toast-info')).toHaveTextContent('Panelist conflict detected. Select a different slot or panelist.');
        expect(screen.getByRole('button', { name: /Confirm Interview/i })).toBeDisabled();
        expect(screen.getByText(/Arun Menon is unavailable: System Design Interview at/i)).toBeInTheDocument();
    });

    it('greys out booked slots and keeps alternative slots selectable', async () => {
        fetchMock.mockImplementation((input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes('/api/interviews/availability')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ([
                        {
                            panelMemberId: 'panel-1',
                            panelMemberName: 'Arun Menon',
                            timezone: 'UTC',
                            slots: [
                                {
                                    startAt: '2026-07-25T04:30:00.000Z',
                                    endAt: '2026-07-25T05:00:00.000Z',
                                    available: false,
                                    label: '04:30 UTC',
                                },
                                {
                                    startAt: '2026-07-25T05:30:00.000Z',
                                    endAt: '2026-07-25T06:00:00.000Z',
                                    available: true,
                                    label: '05:30 UTC',
                                },
                            ],
                        },
                    ]),
                } as Response);
            }

            return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
        });

        render(<InterviewPlannerPage params={{ applicationId: 'app-1' }} />);

        const bookedSlot = await screen.findByRole('button', { name: /Booked slot 04:30 UTC/i });
        const openSlot = screen.getByRole('button', { name: /Select slot 05:30 UTC/i });

        expect(bookedSlot).toBeDisabled();
        expect(openSlot).toBeEnabled();
    });
});
