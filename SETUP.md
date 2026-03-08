# Backend Setup Guide

## ✅ Completed

Phase 1 backend foundation is complete with:

- **Project Structure**: Full TypeScript setup with ES2022 modules
- **Data Models**: All 10 Mongoose schemas (User, Room, Message, Subscription, Notification, PushToken, File, Poll, Bookmark, Report)
- **Authentication**: JWT + bcrypt + MFA (TOTP) with session management
- **API Routes**: Complete REST endpoints for auth, users, rooms, and messages
- **WebSocket**: Real-time messaging with room subscriptions, typing indicators, presence
- **Services**: Database, Redis, and auth service layers
- **Security**: Helmet, CORS, rate limiting (600 req/min)
- **API Documentation**: Full Swagger/OpenAPI docs at `/docs`
- **Infrastructure**: Docker Compose for MongoDB, Redis, Elasticsearch, Kafka

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:
```env
NODE_ENV=development
PORT=3000

MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=messaging

REDIS_URL=redis://localhost:6379

JWT_SECRET=your-super-secret-jwt-key-min-32-chars-long-please
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_INDEX=messages
```

### 3. Start Infrastructure

```bash
docker-compose up -d
```

This starts:
- MongoDB on port 27017
- Redis on port 6379
- Elasticsearch on port 9200
- Kafka + Zookeeper

### 4. Run the Server

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm run build
npm start
```

## 📚 API Documentation

Once running, visit:
- **Swagger UI**: http://localhost:3000/docs
- **Health**: http://localhost:3000/health
- **Ready**: http://localhost:3000/ready

## 🔑 Authentication Flow

1. **Register**: `POST /api/v1/auth/register`
2. **Login**: `POST /api/v1/auth/login`
3. **Use Access Token**: Add `Authorization: Bearer <token>` header
4. **Refresh**: `POST /api/v1/auth/refresh` when token expires

### MFA Setup (Optional)

1. `POST /api/v1/auth/mfa/enable` - Get QR code
2. Scan with authenticator app
3. `POST /api/v1/auth/mfa/verify` - Verify code
4. Login requires `mfaCode` field

## 🔌 WebSocket Connection

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

// Authenticate
ws.send(JSON.stringify({
  type: 'auth',
  token: 'your-jwt-token'
}));

// Subscribe to room
ws.send(JSON.stringify({
  type: 'subscribe',
  roomId: 'room-id'
}));

// Typing indicator
ws.send(JSON.stringify({
  type: 'typing_start',
  roomId: 'room-id'
}));

// Keep alive
setInterval(() => {
  ws.send(JSON.stringify({ type: 'ping' }));
}, 30000);
```

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/           # Environment config with Zod validation
│   ├── models/           # Mongoose schemas (10 models)
│   ├── routes/           # API endpoints
│   │   ├── auth.ts       # Authentication (8 endpoints)
│   │   ├── users.ts      # User management (7 endpoints)
│   │   ├── rooms.ts      # Room operations (10 endpoints)
│   │   ├── messages.ts   # Messaging (9 endpoints)
│   │   └── index.ts      # Route aggregator
│   ├── services/         # Business logic
│   │   ├── database.service.ts
│   │   ├── redis.service.ts
│   │   └── auth.service.ts
│   ├── middleware/       # Auth middleware
│   ├── websocket/        # WebSocket handlers
│   └── index.ts          # Server entry point
├── docker-compose.yml    # Local infrastructure
├── package.json
├── tsconfig.json
└── .env.example
```

## 🧪 Testing

```bash
# Run tests
npm test

# With coverage
npm run test:coverage

# Type check
npm run typecheck
```

## 🐛 Known Issues & Solutions

### TypeScript Warnings

The `@ts-expect-error` comments in model files are intentional - we're using custom string UUIDs instead of MongoDB ObjectIds for better compatibility with distributed systems.

### Build Errors

If you see module errors, ensure all dependencies are installed:
```bash
rm -rf node_modules package-lock.json
npm install
```

## 📝 Next Steps (Phase 2+)

- [ ] Push notifications (APNs/FCM/Web Push)
- [ ] File uploads with S3/CDN
- [ ] Message formatting (Markdown, mentions)
- [ ] Offline sync support
- [ ] Full-text search with Elasticsearch
- [ ] Reactions, bookmarks, polls
- [ ] Moderation & safety features
- [ ] Mobile clients (iOS/Android)

## 🔒 Security Notes

- **JWT Secret**: Use a strong 32+ character secret in production
- **HTTPS**: Always use TLS in production
- **Rate Limiting**: Currently 600 req/min per IP
- **CORS**: Configured for development (allow all), restrict in production
- **Passwords**: Bcrypt with cost factor 12
- **Sessions**: Stored in Redis with TTL

## 📊 Performance

- **WebSocket**: Handles concurrent connections with Redis pub/sub
- **Database**: Indexed queries on User, Room, Message collections
- **Caching**: Redis for sessions, presence, typing indicators
- **Rate Limits**: Protects against abuse

## 🆘 Support

Check the main README.md for:
- Full API endpoint documentation
- WebSocket message types
- Data model schemas
- Architecture overview
