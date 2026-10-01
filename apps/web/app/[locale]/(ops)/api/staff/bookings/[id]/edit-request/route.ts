// POST /api/staff/bookings/:id/edit-request — ops accept|refuse of a customer edit.
// Body: { action: "accept" | "refuse", requestId }. 26.2 P1: accept takes a stored request only;
// no field is copied from the browser. Dual-mounted at app/api/staff/bookings/[id]/edit-request.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  acceptPaidEdit,
  notifyTimeChangeOutcome,
  pendingEditHasTimeChange,
  refuseEditRequest,
} from "@/lib/ops/edit-request";
import { failStatus } from "@/lib/ops/edit-request-map";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function bookingKey(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const i = parts.lastIndexOf("bookings");
  const id = parts[i + 1] ?? "";
  if (!id || id === "edit-request") return null;
  return id;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export const POST = withStaff(async (claims, request) => {
  const id = bookingKey(request);
  if (!id) return jsonErr("not-found", 404);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const action = (str(record.action) ?? "accept").toLowerCase();
  const { env } = getCloudflareContext();

  if (action === "refuse") {
    const result = await refuseEditRequest(env, claims, id);
    if (!result.ok) return jsonErr(result.code, failStatus(result.code));
    await notifyTimeChangeOutcome(env, result.bookingId, "refused");
    return jsonOk({
      id,
      bookingId: result.bookingId,
      requestId: result.requestId,
      outcome: "refused",
    });
  }

  if (action !== "accept") return jsonErr("not-found", 400);

  const requestId = str(record.requestId);
  if (!requestId) return jsonErr("invalid-body", 400);
  const timeChange = await pendingEditHasTimeChange(env, id);
  const result = await acceptPaidEdit(env, claims, id, { requestId, payload: {} });
  if (!result.ok) return jsonErr(result.code, failStatus(result.code));
  if (timeChange && (result.outcome === "applied" || result.outcome === "refund_due")) {
    await notifyTimeChangeOutcome(env, result.bookingId, "confirmed");
  }
  return jsonOk({
    id,
    bookingId: result.bookingId,
    requestId: result.requestId,
    outcome: result.outcome,
    differenceRappen: result.differenceRappen,
    extraSessionId: result.extraSessionId,
  });
});
