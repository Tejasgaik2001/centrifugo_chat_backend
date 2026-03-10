import { FastifyInstance } from 'fastify';
import { getRedis } from '../services/redis.service';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  console.log('[Health Routes] Registering health endpoints...');
  
  app.get('/health', async (_request, reply) => {
    console.log('[Health Routes] /health endpoint called');
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/ready', async (_request, reply) => {
    console.log('[Health Routes] /ready endpoint called');
    try {
      await getRedis().ping();
      return reply.send({ status: 'ready' });
    } catch (err) {
      return reply.code(503).send({ status: 'not ready', error: String(err) });
    }
  });
  
  console.log('[Health Routes] Health endpoints registered successfully');
}
