import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Rewrite /api/* → our Next.js proxy route /api/proxy/*
  // The proxy route (app/api/proxy/[...path]/route.ts) forwards server-side
  // to the VPS backend — bypasses Vercel's DNS_HOSTNAME_RESOLVED_PRIVATE block.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: '/api/proxy/:path*',
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
        source: '/api/whatsapp/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;
