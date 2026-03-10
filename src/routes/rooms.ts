import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { Room } from '../models/Room';
import { Subscription } from '../models/Subscription';
import { Message } from '../models/Message';
import { User } from '../models/User';
import { authenticate } from '../middleware/auth';

const createRoomSchema = z.object({
  type: z.enum(['p', 'c']),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  memberIds: z.array(z.string()).default([]),
});

const updateRoomSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  topic: z.string().max(200).optional(),
  isReadOnly: z.boolean().optional(),
});

const roomResponseSchema = {
  type: 'object',
  properties: {
    _id: { type: 'string' },
    rid: { type: 'string' },
    name: { type: ['string', 'null'] },
    type: { type: 'string' },
    unread: { type: 'number' },
    usernames: { type: 'array', items: { type: 'string' } },
    memberIds: { type: 'array', items: { type: 'string' } },
    isReadOnly: { type: 'boolean' },
    lastMessage: {
      anyOf: [
        {
          type: 'object',
          properties: {
            id: { type: 'string' },
            msg: { type: 'string' },
            ts: { type: 'string' },
            u: {
              type: 'object',
              properties: {
                _id: { type: 'string' },
                username: { type: 'string' },
              },
            },
          },
        },
        { type: 'null' },
      ],
    },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
};

export async function roomRoutes(app: FastifyInstance): Promise<void> {
  app.get('/rooms', {
    preHandler: [authenticate],
    schema: {
      tags: ['Rooms'],
      summary: 'Get all user rooms',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            rooms: { type: 'array', items: roomResponseSchema },
          },
        },
      },
    },
  }, async (request, reply) => {
    const subscriptions = await Subscription.find({
      'u._id': request.user.userId,
      open: true,
    }).lean();
    const roomIds = subscriptions.map((s) => s.rid);
    const rooms = await Room.find({ _id: { $in: roomIds } }).lean();

    const result = rooms.map((room) => {
      const sub = subscriptions.find((s) => s.rid === room._id.toString());
      return {
        _id: room._id.toString(),
        rid: room._id.toString(),
        name: room.name ?? sub?.name ?? null,
        type: room.type,
        unread: sub?.unread ?? 0,
        usernames: room.usernames ?? [],
        memberIds: room.memberIds ?? [],
        isReadOnly: room.isReadOnly ?? false,
        lastMessage: room.lastMessage ?? null,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
      };
    });

    return reply.send({ rooms: result });
  });

  app.post('/rooms', {
    preHandler: [authenticate],
    schema: {
      tags: ['Rooms'],
      summary: 'Create a new room',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['type', 'name'],
        properties: {
          type: { type: 'string', enum: ['p', 'c'] },
          name: { type: 'string', minLength: 1, maxLength: 100 },
          description: { type: 'string', maxLength: 500 },
          memberIds: { type: 'array', items: { type: 'string' } },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            room: roomResponseSchema,
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = createRoomSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.format() },
      });
    }

    const creator = await User.findById(request.user.userId).lean();
    if (!creator) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const allMemberIds = [...new Set([request.user.userId, ...body.data.memberIds])];
    const members = await User.find({ _id: { $in: allMemberIds } }).lean();

    const roomId = uuidv4();
    const room = await Room.create({
      _id: roomId,
      type: body.data.type,
      name: body.data.name,
      description: body.data.description ?? null,
      memberIds: allMemberIds,
      usernames: members.map((m) => m.username),
      moderatorIds: [request.user.userId],
      memberCount: allMemberIds.length,
      createdBy: request.user.userId,
    });

    const subscriptions = members.map((m) => ({
      _id: uuidv4(),
      rid: roomId,
      u: { _id: m._id, username: m.username },
      name: body.data.name,
    }));
    await Subscription.insertMany(subscriptions);

    // Broadcast room creation to all members via presence channel
    const { centrifugoService } = await import('../services/centrifugo.service.js');
    await centrifugoService.publishToChannel('presence', {
      type: 'room_created',
      room: {
        _id: roomId,
        rid: roomId,
        name: room.name,
        type: room.type,
        memberIds: room.memberIds,
        usernames: room.usernames,
      },
      memberIds: room.memberIds,
    });

    return reply.code(201).send({ room });
  });

  app.get('/rooms/:rid', {
    preHandler: [authenticate],
    schema: {
      tags: ['Rooms'],
      summary: 'Get room by ID',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          rid: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            room: roomResponseSchema,
          },
        },
      },
    },
  }, async (request, reply) => {
    const { rid } = request.params as { rid: string };
    const room = await Room.findOne({ _id: rid, memberIds: request.user.userId }).lean();
    if (!room) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Room not found' } });
    }
    return reply.send({ room });
  });

  app.patch('/rooms/:rid', { preHandler: [authenticate] }, async (request, reply) => {
    const { rid } = request.params as { rid: string };
    const body = updateRoomSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.format() },
      });
    }

    const room = await Room.findOne({ _id: rid, moderatorIds: request.user.userId }).lean();
    if (!room) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Not a moderator' } });
    }

    const updated = await Room.findByIdAndUpdate(rid, body.data, { new: true }).lean();
    return reply.send({ room: updated });
  });

  app.delete('/rooms/:rid', { preHandler: [authenticate] }, async (request, reply) => {
    const { rid } = request.params as { rid: string };
    const room = await Room.findOne({ _id: rid, createdBy: request.user.userId }).lean();
    if (!room) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Not the room creator' } });
    }

    await Room.deleteOne({ _id: rid });
    await Subscription.deleteMany({ rid });
    return reply.code(204).send();
  });

  app.post('/rooms/:rid/members', { preHandler: [authenticate] }, async (request, reply) => {
    const { rid } = request.params as { rid: string };
    const body = z.object({ userIds: z.array(z.string()) }).safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });
    }

    const room = await Room.findById(rid).lean();
    if (!room) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Room not found' } });
    }

    const newMembers = await User.find({ _id: { $in: body.data.userIds } }).lean();
    await Room.updateOne(
      { _id: rid },
      {
        $addToSet: {
          memberIds: { $each: body.data.userIds },
          usernames: { $each: newMembers.map((m) => m.username) },
        },
        $inc: { memberCount: newMembers.length },
      }
    );

    const subscriptions = newMembers.map((m) => ({
      _id: uuidv4(),
      rid,
      u: { _id: m._id, username: m.username },
      name: room.name ?? '',
    }));
    await Subscription.insertMany(subscriptions, { ordered: false }).catch(() => {});

    return reply.send({ success: true });
  });

  app.delete('/rooms/:rid/members/:userId', { preHandler: [authenticate] }, async (request, reply) => {
    const { rid, userId } = request.params as { rid: string; userId: string };
    const room = await Room.findOne({ _id: rid, moderatorIds: request.user.userId }).lean();
    if (!room) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Not a moderator' } });
    }

    const member = await User.findById(userId).lean();
    if (!member) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    await Room.updateOne(
      { _id: rid },
      {
        $pull: { memberIds: userId, usernames: member.username },
        $inc: { memberCount: -1 },
      }
    );
    await Subscription.deleteOne({ rid, 'u._id': userId });

    return reply.code(204).send();
  });

  app.get('/rooms/dm/:username', {
    preHandler: [authenticate],
    schema: {
      tags: ['Rooms'],
      summary: 'Get or create DM with user',
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
            room: { type: 'object' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { username } = request.params as { username: string };
    const targetUser = await User.findOne({ username }).lean();
    if (!targetUser) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const existingRoom = await Room.findOne({
      type: 'd',
      memberIds: { $all: [request.user.userId, targetUser._id] },
    }).lean();

    if (existingRoom) return reply.send({ room: existingRoom });

    const requestingUser = await User.findById(request.user.userId).lean();
    if (!requestingUser) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const roomId = uuidv4();
    const room = await Room.create({
      _id: roomId,
      type: 'd',
      memberIds: [request.user.userId, targetUser._id.toString()],
      usernames: [requestingUser.username, targetUser.username],
      memberCount: 2,
      createdBy: request.user.userId,
    });

    await Subscription.insertMany([
      {
        _id: uuidv4(),
        rid: roomId,
        u: { _id: requestingUser._id, username: requestingUser.username },
        name: targetUser.username,
      },
      {
        _id: uuidv4(),
        rid: roomId,
        u: { _id: targetUser._id, username: targetUser.username },
        name: requestingUser.username,
      },
    ]);

    // Broadcast room creation to both members via presence channel
    const { centrifugoService } = await import('../services/centrifugo.service.js');
    await centrifugoService.publishToChannel('presence', {
      type: 'room_created',
      room: {
        _id: roomId,
        rid: roomId,
        name: null,
        type: 'd',
        memberIds: [requestingUser._id.toString(), targetUser._id.toString()],
        usernames: [requestingUser.username, targetUser.username],
      },
      memberIds: [requestingUser._id.toString(), targetUser._id.toString()],
    });

    return reply.code(201).send({ room });
  });

  app.post('/rooms/:rid/read', { preHandler: [authenticate] }, async (request, reply) => {
    const { rid } = request.params as { rid: string };
    
    await Subscription.updateOne(
      { rid, 'u._id': request.user.userId },
      { unread: 0, userMentions: 0, ls: new Date() }
    );

    await Message.updateMany(
      { rid, 'u._id': { $ne: request.user.userId }, readBy: { $ne: request.user.userId } },
      { $addToSet: { readBy: request.user.userId } }
    );

    // Broadcast read receipt
    const lastMessage = await Message.findOne({ rid }).sort({ ts: -1 }).lean();
    if (lastMessage) {
      const { centrifugoService } = await import('../services/centrifugo.service');
      await centrifugoService.publishReadReceipt(rid, request.user.userId, lastMessage._id.toString());
    }

    return reply.send({ success: true });
  });

  app.get('/rooms/:rid/pinned', { preHandler: [authenticate] }, async (request, reply) => {
    const { rid } = request.params as { rid: string };
    const room = await Room.findById(rid).lean();
    if (!room) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Room not found' } });
    }

    const messages = await Message.find({ _id: { $in: room.pinnedMessages } }).lean();
    return reply.send({ messages });
  });
}
