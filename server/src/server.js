require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { connectDB } = require('./config/db');
const socketHandler = require('./sockets/socketHandler');

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await connectDB();

    const server = http.createServer(app);
    const io = new Server(server, {
      cors: {
        origin: true,
        methods: ['GET', 'POST', 'PATCH', 'DELETE'],
        credentials: true
      }
    });

    // Make io accessible in routes
    app.set('io', io);

    // Initialize socket handlers
    socketHandler(io);

    server.listen(PORT, () => {
      console.log(`NexusTRAFFIC server running : https://traffic-site-1.onrender.com/`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
