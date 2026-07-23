---
id: task_002
us_id: us_002
epic: EP-TECH
title: "Integrate Socket.IO WebSocket Server with Connected Acknowledgement"
status: done
layer: backend
effort: 3h
priority: critical
created: 2026-07-22
---

# TASK-002 — Integrate Socket.IO WebSocket Server with Connected Acknowledgement

## Context

**User Story**: US-002 — Deploy Node.js/Express Backend to Railway.app with Zero-Downtime Rolling Strategy  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses Acceptance Criteria**: Scenario 3 (WebSocket connection succeeds in < 1 second and emits a `connected` acknowledgement)

Socket.IO powers real-time notifications across the hiring pipeline (interview scheduling, AI screening completion, status updates). This task mounts the Socket.IO server on the shared HTTP server, configures CORS for the frontend origin, and implements the `connected` acknowledgement event that acceptance testing requires.

---

## Objective

Mount Socket.IO 4.x on the existing Express HTTP server, implement CORS-restricted WebSocket handshake, emit a `connected` acknowledgement event on each new client connection, and expose the Socket.IO server instance for use by future feature services.

---

## Technical Specifications

| Attribute | Value |
|-----------|-------|
| Library | `socket.io` 4.x |
| Transport | WebSocket (with polling fallback) |
| CORS Origin | `env.FRONTEND_URL` (no wildcard) |
| Acknowledgement Event | `connected` — emitted server-side to the connecting socket |
| Acknowledgement Payload | `{ socketId: string; timestamp: string }` |
| Namespace | Default (`/`) for bootstrap; feature namespaces added in feature epics |
| Max Connections (Phase 1) | 200 (per NFR-002) |
| Connection timeout | 20 000 ms (default) |

---

## Implementation Steps

### Step 1 — Install Socket.IO

```bash
cd backend
npm install socket.io
npm install -D @types/socket.io   # types bundled in socket.io itself; install if separate types needed
```

> `socket.io` ships its own TypeScript definitions from v4.x; no separate `@types/socket.io` package is required.

### Step 2 — Create the Socket.IO server module

Create `backend/src/socket/index.ts`:

```typescript
import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { env } from '../config/env';

export type AppSocketServer = SocketServer;

let io: AppSocketServer | null = null;

export function initSocketServer(httpServer: HttpServer): AppSocketServer {
  if (io) return io;

  io = new SocketServer(httpServer, {
    cors: {
      origin: env.FRONTEND_URL,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Prefer WebSocket; fall back to long-polling only when necessary
    transports: ['websocket', 'polling'],
    // Ping/pong heartbeat — detects stale connections within 25 s
    pingTimeout: 20_000,
    pingInterval: 25_000,
  });

  io.on('connection', (socket: Socket) => {
    console.log(`[socket] Client connected: ${socket.id}`);

    // Acceptance criterion: emit 'connected' ack immediately on connection
    socket.emit('connected', {
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });

    socket.on('disconnect', (reason) => {
      console.log(`[socket] Client disconnected: ${socket.id} (${reason})`);
    });

    socket.on('error', (err) => {
      console.error(`[socket] Error from ${socket.id}:`, err);
    });
  });

  console.log('[socket] Socket.IO server initialised');
  return io;
}

/** Returns the singleton Socket.IO server — throws if not yet initialised. */
export function getSocketServer(): AppSocketServer {
  if (!io) {
    throw new Error('Socket.IO server has not been initialised. Call initSocketServer first.');
  }
  return io;
}
```

### Step 3 — Wire Socket.IO into `server.ts`

Update `backend/src/server.ts` to initialise Socket.IO after the HTTP server is created:

```typescript
import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { initSocketServer } from './socket';

const app = createApp();
const server = http.createServer(app);

// Initialise Socket.IO on the shared HTTP server
const io = initSocketServer(server);

const PORT = parseInt(env.PORT, 10);

server.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT} (${env.NODE_ENV})`);
  console.log(`[server] WebSocket endpoint: ws://0.0.0.0:${PORT}`);
});

