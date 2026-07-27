/**
 * Integration Tests for Prerequisite WebSocket Events
 * 
 * Tests real-time event delivery for stage and assessment completion:
 * - Event emission to correct application rooms
 * - Room isolation (events only to subscribed clients)
 * - Multiple clients in same room
 * - Event payload structure
 */

import http from 'http';
import express from 'express';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock environment
vi.mock('../../config/env', () => ({
  env: {
    FRONTEND_URL: 'http://localhost:3000'
  }
}));

// Mock JWT service (authentication not required for application rooms)
vi.mock('../../services/jwtService', () => ({
  JwtService: {
    verify: (token: string) => {
      return { sub: 'user-1', role: 'hiring_manager' };
    }
  }
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

import {
  getSocketServer,
  initSocketServer,
  resetSocketServerForTests
} from '../index';
import {
  emitStageCompleted,
  emitAssessmentCompleted
} from '../prerequisiteEvents';

function onceConnected(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (error) => reject(error));
  });
}

function waitForEvent<T>(
  socket: ClientSocket,
  eventName: string,
  timeoutMs: number
): Promise<T> {
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

describe('Prerequisite WebSocket Events Integration', () => {
  let server: http.Server | null = null;
  const clients: ClientSocket[] = [];

  afterEach(async () => {
    // Disconnect all clients
    for (const client of clients) {
      client.disconnect();
    }
    clients.length = 0;

    // Close server
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

    // Reset socket server
    await resetSocketServerForTests();
  });

  it('should emit stage:completed event to clients in application room', async () => {
    // Setup server
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
    const applicationId = '550e8400-e29b-41d4-a716-446655440000';

    // Connect client
    const client = createClient(baseUrl, {
      transports: ['websocket']
    });
    clients.push(client);

    await onceConnected(client);

    // Join application room
    const joinedPromise = waitForEvent(client, 'joined:application', 1000);
    client.emit('join:application', applicationId);
    await joinedPromise;

    // Listen for stage:completed event
    const eventPromise = waitForEvent<any>(client, 'stage:completed', 1000);

    // Emit event from server
    await emitStageCompleted({
      applicationId,
      stageId: 'stage-1',
      stageType: 'technical',
      completedAt: new Date('2026-07-27T15:00:00Z'),
      completedBy: 'user-interviewer-1'
    });

    // Verify event received
    const payload = await eventPromise;
    expect(payload).toMatchObject({
      applicationId,
      stageId: 'stage-1',
      stageType: 'technical',
      completedAt: '2026-07-27T15:00:00.000Z',
      completedBy: 'user-interviewer-1'
    });
  });

  it('should emit assessment:completed event to clients in application room', async () => {
    // Setup server
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
    const applicationId = '550e8400-e29b-41d4-a716-446655440000';

    // Connect client
    const client = createClient(baseUrl, {
      transports: ['websocket']
    });
    clients.push(client);

    await onceConnected(client);

    // Join application room
    const joinedPromise = waitForEvent(client, 'joined:application', 1000);
    client.emit('join:application', applicationId);
    await joinedPromise;

    // Listen for assessment:completed event
    const eventPromise = waitForEvent<any>(client, 'assessment:completed', 1000);

    // Emit event from server
    await emitAssessmentCompleted({
      applicationId,
      assessmentId: 'assessment-1',
      score: 85.5,
      completedAt: new Date('2026-07-27T14:30:00Z')
    });

    // Verify event received
    const payload = await eventPromise;
    expect(payload).toMatchObject({
      applicationId,
      assessmentId: 'assessment-1',
      score: 85.5,
      completedAt: '2026-07-27T14:30:00.000Z'
    });
  });

  it('should only deliver events to clients in the correct application room', async () => {
    // Setup server
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
    const app1Id = '550e8400-e29b-41d4-a716-446655440001';
    const app2Id = '550e8400-e29b-41d4-a716-446655440002';

    // Connect two clients for different applications
    const client1 = createClient(baseUrl, { transports: ['websocket'] });
    const client2 = createClient(baseUrl, { transports: ['websocket'] });
    clients.push(client1, client2);

    await Promise.all([onceConnected(client1), onceConnected(client2)]);

    // Client 1 joins app1 room
    const joined1Promise = waitForEvent(client1, 'joined:application', 1000);
    client1.emit('join:application', app1Id);
    await joined1Promise;

    // Client 2 joins app2 room
    const joined2Promise = waitForEvent(client2, 'joined:application', 1000);
    client2.emit('join:application', app2Id);
    await joined2Promise;

    // Track events received
    let client1ReceivedEvent = false;
    let client2ReceivedEvent = false;

    client1.once('stage:completed', () => {
      client1ReceivedEvent = true;
    });

    client2.once('stage:completed', () => {
      client2ReceivedEvent = true;
    });

    // Emit event for app1 only
    await emitStageCompleted({
      applicationId: app1Id,
      stageId: 'stage-1',
      stageType: 'technical',
      completedAt: new Date(),
      completedBy: 'user-1'
    });

    // Wait for potential delivery
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify only client1 received the event
    expect(client1ReceivedEvent).toBe(true);
    expect(client2ReceivedEvent).toBe(false);
  });

  it('should deliver events to multiple clients in the same application room', async () => {
    // Setup server
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
    const applicationId = '550e8400-e29b-41d4-a716-446655440000';

    // Connect three clients (simulating hiring manager, recruiter, admin)
    const client1 = createClient(baseUrl, { transports: ['websocket'] });
    const client2 = createClient(baseUrl, { transports: ['websocket'] });
    const client3 = createClient(baseUrl, { transports: ['websocket'] });
    clients.push(client1, client2, client3);

    await Promise.all([
      onceConnected(client1),
      onceConnected(client2),
      onceConnected(client3)
    ]);

    // All clients join the same application room
    await Promise.all([
      (async () => {
        client1.emit('join:application', applicationId);
        await waitForEvent(client1, 'joined:application', 1000);
      })(),
      (async () => {
        client2.emit('join:application', applicationId);
        await waitForEvent(client2, 'joined:application', 1000);
      })(),
      (async () => {
        client3.emit('join:application', applicationId);
        await waitForEvent(client3, 'joined:application', 1000);
      })()
    ]);

    // Set up event listeners
    const events: any[] = [];
    [client1, client2, client3].forEach((client, index) => {
      client.once('stage:completed', (payload) => {
        events.push({ clientIndex: index, payload });
      });
    });

    // Emit event
    await emitStageCompleted({
      applicationId,
      stageId: 'stage-1',
      stageType: 'hr',
      completedAt: new Date('2026-07-27T16:00:00Z'),
      completedBy: 'user-interviewer-2'
    });

    // Wait for delivery
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify all three clients received the event
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.clientIndex).sort()).toEqual([0, 1, 2]);
    
    // Verify payload consistency
    events.forEach((event) => {
      expect(event.payload).toMatchObject({
        applicationId,
        stageId: 'stage-1',
        stageType: 'hr',
        completedBy: 'user-interviewer-2'
      });
    });
  });

  it('should handle leave:application and stop delivering events', async () => {
    // Setup server
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
    const applicationId = '550e8400-e29b-41d4-a716-446655440000';

    // Connect client
    const client = createClient(baseUrl, { transports: ['websocket'] });
    clients.push(client);

    await onceConnected(client);

    // Join application room
    client.emit('join:application', applicationId);
    await waitForEvent(client, 'joined:application', 1000);

    // Leave application room
    client.emit('leave:application', applicationId);
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Track event reception
    let receivedEvent = false;
    client.once('stage:completed', () => {
      receivedEvent = true;
    });

    // Emit event after leaving
    await emitStageCompleted({
      applicationId,
      stageId: 'stage-1',
      stageType: 'technical',
      completedAt: new Date(),
      completedBy: 'user-1'
    });

    // Wait for potential delivery
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify event was NOT received
    expect(receivedEvent).toBe(false);
  });

  it('should handle invalid applicationId gracefully', async () => {
    // Setup server
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

    // Connect client
    const client = createClient(baseUrl, { transports: ['websocket'] });
    clients.push(client);

    await onceConnected(client);

    // Try to join with invalid applicationId (should be logged but not crash)
    client.emit('join:application', '');
    client.emit('join:application', null);
    client.emit('join:application', 123);

    // Wait and ensure no errors
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Client should still be connected
    expect(client.connected).toBe(true);
  });
});
