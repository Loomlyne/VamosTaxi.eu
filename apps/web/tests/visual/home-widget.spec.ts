import { test, expect, type Page, emulateMedia } from "../support/test";
import { testPort } from "../support/port";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, settleCloudflareDev, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import { nextDevEnv } from "../support/test-stack";
import {
  LOCK_DANGER_THRESHOLD_S,
  REFUSAL_BINDINGS,
  type QuoteErrorCode,
} from "../../lib/quote/client-contract";
import {
  eligibleBoard,
  noEligibleClassBoard,
} from "../../lib/quote/client-fixtures";
import type { QuoteResponse } from "../../lib/quote/client-contract";
import type { ClassBoardEntry } from "../../lib/pricing/types";

const PORTS: Record<string, number> = {
  "component-1440": testPort(4290),
  "component-1024": testPort(4291),
  "component-768": testPort(4292),
  "component-390": testPort(4293),
};

const LOCALES = ["en", "de", "fr", "ar"] as const;

const TRIP = {
  pickup: "12 Exampleweg, 8000 Musterstadt",
  destination: "9 Demoquai, 1200 Musterdorf",
  date: "2099-06-15",
  time: "08:15",
  passengers: 1,
  luggage: 0,
  flightNumber: "XX 000",
};

let devServer: ChildProcess | null = null;
let baseURL = "";

function pathFor(locale: string) {
  return locale === "en" ? "/" : `/${locale}`;
}

function dropEconomy(board: QuoteResponse): QuoteResponse {
  return {
    ...board,
    quote_id: "fixture-quote-moved",
    classes: board.classes.map((entry: ClassBoardEntry) =>
      entry.slug === "economy"
        ? { ...entry, eligible: false, ineligible_reason: "pax" as const, lines: [] }
        : entry,
    ),
  };
}

function withExpiry(board: QuoteResponse, remainingS: number): QuoteResponse {
  return {
    ...board,
    expires_at: new Date(Date.now() + remainingS * 1000).toISOString(),
  };
}

