import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /files/upload
   * Accepts multipart form-data with a single field "file".
   * Returns { url, name, size, mimeType, type }
   */
  app.post('/files/upload', {
    preHandler: [authenticate],
    schema: {
      tags: ['Files'],
      summary: 'Upload an image or video attachment',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            name: { type: 'string' },
            size: { type: 'number' },
            mimeType: { type: 'string' },
            type: { type: 'string', enum: ['image', 'video'] },
          },
        },
      },
    },
  }, async (request, reply) => {
    // Cast to any to access multipart methods added by @fastify/multipart plugin
    const req = request as any;
    
    let data: any;
    try {
      data = await req.file();
    } catch {
      return reply.code(400).send({ error: { code: 'NO_FILE', message: 'No file uploaded' } });
    }
    
    if (!data) {
      return reply.code(400).send({ error: { code: 'NO_FILE', message: 'No file uploaded' } });
    }

    const { filename, mimetype, file } = data;

    if (!ALLOWED_MIME.has(mimetype)) {
      file.resume();
      return reply.code(400).send({
        error: { code: 'INVALID_TYPE', message: 'Only images and videos are allowed' },
      });
    }

    // Sanitize filename and add timestamp to avoid collisions
    const safeName = (filename || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueName = `${Date.now()}_${safeName}`;
    const filePath = path.join(UPLOAD_DIR, uniqueName);

    let bytesWritten = 0;
    let tooLarge = false;
    const writeStream = fs.createWriteStream(filePath);

    file.on('data', (chunk: Buffer) => {
      bytesWritten += chunk.length;
      if (bytesWritten > MAX_FILE_SIZE) {
        tooLarge = true;
        file.destroy();
        writeStream.destroy();
        fs.unlink(filePath, () => {});
      }
    });

    try {
      await pipeline(file, writeStream);
    } catch {
      fs.unlink(filePath, () => {});
      if (tooLarge) {
        return reply.code(413).send({ error: { code: 'TOO_LARGE', message: 'File exceeds 50 MB limit' } });
      }
      return reply.code(500).send({ error: { code: 'UPLOAD_FAILED', message: 'File upload failed' } });
    }

    const fileType = mimetype.startsWith('image/') ? 'image' : 'video';
    const url = `/uploads/${uniqueName}`;

    return reply.send({
      url,
      name: safeName,
      size: bytesWritten,
      mimeType: mimetype,
      type: fileType,
    });
  });
}
