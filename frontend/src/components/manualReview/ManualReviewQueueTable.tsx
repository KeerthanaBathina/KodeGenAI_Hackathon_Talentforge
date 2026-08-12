/**
 * ManualReviewQueueTable Component
 * 
 * Displays paginated table of applications pending manual review
 * - Candidate info, requisition, reason badge, score, confidence
 * - Shortlist/Reject action buttons
 * - Pagination controls
 */

'use client';

import React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { buildApiUrl } from '@/lib/api/url';
import {
    getManualReviewQueue,
    getManualReviewReasonCodes,
    markApplicationAsReviewed,
    overrideApplicationPath,
    bulkRejectApplications,
    scheduleInitialInterviewFromReview,
} from '@/lib/api/manualReview';
import {
    ensureReviewQueueBadgeRealtime,
    subscribeToReviewQueueSlaTick,
} from '@/lib/reviewQueueRealtime';
import type {
    ManualReviewQueueItem,
    ManualReviewQueueResponse,
    ManualReviewFilters,
    ManualReviewReasonCode,
    ManualReviewSortBy,
    ManualReviewSortDir,
} from '@/lib/api/manualReview';
import { ReviewReasonBadge } from './ReviewReasonBadge';
import { formatSlaDuration, getSlaChipColors } from './slaUtils';

interface ManualReviewQueueTableProps {
    filters?: ManualReviewFilters;
    onQueueSnapshot?: (snapshot: ManualReviewQueueResponse) => void;
}

type SchedulableStage = 'aptitude' | 'coding' | 'technical' | 'hr';

const TIMEZONE_OPTIONS = [
    { value: 'UTC', label: 'UTC' },
    { value: 'Asia/Kolkata', label: 'India (IST)' },
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'Europe/London', label: 'London (GMT)' },
    { value: 'Europe/Paris', label: 'Paris (CET)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
    { value: 'Australia/Sydney', label: 'Sydney (AEDT)' },
] as const;

function normalizeTimezoneValue(timezone: string): string {
    if (timezone === 'Asia/Calcutta') {
        return 'Asia/Kolkata';
    }

    const match = TIMEZONE_OPTIONS.find((option) => option.value === timezone);
    return match ? match.value : 'UTC';
}

const STAGE_OPTIONS: Array<{
    value: SchedulableStage;
    label: string;
}> = [
    { value: 'aptitude', label: 'Aptitude' },
    { value: 'coding', label: 'Programming' },
    { value: 'technical', label: 'Tech Interview' },
    { value: 'hr', label: 'HR Round' },
];

const ALLOWED_STAGES_BY_PATH: Record<'fresher' | 'experienced', SchedulableStage[]> = {
    fresher: ['aptitude', 'coding', 'technical', 'hr'],
    experienced: ['technical', 'hr'],
};

