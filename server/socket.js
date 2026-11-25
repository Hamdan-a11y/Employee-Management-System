const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('./config/env');

let io = null;

/**
 * Initializes Socket.IO on the HTTP server with token authentication & private rooms.
 */
function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => callback(null, true),
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
    },
    pingTimeout: 30000,
    pingInterval: 25000
  });

  // 1. Connection Authentication Middleware
  io.use((socket, next) => {
    try {
      const authHeader = socket.handshake.headers?.authorization;
      const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      let cookieToken = null;
      const rawCookies = socket.handshake.headers?.cookie;
      if (rawCookies) {
        for (const part of rawCookies.split(';')) {
          const [k, ...v] = part.trim().split('=');
          if (k === '__Host-access_token' || k === 'access_token') {
            cookieToken = decodeURIComponent(v.join('='));
            if (k === '__Host-access_token') break;
          }
        }
      }
      const token = socket.handshake.auth?.token || bearerToken || socket.handshake.query?.token || cookieToken;

      if (!token) {
        return next(new Error('Authentication error: Access token required'));
      }

      jwt.verify(token, config.jwtSecret, (err, decoded) => {
        if (err) {
          return next(new Error('Authentication error: Invalid or expired token'));
        }
        socket.user = decoded;
        next();
      });
    } catch (err) {
      return next(new Error('Authentication error: ' + err.message));
    }
  });

  // 2. Connection Handler & Room Setup
  io.on('connection', (socket) => {
    const user = socket.user;
    if (!user || !user.id) {
      return socket.disconnect(true);
    }

    // Automatically join user's private room
    const userRoom = `user:${user.id}`;
    socket.join(userRoom);

    // If department manager, join department room
    if (user.role === 'department_manager' && user.department_id) {
      socket.join(`dept:${user.department_id}`);
    }

    // If Admin or HR, join respective role rooms
    if (user.role === 'admin') {
      socket.join('admins');
    }
    if (user.role === 'hr_manager') {
      socket.join('hr');
    }

    // Guard against unauthorized room joins:
    // A user can NEVER join another user's room!
    socket.on('join', (room, callback) => {
      if (typeof room !== 'string') return;

      const isOwnUserRoom = room === `user:${user.id}`;
      const isOwnDeptRoom = room === `dept:${user.department_id}` && user.role === 'department_manager';
      const isAuthorizedRoleRoom = (room === 'admins' && user.role === 'admin') || (room === 'hr' && user.role === 'hr_manager');

      if (isOwnUserRoom || isOwnDeptRoom || isAuthorizedRoleRoom) {
        socket.join(room);
        if (typeof callback === 'function') callback({ success: true, room });
      } else {
        socket.emit('error', { message: 'Unauthorized room access' });
        if (typeof callback === 'function') callback({ success: false, message: 'Unauthorized' });
      }
    });

    socket.on('disconnect', () => {
      // Disconnect cleanly without throwing
    });
  });

  return io;
}

/**
 * Returns active Socket.IO server instance
 */
function getIO() {
  return io;
}

/**
 * Emits lightweight data change events for dashboard & table updates.
 * Sends ONLY event name and IDs, never full sensitive database records.
 * 
 * @param {string|string[]} room - e.g. "user:12", "dept:3", "admins"
 * @param {string} eventName - e.g. "attendance:updated", "leave:updated", "overtime:updated"
 * @param {object} payload - { ids: [1, 2] }
 */
function emitDataChanged(room, eventName, payload = {}) {
  if (!io) return;

  const sanitizedIds = Array.isArray(payload.ids)
    ? payload.ids
    : payload.id !== undefined && payload.id !== null
    ? [payload.id]
    : [];

  const message = {
    event: eventName,
    ids: sanitizedIds,
    timestamp: new Date().toISOString()
  };

  if (Array.isArray(room)) {
    room.forEach((r) => io.to(r).emit(eventName, message));
  } else if (room) {
    io.to(room).emit(eventName, message);
  }
}

module.exports = {
  initSocket,
  getIO,
  emitDataChanged
};
