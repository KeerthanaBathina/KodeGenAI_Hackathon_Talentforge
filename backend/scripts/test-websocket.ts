import { io as ioClient } from 'socket.io-client';

const socket = ioClient('http://localhost:3001', {
  transports: ['websocket']
});

const startTime = Date.now();

socket.on('connect', () => {
  console.log(`[test] Connected in ${Date.now() - startTime}ms. Socket ID: ${socket.id}`);
});

socket.on('connected', (payload: { socketId: string; timestamp: string }) => {
  const latency = Date.now() - startTime;
  console.log(`[test] connected ack received in ${latency}ms`, payload);

  if (latency < 1000) {
    console.log('[test] PASS latency < 1000ms');
    socket.disconnect();
    process.exit(0);
  }

  console.error('[test] FAIL latency >= 1000ms');
  socket.disconnect();
  process.exit(1);
});

socket.on('connect_error', (error) => {
  console.error('[test] Connection error:', error.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('[test] FAIL no connection or ack within 5s');
  process.exit(1);
}, 5000);
