/**
 * Manual WebSocket Emission Verification Script
 * 
 * This script tests the panelist confirmation WebSocket emission in a real environment.
 * Run this after starting the backend server.
 * 
 * Usage:
 *   ts-node scripts/test-panelist-websocket.ts
 */

import { io, Socket } from 'socket.io-client';

const API_URL = process.env.API_URL || 'http://localhost:8080';

interface PanelistConfirmationPayload {
    interviewStageId: string;
    panelistId: string;
    status: 'confirmed' | 'declined';
    timestamp: string;
}

async function testWebSocketEmission(): Promise<void> {
    console.log('[test] Connecting to Socket.IO server at', API_URL);

    const socket: Socket = io(API_URL, {
        transports: ['websocket', 'polling'],
        reconnection: false,
    });

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            socket.disconnect();
            reject(new Error('Timeout waiting for connection'));
        }, 5000);

        socket.on('connect', () => {
            console.log('[test] ✓ Connected to Socket.IO server');
            console.log('[test] Socket ID:', socket.id);
            console.log('[test] Listening for panelist:confirmed events...');
        });

        socket.on('connect_error', (error: Error) => {
            clearTimeout(timeout);
            socket.disconnect();
            reject(new Error(`Connection error: ${error.message}`));
        });

        socket.on('panelist:confirmed', (payload: PanelistConfirmationPayload) => {
            clearTimeout(timeout);
            console.log('[test] ✓ Received panelist:confirmed event:');
            console.log(JSON.stringify(payload, null, 2));
            
            // Verify payload structure
            const requiredFields = ['interviewStageId', 'panelistId', 'status', 'timestamp'];
            const missingFields = requiredFields.filter(field => !(field in payload));
            
            if (missingFields.length > 0) {
                console.error('[test] ✗ Missing required fields:', missingFields);
            } else {
                console.log('[test] ✓ Payload structure is valid');
            }

            // Verify timestamp is recent (within last 10 seconds)
            const timestamp = new Date(payload.timestamp);
            const now = new Date();
            const diffMs = now.getTime() - timestamp.getTime();
            
            if (diffMs < 0 || diffMs > 10000) {
                console.warn('[test] ⚠ Timestamp seems incorrect (not within last 10 seconds)');
            } else {
                console.log('[test] ✓ Timestamp is recent (<10s)');
            }

            socket.disconnect();
            resolve();
        });

        // Keep connection alive for 30 seconds to receive events
        setTimeout(() => {
            clearTimeout(timeout);
            console.log('[test] No events received in 30 seconds');
            socket.disconnect();
            resolve();
        }, 30000);
    });
}

console.log('\n=== Panelist Confirmation WebSocket Test ===\n');
console.log('This script connects to the backend WebSocket server and listens for panelist:confirmed events.');
console.log('To trigger an event, use the confirmation endpoint:');
console.log('  POST /api/interviews/confirm-panelist');
console.log('  Body: { "token": "<valid-confirmation-token>" }');
console.log('\nPress Ctrl+C to exit\n');

testWebSocketEmission()
    .then(() => {
        console.log('\n[test] Test completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n[test] Test failed:', error.message);
        process.exit(1);
    });
