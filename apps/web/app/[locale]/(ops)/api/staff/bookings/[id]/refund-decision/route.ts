// apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund-decision/route.ts
//
// POST /api/staff/bookings/:id/refund-decision — 26.1-17, admin only.
//   { decision: "decline" } D-24: decline a pending_ops refund (cancel inside 24 h)
//   { decision: "reject" }  D-25: reject a post-trip request the customer made by ticket
// No money moves; ops_refund_decide sets refund_status declined and records the admin
// on a refund.declined / refund.rejected event. Refunding a percentage or accepting a
// post-trip request is POST ../refund. Dual-mounted at app/api/staff/bookings/[id]/refund-decision.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { decideRefund } from "@/lib/ops/refund";
import { parseRefundDecision } from "@/lib/ops/refund-map";
import { jsonErr, jsonOk, withAdmin } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function bookingKey(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const i = parts.lastIndexOf("bookings");
  const id = parts[i + 1] ?? "";
  if (!id || id === "refund-decision") return null;
  return id;
}

function failStatus(code: string): number {
  if (code === "not-found") return 404;
  if (code === "not-admin") return 403;
  if (
    code === "not-pending" ||
    code === "not-post-trip" ||
    code === "not-open" ||
    code === "not-paid"
  ) {
    return 409;
  }
  return 400;
}

export const POST = withAdmin(async (claims, request) => {
  const id = bookingKey(request);
  if (!id) return jsonErr("not-found", 404);
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const decision = parseRefundDecision(body);
  if (!decision) return jsonErr("invalid-decision", 400);
  const { env } = getCloudflareContext();
  const result = await decideRefund(env, claims, id, decision);
  if (!result.ok) return jsonErr(result.code, failStatus(result.code));
  return jsonOk({
    id,
    bookingId: result.bookingId,
    decision,
    refundStatus: result.refundStatus,
  });
});
