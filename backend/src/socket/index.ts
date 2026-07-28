import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { env } from '../config/env';
import logger from '../utils/logger';
import { JwtService } from '../services/jwtService';
import { REVIEW_QUEUE_HR_ROOM } from '../services/reviewQueueRealtimeService';

export type AppSocketServer = SocketServer;
const HR_REVIEWER_ROLES = new Set(['hr_reviewer', 'hr_manager']);

let io: AppSocketServer | null = null;

function getAuthTokenFromSocket(socket: Socket): string | null {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken;
  }

  const cookieHeader = socket.handshake.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [rawKey, ...rawValueParts] = cookie.trim().split('=');
    if (rawKey !== 'auth_token') {
      continue;
    }

    const rawValue = rawValueParts.join('=');
    if (!rawValue) {
      return null;
    }

    return decodeURIComponent(rawValue);
  }

  return null;
}

function joinHrRoomIfEligible(socket: Socket): void {
  const token = getAuthTokenFromSocket(socket);
  if (!token) {
    return;
  }

  try {
    const payload = JwtService.verify(token);
    if (!HR_REVIEWER_ROLES.has(payload.role)) {
      return;
    }

    socket.join(REVIEW_QUEUE_HR_ROOM);
    logger.info(
      { socketId: socket.id, role: payload.role },
      '[socket] Joined HR review room'
    );
  } catch (error) {
    logger.warn(
      { socketId: socket.id, error },
      '[socket] Ignoring invalid auth token for room assignment'
    );
  }
}

function joinUserNotificationRoom(socket: Socket): void {
  const token = getAuthTokenFromSocket(socket);
  if (!token) {
    return;
  }

  try {
    const payload = JwtService.verify(token);
    const roomName = `user:${payload.userId}`;
    
    socket.join(roomName);
    
    logger.info(
      { socketId: socket.id, userId: payload.userId, room: roomName },
      '[socket] Joined user notification room'
    );
  } catch (error) {
    logger.warn(
      { socketId: socket.id, error },
      '[socket] Invalid token for notification room'
    );
  }
}

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
    joinHrRoomIfEligible(socket);
    joinUserNotificationRoom(socket);

    socket.emit('connected', {
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });

    // Application room subscription for prerequisite updates
    socket.on('join:application', (applicationId: string) => {
      if (typeof applicationId !== 'string' || !applicationId.trim()) {
        logger.warn(
          { socketId: socket.id, applicationId },
          '[socket] Invalid applicationId for join:application'
        );
        return;
      }

      const room = `application:${applicationId}`;
      socket.join(room);
      logger.info(
        { socketId: socket.id, applicationId, room },
        '[socket] Client joined application room'
      );
      
      socket.emit('joined:application', {
        applicationId,
        room,
        timestamp: new Date().toISOString()
      });
    });

    // Leave application room
    socket.on('leave:application', (applicationId: string) => {
      if (typeof applicationId !== 'string' || !applicationId.trim()) {
        logger.warn(
          { socketId: socket.id, applicationId },
          '[socket] Invalid applicationId for leave:application'
        );
        return;
      }

      const room = `application:${applicationId}`;
      socket.leave(room);
      logger.info(
        { socketId: socket.id, applicationId, room },
        '[socket] Client left application room'
      );
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

export async function resetSocketServerForTests(): Promise<void> {
  if (!io) {
    return;
  }

  await io.close();
  io = null;
}
