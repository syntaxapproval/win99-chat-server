const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = createServer(app);

// CORS configuration for Windows 99 project
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://*.win99.lol',
    'https://win99.lol',
    'file://', // Allow local HTML files
    'null' // Allow file:// protocol
  ],
  credentials: true
}));

const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:5173', 
      'https://*.win99.lol',
      'https://win99.lol',
      'file://', // Allow local HTML files
      'null' // Allow file:// protocol
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Connected users tracking
const connectedUsers = new Map();

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'online',
    users: connectedUsers.size,
    uptime: process.uptime()
  });
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // User joins chat
  socket.on('join-chat', (userData) => {
    const user = {
      id: socket.id,
      username: userData.username || `User${Math.floor(Math.random() * 1000)}`,
      client: userData.client || 'unknown', // 'winchat' or 'msdos'
      joinTime: new Date().toISOString()
    };
    
    connectedUsers.set(socket.id, user);
    
    // Notify all clients of new user
    socket.broadcast.emit('user-joined', {
      username: user.username,
      client: user.client,
      timestamp: user.joinTime
    });
    
    // Send current user list to newly joined user
    const userList = Array.from(connectedUsers.values()).map(u => ({
      username: u.username,
      client: u.client
    }));
    socket.emit('user-list', userList);
    
    console.log(`${user.username} joined from ${user.client}`);
  });
  
  // Handle chat messages
  socket.on('chat-message', (messageData) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;
    
    const message = {
      id: Date.now() + Math.random(),
      username: user.username,
      content: messageData.content,
      timestamp: new Date().toISOString(),
      client: user.client
    };
    
    // Broadcast to all connected clients
    io.emit('new-message', message);
    
    console.log(`${user.username}: ${messageData.content}`);
  });
  
  // Handle user disconnect
  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      // Notify other users
      socket.broadcast.emit('user-left', {
        username: user.username,
        client: user.client,
        timestamp: new Date().toISOString()
      });
      
      connectedUsers.delete(socket.id);
      console.log(`${user.username} disconnected`);
    }
  });
  
  // Handle typing indicators (optional enhancement)
  socket.on('typing-start', () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      socket.broadcast.emit('user-typing', { username: user.username, typing: true });
    }
  });
  
  socket.on('typing-stop', () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      socket.broadcast.emit('user-typing', { username: user.username, typing: false });
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Win99 Chat Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
