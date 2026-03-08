# Centrifugo Integration Guide

This guide explains how to run and test the messaging backend with Centrifugo for real-time WebSocket message delivery.

---

## 🏗️ Architecture

```
Client (Browser/Mobile)
    ↓
WebSocket Connection
    ↓
Centrifugo (Port 8000)
    ↑
Backend API publishes events via HTTP
    ↓
Database (MongoDB)
```

**Flow:**
1. Client sends message via REST API → Backend
2. Backend saves message to MongoDB
3. Backend publishes event to Centrifugo HTTP API
4. Centrifugo broadcasts to all WebSocket clients subscribed to that room
5. Clients receive real-time message updates

---

## 📋 Prerequisites

- Docker and Docker Compose installed
- Node.js 20+ installed
- Backend dependencies installed (`npm install`)

---

## 🚀 Step-by-Step Setup

### Step 1: Configure Environment Variables

Create `.env` file in the `backend` directory:

```bash
cp .env.example .env
```

Edit `.env` and set Centrifugo variables:

```env
# Centrifugo Configuration
CENTRIFUGO_API_URL=http://localhost:8000/api
CENTRIFUGO_API_KEY=your-api-key-change-this-in-production
CENTRIFUGO_TOKEN_HMAC_SECRET=your-secret-key-change-this-in-production
```

**Important:** Make sure these values match the ones in `centrifugo.json`

---

### Step 2: Start Infrastructure Services

Start MongoDB, Redis, and **Centrifugo** using Docker Compose:

```bash
cd backend
docker-compose up -d
```

This will start:
- **MongoDB** on port `27017`
- **Redis** on port `6379`
- **Centrifugo** on port `8000`
- Elasticsearch on port `9200` (optional)
- Kafka on port `9092` (optional)

**Verify Centrifugo is running:**

```bash
curl http://localhost:8000/health
```

You should see: `{"healthy": true}`

**Access Centrifugo Admin Panel:**

Open browser: http://localhost:8000/

- Username: `admin`
- Password: `admin`

---

### Step 3: Start Backend Server

```bash
npm run dev
```

Backend will start on port `3000`.

**Verify backend is running:**

```bash
curl http://localhost:3000/health
```

---

### Step 4: Connect Client to WebSocket

Clients connect to Centrifugo WebSocket endpoint:

```
ws://localhost:8000/connection/websocket
```

---

## 🔌 Client WebSocket Integration

### JavaScript/Browser Example

```javascript
// Install: npm install centrifuge
import { Centrifuge } from 'centrifuge';

const centrifuge = new Centrifuge('ws://localhost:8000/connection/websocket', {
  // Optional: Add connection token for authentication
  // token: 'your-jwt-token'
});

// Subscribe to a room channel
const roomId = '12345';
const subscription = centrifuge.newSubscription(`room:${roomId}`);

subscription.on('publication', (ctx) => {
  console.log('Received event:', ctx.data);
  
  switch (ctx.data.type) {
    case 'message':
      console.log('New message:', ctx.data.text);
      // Update UI with new message
      break;
    case 'message_update':
      console.log('Message edited:', ctx.data.messageId);
      // Update message in UI
      break;
    case 'message_delete':
      console.log('Message deleted:', ctx.data.messageId);
      // Remove message from UI
      break;
    case 'typing_start':
      console.log('User typing:', ctx.data.username);
      // Show typing indicator
      break;
    case 'typing_stop':
      console.log('User stopped typing:', ctx.data.username);
      // Hide typing indicator
      break;
  }
});

subscription.subscribe();
centrifuge.connect();
```

### React Example

```jsx
import { useEffect, useState } from 'react';
import { Centrifuge } from 'centrifuge';

function ChatRoom({ roomId }) {
  const [messages, setMessages] = useState([]);
  const [centrifuge, setCentrifuge] = useState(null);

  useEffect(() => {
    // Connect to Centrifugo
    const client = new Centrifuge('ws://localhost:8000/connection/websocket');
    
    // Subscribe to room
    const sub = client.newSubscription(`room:${roomId}`);
    
    sub.on('publication', (ctx) => {
      if (ctx.data.type === 'message') {
        setMessages(prev => [...prev, ctx.data]);
      }
    });
    
    sub.subscribe();
    client.connect();
    
    setCentrifuge(client);
    
    return () => {
      sub.unsubscribe();
      client.disconnect();
    };
  }, [roomId]);

  return (
    <div>
      {messages.map(msg => (
        <div key={msg.messageId}>{msg.text}</div>
      ))}
    </div>
  );
}
```

---

## 📡 Event Types

### 1. New Message Event

**Published when:** User sends a new message

**Channel:** `room:{roomId}`

**Payload:**
```json
{
  "type": "message",
  "messageId": "uuid",
  "text": "Hello world",
  "senderId": "user-id",
  "senderUsername": "john_doe",
  "roomId": "room-id",
  "createdAt": "2024-03-08T12:00:00Z",
  "attachments": [],
  "tmid": null
}
```

### 2. Message Update Event

**Published when:** User edits a message

**Channel:** `room:{roomId}`

**Payload:**
```json
{
  "type": "message_update",
  "messageId": "uuid",
  "text": "Updated text",
  "editedAt": "2024-03-08T12:05:00Z",
  "roomId": "room-id"
}
```

### 3. Message Delete Event

**Published when:** User deletes a message

**Channel:** `room:{roomId}`

**Payload:**
```json
{
  "type": "message_delete",
  "messageId": "uuid",
  "roomId": "room-id"
}
```

### 4. Typing Start Event

**Published when:** User starts typing

**Channel:** `room:{roomId}`

**Payload:**
```json
{
  "type": "typing_start",
  "userId": "user-id",
  "username": "john_doe",
  "roomId": "room-id"
}
```

