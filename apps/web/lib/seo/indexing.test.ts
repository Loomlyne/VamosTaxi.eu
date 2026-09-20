// apps/web/lib/seo/indexing.test.ts
//
// Wave 0 (11-01): host-split noindex + sitemap allowlist (D-03 D-04 D-30 D-31).
// Source-read of sitemap.ts / robots.ts / metadata.ts / middleware.ts.
// Do not edit those production files here — 11-05 greens the RED assertions.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");

function source(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

function loadExportedStringArray(src: string, name: string): string[] {
  const start = src.indexOf(`export const ${name} = [`);
  if (start < 0) throw new Error(`${name} not found`);
  const open = src.indexOf("[", start);
  const close = src.indexOf("]", open);
  if (open < 0 || close < 0) throw new Error(`${name} block not found`);
  return src
    .slice(open, close + 1)
    .split("\n")
    .map((line) => {
      const inner = line.indexOf('"');
      const last = line.lastIndexOf('"');
      if (inner < 0 || last <= inner) return null;
      return line.slice(inner + 1, last);
    })
    .filter((path): path is string => path != null && path.startsWith("/"));
}

const SITEMAP_ALLOWLIST = [
  "/",
  "/about",
  "/faq",
  "/contact",
  "/terms",
  "/privacy",
  "/imprint",
  "/cookies",
  "/cancellation",
] as const;

const SITEMAP_FORBIDDEN = [
  "/checkout",
  "/confirmation",
  "/bookings",
  "/account",
  "/sign-in",
  "/sign-up",
  "/manage-booking",
  "/reset-password",
  "/ops",
  "/dev",
  "/review",
] as const;

describe("host-split noindex (D-03 D-04)", () => {
  it("applyStagingNoindex noindexes dashboard/ops-changes, not public staging", () => {
    const mw = source("middleware.ts");
    const fn = /function applyStagingNoindex\([\s\S]*?\n\}/.exec(mw)?.[0] ?? "";
    expect(fn.length).toBeGreaterThan(0);
    expect(fn).toMatch(/isDashboardHost/);
    expect(fn).toMatch(/ops-changes/);
    expect(fn).not.toMatch(/DEPLOY_ENV === "staging"/);
  });

  it("final i18n block does not stamp noindex on public DEPLOY_ENV=staging", () => {
    const mw = source("middleware.ts");
    expect(mw).not.toMatch(
      /if \(process\.env\.DEPLOY_ENV === "staging"\) \{\s*finalResponse\.headers\.set\("X-Robots-Tag", "noindex"\);/,
    );
    expect(mw).toMatch(/isDashboardHost/);
  });

  it("names public hosts vamostaxi.site and www.vamostaxi.site as indexable (D-03)", () => {
    const mw = source("middleware.ts");
    expect(mw).toMatch(/vamostaxi\.site/);
    expect(mw).toMatch(/www\.vamostaxi\.site|isDashboardHost/);
  });
});

describe("SITEMAP_ROUTES vs PUBLIC_ROUTES (D-30 D-31)", () => {
  it("sitemap.ts walks SITEMAP_ROUTES, not PUBLIC_ROUTES.map", () => {
    const sitemap = source("app/sitemap.ts");
    expect(sitemap).toMatch(/SITEMAP_ROUTES/);
    expect(sitemap).not.toMatch(/return PUBLIC_ROUTES\.map/);
  });

  it("SITEMAP_ROUTES is the nine D-30 paths and not PUBLIC_ROUTES length", () => {
    const sitemap = source("app/sitemap.ts");
    const metadata = source("lib/metadata.ts");
    const sitemapRoutes = loadExportedStringArray(sitemap, "SITEMAP_ROUTES");
    const publicRoutes = loadExportedStringArray(metadata, "PUBLIC_ROUTES");
    expect([...sitemapRoutes].sort()).toEqual([...SITEMAP_ALLOWLIST].sort());
    expect(sitemapRoutes.length).not.toBe(publicRoutes.length);
    expect(publicRoutes).toContain("/coming-soon");
    expect(publicRoutes).toContain("/sitemap");
    expect(publicRoutes).toContain("/sign-up");
  });

  it("SITEMAP_ROUTES omits D-31 paths", () => {
    const sitemap = source("app/sitemap.ts");
    const sitemapRoutes = loadExportedStringArray(sitemap, "SITEMAP_ROUTES");
    for (const path of SITEMAP_FORBIDDEN) {
      expect(sitemapRoutes).not.toContain(path);
    }
    expect(sitemapRoutes).not.toContain("/coming-soon");
    expect(sitemapRoutes).not.toContain("/sitemap");
  });
});

describe("robots disallows D-31 (D-31)", () => {
  it("robots.ts disallows checkout/account/auth/ops/dev paths", () => {
    const robots = source("app/robots.ts");
    for (const path of SITEMAP_FORBIDDEN) {
      expect(robots).toContain(`"${path}"`);
    }
  });

  it("/dev stays disallowed (keep /dev noindex)", () => {
    const robots = source("app/robots.ts");
    expect(robots).toMatch(/"\/dev"/);
  });

  it("review token URLs are disallowed and HTTP noindex", () => {
    const robots = source("app/robots.ts");
    expect(robots).toContain('"/review"');
    const review = source("app/[locale]/review/page.tsx");
    expect(review).toMatch(/robots:\s*\{\s*index:\s*false/);
    const config = source("next.config.ts");
    expect(config).toMatch(/source:\s*"\/review"/);
    expect(config).toMatch(/source:\s*"\/:locale\/review"/);
  });

  it("confirmation and pay-token pages set robots noindex", () => {
    const confirmation = source("app/[locale]/confirmation/page.tsx");
    expect(confirmation).toMatch(/robots:\s*\{\s*index:\s*false/);
    const confirmationRef = source("app/[locale]/confirmation/[ref]/page.tsx");
    expect(confirmationRef).toContain("const robots = { index: false, follow: false }");
    const pay = source("app/[locale]/checkout/pay/[token]/page.tsx");
    expect(pay).toMatch(/robots:\s*\{\s*index:\s*false/);
  });
});
