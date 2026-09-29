// GET /api/checkout/resume?quote=<uuid> — refill the checkout after Back from Stripe
// (D-24, D-25). Needs the matching vt_manage cookie; otherwise nothing. Never a document (D-41).

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { hashManageToken, readManageCookie } from "@/lib/checkout/manage-token";
import { resumeCheckoutWithDeps, type ResumeRow } from "@/lib/checkout/resume";
import { retrieveCheckoutSession, stripeFromEnv } from "@/lib/checkout/stripe";
import { asCheckout } from "@/lib/db/identity";

export const dynamic = "force-dynamic";

const HEADERS = { "content-type": "application/json", "cache-control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const { env } = getCloudflareContext();
    const quote = new URL(request.url).searchParams.get("quote");
    const raw = readManageCookie("", request.headers.get("cookie"));
    const answer = await resumeCheckoutWithDeps(quote, raw, {
      hashCookie: hashManageToken,
      readRow: async (quoteId, hashHex) => {
        const rows = await asCheckout(env, null, (sql) =>
          sql<ResumeRow[]>`select * from public.checkout_resume_read(${quoteId}::uuid, decode(${hashHex}, 'hex'))`,
        );
        return rows[0] ?? null;
      },
      retrieveSession: (id) => retrieveCheckoutSession(stripeFromEnv(env), id),
    });
    return new Response(JSON.stringify(answer), { headers: HEADERS });
  } catch (err) {
    console.error("checkout_resume_unhandled", err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ state: "none" }), { status: 500, headers: HEADERS });
  }
}
