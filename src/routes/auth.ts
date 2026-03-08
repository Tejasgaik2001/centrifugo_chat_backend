import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { authenticator } from 'otplib';
import qrcode from 'qrcode';
import { User } from '../models/User';
import {
  hashPassword,
  verifyPassword,
  createSession,
  refreshSession,
  revokeSession,
} from '../services/auth.service';
import { authenticate } from '../middleware/auth';
import { getRedis } from '../services/redis.service';

const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(64),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  mfaCode: z.string().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

const mfaVerifySchema = z.object({
  code: z.string().length(6),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', {
    schema: {
      tags: ['Auth'],
      summary: 'Register a new user',
      body: {
        type: 'object',
        required: ['username', 'email', 'password', 'name'],
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 32, pattern: '^[a-z0-9_]+$' },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8, maxLength: 128 },
          name: { type: 'string', minLength: 1, maxLength: 64 },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                _id: { type: 'string' },
                username: { type: 'string' },
                name: { type: 'string' },
                email: { type: 'string' },
              },
            },
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = registerSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.format() },
      });
    }

    const { username, email, password, name } = body.data;

    const existing = await User.findOne({ $or: [{ username }, { email }] }).lean();
    if (existing) {
      return reply.code(409).send({
        error: { code: 'CONFLICT', message: 'Username or email already taken' },
      });
    }

    const passwordHash = await hashPassword(password);
    const userId = uuidv4();

    const user = await User.create({
      _id: userId,
      username,
      name,
      email,
      passwordHash,
    });

    const { accessToken, refreshToken } = await createSession(userId, { ip: request.ip });
    await User.updateOne({ _id: userId }, { status: 'online', lastSeen: new Date() });

    return reply.code(201).send({
      user: { _id: user._id, username: user.username, name: user.name, email: user.email },
      accessToken,
      refreshToken,
    });
  });

  app.post('/auth/login', {
    schema: {
      tags: ['Auth'],
      summary: 'Login user',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
          mfaCode: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                _id: { type: 'string' },
                username: { type: 'string' },
                name: { type: 'string' },
                email: { type: 'string' },
                status: { type: 'string' },
              },
            },
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.format() },
      });
    }

    const { email, password, mfaCode } = body.data;

    const user = await User.findOne({ email }).select('+passwordHash +mfaSecret').lean();
    if (!user) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
    }

    if (user.mfaEnabled) {
      if (!mfaCode) {
        return reply.code(403).send({
          error: { code: 'MFA_REQUIRED', message: 'MFA required', mfaRequired: true },
        });
      }
      const isValidMfa = authenticator.verify({ token: mfaCode, secret: user.mfaSecret! });
      if (!isValidMfa) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid MFA code' } });
      }
    }

    const { accessToken, refreshToken } = await createSession(user._id as string, { ip: request.ip });
    await User.updateOne({ _id: user._id }, { status: 'online', lastSeen: new Date() });

    return reply.send({
      user: { _id: user._id, username: user.username, name: user.name, email: user.email, status: 'online' },
      accessToken,
      refreshToken,
    });
  });

  app.post('/auth/refresh', {
    schema: {
      tags: ['Auth'],
      summary: 'Refresh access token',
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = refreshSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });
    }

    try {
      const tokens = await refreshSession(body.data.refreshToken);
      return reply.send(tokens);
    } catch {
      return reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired refresh token' },
      });
    }
  });

  app.post('/auth/logout', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Logout user',
      security: [{ bearerAuth: [] }],
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
    await revokeSession(request.user.sessionId);
    await User.updateOne({ _id: request.user.userId }, { status: 'offline', lastSeen: new Date() });
    return reply.send({ success: true });
  });

  app.get('/auth/sessions', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Get all user sessions',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            sessions: { type: 'array', items: { type: 'object' } },
          },
        },
      },
    },
  }, async (request, reply) => {
    const redis = getRedis();
    const keys = await redis.keys('session:*');
    const sessions = [];

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const session = JSON.parse(data) as Record<string, unknown>;
        if (session.userId === request.user.userId) {
          sessions.push({ id: key.replace('session:', ''), ...session });
        }
      }
    }

    return reply.send({ sessions });
  });

  app.delete('/auth/sessions/:sessionId', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Delete a session',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
        },
      },
      response: {
        204: { type: 'null' },
      },
    },
  }, async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    await revokeSession(sessionId);
    return reply.code(204).send();
  });

  app.post('/auth/mfa/enable', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Enable MFA for user',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            qrCodeUrl: { type: 'string' },
            secret: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const secret = authenticator.generateSecret();
    const user = await User.findById(request.user.userId).lean();
    if (!user) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const otpauth = authenticator.keyuri(user.email, 'MessagingApp', secret);
    const qrCodeUrl = await qrcode.toDataURL(otpauth);
    await User.updateOne({ _id: request.user.userId }, { mfaSecret: secret });

    return reply.send({ qrCodeUrl, secret });
  });

  app.post('/auth/mfa/verify', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Verify MFA code',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string', minLength: 6, maxLength: 6 },
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
    const body = mfaVerifySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });
    }

    const user = await User.findById(request.user.userId).select('+mfaSecret').lean();
    if (!user?.mfaSecret) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'MFA not set up' } });
    }

    const isValid = authenticator.verify({ token: body.data.code, secret: user.mfaSecret });
    if (!isValid) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid MFA code' } });
    }

    await User.updateOne({ _id: request.user.userId }, { mfaEnabled: true });
    return reply.send({ success: true });
  });
}
