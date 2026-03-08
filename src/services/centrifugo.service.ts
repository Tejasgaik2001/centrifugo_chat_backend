import axios from 'axios';
import { config } from '../config/index.js';

interface PublishData {
  type: 'message' | 'read_receipt' | 'typing_start' | 'typing_stop' | 'message_update' | 'message_delete';
  [key: string]: any;
}

interface PublishOptions {
  channel: string;
  data: PublishData;
}

class CentrifugoService {
  private apiUrl: string;
  private apiKey: string;

  constructor() {
    this.apiUrl = config.centrifugo.apiUrl;
    this.apiKey = config.centrifugo.apiKey;
  }

  /**
   * Publish an event to a Centrifugo channel
   */
  async publish(options: PublishOptions): Promise<void> {
    try {
      const response = await axios.post(
        `${this.apiUrl}/publish`,
        {
          channel: options.channel,
          data: options.data,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
          },
        }
      );

      console.log(`[Centrifugo] Published to channel: ${options.channel}`, {
        type: options.data.type,
        success: response.status === 200,
      });
    } catch (error: any) {
      console.error(`[Centrifugo] Failed to publish to channel: ${options.channel}`, {
        error: error.message,
        response: error.response?.data,
      });
      // Don't throw - we don't want to break the main flow if Centrifugo is down
    }
  }

  /**
   * Publish a new message event
   */
  async publishMessage(roomId: string, message: any): Promise<void> {
    await this.publish({
      channel: `room:${roomId}`,
      data: {
        type: 'message',
        messageId: message._id,
        text: message.msg,
        senderId: message.u._id,
        senderUsername: message.u.username,
        roomId: roomId,
        createdAt: message.ts,
        attachments: message.attachments || [],
        tmid: message.tmid,
      },
    });
  }

  /**
   * Publish a message update event
   */
  async publishMessageUpdate(roomId: string, message: any): Promise<void> {
    await this.publish({
      channel: `room:${roomId}`,
      data: {
        type: 'message_update',
        messageId: message._id,
        text: message.msg,
        editedAt: message.editedAt,
        roomId: roomId,
      },
    });
  }

  /**
   * Publish a message delete event
   */
  async publishMessageDelete(roomId: string, messageId: string): Promise<void> {
    await this.publish({
      channel: `room:${roomId}`,
      data: {
        type: 'message_delete',
        messageId: messageId,
        roomId: roomId,
      },
    });
  }

  /**
   * Publish a typing start event
   */
  async publishTypingStart(roomId: string, userId: string, username: string): Promise<void> {
    await this.publish({
      channel: `room:${roomId}`,
      data: {
        type: 'typing_start',
        userId: userId,
        username: username,
        roomId: roomId,
      },
    });
  }

  /**
   * Publish a typing stop event
   */
  async publishTypingStop(roomId: string, userId: string, username: string): Promise<void> {
    await this.publish({
      channel: `room:${roomId}`,
      data: {
        type: 'typing_stop',
        userId: userId,
        username: username,
        roomId: roomId,
      },
    });
  }

  /**
   * Publish a read receipt event
   */
  async publishReadReceipt(roomId: string, userId: string, lastReadMessageId: string): Promise<void> {
    await this.publish({
      channel: `room:${roomId}`,
      data: {
        type: 'read_receipt',
        userId: userId,
        roomId: roomId,
        lastReadMessageId: lastReadMessageId,
      },
    });
  }

  /**
   * Generate a connection token for a user
   * This token is used by clients to authenticate with Centrifugo
   */
  generateConnectionToken(userId: string): string {
    const jwt = require('jsonwebtoken');
    const now = Math.floor(Date.now() / 1000);
    
    const claims = {
      sub: userId,
      exp: now + 3600, // Token expires in 1 hour
      iat: now,
    };
    
    return jwt.sign(claims, config.centrifugo.tokenHmacSecret);
  }

  /**
   * Generate a subscription token for a user to subscribe to a specific channel
   */
  generateSubscriptionToken(userId: string, channel: string): string {
    const jwt = require('jsonwebtoken');
    const now = Math.floor(Date.now() / 1000);
    
    const claims = {
      sub: userId,
      channel: channel,
      exp: now + 3600, // Token expires in 1 hour
      iat: now,
    };
    
    return jwt.sign(claims, config.centrifugo.tokenHmacSecret);
  }
}

export const centrifugoService = new CentrifugoService();