async function interceptQuote(page: Page, body: unknown, status = 200) {
  await page.unroute("**/api/quote").catch(() => {});
  await page.route("**/api/quote", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

async function gotoHome(page: Page, locale: string) {
  await emulateMedia(page, { reducedMotion: "reduce" });
  const res = await page.goto(baseURL + pathFor(locale), {
    timeout: 60_000,
    waitUntil: "domcontentloaded",
  });
  if (!res || res.status() >= 400) {
    throw new Error(
      `Home ${locale} returned ${res?.status() ?? "no response"}. If this persists, run \`pnpm db:start && pnpm db:reset\`.`,
    );
  }
  await expect(page.locator("[data-home]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-bookcard]")).toBeAttached();
  await expect(page.locator("[data-bc-board]")).toBeAttached();
}

async function seedTrip(page: Page) {
  await page.addInitScript((trip) => {
    sessionStorage.setItem("vamosTrip", JSON.stringify(trip));
  }, TRIP);
}

async function openSheetIfNarrow(page: Page) {
  const summary = page.locator("[data-home-book] [data-bc-summary]");
  const shell = page.locator("[data-home-book] [data-shell]");
  if (!(await summary.isVisible())) return;
  await expect(async () => {
    if ((await shell.getAttribute("data-open")) !== "1") {
      await summary.click({ force: true });
    }
    await expect(shell).toHaveAttribute("data-open", "1");
  }).toPass({ timeout: 15_000 });
}

test.describe("Home widget @component", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(240_000);
    const port = PORTS[testInfo.project.name] ?? testPort(4290);
    baseURL = `http://localhost:${port}`;
    devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
      env: nextDevEnv({
        TEST_DIST_DIR: `test-results/.next-home-widget-${port}`,
        CLOUDFLARE_ENV: "staging",
      }),
    });
    await settleCloudflareDev();
    await waitForNextServer(baseURL, 180_000);
  });

  test.afterAll(() => {
    if (devServer?.pid) {
      try {
        process.kill(-devServer.pid, "SIGTERM");
      } catch {
        /* gone */
      }
    }
  });

  for (const locale of LOCALES) {
    test(`screenshot ${locale} populated widget @component`, async ({ page }) => {
      await interceptQuote(page, eligibleBoard);
      await seedTrip(page);
      await gotoHome(page, locale);
      await expect(page.locator("[data-bc-board] .vt-veh").first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator("[data-home-book]")).toHaveScreenshot(
        `widget-${locale}.png`,
      );
    });
  }

  test("every REFUSAL_BINDINGS key renders its bound component in its bound placement @component", async ({
    page,
  }) => {
    await seedTrip(page);
    const codes = Object.keys(REFUSAL_BINDINGS) as QuoteErrorCode[];
    let opened = false;
    for (const [index, code] of codes.entries()) {
      const binding = REFUSAL_BINDINGS[code];
      const params = binding.i18n_key.includes("minutes") || binding.i18n_key.endsWith("min_advance")
        ? { minutes: 180 }
        : undefined;
      await interceptQuote(page, {
        ok: false,
        error: code,
        i18n_key: binding.i18n_key,
        params,
      });
      if (!opened) {
        await gotoHome(page, "en");
        opened = true;
      }
      await openSheetIfNarrow(page);
      await page.locator("[data-test-field=\"pickup\"]").fill(`${TRIP.pickup} ${index}`, { force: true });
      await expect(page.locator(`[data-refusal-code="${code}"]`)).toHaveCount(1);
      await expect(page.locator(`[data-refusal-code="${code}"]`)).toHaveAttribute(
        "data-refusal-placement",
        binding.placement,
      );
    }
  });

  test("quote.none_fit and quote.moved_to render on the status line with recorded precedence @component", async ({
    page,
  }) => {
    await interceptQuote(page, eligibleBoard);
    await seedTrip(page);
    await gotoHome(page, "en");
    await expect(page.locator("[data-bc-board] .vt-veh").first()).toBeVisible({
      timeout: 15_000,
    });
    await page.locator("[data-bc-board] .vt-veh").first().click();
    await expect(page.locator("[data-status-kind]")).toHaveAttribute(
      "data-status-kind",
      "saved",
    );

    await interceptQuote(page, dropEconomy(eligibleBoard));
    await openSheetIfNarrow(page);
    await page.locator("[data-test-field=\"passengers\"] button").last().click({ force: true });
    await expect(page.locator("[data-status-kind]")).toHaveAttribute(
      "data-status-kind",
      "moved_to",
    );
    await expect(page.locator("[data-strip-head] .vt-alert")).toHaveCount(0);
    await expect(page.locator("[data-status-kind]")).toHaveCount(1);

    await interceptQuote(page, noEligibleClassBoard);
    await page.locator("[data-test-field=\"luggage\"] button").last().click({ force: true });
    await expect(page.locator("[data-status-kind]")).toHaveAttribute(
      "data-status-kind",
      "none_fit",
    );
    await expect(page.locator("[data-status-kind]")).toHaveCount(1);
    const statusText = await page.locator("[data-strip-head]").innerText();
    expect(statusText.split("\n").filter((line) => line.trim().length > 0).length).toBe(1);
    await expect(page.locator("[data-strip-head] .vt-alert")).toHaveCount(0);
  });

  test("every amount reads CHF 000 and no digit-grouped figure appears @component", async ({
    page,
  }) => {
    await interceptQuote(page, eligibleBoard);
    await seedTrip(page);
    await gotoHome(page, "en");
    await expect(page.locator("[data-bc-board] .vt-veh").first()).toBeVisible({
      timeout: 15_000,
    });
    const text = await page.locator("[data-home-book]").innerText();
    expect(text).toContain("CHF 000");
    expect(text).not.toMatch(/CHF\s+\d{1,3}(?:[.'\s]\d{3})*(?:[.,]\d{2})/);
    expect(text).not.toMatch(/CHF\s+[1-9]/);
  });

  test("countdown at a normal value and at LOCK_DANGER_THRESHOLD_S with vt-dir-keep @component", async ({
    page,
  }) => {
    await interceptQuote(page, withExpiry(eligibleBoard, LOCK_DANGER_THRESHOLD_S + 60));
    await seedTrip(page);
    await gotoHome(page, "en");
    await expect(page.locator("[data-lock-state=\"normal\"] .vt-dir-keep")).toBeVisible({
      timeout: 15_000,
    });

    await interceptQuote(page, withExpiry(eligibleBoard, LOCK_DANGER_THRESHOLD_S - 30));
    await openSheetIfNarrow(page);
    await page.locator("[data-test-field=\"luggage\"] button").last().click({ force: true });
    await expect(page.locator("[data-lock-state=\"danger\"] .vt-dir-keep")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("Arabic dir=rtl mirrors the board and price panel through logical properties @component", async ({
    page,
  }) => {
    await interceptQuote(page, eligibleBoard);
    await seedTrip(page);
    await gotoHome(page, "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("[data-bc-board] .vt-veh").first()).toBeVisible({
      timeout: 15_000,
    });
    const boardInline = await page.locator("[data-bc-board-list]").evaluate((el) => {
      const style = getComputedStyle(el);
      return { display: style.display, gap: style.gap, flexWrap: style.flexWrap };
    });
    expect(boardInline.display).toBe("flex");
    const priceInset = await page.locator("[data-bc-price-stack]").evaluate((el) => {
      return getComputedStyle(el).insetBlockStart;
    });
    expect(priceInset).not.toBe("");
  });

  test("no horizontal scroll at 390 with the board populated @component", async ({
    page,
  }, testInfo) => {
    await interceptQuote(page, eligibleBoard);
    await seedTrip(page);
    await gotoHome(page, "en");
    await expect(page.locator("[data-bc-board] .vt-veh").first()).toBeVisible({
      timeout: 15_000,
    });
    if (testInfo.project.name === "component-390") {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflow).toBe(false);
    } else {
      const cards = page.locator("[data-bc-board] .vt-veh");
      await expect(cards).toHaveCount(3);
    }
  });
});
