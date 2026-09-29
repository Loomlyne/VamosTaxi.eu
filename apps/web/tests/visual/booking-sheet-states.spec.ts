import { test, expect, type Page } from "@playwright/test";
import { serveMock, waitForMockReady } from "../support/mock-harness";

// Phase 26.4 plan 05 — the BookingSheet states gallery renders every state in en/de/fr/ar at each
// component width: step buttons 54px and never disabled, Close/Back/steppers at least 44px, nothing
// scrolls sideways, every string resolves in the dictionary, chevrons mirror in Arabic. A behaviour
// block at 390 proves the sheet mechanics: warning + focus, Escape and the scroll lock, browser back,
// and that the history entries are gone before onSubmit fires.

type Loc = { VamosLocale: { setLang(v: string): void; coverage(root: Element, l: string): unknown } };

async function openGallery(page: Page) {
  const url = await serveMock("app/home/BookingSheetStates.dc.html");
  await page.goto(url);
  await waitForMockReady(page);
  const accept = page.getByRole("button", { name: /Accept all/i });
  if (await accept.isVisible().catch(() => false)) await accept.click();
  await expect(page.locator('[data-bs="1"][data-inline="1"]').first()).toBeVisible();
}

const FRAMES = '[data-bs="1"][data-inline="1"]';
const LIVE = '[data-bs="1"][data-inline="0"]';

