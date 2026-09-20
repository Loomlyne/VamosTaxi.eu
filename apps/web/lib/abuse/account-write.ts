// apps/web/lib/abuse/account-write.ts
//
// Cookie-backed account/manage POSTs already Origin-CSRF. This is the
// IP hammer on cancel / paid-cancel / edit / prefs. Fail-open when the
// Workers binding is missing (local next). checkWriteRateLimit itself
// is fail-closed on a live limiter throw.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { checkWriteRateLimit } from "./rate-limit";

export async function accountWriteForbidden(request: Request): Promise<Response | null> {
  try {
    const { env } = getCloudflareContext();
    const ip = request.headers.get("cf-connecting-ip")?.trim() || "unknown";
    const limited = await checkWriteRateLimit({
      limiter: env.QUOTE_RATE_LIMITER_BARE,
      kind: "account",
      ip,
    });
    if (!limited.ok) {
      return Response.json(
        { ok: false, code: "rate_limited" },
        { status: 429, headers: { "cache-control": "private, no-store" } },
      );
    }
    return null;
  } catch {
    return null;
  }
}
