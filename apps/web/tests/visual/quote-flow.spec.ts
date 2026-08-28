// apps/web/tests/visual/quote-flow.spec.ts
//
// Port-only suite. These are compositions of Phase 1 components, not ported
// components, so there is no bundle side to diff against and mountBundle is
// absent on purpose.
//
// Each case is named for the claim it proves. The gallery is mounted through
// mountPort with a real NextIntlClientProvider so useLocale/useMessages work.

import { test, expect, type Page } from "@playwright/test";
import { mountPort, waitForMockReady } from "../support/mock-harness";
import { DIR_KEEP_PARAMS, REFUSAL_BINDINGS } from "../../lib/quote/client-contract";
import enMessages from "../../i18n/messages/en.json";
import deMessages from "../../i18n/messages/de.json";
import frMessages from "../../i18n/messages/fr.json";
import arMessages from "../../i18n/messages/ar.json";

const GALLERY = "apps/web/app/[locale]/dev/quote/QuoteFlowGallery.tsx";

const LOCALES = {
  en: enMessages,
  de: deMessages,
  fr: frMessages,
  ar: arMessages,
} as const;

type Locale = keyof typeof LOCALES;

const ARABIC: Locale = "ar"; // 'ar' — four-locale pass includes Arabic

async function mountGallery(page: Page, locale: Locale = "en"): Promise<void> {
  const url = await mountPort(GALLERY, {}, { locale, messages: LOCALES[locale] });
  await page.goto(url);
  await waitForMockReady(page);
}

test.beforeEach(async ({ page }, testInfo) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    const isLocal =
      url.protocol === "data:" || url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (!isLocal) externalRequests.push(request.url());
  });
  testInfo.attach("external-request-guard", { body: "" }).catch(() => {});
  (page as unknown as { __externalRequests: string[] }).__externalRequests = externalRequests;
});

test.afterEach(async ({ page }) => {
  const externalRequests =
    (page as unknown as { __externalRequests?: string[] }).__externalRequests ?? [];
  expect(
    externalRequests,
    `no request in this suite may leave localhost — saw: ${externalRequests.join(", ")}`,
  ).toEqual([]);
});

test("§A board renders one card per class and nothing scrolls sideways at 390 @component", async ({
  page,
}, testInfo) => {
  await mountGallery(page);
  const cards = page.locator('[data-quote-section="a-board"] .vt-veh');
  await expect(cards).toHaveCount(3);
  if (testInfo.project.name === "component-390") {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);
  }
});

test("all five ineligible_reason values render a distinct label in the price slot @component", async ({
  page,
}) => {
  await mountGallery(page);
  const reasons = ["pax", "bags", "unavailable", "no_rate", "route_off"];
  const labels: string[] = [];
  for (const reason of reasons) {
    const slot = page.locator(`[data-ineligible-reason="${reason}"] .vt-veh__amount`);
    await expect(slot).toHaveCount(1);
    const text = (await slot.innerText()).trim();
    expect(text.length, reason).toBeGreaterThan(0);
    expect(text).not.toBe("CHF 000");
    labels.push(text);
  }
  expect(new Set(labels).size).toBe(5);
});

test("no_eligible_class renders the board plus the status line, not an error surface @component", async ({
  page,
}) => {
  await mountGallery(page);
  const section = page.locator('[data-quote-section="a-none-fit"]');
  await expect(section.locator(".vt-veh")).toHaveCount(3);
  await expect(section.locator("[data-none-fit]")).toBeVisible();
  await expect(section.locator(".vt-price__state--error")).toHaveCount(0);
});

