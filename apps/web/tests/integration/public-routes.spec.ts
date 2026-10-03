// apps/web/tests/integration/public-routes.spec.ts
//
// Plan 05-23 / D-01 / SITE-02 / SITE-07. The whole PUBLIC_ROUTES contract:
// every entry is reachable in all four locales, owned by a later phase
// (PHASE_5_ROUTES 7/8/9), or is `/coming-soon` (unowned, explicitly listed,
// handed to plan 05-24 — never silently absent from the sitemap).
//
// Assertions are against the raw server response (same discipline as
// ssr-locale.spec.ts), not the hydrated DOM.

import { test, expect } from "../support/test";
import { testPort } from "../support/port";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const RUN_PROJECT = "component-1440";
const LOCALES = ["en", "de", "fr", "ar"] as const;
const SITE_URL = "https://vamostaxi.site";
const UNOWNED = "/coming-soon";
const PORT = testPort(4410);

const NEXT = process.env.NEXT_BIN ?? (existsSync(NEXT_BIN) ? NEXT_BIN : join(WEB_ROOT, "../../../../apps/web/node_modules/.bin/next"));

function loadPublicRoutes(): string[] {
  const src = readFileSync(join(WEB_ROOT, "lib/metadata.ts"), "utf8");
  const block = /export const PUBLIC_ROUTES = \[([\s\S]*?)\] as const/.exec(src);
  if (!block?.[1]) throw new Error("PUBLIC_ROUTES not found in lib/metadata.ts");
  return [...block[1].matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]!);
}

function loadPhase5Routes(): { path: string; phase: number }[] {
  const src = readFileSync(join(WEB_ROOT, "lib/legal-languages.ts"), "utf8");
  const entries = [...src.matchAll(/\{\s*path:\s*"([^"]+)",\s*phase:\s*(\d+)/g)];
  if (entries.length === 0) throw new Error("PHASE_5_ROUTES entries not found");
  return entries.map((m) => ({ path: m[1] as string, phase: Number(m[2]) }));
}

function loadLegalLanguages(): Record<string, string[]> {
  const src = readFileSync(join(WEB_ROOT, "lib/legal-languages.ts"), "utf8");
  const block = /export const LEGAL_LANGUAGES[^=]*=\s*\{([\s\S]*?)\n\};/.exec(src);
  if (!block?.[1]) throw new Error("LEGAL_LANGUAGES not found");
  const out: Record<string, string[]> = {};
  for (const m of block[1].matchAll(/^\s*(\w+):\s*\[([^\]]*)\]/gm)) {
    out[m[1]!] = [...m[2]!.matchAll(/"(\w+)"/g)].map((x) => x[1]!);
  }
  return out;
}

/** The indexable pages of the SEO head table: the only ones with language addresses (owner option B, 2026-09-30). */
function loadIndexablePaths(): Set<string> {
  const table = JSON.parse(readFileSync(join(WEB_ROOT, "lib/seo/pages.json"), "utf8")) as {
    pages: { path: string; indexable?: boolean }[];
  };
  return new Set(table.pages.filter((p) => p.indexable === true).map((p) => p.path));
}

function localePath(locale: string, path: string): string {
  const suffix = path === "/" ? "" : path;
  if (locale === "en") return suffix || "/";
  return `/${locale}${suffix}`;
}

function alternateHref(locale: string, path: string): string {
  const prefix = locale === "en" ? "" : `/${locale}`;
  const suffix = path === "/" ? "" : path;
  return `${SITE_URL}${prefix}${suffix}` || `${SITE_URL}/`;
}

let devServer: ChildProcess | null = null;
let baseURL = "";

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== RUN_PROJECT) return;
  testInfo.setTimeout(180_000);
  baseURL = `http://localhost:${PORT}`;
  if (!existsSync(NEXT)) {
    throw new Error(`next binary not found at ${NEXT}`);
  }
  devServer = spawn(NEXT, ["dev", "-p", String(PORT)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: {
      ...process.env,
      SUPABASE_URL: process.env.SUPABASE_URL ?? "http://127.0.0.1:54321",
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "anon-placeholder",
    },
  });
  await waitForNextServer(baseURL, 180_000);
});

test.afterAll(() => {
  if (devServer?.pid) {
    try {
      process.kill(-devServer.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  devServer = null;
});

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "Route-contract bytes don't vary by breakpoint — runs once under component-1440.",
  );
});

