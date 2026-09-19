export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { customerClaims } from "@/lib/account/session";
import { writeCustomerFlightNo } from "@/lib/ops/edit-request";
import { failStatus } from "@/lib/ops/edit-request-map";
import { csrfForbidden } from "@/lib/security/origin";

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
  const blocked = csrfForbidden(request);
  if (blocked) return blocked;
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

  const flightNo = str(body.flight_no) || str(body.flightNo) || str(body.flight);
  const bookingKey =
    str(body.ref) || str(body.reference) || str(body.bookingId) || str(body.id);
  if (!flightNo || !bookingKey) return json({ ok: false, code: "not-found" }, 404);

  const { env } = await getCloudflareContext({ async: true });
  const result = await writeCustomerFlightNo(
    env,
    { kind: "customer", claims },
    bookingKey,
    flightNo,
  );
  if (!result.ok) return json({ ok: false, code: result.code }, failStatus(result.code));
  return json({ ok: true, bookingId: result.bookingId, flightNo: result.flightNo });
}
