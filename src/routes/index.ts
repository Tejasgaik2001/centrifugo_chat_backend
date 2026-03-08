import { FastifyInstance } from 'fastify';
import { authRoutes } from './auth';
import { userRoutes } from './users';
import { roomRoutes } from './rooms';
import { messageRoutes } from './messages';
import centrifugoRoutes from './centrifugo';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(
    async (instance) => {
      await authRoutes(instance);
      await userRoutes(instance);
      await roomRoutes(instance);
      await messageRoutes(instance);
      await centrifugoRoutes(instance);
    },
    { prefix: '/api/v1' }
  );
}
