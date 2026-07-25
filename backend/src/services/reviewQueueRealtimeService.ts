import type { AppSocketServer } from '../socket';
import logger from '../utils/logger';

export const REVIEW_QUEUE_HR_ROOM = 'hr-reviewers';

export interface ReviewQueueRealtimeRow {
  id: string;
  candidateName: string;
  requisitionTitle: string;
  status: string;
  screeningScore: number | null;
  slaDeadlineAt: string;
  slaRemainingSeconds: number;
  slaElapsedPercent: number;
  slaSeverity: 'normal' | 'amber' | 'red';
  isUrgent: boolean;
}

export interface ReviewQueueBadgeCountPayload {
  pendingCount: number;
  urgentCount: number;
  timestamp: string;
}

export interface ReviewQueueSlaTickPayload {
  rows: ReviewQueueRealtimeRow[];
  timestamp: string;
}

export interface ReviewQueueUrgentPayload {
  id: string;
  candidateName: string;
  requisitionTitle: string;
  slaDeadlineAt: string;
  slaRemainingSeconds: number;
  timestamp: string;
}

export interface QueueNewApplicationPayload {
  applicationId: string;
  candidateName: string;
  requisitionTitle: string;
  queuedAt: string;
  queueCount: number;
  timestamp: string;
}

interface QueueNewApplicationEventInput {
  applicationId: string;
  candidateName: string;
  requisitionTitle: string;
  queuedAt?: string;
  correlationId?: string;
}

interface ReviewQueueEmitDeps {
  io?: Pick<AppSocketServer, 'to'>;
  fetchQueueRows?: () => Promise<ManualReviewQueueItem[]>;
}

export interface ReviewQueueRealtimeTickerDeps {
  io: Pick<AppSocketServer, 'to'>;
  fetchQueueRows?: () => Promise<ManualReviewQueueItem[]>;
  intervalMs?: number;
  emitOnStart?: boolean;
}

export interface ManualReviewQueueItem {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  requisitionId: string;
  requisitionTitle: string;
  requisitionDepartment: string;
  status: string;
  manualReviewReason: string | null;
  submittedAt: Date;
  screeningScore?: number | null;
  screeningConfidence?: number | null;
  slaDeadlineAt: string;
  slaRemainingSeconds: number;
  slaElapsedPercent: number;
  slaSeverity: 'normal' | 'amber' | 'red';
  isUrgent: boolean;
  canShortlist: boolean;
  canReject: boolean;
  decisionLocked: boolean;
}

type Severity = ReviewQueueRealtimeRow['slaSeverity'];

const DEFAULT_INTERVAL_MS = 60_000;
let reviewQueueRealtimeEmitter: Pick<AppSocketServer, 'to'> | null = null;

function getRealtimeEmitter(io?: Pick<AppSocketServer, 'to'>): Pick<AppSocketServer, 'to'> | null {
  return io ?? reviewQueueRealtimeEmitter;
}

function toRealtimeRow(item: ManualReviewQueueItem): ReviewQueueRealtimeRow {
  return {
    id: item.id,
    candidateName: item.candidateName,
    requisitionTitle: item.requisitionTitle,
    status: item.status,
    screeningScore: item.screeningScore ?? null,
    slaDeadlineAt: item.slaDeadlineAt,
    slaRemainingSeconds: item.slaRemainingSeconds,
    slaElapsedPercent: item.slaElapsedPercent,
    slaSeverity: item.slaSeverity,
    isUrgent: item.isUrgent,
  };
}

function buildBadgeCountPayload(
  rows: ReviewQueueRealtimeRow[],
  timestamp: string
): ReviewQueueBadgeCountPayload {
  const urgentCount = rows.reduce((count, row) => {
    return row.slaSeverity === 'red' ? count + 1 : count;
  }, 0);

  return {
    pendingCount: rows.length,
    urgentCount,
    timestamp,
  };
}

async function fetchAllPendingQueueRows(): Promise<ManualReviewQueueItem[]> {
  const { getManualReviewQueue } = await import('./manualReviewQueueService');
  const rows: ManualReviewQueueItem[] = [];
  const pageSize = 200;
  let page = 1;
  let totalPages = 1;

  do {
    const snapshot = await getManualReviewQueue(
      { status: 'pending_review' },
      { page, limit: pageSize }
    );

    rows.push(...snapshot.items);
    totalPages = snapshot.totalPages;
    page += 1;
  } while (page <= totalPages);

  return rows;
}

export class ReviewQueueRealtimeTicker {
  private readonly io: Pick<AppSocketServer, 'to'>;
  private readonly fetchQueueRows: () => Promise<ManualReviewQueueItem[]>;
  private readonly intervalMs: number;
  private readonly emitOnStart: boolean;
  private intervalHandle: NodeJS.Timeout | null = null;
  private readonly previousSeverity = new Map<string, Severity>();

  constructor(deps: ReviewQueueRealtimeTickerDeps) {
    this.io = deps.io;
    this.fetchQueueRows = deps.fetchQueueRows ?? fetchAllPendingQueueRows;
    this.intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.emitOnStart = deps.emitOnStart ?? true;
  }

