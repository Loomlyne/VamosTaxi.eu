// 26.2 P6, D19 (owner, 2026-10-01): "Resend email" on the manage link sends the confirmation again
// (fresh manage link, voucher) to the booking's own address. Same door as the flight number:
// the manage cookie, else the token in the body. A send that did not happen is an error answer.
export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { MANAGE_COOKIE_NAME, hashManageToken, readManageCookie } from "@/lib/checkout/manage-token";
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
  const jar = await cookies();
  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    body = {};
  }

  let raw = readManageCookie(
    jar.get(MANAGE_COOKIE_NAME)?.value ?? "",
    request.headers.get("cookie"),
  );
  if (!raw) raw = str(body.token);
  const tokenHashHex = raw ? await hashManageToken(raw) : "";
  const bookingKey =
    str(body.ref) || str(body.reference) || str(body.bookingId) || str(body.id);
  if (!tokenHashHex || !bookingKey) return json({ ok: false, code: "not-found" }, 404);

  const { env } = await getCloudflareContext({ async: true });
  const result = await resendCustomerConfirmation(
    env,
    { kind: "guest", manageTokenHashHex: tokenHashHex },
    bookingKey,
  );
  if (!result.ok) return json({ ok: false, code: result.code }, result.code === "not-found" ? 404 : 502);
  return json({ ok: true, bookingId: result.bookingId, email: result.email });
}
