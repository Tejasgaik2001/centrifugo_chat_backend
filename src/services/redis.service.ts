import Redis from 'ioredis';
import { config } from '../config';

let redisClient: Redis;
let subscriberClient: Redis;

export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(config.redis.url, {
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    redisClient.on('connect', () => console.log('[Redis] Connected'));
    redisClient.on('error', (err) => console.error('[Redis] Error:', err));
  }
  return redisClient;
}

export function getSubscriberRedis(): Redis {
  if (!subscriberClient) {
    subscriberClient = new Redis(config.redis.url, {
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });
    subscriberClient.on('connect', () => console.log('[Redis Subscriber] Connected'));
    subscriberClient.on('error', (err) => console.error('[Redis Subscriber] Error:', err));
  }
  return subscriberClient;
}


export async function broadcastPresenceChange(userId: string, status: string, username: string): Promise<void> {
  const payload = {
    type: 'presence_change',
    userId,
    username,
    status,
    timestamp: new Date().toISOString(),
  };
  
  // Broadcast via Redis pub/sub for WebSocket server
  await getRedis().publish('presence', JSON.stringify(payload));
  
  // Also broadcast via Centrifugo for frontend clients
  try {
    const { centrifugoService } = await import('./centrifugo.service');
    await centrifugoService.publishToChannel('presence', payload);
  } catch (error) {
    console.error('[Redis] Failed to broadcast presence via Centrifugo:', error);
  }
}


export async function setTyping(roomId: string, userId: string): Promise<void> {
  await getRedis().set(`typing:${roomId}:${userId}`, '1', 'EX', 5);
}

export async function clearTyping(roomId: string, userId: string): Promise<void> {
  await getRedis().del(`typing:${roomId}:${userId}`);
}

export async function publishToRoom(roomId: string, payload: object): Promise<void> {
  await getRedis().publish(`room:${roomId}`, JSON.stringify(payload));
}

export async function storeSession(
  sessionId: string,
  data: object,
  ttlSeconds = 30 * 24 * 60 * 60
): Promise<void> {
  await getRedis().set(`session:${sessionId}`, JSON.stringify(data), 'EX', ttlSeconds);
}

export async function getSession(sessionId: string): Promise<Record<string, unknown> | null> {
  const data = await getRedis().get(`session:${sessionId}`);
  return data ? (JSON.parse(data) as Record<string, unknown>) : null;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await getRedis().del(`session:${sessionId}`);
}

export async function closeRedis(): Promise<void> {
  if (redisClient) await redisClient.quit();
  if (subscriberClient) await subscriberClient.quit();
}
