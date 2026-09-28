// apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts
//
// POST /api/staff/bookings/:id/refund — Stripe-first refund, admin only (26.1-17).
//   {}                 full remaining (today's behaviour)
//   { percent: 0-100 } D-24: the admin's percentage of captured (integer)
//   { postTrip: true } D-25: accept a post-trip request (full remaining, reason post_trip)
//   { rappen }         09-05: an exact amount, capped at the remaining capture
// Decline / reject live on ./refund-decision. Dual-mounted at app/api/staff/bookings/[id]/refund.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { sendRefund, refundMailRecipients } from "@vamos/emails/confirmation";
import type { EmailLocale } from "@vamos/emails/confirmation";
import { refundBooking } from "@/lib/ops/refund";
import { parseRefundBody, type RefundRequest } from "@/lib/ops/refund-map";
import { jsonErr, jsonOk, withAdmin } from "@/lib/ops/staff-json";

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
  if (code === "csrf" || code === "not-admin") return 403;
  if (
    code === "frozen" ||
    code === "not-paid" ||
    code === "already-refunded" ||
    code === "not-post-trip" ||
    code === "refund-exceeds-remaining"
  ) {
    return 409;
  }
  if (code === "stripe-failed" || code === "stripe-test-only") return 502;
  return 400;
}

function emailLocale(raw: string): EmailLocale {
  if (raw === "de" || raw === "fr" || raw === "ar") return raw;
  return "en";
}

export const POST = withAdmin(async (claims, request) => {
  const id = bookingKey(request);
  if (!id) return jsonErr("not-found", 404);
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  // T-26.1-54: integer percent 0-100 ("invalid-percent"); the amount is computed server-side.
  const parsed = parseRefundBody(body);
  if (!parsed.ok) return jsonErr(parsed.code, 400);
  const requested: RefundRequest = parsed.value;
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
