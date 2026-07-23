import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { env } from '../config/env';
import logger from '../utils/logger';

export type AppSocketServer = SocketServer;

let io: AppSocketServer | null = null;

export function initSocketServer(httpServer: HttpServer): AppSocketServer {
  if (io) {
    return io;
  }

  io = new SocketServer(httpServer, {
    cors: {
      origin: env.FRONTEND_URL,
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 20000,
    pingInterval: 25000
  });

  io.on('connection', (socket: Socket) => {
    logger.info({ socketId: socket.id }, '[socket] Client connected');

    socket.emit('connected', {
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });

    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, reason }, '[socket] Client disconnected');
    });

    socket.on('error', (err) => {
      logger.error({ socketId: socket.id, err }, '[socket] Client error');
    });
  });

  logger.info('[socket] Socket.IO server initialized');
  return io;
}

export function getSocketServer(): AppSocketServer {
  if (!io) {
    throw new Error('Socket.IO server has not been initialized.');
  }
  return io;
}
