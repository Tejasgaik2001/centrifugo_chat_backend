import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { verifyToken } from '../services/auth.service';
import {
  getSubscriberRedis,
  publishToRoom,
  setTyping,
  clearTyping,
  broadcastPresenceChange,
} from '../services/redis.service';

const userConnections = new Map<string, Set<WebSocket>>();
const roomSubscriptions = new Map<string, Set<WebSocket>>();

function addUserConnection(userId: string, ws: WebSocket): void {
  if (!userConnections.has(userId)) {
    userConnections.set(userId, new Set());
  }
  userConnections.get(userId)!.add(ws);
}

function removeUserConnection(userId: string, ws: WebSocket): void {
  userConnections.get(userId)?.delete(ws);
  if (userConnections.get(userId)?.size === 0) {
    userConnections.delete(userId);
  }
}

function subscribeToRoom(roomId: string, ws: WebSocket): void {
  if (!roomSubscriptions.has(roomId)) {
    roomSubscriptions.set(roomId, new Set());
  }
  roomSubscriptions.get(roomId)!.add(ws);
}

function unsubscribeFromRoom(roomId: string, ws: WebSocket): void {
  roomSubscriptions.get(roomId)?.delete(ws);
  if (roomSubscriptions.get(roomId)?.size === 0) {
    roomSubscriptions.delete(roomId);
  }
}

function safeSend(ws: WebSocket, payload: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export async function registerWebSocket(app: FastifyInstance): Promise<void> {
  const subscriber = getSubscriberRedis();

  subscriber.on('message', (channel: string, data: string) => {
    if (channel === 'presence') {
      // Broadcast presence changes to all connected users
      const payload = JSON.parse(data) as object;
      for (const [, connections] of userConnections.entries()) {
        for (const ws of connections) {
          safeSend(ws, payload);
        }
      }
    } else {
      const roomId = channel.replace('room:', '');
      const payload = JSON.parse(data) as object;
      const subscribers = roomSubscriptions.get(roomId);
      if (subscribers) {
        for (const ws of subscribers) {
          safeSend(ws, payload);
        }
      }
    }
  });

  app.get('/ws', { websocket: true }, (socket) => {
    let userId: string | null = null;
    const subscribedRooms = new Set<string>();

    const authTimeout = setTimeout(() => {
      if (!userId) {
        socket.close(4001, 'Authentication timeout');
      }
    }, 10000);

    socket.on('message', async (rawData) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(rawData.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      switch (msg.type) {
        case 'auth': {
          try {
            const payload = verifyToken(msg.token as string);
            userId = payload.userId;
            clearTimeout(authTimeout);
            addUserConnection(userId, socket);
            
            // Get user info for broadcasting and update status
            const { User } = await import('../models/User');
            await User.updateOne(
              { _id: userId },
              { status: 'online', lastSeen: new Date() }
            );
            const user = await User.findById(userId).lean();
            
            // Set user online and broadcast presence change
            if (user) {
              await broadcastPresenceChange(userId, 'online', user.username);
            }
            
            safeSend(socket, { type: 'auth_ok', userId });
          } catch {
            socket.close(4001, 'Invalid token');
          }
          break;
        }

        case 'subscribe': {
          if (!userId) return;
          const roomId = msg.roomId as string;
          subscribeToRoom(roomId, socket);
          subscribedRooms.add(roomId);
          await subscriber.subscribe(`room:${roomId}`);
          break;
        }

        case 'unsubscribe': {
          if (!userId) return;
          const roomId = msg.roomId as string;
          unsubscribeFromRoom(roomId, socket);
          subscribedRooms.delete(roomId);
          break;
        }

        case 'typing_start': {
          if (!userId) return;
          const roomId = msg.roomId as string;
          await setTyping(roomId, userId);
          await publishToRoom(roomId, {
            type: 'typing',
            roomId,
            user: { _id: userId },
            isTyping: true,
          });
          break;
        }

        case 'typing_stop': {
          if (!userId) return;
          const roomId = msg.roomId as string;
          await clearTyping(roomId, userId);
          await publishToRoom(roomId, {
            type: 'typing',
            roomId,
            user: { _id: userId },
            isTyping: false,
          });
          break;
        }

        case 'ping': {
          safeSend(socket, { type: 'pong' });
          break;
        }

        case 'set_status': {
          if (!userId) return;
          const status = msg.status as 'online' | 'offline' | 'away' | 'dnd';
          const validStatuses = ['online', 'offline', 'away', 'dnd'];
          
          if (validStatuses.includes(status)) {
            // Update status in database
            const { User } = await import('../models/User');
            await User.updateOne(
              { _id: userId },
              { status: status as 'online' | 'offline' | 'away' | 'dnd', lastSeen: new Date() }
            );
            
            // Get user info for broadcasting
            const user = await User.findById(userId).lean();
            if (user) {
              await broadcastPresenceChange(userId, status, user.username);
            }
          }
          break;
        }

        default:
          break;
      }
    });

    socket.on('close', async () => {
      clearTimeout(authTimeout);
      if (userId) {
        removeUserConnection(userId, socket);
        
        // Check if user has any other connections
        const userConnectionsList = userConnections.get(userId);
        if (!userConnectionsList || userConnectionsList.size === 0) {
          // User is completely offline
          const { User } = await import('../models/User');
          await User.updateOne(
            { _id: userId },
            { status: 'offline', lastSeen: new Date() }
          );
          
          // Get user info for broadcasting
          const user = await User.findById(userId).lean();
          if (user) {
            await broadcastPresenceChange(userId, 'offline', user.username);
          }
        }
        
        for (const roomId of subscribedRooms) {
          unsubscribeFromRoom(roomId, socket);
        }
      }
    });

    socket.on('error', (err) => {
      console.error('[WebSocket] Error:', err);
    });
  });
}