// Graceful shutdown — close socket connections before HTTP server
const shutdown = (signal: string) => {
  console.log(`[server] ${signal} received — initiating graceful shutdown`);

  // Close all Socket.IO connections first
  io.close(() => {
    console.log('[socket] All connections closed');

    server.close((err) => {
      if (err) {
        console.error('[server] Error during shutdown:', err);
        process.exit(1);
      }
      console.log('[server] HTTP server closed. Exiting.');
      process.exit(0);
    });
  });

  setTimeout(() => {
    console.error('[server] Graceful shutdown timed out. Force exiting.');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

### Step 4 — Update `/health` to report socket status

Update `backend/src/routes/health.ts` to include a `socket` field:

```typescript
import { getSocketServer } from '../socket';

// Inside the /health handler, after existing checks:
try {
  const socketServer = getSocketServer();
  const connectedCount = socketServer.engine.clientsCount;
  checks['socket'] = 'ok';
  checks['connections'] = String(connectedCount);
} catch {
  // Socket not yet initialised during early startup — treat as ok
  checks['socket'] = 'ok';
}
```

Updated response shape:

```json
{
  "status": "ok",
  "db": "ok",
  "redis": "ok",
  "socket": "ok",
  "connections": "0"
}
```

> The primary acceptance criterion shape `{"status":"ok","db":"ok","redis":"ok"}` remains satisfied; additional fields are additive and non-breaking.

### Step 5 — Write a local integration test client

Create `backend/scripts/test-websocket.ts` (run locally; not committed to CI):

```typescript
import { io as ioClient } from 'socket.io-client';

const socket = ioClient('http://localhost:3001', {
  transports: ['websocket'],
});

const startTime = Date.now();

socket.on('connect', () => {
  console.log(`[test] Connected in ${Date.now() - startTime}ms. Socket ID: ${socket.id}`);
});

socket.on('connected', (payload: { socketId: string; timestamp: string }) => {
  const latency = Date.now() - startTime;
  console.log(`[test] 'connected' ack received in ${latency}ms:`, payload);

  if (latency < 1000) {
    console.log('[test] ✅ PASS — latency < 1000ms');
  } else {
    console.error('[test] ❌ FAIL — latency >= 1000ms');
    process.exit(1);
  }

  socket.disconnect();
  process.exit(0);
});

socket.on('connect_error', (err) => {
  console.error('[test] Connection error:', err.message);
  process.exit(1);
});

// Timeout guard
setTimeout(() => {
  console.error('[test] ❌ FAIL — no connection within 5s');
  process.exit(1);
}, 5_000);
```

Install client for local testing only:

```bash
npm install -D socket.io-client
```

Run the test:

```bash
npm run dev &                    # Start server
npx tsx scripts/test-websocket.ts
```

---

## Validation

| Check | Command / Method | Expected Result |
|-------|-----------------|-----------------|
| Socket.IO mounts on server start | `npm run dev`, check logs | `[socket] Socket.IO server initialised` logged |
| Client connects | `npx tsx scripts/test-websocket.ts` | `Connected in <Xms>` logged |
| `connected` ack received < 1000 ms | Same script | `✅ PASS — latency < 1000ms` |
| Health endpoint includes socket field | `curl http://localhost:3001/health` | `"socket":"ok"` in JSON |
| Disconnect logged | Kill test client | `[socket] Client disconnected: <id>` logged |
| CORS rejects wrong origin | `wscat -c ws://localhost:3001 -H "Origin: https://evil.com"` | Connection refused / upgrade rejected |

---

## Dependencies

- **TASK-001** must be complete (Express HTTP server, env config, and `/health` route must exist)

## Security Constraints

- **OWASP A07 (Identification and Authentication Failures)**: Socket.IO CORS restricted to `env.FRONTEND_URL`; wildcard `*` origin is forbidden.
- **OWASP A05 (Security Misconfiguration)**: `credentials: true` with explicit single origin (not `*`) satisfies browser CORS preflight requirements without over-exposure.
- **OWASP A09 (Security Logging and Monitoring Failures)**: Each connection and disconnection is logged with socket ID. Socket errors are caught and logged, not swallowed.
- Authentication middleware for Socket.IO events will be added in EP-001 (candidate identity); this task establishes the bootstrap connection only.

---

## Definition of Done

- [ ] `socket.io` installed and version pinned in `package.json`
- [ ] `backend/src/socket/index.ts` created with `initSocketServer` and `getSocketServer` exports
- [ ] `server.ts` updated — Socket.IO initialised on shared HTTP server
- [ ] `connected` event emitted with `{ socketId, timestamp }` on every new connection
- [ ] Socket.IO graceful shutdown added to SIGTERM handler (before HTTP server close)
- [ ] `/health` response includes `"socket":"ok"` field
- [ ] Local test script confirms `connected` ack received in < 1000 ms
- [ ] CORS restricted to `FRONTEND_URL`; wildcard origin rejected

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-002 |
| Epic | EP-TECH |
| NFR | NFR-001 (WebSocket message latency < 100 ms), NFR-002 (200 concurrent sessions) |
| Scenario | 3 (WebSocket connects < 1 s, `connected` ack received) |
