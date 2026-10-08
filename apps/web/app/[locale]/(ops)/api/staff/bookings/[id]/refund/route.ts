// apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts
//
// POST /api/staff/bookings/:id/refund — the admin's refund, by hand (26.1-17, 20-10). Admin only.
//   {}                          everything left on every payment
//   { percent: 0-100 }          the percent of what was paid on each chosen payment (integer)
//   { amountRappen }            an exact amount, one payment only (legacy name: rappen); never with percent
//   { paymentId }               only that payment (with percent or amountRappen, or alone = all that is left)
//   { postTrip: true }          D-25: accept a post-trip request (all that is left, reason post_trip)
//   { retry: true }             resume the open parts only; 409 nothing-to-retry when none
// A booking cancelled more than 24 h ahead takes 100 % only (409 full-refund-only otherwise).
// A payment settled for the booking in the same instant: 409 payment-changed, nothing written, press again.
// Some parts failed: 502 refund-partial | stripe-failed with refundedRappen, dueRappen, parts.
// The "Refund issued" mail goes once, when the batch is complete.
// GET returns the payments, open parts and the due amount for the picker and after a reload.
// Decline / reject live on ./refund-decision. Dual-mounted at app/api/staff/bookings/[id]/refund.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { sendRefund, refundMailRecipients } from "@vamos/emails/confirmation";
import type { EmailLocale } from "@vamos/emails/confirmation";
import { loadRefundPicker, refundBooking } from "@/lib/ops/refund";
import { parseRefundBody, refundFailStatus, type RefundRequest } from "@/lib/ops/refund-map";
import { jsonErr, jsonOk, withAdmin } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function bookingKey(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const i = parts.lastIndexOf("bookings");
  const id = parts[i + 1] ?? "";
  if (!id || id === "refund") return null;
  return id;
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
  if (!result.ok) {
    if ("parts" in result) {
      return jsonErr(result.code, 502, {
        refundedRappen: result.refundedRappen,
        dueRappen: result.dueRappen,
        parts: result.parts,
      });
    }
    return jsonErr(result.code, refundFailStatus(result.code));
  }

  // 20-10: "Refund issued" goes once, when nothing is owed any more. A full refund sent one
  // payment at a time stays pending_ops until the last one, so the customer gets one mail.
  if (result.refundStatus === "refunded") {
    const recipients = refundMailRecipients(result.contactEmail, result.payerEmail);
    for (const to of recipients) {
      await sendRefund(
        { RESEND_API_KEY: env.RESEND_API_KEY ?? "" },
        {
          locale: emailLocale(result.locale),
          kind: "issued",
          to,
          // J8 (W6-17): no English "there" in de/fr/ar; a blank name gets a thanks without one. The amount is what
          // is refunded on this booking in total (the mail goes once, when nothing is owed any more).
          name: result.contactName,
          reference: result.reference,
          amountRappen: result.refundedRappen,
        },
      );
    }
  }

  return jsonOk({
    id,
    bookingId: result.bookingId,
    status: result.refundStatus,
    refundId: result.refundId,
    refundedRappen: result.refundedRappen,
    dueRappen: result.dueRappen,
    parts: result.parts,
  });
});

export const GET = withAdmin(async (claims, request) => {
  const id = bookingKey(request);
  if (!id) return jsonErr("not-found", 404);
  const { env } = getCloudflareContext();
  const picker = await loadRefundPicker(env, claims, id);
  if (!picker.ok) return jsonErr(picker.code, refundFailStatus(picker.code));
  const { ok: _ok, ...data } = picker;
  return jsonOk({ id, ...data });
});
