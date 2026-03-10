import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { Message } from '../models/Message';
import { Room } from '../models/Room';
import { Subscription } from '../models/Subscription';
import { User } from '../models/User';
import { authenticate } from '../middleware/auth';
import { publishToRoom } from '../services/redis.service';
import { centrifugoService } from '../services/centrifugo.service.js';

const sendMessageSchema = z.object({
  rid: z.string(),
  msg: z.string().max(10000),
  tmid: z.string().optional(),
});

const editMessageSchema = z.object({
  msg: z.string().max(10000),
});

const messageResponseSchema = {
  type: 'object',
  properties: {
    _id: { type: 'string' },
    rid: { type: 'string' },
    msg: { type: 'string' },
    u: {
      type: 'object',
      properties: {
        _id: { type: 'string' },
        username: { type: 'string' },
      },
    },
    ts: { type: 'string' },
    editedAt: { type: ['string', 'null'] },
    editedBy: {
      type: ['object', 'null'],
      properties: {
        _id: { type: 'string' },
        username: { type: 'string' },
      },
    },
    isDeleted: { type: 'boolean' },
    tmid: { type: ['string', 'null'] },
    tcount: { type: 'number' },
    mentions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          username: { type: 'string' },
          type: { type: 'string' },
        },
      },
    },
  },
};

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  app.get('/rooms/:rid/messages', {
    preHandler: [authenticate],
    schema: {
      tags: ['Messages'],
      summary: 'Get messages in a room',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          rid: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'string' },
          before: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            messages: { type: 'array', items: messageResponseSchema },
            total: { type: 'number' },
            hasMore: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { rid } = request.params as { rid: string };
    const { limit = '50', before } = request.query as { limit?: string; before?: string };

    const subscription = await Subscription.findOne({
      rid,
      'u._id': request.user.userId,
      open: true,
    }).lean();
    if (!subscription) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Not a member of this room' } });
    }

    const query: Record<string, unknown> = { rid, isDeleted: false };
    if (before) {
      const refMessage = await Message.findById(before).lean();
      if (refMessage) query.ts = { $lt: refMessage.ts };
    }

    const limitNum = Number.parseInt(limit, 10);
    const messages = await Message.find(query).sort({ ts: -1 }).limit(limitNum).lean();
    const total = await Message.countDocuments({ rid, isDeleted: false });

    return reply.send({
      messages: messages.toReversed(),
      total,
      hasMore: messages.length === limitNum,
    });
  });

  app.post('/messages', {
    preHandler: [authenticate],
    schema: {
      tags: ['Messages'],
      summary: 'Send a message',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['rid', 'msg'],
        properties: {
          rid: { type: 'string' },
          msg: { type: 'string', maxLength: 10000 },
          tmid: { type: 'string' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            message: messageResponseSchema,
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = sendMessageSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.format() },
      });
    }

    const { rid, msg, tmid } = body.data;

    const subscription = await Subscription.findOne({
      rid,
      'u._id': request.user.userId,
      open: true,
    }).lean();
    if (!subscription) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Not a member of this room' } });
    }

    const room = await Room.findById(rid).lean();
    if (!room) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Room not found' } });
    }

    if (room.isReadOnly && !room.moderatorIds.includes(request.user.userId)) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Room is read-only' } });
    }

    const sender = await User.findById(request.user.userId).lean();
    if (!sender) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const mentions: Array<{ _id: string; username: string; type: 'user' | 'here' | 'all' }> = [];
    if (msg.includes('@here')) mentions.push({ _id: 'here', username: 'here', type: 'here' });
    if (msg.includes('@all')) mentions.push({ _id: 'all', username: 'all', type: 'all' });

    const userMentionRegex = /@([a-z0-9_]+)/gi;
    const userMentionMatches = [...msg.matchAll(userMentionRegex)].map((m) => m[1]);
    if (userMentionMatches.length > 0) {
      const mentionedUsers = await User.find({ username: { $in: userMentionMatches } }).lean();
      for (const mu of mentionedUsers) {
        mentions.push({ _id: mu._id.toString(), username: mu.username, type: 'user' });
      }
    }

    const messageId = uuidv4();
    const message = await Message.create({
      _id: messageId,
      rid,
      u: { _id: sender._id, username: sender.username },
      msg,
      tmid: tmid ?? null,
      mentions,
      ts: new Date(),
    });

    await Room.updateOne(
      { _id: rid },
      {
        lastMessage: {
          id: messageId,
          msg: msg.substring(0, 80),
          ts: message.ts,
          u: { _id: sender._id, username: sender.username },
        },
      }
    );

    await Subscription.updateMany(
      { rid, 'u._id': { $ne: request.user.userId } },
      { $inc: { unread: 1 } }
    );

    if (tmid) {
      await Message.updateOne({ _id: tmid }, { $inc: { tcount: 1 }, tlm: new Date() });
    }

    await publishToRoom(rid, { type: 'message_new', roomId: rid, message });

    // Publish to Centrifugo for real-time WebSocket delivery
    await centrifugoService.publishMessage(rid, message);

    return reply.code(201).send({ message });
  });

  app.patch('/messages/:id', {
    preHandler: [authenticate],
    schema: {
      tags: ['Messages'],
      summary: 'Edit a message',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['msg'],
        properties: {
          msg: { type: 'string', maxLength: 10000 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: messageResponseSchema,
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = editMessageSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });
    }

    const message = await Message.findOne({
      _id: id,
      'u._id': request.user.userId,
      isDeleted: false,
    }).lean();
    if (!message) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Message not found' } });
    }

    const sender = await User.findById(request.user.userId).lean();
    const updated = await Message.findByIdAndUpdate(
      id,
      {
        msg: body.data.msg,
        editedAt: new Date(),
        editedBy: { _id: request.user.userId, username: sender!.username },
      },
      { new: true }
    ).lean();

    await publishToRoom(message.rid, { type: 'message_updated', roomId: message.rid, message: updated });

    // Publish to Centrifugo for real-time WebSocket delivery
    await centrifugoService.publishMessageUpdate(message.rid, updated);

    return reply.send({ message: updated });
  });

  app.delete('/messages/:id', {
    preHandler: [authenticate],
    schema: {
      tags: ['Messages'],
      summary: 'Delete a message',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      response: {
        204: { type: 'null' },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const message = await Message.findById(id).lean();
    if (!message || message.isDeleted) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Message not found' } });
    }

    const room = await Room.findById(message.rid).lean();
    const isOwner = message.u._id === request.user.userId;
    const isMod = room?.moderatorIds.includes(request.user.userId) ?? false;

    if (!isOwner && !isMod) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Cannot delete this message' } });
    }

    const sender = await User.findById(request.user.userId).lean();
    await Message.updateOne(
      { _id: id },
      {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: { _id: request.user.userId, username: sender!.username },
      }
    );

    await publishToRoom(message.rid, { type: 'message_deleted', roomId: message.rid, messageId: id });

    // Publish to Centrifugo for real-time WebSocket delivery
    await centrifugoService.publishMessageDelete(message.rid, id);

    return reply.code(204).send();
  });

  app.post('/messages/:id/pin', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const message = await Message.findById(id).lean();
    if (!message) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Message not found' } });
    }

    const room = await Room.findOne({ _id: message.rid, moderatorIds: request.user.userId }).lean();
    if (!room) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Not a moderator' } });
    }

    const sender = await User.findById(request.user.userId).lean();
    await Message.updateOne(
      { _id: id },
      { pinnedAt: new Date(), pinnedBy: { _id: request.user.userId, username: sender!.username } }
    );
    await Room.updateOne({ _id: message.rid }, { $addToSet: { pinnedMessages: id } });

    return reply.send({ success: true });
  });

  app.delete('/messages/:id/pin', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const message = await Message.findById(id).lean();
    if (!message) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Message not found' } });
    }

    const room = await Room.findOne({ _id: message.rid, moderatorIds: request.user.userId }).lean();
    if (!room) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Not a moderator' } });
    }

    await Message.updateOne({ _id: id }, { pinnedAt: null, pinnedBy: null });
    await Room.updateOne({ _id: message.rid }, { $pull: { pinnedMessages: id } });

    return reply.send({ success: true });
  });

  app.get('/rooms/:rid/threads', { preHandler: [authenticate] }, async (request, reply) => {
    const { rid } = request.params as { rid: string };
    const messages = await Message.find({ rid, tcount: { $gt: 0 }, isDeleted: false })
      .sort({ tlm: -1 })
      .lean();
    return reply.send({ messages });
  });

  app.get('/messages/:id/thread', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const replies = await Message.find({ tmid: id, isDeleted: false }).sort({ ts: 1 }).lean();
    return reply.send({ messages: replies });
  });

  app.post('/messages/:id/read', {
    preHandler: [authenticate],
    schema: {
      tags: ['Messages'],
      summary: 'Mark a message as read',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
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
    const { id } = request.params as { id: string };
    const message = await Message.findById(id).lean();
    
    if (!message) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Message not found' } });
    }

    if (message.u._id === request.user.userId) {
      return reply.send({ success: true });
    }

    const subscription = await Subscription.findOne({
      rid: message.rid,
      'u._id': request.user.userId,
      open: true,
    }).lean();
    
    if (!subscription) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Not a member of this room' } });
    }

    await Message.updateOne(
      { _id: id },
      { $addToSet: { readBy: request.user.userId } }
    );

    await centrifugoService.publishReadReceipt(message.rid, request.user.userId, id);

    return reply.send({ success: true });
  });

  // Add reaction to message
  app.post('/messages/:id/reactions', {
    preHandler: [authenticate],
    schema: {
      tags: ['Messages'],
      summary: 'Add reaction to message',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['emoji'],
        properties: {
          emoji: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            reaction: {
              type: 'object',
              properties: {
                emoji: { type: 'string' },
                userIds: { type: 'array', items: { type: 'string' } },
                count: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { emoji } = request.body as { emoji: string };
    
    const message = await Message.findById(id);
    if (!message) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Message not found' } });
    }

    // Check if user is member of the room
    const subscription = await Subscription.findOne({
      rid: message.rid,
      'u._id': request.user.userId,
      open: true,
    }).lean();
    
    if (!subscription) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Not a member of this room' } });
    }

    // Initialize reactions map if it doesn't exist
    if (!message.reactions) {
      message.reactions = {};
    }

    // Add or update reaction
    const reactions = new Map(Object.entries(message.reactions || {}));
    const existingReaction = reactions.get(emoji);
    
    if (existingReaction) {
      if (!existingReaction.userIds.includes(request.user.userId)) {
        existingReaction.userIds.push(request.user.userId);
        existingReaction.count = existingReaction.userIds.length;
        reactions.set(emoji, existingReaction);
      }
    } else {
      reactions.set(emoji, {
        emoji,
        userIds: [request.user.userId],
        count: 1,
      });
    }

    await message.save();

    // Broadcast reaction add event
    await centrifugoService.publishToChannel(`room:${message.rid}`, {
      type: 'reaction_add',
      messageId: id,
      roomId: message.rid,
      emoji,
      userId: request.user.userId,
      reaction: reactions.get(emoji),
    });

    return reply.send({ success: true, reaction: reactions.get(emoji) });
  });

  // Remove reaction from message
  app.delete('/messages/:id/reactions/:emoji', {
    preHandler: [authenticate],
    schema: {
      tags: ['Messages'],
      summary: 'Remove reaction from message',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          emoji: { type: 'string' },
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
    const { id, emoji } = request.params as { id: string; emoji: string };
    
    const message = await Message.findById(id);
    if (!message) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Message not found' } });
    }

    // Check if user is member of the room
    const subscription = await Subscription.findOne({
      rid: message.rid,
      'u._id': request.user.userId,
      open: true,
    }).lean();
    
    if (!subscription) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Not a member of this room' } });
    }

    const reactions = new Map(Object.entries(message.reactions || {}));
    const existingReaction = reactions.get(emoji);
    
    if (existingReaction) {
      const userIndex = existingReaction.userIds.indexOf(request.user.userId);
      if (userIndex > -1) {
        existingReaction.userIds.splice(userIndex, 1);
        existingReaction.count = existingReaction.userIds.length;
        
        if (existingReaction.count === 0) {
          reactions.delete(emoji);
        } else {
          reactions.set(emoji, existingReaction);
        }
        
        await message.save();

        // Broadcast reaction remove event
        await centrifugoService.publishToChannel(`room:${message.rid}`, {
          type: 'reaction_remove',
          messageId: id,
          roomId: message.rid,
          emoji,
          userId: request.user.userId,
          reaction: existingReaction.count > 0 ? existingReaction : null,
        });
      }
    }

    return reply.send({ success: true });
  });
}
