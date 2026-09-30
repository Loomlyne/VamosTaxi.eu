// GET /api/consent/state — has this visitor chosen under the current policy version? (D-08)
// Read-only: never mints or sets a cookie, never returns the subject UUID, never cached.
// Guest read uses asAnon only, through lib/consent/read (public.consent_choice).

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { CONSENT_POLICY_VERSION } from "@/lib/consent/policy";
import { readConsentSubject } from "@/lib/consent/cookie";
import { readConsentChoice } from "@/lib/consent/read";
import { asAnon } from "@/lib/db/identity";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" };

/**
 * @returns 200 { ok, chosen, policyVersion, choice? } or 503 { ok:false, code:"unavailable" }.
 */
export async function GET(request: Request): Promise<Response> {
  const subject = readConsentSubject(request.headers.get("cookie"));
  if (!subject) {
    return Response.json(
      { ok: true, chosen: false, policyVersion: CONSENT_POLICY_VERSION },
      { headers: HEADERS },
    );
  }
  const { env } = getCloudflareContext();
  try {
    const choice = await asAnon(env, (tx) => readConsentChoice(tx, subject));
    if (!choice) {
      return Response.json(
        { ok: true, chosen: false, policyVersion: CONSENT_POLICY_VERSION },
        { headers: HEADERS },
      );
    }
    return Response.json(
      { ok: true, chosen: true, policyVersion: CONSENT_POLICY_VERSION, choice },
      { headers: HEADERS },
    );
  } catch {
    return Response.json({ ok: false, code: "unavailable" }, { status: 503, headers: HEADERS });
  }
}
