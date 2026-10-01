// apps/web/app/api/auth/confirm/preview/route.ts
//
// F12. The confirm page asks "whose link is this?". Answers only the address opened from `e`
// (bound to the token_hash) or "expired". Uses nothing up, sets no cookie, never logs the address.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { checkWriteRateLimit } from "@/lib/abuse/rate-limit";
import { openAddress, sealSecretFrom } from "@/lib/auth/sealed-address";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" } as const;

export async function GET(request: Request): Promise<Response> {
  const ctx = { requestId: crypto.randomUUID(), route: "/api/auth/confirm/preview", locale: null as string | null };
  const { env } = getCloudflareContext();
  if (!env.AUTH_RATE_LIMITER) {
    log("error", "auth-confirm-preview", ctx, { reason: "auth-limiter-missing" });
  } else {
    const ip = request.headers.get("cf-connecting-ip")?.trim() || "unknown";
    const limited = await checkWriteRateLimit({ limiter: env.AUTH_RATE_LIMITER, kind: "auth", ip });
    if (!limited.ok) return Response.json({ ok: false, code: "rate_limited" }, { status: 429, headers: NO_STORE });
  }

  const params = new URL(request.url).searchParams;
  const tokenHash = params.get("token_hash") ?? "";
  const email = await openAddress(params.get("e"), tokenHash, sealSecretFrom(env));
  if (!email) return Response.json({ ok: false, code: "expired" }, { headers: NO_STORE });
  return Response.json({ ok: true, email }, { headers: NO_STORE });
}
