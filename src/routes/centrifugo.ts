import { FastifyInstance } from 'fastify';
import { centrifugoService } from '../services/centrifugo.service.js';
import { authenticate } from '../middleware/auth.js';
import { z } from 'zod';

const subscriptionTokenSchema = z.object({
  channel: z.string(),
});

export default async function centrifugoRoutes(app: FastifyInstance) {
  /**
   * Get Centrifugo connection token
   */
  app.get(
    '/centrifugo/token',
    {
      preHandler: authenticate,
      schema: {
        tags: ['Centrifugo'],
        summary: 'Get Centrifugo connection token',
        description: 'Generate a JWT token for connecting to Centrifugo WebSocket',
        response: {
          200: {
            type: 'object',
            properties: {
              token: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.userId;
      const token = centrifugoService.generateConnectionToken(userId);
      
      return reply.send({ token });
    }
  );

  /**
   * Get Centrifugo subscription token for a specific channel
   */
  app.post(
    '/centrifugo/subscription-token',
    {
      preHandler: authenticate,
      schema: {
        tags: ['Centrifugo'],
        summary: 'Get Centrifugo subscription token',
        description: 'Generate a JWT token for subscribing to a specific Centrifugo channel',
        body: {
          type: 'object',
          required: ['channel'],
          properties: {
            channel: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              token: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.userId;
      const body = subscriptionTokenSchema.safeParse(request.body);
      
      if (!body.success) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid input' },
        });
      }

      const token = centrifugoService.generateSubscriptionToken(userId, body.data.channel);
      
      return reply.send({ token });
    }
  );
}
