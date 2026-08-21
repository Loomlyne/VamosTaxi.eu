// apps/web/tests/integration/lang-switch.spec.ts
//
// The ADR-001 acceptance test, worded exactly as the ADR states it (§ Consequences):
// "fill the booking widget partially, switch language, and assert every field
// survives." This is not a nice-to-have — ADR-001 names it as the single condition
// under which its whole language-as-route-segment decision is wrong ("this decision is
// wrong and language moves to a cookie"). If this suite cannot be made to pass cleanly,
// 01-12-PLAN.md's own Task 2 says the correct response is to say so in the summary, not
// to ship a workaround.
//
// Runs against the real Next.js app (`next dev`, spawned in beforeAll), the same
// pattern tests/integration/lenis.spec.ts and tests/integration/feedback-behaviour.spec.ts
// already established — a soft navigation triggered by next-intl's own locale-aware
// router (apps/web/lib/locale-shim.ts's `VamosLocale.setLang`) is real App Router
// behaviour that tests/support/mock-harness.ts's static-render rig cannot exercise.
//
// Drives the language switch via the dev-only `window.__vamosSetLang` test hook
// (apps/web/lib/locale-shim.ts's `LocaleShimBootstrap`, mirroring
// `lenis-provider.tsx`'s own `__vamosTestNav` convention) rather than a UI control,
// because no language-switcher UI exists yet in Phase 1 (SiteHeader is Phase 5 work) —
// the hook exercises the exact same `VamosLocale.setLang` -> `router.replace(...,
// {locale})` path a real switcher will eventually call.
//
// Tagged "@lang-switch" so `pnpm test:visual --grep @lang-switch` (01-VALIDATION.md's
// own mapping for I18N-02) runs this suite alone, and the plain `pnpm test:visual`
// still picks it up as part of the full run.

import { test, expect, type Page, type BrowserContext } from "@playwright/test";
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
  // server — same reasoning lenis.spec.ts's own beforeAll documents.
  if (testInfo.project.name !== RUN_PROJECT) return;

  testInfo.setTimeout(90_000);

  const port = 3900 + testInfo.workerIndex;
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
      // `detached: true` puts `next dev` (and the child processes it spawns) in its
      // own process group — killing the negative pid kills the whole group, not just
      // the immediate `pnpm exec` wrapper.
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
    "The booking draft's survival across a language switch doesn't vary by breakpoint — this spec runs once, under component-1440.",
  );
});

interface FieldSnapshot {
  pickup: string;
  destination: string;
  date: string;
  time: string;
  flightNumber: string;
  passengers: string;
  luggage: string;
}

async function waitForHooks(page: Page): Promise<void> {
  await page.waitForFunction(
    () => typeof window.__vamosSetLang === "function" && typeof window.__vamosLocaleDebug === "function",
  );
}

/** Fills every field the draft store tracks with a distinct, recognisable value —
 *  distinct so a swap or a drop between fields is caught, not just a total loss. */
async function fillDraft(page: Page): Promise<void> {
  await page.locator('[data-test-field="pickup"]').fill("Zurich Airport, Terminal 2");
  await page.locator('[data-test-field="destination"]').fill("Dietikon, Bahnhofstrasse 4");
  await page.locator('[data-test-field="date"]').fill("2027-01-15");
  await page.locator('[data-test-field="time"]').fill("09:30");
  await page.locator('[data-test-field="flight-number"]').fill("LX318");
  // Counter's second (increment) button — index-based rather than aria-label text,
  // which is translated and therefore changes with the language this test switches
  // (Input's own label text is avoided as a selector for the same reason; every
  // locator here keys off the untranslated `data-test-field` attribute instead).
  await page.locator('[data-test-field="passengers"] button').nth(1).click();
  await page.locator('[data-test-field="luggage"] button').nth(1).click();
}

