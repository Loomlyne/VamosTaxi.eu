// apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/route.ts
//
// PATCH /api/staff/tickets/:id — persist Support Open / Close / Reopen only.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";
import { patchTicket } from "@/lib/ops/tickets-write";

export const dynamic = "force-dynamic";

function ticketId(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const id = parts.at(-1) ?? "";
  return id.length > 0 ? id : null;
}

export const PATCH = withStaff(async (claims, request) => {
  const id = ticketId(request);
  if (!id) return jsonErr("not-found", 404);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonErr("invalid-json", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonErr("invalid-json", 400);
  }
  const record = body as { status?: unknown; reply?: unknown };
  const input: { status?: string; reply?: string } = {};
  if (typeof record.status === "string") input.status = record.status;
  if (Object.prototype.hasOwnProperty.call(record, "reply")) {
    input.reply = typeof record.reply === "string" ? record.reply : "";
  }
  const { env } = getCloudflareContext();
  const result = await patchTicket(env, claims, id, input);
  if (!result.ok) {
    if (result.reason === "not-found") return jsonErr("not-found", 404);
    return jsonErr(result.reason, 400);
  }
  return jsonOk({ id, status: result.status });
});
