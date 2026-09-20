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

function failStatus(code: string): number {
  if (code === "not-found") return 404;
  if (code === "not-cancellable" || code === "unpaid-use-hard-delete") return 409;
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
  let raw = readManageCookie(
    jar.get(MANAGE_COOKIE_NAME)?.value ?? "",
    request.headers.get("cookie"),
  );
  if (!raw) {
    try {
      const body = await request.json();
      if (body && typeof body === "object" && !Array.isArray(body)) {
        const token = (body as { token?: unknown }).token;
        if (typeof token === "string") raw = token.trim();
      }
    } catch {
      raw = "";
    }
  }
  const tokenHashHex = raw ? await hashManageToken(raw) : "";
  if (!tokenHashHex) return json({ ok: false, code: "not-found" }, 404);

  const { env } = await getCloudflareContext({ async: true });
  const result = await paidCancelGuest(env, tokenHashHex);
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
