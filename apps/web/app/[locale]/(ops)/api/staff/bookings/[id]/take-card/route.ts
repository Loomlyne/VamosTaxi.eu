// apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/take-card/route.ts
//
// POST /api/staff/bookings/:id/take-card — the Stripe-hosted Checkout URL for this unpaid booking (D-48). Staff open it in a new tab.
// Dual-mounted at app/api/staff/bookings/[id]/take-card.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { staffTakeCard } from "@/lib/ops/phone-booking";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

function bookingKey(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const i = parts.lastIndexOf("bookings");
  const id = parts[i + 1] ?? "";
  if (!id || id === "take-card") return null;
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
  const origin = request.headers.get("origin") ?? "https://dashboard.vamostaxi.site";
  const result = await staffTakeCard(env, id, origin);
  if (!result.ok) return jsonErr(result.code, failStatus(result.code));
  return jsonOk({ id, bookingId: result.bookingId, reference: result.reference, url: result.url });
});
