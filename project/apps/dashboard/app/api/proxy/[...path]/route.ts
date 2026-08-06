/**
 * Next.js API Route — proxies all /api/* requests to the backend VPS.
 *
 * Vercel serverless functions CAN reach external HTTP servers,
 * but Vercel edge rewrites block private IPs via DNS_HOSTNAME_RESOLVED_PRIVATE.
 * This route runs as a Node.js function (not edge), so it bypasses that restriction.
 */

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://188.241.217.76:3001';

async function handler(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const pathStr = path.join('/');

  // Reconstruct the target URL
  const url = new URL(req.url);
  const targetUrl = `${BACKEND_URL}/api/${pathStr}${url.search}`;

  // Forward headers (Authorization etc.) but strip host
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    if (!['host', 'connection', 'content-length'].includes(key.toLowerCase())) {
      headers[key] = value;
    }
  });

  // Forward the request
  const body = req.method !== 'GET' && req.method !== 'HEAD'
    ? await req.text()
    : undefined;

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      // @ts-expect-error Node.js fetch duplex option
      duplex: 'half',
    });

    const responseBody = await response.arrayBuffer();

    return new NextResponse(responseBody, {
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type') ?? 'application/json',
        'content-disposition': response.headers.get('content-disposition') ?? '',
      },
    });
  } catch (err) {
    console.error('[proxy] fetch error:', err);
    return NextResponse.json(
      { success: false, message: 'Backend недоступен' },
      { status: 502 }
    );
  }
}

export const GET    = handler;
export const POST   = handler;
export const PUT    = handler;
export const PATCH  = handler;
export const DELETE = handler;

// Run as Node.js runtime (not edge) — needed to reach HTTP endpoints
export const runtime = 'nodejs';
