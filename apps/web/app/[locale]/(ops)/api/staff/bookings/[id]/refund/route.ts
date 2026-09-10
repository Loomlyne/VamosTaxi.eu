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

export const POST = withStaff(async (claims, request) => {
  const id = bookingKey(request);
  if (!id) return jsonErr("not-found", 404);
  const { env } = getCloudflareContext();
  const result = await refundBooking(env, claims, id);
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
