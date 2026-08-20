import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Points the plugin at the loader seam (D-14) rather than the default
// `./i18n/request.ts` guess, so the path stays explicit as later plans add
// more request-config responsibilities.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Never optimise via a remote loader — no third-party CDN origin (D-31).
  // Real image domains/loader config lands with Phase 5's photography.
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
