// apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/pay-link/route.ts
//
// POST /api/staff/bookings/:id/pay-link — reuse unpaid Stripe session, email
// the public vamostaxi.site URL. Dual-mounted at app/api/staff/bookings/[id]/pay-link.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { staffPayLink } from "@/lib/ops/phone-booking";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function bookingKey(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const i = parts.lastIndexOf("bookings");
  const id = parts[i + 1] ?? "";
  if (!id || id === "pay-link") return null;
  return id;
}

function failStatus(code: string): number {
  if (code === "not-found") return 404;
  if (code === "csrf") return 403;
  if (
    code === "frozen" ||
    code === "already-paid" ||
    code === "no-session" ||
    code === "session-expired" ||
    code === "no-email"
  ) {
    return 409;
  }
  if (code === "email-failed") return 502;
  return 400;
}

export const POST = withStaff(async (_claims, request) => {
  const id = bookingKey(request);
  if (!id) return jsonErr("not-found", 404);
  let sendEmail = true;
  try {
    const json: unknown = await request.json();
    if (json && typeof json === "object" && !Array.isArray(json) && "send" in json) {
      sendEmail = (json as { send: unknown }).send !== false;
    }
  } catch {
    sendEmail = true;
  }
  const { env } = getCloudflareContext();
  const result = await staffPayLink(env, id, sendEmail);
  if (!result.ok) return jsonErr(result.code, failStatus(result.code));
  return jsonOk({
    id,
    bookingId: result.bookingId,
    reference: result.reference,
    pay_url: result.payUrl,
    client_secret_hex: result.clientSecretHex,
    publishable_key: result.publishableKey,
    sent: result.sent,
  });
});
