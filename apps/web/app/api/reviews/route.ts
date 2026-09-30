// apps/web/app/api/reviews/route.ts
//
// GET /api/reviews — published rows only. No staff session. No locked field.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { loadPublishedReviews } from "@/lib/public/reviews";

export const dynamic = "force-dynamic";

const noStore = { "cache-control": "private, no-store" };

// Published rows are the same for every visitor and read through publicSql (no identity),
// so the list is kept for 5 minutes instead of read from the database on every page view
// (owner decision 2026-09-30). A review published on the dashboard shows within 5 minutes.
const shared = { "cache-control": "public, max-age=300, s-maxage=300" };

function jsonOk(data: unknown, status = 200): Response {
  return Response.json({ ok: true, data }, { status, headers: shared });
}

function methodNotAllowed(): Response {
  return Response.json({ ok: false, code: "method_not_allowed" }, { status: 405, headers: noStore });
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
