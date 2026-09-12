export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { MANAGE_COOKIE_NAME, hashManageToken, readManageCookie } from "@/lib/checkout/manage-token";
import { requestCustomerTimeChange } from "@/lib/ops/edit-request";
import { failStatus } from "@/lib/ops/edit-request-map";

function json(body: unknown, status = 200): Response {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function str(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export async function POST(request: Request): Promise<Response> {
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

  const scheduledLocal = str(body.scheduled_local) || str(body.scheduledLocal);
  const scheduledAt = str(body.scheduled_at) || str(body.scheduledAt) || scheduledLocal;
  const bookingKey =
    str(body.ref) || str(body.reference) || str(body.bookingId) || str(body.id);
  if (!scheduledLocal || !bookingKey) return json({ ok: false, code: "not-found" }, 404);

  const { env } = await getCloudflareContext({ async: true });
  const result = await requestCustomerTimeChange(
    env,
    { kind: "guest", manageTokenHashHex: tokenHashHex },
    bookingKey,
    { scheduledLocal, scheduledAt },
  );
  if (!result.ok) return json({ ok: false, code: result.code }, failStatus(result.code));
  return json({
    ok: true,
    requestId: result.requestId,
    bookingId: result.bookingId,
    status: result.status,
  });
}
