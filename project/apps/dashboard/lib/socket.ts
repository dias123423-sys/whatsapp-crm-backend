import { io, Socket } from 'socket.io-client';

// Socket.IO connects directly to the backend.
// When nginx is configured with the /socket.io/ proxy block, NEXT_PUBLIC_SOCKET_URL
// can be the same as NEXT_PUBLIC_API_URL (e.g. https://yourdomain.com).
// For local dev, fallback to localhost:3001.
const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  'http://localhost:3001';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (typeof window === 'undefined') {
    return {
      connected: false,
      on() {
        return this;
      },
      off() {
        return this;
      },
      disconnect() {},
    } as unknown as Socket;
  }

  if (!socket) {
    socket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      upgrade: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      withCredentials: false,
      forceNew: false,
    });
  }

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
