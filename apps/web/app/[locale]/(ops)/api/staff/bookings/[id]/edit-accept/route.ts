// apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/edit-accept/route.ts
//
// POST /api/staff/bookings/:id/edit-accept — ops accept of a paid edit.
// Dual-mounted at app/api/staff/bookings/[id]/edit-accept.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { acceptPaidEdit, notifyTimeChangeOutcome, pendingEditHasTimeChange } from "@/lib/ops/edit-request";
import { failStatus } from "@/lib/ops/edit-request-map";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function bookingKey(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const i = parts.lastIndexOf("bookings");
  const id = parts[i + 1] ?? "";
  if (!id || id === "edit-accept") return null;
  return id;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
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
  const payloadRaw =
    record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
      ? (record.payload as Record<string, unknown>)
      : record;
  const { env } = getCloudflareContext();
  const timeChange = await pendingEditHasTimeChange(env, id);
  const result = await acceptPaidEdit(env, claims, id, {
    requestId: str(record.requestId),
    quoteSnapshotId: num(record.quoteSnapshotId),
    lock: str(record.lock),
    vehicleClassSlug: str(record.vehicleClassSlug) ?? str(payloadRaw.vehicle_class_slug) ?? str(payloadRaw.klass),
    payload: {
      contact_name: str(payloadRaw.contact_name) ?? str(payloadRaw.customer),
      contact_email: str(payloadRaw.contact_email) ?? str(payloadRaw.email),
      contact_phone: str(payloadRaw.contact_phone) ?? str(payloadRaw.phone),
      note: str(payloadRaw.note),
      pickup_text: str(payloadRaw.pickup_text) ?? str(payloadRaw.pickup),
      dropoff_text: str(payloadRaw.dropoff_text) ?? str(payloadRaw.dropoff),
      flight_no: str(payloadRaw.flight_no) ?? str(payloadRaw.flight),
      scheduled_local: str(payloadRaw.scheduled_local),
      pax: num(payloadRaw.pax),
      bags: num(payloadRaw.bags),
      vehicle_class_slug: str(payloadRaw.vehicle_class_slug) ?? str(payloadRaw.klass),
    },
  });
  if (!result.ok) return jsonErr(result.code, failStatus(result.code));
  if (timeChange && result.outcome === "applied") {
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
