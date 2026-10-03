// apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/route.ts
//
// PATCH /api/staff/bookings/:id — cancel, complete, no-show, or in-place field update.
// 26.2 P6: the in-place update is name, e-mail, phone, note and flight only (D6, D8), recorded in
// the history. A body that still carries pickup, dropoff, dateIso, time, pax, bags or klass is
// refused ("use-change"): those are priced and confirmed through POST …/change.
// DELETE — soft-delete (erased_at). Dual-mounted at app/api/staff/bookings/[id].
// Refund is POST /api/staff/bookings/:id/refund (Stripe first).
// D-31: completed / no_show go through ops_mark_* RPCs, never a client status write.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { notifyReviewRequest } from "@/lib/lifecycle/notify-lifecycle";
import {
  cancelBooking,
  eraseBooking,
  markArrival,
  markComplete,
  markNoShow,
  updateBooking,
  type MarkedBooking,
} from "@/lib/ops/bookings-write";
import { isCheckoutEmail } from "@/lib/checkout/contact-validate";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

/** 26.2 P6: the trip fields this route refuses on a paid booking (named refusal "use-change"). */
const TRIP_PATCH_FIELDS: readonly string[] = Object.freeze(["pickup", "dropoff", "dateIso", "time", "pax", "bags", "klass"]);

function bookingId(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const id = parts.at(-1) ?? "";
  return id.length > 0 ? id : null;
}

function asEmailLocale(value: string): "en" | "de" | "fr" | "ar" {
  if (value === "de" || value === "fr" || value === "ar") return value;
  return "en";
}

async function afterOpsMark(
  env: CloudflareEnv,
  booking: MarkedBooking,
): Promise<void> {
  if (!booking.email.trim()) return;
  if (!booking.paid) return;
  try {
    await notifyReviewRequest(env, {
      bookingId: booking.bookingId,
      customerEmail: booking.email,
      reference: booking.reference,
      locale: asEmailLocale(booking.locale),
      token: booking.token,
      pickupText: booking.pickupText,
      dropoffText: booking.dropoffText,
      scheduledLocal: booking.scheduledLocal,
    });
  } catch {
    // Status already committed. Mail is best-effort (D-17).
  }
}

export const PATCH = withStaff(async (claims, request) => {
  const id = bookingId(request);
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
  const record = body as Record<string, unknown>;
  const { env } = getCloudflareContext();
  const status = typeof record.status === "string" ? record.status : "";
  const arrived = record.arrived === true;

  if (arrived) {
    const result = await markArrival(env, claims, id);
    if (!result.ok) {
      if (result.code === "unpaid") return jsonErr("unpaid", 409);
      return jsonErr("not-found", 404);
    }
    return jsonOk({ id, arrived: true });
  }

  if (status === "cancelled") {
    const result = await cancelBooking(env, claims, id);
    if (!result.ok) {
      if (result.code === "frozen") return jsonErr("frozen", 409);
      if (result.code === "unknown") return jsonErr("unknown", 500);
      return jsonErr("not-found", 404);
    }
    if (result.erased) return jsonOk({ id, erased: true });
    return jsonOk({ id, status: "cancelled" });
  }

  if (status === "completed" || status === "no_show") {
    const result =
      status === "completed"
        ? await markComplete(env, claims, id)
        : await markNoShow(env, claims, id);
    if (!result.ok) {
      if (result.code === "frozen") return jsonErr("frozen", 409);
      if (result.code === "unknown") return jsonErr("unknown", 500);
      return jsonErr("not-found", 404);
    }
    await afterOpsMark(env, result.booking);
    return jsonOk({ id, status });
  }

  if (status === "refunded") {
    return jsonErr("use-refund", 400);
  }

  // 26.2 P6: places, date, time, party and class of a paid trip are priced again first.
  if (TRIP_PATCH_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(record, field))) {
    return jsonErr("use-change", 400);
  }

  // G20: a present e-mail must be a real address (same rule as checkout); absent keeps today's value.
  let email: string | undefined;
  if (Object.prototype.hasOwnProperty.call(record, "email")) {
    const raw = typeof record.email === "string" ? record.email.trim() : "";
    if (!raw || raw.length > 254 || !isCheckoutEmail(raw)) return jsonErr("invalid-email", 400);
    email = raw;
  }

  const result = await updateBooking(env, claims, id, {
    customer: typeof record.customer === "string" ? record.customer : undefined,
    email,
    phone: typeof record.phone === "string" ? record.phone : undefined,
    note: typeof record.note === "string" ? record.note : undefined,
    flight: typeof record.flight === "string" ? record.flight : undefined,
  });
  if (!result.ok) {
    if (result.code === "unpaid") return jsonErr("unpaid", 409);
    if (result.code === "unknown") return jsonErr("unknown", 500);
    return jsonErr("not-found", 404);
  }
  return jsonOk({ id, changed: result.changed, driverMailed: result.driverMailed });
});

export const DELETE = withStaff(async (claims, request) => {
  const id = bookingId(request);
  if (!id) return jsonErr("not-found", 404);
  const { env } = getCloudflareContext();
  const ok = await eraseBooking(env, claims, id);
  if (!ok) return jsonErr("not-found", 404);
  return jsonOk({ id, erased: true });
});
