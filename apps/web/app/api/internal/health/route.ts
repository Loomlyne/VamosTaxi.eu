// GET /api/internal/health — secret-header probe (LAUNCH-03 / D-18).
// Missing or wrong X-Vamos-Health-Key is empty 404. Never a JSON error body.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { healthKeyAuthorized } from "@/lib/health/header";
import { probeHealth } from "@/lib/health/probe";

export const dynamic = "force-dynamic";

const HEALTH_HEADERS = { "cache-control": "private, no-store" };

function empty404(): Response {
  return new Response(null, { status: 404, headers: HEALTH_HEADERS });
}

export async function GET(request: Request): Promise<Response> {
  const env = getCloudflareContext().env as CloudflareEnv;
  const presented = request.headers.get("X-Vamos-Health-Key");
  const allowed = await healthKeyAuthorized(presented, env.HEALTH_PROBE_SECRET);
  if (!allowed) return empty404();
  const body = await probeHealth(env);
  return Response.json(body, { headers: HEALTH_HEADERS });
}

export function POST(): Response {
  return empty404();
}

export function PUT(): Response {
  return empty404();
}

export function PATCH(): Response {
  return empty404();
}

export function DELETE(): Response {
  return empty404();
}

export function HEAD(): Response {
  return empty404();
}

export function OPTIONS(): Response {
  return empty404();
}
