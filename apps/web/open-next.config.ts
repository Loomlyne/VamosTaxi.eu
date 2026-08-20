import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Phase 1 default: no ISR/incremental-cache override yet — the app has no
// cacheable dynamic content until later phases. Revisit once Phase 4/5 add
// pages that benefit from `incrementalCache`/`tagCache` overrides.
export default defineCloudflareConfig();
