// apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/route.ts
//
// PATCH /api/staff/bookings/:id — cancel, refund, or in-place field update.
// DELETE — soft-delete (erased_at). Dual-mounted at app/api/staff/bookings/[id].

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { sendRefund } from "@vamos/emails/confirmation";
import type { EmailLocale } from "@vamos/emails/confirmation";
import { cancelBooking, eraseBooking, markRefunded, updateBooking } from "@/lib/ops/bookings-write";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function bookingId(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const id = parts.at(-1) ?? "";
  return id.length > 0 ? id : null;
}

function emailLocale(raw: string): EmailLocale {
  if (raw === "de" || raw === "fr" || raw === "ar") return raw;
  return "en";
}

async function refundMail(
  env: CloudflareEnv,
  kind: "pending" | "issued",
  row: { email: string; name: string; locale: string; reference: string },
) {
  if (!row.email) return;
  await sendRefund(
    { RESEND_API_KEY: env.RESEND_API_KEY ?? "" },
    {
      locale: emailLocale(row.locale),
      kind,
      to: row.email,
      name: row.name || "there",
      reference: row.reference,
    },
  );
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
    const row = await cancelBooking(env, claims, id);
    if (!row) return jsonErr("not-found", 404);
    if (row.paid) await refundMail(env, "pending", row);
    return jsonOk({ id, status: "cancelled" });
  }

  if (status === "refunded") {
    const row = await markRefunded(env, claims, id);
    if (!row) return jsonErr("not-found", 404);
    await refundMail(env, "issued", row);
    return jsonOk({ id, status: "refunded" });
  }

  const ok = await updateBooking(env, claims, id, {
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
  if (!ok) return jsonErr("not-found", 404);
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
