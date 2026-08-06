import type { NextConfig } from 'next';

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Proxy /api/* requests to the backend server-side.
  // This removes cross-origin issues for REST API calls — the browser
  // always talks to the same origin. Socket.IO connects directly
  // to the backend (see lib/socket.ts) since Vercel serverless can't proxy WebSockets.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
      {
        // Prevent Vercel edge from caching WhatsApp status and QR endpoints
        source: '/api/whatsapp/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;
