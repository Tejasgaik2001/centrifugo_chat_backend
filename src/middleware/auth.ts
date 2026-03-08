import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '../services/auth.service';
import { getSession } from '../services/redis.service';

export interface AuthUser {
  userId: string;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' },
      });
    }

    const token = authHeader.slice(7);
    const payload = verifyToken(token);

    const session = await getSession(payload.sessionId);
    if (!session) {
      return reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Session expired or revoked' },
      });
    }

    request.user = { userId: payload.userId, sessionId: payload.sessionId };
  } catch {
    return reply.code(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Invalid token' },
    });
  }
}
