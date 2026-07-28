import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { getSocketServer } from '../../socket';
import logger from '../../utils/logger';

const router = Router();

/**
 * GET /api/admin/socket/rooms
 * 
 * List all active Socket.IO connections and their rooms.
 * For debugging and monitoring purposes.
 * 
 * Requires: admin role
 */
router.get('/rooms', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
    const io = getSocketServer();
    const sockets = await io.fetchSockets();
    
    const roomData = sockets.map(socket => ({
      socketId: socket.id,
      rooms: Array.from(socket.rooms).filter(r => r !== socket.id)
    }));
    
    logger.info(
      { totalConnections: sockets.length, requestedBy: (req as any).user?.userId },
      '[socketRooms] Socket rooms fetched'
    );
    
    res.json({
      rooms: roomData,
      totalConnections: sockets.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error({ error }, '[socketRooms] Failed to fetch socket rooms');
    res.status(500).json({ error: 'Failed to fetch socket rooms' });
  }
});

export default router;
