export interface PanelistConfirmationPayload {
    interviewStageId: string;
    panelistId: string;
    status: 'confirmed' | 'declined';
    timestamp: string;
}

type PanelistConfirmationHandler = (payload: PanelistConfirmationPayload) => void;

const PANELIST_CONFIRMATION_EVENT = 'panelist:confirmed';
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

export function emitPanelistConfirmation(payload: PanelistConfirmationPayload): void {
    if (typeof window === 'undefined') {
        return;
    }

    window.dispatchEvent(new CustomEvent(PANELIST_CONFIRMATION_EVENT, { detail: payload }));
}

export function subscribeToPanelistConfirmation(handler: PanelistConfirmationHandler): () => void {
    if (typeof window === 'undefined') {
        return () => undefined;
    }

    const listener = (event: Event) => {
        const customEvent = event as CustomEvent<PanelistConfirmationPayload>;
        handler(customEvent.detail);
    };

    window.addEventListener(PANELIST_CONFIRMATION_EVENT, listener);
    void ensureSocketBridge();

    return () => {
        window.removeEventListener(PANELIST_CONFIRMATION_EVENT, listener);
    };
}

async function ensureSocketBridge(): Promise<void> {
    if (isSocketBridgeStarted) {
        return;
    }

    isSocketBridgeStarted = true;
    const apiUrl = getApiBaseUrl();

    if (!apiUrl) {
        console.warn('[panelist-realtime] no API URL configured for WebSocket, skipping bridge');
        return;
    }

    try {
        const socketModule = await import('socket.io-client');
        const socket = socketModule.io(apiUrl, {
            withCredentials: true,
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5,
        });

        socket.on('connect', () => {
            console.log('[panelist-realtime] WebSocket connected');
        });

        socket.on('disconnect', (reason: string) => {
            console.log('[panelist-realtime] WebSocket disconnected:', reason);
            if (reason === 'io server disconnect') {
                socket.connect();
            }
        });

        socket.on('connect_error', (error: Error) => {
            console.error('[panelist-realtime] connection error:', error);
        });

        socket.on(PANELIST_CONFIRMATION_EVENT, (payload: PanelistConfirmationPayload) => {
            console.log('[panelist-realtime] received confirmation:', payload);
            emitPanelistConfirmation(payload);
        });

        // Cleanup on page unload
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', () => {
                socket.disconnect();
            });
        }
    } catch (error) {
        console.error('[panelist-realtime] failed to initialize socket bridge:', error);
        isSocketBridgeStarted = false;
    }
}
