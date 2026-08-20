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
