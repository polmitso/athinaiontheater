import { health } from '../lib/pocketbase.js';

export const prerender = false;

export async function GET() {
  const report = await health();
  const ok = report.errors.length === 0 && report.venue !== null;
  return new Response(JSON.stringify({ ok, ...report }, null, 2), {
    status: ok ? 200 : 503,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
