// apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/voucher/route.ts
//
// POST /api/staff/bookings/:id/voucher — resend confirmation mail.
// Dual-mounted at app/api/staff/bookings/[id]/voucher.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";
import { resendVoucher } from "@/lib/ops/voucher";

export const dynamic = "force-dynamic";

function bookingKey(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const i = parts.lastIndexOf("bookings");
  const id = parts[i + 1] ?? "";
  if (!id || id === "voucher") return null;
  return id;
}

function failStatus(code: string): number {
  if (code === "not-found") return 404;
  if (code === "csrf") return 403;
  if (code === "not-paid" || code === "no-email") return 409;
  if (code === "email-failed") return 502;
  return 400;
}

export const POST = withStaff(async (claims, request) => {
  const id = bookingKey(request);
  if (!id) return jsonErr("not-found", 404);
  const { env } = getCloudflareContext();
  const result = await resendVoucher(env, claims, id);
  if (!result.ok) return jsonErr(result.code, failStatus(result.code));
  return jsonOk({ id, email: result.email });
});
