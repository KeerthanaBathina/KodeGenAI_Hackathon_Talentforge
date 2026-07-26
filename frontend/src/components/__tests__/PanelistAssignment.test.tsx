import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PanelistAssignment from '../PanelistAssignment';
import * as interviewsApi from '@/lib/api/interviews';
import * as panelistRealtime from '@/lib/panelistRealtime';

vi.mock('@/lib/api/interviews');
vi.mock('@/lib/panelistRealtime');

describe('PanelistAssignment Component', () => {
    const mockInterviewId = 'interview-123';
    const mockScheduledStart = '2026-07-25T10:00:00Z';
    const mockScheduledEnd = '2026-07-25T11:00:00Z';

    const mockAvailablePanelists = [
        {
            panelMemberId: 'panelist-1',
            panelMemberName: 'John Doe',
            timezone: 'America/New_York',
            slots: [
                {
                    startAt: '2026-07-25T09:00:00Z',
                    endAt: '2026-07-25T12:00:00Z',
                    available: true,
                    label: 'Morning Slot',
                },
            ],
        },
        {
            panelMemberId: 'panelist-2',
            panelMemberName: 'Jane Smith',
            timezone: 'America/Los_Angeles',
            slots: [
                {
                    startAt: '2026-07-25T08:00:00Z',
                    endAt: '2026-07-25T09:30:00Z',
                    available: false,
                    label: 'Conflict Slot',
                },
            ],
        },
        {
            panelMemberId: 'panelist-3',
            panelMemberName: 'Alice Johnson',
            timezone: 'Europe/London',
            slots: [
                {
                    startAt: '2026-07-25T09:00:00Z',
                    endAt: '2026-07-25T12:00:00Z',
                    available: true,
                    label: 'Available Slot',
                },
            ],
        },
    ];

    beforeEach(() => {
        vi.mocked(interviewsApi.getPanelistAvailability).mockResolvedValue(mockAvailablePanelists);
        vi.mocked(panelistRealtime.subscribeToPanelistConfirmation).mockReturnValue(() => undefined);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Availability Indicators', () => {
        it('shows green tick for available panelists', async () => {
            render(
                <PanelistAssignment
                    interviewId={mockInterviewId}
                    scheduledStart={mockScheduledStart}
                    scheduledEnd={mockScheduledEnd}
                />
            );

            await waitFor(() => {
                expect(screen.getByText('John Doe')).toBeInTheDocument();
            });

            const johnRow = screen.getByText('John Doe').closest('button');
            expect(johnRow).toHaveTextContent('Available');

            // Check for green tick SVG presence
            const svg = johnRow?.querySelector('svg circle[fill="#d1fae5"]');
            expect(svg).toBeInTheDocument();
        });

        it('shows red X for unavailable panelists', async () => {
            render(
                <PanelistAssignment
                    interviewId={mockInterviewId}
                    scheduledStart={mockScheduledStart}
                    scheduledEnd={mockScheduledEnd}
                />
            );

            await waitFor(() => {
                expect(screen.getByText('Jane Smith')).toBeInTheDocument();
            });

            const janeRow = screen.getByText('Jane Smith').closest('button');
            expect(janeRow).toHaveTextContent('Conflict');

            // Check for red X SVG presence
            const svg = janeRow?.querySelector('svg circle[fill="#fee2e2"]');
            expect(svg).toBeInTheDocument();
        });
    });

    describe('Status Badge Rendering', () => {
        it('renders pending status badge correctly', async () => {
            const initialPanelists = [
                {
                    id: 'panelist-1',
                    name: 'John Doe',
                    email: 'john@example.com',
                    timezone: 'America/New_York',
                    status: 'pending' as const,
                    available: true,
                },
            ];

            render(
                <PanelistAssignment
                    interviewId={mockInterviewId}
                    scheduledStart={mockScheduledStart}
                    scheduledEnd={mockScheduledEnd}
                    initialPanelists={initialPanelists}
                />
            );

            await waitFor(() => {
                const badge = screen.getByText('pending');
                expect(badge).toBeInTheDocument();
                expect(badge).toHaveStyle({ background: '#fef3c7', color: '#92400e' });
            });
        });

        it('renders confirmed status badge correctly', async () => {
            const initialPanelists = [
                {
                    id: 'panelist-1',
                    name: 'John Doe',
                    email: 'john@example.com',
                    timezone: 'America/New_York',
                    status: 'confirmed' as const,
                    available: true,
                },
            ];

            render(
                <PanelistAssignment
                    interviewId={mockInterviewId}
                    scheduledStart={mockScheduledStart}
                    scheduledEnd={mockScheduledEnd}
                    initialPanelists={initialPanelists}
                />
            );

            await waitFor(() => {
                const badge = screen.getByText('confirmed');
                expect(badge).toBeInTheDocument();
                expect(badge).toHaveStyle({ background: '#d1fae5', color: '#065f46' });
            });
        });

        it('renders declined status badge correctly', async () => {
            const initialPanelists = [
                {
                    id: 'panelist-1',
                    name: 'John Doe',
                    email: 'john@example.com',
                    timezone: 'America/New_York',
                    status: 'declined' as const,
                    available: true,
                },
            ];

            render(
                <PanelistAssignment
                    interviewId={mockInterviewId}
                    scheduledStart={mockScheduledStart}
                    scheduledEnd={mockScheduledEnd}
                    initialPanelists={initialPanelists}
                />
            );

            await waitFor(() => {
                const badge = screen.getByText('declined');
                expect(badge).toBeInTheDocument();
                expect(badge).toHaveStyle({ background: '#fee2e2', color: '#991b1b' });
            });
        });
    });

    describe('WebSocket Updates', () => {
        it('subscribes to panelist confirmation events on mount', async () => {
            render(
                <PanelistAssignment
                    interviewId={mockInterviewId}
                    scheduledStart={mockScheduledStart}
                    scheduledEnd={mockScheduledEnd}
                />
            );

            await waitFor(() => {
                expect(panelistRealtime.subscribeToPanelistConfirmation).toHaveBeenCalledTimes(1);
            });
        });

        it('updates status when confirmation event is received', async () => {
            let eventHandler: ((payload: any) => void) | null = null;

            vi.mocked(panelistRealtime.subscribeToPanelistConfirmation).mockImplementation((handler) => {
                eventHandler = handler;
                return () => undefined;
            });

            const initialPanelists = [
                {
                    id: 'panelist-1',
                    name: 'John Doe',
                    email: 'john@example.com',
                    timezone: 'America/New_York',
                    status: 'pending' as const,
                    available: true,
                },
            ];

            render(
                <PanelistAssignment
                    interviewId={mockInterviewId}
                    scheduledStart={mockScheduledStart}
                    scheduledEnd={mockScheduledEnd}
                    initialPanelists={initialPanelists}
                />
            );

            await waitFor(() => {
                expect(screen.getByText('pending')).toBeInTheDocument();
            });

            // Simulate WebSocket event
            eventHandler?.({
                interviewStageId: mockInterviewId,
                panelistId: 'panelist-1',
                status: 'confirmed' as const,
                timestamp: new Date().toISOString(),
            });

            await waitFor(() => {
                expect(screen.getByText('confirmed')).toBeInTheDocument();
            });
        });

        it('shows toast notification when panelist confirms', async () => {
            let eventHandler: ((payload: any) => void) | null = null;

            vi.mocked(panelistRealtime.subscribeToPanelistConfirmation).mockImplementation((handler) => {
                eventHandler = handler;
                return () => undefined;
            });

            const initialPanelists = [
                {
                    id: 'panelist-1',
                    name: 'John Doe',
                    email: 'john@example.com',
                    timezone: 'America/New_York',
                    status: 'pending' as const,
                    available: true,
                },
            ];

            render(
                <PanelistAssignment
                    interviewId={mockInterviewId}
                    scheduledStart={mockScheduledStart}
                    scheduledEnd={mockScheduledEnd}
                    initialPanelists={initialPanelists}
                />
            );

            // Simulate WebSocket event
            eventHandler?.({
                interviewStageId: mockInterviewId,
                panelistId: 'panelist-1',
                status: 'confirmed' as const,
                timestamp: new Date().toISOString(),
            });

            await waitFor(() => {
                expect(screen.getByText(/John Doe has confirmed participation/i)).toBeInTheDocument();
            });
        });
    });

    describe('Conflict Handling', () => {
        it('prevents assignment of unavailable panelists', async () => {
            vi.mocked(interviewsApi.assignPanelists).mockRejectedValue({
                message: 'Unavailable panelists',
                unavailablePanelists: [{ id: 'panelist-2', name: 'Jane Smith' }],
            });

            render(
                <PanelistAssignment
                    interviewId={mockInterviewId}
                    scheduledStart={mockScheduledStart}
                    scheduledEnd={mockScheduledEnd}
                />
            );

            const user = userEvent.setup();

            // Wait for panelists to load
            await waitFor(() => {
                expect(screen.getByText('Jane Smith')).toBeInTheDocument();
            });

            // Add unavailable panelist
            const janeButton = screen.getByText('Jane Smith').closest('button');
            await user.click(janeButton!);

            // Try to save
            const saveButton = screen.getByText(/Save Assignments/i);
            await user.click(saveButton);

            await waitFor(() => {
                expect(screen.getByText(/Cannot assign unavailable panelists: Jane Smith/i)).toBeInTheDocument();
            });
        });

        it('shows error message for unavailable panelists', async () => {
            render(
                <PanelistAssignment
                    interviewId={mockInterviewId}
                    scheduledStart={mockScheduledStart}
                    scheduledEnd={mockScheduledEnd}
                />
            );

            const user = userEvent.setup();

            await waitFor(() => {
                expect(screen.getByText('Jane Smith')).toBeInTheDocument();
            });

            // Add unavailable panelist
            const janeButton = screen.getByText('Jane Smith').closest('button');
            await user.click(janeButton!);

            // Check that Jane was added to assigned list
            const assignedSection = screen.getByText(/Assigned Panelists/i).closest('section');
            expect(assignedSection).toHaveTextContent('Jane Smith');

            // Check that conflict indicator is shown
            expect(assignedSection).toHaveTextContent('Conflict');
        });
    });

    describe('Accessibility', () => {
        it('provides ARIA labels for status badges', async () => {
            const initialPanelists = [
                {
                    id: 'panelist-1',
                    name: 'John Doe',
                    email: 'john@example.com',
                    timezone: 'America/New_York',
                    status: 'confirmed' as const,
                    available: true,
                },
            ];

            render(
                <PanelistAssignment
                    interviewId={mockInterviewId}
                    scheduledStart={mockScheduledStart}
                    scheduledEnd={mockScheduledEnd}
                    initialPanelists={initialPanelists}
                />
            );

            await waitFor(() => {
                expect(screen.getByLabelText('Status: confirmed')).toBeInTheDocument();
            });
        });

        it('provides ARIA labels for availability indicators', async () => {
            render(
                <PanelistAssignment
                    interviewId={mockInterviewId}
                    scheduledStart={mockScheduledStart}
                    scheduledEnd={mockScheduledEnd}
                />
            );

            await waitFor(() => {
                expect(screen.getAllByLabelText('Available').length).toBeGreaterThan(0);
                expect(screen.getByLabelText('Unavailable')).toBeInTheDocument();
            });
        });

        it('provides ARIA label for remove button', async () => {
            const initialPanelists = [
                {
                    id: 'panelist-1',
                    name: 'John Doe',
                    email: 'john@example.com',
                    timezone: 'America/New_York',
                    status: 'pending' as const,
                    available: true,
                },
            ];

            render(
                <PanelistAssignment
                    interviewId={mockInterviewId}
                    scheduledStart={mockScheduledStart}
                    scheduledEnd={mockScheduledEnd}
                    initialPanelists={initialPanelists}
                />
            );

            await waitFor(() => {
                expect(screen.getByLabelText('Remove John Doe')).toBeInTheDocument();
            });
        });

        it('search input has accessible label', async () => {
            render(
                <PanelistAssignment
                    interviewId={mockInterviewId}
                    scheduledStart={mockScheduledStart}
                    scheduledEnd={mockScheduledEnd}
                />
            );

            await waitFor(() => {
                expect(screen.getByLabelText('Search for panelists')).toBeInTheDocument();
            });
        });
    });

    describe('Search Functionality', () => {
        it('filters panelists based on search query', async () => {
            render(
                <PanelistAssignment
                    interviewId={mockInterviewId}
                    scheduledStart={mockScheduledStart}
                    scheduledEnd={mockScheduledEnd}
                />
            );

            const user = userEvent.setup();

            await waitFor(() => {
                expect(screen.getByText('John Doe')).toBeInTheDocument();
                expect(screen.getByText('Jane Smith')).toBeInTheDocument();
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
            });

            // Search for "Alice"
            const searchInput = screen.getByLabelText('Search for panelists');
            await user.type(searchInput, 'Alice');

            await waitFor(() => {
                expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
                expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
                expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
            });
        });
    });
});
