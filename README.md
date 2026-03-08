# Messaging Backend

Real-time messaging platform built with Fastify, MongoDB, Redis, and WebSocket.

## Features

- **Authentication**: JWT-based auth with MFA support (TOTP)
- **Real-time Messaging**: WebSocket for instant message delivery
- **Rooms & Conversations**: Public channels, private groups, and direct messages
- **Message Features**: Edit, delete, pin, threads, reactions, mentions
- **User Management**: Profiles, search, blocking
- **API Documentation**: Swagger/OpenAPI docs at `/docs`

## Tech Stack

- **Runtime**: Node.js 20 LTS
- **Framework**: Fastify 4.x
- **Database**: MongoDB (Mongoose 8.x)
- **Cache**: Redis (ioredis)
- **WebSocket**: @fastify/websocket + ws
- **Auth**: JWT + bcrypt + otplib (MFA)
- **Validation**: Zod
- **API Docs**: Swagger/OpenAPI

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose (for local services)

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your configuration

# Start infrastructure services
docker-compose up -d

# Run in development mode
npm run dev

# Build for production
npm run build
npm start
```

### Environment Variables

See `.env.example` for all required variables:

- `MONGODB_URI` - MongoDB connection string
- `REDIS_URL` - Redis connection URL
- `JWT_SECRET` - Secret for JWT signing
- `PORT` - Server port (default: 3000)

## API Documentation

Once the server is running, visit:

- **Swagger UI**: http://localhost:3000/docs
- **Health Check**: http://localhost:3000/health
- **Ready Check**: http://localhost:3000/ready

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login user
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout user
- `GET /api/v1/auth/sessions` - Get all sessions
- `DELETE /api/v1/auth/sessions/:sessionId` - Delete session
- `POST /api/v1/auth/mfa/enable` - Enable MFA
- `POST /api/v1/auth/mfa/verify` - Verify MFA code

### Users
- `GET /api/v1/users/me` - Get current user
- `PATCH /api/v1/users/me` - Update profile
- `GET /api/v1/users/search` - Search users
- `GET /api/v1/users/:username` - Get user by username
- `GET /api/v1/users/me/blocked` - Get blocked users
- `POST /api/v1/users/block` - Block user
- `DELETE /api/v1/users/block/:userId` - Unblock user

### Rooms
- `GET /api/v1/rooms` - Get all user rooms
- `POST /api/v1/rooms` - Create room
- `GET /api/v1/rooms/:rid` - Get room details
- `PATCH /api/v1/rooms/:rid` - Update room
- `DELETE /api/v1/rooms/:rid` - Delete room
- `GET /api/v1/rooms/dm/:username` - Get/create DM
- `POST /api/v1/rooms/:rid/members` - Add members
- `DELETE /api/v1/rooms/:rid/members/:userId` - Remove member
- `POST /api/v1/rooms/:rid/read` - Mark room as read
- `GET /api/v1/rooms/:rid/pinned` - Get pinned messages

### Messages
- `GET /api/v1/rooms/:rid/messages` - Get messages
- `POST /api/v1/messages` - Send message
- `PATCH /api/v1/messages/:id` - Edit message
- `DELETE /api/v1/messages/:id` - Delete message
- `POST /api/v1/messages/:id/pin` - Pin message
- `DELETE /api/v1/messages/:id/pin` - Unpin message
- `GET /api/v1/rooms/:rid/threads` - Get threads
- `GET /api/v1/messages/:id/thread` - Get thread replies

### WebSocket

Connect to `/ws` and authenticate:

```json
{
  "type": "auth",
  "token": "your-jwt-token"
}
```

Available message types:
- `subscribe` - Subscribe to room updates
- `unsubscribe` - Unsubscribe from room
- `typing_start` - Start typing indicator
- `typing_stop` - Stop typing indicator
- `ping` - Keep connection alive

## Development

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type checking
npm run typecheck

# Linting
npm run lint
```

## Project Structure

```
backend/
├── src/
│   ├── config/          # Environment configuration
│   ├── models/          # MongoDB schemas
│   ├── routes/          # API endpoints
│   ├── services/        # Business logic
│   ├── middleware/      # Auth & other middleware
│   ├── websocket/       # WebSocket handlers
│   └── index.ts         # Server entry point
├── docker-compose.yml   # Local services
├── package.json
└── tsconfig.json
```

## License

MIT
