// apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/extra-pay/route.ts
//
// POST /api/staff/bookings/:id/extra-pay — the Stripe-hosted URL of the open extra-fare (difference) session (D-48).
// Dual-mounted at app/api/staff/bookings/[id]/extra-pay.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { staffExtraPayUrl } from "@/lib/ops/edit-request";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function bookingKey(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const i = parts.lastIndexOf("bookings");
  const id = parts[i + 1] ?? "";
  if (!id || id === "extra-pay") return null;
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
    code === "is-test" ||
    code === "no-email"
  ) {
    return 409;
  }
  return 400;
}

export const POST = withStaff(async (_claims, request) => {
  const id = bookingKey(request);
  if (!id) return jsonErr("not-found", 404);
  const { env } = getCloudflareContext();
  const result = await staffExtraPayUrl(env, id);
  if (!result.ok) return jsonErr(result.code, failStatus(result.code));
  return jsonOk({ id, bookingId: result.bookingId, url: result.url });
});
