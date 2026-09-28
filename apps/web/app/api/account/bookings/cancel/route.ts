export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { cancelUnpaidForCustomer } from "@/lib/checkout/cancel-unpaid";
import { customerClaims } from "@/lib/account/session";
import { accountWriteForbidden } from "@/lib/abuse/account-write";
import { csrfForbidden } from "@/lib/security/origin";

function json(body: unknown, status = 200): Response {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const blocked = csrfForbidden(request);
  if (blocked) return blocked;
  const limited = await accountWriteForbidden(request);
  if (limited) return limited;
  const claims = await customerClaims(request);
  if (!claims || !claims.email) return json({ ok: false }, 401);

  let ref = "";
  try {
    const body = (await request.json()) as { ref?: unknown };
    if (typeof body.ref === "string") ref = body.ref.trim();
  } catch {
    return json({ ok: false }, 400);
  }
  if (!/^VT-\d{2}-\d{4}$/i.test(ref)) return json({ ok: false }, 400);

  const { env } = await getCloudflareContext({ async: true });
  try {
    const result = await cancelUnpaidForCustomer(env, claims, ref);
    return json({ ok: true, cancelled: result.cancelled });
  } catch {
    return json({ ok: false }, 409);
  }
}
