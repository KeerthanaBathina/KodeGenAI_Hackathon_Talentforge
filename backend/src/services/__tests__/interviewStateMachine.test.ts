import { describe, it, expect } from 'vitest';
import { InterviewStageState } from '@prisma/client';
import {
    canTransition,
    getAllowedTransitions,
    isTerminalState,
} from '../interviewStateMachine';

describe('interviewStateMachine', () => {
    describe('canTransition', () => {
        describe('valid transitions from scheduled', () => {
            it('should allow scheduled → completed', () => {
                const result = canTransition(
                    InterviewStageState.scheduled,
                    InterviewStageState.completed
                );
                expect(result.allowed).toBe(true);
                expect(result.reason).toBeUndefined();
            });

            it('should allow scheduled → cancelled', () => {
                const result = canTransition(
                    InterviewStageState.scheduled,
                    InterviewStageState.cancelled
                );
                expect(result.allowed).toBe(true);
            });

            it('should allow scheduled → no_show', () => {
                const result = canTransition(
                    InterviewStageState.scheduled,
                    InterviewStageState.no_show
                );
                expect(result.allowed).toBe(true);
            });

            it('should allow scheduled → rescheduled', () => {
                const result = canTransition(
                    InterviewStageState.scheduled,
                    InterviewStageState.rescheduled
                );
                expect(result.allowed).toBe(true);
            });
        });

        describe('valid transitions from no_show', () => {
            it('should allow no_show → rescheduled', () => {
                const result = canTransition(
                    InterviewStageState.no_show,
                    InterviewStageState.rescheduled
                );
                expect(result.allowed).toBe(true);
            });
        });

        describe('invalid transitions from terminal states', () => {
            it('should reject completed → no_show', () => {
                const result = canTransition(
                    InterviewStageState.completed,
                    InterviewStageState.no_show
                );
                expect(result.allowed).toBe(false);
                expect(result.reason).toContain('Cannot transition from completed to no_show');
                expect(result.reason).toContain('Allowed transitions: none');
            });

            it('should reject completed → scheduled', () => {
                const result = canTransition(
                    InterviewStageState.completed,
                    InterviewStageState.scheduled
                );
                expect(result.allowed).toBe(false);
            });

            it('should reject cancelled → rescheduled', () => {
                const result = canTransition(
                    InterviewStageState.cancelled,
                    InterviewStageState.rescheduled
                );
                expect(result.allowed).toBe(false);
                expect(result.reason).toContain('Cannot transition from cancelled to rescheduled');
            });

            it('should reject rescheduled → scheduled', () => {
                const result = canTransition(
                    InterviewStageState.rescheduled,
                    InterviewStageState.scheduled
                );
                expect(result.allowed).toBe(false);
            });
        });

        describe('invalid transitions from no_show', () => {
            it('should reject no_show → completed', () => {
                const result = canTransition(
                    InterviewStageState.no_show,
                    InterviewStageState.completed
                );
                expect(result.allowed).toBe(false);
                expect(result.reason).toContain('Cannot transition from no_show to completed');
                expect(result.reason).toContain('Allowed transitions: rescheduled');
            });

            it('should reject no_show → cancelled', () => {
                const result = canTransition(
                    InterviewStageState.no_show,
                    InterviewStageState.cancelled
                );
                expect(result.allowed).toBe(false);
            });
        });
    });

    describe('getAllowedTransitions', () => {
        it('should return all allowed transitions for scheduled', () => {
            const allowed = getAllowedTransitions(InterviewStageState.scheduled);
            expect(allowed).toEqual(['completed', 'cancelled', 'no_show', 'rescheduled']);
        });

        it('should return empty array for completed (terminal state)', () => {
            const allowed = getAllowedTransitions(InterviewStageState.completed);
            expect(allowed).toEqual([]);
        });

        it('should return empty array for cancelled (terminal state)', () => {
            const allowed = getAllowedTransitions(InterviewStageState.cancelled);
            expect(allowed).toEqual([]);
        });

        it('should return only rescheduled for no_show', () => {
            const allowed = getAllowedTransitions(InterviewStageState.no_show);
            expect(allowed).toEqual(['rescheduled']);
        });

        it('should return empty array for rescheduled (terminal state)', () => {
            const allowed = getAllowedTransitions(InterviewStageState.rescheduled);
            expect(allowed).toEqual([]);
        });
    });

    describe('isTerminalState', () => {
        it('should return false for scheduled', () => {
            expect(isTerminalState(InterviewStageState.scheduled)).toBe(false);
        });

        it('should return true for completed', () => {
            expect(isTerminalState(InterviewStageState.completed)).toBe(true);
        });

        it('should return true for cancelled', () => {
            expect(isTerminalState(InterviewStageState.cancelled)).toBe(true);
        });

        it('should return false for no_show (can transition to rescheduled)', () => {
            expect(isTerminalState(InterviewStageState.no_show)).toBe(false);
        });

        it('should return true for rescheduled', () => {
            expect(isTerminalState(InterviewStageState.rescheduled)).toBe(true);
        });
    });
});
