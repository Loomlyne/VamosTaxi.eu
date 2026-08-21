// apps/web/tests/visual/error-pages.spec.ts
//
// D-20's two error surfaces, screenshot-diffed at every language the four-language rule
// requires (CLAUDE.md), port-only — no `.dc.html` mock exists for either page (checked:
// no `404.dc.html`/`not-found.dc.html`/`error.dc.html` anywhere under `app/pages/` or
// `app/home/`), the exact gap `01-UI-SPEC.md`'s Copywriting Contract records before
// drafting the copy directly from the brand voice rules.
//
// Neither page's CSS (`app/[locale]/error-pages.css`) carries a responsive `@media`
// rule — a single centred block sized with `clamp()`/logical properties throughout, the
// Fidelity Contract's own "layout genuinely does not change across breakpoints" carve-out
// (core.spec.ts's own header comment establishes the same pattern) — so both pages are
// diffed at the reduced 1440/390 viewport set, not all four.
//
// Two different rigs for two structurally different files, not a stylistic choice:
//
//   - `not-found.tsx` is an ASYNC SERVER COMPONENT that reads `getLocale()`/
//     `getTranslations()` from `next-intl/server` — request-scoped APIs backed by Next's
//     own AsyncLocalStorage, which only exist inside a real, running Next.js request.
//     `tests/support/mock-harness.ts`'s `mountPort` (a bare `react-dom/server` render with
//     no Next.js runtime underneath it) cannot supply that context, so this file's own
//     `not-found.tsx` suite spawns a real `next dev` server exactly the way
//     `tests/integration/ssr-locale.spec.ts` and `tests/integration/lenis.spec.ts`
//     established, and drives it with a real Playwright `page.goto()` — not a raw
//     `fetch()`, and that distinction matters here specifically (see the next paragraph).
//
//   - SSR NOTE, discovered running this exact suite against a real server (both
//     `next start` and `opennextjs-cloudflare preview`): Next.js 15.5.23 serves ANY
//     route-level `notFound()` reached by an actual request-time throw (as opposed to a
//     build-time-known-empty static route) through a two-phase shell — the raw initial
//     HTTP response carries a placeholder `<html id="__next_error__">` with the real
//     content only inside an inlined RSC-hydration `<script>`, and the correct DOM (this
//     page's real markup, `lang`/`dir`, the shared shell) appears once client JS
//     hydrates. A plain `curl`/`fetch()` genuinely cannot see the resolved page — this is
//     why `ssr-locale.spec.ts` only ever asserts against ordinarily-rendered routes, never
//     a `notFound()`-triggered one. This suite therefore waits for hydration
//     (`page.waitForFunction` below) before asserting anything, the same way a real
//     visitor's browser would resolve it — `apps/web/app/[locale]/not-found.tsx`'s own
//     comment carries the full investigation.
//
//   - `error.tsx` is a plain Client Component taking `{ error, reset }` as props (Next's
//     own documented `error.js` contract) — no App Router request context of its own to
//     fake, so it mounts through `mountPort` exactly like every other ported client
//     component in this suite (ShellGallery's `SiteHeader`/`SiteFooter`), with a synthetic
//     `Error` and a no-op `reset`.
//
// Tagged `@error-pages` per this plan's own artifact list.

import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { mountPort, waitForMockReady } from "../support/mock-harness";
import enMessages from "../../i18n/messages/en.json";
import deMessages from "../../i18n/messages/de.json";
import frMessages from "../../i18n/messages/fr.json";
import arMessages from "../../i18n/messages/ar.json";

const REDUCED_VIEWPORT_PROJECTS = new Set(["component-1440", "component-390"]);

const LOCALE_MESSAGES: Record<string, Record<string, unknown>> = {
  en: enMessages,
  de: deMessages,
  fr: frMessages,
  ar: arMessages,
};

const LOCALE_DIR: Record<string, "ltr" | "rtl"> = { en: "ltr", de: "ltr", fr: "ltr", ar: "rtl" };

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    !REDUCED_VIEWPORT_PROJECTS.has(testInfo.project.name),
    "error-pages.css carries no responsive rule — Fidelity Contract allows the reduced 1440/390 set.",
  );
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    const isLocal =
      url.protocol === "data:" || url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (!isLocal) externalRequests.push(request.url());
  });
  (page as unknown as { __externalRequests: string[] }).__externalRequests = externalRequests;
});

