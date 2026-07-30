export interface ReviewQueueBadgeCountPayload {
  pendingCount: number;
  urgentCount: number;
  timestamp: string;
}

export interface ReviewQueueRealtimeRow {
  id: string;
  candidateName: string;
  requisitionTitle: string;
  slaDeadlineAt: string;
  slaRemainingSeconds: number;
  slaElapsedPercent: number;
  slaSeverity: 'normal' | 'amber' | 'red';
  isUrgent: boolean;
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

type BadgeHandler = (payload: ReviewQueueBadgeCountPayload) => void;
type SlaTickHandler = (payload: ReviewQueueSlaTickPayload) => void;
type UrgentHandler = (payload: ReviewQueueUrgentPayload) => void;
type QueueNewApplicationHandler = (payload: QueueNewApplicationPayload) => void;

const REVIEW_QUEUE_BADGE_EVENT = 'review-queue:badge-count';
const REVIEW_QUEUE_SLA_TICK_EVENT = 'review-queue:sla-tick';
const REVIEW_QUEUE_URGENT_EVENT = 'review-queue:urgent';
const QUEUE_NEW_APPLICATION_EVENT = 'queue:new_application';
let isSocketBridgeStarted = false;

function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) {
    return configured;
  }

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return '';
}

export function emitReviewQueueBadgeCount(payload: ReviewQueueBadgeCountPayload): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(REVIEW_QUEUE_BADGE_EVENT, { detail: payload }));
}

export function emitReviewQueueSlaTick(payload: ReviewQueueSlaTickPayload): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(REVIEW_QUEUE_SLA_TICK_EVENT, { detail: payload }));
}

export function emitReviewQueueUrgent(payload: ReviewQueueUrgentPayload): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(REVIEW_QUEUE_URGENT_EVENT, { detail: payload }));
}

export function emitQueueNewApplication(payload: QueueNewApplicationPayload): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(QUEUE_NEW_APPLICATION_EVENT, { detail: payload }));
}

export function subscribeToReviewQueueBadgeCount(handler: BadgeHandler): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<ReviewQueueBadgeCountPayload>;
    if (!customEvent.detail) {
      return;
    }
    handler(customEvent.detail);
  };

  window.addEventListener(REVIEW_QUEUE_BADGE_EVENT, listener);

  return () => {
    window.removeEventListener(REVIEW_QUEUE_BADGE_EVENT, listener);
  };
}

export function subscribeToReviewQueueSlaTick(handler: SlaTickHandler): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<ReviewQueueSlaTickPayload>;
    if (!customEvent.detail) {
      return;
    }
    handler(customEvent.detail);
  };

  window.addEventListener(REVIEW_QUEUE_SLA_TICK_EVENT, listener);

  return () => {
    window.removeEventListener(REVIEW_QUEUE_SLA_TICK_EVENT, listener);
  };
}

export function subscribeToReviewQueueUrgent(handler: UrgentHandler): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<ReviewQueueUrgentPayload>;
    if (!customEvent.detail) {
      return;
    }
    handler(customEvent.detail);
  };

  window.addEventListener(REVIEW_QUEUE_URGENT_EVENT, listener);

  return () => {
    window.removeEventListener(REVIEW_QUEUE_URGENT_EVENT, listener);
  };
}

export function subscribeToQueueNewApplication(handler: QueueNewApplicationHandler): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<QueueNewApplicationPayload>;
    if (!customEvent.detail) {
      return;
    }
    handler(customEvent.detail);
  };

  window.addEventListener(QUEUE_NEW_APPLICATION_EVENT, listener);

  return () => {
    window.removeEventListener(QUEUE_NEW_APPLICATION_EVENT, listener);
  };
}

export function ensureReviewQueueBadgeRealtime(): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (isSocketBridgeStarted) {
    return;
  }

  isSocketBridgeStarted = true;

  void (async () => {
    try {
      const socketModule = await import('socket.io-client');
      const socket = socketModule.io(getApiBaseUrl(), {
        withCredentials: true,
        transports: ['websocket', 'polling'],
      });

      socket.on('review-queue:badge-count', (payload: ReviewQueueBadgeCountPayload) => {
        emitReviewQueueBadgeCount(payload);
      });

      socket.on('review-queue:sla-tick', (payload: ReviewQueueSlaTickPayload) => {
        emitReviewQueueSlaTick(payload);
      });

      socket.on('review-queue:urgent', (payload: ReviewQueueUrgentPayload) => {
        emitReviewQueueUrgent(payload);
      });

      socket.on('queue:new_application', (payload: QueueNewApplicationPayload) => {
        emitQueueNewApplication(payload);
      });

      socket.on('connect_error', () => {
        // Keep the UI functional even if realtime connection is unavailable.
      });
    } catch {
      // Socket client package may be unavailable in some environments.
    }
  })();
}
