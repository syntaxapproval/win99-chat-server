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
 * Parse and roll dice notation (e.g., "2d6", "1d20", "d6")
 * @param {string} notation - Dice notation
 * @returns {object} - { total, results, error }
 */
function rollDice(notation) {
  // Parse dice notation: XdY where X is number of dice, Y is number of sides
  const match = notation.match(/^(\d*)d(\d+)$/i);
  
  if (!match) {
    return { error: 'Invalid dice notation. Use format: XdY (e.g., 2d6, 1d20, d6)' };
  }
  
  const numDice = parseInt(match[1] || '1');
  const numSides = parseInt(match[2]);
  
  if (numDice < 1 || numDice > 100) {
    return { error: 'Number of dice must be between 1 and 100' };
  }
  
  if (numSides < 2 || numSides > 1000) {
    return { error: 'Number of sides must be between 2 and 1000' };
  }
  
  const results = [];
  for (let i = 0; i < numDice; i++) {
    results.push(Math.floor(Math.random() * numSides) + 1);
  }
  
  const total = results.reduce((sum, val) => sum + val, 0);
  
  return { total, results };
}

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

    
  // Handle request for user list
  socket.on('get-user-list', () => {
    const userList = Array.from(connectedUsers.values()).map(u => ({
      username: u.username,
      client: u.client
    }));
    socket.emit('user-list', userList);
  });
  
  // Handle chat commands
  socket.on('chat-command', (commandData) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;
    
    const { command, args, clientTime } = commandData;
    
    switch (command) {
      case 'ping':
        // Send back latency
        const latency = Date.now() - (clientTime || Date.now());
        socket.emit('command-response', {
          command: 'ping',
          message: `Pong! Latency: ${latency}ms`
        });
        break;
        
      case 'time':
        // Send server time (time only, no date)
        const now = new Date();
        const serverTime = now.toLocaleTimeString();
        socket.emit('command-response', {
          command: 'time',
          message: `Server time: ${serverTime}`
        });
        break;
        
      case 'uptime':
        // Show server uptime
        const uptimeSeconds = Math.floor(process.uptime());
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = uptimeSeconds % 60;
        socket.emit('command-response', {
          command: 'uptime',
          message: `Server uptime: ${hours}h ${minutes}m ${seconds}s`
        });
        break;
        
      case '8ball':
        // Magic 8-ball
        if (args.length === 0) {
          socket.emit('command-response', {
            command: '8ball',
            message: 'Ask a question! (e.g., !8ball Will I pass the test?)'
          });
        } else {
          const responses = [
            'It is certain', 'Without a doubt', 'Yes definitely', 'You may rely on it',
            'As I see it, yes', 'Most likely', 'Outlook good', 'Signs point to yes',
            'Reply hazy try again', 'Ask again later', 'Better not tell you now',
            'Cannot predict now', 'Concentrate and ask again',
            'Don\'t count on it', 'My reply is no', 'My sources say no',
            'Outlook not so good', 'Very doubtful'
          ];
          const answer = responses[Math.floor(Math.random() * responses.length)];
          io.emit('system-message', {
            message: `${user.username} asked the Magic 8-Ball: "${args.join(' ')}" - ${answer}`,
            timestamp: new Date().toISOString()
          });
        }
        break;
        
      case 'roll':
        // Roll dice
        const diceNotation = args[0] || '1d6';
        const rollResult = rollDice(diceNotation);
        
        if (rollResult.error) {
          socket.emit('command-response', {
            command: 'roll',
            message: rollResult.error
          });
        } else {
          // Broadcast to all users
          io.emit('system-message', {
            message: `${user.username} rolled ${diceNotation}: ${rollResult.total}${rollResult.results.length > 1 ? ` (${rollResult.results.join(', ')})` : ''}`,
            timestamp: new Date().toISOString()
          });
        }
        break;
        
      case 'flip':
        // Flip coin
        const coinResult = Math.random() < 0.5 ? 'Heads' : 'Tails';
        io.emit('system-message', {
          message: `${user.username} flipped a coin: ${coinResult}`,
          timestamp: new Date().toISOString()
        });
        break;
        
      case 'me':
        // Action message
        const action = args.join(' ');
        if (action) {
          io.emit('system-message', {
            message: `* ${user.username} ${action}`,
            timestamp: new Date().toISOString()
          });
        }
        break;
        
      default:
        socket.emit('command-response', {
          command: command,
          message: `Unknown command: !${command}. Type !help for available commands.`
        });
    }
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
