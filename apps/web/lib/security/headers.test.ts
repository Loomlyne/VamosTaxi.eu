// apps/web/lib/security/headers.test.ts
//
// Wave 0 (10-01): D-32…D-38 header contract. next.config.ts headers land in 10-06.
// Funnel wins if CSP breaks checkout. No Sentry host. No vamostaxi.eu HSTS.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applySecurityHeaders, contentSecurityPolicy, SECURITY_HEADER_PAIRS } from "./headers";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function readConfig(): string {
  return readFileSync(join(repoRoot, "apps/web/next.config.ts"), "utf8");
}

function headerMap(): Map<string, string> {
  return new Map(SECURITY_HEADER_PAIRS);
}

describe("security headers (D-32…D-38)", () => {
  it("wires next.config headers() to SECURITY_HEADER_PAIRS", () => {
    const src = readConfig();
    expect(src).toMatch(/SECURITY_HEADER_PAIRS/);
    expect(src).toMatch(/poweredByHeader:\s*false/);
    expect(src).not.toMatch(/sk_live_/);
    expect(src).not.toMatch(/\bCHF\b/);
  });

  it("emits HSTS, CSP, Referrer-Policy, Permissions-Policy, XFO, nosniff", () => {
    const headers = headerMap();
    expect(headers.get("Strict-Transport-Security")).toMatch(/max-age=31536000/);
    // Phase 28: changed on purpose; a same-site referrer is the bare origin.
    expect(headers.get("Referrer-Policy")).toBe("strict-origin");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Permissions-Policy")).toMatch(/camera=\(\)/);
    expect(headers.get("Permissions-Policy")).toMatch(/microphone=\(\)/);
    expect(headers.get("Permissions-Policy")).toMatch(/geolocation=\(\)/);
    expect(headers.get("Content-Security-Policy")).toBeTruthy();
  });

  it("CSP allowlists Turnstile, Mapbox and does not include sentry.io", () => {
    const csp = headerMap().get("Content-Security-Policy") ?? "";
    expect(csp).toMatch(/challenges\.cloudflare\.com/);
    expect(csp).toMatch(/api\.mapbox\.com/);
    // F13: React/ReactDOM/Babel are served from /assets/vendor (same origin), so no unpkg.
    // Babel standalone still needs eval. Funnel wins over a tight script-src.
    expect(csp).not.toMatch(/unpkg\.com/);
    expect(csp).toMatch(/unsafe-eval/);
    expect(csp).toMatch(/unsafe-inline/);
    expect(csp).not.toMatch(/sentry\.io/);
    expect(csp).not.toMatch(/vamostaxi\.eu/);
  });

  it("CSP allows Cloudflare Web Analytics: beacon script and its endpoint only", () => {
    const csp = headerMap().get("Content-Security-Policy") ?? "";
    expect(csp).toMatch(/script-src [^;]*static\.cloudflareinsights\.com/);
    expect(csp).toMatch(/connect-src [^;]*cloudflareinsights\.com/);
    expect(csp).not.toMatch(/frame-src [^;]*cloudflareinsights/);
  });

  it("CSP allows no Stripe or Link host: card entry is Stripe's hosted page only (D-48)", () => {
    const csp = headerMap().get("Content-Security-Policy") ?? "";
    expect(csp).not.toMatch(/stripe\.com/);
    expect(csp).not.toMatch(/link\.com/);
    expect(csp).toMatch(/frame-src challenges\.cloudflare\.com;/);
    expect(csp).not.toMatch(/maps\.googleapis\.com/);
  });

  it("the Next policy is the pre-Phase-28 string byte for byte and names no Meta host", () => {
    const csp = headerMap().get("Content-Security-Policy");
    expect(csp).toBe(
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' challenges.cloudflare.com static.cloudflareinsights.com; frame-src challenges.cloudflare.com; connect-src 'self' challenges.cloudflare.com api.mapbox.com events.mapbox.com cloudflareinsights.com; img-src 'self' data: blob: https://*.mapbox.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
    expect(csp).toBe(contentSecurityPolicy({ metaPixel: false }));
    expect(SECURITY_HEADER_PAIRS.map(([, v]) => v).join("\n")).not.toMatch(/facebook|instagram/i);
  });

  it("the Meta policy adds the script host, the beacon host and the fallback frame, nothing else", () => {
    const plain = contentSecurityPolicy({ metaPixel: false });
    const meta = contentSecurityPolicy({ metaPixel: true });
    const script = "https://connect." + "facebook" + ".net";
    const beacon = "https://www." + "facebook" + ".com";
    expect(meta).toMatch(new RegExp(`script-src [^;]*${script.replace(/\./g, "\\.")}`));
    expect(meta).toMatch(new RegExp(`img-src [^;]*${beacon.replace(/\./g, "\\.")}`));
    expect(meta).toMatch(new RegExp(`connect-src [^;]*${beacon.replace(/\./g, "\\.")}`));
    expect(meta).toMatch(new RegExp(`frame-src challenges\\.cloudflare\\.com ${beacon.replace(/\./g, "\\.")}`));
    // connect-src does NOT gain the script host (Meta's telemetry stays blocked).
    expect(meta.match(/connect-src [^;]*/)![0]).not.toContain(script);
    expect(meta).not.toMatch(/instagram|conversionsapigateway/);
    // Removing the four additions gives back the plain policy exactly.
    const stripped = meta
      .replace(` ${script}`, "")
      .split(` ${beacon}`)
      .join("");
    expect(stripped).toBe(plain);
  });

  it("keeps /dev noindex rows", () => {
    const src = readConfig();
    expect(src).toMatch(/X-Robots-Tag/);
    expect(src).toMatch(/noindex/);
    expect(src).toMatch(/\/dev\/:path\*/);
  });
});

describe("applySecurityHeaders helper", () => {
  it("sets HSTS CSP XFO nosniff and not sentry", () => {
    const headers = new Headers({ "x-powered-by": "Next.js" });
    applySecurityHeaders(headers);
    expect(headers.get("x-powered-by")).toBeNull();
    expect(headers.get("Strict-Transport-Security")).toMatch(/max-age=31536000/);
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Content-Security-Policy")).toMatch(/unsafe-eval/);
    expect(headers.get("Content-Security-Policy")).not.toMatch(/sentry\.io/);
    expect(SECURITY_HEADER_PAIRS.map(([k]) => k)).toContain("Permissions-Policy");
  });

  it("middleware applyStagingNoindex stamps SECURITY_HEADER_PAIRS", () => {
    const src = readFileSync(join(repoRoot, "apps/web/middleware.ts"), "utf8");
    const fnAt = src.indexOf("function applyStagingNoindex");
    expect(fnAt).toBeGreaterThan(-1);
    const fn = src.slice(fnAt, src.indexOf("function isNoStorePath"));
    expect(fn).toMatch(/applySecurityHeaders\(response\.headers\)/);
  });
});
