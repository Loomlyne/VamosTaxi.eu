export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";
import { customerClaims } from "@/lib/account/session";
import { BOOKING_REFERENCE_RE, readBookingStatus } from "@/lib/checkout/booking-read";
import { MANAGE_COOKIE_NAME, readManageCookie } from "@/lib/checkout/manage-token";

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

const HIDDEN = { visible: false as const };

export async function GET(
  request: Request,
  context: { params: Promise<{ ref: string }> },
): Promise<Response> {
  const { ref } = await context.params;
  if (!BOOKING_REFERENCE_RE.test(ref)) {
    return json(HIDDEN);
  }

  const jar = await cookies();
  const raw = readManageCookie(jar.get(MANAGE_COOKIE_NAME)?.value ?? "", request.headers.get("cookie"));

  let env: CloudflareEnv | null = null;
  try {
    env = getCloudflareContext().env as CloudflareEnv;
  } catch {
    env = null;
  }
  if (!env) {
    return json(HIDDEN);
  }

  try {
    const claims = await customerClaims(request);
    const result = await readBookingStatus(env, raw, ref, claims);
    if (!result.visible) {
      return json(HIDDEN);
    }
    return json({
      status: result.status,
      paymentStatus: result.paymentStatus,
    });
  } catch {
    return json(HIDDEN);
  }
}