async function readDraftFromFields(page: Page): Promise<FieldSnapshot> {
  return {
    pickup: await page.locator('[data-test-field="pickup"]').inputValue(),
    destination: await page.locator('[data-test-field="destination"]').inputValue(),
    date: await page.locator('[data-test-field="date"]').inputValue(),
    time: await page.locator('[data-test-field="time"]').inputValue(),
    flightNumber: await page.locator('[data-test-field="flight-number"]').inputValue(),
    passengers: (await page.locator('[data-test-field="passengers"] .vt-counter__val').innerText()).trim(),
    luggage: (await page.locator('[data-test-field="luggage"] .vt-counter__val').innerText()).trim(),
  };
}

test.describe("Booking draft survives a language switch @lang-switch", () => {
  // One dev server per worker (Playwright's beforeAll/afterAll are worker-scoped) is
  // the whole cost this spec exists to avoid — force every test here into the same
  // worker so exactly one `next dev` process ever gets spawned, matching
  // lenis.spec.ts's own `mode: "serial"` reasoning.
  test.describe.configure({ mode: "serial" });

  test("fill partially, switch to Arabic (RTL) and back to English, every field survives both ways", async ({
    page,
  }) => {
    await page.goto(baseURL + "/");
    await waitForHooks(page);
    await fillDraft(page);
    const filled = await readDraftFromFields(page);
    expect(filled.pickup).toBe("Zurich Airport, Terminal 2");
    expect(filled.passengers).toBe("2");
    expect(filled.luggage).toBe("1");

    // The switch this whole test exists to prove survives — a soft navigation that
    // remounts everything below the [locale] segment (ADR-001's own cost paragraph).
    await page.evaluate(() => window.__vamosSetLang?.("ar"));
    await page.waitForURL("**/ar");
    // Direction flips too, from the same navigation — proven from the client side
    // here; tests/integration/ssr-locale.spec.ts proves the equivalent server-side
    // fact (dir="rtl" in the raw HTML, before any script runs).
    await page.waitForFunction(() => document.documentElement.dir === "rtl");

    const afterArabic = await readDraftFromFields(page);
    expect(afterArabic).toEqual(filled);

    // ...and back to English, the same assertion in the other direction.
    await page.evaluate(() => window.__vamosSetLang?.("en"));
    await page.waitForFunction(() => document.documentElement.lang === "en");
    const afterEnglish = await readDraftFromFields(page);
    expect(afterEnglish).toEqual(filled);
  });

  test("switch to German, every field survives", async ({ page }) => {
    await page.goto(baseURL + "/");
    await waitForHooks(page);
    await fillDraft(page);
    const filled = await readDraftFromFields(page);

    await page.evaluate(() => window.__vamosSetLang?.("de"));
    await page.waitForURL("**/de");

    const afterGerman = await readDraftFromFields(page);
    expect(afterGerman).toEqual(filled);
  });

  test("return visit: the language choice persists, the draft does not — sessionStorage behaving as session-scoped storage should", async ({
    context,
  }: {
    context: BrowserContext;
  }) => {
    const page1 = await context.newPage();
    await page1.goto(baseURL + "/");
    await waitForHooks(page1);
    await fillDraft(page1);
    await page1.evaluate(() => window.__vamosSetLang?.("de"));
    await page1.waitForURL("**/de");
    await page1.close();

    // A fresh tab in the same browser context: next-intl's own locale cookie
    // (persisted at the context/cookie-jar level) survives across tabs, but
    // `sessionStorage` is scoped to the browsing context that wrote it and does not
    // — this is the exact distinction the "return visit" half of ADR-001's
    // acceptance test exists to prove, not merely a Playwright API quirk.
    const page2 = await context.newPage();
    await page2.goto(baseURL + "/");
    await page2.waitForURL("**/de");
    await waitForHooks(page2);

    const draftAfterReturn = await readDraftFromFields(page2);
    expect(draftAfterReturn.pickup).toBe("");
    expect(draftAfterReturn.destination).toBe("");
    expect(draftAfterReturn.flightNumber).toBe("");
    expect(draftAfterReturn.passengers).toBe("1");
    expect(draftAfterReturn.luggage).toBe("0");

    await page2.close();
  });
});
