/**
 * Next.js API proxy — forwards all /api/gee/* requests to the Python GEE backend.
 *
 * Local dev:  set GEE_BACKEND_URL=http://localhost:8000 in .env.local
 * Production: set GEE_BACKEND_URL to your Cloud Run / hosted backend URL
 *
 * This replaces the Supabase gee-proxy edge function for same-origin requests
 * and eliminates the need for browser-side Earth Engine SDK authentication.
 */

import { NextRequest, NextResponse } from 'next/server';

const BACKEND = (process.env.GEE_BACKEND_URL ?? '').replace(/\/$/, '');

function backendUnavailable() {
  return NextResponse.json(
    { error: 'GEE_BACKEND_URL is not configured', gee_available: false },
    { status: 503 }
  );
}

async function proxy(req: NextRequest, route: string[]): Promise<NextResponse> {
  if (!BACKEND) return backendUnavailable();

  const url = new URL(req.url);
  const upstream = `${BACKEND}/${route.join('/')}${url.search}`;

  try {
    const init: RequestInit = {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      // next/fetch does not support AbortSignal.timeout in all environments;
      // use a manual timeout via Promise.race instead.
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = await req.text();
    }

    const timeoutMs = req.method === 'GET' ? 15_000 : 120_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    init.signal = controller.signal;

    const upstream_res = await fetch(upstream, init);
    clearTimeout(timer);

    const data = await upstream_res.json();
    return NextResponse.json(data, { status: upstream_res.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Backend request failed: ${msg}`, gee_available: false },
      { status: 502 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { route: string[] } }
) {
  return proxy(req, params.route);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { route: string[] } }
) {
  return proxy(req, params.route);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
