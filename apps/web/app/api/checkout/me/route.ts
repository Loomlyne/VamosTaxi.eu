// GET /api/checkout/me — signed-in prefill for the one-page checkout (D-13).
// No input. Guests get { signed_in: false }. Never a document (D-41).

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { customerClaims } from "@/lib/account/session";
import { resolveActorCustomerId } from "@/lib/checkout/actor-customer";
import { meWithDeps, type MeRow } from "@/lib/checkout/me";
import { asCustomer } from "@/lib/db/identity";

export const dynamic = "force-dynamic";

const HEADERS = { "content-type": "application/json", "cache-control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const { env } = getCloudflareContext();
    const claims = await customerClaims(request);
    if (!claims) return new Response(JSON.stringify({ signed_in: false }), { headers: HEADERS });
    const answer = await meWithDeps({
      customerId: () => resolveActorCustomerId(env, request),
      readOwnRow: async () => {
        const rows = await asCustomer(env, claims, (sql) =>
          sql<MeRow[]>`select full_name, email::text as email, phone from public.customers limit 1`,
        );
        return rows[0] ?? null;
      },
    });
    return new Response(JSON.stringify(answer), { headers: HEADERS });
  } catch (err) {
    console.error("checkout_me_unhandled", err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ signed_in: false }), { headers: HEADERS });
  }
}