test.describe("Public route contract @public-routes", () => {
  test.describe.configure({ mode: "serial" });

  test("every PUBLIC_ROUTES entry is reachable, later-owned, or explicitly unowned /coming-soon", async () => {
    const routes = loadPublicRoutes();
    const phase5 = loadPhase5Routes();
    const later = new Set(
      phase5.filter((r) => r.phase === 7 || r.phase === 8 || r.phase === 9).map((r) => r.path),
    );
    expect(routes).toContain(UNOWNED);

    const reachable: string[] = [];
    for (const path of routes) {
      if (path === UNOWNED) continue;
      if (later.has(path)) continue;
      reachable.push(path);
      for (const locale of LOCALES) {
        const res = await fetch(baseURL + localePath(locale, path));
        expect(res.status, `${locale} ${path}`).toBe(200);
      }
    }

    for (const path of routes) {
      if (path === UNOWNED || later.has(path) || reachable.includes(path)) continue;
      throw new Error(`PUBLIC_ROUTES entry "${path}" is neither reachable, later-owned, nor ${UNOWNED}`);
    }
  });

  // 26.0 (main-green-3): was a KNOWN-RED mark ("the mocks have no hreflang"). Since the SEO head table
  // (5b394833, owner option B) the served mocks carry hreflang on the indexable pages only; private pages
  // (sign-in, reset-password, account...) keep one address and no language links, by design.
  test("reachable routes carry four hreflang links plus x-default matching buildAlternates", async () => {
    const routes = loadPublicRoutes();
    const phase5 = loadPhase5Routes();
    const later = new Set(
      phase5.filter((r) => r.phase === 7 || r.phase === 8 || r.phase === 9).map((r) => r.path),
    );
    const indexable = loadIndexablePaths();
    const checked = routes.filter((path) => path !== UNOWNED && !later.has(path) && indexable.has(path));
    expect(checked.length, "indexable public routes").toBeGreaterThanOrEqual(9);
    for (const path of routes) {
      if (path === UNOWNED || later.has(path) || !indexable.has(path)) continue;
      const res = await fetch(baseURL + localePath("en", path));
      expect(res.status).toBe(200);
      const body = await res.text();
      for (const locale of LOCALES) {
        expect(body).toMatch(new RegExp(`hreflang="${locale}"`, "i"));
        expect(body).toContain(alternateHref(locale, path));
      }
      expect(body).toMatch(/hreflang="x-default"/i);
    }
  });

  test("sitemap.xml allowlist is D-30, not PUBLIC_ROUTES.length (D-30 D-31)", async () => {
    const routes = loadPublicRoutes();
    const allowlist = [
      "/",
      "/about",
      "/faq",
      "/contact",
      "/terms",
      "/privacy",
      "/imprint",
      "/cookies",
      "/cancellation",
    ];
    const forbidden = [
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
      "/coming-soon",
      "/sitemap",
    ];
    const res = await fetch(baseURL + "/sitemap.xml");
    expect(res.status).toBe(200);
    const body = await res.text();
    const urlBlocks = body.match(/<url>[\s\S]*?<\/url>/g) ?? [];
    expect(urlBlocks.length, "sitemap.xml url count must not equal PUBLIC_ROUTES").not.toBe(
      routes.length,
    );
    // 26.0: since the SEO ship every allowlisted page is listed at its en address and at /de /fr /ar.
    expect(urlBlocks.length, "sitemap.xml url count vs D-30 allowlist x 4 languages").toBe(allowlist.length * 4);
    for (const path of allowlist) {
      const locSuffix = path === "/" ? "" : path;
      const loc = `${SITE_URL}${locSuffix}`;
      expect(body).toContain(`<loc>${loc}</loc>`);
    }
    for (const path of forbidden) {
      expect(body).not.toContain(`<loc>${SITE_URL}${path}</loc>`);
    }
  });

  test("GET /en/<path> returns 308 to the unprefixed path for every reachable route", async () => {
    const routes = loadPublicRoutes();
    const phase5 = loadPhase5Routes();
    const later = new Set(
      phase5.filter((r) => r.phase === 7 || r.phase === 8 || r.phase === 9).map((r) => r.path),
    );
    for (const path of routes) {
      if (path === UNOWNED || later.has(path)) continue;
      const enPath = path === "/" ? "/en" : `/en${path}`;
      const res = await fetch(baseURL + enPath, { redirect: "manual" });
      expect(res.status, enPath).toBe(308);
      const location = res.headers.get("location") ?? "";
      const dest = location.replace(/^https?:\/\/[^/]+/, "") || "/";
      const expected = path === "/" ? "/" : path;
      expect(dest === expected || dest === expected + "/").toBe(true);
    }
  });

  test("every reachable route renders exactly one site header and one site footer", async () => {
    const routes = loadPublicRoutes();
    const phase5 = loadPhase5Routes();
    const later = new Set(
      phase5.filter((r) => r.phase === 7 || r.phase === 8 || r.phase === 9).map((r) => r.path),
    );
    for (const path of routes) {
      if (path === UNOWNED || later.has(path)) continue;
      const res = await fetch(baseURL + localePath("en", path));
      const body = await res.text();
      // A Next page renders the header and footer on the server; a served DC mock (lib/dc-mock-urls.ts,
      // middleware DC_PAGES) carries them as one <dc-import> each that the browser renders (CLAUDE.md).
      const headers = [
        ...(body.match(/<header\b[^>]*data-screen-label="Header"/g) ?? []),
        ...(body.match(/<dc-import\b[^>]*name="SiteHeader"/g) ?? []),
      ];
      const footers = [
        ...(body.match(/<footer\b[^>]*data-ft="1"/g) ?? []),
        ...(body.match(/<dc-import\b[^>]*name="SiteFooter"/g) ?? []),
      ];
      expect(headers.length, `header on ${path}`).toBe(1);
      expect(footers.length, `footer on ${path}`).toBe(1);
    }
  });

  // Corrected per D-05 (26.0): the served legal mocks carry data-vt-legal on purpose.
  test("legal routes declare exactly their LEGAL_LANGUAGES; other routes declare nothing", async () => {
    const routes = loadPublicRoutes();
    const phase5 = loadPhase5Routes();
    const later = new Set(
      phase5.filter((r) => r.phase === 7 || r.phase === 8 || r.phase === 9).map((r) => r.path),
    );
    const legal = loadLegalLanguages();
    expect(Object.keys(legal).sort()).toEqual(["cancellation", "cookies", "imprint", "privacy", "terms"]);
    for (const path of routes) {
      if (path === UNOWNED || later.has(path)) continue;
      const res = await fetch(baseURL + localePath("en", path));
      const body = await res.text();
      const declared = /data-vt-legal="([^"]*)"/.exec(body)?.[1];
      const expected = legal[path.slice(1)];
      if (expected) expect(declared, path).toBe(expected.join(" "));
      else expect(declared, path).toBeUndefined();
    }
  });
});
