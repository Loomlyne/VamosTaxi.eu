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
// Runs against the real Next.js app (`next dev`, spawned in beforeAll). Drives the
// REAL BookingCard fields on `/` and switches language through the header's BrandSelect
// — the same `VamosLocale.setLang` -> `router.replace(..., {locale})` path, with no
// page reload (a reload would discard the draft ADR-001 exists to protect).
//
// Tagged "@lang-switch" so `pnpm test:visual --grep @lang-switch` (01-VALIDATION.md's
// own mapping for I18N-02) runs this suite alone, and the plain `pnpm test:visual`
// still picks it up as part of the full run.

import { test, expect, type Page, type BrowserContext, pinReducedTransparency } from "../support/test";
import { testPort } from "../support/port";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import { nextDevEnv } from "../support/test-stack";

const RUN_PROJECT = "component-1440";
const PORT = testPort(4440);

let devServer: ChildProcess | null = null;
let baseURL = "";

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== RUN_PROJECT) return;

  testInfo.setTimeout(90_000);

  baseURL = `http://localhost:${PORT}`;
  devServer = spawn(NEXT_BIN, ["dev", "-p", String(PORT)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: nextDevEnv({
      TEST_DIST_DIR: `test-results/.next-lang-switch-${PORT}`,
      CLOUDFLARE_ENV: "staging",
    }),
  });
  await waitForNextServer(baseURL);
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

const PICKUP_LABEL = {
  en: "Pickup",
  de: "Abholung",
  fr: "Prise en charge",
  ar: "مكان الانطلاق",
} as const;

async function switchLang(page: Page, locale: "en" | "de" | "fr" | "ar"): Promise<void> {
  const switcher = page.locator('[data-hd-wide] [data-vs-root]').first();
  await switcher.locator("[data-vs-btn]").click();
  await switcher.locator("[data-vs-opt]").filter({ hasText: locale.toUpperCase() }).click();
}

/** sessionStorage.vamosTrip is what `readDraft()` hydrates from. */
async function readDraftFromStore(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => {
    const raw = sessionStorage.getItem("vamosTrip");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  });
}

async function fillDraft(page: Page): Promise<void> {
  await page.locator('[data-test-field="pickup"]').fill("Zurich Airport, Terminal 2");
  await page.locator('[data-test-field="destination"]').fill("Dietikon, Bahnhofstrasse 4");
  await page.locator('[data-test-field="date"]').fill("2027-01-15", { force: true });
  await page.locator('[data-test-field="time"]').fill("09:30");
  await page.locator('[data-test-field="flight-number"]').fill("LX318");
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
  test.describe.configure({ mode: "serial" });

  test("fill partially, switch to Arabic (RTL) and back to English, every field survives both ways", async ({
    page,
  }) => {
    await page.goto(baseURL + "/");
    await expect(page.locator('[data-test-field="pickup"]')).toBeVisible();
    await fillDraft(page);
    const filled = await readDraftFromFields(page);
    expect(filled.pickup).toBe("Zurich Airport, Terminal 2");
    expect(filled.passengers).toBe("2");
    expect(filled.luggage).toBe("1");

    await switchLang(page, "ar");
    await page.waitForURL("**/ar");
    await page.waitForFunction(() => document.documentElement.dir === "rtl");

    const afterArabic = await readDraftFromFields(page);
    expect(afterArabic).toEqual(filled);

    const storeAr = await readDraftFromStore(page);
    expect(storeAr?.pickup).toBe(filled.pickup);
    expect(storeAr?.destination).toBe(filled.destination);
    await expect(page.locator('[data-f="pickup"] .vt-field__label')).toHaveText(PICKUP_LABEL.ar);

    await switchLang(page, "en");
    await page.waitForFunction(() => document.documentElement.lang === "en");
    const afterEnglish = await readDraftFromFields(page);
    expect(afterEnglish).toEqual(filled);
    await expect(page.locator('[data-f="pickup"] .vt-field__label')).toHaveText(PICKUP_LABEL.en);
  });

  test("switch to German, every field survives", async ({ page }) => {
    await page.goto(baseURL + "/");
    await expect(page.locator('[data-test-field="pickup"]')).toBeVisible();
    await fillDraft(page);
    const filled = await readDraftFromFields(page);

    await switchLang(page, "de");
    await page.waitForURL("**/de");

    const afterGerman = await readDraftFromFields(page);
    expect(afterGerman).toEqual(filled);

    const storeDe = await readDraftFromStore(page);
    expect(storeDe?.pickup).toBe(filled.pickup);
    await expect(page.locator('[data-f="pickup"] .vt-field__label')).toHaveText(PICKUP_LABEL.de);
  });

  test("return visit: the language choice persists, the draft does not — sessionStorage behaving as session-scoped storage should", async ({
    context,
  }: {
    context: BrowserContext;
  }) => {
    const page1 = await context.newPage();
    await pinReducedTransparency(page1);
    await page1.goto(baseURL + "/");
    await expect(page1.locator('[data-test-field="pickup"]')).toBeVisible();
    await fillDraft(page1);
    await switchLang(page1, "de");
    await page1.waitForURL("**/de");
    await page1.close();

    const page2 = await context.newPage();
    await pinReducedTransparency(page2);
    await page2.goto(baseURL + "/");
    await page2.waitForURL("**/de");
    await expect(page2.locator('[data-test-field="pickup"]')).toBeVisible();

    const draftAfterReturn = await readDraftFromFields(page2);
    expect(draftAfterReturn.pickup).toBe("");
    expect(draftAfterReturn.destination).toBe("");
    expect(draftAfterReturn.flightNumber).toBe("");
    expect(draftAfterReturn.passengers).toBe("1");
    expect(draftAfterReturn.luggage).toBe("0");

    await page2.close();
  });
});
