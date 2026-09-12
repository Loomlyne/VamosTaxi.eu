// apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/route.ts
//
// PATCH /api/staff/bookings/:id — cancel, complete, no-show, or in-place field update.
// DELETE — soft-delete (erased_at). Dual-mounted at app/api/staff/bookings/[id].
// Refund is POST /api/staff/bookings/:id/refund (Stripe first).
// D-31: completed / no_show go through ops_mark_* RPCs, never a client status write.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { notifyReviewRequest } from "@/lib/lifecycle/notify-lifecycle";
import {
  cancelBooking,
  eraseBooking,
  markComplete,
  markNoShow,
  updateBooking,
  type MarkedBooking,
} from "@/lib/ops/bookings-write";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

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
  status: "completed" | "no_show",
): Promise<void> {
  if (!booking.email.trim()) return;
  if (!booking.paid) return;
  if (status === "no_show" && !booking.paid) return;
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

  if (status === "cancelled") {
    const result = await cancelBooking(env, claims, id);
    if (!result.ok) {
      if (result.code === "frozen") return jsonErr("frozen", 409);
      if (result.code === "unknown") return jsonErr("unknown", 500);
      return jsonErr("not-found", 404);
    }
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
    await afterOpsMark(env, result.booking, status);
    return jsonOk({ id, status });
  }

  if (status === "refunded") {
    return jsonErr("use-refund", 400);
  }

  const result = await updateBooking(env, claims, id, {
    customer: typeof record.customer === "string" ? record.customer : undefined,
    email: typeof record.email === "string" ? record.email : undefined,
    phone: typeof record.phone === "string" ? record.phone : undefined,
    note: typeof record.note === "string" ? record.note : undefined,
    pickup: typeof record.pickup === "string" ? record.pickup : undefined,
    dropoff: typeof record.dropoff === "string" ? record.dropoff : undefined,
    dateIso: typeof record.dateIso === "string" ? record.dateIso : undefined,
    time: typeof record.time === "string" ? record.time : undefined,
    pax: typeof record.pax === "number" ? record.pax : undefined,
    bags: typeof record.bags === "number" ? record.bags : undefined,
    flight: typeof record.flight === "string" ? record.flight : undefined,
    klass: typeof record.klass === "string" ? record.klass : undefined,
  });
  if (!result.ok) {
    if (result.code === "unpaid") return jsonErr("unpaid", 409);
    return jsonErr("not-found", 404);
  }
  return jsonOk({ id });
});

export const DELETE = withStaff(async (claims, request) => {
  const id = bookingId(request);
  if (!id) return jsonErr("not-found", 404);
  const { env } = getCloudflareContext();
  const ok = await eraseBooking(env, claims, id);
  if (!ok) return jsonErr("not-found", 404);
  return jsonOk({ id, erased: true });
});
