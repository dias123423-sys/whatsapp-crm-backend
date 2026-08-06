import type { NextConfig } from 'next';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` },
      { source: '/webhook/:path*', destination: `${BACKEND_URL}/webhook/:path*` },
    ];
  },
};

export default nextConfig;
