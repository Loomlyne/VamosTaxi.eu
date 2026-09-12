// apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts
//
// POST /api/staff/bookings/:id/refund — Stripe-first full refund.
// Dual-mounted at app/api/staff/bookings/[id]/refund.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { sendRefund, refundMailRecipients } from "@vamos/emails/confirmation";
import type { EmailLocale } from "@vamos/emails/confirmation";
import { refundBooking } from "@/lib/ops/refund";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function bookingKey(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const i = parts.lastIndexOf("bookings");
  const id = parts[i + 1] ?? "";
  if (!id || id === "refund") return null;
  return id;
}

function failStatus(code: string): number {
  if (code === "not-found") return 404;
  if (code === "csrf") return 403;
  if (code === "frozen" || code === "not-paid" || code === "already-refunded") return 409;
  if (code === "stripe-failed" || code === "stripe-test-only") return 502;
  return 400;
}

function emailLocale(raw: string): EmailLocale {
  if (raw === "de" || raw === "fr" || raw === "ar") return raw;
  return "en";
}

function requestedAmount(body: unknown): { percent?: number; rappen?: number } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const record = body as Record<string, unknown>;
  const out: { percent?: number; rappen?: number } = {};
  if (typeof record.percent === "number" && Number.isFinite(record.percent)) {
    out.percent = record.percent;
  }
  if (typeof record.rappen === "number" && Number.isFinite(record.rappen)) {
    out.rappen = Math.trunc(record.rappen);
  }
  return out;
}

export const POST = withStaff(async (claims, request) => {
  const id = bookingKey(request);
  if (!id) return jsonErr("not-found", 404);
  let requested: { percent?: number; rappen?: number } = {};
  try {
    requested = requestedAmount(await request.json());
  } catch {
    requested = {};
  }
  const { env } = getCloudflareContext();
  const result = await refundBooking(env, claims, id, requested);
  if (!result.ok) return jsonErr(result.code, failStatus(result.code));

  const recipients = refundMailRecipients(result.contactEmail, result.payerEmail);
  for (const to of recipients) {
    await sendRefund(
      { RESEND_API_KEY: env.RESEND_API_KEY ?? "" },
      {
        locale: emailLocale(result.locale),
        kind: "issued",
        to,
        name: result.contactName || "there",
        reference: result.reference,
      },
    );
  }

  return jsonOk({
    id,
    bookingId: result.bookingId,
    status: "refunded",
    refundId: result.refundId,
  });
});
