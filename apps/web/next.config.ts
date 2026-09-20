import { execFileSync } from "node:child_process";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { SECURITY_HEADER_PAIRS } from "./lib/security/headers";
import { resolveEngineVersion } from "./lib/version";

function gitShortSha(): string | undefined {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
    }).trim();
    return sha.length > 0 ? sha : undefined;
  } catch {
    return undefined;
  }
}

// Points the plugin at the loader seam (D-14) rather than the default
// `./i18n/request.ts` guess, so the path stays explicit as later plans add
// more request-config responsibilities.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  poweredByHeader: false,

  // Build-time pin for ENGINE_VERSION (plan 04-11). Read at request time
  // from process.env.QUOTE_ENGINE_VERSION; never recomputed per request.
  // CF_PAGES_COMMIT_SHA, then GITHUB_SHA, then git rev-parse --short HEAD.
  // The `dev-` prefix on the fallback is what makes an unversioned deploy
  // visible in a lock payload rather than indistinguishable from a real one.
  env: {
    QUOTE_ENGINE_VERSION: resolveEngineVersion({
      cfPagesCommitSha: process.env.CF_PAGES_COMMIT_SHA,
      githubSha: process.env.GITHUB_SHA,
      gitSha: gitShortSha(),
      buildTimeIso: new Date().toISOString(),
    }),
  },

  // Never optimise via a remote loader — no third-party CDN origin (D-31).
  // T-01-15: an empty remotePatterns means /_next/image can only ever
  // resolve a path under this origin's own public/ tree — it cannot be
  // used to proxy an arbitrary third-party URL. No custom `loader`/
  // `loaderFile` here: this platform's binding-based image optimization
  // (see below) serves through Next's own default `/_next/image` route,
  // not the alternate `/cdn-cgi/image/` custom-loader path, which needs a
  // live Cloudflare zone this project does not have yet (D-33/01-01
  // deferred Task 3).
  //
  // Plan 01-05 Task 3 finding, verified against a real local preview
  // (01-05-SUMMARY.md has the full curl evidence): this config alone is
  // NOT sufficient for real optimisation on this platform. Without an
  // `images: { binding: "IMAGES" }` entry in apps/web/wrangler.jsonc (out
  // of this plan's file scope — owned by Plan 01-04 in the same wave),
  // `/_next/image` returns HTTP 200 with the correct `image/*`
  // content-type but silently passes the original file through
  // unresized — every requested width returns the same untouched bytes,
  // and no Cache-Control header is set at all. That binding line is the
  // real remaining step before Phase 5 can rely on this mechanism.
  images: {
    remotePatterns: [],
  },

  // `tests/integration/dev-exclusion.spec.ts` isolation seam. That spec runs its own
  // real `next build` + two sequential `next start` processes to prove D-28's
  // exclusion against a genuine production artifact — Playwright's `fullyParallel`
  // config runs it alongside every other integration spec that spins up its own
  // `next dev` (`lenis.spec.ts`, `ssr-locale.spec.ts`, `lang-switch.spec.ts`,
  // `currency.spec.ts`), all of which default to the SAME `apps/web/.next` output
  // directory — a `next build` wiping and regenerating that directory while another
  // worker's `next dev` is mid-compile against it is a real, reproduced conflict
  // (`execFileSync` throwing during the full-suite run, confirmed independent of any
  // logic bug in either spec by re-running each file in isolation, where both pass
  // clean). `TEST_DIST_DIR`, read only when the spec sets it, routes that ONE spec's
  // build to its own directory instead — every other invocation (`pnpm build`,
  // `next dev`, every other test file) is completely unaffected, since the env var is
  // unset for all of them and `distDir` falls back to Next's own default.
  ...(process.env.TEST_DIST_DIR ? { distDir: process.env.TEST_DIST_DIR } : {}),

  // D-28: the dev-only states gallery carries `X-Robots-Tag: noindex` in EVERY
  // environment (not just production/staging — `middleware.ts`'s own D-37 header is
  // conditioned on `DEPLOY_ENV === "staging"`, which is exactly the wrong gate here:
  // staging is where the gallery is actually reviewed, so a header that only applied
  // in production would protect nothing a reviewer ever hits it on). Two source
  // patterns are both needed for the same reason `apps/web/lib/metadata.ts`'s own
  // `localizedUrl` branches on `routing.defaultLocale`: `localePrefix: "as-needed"`
  // (D-11/D-12) means English is served unprefixed (`/dev/components`) while German/
  // French/Arabic are always explicitly prefixed (`/de/dev/components`) — one pattern
  // alone would miss one of the two URL shapes. The production-exclusion itself
  // (`notFound()` when `NODE_ENV === "production"`) lives in
  // `apps/web/app/[locale]/dev/layout.tsx`, not here — a `next.config.ts` `headers()`
  // rule has no way to gate on route existence, only to attach a header to whichever
  // response a matching path produces (a 404 response still carries this header, which
  // is fine — nothing about a 404 needs to be indexable either).
  async headers() {
    const noindex = [{ key: "X-Robots-Tag", value: "noindex" }];
    // D-32…D-38. HSTS is includeSubDomains without preload. Catch-all
    // `/:path*` covers unprefixed English and prefixed de/fr/ar
    // (`localePrefix: "as-needed"`). Do not duplicate keys on /dev rows.
    const securityHeaders = SECURITY_HEADER_PAIRS.map(([key, value]) => ({
      key,
      value,
    }));
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/dev/:path*", headers: noindex },
      { source: "/:locale/dev/:path*", headers: noindex },
      { source: "/review", headers: noindex },
      { source: "/review/:path*", headers: noindex },
      { source: "/:locale/review", headers: noindex },
      { source: "/:locale/review/:path*", headers: noindex },
      { source: "/sign-in", headers: noindex },
      { source: "/:locale/sign-in", headers: noindex },
      { source: "/sign-up", headers: noindex },
      { source: "/:locale/sign-up", headers: noindex },
      { source: "/reset-password", headers: noindex },
      { source: "/:locale/reset-password", headers: noindex },
      { source: "/manage-booking", headers: noindex },
      { source: "/:locale/manage-booking", headers: noindex },
      { source: "/account", headers: noindex },
      { source: "/account/:path*", headers: noindex },
      { source: "/:locale/account", headers: noindex },
      { source: "/:locale/account/:path*", headers: noindex },
      { source: "/bookings", headers: noindex },
      { source: "/:locale/bookings", headers: noindex },
      { source: "/coming-soon", headers: noindex },
      { source: "/:locale/coming-soon", headers: noindex },
      { source: "/sitemap", headers: noindex },
      { source: "/:locale/sitemap", headers: noindex },
      { source: "/checkout", headers: noindex },
      { source: "/checkout/:path*", headers: noindex },
      { source: "/:locale/checkout", headers: noindex },
      { source: "/:locale/checkout/:path*", headers: noindex },
      { source: "/confirmation", headers: noindex },
      { source: "/confirmation/:path*", headers: noindex },
      { source: "/:locale/confirmation", headers: noindex },
      { source: "/:locale/confirmation/:path*", headers: noindex },
      { source: "/ops", headers: noindex },
      { source: "/ops/:path*", headers: noindex },
      { source: "/:locale/ops", headers: noindex },
      { source: "/:locale/ops/:path*", headers: noindex },
      { source: "/app", headers: noindex },
      { source: "/app/:path*", headers: noindex },
      {
        source: "/app/:path*.dc.html",
        headers: [
          { key: "Content-Type", value: "text/html; charset=utf-8" },
        ],
      },
    ];
  },

  // D-13: `@vamos/db`'s `exports` map (`packages/db/package.json`) points straight at
  // TypeScript source (`./src/identity.ts`, not a compiled `dist/`) — without transpiling
  // it, `next build` treats it as a pre-built dependency and every import of a named
  // wrapper's core (`@vamos/db/identity`, `@vamos/db/public`) fails to compile. This is the
  // OpenNext-importable half of D-13; the workspace dependency in `package.json` above is
  // the other half.
  transpilePackages: ["@vamos/db"],
};

// Lets `next dev` read Cloudflare bindings (KV/R2/Queues/Hyperdrive) locally
// via `wrangler`'s dev-time platform proxy — required by @opennextjs/cloudflare
// (D-04). Gated to `next dev` only: unlike the library's own internal dev/build
// heuristic, `next build` in this monorepo still evaluates this file, and would
// otherwise eagerly resolve every declared-but-unprovisioned D-34 binding (e.g.
// Hyperdrive's local connection string, not wired until Phase 3) and fail the
// build outright.
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}

export default withNextIntl(nextConfig);
