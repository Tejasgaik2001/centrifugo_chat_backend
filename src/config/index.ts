import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  MONGODB_URI: z.string(),
  MONGODB_DB_NAME: z.string().default('messaging'),

  REDIS_URL: z.string(),

  ELASTICSEARCH_URL: z.string(),
  ELASTICSEARCH_INDEX: z.string().default('messages'),

  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES: z.string().default('15m') as z.ZodDefault<z.ZodString>,
  JWT_REFRESH_EXPIRES: z.string().default('7d') as z.ZodDefault<z.ZodString>,

  AWS_REGION: z.string().default('us-east-1'),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  CDN_BASE_URL: z.string().optional(),

  SENDGRID_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  KAFKA_BROKERS: z.string().default('localhost:9092'),

  CENTRIFUGO_API_URL: z.string().default('http://localhost:8000/api'),
  CENTRIFUGO_API_KEY: z.string(),
  CENTRIFUGO_TOKEN_HMAC_SECRET: z.string(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[Config] Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const config = {
  port: parseInt(parsed.data.PORT, 10),
  nodeEnv: parsed.data.NODE_ENV,

  mongodb: {
    uri: parsed.data.MONGODB_URI,
    dbName: parsed.data.MONGODB_DB_NAME,
  },

  redis: {
    url: parsed.data.REDIS_URL,
  },

  elasticsearch: {
    url: parsed.data.ELASTICSEARCH_URL,
    index: parsed.data.ELASTICSEARCH_INDEX,
  },

  jwt: {
    secret: parsed.data.JWT_SECRET,
    accessExpires: parsed.data.JWT_ACCESS_EXPIRES,
    refreshExpires: parsed.data.JWT_REFRESH_EXPIRES,
  },

  aws: {
    region: parsed.data.AWS_REGION,
    s3Bucket: parsed.data.AWS_S3_BUCKET,
    accessKeyId: parsed.data.AWS_ACCESS_KEY_ID,
    secretAccessKey: parsed.data.AWS_SECRET_ACCESS_KEY,
    cdnBaseUrl: parsed.data.CDN_BASE_URL,
  },

  email: {
    sendgridApiKey: parsed.data.SENDGRID_API_KEY,
    from: parsed.data.EMAIL_FROM,
  },

  kafka: {
    brokers: parsed.data.KAFKA_BROKERS.split(','),
  },

  centrifugo: {
    apiUrl: parsed.data.CENTRIFUGO_API_URL,
    apiKey: parsed.data.CENTRIFUGO_API_KEY,
    tokenHmacSecret: parsed.data.CENTRIFUGO_TOKEN_HMAC_SECRET,
  },
};
