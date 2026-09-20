export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { customerClaims } from "@/lib/account/session";
import { paidCancelCustomer } from "@/lib/lifecycle/paid-cancel";
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

function bookingKey(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";
  const record = body as Record<string, unknown>;
  for (const key of ["ref", "reference", "bookingId", "id"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export async function POST(request: Request): Promise<Response> {
  const blocked = csrfForbidden(request);
  if (blocked) return blocked;
  const limited = await accountWriteForbidden(request);
  if (limited) return limited;
  const claims = await customerClaims(request);
  if (!claims?.email) return json({ ok: false, code: "unauthorized" }, 401);

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const key = bookingKey(body);
  if (!key) return json({ ok: false, code: "not-found" }, 404);

  const { env } = await getCloudflareContext({ async: true });
  const result = await paidCancelCustomer(env, claims, key);
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
