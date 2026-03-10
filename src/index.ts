import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import websocketPlugin from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { config } from './config';
import { connectDatabase } from './services/database.service';
import { closeRedis } from './services/redis.service';
import { registerRoutes } from './routes';
import { registerWebSocket } from './websocket';

const app = Fastify({
  logger: {
    level: config.nodeEnv === 'production' ? 'warn' : 'info',
  },
});

async function start(): Promise<void> {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Messaging Backend API',
        description: 'Real-time messaging platform with WebSocket support',
        version: '1.0.0',
      },
      servers: [
        {
          url: `http://localhost:${config.port}`,
          description: 'Development server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      tags: [
        { name: 'Auth', description: 'Authentication endpoints' },
        { name: 'Users', description: 'User management endpoints' },
        { name: 'Rooms', description: 'Room/conversation endpoints' },
        { name: 'Messages', description: 'Messaging endpoints' },
      ],
    },
  });

  await app.register(swaggerUI, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  await app.register(helmet, { global: true });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 600,
    timeWindow: '1 minute',
    keyGenerator: (request) =>
      (request.headers['x-forwarded-for'] as string) ?? request.ip,
  });

  await app.register(websocketPlugin);

  // Add basic routes to test server functionality
  app.get('/', async (_request, reply) => {
    console.log('[Root] Root route called');
    return reply.send({ message: 'Server is running', timestamp: new Date().toISOString() });
  });

  app.get('/api/v1/test', async (_request, reply) => {
    console.log('[Test] Direct test route called');
    return reply.send({ message: 'Test route working', timestamp: new Date().toISOString() });
  });

  console.log('[Server] About to register routes...');
  await registerRoutes(app);
  console.log('[Server] Routes registered successfully');
  await registerWebSocket(app);
  await connectDatabase();

  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`[Server] Listening on port ${config.port}`);
}

const shutdown = async (): Promise<void> => {
  console.log('[Server] Shutting down...');
  await app.close();
  await closeRedis();
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

(async () => {
  try {
    await start();
  } catch (err) {
    console.error('[Server] Startup error:', err);
    process.exit(1);
  }
})();
