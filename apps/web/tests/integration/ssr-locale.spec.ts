// apps/web/tests/integration/ssr-locale.spec.ts
//
// I18N-03's automated proof (01-VALIDATION.md): "asserting on the raw response body,
// not the hydrated DOM." This is the exact distinction ADR-001 exists to make possible
// — `app/vamos-locale.js`'s DOM-walking mechanism could only ever fix the *hydrated*
// page, shipping an English (and LTR) flash on every server-rendered response first. A
// `page.goto()` + DOM assertion would still pass under that old mechanism, because the
// client-side correction happens before Playwright ever looks. Every assertion here
// instead reads the bytes a plain `fetch()` receives, before any script has run.
//
// Runs against the real Next.js app (`next dev`, spawned in beforeAll), the same
// dev-server pattern tests/integration/lenis.spec.ts established — `setRequestLocale`
// (Pitfall 2) and the `[locale]` segment's `notFound()` boundary are real App Router
// behaviour a static-render harness has no way to exercise.
//
// Tagged "@ssr-locale" so `pnpm test:visual --grep @ssr-locale` (01-VALIDATION.md's own
// mapping for I18N-03/I18N-04) runs this suite alone, and the plain `pnpm test:visual`
// still picks it up as part of the full run.

import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

const RUN_PROJECT = "component-1440";
// Playwright compiles this file to CommonJS (apps/web/package.json has no "type":
// "module"), so __dirname is the plain CJS global, matching lenis.spec.ts's own
// convention. tests/integration -> tests -> apps/web.
const WEB_ROOT = join(__dirname, "..", "..");

let devServer: ChildProcess | null = null;
let baseURL = "";

async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    `Dev server at ${url} did not become ready within ${timeoutMs}ms: ${String(lastError)}`,
  );
}

test.beforeAll(async ({}, testInfo) => {
  // Only the one project this spec actually runs under spends the cost of a dev
  // server — same reasoning lenis.spec.ts's own beforeAll documents. Raw HTML bytes
  // don't vary by viewport at all, so there is nothing a second project would add.
  if (testInfo.project.name !== RUN_PROJECT) return;

  testInfo.setTimeout(90_000);

  const port = 4000 + testInfo.workerIndex;
  baseURL = `http://localhost:${port}`;
  devServer = spawn("pnpm", ["exec", "next", "dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
  });
  await waitForServer(baseURL);
});

test.afterAll(() => {
  if (devServer?.pid) {
    try {
      process.kill(-devServer.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
  devServer = null;
});

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "Raw server-rendered bytes don't vary by breakpoint — this spec runs once, under component-1440.",
  );
});

interface LocaleExpectation {
  path: string;
  dir: "ltr" | "rtl";
  title: string;
}

// The exact HomePage.title strings from apps/web/i18n/messages/{locale}.json — asserted
// against the literal migrated copy, not re-derived, so a translation regression in the
// dictionary itself would also fail this suite.
const LOCALE_EXPECTATIONS: Record<string, LocaleExpectation> = {
  en: { path: "/", dir: "ltr", title: "Fixed-price transfers, Zurich first" },
  de: { path: "/de", dir: "ltr", title: "Festpreis-Transfers, zuerst in Zürich" },
  fr: { path: "/fr", dir: "ltr", title: "Transferts à prix fixe, Zurich en premier" },
  ar: { path: "/ar", dir: "rtl", title: "نقلات بسعر ثابت، زيورخ أولاً" },
};

test.describe("Server-rendered locale @ssr-locale", () => {
  // One dev server per worker — force every test into the same worker so exactly one
  // `next dev` process ever gets spawned, matching lenis.spec.ts's own reasoning.
  test.describe.configure({ mode: "serial" });

  for (const [locale, expectation] of Object.entries(LOCALE_EXPECTATIONS)) {
    test(`${locale}: the raw response carries the correct lang/dir and the translated title before any script runs`, async () => {
      const res = await fetch(baseURL + expectation.path);
      expect(res.status).toBeLessThan(400);
      const body = await res.text();

      expect(body).toMatch(new RegExp(`<html[^>]*\\blang="${locale}"`));
      expect(body).toMatch(new RegExp(`<html[^>]*\\bdir="${expectation.dir}"`));
      expect(body).toContain(expectation.title);
    });
  }

  test("Arabic specifically carries dir=\"rtl\" in the raw response — I18N-04's own wording", async () => {
    const res = await fetch(baseURL + "/ar");
    const body = await res.text();
    expect(body).toMatch(/<html[^>]*\bdir="rtl"/);
  });

  test("home page alternates: all four languages plus the default, in the raw response", async () => {
    const res = await fetch(baseURL + "/");
    const body = await res.text();

    // Next's own metadata renderer emits the attribute as `hrefLang` (the literal JSX
    // prop name of its built-in alternate-link component) rather than the lowercase
    // `hreflang` the HTML spec's own attribute name uses — both parse identically in a
    // browser (HTML attribute matching is case-insensitive), so this matches
    // case-insensitively rather than asserting Next's internal casing choice.
    const hreflangCount = (body.match(/hreflang=/gi) ?? []).length;
    expect(hreflangCount).toBeGreaterThanOrEqual(5);

    for (const locale of ["en", "de", "fr", "ar"]) {
      expect(body).toMatch(new RegExp(`hreflang="${locale}"`, "i"));
    }
    expect(body).toMatch(/hreflang="x-default"/i);
  });

  test("sitemap.xml is served, is a valid urlset, and carries no dev-only gallery route", async () => {
    const res = await fetch(baseURL + "/sitemap.xml");
    expect(res.status).toBe(200);
    const body = await res.text();

    expect(body).toContain("<urlset");
    expect(body).not.toContain("/dev/components");
  });
});
