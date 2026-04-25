const jwt = require('jsonwebtoken');

function socketHandler(io) {
  // Auth middleware for sockets
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded;
      } catch (err) {
        // Allow unauthenticated connections but without user info
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id} (${socket.user?.name || 'anonymous'})`);

    // Join role-based rooms
    if (socket.user) {
      socket.join(`role:${socket.user.role}`);
      socket.join(`user:${socket.user.id}`);
    }

    // Join incident room
    socket.on('join:incident', ({ incidentId }) => {
      socket.join(`incident:${incidentId}`);
      console.log(`${socket.user?.name || socket.id} joined incident room: ${incidentId}`);
    });

    // Report incident
    socket.on('incident:report', (data) => {
      io.to('role:relief_admin').emit('incident:new', data);
    });

    // Accept incident
    socket.on('incident:accept', (data) => {
      io.emit('incident:updated', data);
    });

    // Mark en route
    socket.on('incident:markEnRoute', (data) => {
      io.emit('incident:updated', { ...data, status: 'en_route' });
    });

    // Mark resolved
    socket.on('incident:markResolved', (data) => {
      io.emit('incident:updated', { ...data, status: 'resolved' });
    });

    // Chat messages
    socket.on('chat:send', (data) => {
      const msg = {
        ...data,
        senderName: socket.user?.name || 'Unknown',
        timestamp: new Date()
      };
      io.to(`incident:${data.incidentId}`).emit('chat:message', msg);
    });

    // Unit location update
    socket.on('unit:updateLocation', (data) => {
      io.to('role:relief_admin').emit('unit:locationUpdated', data);
    });

    // Unit arrived
    socket.on('unit:arrived', (data) => {
      io.emit('unit:statusChanged', { ...data, status: 'on_site' });
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
}

module.exports = socketHandler;
