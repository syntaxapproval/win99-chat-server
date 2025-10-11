const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const Filter = require('bad-words');

const app = express();
const server = createServer(app);
const filter = new Filter();

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

/**
 * Generate unique username by appending numbers if duplicate exists
 * @param {string} requestedUsername - The username the user wants
 * @returns {string} - Unique username (original or with number suffix)
 */
function generateUniqueUsername(requestedUsername) {
  const existingUsernames = Array.from(connectedUsers.values()).map(u => u.username);
  
  // If username doesn't exist, return it as-is
  if (!existingUsernames.includes(requestedUsername)) {
    return requestedUsername;
  }
  
  // Username exists, append numbers until we find a unique one
  let counter = 2;
  let candidateUsername = `${requestedUsername}${counter}`;
  
  while (existingUsernames.includes(candidateUsername)) {
    counter++;
    candidateUsername = `${requestedUsername}${counter}`;
  }
  
  return candidateUsername;
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // User joins chat
  socket.on('join-chat', (userData) => {
    let requestedUsername = userData.username || `User${Math.floor(Math.random() * 1000)}`;
    
    // Filter profanity from username
    if (filter.isProfane(requestedUsername)) {
      requestedUsername = filter.clean(requestedUsername);
      console.log(`Filtered profane username: ${userData.username} -> ${requestedUsername}`);
    }

    // Generate unique username (handles duplicates)
    const finalUsername = generateUniqueUsername(requestedUsername);
    
    const user = {
      id: socket.id,
      username: finalUsername,
      client: userData.client || userData.clientType || 'unknown',
      joinTime: new Date().toISOString()
    };
    
    connectedUsers.set(socket.id, user);
    
    // Send back the actual username assigned to the client
    socket.emit('username-assigned', { 
      username: finalUsername,
      wasChanged: finalUsername !== userData.username
    });
    
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
    
    console.log(`${user.username} joined from ${user.client}` + 
                (finalUsername !== userData.username ? ` (requested: ${userData.username})` : ''));
  });

    
  // Handle request for user list - OUTSIDE join-chat handler
  socket.on('get-user-list', () => {
    const userList = Array.from(connectedUsers.values()).map(u => ({
      username: u.username,
      client: u.client
    }));
    socket.emit('user-list', userList);
  });
  
  // Handle chat messages
  socket.on('chat-message', (messageData) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;
    
    let messageText = messageData.text || messageData.content || '';
    
    // Filter profanity from message
    if (filter.isProfane(messageText)) {
      messageText = filter.clean(messageText);
      console.log(`Filtered profane message from ${user.username}`);
    }
    
    const message = {
      id: Date.now() + Math.random(),
      username: user.username,
      text: messageText,
      timestamp: new Date().toISOString(),
      client: user.client
    };
    
    // Broadcast to all connected clients
    io.emit('new-message', message);
    
    console.log(`${user.username}: ${messageText}`);
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
