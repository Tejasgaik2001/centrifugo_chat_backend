import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { storeSession, deleteSession, getSession } from './redis.service';

const BCRYPT_COST = 12;

export interface TokenPayload {
  userId: string;
  sessionId: string;
  iat?: number;
  exp?: number;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.accessExpires as string,
  } as jwt.SignOptions);
}

export function generateRefreshToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.refreshExpires as string,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwt.secret) as TokenPayload;
}

export async function createSession(
  userId: string,
  meta: { device?: string; ip?: string }
): Promise<{ sessionId: string; accessToken: string; refreshToken: string }> {
  const sessionId = uuidv4();
  const payload = { userId, sessionId };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await storeSession(sessionId, {
    userId,
    ...meta,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  });

  return { sessionId, accessToken, refreshToken };
}

export async function refreshSession(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const payload = verifyToken(refreshToken);
  const session = await getSession(payload.sessionId);
  if (!session) {
    throw new Error('Session not found or expired');
  }

  const newSessionId = uuidv4();
  await deleteSession(payload.sessionId);

  const newPayload = { userId: payload.userId, sessionId: newSessionId };
  const newAccessToken = generateAccessToken(newPayload);
  const newRefreshToken = generateRefreshToken(newPayload);

  await storeSession(newSessionId, {
    ...session,
    lastUsedAt: new Date().toISOString(),
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await deleteSession(sessionId);
}
