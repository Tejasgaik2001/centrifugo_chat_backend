import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { User } from '../models/User';
import { authenticate } from '../middleware/auth';
import { broadcastPresenceChange } from '../services/redis.service';

const updateProfileSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  avatar: z.string().url().optional(),
  statusText: z.string().max(100).optional(),
  status: z.enum(['online', 'away', 'dnd', 'offline']).optional(),
});

const setStatusSchema = z.object({
  status: z.enum(['online', 'away', 'dnd', 'offline']),
});

const presenceQuerySchema = z.object({
  userIds: z.string().optional(), // Comma-separated user IDs
});

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get('/users/me', {
    preHandler: [authenticate],
    schema: {
      tags: ['Users'],
      summary: 'Get current user profile',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            username: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
            avatar: { type: 'string' },
            status: { type: 'string' },
            statusText: { type: 'string' },
            lastSeen: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const user = await User.findById(request.user.userId).lean();
    if (!user) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    return reply.send(user);
  });

  app.patch('/users/me', {
    preHandler: [authenticate],
    schema: {
      tags: ['Users'],
      summary: 'Update current user profile',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 64 },
          avatar: { type: 'string', format: 'uri' },
          statusText: { type: 'string', maxLength: 100 },
          status: { type: 'string', enum: ['online', 'away', 'dnd'] },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            username: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
            avatar: { type: 'string' },
            status: { type: 'string' },
            statusText: { type: 'string' },
            lastSeen: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = updateProfileSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.format() },
      });
    }

    const user = await User.findByIdAndUpdate(request.user.userId, body.data, { new: true }).lean();
    return reply.send(user);
  });

  app.get('/users/me/blocked', {
    preHandler: [authenticate],
    schema: {
      tags: ['Users'],
      summary: 'Get blocked users',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            blockedUsers: { type: 'array', items: { type: 'object' } },
          },
        },
      },
    },
  }, async (request, reply) => {
    const user = await User.findById(request.user.userId).lean();
    if (!user) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const blockedUsers = await User.find({ _id: { $in: user.blockedUsers } })
      .select('_id username name avatar')
      .lean();

    return reply.send({ blockedUsers });
  });

  app.get('/users/search', {
    preHandler: [authenticate],
    schema: {
      tags: ['Users'],
      summary: 'Search users',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          limit: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            users: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  _id: { type: 'string' },
                  username: { type: 'string' },
                  name: { type: 'string' },
                  avatar: { type: 'string' },
                  status: { type: 'string' },
                  statusText: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { q, limit = '10' } = request.query as { q?: string; limit?: string };
    if (!q) return reply.send({ users: [] });

    const users = await User.find({
      _id: { $ne: request.user.userId },
      $or: [
        { username: { $regex: `^${q}`, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
      ],
    })
      .limit(parseInt(limit, 10))
      .select('_id username name avatar status statusText')
      .lean();

    return reply.send({ users });
  });

  app.get('/users/:username', {
    preHandler: [authenticate],
    schema: {
      tags: ['Users'],
      summary: 'Get user by username',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          username: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            username: { type: 'string' },
            name: { type: 'string' },
            avatar: { type: 'string' },
            status: { type: 'string' },
            statusText: { type: 'string' },
            lastSeen: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { username } = request.params as { username: string };
    const user = await User.findOne({ username })
      .select('_id username name avatar status statusText lastSeen')
      .lean();
    if (!user) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    return reply.send(user);
  });

  app.post('/users/block', {
    preHandler: [authenticate],
    schema: {
      tags: ['Users'],
      summary: 'Block a user',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = z.object({ userId: z.string() }).safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });
    }

    await User.updateOne(
      { _id: request.user.userId },
      { $addToSet: { blockedUsers: body.data.userId } }
    );
    return reply.send({ success: true });
  });

  app.delete('/users/block/:userId', {
    preHandler: [authenticate],
    schema: {
      tags: ['Users'],
      summary: 'Unblock a user',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    await User.updateOne({ _id: request.user.userId }, { $pull: { blockedUsers: userId } });
    return reply.send({ success: true });
  });

  app.post('/users/me/status', {
    preHandler: [authenticate],
    schema: {
      tags: ['Users'],
      summary: 'Update user status',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['online', 'away', 'dnd', 'offline'] },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            status: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = setStatusSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.format() },
      });
    }

    const { status } = body.data;
    const user = await User.findById(request.user.userId).lean();
    
    if (!user) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    // Update status in database
    await User.updateOne(
      { _id: request.user.userId },
      { 
        status: status as 'online' | 'offline' | 'away' | 'dnd',
        lastSeen: new Date()
      }
    );

    // Broadcast status change
    await broadcastPresenceChange(request.user.userId, status, user.username);

    return reply.send({ success: true, status });
  });

  app.get('/users/presence', {
    preHandler: [authenticate],
    schema: {
      tags: ['Users'],
      summary: 'Get presence status of users',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          userIds: { type: 'string', description: 'Comma-separated user IDs' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            users: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  userId: { type: 'string' },
                  status: { type: 'string', enum: ['online', 'offline', 'away', 'dnd'] },
                  lastSeen: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { userIds } = request.query as { userIds?: string };
    
    let userIdList: string[] = [];
    if (userIds) {
      userIdList = userIds.split(',').map(id => id.trim()).filter(id => id);
    } else {
      // If no userIds provided, return all users (with pagination in production)
      const allUsers = await User.find({}).select('_id username status lastSeen').lean();
      const presenceData = allUsers.map((user) => ({
        userId: user._id,
        username: user.username,
        status: user.status || 'offline',
        lastSeen: user.lastSeen,
      }));
      return reply.send({ users: presenceData });
    }

    // Get presence for specific users
    const users = await User.find({ _id: { $in: userIdList } }).select('_id username status lastSeen').lean();
    const presenceData = users.map((user) => ({
      userId: user._id,
      username: user.username,
      status: user.status || 'offline',
      lastSeen: user.lastSeen,
    }));

    return reply.send({ users: presenceData });
  });
}
