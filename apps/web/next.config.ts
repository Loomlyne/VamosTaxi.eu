import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Points the plugin at the loader seam (D-14) rather than the default
// `./i18n/request.ts` guess, so the path stays explicit as later plans add
// more request-config responsibilities.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
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
    return [
      { source: "/dev/:path*", headers: noindex },
      { source: "/:locale/dev/:path*", headers: noindex },
    ];
  },
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
