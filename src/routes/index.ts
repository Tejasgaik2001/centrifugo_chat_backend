import { FastifyInstance } from 'fastify';
import { authRoutes } from './auth';
import { userRoutes } from './users';
import { roomRoutes } from './rooms';
import { messageRoutes } from './messages';
import { fileRoutes } from './files';
import centrifugoRoutes from './centrifugo';
import { healthRoutes } from './health';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  console.log('[Routes] Registering all routes with /api/v1 prefix...');
  
  await app.register(
    async (instance) => {
      console.log('[Routes] Registering health routes...');
      await healthRoutes(instance);
      console.log('[Routes] Registering auth routes...');
      await authRoutes(instance);
      console.log('[Routes] Registering user routes...');
      await userRoutes(instance);
      console.log('[Routes] Registering room routes...');
      await roomRoutes(instance);
      console.log('[Routes] Registering message routes...');
      await messageRoutes(instance);
      console.log('[Routes] Registering file routes...');
      await fileRoutes(instance);
      console.log('[Routes] Registering centrifugo routes...');
      await centrifugoRoutes(instance);
      console.log('[Routes] All routes registered successfully');
    },
    { prefix: '/api/v1' }
  );
  
  console.log('[Routes] Route registration completed');
}
