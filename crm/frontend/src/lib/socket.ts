import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './api';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (typeof window === 'undefined') {
    return { connected: false, on() { return this; }, off() { return this; }, disconnect() {} } as unknown as Socket;
  }
  if (!socket) {
    socket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      auth: { token: getAccessToken() },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      timeout: 20000,
      withCredentials: false,
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
