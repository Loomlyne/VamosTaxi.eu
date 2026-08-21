import { notFound } from "next/navigation";
import type { ReactNode } from "react";

// D-28: the dev-only states gallery (`/dev/components/**`) must never be reachable in a
// production DEPLOY, and must carry a robots header instructing search engines not to
// index it in every environment (staging is where the gallery is actually reviewed, so
// a header that only applied in production would protect nothing a reviewer ever hits
// it on).
//
// A route-group LAYOUT rather than a per-page check (UI-SPEC's own proposed default,
// confirmed here): a per-page check is one file away from being forgotten the next time
// a category lands (Phase 5 could add an eighth) — a layout wrapping every current and
// future route under this segment closes that gap structurally rather than by
// discipline.
//
// `export const dynamic = "force-dynamic"` is load-bearing, not decorative. This
// project builds ONCE (`opennextjs-cloudflare build`) and deploys the SAME artifact to
// both `env.staging` and `env.production` (`apps/web/wrangler.jsonc`'s own comment: the
// two environments differ only in their runtime `vars`/bindings, injected by Cloudflare
// at request time — there is no separate "staging build"). `[locale]/layout.tsx`'s own
// `generateStaticParams` makes every route under it statically pre-rendered by default
// (confirmed directly: `pnpm build`'s own route table lists `/en/dev/components/*` etc.
// as `● (SSG) prerendered as static HTML` before this line existed) — a plain
// `NODE_ENV`/`DEPLOY_ENV` check inside a statically-generated page runs exactly ONCE,
// at BUILD time, when `DEPLOY_ENV` cannot possibly be set yet (it is a Cloudflare
// runtime `vars` binding, not a build-time Node env var) — baking the SAME "exclude"
// decision into the ONE artifact both staging and production later deploy, which would
// silently break staging's own reachability requirement (D-28/D-37) the moment
// production also builds correctly. Forcing this whole subtree dynamic makes the check
// below run PER REQUEST, at the edge, against the real `DEPLOY_ENV` the serving
// environment actually injected — the only point in this pipeline that value exists.
//
// The check: `NODE_ENV === "production"` alone is true for BOTH staging and true
// production (both are the same built-and-deployed Worker) — `DEPLOY_ENV !== "staging"`
// is what tells them apart, the same plain, non-secret marker `middleware.ts` already
// reads for D-37's noindex header (`apps/web/lib/env.d.ts`'s own comment: present under
// `env.staging`, absent under `env.production`). Local `next dev` has `NODE_ENV ===
// "development"`, so the whole condition is false there regardless of `DEPLOY_ENV` —
// the gallery resolves normally.
export const dynamic = "force-dynamic";

export default function DevLayout({ children }: { children: ReactNode }) {
  const isTrueProduction =
    process.env.NODE_ENV === "production" && process.env.DEPLOY_ENV !== "staging";
  if (isTrueProduction) {
    notFound();
  }
  return <>{children}</>;
}

// The robots header itself is NOT set here — a layout has no supported way to write a
// response header (`headers()` from `next/headers` is read-only). It is set
// unconditionally, in every environment, by `next.config.ts`'s own `headers()` rule for
// `/dev/:path*` and `/:locale/dev/:path*` — see that file's comment for why the two
// source patterns are both needed (D-11/D-12's unprefixed-English / prefixed-other-
// locales URL contract). A 404 response from this layout still carries that header
// (headers() attaches regardless of the eventual status code), which is fine — nothing
// about a 404 needs to be indexable either.
//
// STALE PLAN PATH NOTE: the plan's own artifact list names this file
// `apps/web/app/dev/layout.tsx`. That path predates the locale-scoped dev route tree
// (`apps/web/app/[locale]/dev/components/**`, established Plan 06 onward) — an
// unprefixed `apps/web/app/dev/layout.tsx` would sit OUTSIDE `[locale]` entirely and
// never wrap the real routes at all. Reconciled to the real path per this plan's own
// `<path_correction>` instruction; recorded as a deviation in the plan Summary.