  start(): void {
    if (this.intervalHandle) {
      return;
    }

    if (this.emitOnStart) {
      void this.tick();
    }

    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
  }

  stop(): void {
    if (!this.intervalHandle) {
      return;
    }

    clearInterval(this.intervalHandle);
    this.intervalHandle = null;
    this.previousSeverity.clear();
  }

  async tick(): Promise<void> {
    try {
      const items = await this.fetchQueueRows();
      const rows = items.map(toRealtimeRow);
      const timestamp = new Date().toISOString();
      const currentById = new Map<string, Severity>();

      const slaTickPayload: ReviewQueueSlaTickPayload = {
        rows,
        timestamp,
      };
      this.io.to(REVIEW_QUEUE_HR_ROOM).emit('review-queue:sla-tick', slaTickPayload);

      for (const row of rows) {
        currentById.set(row.id, row.slaSeverity);

        const previous = this.previousSeverity.get(row.id);
        if (previous !== 'red' && row.slaSeverity === 'red') {
          const urgentPayload: ReviewQueueUrgentPayload = {
            id: row.id,
            candidateName: row.candidateName,
            requisitionTitle: row.requisitionTitle,
            slaDeadlineAt: row.slaDeadlineAt,
            slaRemainingSeconds: row.slaRemainingSeconds,
            timestamp,
          };
          this.io.to(REVIEW_QUEUE_HR_ROOM).emit('review-queue:urgent', urgentPayload);
        }
      }

      const badgePayload = buildBadgeCountPayload(rows, timestamp);
      this.io.to(REVIEW_QUEUE_HR_ROOM).emit('review-queue:badge-count', badgePayload);

      this.previousSeverity.clear();
      for (const [id, severity] of currentById.entries()) {
        this.previousSeverity.set(id, severity);
      }
    } catch (error) {
      logger.error({ error }, '[review-queue-realtime] Failed to emit review queue events');
    }
  }
}

export async function emitReviewQueueBadgeCountSnapshot(
  deps: ReviewQueueEmitDeps = {}
): Promise<boolean> {
  const io = getRealtimeEmitter(deps.io);
  if (!io) {
    return false;
  }

  try {
    const fetchQueueRows = deps.fetchQueueRows ?? fetchAllPendingQueueRows;
    const rows = (await fetchQueueRows()).map(toRealtimeRow);
    const timestamp = new Date().toISOString();
    const payload = buildBadgeCountPayload(rows, timestamp);
    io.to(REVIEW_QUEUE_HR_ROOM).emit('review-queue:badge-count', payload);
    return true;
  } catch (error) {
    logger.error({ error }, '[review-queue-realtime] Failed to emit badge count snapshot');
    return false;
  }
}

export async function emitQueueNewApplicationEvent(
  input: QueueNewApplicationEventInput,
  deps: ReviewQueueEmitDeps = {}
): Promise<boolean> {
  const io = getRealtimeEmitter(deps.io);
  if (!io) {
    return false;
  }

  try {
    const fetchQueueRows = deps.fetchQueueRows ?? fetchAllPendingQueueRows;
    const rows = (await fetchQueueRows()).map(toRealtimeRow);
    const timestamp = new Date().toISOString();
    const payload: QueueNewApplicationPayload = {
      applicationId: input.applicationId,
      candidateName: input.candidateName,
      requisitionTitle: input.requisitionTitle,
      queuedAt: input.queuedAt ?? timestamp,
      queueCount: rows.length,
      timestamp,
    };

    io.to(REVIEW_QUEUE_HR_ROOM).emit('queue:new_application', payload);
    io.to(REVIEW_QUEUE_HR_ROOM).emit(
      'review-queue:badge-count',
      buildBadgeCountPayload(rows, timestamp)
    );

    logger.info(
      {
        applicationId: input.applicationId,
        queueCount: payload.queueCount,
        correlationId: input.correlationId,
      },
      '[review-queue-realtime] Emitted queue:new_application'
    );

    return true;
  } catch (error) {
    logger.error(
      {
        error,
        applicationId: input.applicationId,
        correlationId: input.correlationId,
      },
      '[review-queue-realtime] Failed to emit queue:new_application'
    );
    return false;
  }
}

let reviewQueueRealtimeTicker: ReviewQueueRealtimeTicker | null = null;

export function startReviewQueueRealtimeTicker(io: Pick<AppSocketServer, 'to'>): void {
  reviewQueueRealtimeEmitter = io;

  if (!reviewQueueRealtimeTicker) {
    reviewQueueRealtimeTicker = new ReviewQueueRealtimeTicker({ io });
  }

  reviewQueueRealtimeTicker.start();
}

export function stopReviewQueueRealtimeTicker(): void {
  if (!reviewQueueRealtimeTicker) {
    return;
  }

  reviewQueueRealtimeTicker.stop();
  reviewQueueRealtimeTicker = null;
  reviewQueueRealtimeEmitter = null;
}
