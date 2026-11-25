import { io } from 'socket.io-client';

let socketInstance = null;

export const getSocket = () => socketInstance;

/**
 * Connects or returns existing singleton Socket.IO connection.
 * Authenticates with access token and automatically handles reconnection.
 */
export const connectSocket = (token = null) => {
  if (socketInstance) {
    if (!socketInstance.connected) {
      socketInstance.auth = token ? { token } : {};
      socketInstance.connect();
    }
    return socketInstance;
  }

  // Derive Socket server origin (defaults to localhost:5000 in dev or current origin in prod)
  const envUrl = import.meta.env.VITE_API_URL;
  let socketUrl = 'http://localhost:5000';
  if (envUrl) {
    socketUrl = envUrl.replace(/\/api\/?$/, '');
  } else if (typeof window !== 'undefined' && window.location.port !== '5173') {
    socketUrl = window.location.origin;
  }

  socketInstance = io(socketUrl, {
    auth: token ? { token } : {},
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    autoConnect: true,
  });

  return socketInstance;
};

/**
 * Disconnects socket cleanly on user logout.
 */
export const disconnectSocket = () => {
  if (socketInstance) {
    try {
      socketInstance.disconnect();
    } catch (err) {
      // Disconnect cleanly
    }
    socketInstance = null;
  }
};