test.afterEach(async ({ page }) => {
  const externalRequests = (page as unknown as { __externalRequests?: string[] }).__externalRequests ?? [];
  expect(
    externalRequests,
    `no request in this suite may leave localhost (D-25/D-31) — saw: ${externalRequests.join(", ")}`,
  ).toEqual([]);
});

// ── not-found.tsx: real dev server, real browser navigation ────────────────────────────

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
  throw new Error(`Dev server at ${url} did not become ready within ${timeoutMs}ms: ${String(lastError)}`);
}

/** Waits for the client to hydrate past the two-phase `notFound()` shell this file's own
 *  header comment documents — polling for the real `<main data-error-page>` markup (only
 *  present once React has rendered the RSC payload into the DOM) rather than a fixed
 *  sleep, since the exact hydration delay is not deterministic across machines. */
async function waitForErrorPageHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => document.querySelector("main[data-error-page]") !== null, {
    timeout: 15_000,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}

test.describe("not-found.tsx @component @error-pages", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    if (!REDUCED_VIEWPORT_PROJECTS.has(testInfo.project.name)) return;
    testInfo.setTimeout(90_000);
    const port = 4100 + testInfo.workerIndex;
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

  for (const locale of ["en", "de", "fr", "ar"]) {
    const path = locale === "en" ? "/definitely-not-a-page" : `/${locale}/definitely-not-a-page`;

    test(`${locale}: a wrong URL under this locale renders the localised 404 inside the shared shell, status 404 @component @error-pages`, async ({
      page,
    }) => {
      const response = await page.goto(baseURL + path);
      expect(response?.status()).toBe(404);
      await waitForErrorPageHydration(page);

      expect(await page.evaluate(() => document.documentElement.getAttribute("lang"))).toBe(locale);
      expect(await page.evaluate(() => document.documentElement.getAttribute("dir"))).toBe(
        LOCALE_DIR[locale],
      );
      // D-20 + CLAUDE.md: SiteHeader/SiteFooter are mandatory on every public page,
      // including this one — composed structurally by app/[locale]/layout.tsx, asserted
      // here rather than assumed.
      await expect(page.locator("[data-hd]").first()).toBeVisible();
      await expect(page.locator("[data-ft]").first()).toBeVisible();

      await expect(page.locator("main[data-error-page]")).toHaveScreenshot(
        `not-found-${locale}.png`,
      );
    });
  }

  test("an unresolvable locale segment falls back to English rather than failing @component @error-pages", async ({
    page,
  }) => {
    const response = await page.goto(baseURL + "/zz/whatever");
    expect(response?.status()).toBe(404);
    await waitForErrorPageHydration(page);

    expect(await page.evaluate(() => document.documentElement.getAttribute("lang"))).toBe("en");
    expect(await page.evaluate(() => document.querySelector("h1")?.textContent)).toContain(
      "can't find that page",
    );
  });
});

// ── error.tsx: mountPort, a synthetic Error and a no-op reset ──────────────────────────

function portPath(name: string): string {
  return `apps/web/app/[locale]/${name}.tsx`;
}

test.describe("error.tsx @component @error-pages", () => {
  for (const locale of ["en", "de", "fr", "ar"]) {
    test(`${locale}: the server-failure surface renders the localised copy, no caught error detail in the markup @component @error-pages`, async ({
      page,
    }) => {
      // T-01-36 own proof: a synthetic error carrying a fake internal path in its
      // message — if this string ever leaked into the rendered page, the assertion
      // below would catch it.
      const syntheticError = { message: "ENOENT: /var/task/secret-config.json", stack: "" };
      const portUrl = await mountPort(
        portPath("error"),
        { error: syntheticError, reset: () => {} },
        { locale, messages: LOCALE_MESSAGES[locale] ?? enMessages },
      );
      await page.goto(portUrl);
      await waitForMockReady(page);

      const main = page.locator("#root main[data-error-page]");
      await expect(main).toBeVisible();

      const bodyText = (await main.textContent()) ?? "";
      expect(bodyText).not.toContain("secret-config.json");
      expect(bodyText).not.toContain("ENOENT");

      await expect(main).toHaveScreenshot(`error-boundary-${locale}.png`);
    });
  }
});
