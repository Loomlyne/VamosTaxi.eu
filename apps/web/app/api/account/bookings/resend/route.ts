// 26.2 P6, D19 (owner, 2026-10-01): "Resend email" on the signed-in booking view sends the
// confirmation again (fresh manage link, voucher) to the booking's own address, for a booking the
// signed-in customer may see. A send that did not happen is an error answer.
export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { customerClaims } from "@/lib/account/session";
import { resendCustomerConfirmation } from "@/lib/checkout/customer-resend";
import { accountWriteForbidden } from "@/lib/abuse/account-write";
import { csrfForbidden } from "@/lib/security/origin";

function json(body: unknown, status = 200): Response {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}

function str(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export async function POST(request: Request): Promise<Response> {
  const blocked = csrfForbidden(request);
  if (blocked) return blocked;
  const limited = await accountWriteForbidden(request);
  if (limited) return limited;
  const claims = await customerClaims(request);
  if (!claims?.email || !claims.sub) return json({ ok: false, code: "unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    body = {};
  }

  const bookingKey =
    str(body.ref) || str(body.reference) || str(body.bookingId) || str(body.id);
  if (!bookingKey) return json({ ok: false, code: "not-found" }, 404);

  const { env } = await getCloudflareContext({ async: true });
  const result = await resendCustomerConfirmation(env, { kind: "customer", claims }, bookingKey);
  if (!result.ok) return json({ ok: false, code: result.code }, result.code === "not-found" ? 404 : 502);
  return json({ ok: true, bookingId: result.bookingId, email: result.email });
}
