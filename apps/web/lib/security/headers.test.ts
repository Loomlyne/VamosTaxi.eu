// apps/web/lib/security/headers.test.ts
//
// Wave 0 (10-01): D-32…D-38 header contract. next.config.ts headers land in 10-06.
// Funnel wins if CSP breaks checkout. No Sentry host. No vamostaxi.eu HSTS.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function readConfig(): string {
  return readFileSync(join(repoRoot, "apps/web/next.config.ts"), "utf8");
}

describe("security headers (D-32…D-38)", () => {
  it("emits HSTS, CSP, Referrer-Policy, Permissions-Policy, X-Frame-Options", () => {
    const src = readConfig();
    expect(src).toMatch(/Strict-Transport-Security/);
    expect(src).toMatch(/max-age=31536000/);
    expect(src).toMatch(/Content-Security-Policy/);
    expect(src).toMatch(/Referrer-Policy/);
    expect(src).toMatch(/strict-origin-when-cross-origin/);
    expect(src).toMatch(/Permissions-Policy/);
    expect(src).toMatch(/camera=\(\)/);
    expect(src).toMatch(/microphone=\(\)/);
    expect(src).toMatch(/geolocation=\(\)/);
    expect(src).toMatch(/X-Frame-Options/);
    expect(src).toMatch(/DENY/);
    expect(src).not.toMatch(/sk_live_/);
    expect(src).not.toMatch(/\bCHF\b/);
  });

  it("CSP allowlists Stripe, Turnstile, Mapbox and does not include sentry.io", () => {
    const src = readConfig();
    expect(src).toMatch(/js\.stripe\.com/);
    expect(src).toMatch(/challenges\.cloudflare\.com/);
    expect(src).toMatch(/api\.mapbox\.com/);
    expect(src).not.toMatch(/sentry\.io/);
    expect(src).not.toMatch(/vamostaxi\.eu/);
  });

  it("keeps /dev noindex rows", () => {
    const src = readConfig();
    expect(src).toMatch(/X-Robots-Tag/);
    expect(src).toMatch(/noindex/);
    expect(src).toMatch(/\/dev\/:path\*/);
  });
});
