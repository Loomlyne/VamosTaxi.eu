// apps/web/tests/visual/bp-distance-capture.spec.ts
//
// Booking polish, hand-over 1 (design pictures). NOT a gate: it only runs with
// BP_CAPTURE=1 and writes the pictures the owner signs into
// .planning/quick/260930-bp-booking-polish/screens/. The quote is a route fixture in the
// real /api/quote shape; `route.legs[0].distance_m` is what the page shows. Totals are
// null (`CHF 000`): no price is invented.

import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import { openInLocale } from "../support/locale";

const RUN_PROJECT = "component-1440";
const OUT = join(WEB_ROOT, "..", "..", ".planning", "quick", "260930-bp-booking-polish", "screens");
const GS = "11111111-1111-4111-8111-111111111111";
const TRIP =
  `from=Zurich%20Airport&fid=dXJuOm1ieHBvaTox&to=Davos%20Platz&tid=dXJuOm1ieHBvaTox2` +
  `&gs=${GS}&when=2026-12-15T08:15&pax=2&bags=3&flight=LX318`;
const WIDTHS = [1440, 1024, 768, 390] as const;
const LANGS = ["en", "de", "ar"] as const;
const DISTANCE_M = 148_230;

let devServer: ChildProcess | null = null;
let baseURL = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== RUN_PROJECT || !process.env.BP_CAPTURE) return;
  testInfo.setTimeout(180_000);
  const port = 4290 + testInfo.workerIndex;
  baseURL = `http://127.0.0.1:${port}`;
  devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: { ...process.env, NODE_ENV: "development", TEST_DIST_DIR: ".next-bp-distance" },
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

const CAPS = [
  { slug: "economy", name: "Economy", pax: 3, bags: 3 },
  { slug: "business", name: "Business", pax: 7, bags: 6 },
  { slug: "van-luxury", name: "Van luxury", pax: 12, bags: 9 },
];

function quoteBody() {
  return {
    ok: true,
    quote_id: "22222222-2222-4222-8222-222222222222",
    lock: "v1.fixture.lock",
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    pricing_live: false,
    route: {
      legs: [
        {
          leg_seq: 1,
          distance_m: DISTANCE_M,
          duration_s: 6400,
          geometry: { type: "LineString", coordinates: [] },
          origin_zone_id: null,
          dest_zone_id: null,
          road: true,
        },
      ],
    },
    classes: CAPS.map((c) => ({
      slug: c.slug,
      name: c.name,
      eligible: true,
      ineligible_reason: null,
      effective_max_pax: c.pax,
      max_bags: c.bags,
      fixed_route: false,
      total_rappen: null,
      lines: [],
      photo_url: null,
    })),
  };
}

async function prepare(page: Page) {
  await page.route(
    (url) => url.hostname.includes("stripe") || url.hostname.includes("cloudflare") || url.hostname.includes("turnstile"),
    (route) => route.abort(),
  );
  await page.route("**/api/quote", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(quoteBody()) });
  });
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = "nextjs-portal{display:none!important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style));
  });
}

test("booking polish pictures: checkout distance @bp-capture", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== RUN_PROJECT || !process.env.BP_CAPTURE, "capture only, BP_CAPTURE=1");
  testInfo.setTimeout(600_000);
  await prepare(page);
  for (const lang of LANGS) {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width >= 1024 ? 900 : 844 });
      const res = await openInLocale(page, baseURL, `/checkout?${TRIP}&class=business`, lang);
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 60_000 });
      const strip = page.locator("[data-co-strip] [data-co-distance]");
      await expect(strip).toBeVisible();
      await expect(strip).toContainText("148.2");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(OUT, `checkout-${width}-${lang}-top.png`) });
      const summary = page.locator("[data-co-summary]").first();
      await summary.scrollIntoViewIfNeeded();
      await expect(summary.locator("[data-co-distance]")).toContainText("148.2");
      await summary.screenshot({ path: join(OUT, `checkout-${width}-${lang}-summary.png`) });
    }
  }
});