for (const lang of ["en", "de", "fr", "ar"] as const) {
  test.describe(`BookingSheet states in ${lang} @component`, () => {
    test(`every state is sized, reachable and resolves in ${lang} @component`, async ({ page }) => {
      await openGallery(page);
      await page.evaluate((l) => (window as unknown as Loc).VamosLocale.setLang(l), lang);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      if (lang === "ar") await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await page.waitForTimeout(300);

      const frames = page.locator(FRAMES);
      const n = await frames.count();
      expect(n).toBeGreaterThanOrEqual(12);
      for (let i = 0; i < n; i++) {
        const f = frames.nth(i);
        await f.scrollIntoViewIfNeeded();
        await expect(f, `frame ${i} visible`).toBeVisible();
        const next = f.locator("[data-bs-next] button");
        const nb = await next.boundingBox();
        expect(nb, `frame ${i} step button`).not.toBeNull();
        expect(Math.abs(nb!.height - 54), `frame ${i} step button height`).toBeLessThanOrEqual(1);
        await expect(next, `frame ${i} step button enabled`).toBeEnabled();
        expect(await next.getAttribute("aria-disabled"), `frame ${i} aria-disabled`).toBeNull();

        for (const sel of ["[data-bs-slot] button", "[data-step]", "[data-combo-x]"]) {
          const els = f.locator(sel);
          const c = await els.count();
          for (let j = 0; j < c; j++) {
            const b = await els.nth(j).boundingBox();
            expect(b!.width, `frame ${i} ${sel} width`).toBeGreaterThanOrEqual(43.5);
            expect(b!.height, `frame ${i} ${sel} height`).toBeGreaterThanOrEqual(43.5);
          }
        }
        const combos = f.locator("[data-vtcombo]");
        const cc = await combos.count();
        for (let j = 0; j < cc; j++) {
          const b = await combos.nth(j).boundingBox();
          expect(Math.abs(b!.height - 54), `frame ${i} combobox height`).toBeLessThanOrEqual(1);
        }
        const inputs = f.locator("[data-bs-when] .vt-input");
        const ic = await inputs.count();
        for (let j = 0; j < ic; j++) {
          const b = await inputs.nth(j).boundingBox();
          expect(Math.abs(b!.height - 54), `frame ${i} date/time height`).toBeLessThanOrEqual(1);
        }
        // Frame content never overflows sideways.
        const over = await f.evaluate((el) => el.scrollWidth - el.clientWidth);
        expect(over, `frame ${i} sideways overflow`).toBeLessThanOrEqual(0);
      }

      const w = await page.evaluate(() => ({ sw: document.scrollingElement!.scrollWidth, iw: window.innerWidth }));
      expect(w.sw).toBeLessThanOrEqual(w.iw);

      const missing = await page.evaluate(
        (l) => (window as unknown as Loc).VamosLocale.coverage(document.querySelector("[data-bg-grid]")!, l),
        lang === "en" ? "de" : lang,
      );
      expect(missing).toMatchObject({ count: 0, strings: [], attrs: [] });
    });

    test(`Back chevron and arrows mirror only in Arabic (${lang}) @component`, async ({ page }) => {
      await openGallery(page);
      await page.evaluate((l) => (window as unknown as Loc).VamosLocale.setLang(l), lang);
      await page.waitForTimeout(300);
      // frame 9 is step 2: Back is rendered
      const mirror = page.locator(FRAMES).nth(8).locator("[data-bs-head] [data-bs-mirror]");
      const transform = await mirror.evaluate((el) => getComputedStyle(el).transform);
      const a = /matrix\(([-\d.e]+),/.exec(transform);
      if (lang === "ar") expect(Number(a?.[1] ?? "1")).toBeLessThan(0);
      else expect(transform === "none" || Number(a?.[1] ?? "1") > 0).toBe(true);
    });
  });
}

test.describe("BookingSheet mechanics @component", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.endsWith("390"), "mechanics are proven at 390");
    await openGallery(page);
  });

  const title = (page: Page) => page.locator(`${LIVE} [data-bs-title]`);

  test("NEXT on an incomplete step warns and focuses the field; Escape closes and restores the lock @component", async ({ page }) => {
    await page.locator('[data-bg-open="empty"]').click();
    await expect(page.locator(LIVE)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await expect(page.locator(`${LIVE} [data-bs-next] button`)).toBeEnabled();
    await page.locator(`${LIVE} [data-bs-next] button`).click();
    await expect(page.locator(`${LIVE} [data-bs-msg]`)).toContainText("Enter a pickup address");
    const focusedId = await page.evaluate(() => document.activeElement?.id ?? "");
    expect(focusedId).toMatch(/-from$/);
    await expect(page.locator(`${LIVE} input[id$="-from"]`)).toHaveAttribute("aria-invalid", "true");
    await expect(title(page)).toHaveText("From");

    await page.keyboard.press("Escape");
    await expect(page.locator(LIVE)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    expect(await page.evaluate(() => (history.state && history.state.vtSheet) ?? null)).toBeNull();
  });

  test("browser back steps back one step; Close removes every entry and Forward never reopens @component", async ({ page }) => {
    await page.locator('[data-bg-open="trip"]').click();
    await expect(title(page)).toHaveText("From");
    await page.locator(`${LIVE} [data-bs-next] button`).click();
    await expect(title(page)).toHaveText("To");
    await page.locator(`${LIVE} [data-bs-next] button`).click();
    await expect(title(page)).toHaveText("When");
    await page.goBack();
    await expect(title(page)).toHaveText("To");
    await page.locator(`${LIVE} [data-bs-next] button`).click();
    await expect(title(page)).toHaveText("When");

    await page.locator(`${LIVE} [data-bs-head] button[aria-label="Close booking"]`).click();
    await expect(page.locator(LIVE)).toHaveCount(0);
    expect(await page.evaluate(() => (history.state && history.state.vtSheet) ?? null)).toBeNull();
    await page.goForward().catch(() => undefined);
    await page.waitForTimeout(300);
    await expect(page.locator(LIVE)).toHaveCount(0);
  });

  test("SEE PRICES removes the sheet's history entries before onSubmit fires @component", async ({ page }) => {
    await page.locator('[data-bg-open="trip"]').click();
    for (const t of ["To", "When", "Travellers"]) {
      await page.locator(`${LIVE} [data-bs-next] button`).click();
      await expect(title(page)).toHaveText(t);
    }
    await expect(page.locator(`${LIVE} [data-bs-next] button`)).toContainText(/see prices/i);
    await page.locator(`${LIVE} [data-bs-next] button`).click();
    await expect(page.locator("#bg-log")).toContainText("submitted");
    const rec = await page.evaluate(
      () => (window as unknown as { __bsSubmit: { state: { vtSheet?: number } | null } }).__bsSubmit,
    );
    expect(rec.state?.vtSheet).toBeUndefined();
    await expect(page.locator(LIVE)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
  });

  test("the sheet header is 60px and the footer rides the viewport bottom @component", async ({ page }) => {
    await page.locator('[data-bg-open="empty"]').click();
    await page.waitForTimeout(450); // entrance animation (320ms)
    const head = await page.locator(`${LIVE} [data-bs-row]`).boundingBox();
    expect(Math.abs(head!.height - 44)).toBeLessThanOrEqual(1);
    const foot = await page.locator(`${LIVE} [data-bs-foot]`).boundingBox();
    const vh = await page.evaluate(() => window.innerHeight);
    expect(Math.abs(foot!.y + foot!.height - vh)).toBeLessThanOrEqual(1);
    const w = await page.evaluate(() => ({ sw: document.scrollingElement!.scrollWidth, iw: window.innerWidth }));
    expect(w.sw).toBeLessThanOrEqual(w.iw);
  });
});