### 5. Typing Stop Event

**Published when:** User stops typing

**Channel:** `room:{roomId}`

**Payload:**
```json
{
  "type": "typing_stop",
  "userId": "user-id",
  "username": "john_doe",
  "roomId": "room-id"
}
```

### 6. Read Receipt Event

**Published when:** User marks room as read

**Channel:** `room:{roomId}`

**Payload:**
```json
{
  "type": "read_receipt",
  "userId": "user-id",
  "roomId": "room-id",
  "lastReadMessageId": "message-id"
}
```

---

## 🧪 Testing the Integration

### Test 1: Send a Message via REST API

```bash
# 1. Register a user
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User"
  }'

# 2. Login to get token
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'

# 3. Create a room
curl -X POST http://localhost:3000/api/v1/rooms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "type": "c",
    "name": "Test Room"
  }'

# 4. Send a message
curl -X POST http://localhost:3000/api/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "rid": "ROOM_ID",
    "msg": "Hello from REST API!"
  }'
```

### Test 2: Monitor Centrifugo Logs

```bash
docker logs -f messaging-centrifugo
```

You should see logs like:
```
[INFO] published to channel room:12345
```

### Test 3: Use Centrifugo Admin Panel

1. Open http://localhost:8000/
2. Login with `admin` / `admin`
3. Go to "Channels" tab
4. You'll see active channels like `room:12345`
5. Click on a channel to see subscribers and publish test messages

---

## 🔧 Configuration Files

### centrifugo.json

```json
{
  "token_hmac_secret_key": "your-secret-key-change-this-in-production",
  "api_key": "your-api-key-change-this-in-production",
  "admin": true,
  "admin_password": "admin",
  "admin_secret": "admin-secret",
  "allowed_origins": ["*"],
  "log_level": "info",
  "namespaces": [
    {
      "name": "room",
      "publish": true,
      "subscribe_to_publish": true,
      "presence": true,
      "join_leave": true,
      "history_size": 10,
      "history_ttl": "300s"
    }
  ]
}
```

**Key settings:**
- `token_hmac_secret_key`: Secret for generating connection tokens
- `api_key`: API key for backend to publish events
- `admin`: Enable admin panel
- `namespaces`: Channel configuration
  - `room`: Namespace for room channels
  - `publish`: Allow clients to publish (set to false in production)
  - `presence`: Track online users
  - `join_leave`: Notify when users join/leave
  - `history_size`: Keep last 10 messages in memory
  - `history_ttl`: Keep history for 5 minutes

---

## 🐛 Debugging

### Check if Centrifugo is receiving events

```bash
# Enable debug logging in centrifugo.json
{
  "log_level": "debug"
}

# Restart Centrifugo
docker-compose restart centrifugo

# Watch logs
docker logs -f messaging-centrifugo
```

### Check backend logs

Backend logs will show:
```
[Centrifugo] Published to channel: room:12345 { type: 'message', success: true }
```

If publishing fails:
```
[Centrifugo] Failed to publish to channel: room:12345 { error: 'connection refused' }
```

### Common Issues

**1. Connection refused**
- Make sure Centrifugo is running: `docker ps | grep centrifugo`
- Check Centrifugo URL in `.env`: `CENTRIFUGO_API_URL=http://localhost:8000/api`

**2. Unauthorized (401)**
- Check API key matches between `.env` and `centrifugo.json`
- Verify `CENTRIFUGO_API_KEY` is set correctly

**3. WebSocket connection fails**
- Check CORS settings in `centrifugo.json`
- Verify WebSocket endpoint: `ws://localhost:8000/connection/websocket`

**4. No events received**
- Check client is subscribed to correct channel: `room:{roomId}`
- Verify backend is publishing events (check logs)
- Check Centrifugo admin panel for active subscriptions

---

## 🔒 Production Considerations

### Security

1. **Change default secrets:**
```json
{
  "token_hmac_secret_key": "generate-strong-random-secret-256-bits",
  "api_key": "generate-strong-random-api-key",
  "admin_password": "strong-admin-password"
}
```

2. **Disable client publishing:**
```json
{
  "namespaces": [{
    "name": "room",
    "publish": false  // Only backend can publish
  }]
}
```

3. **Restrict CORS:**
```json
{
  "allowed_origins": ["https://yourdomain.com"]
}
```

4. **Use connection tokens:**
Generate tokens in backend for authenticated users:
```typescript
const token = centrifugoService.generateConnectionToken(userId);
// Send token to client
```

### Scaling

For production with multiple backend servers:

1. **Use Redis for Centrifugo:**
```json
{
  "engine": "redis",
  "redis_address": "redis://localhost:6379"
}
```

2. **Run multiple Centrifugo instances behind load balancer**

3. **Use sticky sessions or Redis engine for WebSocket connections**

---

## 📚 Additional Resources

- **Centrifugo Documentation:** https://centrifugal.dev/
- **Centrifuge JS Client:** https://github.com/centrifugal/centrifuge-js
- **Admin Panel Guide:** https://centrifugal.dev/docs/server/admin_web

---

## ✅ Verification Checklist

- [ ] Centrifugo running on port 8000
- [ ] Backend can publish to Centrifugo (check logs)
- [ ] Client can connect to WebSocket
- [ ] Client receives real-time messages
- [ ] Typing indicators work
- [ ] Message updates/deletes work
- [ ] Admin panel accessible

---

## 🎯 Next Steps

1. Update frontend to use Centrifuge client library
2. Add connection token authentication
3. Implement presence (online users)
4. Add join/leave notifications
5. Implement message history from Centrifugo
6. Add reconnection logic in client
7. Monitor Centrifugo metrics in production
