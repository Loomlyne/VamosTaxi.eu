// apps/web/app/api/reviews/route.ts
//
// GET /api/reviews — published rows only. No staff session. No locked field.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadPublishedReviews } from "@/lib/public/reviews";

export const dynamic = "force-dynamic";

function jsonOk(data: unknown, status = 200): Response {
  return Response.json({ ok: true, data }, { status });
}

function methodNotAllowed(): Response {
  return Response.json({ ok: false, code: "method_not_allowed" }, { status: 405 });
}

export async function GET() {
  const { env } = getCloudflareContext();
  const rows = await loadPublishedReviews(env);
  return jsonOk(rows);
}

export function POST() {
  return methodNotAllowed();
}

export function PATCH() {
  return methodNotAllowed();
}

export function DELETE() {
  return methodNotAllowed();
}
