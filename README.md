# Win99 Chat Server

WebSocket chat server for the Windows 99 native chat system. Replaces the Chattable iframe with full control over styling and functionality.

## Features

- Real-time messaging between WinChat GUI and MS-DOS terminal clients
- User join/leave notifications
- Connected users list
- Client type identification (GUI vs terminal)
- Health check endpoint for monitoring
- CORS configured for Windows 99 domains

## Local Development

```bash
cd chat-server
npm install
npm run dev
```

Server runs on `http://localhost:3001` with auto-reload.

## Production Deployment

### Railway Deployment
1. Connect GitHub repository to Railway
2. Set root directory to `/chat-server`
3. Railway auto-detects Node.js and runs `npm start`
4. Environment variables are handled automatically

### Health Check
- Endpoint: `GET /health`
- Returns: `{ status: 'online', users: number, uptime: seconds }`

## WebSocket Events

### Client → Server
- `join-chat`: `{ username: string, client: 'winchat'|'msdos' }`
- `chat-message`: `{ content: string }`
- `typing-start`: No payload
- `typing-stop`: No payload

### Server → Client
- `user-joined`: `{ username: string, client: string, timestamp: string }`
- `user-left`: `{ username: string, client: string, timestamp: string }`
- `user-list`: `Array<{ username: string, client: string }>`
- `new-message`: `{ id: number, username: string, content: string, timestamp: string, client: string }`
- `user-typing`: `{ username: string, typing: boolean }`

## Usage Stats

The server tracks:
- Connected users count
- Client types (WinChat vs MS-DOS)
- Message throughput
- Uptime
