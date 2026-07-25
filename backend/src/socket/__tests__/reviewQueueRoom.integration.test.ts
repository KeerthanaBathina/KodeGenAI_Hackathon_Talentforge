import http from 'http';
import express from 'express';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

vi.mock('../../config/env', () => ({
  env: {
    FRONTEND_URL: 'http://localhost:3000',
  },
}));

vi.mock('../../services/jwtService', () => ({
  JwtService: {
    verify: (token: string) => {
      if (token === 'hr-token') {
        return { sub: 'user-1', role: 'hr_reviewer' };
      }

      return { sub: 'user-2', role: 'candidate' };
    },
  },
}));

vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));
import {
  getSocketServer,
  initSocketServer,
  resetSocketServerForTests,
} from '../index';
import { REVIEW_QUEUE_HR_ROOM } from '../../services/reviewQueueRealtimeService';

function onceConnected(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (error) => reject(error));
  });
}

function waitForEvent<T>(socket: ClientSocket, eventName: string, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);

    socket.once(eventName, (payload: T) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

describe('review queue socket room isolation', () => {
  let server: http.Server | null = null;
  const clients: ClientSocket[] = [];

  afterEach(async () => {
    for (const client of clients) {
      client.disconnect();
    }
    clients.length = 0;

    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      server = null;
    }

    await resetSocketServerForTests();
  });

  it('delivers review queue events to HR role only', async () => {
    const app = express();
    server = http.createServer(app);
    initSocketServer(server);

    await new Promise<void>((resolve) => {
      server!.listen(0, () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to get dynamic test port');
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;

    const hrSocket = createClient(baseUrl, {
      transports: ['websocket'],
      auth: { token: 'hr-token' },
    });
    const candidateSocket = createClient(baseUrl, {
      transports: ['websocket'],
      auth: { token: 'candidate-token' },
    });

    clients.push(hrSocket, candidateSocket);

    await Promise.all([onceConnected(hrSocket), onceConnected(candidateSocket)]);

    const hrEventPromise = waitForEvent<{ pendingCount: number; urgentCount: number }>(
      hrSocket,
      'review-queue:badge-count',
      1000
    );

    let candidateReceived = false;
    candidateSocket.once('review-queue:badge-count', () => {
      candidateReceived = true;
    });

    getSocketServer().to(REVIEW_QUEUE_HR_ROOM).emit('review-queue:badge-count', {
      pendingCount: 5,
      urgentCount: 2,
      timestamp: new Date().toISOString(),
    });

    const hrPayload = await hrEventPromise;
    expect(hrPayload.pendingCount).toBe(5);
    expect(hrPayload.urgentCount).toBe(2);

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(candidateReceived).toBe(false);
  });
});