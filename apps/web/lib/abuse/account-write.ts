// apps/web/lib/abuse/account-write.ts
//
// Cookie-backed account/manage POSTs already Origin-CSRF. This is the
// IP hammer on cancel / paid-cancel / edit / prefs. Fail-open when the
// Workers binding is missing (local next). checkWriteRateLimit itself
// is fail-closed on a live limiter throw.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { log } from "../logger";
import { checkWriteRateLimit } from "./rate-limit";

let missingBindingLogged = false;

export async function accountWriteForbidden(request: Request): Promise<Response | null> {
  try {
    const { env } = getCloudflareContext();
    if (!env.QUOTE_RATE_LIMITER_BARE) {
      // 26.2 audit: the header promised fail-open here, but checkWriteRateLimit fails closed
      // on a limiter that is not there (429 on every write). Let the request through and say so once.
      if (!missingBindingLogged) {
        missingBindingLogged = true;
        log("warn", "account_write_limiter_missing", {
          requestId: "abuse",
          route: "account-write",
          locale: null,
        });
      }
      return null;
    }
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
