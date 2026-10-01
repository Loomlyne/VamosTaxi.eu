export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { MANAGE_COOKIE_NAME, hashManageToken, readManageCookie } from "@/lib/checkout/manage-token";
import { paidCancelGuest } from "@/lib/lifecycle/paid-cancel";
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

function failStatus(code: string): number {
  if (code === "not-found") return 404;
  if (code === "not-cancellable" || code === "unpaid-use-hard-delete" || code === "wrong-booking") return 409;
  if (code === "stripe-failed" || code === "stripe-test-only") return 502;
  if (code === "unauthorized") return 401;
  return 500;
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
  if (!tokenHashHex) return json({ ok: false, code: "not-found" }, 404);
  // vt_manage is one cookie for the whole site: the page names the booking it shows, and a cancel for any
  // other booking than the cookie's is refused (409 wrong-booking), never carried out on the cookie's one.
  const bookingKey = str(body.ref) || str(body.reference) || str(body.bookingId) || str(body.id);

  const { env } = await getCloudflareContext({ async: true });
  const result = await paidCancelGuest(env, tokenHashHex, bookingKey);
  if (!result.ok) return json({ ok: false, code: result.code }, failStatus(result.code));
  return json({
    ok: true,
    bookingId: result.bookingId,
    refundMode: result.refundMode,
    refundStatus: result.refundStatus,
    refundRappen: result.refundRappen,
    payoutCountry: result.payoutCountry ?? null,
    availableOn: result.availableOn ?? null,
  });
}
