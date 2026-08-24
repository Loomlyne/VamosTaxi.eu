// apps/web/app/api/dev/db-smoke/route.ts
//
// The D-36/U24 probe — the one route this phase adds, and not a product route.
// `/api/account/bookings` and every other customer-facing surface are Phase 5.
//
// Its only job: prove that `getCloudflareContext()` -> `asAnon` -> Hyperdrive works through a
// real `opennextjs-cloudflare build`, not only `next dev` — confirming `getCloudflareContext()`'s
// "async mode" does not change this usage under the artifact that actually deploys (Pitfall 5,
// `03-RESEARCH.md`). This file is removed or superseded the moment Phase 5 lands a real
// RLS-gated route that can carry the same proof. It introduces no customer-facing copy, so no
// i18n obligation attaches to it (CLAUDE.md's four-languages rule covers visible strings; this
// route returns machine-readable JSON only, gated out of production).

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asAnon } from "@/lib/db/identity";

// Route Handlers are dynamic by default; the explicit export is what plan 03-06's grep keys
// on, and what keeps `getCloudflareContext()` away from build-time static generation
// (Pitfall 5 — no request during SSG means OpenNext falls back to dev/local binding values).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { env } = getCloudflareContext();

  // Fail-closed, exactly the dev gallery's own gate (`apps/web/app/[locale]/dev/layout.tsx`):
  // `NODE_ENV === "production"` alone is true for BOTH staging and true production (one
  // built-and-deployed Worker serves both) — `DEPLOY_ENV === "staging"` is the plain,
  // non-secret marker that tells them apart. A genuine production deploy of this same
  // artifact therefore cannot reach the body below, regardless of the URL it is requested at.
  const isTrueProduction = process.env.NODE_ENV === "production" && env.DEPLOY_ENV !== "staging";
  if (isTrueProduction) {
    return new Response(null, { status: 404 });
  }

  const url = new URL(request.url);

  if (url.searchParams.get("probe") === "fail") {
    // The deliberately fail-closed half: `vamos_edge` (dropped to the anonymous role by
    // `asAnon`) holds no grant on `public.bookings` (Phase 2's RLS/grant migrations) — this
    // demonstrates D-10's "a forgotten wrapper gets 42501" claim from the OTHER direction,
    // a correctly-used wrapper hitting a table its role was never granted. Only the SQLSTATE
    // crosses the response boundary — never `err.message`, which could carry schema detail.
    try {
      await asAnon(env, (tx) => tx`select id from public.bookings limit 1`);
      return Response.json({ sqlstate: null });
    } catch (err) {
      return Response.json({ sqlstate: (err as { code?: string })?.code ?? "unknown" });
    }
  }

  // `select 1` needs no table grant, so this stays green against a `db:reset`-fresh database
  // whether or not Phase 2's later migrations have landed — the point is proving the
  // OpenNext -> Hyperdrive path itself, not any one table's policy.
  const rows = await asAnon(env, (tx) => tx`select 1 as ok`);
  return Response.json({ ok: true, rows });
}