export function ManualReviewQueueTable({
    filters = {},
    onQueueSnapshot,
}: ManualReviewQueueTableProps) {
    const [data, setData] = useState<ManualReviewQueueResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [actioningId, setActioningId] = useState<string | null>(null);
    const [pendingDecision, setPendingDecision] = useState<{
        applicationId: string;
        candidateName: string;
        decision: 'shortlisted' | 'rejected';
    } | null>(null);
    const [reasonCodesByDecision, setReasonCodesByDecision] = useState<{
        shortlisted: ManualReviewReasonCode[];
        rejected: ManualReviewReasonCode[];
    }>({ shortlisted: [], rejected: [] });
    const [reasonCodesLoading, setReasonCodesLoading] = useState(false);
    const [reasonCodesError, setReasonCodesError] = useState<string | null>(null);
    const [selectedReasonCode, setSelectedReasonCode] = useState('');
    const [decisionComment, setDecisionComment] = useState('');
    const [pendingPathOverride, setPendingPathOverride] = useState<{
        applicationId: string;
        candidateName: string;
        originalPath: 'fresher' | 'experienced' | null;
    } | null>(null);
    const [overridePath, setOverridePath] = useState<'fresher' | 'experienced' | ''>('');
    const [overrideJustification, setOverrideJustification] = useState('');
    const [pathOverrideError, setPathOverrideError] = useState<string | null>(null);
    const [pendingInterviewSchedule, setPendingInterviewSchedule] = useState<{
        applicationId: string;
        candidateName: string;
        path: 'fresher' | 'experienced';
    } | null>(null);
    const [scheduleStartAt, setScheduleStartAt] = useState('');
    const [scheduleEndAt, setScheduleEndAt] = useState('');
    const [scheduleTimezone, setScheduleTimezone] = useState('UTC');
    const [scheduleJoinUrl, setScheduleJoinUrl] = useState('');
    const [scheduleStageType, setScheduleStageType] = useState<SchedulableStage>('aptitude');
    const [scheduleError, setScheduleError] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<ManualReviewSortBy>('sla');
    const [sortDir, setSortDir] = useState<ManualReviewSortDir>('asc');
    const [selectedApplicationIds, setSelectedApplicationIds] = useState<string[]>([]);
    const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
    const [bulkReasonCode, setBulkReasonCode] = useState('');
    const [bulkComment, setBulkComment] = useState('');
    const [bulkError, setBulkError] = useState<string | null>(null);
    const [bulkSubmitting, setBulkSubmitting] = useState(false);

    const commentCharLimit = 500;
    const pathJustificationMinLength = 20;
    const minBulkSelection = 2;

    function toDateTimeLocalValue(date: Date): string {
        const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return localDate.toISOString().slice(0, 16);
    }

    const loadQueue = useCallback(async () => {
        try {
            setLoading(true);
            const response = await getManualReviewQueue(filters, {
                page,
                limit: 20,
            }, {
                sortBy,
                sortDir,
            });
            setData(response);
            onQueueSnapshot?.(response);
            setError(null);
        } catch (err) {
            setError('Failed to load manual review queue');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [filters, onQueueSnapshot, page, sortBy, sortDir]);

    useEffect(() => {
        setPage(1);
    }, [filters]);

    useEffect(() => {
        setSelectedApplicationIds([]);
    }, [page, filters, sortBy, sortDir]);

    useEffect(() => {
        void loadQueue();
    }, [loadQueue]);

    useEffect(() => {
        async function loadReasonCodes() {
            try {
                setReasonCodesLoading(true);
                setReasonCodesError(null);

                const [shortlistCodes, rejectionCodes] = await Promise.all([
                    getManualReviewReasonCodes('shortlisted'),
                    getManualReviewReasonCodes('rejected'),
                ]);

                setReasonCodesByDecision({
                    shortlisted: shortlistCodes,
                    rejected: rejectionCodes,
                });
            } catch (err) {
                setReasonCodesError('Failed to load reason codes');
                console.error(err);
            } finally {
                setReasonCodesLoading(false);
            }
        }

        void loadReasonCodes();
    }, []);

    useEffect(() => {
        ensureReviewQueueBadgeRealtime();

        return subscribeToReviewQueueSlaTick(() => {
            void loadQueue();
        });
    }, [loadQueue]);

    function handleSort(column: ManualReviewSortBy) {
        setPage(1);
        if (sortBy === column) {
            setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
            return;
        }

        setSortBy(column);
        setSortDir('asc');
    }

    function sortLabel(column: ManualReviewSortBy, label: string): string {
        const direction = sortBy === column ? sortDir : 'none';
        return `${label} sort, current: ${direction}`;
    }

    function sortIndicator(column: ManualReviewSortBy): string {
        if (sortBy !== column) {
            return '↕';
        }

        return sortDir === 'asc' ? '↑' : '↓';
    }

    async function handleAction(
        applicationId: string,
        candidateName: string,
        decision: 'shortlisted' | 'rejected'
    ) {
        if (actioningId) return; // Prevent double-click

        setPendingDecision({ applicationId, candidateName, decision });
        setSelectedReasonCode('');
        setDecisionComment('');
    }

    async function handleConfirmDecision() {
        if (!pendingDecision) {
            return;
        }

        if (!selectedReasonCode) {
            return;
        }

        try {
            setActioningId(pendingDecision.applicationId);
            await markApplicationAsReviewed(
                pendingDecision.applicationId,
                pendingDecision.decision,
                selectedReasonCode,
                decisionComment.trim() || undefined
            );
            await loadQueue();
            setPendingDecision(null);
            setSelectedReasonCode('');
            setDecisionComment('');
        } catch (err) {
            console.error('Failed to process decision:', err);
            alert('Failed to process decision. Please try again.');
        } finally {
            setActioningId(null);
        }
    }

    function handleCancelDecision() {
        if (actioningId) {
            return;
        }

        setPendingDecision(null);
        setSelectedReasonCode('');
        setDecisionComment('');
    }

    async function handleOpenPathOverride(item: ManualReviewQueueItem) {
        const currentPath = item.path;

        setPendingPathOverride({
            applicationId: item.id,
            candidateName: item.candidateName,
            originalPath: currentPath ?? null,
        });
        setOverridePath(
            currentPath
                ? currentPath === 'fresher'
                    ? 'experienced'
                    : 'fresher'
                : ''
        );
        setOverrideJustification('');
        setPathOverrideError(null);
    }

    function handleToggleRowSelection(applicationId: string) {
        setSelectedApplicationIds((current) => {
            if (current.includes(applicationId)) {
                return current.filter((id) => id !== applicationId);
            }

            return [...current, applicationId];
        });
    }

    function handleToggleSelectAllVisible() {
        if (!data) {
            return;
        }

        const visibleSelectableIds = data.items
            .filter((item) => !item.decisionLocked && item.canReject)
            .map((item) => item.id);

        const allVisibleSelected =
            visibleSelectableIds.length > 0 &&
            visibleSelectableIds.every((id) => selectedApplicationIds.includes(id));

        if (allVisibleSelected) {
            setSelectedApplicationIds((current) =>
                current.filter((id) => !visibleSelectableIds.includes(id))
            );
            return;
        }

        setSelectedApplicationIds((current) => {
            const merged = new Set(current);
            visibleSelectableIds.forEach((id) => merged.add(id));
            return Array.from(merged);
        });
    }

    function handleOpenBulkReject() {
        setBulkRejectOpen(true);
        setBulkReasonCode('');
        setBulkComment('');
        setBulkError(null);
    }

    function handleCloseBulkReject() {
        if (bulkSubmitting) {
            return;
        }

        setBulkRejectOpen(false);
        setBulkReasonCode('');
        setBulkComment('');
        setBulkError(null);
    }

    async function handleConfirmBulkReject() {
        if (selectedApplicationIds.length < minBulkSelection || !bulkReasonCode) {
            return;
        }

        try {
            setBulkSubmitting(true);
            setBulkError(null);
            await bulkRejectApplications(
                selectedApplicationIds,
                bulkReasonCode,
                bulkComment.trim() || undefined
            );

            setData((current) => {
                if (!current) {
                    return current;
                }

                const remainingItems = current.items.filter(
                    (item) => !selectedApplicationIds.includes(item.id)
                );
                const removedCount = current.items.length - remainingItems.length;
                return {
                    ...current,
                    items: remainingItems,
                    total: Math.max(0, current.total - removedCount),
                };
            });

            setSelectedApplicationIds([]);
            setBulkRejectOpen(false);
            setBulkReasonCode('');
            setBulkComment('');

            await loadQueue();
        } catch (err) {
            console.error('Failed to bulk reject applications:', err);
            setBulkError('Failed to process bulk reject. Please try again.');
        } finally {
            setBulkSubmitting(false);
        }
    }

    function handleOpenResumePreview(item: ManualReviewQueueItem) {
        if (!item.resumeId) {
            return;
        }

        window.open(
            buildApiUrl(`/api/manual-review-queue/${item.id}/resume`),
            '_blank',
            'noopener,noreferrer'
        );
    }

    function handleCancelPathOverride() {
        if (actioningId) {
            return;
        }

        setPendingPathOverride(null);
        setOverridePath('');
        setOverrideJustification('');
        setPathOverrideError(null);
    }

    function handleOpenScheduleInterview(item: ManualReviewQueueItem) {
        if (!item.path) {
            return;
        }

        const now = new Date();
        const roundedStart = new Date(now);
        roundedStart.setMinutes(0, 0, 0);
        roundedStart.setHours(roundedStart.getHours() + 1);
        const defaultEnd = new Date(roundedStart.getTime() + 60 * 60 * 1000);

        setPendingInterviewSchedule({
            applicationId: item.id,
            candidateName: item.candidateName,
            path: item.path,
        });
        setScheduleStageType(item.path === 'fresher' ? 'aptitude' : 'technical');
        setScheduleStartAt(toDateTimeLocalValue(roundedStart));
        setScheduleEndAt(toDateTimeLocalValue(defaultEnd));
        setScheduleTimezone(
            normalizeTimezoneValue(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
        );
        setScheduleJoinUrl('');
        setScheduleError(null);
    }

    function handleCancelScheduleInterview() {
        if (actioningId) {
            return;
        }

        setPendingInterviewSchedule(null);
        setScheduleStartAt('');
        setScheduleEndAt('');
        setScheduleTimezone('UTC');
        setScheduleJoinUrl('');
        setScheduleStageType('aptitude');
        setScheduleError(null);
    }

    async function handleConfirmScheduleInterview() {
        if (!pendingInterviewSchedule) {
            return;
        }

        const allowedStages = ALLOWED_STAGES_BY_PATH[pendingInterviewSchedule.path];
        if (!allowedStages.includes(scheduleStageType)) {
            setScheduleError(
                `The ${scheduleStageType} stage is not part of the ${pendingInterviewSchedule.path} path.`
            );
            return;
        }

        const requiresJoinUrl = scheduleStageType !== 'aptitude';

        if (!scheduleStartAt || !scheduleEndAt || !scheduleTimezone.trim()) {
            setScheduleError('Start time, end time, and timezone are required.');
            return;
        }

        if (requiresJoinUrl && !scheduleJoinUrl.trim()) {
            setScheduleError(`Join link is required for ${scheduleStageType} stage scheduling.`);
            return;
        }

        try {
            setActioningId(pendingInterviewSchedule.applicationId);
            setScheduleError(null);

            await scheduleInitialInterviewFromReview(pendingInterviewSchedule.applicationId, {
                stageType: scheduleStageType,
                startAt: new Date(scheduleStartAt).toISOString(),
                endAt: new Date(scheduleEndAt).toISOString(),
                timezone: scheduleTimezone.trim() || 'UTC',
                joinUrl: requiresJoinUrl ? scheduleJoinUrl.trim() : undefined,
            });

            await loadQueue();
            setPendingInterviewSchedule(null);
            setScheduleStartAt('');
            setScheduleEndAt('');
            setScheduleTimezone('UTC');
            setScheduleJoinUrl('');
            setScheduleStageType('aptitude');
        } catch (error) {
            console.error('Failed to schedule interview:', error);
            setScheduleError('Failed to schedule interview. Please verify timing/link and try again.');
        } finally {
            setActioningId(null);
        }
    }

    async function handleConfirmPathOverride() {
        if (!pendingPathOverride || !overridePath) {
            return;
        }

        const justification = overrideJustification.trim();
        if (justification.length < pathJustificationMinLength) {
            setPathOverrideError('Justification must be at least 20 characters.');
            return;
        }

        try {
            setActioningId(pendingPathOverride.applicationId);
            setPathOverrideError(null);
            await overrideApplicationPath(
                pendingPathOverride.applicationId,
                overridePath,
                justification
            );
            await loadQueue();
            setPendingPathOverride(null);
            setOverridePath('');
            setOverrideJustification('');
        } catch (error) {
            console.error('Failed to override path:', error);
            setPathOverrideError('Failed to override path. Please try again.');
        } finally {
            setActioningId(null);
        }
    }

    const decisionReasonOptions = pendingDecision
        ? reasonCodesByDecision[pendingDecision.decision]
        : [];

    const inlineRejectReasonMessage =
        pendingDecision?.decision === 'rejected' && !selectedReasonCode
            ? 'A reason code is required before rejecting.'
            : null;

    const rejectionReasonOptions = reasonCodesByDecision.rejected;
    const canBulkReject = selectedApplicationIds.length >= minBulkSelection;

    const selectableVisibleIds = data
        ? data.items.filter((item) => !item.decisionLocked && item.canReject).map((item) => item.id)
        : [];
    const allVisibleSelected =
        selectableVisibleIds.length > 0 &&
        selectableVisibleIds.every((id) => selectedApplicationIds.includes(id));

    if (loading && !data) {
        return (
            <div
                style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: '#6B7280',
                }}
            >
                Loading manual review queue...
            </div>
        );
    }

    if (error && !data) {
        return (
            <div
                style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: '#DC2626',
                }}
                role="alert"
            >
                {error}
            </div>
        );
    }

    if (!data || data.items.length === 0) {
        return (
            <div
                style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: '#6B7280',
                    backgroundColor: '#F9FAFB',
                    borderRadius: '8px',
                }}
            >
                No applications in manual review queue
            </div>
        );
    }

    return (
        <div>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                    gap: '12px',
                    flexWrap: 'wrap',
                }}
            >
                <div
                    style={{
                        fontSize: '13px',
                        color: '#4B5563',
                    }}
                    aria-live="polite"
                >
                    {selectedApplicationIds.length} selected
                </div>

                <div style={{ display: 'inline-flex', position: 'relative' }}>
                    <button
                        type="button"
                        onClick={handleOpenBulkReject}
                        disabled={!canBulkReject || actioningId !== null || bulkSubmitting}
                        aria-label="Bulk reject selected applications"
                        style={{
                            padding: '8px 14px',
                            fontSize: '13px',
                            fontWeight: 600,
                            color: '#FFFFFF',
                            backgroundColor:
                                !canBulkReject || actioningId !== null || bulkSubmitting
                                    ? '#9CA3AF'
                                    : '#B91C1C',
                            border: 'none',
                            borderRadius: '6px',
                            cursor:
                                !canBulkReject || actioningId !== null || bulkSubmitting
                                    ? 'not-allowed'
                                    : 'pointer',
                        }}
                    >
                        Bulk Reject
                    </button>
                    {!canBulkReject && (
                        <span
                            role="tooltip"
                            style={{
                                marginLeft: '10px',
                                fontSize: '12px',
                                color: '#6B7280',
                                alignSelf: 'center',
                            }}
                        >
                            Select at least 2 applications for bulk action.
                        </span>
                    )}
                </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table
                    style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E5E7EB',
                        borderRadius: '8px',
                    }}
                >
                    <thead>
                        <tr
                            style={{
                                backgroundColor: '#F9FAFB',
                                borderBottom: '1px solid #E5E7EB',
                            }}
                        >
                            <th
                                style={{
                                    padding: '12px 16px',
                                    textAlign: 'center',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: '#374151',
                                    width: '60px',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={allVisibleSelected}
                                    onChange={handleToggleSelectAllVisible}
                                    aria-label="Select all visible applications"
                                    disabled={selectableVisibleIds.length === 0 || actioningId !== null || bulkSubmitting}
                                />
                            </th>
                            <th
                                style={{
                                    padding: '12px 16px',
                                    textAlign: 'left',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: '#374151',
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => handleSort('candidate')}
                                    aria-label={sortLabel('candidate', 'Candidate')}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        padding: 0,
                                        margin: 0,
                                        color: '#374151',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Candidate {sortIndicator('candidate')}
                                </button>
                            </th>
                            <th
                                style={{
                                    padding: '12px 16px',
                                    textAlign: 'left',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: '#374151',
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => handleSort('role')}
                                    aria-label={sortLabel('role', 'Role and requisition')}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        padding: 0,
                                        margin: 0,
                                        color: '#374151',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Role {sortIndicator('role')}
                                </button>
                            </th>
                            <th
                                style={{
                                    padding: '12px 16px',
                                    textAlign: 'left',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: '#374151',
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => handleSort('status')}
                                    aria-label={sortLabel('status', 'Application status')}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        padding: 0,
                                        margin: 0,
                                        color: '#374151',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Status {sortIndicator('status')}
                                </button>
                            </th>
                            <th
                                style={{
                                    padding: '12px 16px',
                                    textAlign: 'center',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: '#374151',
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => handleSort('score')}
                                    aria-label={sortLabel('score', 'AI score')}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        padding: 0,
                                        margin: 0,
                                        color: '#374151',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    AI Score {sortIndicator('score')}
                                </button>
                            </th>
                            <th
                                style={{
                                    padding: '12px 16px',
                                    textAlign: 'center',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: '#374151',
                                }}
                            >
                                Test Score
                            </th>
                            <th
                                style={{
                                    padding: '12px 16px',
                                    textAlign: 'center',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: '#374151',
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => handleSort('sla')}
                                    aria-label={sortLabel('sla', 'SLA timer')}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        padding: 0,
                                        margin: 0,
                                        color: '#374151',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    SLA {sortIndicator('sla')}
                                </button>
                            </th>
                            <th
                                style={{
                                    padding: '12px 16px',
                                    textAlign: 'left',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: '#374151',
                                }}
                            >
                                Path
                            </th>
                            <th
                                style={{
                                    padding: '12px 16px',
                                    textAlign: 'center',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: '#374151',
                                }}
                            >
                                Resume
                            </th>
                            <th
                                style={{
                                    padding: '12px 16px',
                                    textAlign: 'left',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: '#374151',
                                }}
                            >
                                Status
                            </th>
                            <th
                                style={{
                                    padding: '12px 16px',
                                    textAlign: 'right',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: '#374151',
                                }}
                            >
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.items.map((item) => (
                            <tr
                                key={item.id}
                                style={{
                                    borderBottom: '1px solid #E5E7EB',
                                }}
                            >
                                <td style={{ padding: '16px', textAlign: 'center' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedApplicationIds.includes(item.id)}
                                        onChange={() => handleToggleRowSelection(item.id)}
                                        aria-label={`Select ${item.candidateName} for bulk action`}
                                        disabled={
                                            actioningId !== null ||
                                            bulkSubmitting ||
                                            item.decisionLocked ||
                                            !item.canReject
                                        }
                                    />
                                </td>
                                <td style={{ padding: '16px' }}>
                                    <div
                                        style={{
                                            fontSize: '14px',
                                            fontWeight: 500,
                                            color: '#111827',
                                        }}
                                    >
                                        {item.candidateName}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: '13px',
                                            color: '#6B7280',
                                            marginTop: '2px',
                                        }}
                                    >
                                        {item.candidateEmail}
                                    </div>
                                </td>
                                <td style={{ padding: '16px' }}>
                                    <div
                                        style={{
                                            fontSize: '14px',
                                            color: '#374151',
                                        }}
                                    >
                                        {item.requisitionTitle}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: '12px',
                                            color: '#6B7280',
                                            marginTop: '3px',
                                        }}
                                    >
                                        {item.requisitionDepartment}
                                    </div>
                                </td>
                                <td style={{ padding: '16px' }}>
                                    <span
                                        style={{
                                            fontSize: '13px',
                                            fontWeight: 500,
                                            color: '#374151',
                                            textTransform: 'capitalize',
                                        }}
                                    >
                                        {item.status.replace('_', ' ')}
                                    </span>
                                </td>
                                <td
                                    style={{
                                        padding: '16px',
                                        textAlign: 'center',
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        color: '#111827',
                                    }}
                                >
                                    {item.screeningScore !== null &&
                                    item.screeningScore !== undefined
                                        ? item.screeningScore
                                        : '—'}
                                </td>
                                <td
                                    style={{
                                        padding: '16px',
                                        textAlign: 'center',
                                        fontSize: '14px',
                                        fontWeight: 600,
                                        color:
                                            item.aptitudeScore !== null && item.aptitudeScore !== undefined
                                                ? '#0f766e'
                                                : '#111827',
                                    }}
                                >
                                    {item.aptitudeScore !== null && item.aptitudeScore !== undefined
                                        ? `${item.aptitudeScore}%`
                                        : '—'}
                                </td>
                                <td
                                    style={{
                                        padding: '16px',
                                        textAlign: 'center',
                                        fontSize: '13px',
                                    }}
                                >
                                    <span
                                        data-testid={`sla-chip-${item.id}`}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '5px 10px',
                                            borderRadius: '999px',
                                            border: `1px solid ${getSlaChipColors(item.slaSeverity).borderColor}`,
                                            backgroundColor: getSlaChipColors(item.slaSeverity).backgroundColor,
                                            color: getSlaChipColors(item.slaSeverity).color,
                                            fontWeight: 700,
                                            fontVariantNumeric: 'tabular-nums',
                                            letterSpacing: '0.02em',
                                        }}
                                        aria-label={`SLA ${formatSlaDuration(item.slaRemainingSeconds)} severity ${item.slaSeverity}`}
                                    >
                                        {formatSlaDuration(item.slaRemainingSeconds)}
                                    </span>
                                    {item.slaSeverity === 'red' && (
                                        <span
                                            data-testid={`urgent-badge-${item.id}`}
                                            style={{
                                                marginLeft: '8px',
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                color: '#991B1B',
                                                backgroundColor: '#FEE2E2',
                                                border: '1px solid #FCA5A5',
                                                borderRadius: '999px',
                                                padding: '4px 8px',
                                            }}
                                            aria-label="Urgent application"
                                        >
                                            URGENT
                                        </span>
                                    )}
                                </td>
                                <td style={{ padding: '16px' }}>
                                    <span
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            fontSize: '12px',
                                            fontWeight: 700,
                                            color: '#1F2937',
                                            backgroundColor: '#EEF2FF',
                                            border: '1px solid #C7D2FE',
                                            borderRadius: '999px',
                                            padding: '4px 10px',
                                            textTransform: 'capitalize',
                                        }}
                                        aria-label={`Interview path ${item.path || 'unassigned'}`}
                                    >
                                        {item.path || 'unassigned'}
                                        {item.pathOverridden ? ' (overridden)' : ''}
                                    </span>
                                </td>
                                <td style={{ padding: '16px', textAlign: 'center' }}>
                                    <button
                                        type="button"
                                        onClick={() => handleOpenResumePreview(item)}
                                        disabled={!item.resumeId}
                                        aria-label={`View resume for ${item.candidateName}`}
                                        style={{
                                            padding: '6px 12px',
                                            fontSize: '13px',
                                            fontWeight: 600,
                                            color: '#FFFFFF',
                                            backgroundColor: item.resumeId ? '#2563EB' : '#9CA3AF',
                                            border: 'none',
                                            borderRadius: '6px',
                                            cursor: item.resumeId ? 'pointer' : 'not-allowed',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        View Resume
                                    </button>
                                </td>
                                <td style={{ padding: '16px' }}>
                                    <ReviewReasonBadge
                                        reason={item.manualReviewReason}
                                        scheduledStageType={item.scheduledStageType}
                                    />
                                </td>
                                <td style={{ padding: '16px', textAlign: 'right' }}>
                                    <div
                                        style={{
                                            display: 'flex',
                                            gap: '8px',
                                            justifyContent: 'flex-end',
                                        }}
                                    >
                                        <button
                                            onClick={() => handleOpenPathOverride(item)}
                                            disabled={
                                                actioningId !== null ||
                                                item.decisionLocked
                                            }
                                            style={{
                                                padding: '6px 14px',
                                                fontSize: '13px',
                                                fontWeight: 500,
                                                color: '#FFFFFF',
                                                backgroundColor:
                                                    actioningId === item.id ||
                                                        item.decisionLocked
                                                        ? '#9CA3AF'
                                                        : '#4B5563',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor:
                                                    actioningId !== null ||
                                                        item.decisionLocked
                                                        ? 'not-allowed'
                                                        : 'pointer',
                                            }}
                                            aria-label={`Override path for ${item.candidateName}`}
                                        >
                                            Override Path
                                        </button>
                                        <button
                                            onClick={() => handleOpenScheduleInterview(item)}
                                            disabled={
                                                actioningId !== null ||
                                                item.decisionLocked ||
                                                !item.path ||
                                                !item.pathOverridden
                                            }
                                            style={{
                                                padding: '6px 14px',
                                                fontSize: '13px',
                                                fontWeight: 500,
                                                color: '#FFFFFF',
                                                backgroundColor:
                                                    actioningId === item.id ||
                                                        item.decisionLocked ||
                                                        !item.path ||
                                                        !item.pathOverridden
                                                        ? '#9CA3AF'
                                                        : '#1D4ED8',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor:
                                                    actioningId !== null ||
                                                        item.decisionLocked ||
                                                        !item.path ||
                                                        !item.pathOverridden
                                                        ? 'not-allowed'
                                                        : 'pointer',
                                            }}
                                            aria-label={`Schedule interview for ${item.candidateName}`}
                                        >
                                            Schedule Interview
                                        </button>
                                        <button
                                            onClick={() => handleAction(item.id, item.candidateName, 'shortlisted')}
                                            disabled={actioningId !== null || item.decisionLocked || !item.canShortlist}
                                            style={{
                                                padding: '6px 14px',
                                                fontSize: '13px',
                                                fontWeight: 500,
                                                color: '#FFFFFF',
                                                backgroundColor:
                                                    actioningId === item.id || item.decisionLocked || !item.canShortlist
                                                        ? '#9CA3AF'
                                                        : '#10B981',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor:
                                                    actioningId !== null || item.decisionLocked || !item.canShortlist
                                                        ? 'not-allowed'
                                                        : 'pointer',
                                            }}
                                            aria-label={`Shortlist ${item.candidateName}`}
                                        >
                                            {actioningId === item.id ? 'Processing...' : 'Shortlist'}
                                        </button>
                                        <button
                                            onClick={() => handleAction(item.id, item.candidateName, 'rejected')}
                                            disabled={actioningId !== null || item.decisionLocked || !item.canReject}
                                            style={{
                                                padding: '6px 14px',
                                                fontSize: '13px',
                                                fontWeight: 500,
                                                color: '#FFFFFF',
                                                backgroundColor:
                                                    actioningId === item.id || item.decisionLocked || !item.canReject
                                                        ? '#9CA3AF'
                                                        : '#DC2626',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor:
                                                    actioningId !== null || item.decisionLocked || !item.canReject
                                                        ? 'not-allowed'
                                                        : 'pointer',
                                            }}
                                            aria-label={`Reject ${item.candidateName}`}
                                        >
                                            {actioningId === item.id ? 'Processing...' : 'Reject'}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {data.totalPages > 1 && (
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '20px',
                        padding: '16px',
                        backgroundColor: '#F9FAFB',
                        borderRadius: '8px',
                    }}
                >
                    <div style={{ fontSize: '14px', color: '#6B7280' }}>
                        Showing {(data.page - 1) * data.limit + 1} to{' '}
                        {Math.min(data.page * data.limit, data.total)} of {data.total}{' '}
                        applications
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={data.page === 1}
                            style={{
                                padding: '8px 14px',
                                fontSize: '14px',
                                fontWeight: 500,
                                color: data.page === 1 ? '#9CA3AF' : '#374151',
                                backgroundColor: '#FFFFFF',
                                border: '1px solid #E5E7EB',
                                borderRadius: '6px',
                                cursor: data.page === 1 ? 'not-allowed' : 'pointer',
                            }}
                            aria-label="Previous page"
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                            disabled={data.page === data.totalPages}
                            style={{
                                padding: '8px 14px',
                                fontSize: '14px',
                                fontWeight: 500,
                                color: data.page === data.totalPages ? '#9CA3AF' : '#374151',
                                backgroundColor: '#FFFFFF',
                                border: '1px solid #E5E7EB',
                                borderRadius: '6px',
                                cursor:
                                    data.page === data.totalPages ? 'not-allowed' : 'pointer',
                            }}
                            aria-label="Next page"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}

            {pendingDecision && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={`${pendingDecision.decision === 'rejected' ? 'Reject' : 'Shortlist'} candidate decision form`}
                    style={{
                        marginTop: '20px',
                        border: '1px solid #D1D5DB',
                        borderRadius: '10px',
                        backgroundColor: '#FFFFFF',
                        padding: '16px',
                    }}
                >
                    <div
                        style={{
                            fontSize: '15px',
                            fontWeight: 700,
                            color: '#111827',
                            marginBottom: '12px',
                        }}
                    >
                        {pendingDecision.decision === 'rejected' ? 'Reject' : 'Shortlist'} {pendingDecision.candidateName}
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <label
                            htmlFor="decision-reason-code"
                            style={{
                                display: 'block',
                                fontSize: '13px',
                                fontWeight: 600,
                                color: '#374151',
                                marginBottom: '6px',
                            }}
                        >
                            Reason Code
                        </label>
                        <select
                            id="decision-reason-code"
                            value={selectedReasonCode}
                            onChange={(event) => setSelectedReasonCode(event.target.value)}
                            disabled={reasonCodesLoading || actioningId === pendingDecision.applicationId}
                            style={{
                                width: '100%',
                                padding: '8px 10px',
                                borderRadius: '6px',
                                border: '1px solid #D1D5DB',
                                fontSize: '14px',
                            }}
                            aria-label="Decision reason code"
                        >
                            <option value="">Select a reason code</option>
                            {decisionReasonOptions.map((option) => (
                                <option key={`${option.category}-${option.code}`} value={option.code}>
                                    {option.displayText}
                                </option>
                            ))}
                        </select>
                        {reasonCodesLoading && (
                            <p style={{ marginTop: '6px', fontSize: '12px', color: '#6B7280' }}>
                                Loading reason codes...
                            </p>
                        )}
                        {reasonCodesError && (
                            <p role="alert" style={{ marginTop: '6px', fontSize: '12px', color: '#B91C1C' }}>
                                {reasonCodesError}
                            </p>
                        )}
                        {inlineRejectReasonMessage && (
                            <p role="alert" style={{ marginTop: '6px', fontSize: '12px', color: '#B91C1C' }}>
                                {inlineRejectReasonMessage}
                            </p>
                        )}
                    </div>

                    <div style={{ marginBottom: '14px' }}>
                        <label
                            htmlFor="decision-comment"
                            style={{
                                display: 'block',
                                fontSize: '13px',
                                fontWeight: 600,
                                color: '#374151',
                                marginBottom: '6px',
                            }}
                        >
                            Comment (optional)
                        </label>
                        <textarea
                            id="decision-comment"
                            value={decisionComment}
                            onChange={(event) => {
                                const value = event.target.value;
                                setDecisionComment(value.slice(0, commentCharLimit));
                            }}
                            maxLength={commentCharLimit}
                            rows={3}
                            style={{
                                width: '100%',
                                resize: 'vertical',
                                padding: '8px 10px',
                                borderRadius: '6px',
                                border: '1px solid #D1D5DB',
                                fontSize: '14px',
                            }}
                            aria-label="Decision comment"
                        />
                        <div
                            style={{
                                marginTop: '6px',
                                textAlign: 'right',
                                fontSize: '12px',
                                color: '#6B7280',
                            }}
                            data-testid="decision-comment-count"
                            aria-live="polite"
                        >
                            {decisionComment.length}/{commentCharLimit}
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={handleCancelDecision}
                            disabled={actioningId === pendingDecision.applicationId}
                            style={{
                                padding: '7px 12px',
                                borderRadius: '6px',
                                border: '1px solid #D1D5DB',
                                backgroundColor: '#FFFFFF',
                                color: '#374151',
                                cursor: actioningId === pendingDecision.applicationId ? 'not-allowed' : 'pointer',
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmDecision}
                            disabled={
                                !selectedReasonCode ||
                                actioningId === pendingDecision.applicationId ||
                                reasonCodesLoading
                            }
                            style={{
                                padding: '7px 12px',
                                borderRadius: '6px',
                                border: 'none',
                                backgroundColor:
                                    !selectedReasonCode ||
                                    actioningId === pendingDecision.applicationId ||
                                    reasonCodesLoading
                                        ? '#9CA3AF'
                                        : pendingDecision.decision === 'rejected'
                                            ? '#DC2626'
                                            : '#10B981',
                                color: '#FFFFFF',
                                cursor:
                                    !selectedReasonCode ||
                                    actioningId === pendingDecision.applicationId ||
                                    reasonCodesLoading
                                        ? 'not-allowed'
                                        : 'pointer',
                            }}
                            aria-label={`Confirm ${pendingDecision.decision} decision`}
                        >
                            {actioningId === pendingDecision.applicationId
                                ? 'Processing...'
                                : `Confirm ${pendingDecision.decision === 'rejected' ? 'Reject' : 'Shortlist'}`}
                        </button>
                    </div>
                </div>
            )}

            {pendingPathOverride && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Override interview path form"
                    style={{
                        marginTop: '20px',
                        border: '1px solid #D1D5DB',
                        borderRadius: '10px',
                        backgroundColor: '#FFFFFF',
                        padding: '16px',
                    }}
                >
                    <div
                        style={{
                            fontSize: '15px',
                            fontWeight: 700,
                            color: '#111827',
                            marginBottom: '12px',
                        }}
                    >
                        Override path for {pendingPathOverride.candidateName}
                    </div>

                    <p style={{ fontSize: '13px', color: '#374151', marginBottom: '10px' }}>
                        Current path: <strong style={{ textTransform: 'capitalize' }}>{pendingPathOverride.originalPath ?? 'unassigned'}</strong>
                    </p>

                    <div style={{ marginBottom: '12px' }}>
                        <label
                            htmlFor="override-path"
                            style={{
                                display: 'block',
                                fontSize: '13px',
                                fontWeight: 600,
                                color: '#374151',
                                marginBottom: '6px',
                            }}
                        >
                            New Path
                        </label>
                        <select
                            id="override-path"
                            value={overridePath}
                            onChange={(event) =>
                                setOverridePath(event.target.value as 'fresher' | 'experienced')
                            }
                            disabled={actioningId === pendingPathOverride.applicationId}
                            aria-label="Override path"
                            style={{
                                width: '100%',
                                padding: '8px 10px',
                                borderRadius: '6px',
                                border: '1px solid #D1D5DB',
                                fontSize: '14px',
                            }}
                        >
                            <option value="">Select path</option>
                            <option value="fresher">Fresher</option>
                            <option value="experienced">Experienced</option>
                        </select>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <label
                            htmlFor="override-justification"
                            style={{
                                display: 'block',
                                fontSize: '13px',
                                fontWeight: 600,
                                color: '#374151',
                                marginBottom: '6px',
                            }}
                        >
                            Justification (minimum 20 characters)
                        </label>
                        <textarea
                            id="override-justification"
                            value={overrideJustification}
                            onChange={(event) => setOverrideJustification(event.target.value)}
                            rows={3}
                            aria-label="Path override justification"
                            disabled={actioningId === pendingPathOverride.applicationId}
                            style={{
                                width: '100%',
                                resize: 'vertical',
                                padding: '8px 10px',
                                borderRadius: '6px',
                                border: '1px solid #D1D5DB',
                                fontSize: '14px',
                            }}
                        />
                        <div
                            data-testid="path-override-justification-count"
                            style={{
                                marginTop: '6px',
                                textAlign: 'right',
                                fontSize: '12px',
                                color: '#6B7280',
                            }}
                        >
                            {overrideJustification.trim().length}/{pathJustificationMinLength}
                        </div>
                        {overrideJustification.trim().length > 0 &&
                            overrideJustification.trim().length < pathJustificationMinLength && (
                                <p role="alert" style={{ marginTop: '6px', fontSize: '12px', color: '#B91C1C' }}>
                                    Justification must be at least 20 characters.
                                </p>
                            )}
                        {pathOverrideError && (
                            <p role="alert" style={{ marginTop: '6px', fontSize: '12px', color: '#B91C1C' }}>
                                {pathOverrideError}
                            </p>
                        )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={handleCancelPathOverride}
                            disabled={actioningId === pendingPathOverride.applicationId}
                            style={{
                                padding: '7px 12px',
                                borderRadius: '6px',
                                border: '1px solid #D1D5DB',
                                backgroundColor: '#FFFFFF',
                                color: '#374151',
                                cursor:
                                    actioningId === pendingPathOverride.applicationId
                                        ? 'not-allowed'
                                        : 'pointer',
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmPathOverride}
                            disabled={
                                !overridePath ||
                                overrideJustification.trim().length < pathJustificationMinLength ||
                                actioningId === pendingPathOverride.applicationId
                            }
                            aria-label="Confirm path override"
                            style={{
                                padding: '7px 12px',
                                borderRadius: '6px',
                                border: 'none',
                                backgroundColor:
                                    !overridePath ||
                                        overrideJustification.trim().length < pathJustificationMinLength ||
                                        actioningId === pendingPathOverride.applicationId
                                        ? '#9CA3AF'
                                        : '#4B5563',
                                color: '#FFFFFF',
                                cursor:
                                    !overridePath ||
                                        overrideJustification.trim().length < pathJustificationMinLength ||
                                        actioningId === pendingPathOverride.applicationId
                                        ? 'not-allowed'
                                        : 'pointer',
                            }}
                        >
                            {actioningId === pendingPathOverride.applicationId
                                ? 'Processing...'
                                : 'Confirm Override'}
                        </button>
                    </div>
                </div>
            )}

            {pendingInterviewSchedule && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Schedule interview form"
                    style={{
                        marginTop: '20px',
                        border: '1px solid #D1D5DB',
                        borderRadius: '10px',
                        backgroundColor: '#FFFFFF',
                        padding: '16px',
                    }}
                >
                    <div
                        style={{
                            fontSize: '15px',
                            fontWeight: 700,
                            color: '#111827',
                            marginBottom: '12px',
                        }}
                    >
                        Schedule {pendingInterviewSchedule.candidateName}
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                            Stage
                        </label>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {STAGE_OPTIONS.map((stage) => {
                                const isAllowed = ALLOWED_STAGES_BY_PATH[pendingInterviewSchedule.path].includes(stage.value);
                                const isSelected = scheduleStageType === stage.value;

                                return (
                                    <button
                                        key={stage.value}
                                        type="button"
                                        onClick={() => {
                                            if (!isAllowed) {
                                                return;
                                            }

                                            setScheduleStageType(stage.value);
                                            setScheduleError(null);
                                        }}
                                        disabled={!isAllowed || actioningId === pendingInterviewSchedule.applicationId}
                                        aria-label={`Schedule ${stage.label} stage`}
                                        style={{
                                            padding: '7px 10px',
                                            borderRadius: '6px',
                                            border: isSelected ? '1px solid #1D4ED8' : '1px solid #D1D5DB',
                                            backgroundColor: isSelected ? '#DBEAFE' : '#FFFFFF',
                                            color: !isAllowed ? '#9CA3AF' : '#1F2937',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            cursor:
                                                !isAllowed || actioningId === pendingInterviewSchedule.applicationId
                                                    ? 'not-allowed'
                                                    : 'pointer',
                                        }}
                                    >
                                        {stage.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <label htmlFor="schedule-start-at" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                            Start Time
                        </label>
                        <input
                            id="schedule-start-at"
                            type="datetime-local"
                            value={scheduleStartAt}
                            onChange={(event) => setScheduleStartAt(event.target.value)}
                            disabled={actioningId === pendingInterviewSchedule.applicationId}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px' }}
                        />
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <label htmlFor="schedule-end-at" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                            End Time
                        </label>
                        <input
                            id="schedule-end-at"
                            type="datetime-local"
                            value={scheduleEndAt}
                            onChange={(event) => setScheduleEndAt(event.target.value)}
                            disabled={actioningId === pendingInterviewSchedule.applicationId}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px' }}
                        />
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <label htmlFor="schedule-timezone" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                            Timezone
                        </label>
                        <select
                            id="schedule-timezone"
                            value={scheduleTimezone}
                            onChange={(event) => setScheduleTimezone(event.target.value)}
                            disabled={actioningId === pendingInterviewSchedule.applicationId}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px' }}
                        >
                            {TIMEZONE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {scheduleStageType !== 'aptitude' ? (
                        <div style={{ marginBottom: '12px' }}>
                            <label htmlFor="schedule-join-url" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                                Interview Link
                            </label>
                            <input
                                id="schedule-join-url"
                                type="url"
                                value={scheduleJoinUrl}
                                onChange={(event) => setScheduleJoinUrl(event.target.value)}
                                placeholder="https://meet.example.com/session"
                                disabled={actioningId === pendingInterviewSchedule.applicationId}
                                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px' }}
                            />
                        </div>
                    ) : (
                        <div
                            style={{
                                marginBottom: '12px',
                                borderRadius: '6px',
                                border: '1px solid #BFDBFE',
                                backgroundColor: '#EFF6FF',
                                padding: '10px 12px',
                                fontSize: '12px',
                                color: '#1E3A8A',
                            }}
                        >
                            A secure aptitude test link will be generated automatically and sent to the candidate by email and notification after you confirm the schedule.
                        </div>
                    )}

                    {scheduleError && (
                        <p role="alert" style={{ marginTop: '6px', fontSize: '12px', color: '#B91C1C' }}>
                            {scheduleError}
                        </p>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={handleCancelScheduleInterview}
                            disabled={actioningId === pendingInterviewSchedule.applicationId}
                            style={{
                                padding: '7px 12px',
                                borderRadius: '6px',
                                border: '1px solid #D1D5DB',
                                backgroundColor: '#FFFFFF',
                                color: '#374151',
                                cursor: actioningId === pendingInterviewSchedule.applicationId ? 'not-allowed' : 'pointer',
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmScheduleInterview}
                            disabled={
                                !scheduleStartAt ||
                                !scheduleEndAt ||
                                !scheduleTimezone.trim() ||
                                (scheduleStageType !== 'aptitude' &&
                                    !scheduleJoinUrl.trim()) ||
                                actioningId === pendingInterviewSchedule.applicationId
                            }
                            aria-label="Confirm schedule interview"
                            style={{
                                padding: '7px 12px',
                                borderRadius: '6px',
                                border: 'none',
                                backgroundColor:
                                    !scheduleStartAt ||
                                        !scheduleEndAt ||
                                        !scheduleTimezone.trim() ||
                                        (scheduleStageType !== 'aptitude' &&
                                            !scheduleJoinUrl.trim()) ||
                                        actioningId === pendingInterviewSchedule.applicationId
                                        ? '#9CA3AF'
                                        : '#1D4ED8',
                                color: '#FFFFFF',
                                cursor:
                                    !scheduleStartAt ||
                                        !scheduleEndAt ||
                                        !scheduleTimezone.trim() ||
                                        (scheduleStageType !== 'aptitude' &&
                                            !scheduleJoinUrl.trim()) ||
                                        actioningId === pendingInterviewSchedule.applicationId
                                        ? 'not-allowed'
                                        : 'pointer',
                            }}
                        >
                            {actioningId === pendingInterviewSchedule.applicationId
                                ? 'Scheduling...'
                                : 'Confirm Schedule'}
                        </button>
                    </div>
                </div>
            )}

            {bulkRejectOpen && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Bulk reject applications form"
                    style={{
                        marginTop: '20px',
                        border: '1px solid #D1D5DB',
                        borderRadius: '10px',
                        backgroundColor: '#FFFFFF',
                        padding: '16px',
                    }}
                >
                    <div
                        style={{
                            fontSize: '15px',
                            fontWeight: 700,
                            color: '#111827',
                            marginBottom: '12px',
                        }}
                    >
                        Bulk reject {selectedApplicationIds.length} selected application(s)
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <label
                            htmlFor="bulk-reject-reason-code"
                            style={{
                                display: 'block',
                                fontSize: '13px',
                                fontWeight: 600,
                                color: '#374151',
                                marginBottom: '6px',
                            }}
                        >
                            Shared Reason Code
                        </label>
                        <select
                            id="bulk-reject-reason-code"
                            value={bulkReasonCode}
                            onChange={(event) => setBulkReasonCode(event.target.value)}
                            disabled={bulkSubmitting || reasonCodesLoading}
                            style={{
                                width: '100%',
                                padding: '8px 10px',
                                borderRadius: '6px',
                                border: '1px solid #D1D5DB',
                                fontSize: '14px',
                            }}
                            aria-label="Bulk reject reason code"
                        >
                            <option value="">Select a reason code</option>
                            {rejectionReasonOptions.map((option) => (
                                <option key={`bulk-${option.category}-${option.code}`} value={option.code}>
                                    {option.displayText}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <label
                            htmlFor="bulk-reject-comment"
                            style={{
                                display: 'block',
                                fontSize: '13px',
                                fontWeight: 600,
                                color: '#374151',
                                marginBottom: '6px',
                            }}
                        >
                            Comment (optional)
                        </label>
                        <textarea
                            id="bulk-reject-comment"
                            value={bulkComment}
                            onChange={(event) => {
                                const value = event.target.value;
                                setBulkComment(value.slice(0, commentCharLimit));
                            }}
                            maxLength={commentCharLimit}
                            rows={3}
                            style={{
                                width: '100%',
                                resize: 'vertical',
                                padding: '8px 10px',
                                borderRadius: '6px',
                                border: '1px solid #D1D5DB',
                                fontSize: '14px',
                            }}
                            aria-label="Bulk reject comment"
                        />
                    </div>

                    {bulkError && (
                        <p role="alert" style={{ marginTop: '6px', fontSize: '12px', color: '#B91C1C' }}>
                            {bulkError}
                        </p>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={handleCloseBulkReject}
                            disabled={bulkSubmitting}
                            style={{
                                padding: '7px 12px',
                                borderRadius: '6px',
                                border: '1px solid #D1D5DB',
                                backgroundColor: '#FFFFFF',
                                color: '#374151',
                                cursor: bulkSubmitting ? 'not-allowed' : 'pointer',
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmBulkReject}
                            disabled={
                                !bulkReasonCode ||
                                selectedApplicationIds.length < minBulkSelection ||
                                bulkSubmitting
                            }
                            aria-label="Confirm bulk reject"
                            style={{
                                padding: '7px 12px',
                                borderRadius: '6px',
                                border: 'none',
                                backgroundColor:
                                    !bulkReasonCode ||
                                        selectedApplicationIds.length < minBulkSelection ||
                                        bulkSubmitting
                                        ? '#9CA3AF'
                                        : '#B91C1C',
                                color: '#FFFFFF',
                                cursor:
                                    !bulkReasonCode ||
                                        selectedApplicationIds.length < minBulkSelection ||
                                        bulkSubmitting
                                        ? 'not-allowed'
                                        : 'pointer',
                            }}
                        >
                            {bulkSubmitting ? 'Processing...' : 'Confirm Bulk Reject'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