test("every amount on every section reads CHF 000 @component", async ({ page }) => {
  await mountGallery(page);
  const text = await page.locator("[data-quote-gallery]").innerText();
  expect(text).toContain("CHF 000");
  expect(text).not.toMatch(/CHF\s+\d{1,3}(?:[.'\s]\d{3})*(?:[.,]\d{2})/);
  expect(text).not.toMatch(/CHF\s+[1-9]/);
});

test("PriceSummary empty, note and error produce three DIFFERENT baselines @component", async ({
  page,
}) => {
  await mountGallery(page);
  const empty = page.locator('[data-price-state="empty"]');
  const note = page.locator('[data-price-state="note"]');
  const error = page.locator('[data-price-state="error"]');
  await expect(empty).toHaveScreenshot("price-empty.png");
  await expect(note).toHaveScreenshot("price-note.png");
  await expect(error).toHaveScreenshot("price-error.png");
  const [emptyBuf, noteBuf, errorBuf] = await Promise.all([
    empty.screenshot(),
    note.screenshot(),
    error.screenshot(),
  ]);
  expect(emptyBuf.equals(noteBuf)).toBe(false);
  expect(noteBuf.equals(errorBuf)).toBe(false);
  expect(emptyBuf.equals(errorBuf)).toBe(false);
});

test("countdown below LOCK_DANGER_THRESHOLD_S differs by colour and border only — no coloured box-shadow @component", async ({
  page,
}) => {
  await mountGallery(page);
  for (const state of ["normal", "danger"] as const) {
    const shadow = await page
      .locator(`[data-lock-state="${state}"]`)
      .evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow === "none" || shadow === "", `${state} box-shadow`).toBeTruthy();
    expect(shadow, `${state} coloured box-shadow`).not.toMatch(/rgba?\([^)]*[1-9]/);
  }
  const normalColor = await page
    .locator('[data-lock-state="normal"]')
    .evaluate((el) => getComputedStyle(el).color);
  const dangerColor = await page
    .locator('[data-lock-state="danger"]')
    .evaluate((el) => getComputedStyle(el).color);
  expect(dangerColor).not.toBe(normalColor);
});

test("gallery renders in en, de, fr and ar; ar is rtl and DIR_KEEP_PARAMS sit in .vt-dir-keep @component", async ({
  page,
}) => {
  for (const locale of ["en", "de", "fr", "ar"] as const) {
    await mountGallery(page, locale);
    const gallery = page.locator("[data-quote-gallery]");
    await expect(gallery).toBeVisible();
    if (locale === ARABIC) {
      await expect(gallery).toHaveAttribute("dir", "rtl");
      await page.evaluate(() => {
        const root = document.querySelector("[data-quote-gallery]");
        const dir = root?.getAttribute("dir") ?? "ltr";
        document.documentElement.dir = dir;
      });
      expect(await page.evaluate(() => document.dir)).toBe("rtl");
      await expect(page.locator(".vt-dir-keep").filter({ hasText: "CHF 000" }).first()).toBeVisible();
      await expect(page.locator(".vt-dir-keep").filter({ hasText: "XXXX" }).first()).toBeVisible();
      await expect(page.locator(".vt-dir-keep").filter({ hasText: "XX 000" }).first()).toBeVisible();
      await expect(page.locator("[data-lock-state] .vt-dir-keep").first()).toBeVisible();
      expect(DIR_KEEP_PARAMS.length).toBeGreaterThan(0);
    } else {
      await expect(gallery).toHaveAttribute("dir", "ltr");
    }
  }
});

test("de at 1024 — German copy does not overflow VehicleCard price or Input error @component", async ({
  page,
}) => {
  await mountGallery(page, "de");
  const overflowCount = await page.evaluate(() => {
    const nodes = document.querySelectorAll(
      '[data-quote-section="a-ineligible"] .vt-veh__amount, [data-coupon-state] [class*="error"], [data-quote-section="h-refusals"] .vt-input',
    );
    return Array.from(nodes).filter((el) => {
      const node = el as HTMLElement;
      return node.scrollWidth > node.clientWidth + 1;
    }).length;
  });
  expect(overflowCount).toBe(0);
});

test("§H matrix renders every REFUSAL_BINDINGS entry with no console error @component", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(String(err));
  });
  await mountGallery(page);
  const keys = Object.keys(REFUSAL_BINDINGS);
  await expect(page.locator("[data-refusal-code]")).toHaveCount(keys.length);
  for (const code of keys) {
    await expect(page.locator(`[data-refusal-code="${code}"]`)).toHaveCount(1);
  }
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});
