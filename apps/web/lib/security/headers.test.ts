// apps/web/lib/security/headers.test.ts
//
// Wave 0 (10-01): D-32…D-38 header contract. next.config.ts headers land in 10-06.
// Funnel wins if CSP breaks checkout. No Sentry host. No vamostaxi.eu HSTS.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applySecurityHeaders, SECURITY_HEADER_PAIRS } from "./headers";
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
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Permissions-Policy")).toMatch(/camera=\(\)/);
    expect(headers.get("Permissions-Policy")).toMatch(/microphone=\(\)/);
    expect(headers.get("Permissions-Policy")).toMatch(/geolocation=\(\)/);
    expect(headers.get("Content-Security-Policy")).toBeTruthy();
  });

  it("CSP allowlists Stripe, Turnstile, Mapbox and does not include sentry.io", () => {
    const csp = headerMap().get("Content-Security-Policy") ?? "";
    expect(csp).toMatch(/js\.stripe\.com/);
    expect(csp).toMatch(/challenges\.cloudflare\.com/);
    expect(csp).toMatch(/api\.mapbox\.com/);
    // D-33: DC mocks boot React/ReactDOM/Babel from unpkg (app/support.js).
    // Babel standalone needs eval. Funnel wins over a tight script-src.
    expect(csp).toMatch(/unpkg\.com/);
    expect(csp).toMatch(/unsafe-eval/);
    expect(csp).toMatch(/unsafe-inline/);
    expect(csp).not.toMatch(/sentry\.io/);
    expect(csp).not.toMatch(/vamostaxi\.eu/);
  });

  it("CSP allows Checkout Elements, Link, and card iframes", () => {
    const csp = headerMap().get("Content-Security-Policy") ?? "";
    const tokens = (name: string): string[] => {
      const part = csp
        .split(";")
        .map((row) => row.trim())
        .find((row) => row === name || row.startsWith(`${name} `));
      return part ? part.split(/\s+/).slice(1) : [];
    };
    // Phase 20 CSP listed only js.stripe.com. Checkout ui_mode=elements,
    // Link, and nested card iframes need the extra Stripe hosts or Pay
    // (card / Link / emailed pay-link) dies in the browser.
    expect(tokens("script-src")).toEqual(
      expect.arrayContaining(["js.stripe.com", "*.js.stripe.com", "checkout.stripe.com"]),
    );
    expect(tokens("frame-src")).toEqual(
      expect.arrayContaining([
        "js.stripe.com",
        "*.js.stripe.com",
        "hooks.stripe.com",
        "checkout.stripe.com",
        "link.com",
        "*.link.com",
      ]),
    );
    expect(tokens("connect-src")).toEqual(
      expect.arrayContaining([
        "api.stripe.com",
        "checkout.stripe.com",
        "link.com",
        "*.link.com",
        "maps.googleapis.com",
      ]),
    );
    expect(tokens("img-src")).toEqual(
      expect.arrayContaining(["https://*.stripe.com", "https://*.link.com"]),
    );
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
