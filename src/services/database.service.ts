import mongoose from 'mongoose';
import { config } from '../config';

export async function connectDatabase(): Promise<void> {
  mongoose.connection.on('connected', () => {
    console.log('[MongoDB] Connected');
  });
  mongoose.connection.on('error', (err) => {
    console.error('[MongoDB] Error:', err);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[MongoDB] Disconnected');
  });

  await mongoose.connect(config.mongodb.uri, {
    dbName: config.mongodb.dbName,
  });
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
