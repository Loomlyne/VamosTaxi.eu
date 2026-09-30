import { test, expect, type Page } from "../support/test";
import { serveMock, waitForMockReady } from "../support/mock-harness";

// Quick 260930-obf — the BookingSheet is ONE page (Where, When, Who). The states gallery renders every
// state in en/de/fr/ar at each component width: SEE PRICES 54px and never disabled, Close/steppers at
// least 44px, fields 54px, nothing scrolls sideways, every string resolves in the dictionary, the arrow
// mirrors in Arabic. A behaviour block at 390 proves the sheet mechanics: all three sections on open,
// date above time with the laptop picker (no native input), warning + focus, Escape and the scroll lock,
// browser back, and that the history entry is gone before onSubmit fires.

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
        await expect(f.locator("[data-bs-sec]"), `frame ${i} sections`).toHaveCount(3);
        const next = f.locator("[data-bs-next] button");
        const nb = await next.boundingBox();
        expect(nb, `frame ${i} step button`).not.toBeNull();
        expect(Math.abs(nb!.height - 54), `frame ${i} step button height`).toBeLessThanOrEqual(1);
        await expect(next, `frame ${i} step button enabled`).toBeEnabled();
        expect(await next.getAttribute("aria-disabled"), `frame ${i} aria-disabled`).toBeNull();

        for (const sel of ["[data-bs-slot] button", "[data-step]", "[data-combo-x]"]) {
          if (sel === "[data-bs-slot] button") await expect(f.locator("[data-bs-head] button[aria-label]"), `frame ${i} no back button`).toHaveCount(1);
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
        const triggers = f.locator("[data-bs-when] button[aria-haspopup]");
        expect(await triggers.count(), `frame ${i} date and time triggers`).toBe(2);
        for (let j = 0; j < 2; j++) {
          const b = await triggers.nth(j).boundingBox();
          expect(Math.abs(b!.height - 54), `frame ${i} date/time height`).toBeLessThanOrEqual(1);
        }
        expect(await f.locator('input[type="date"],input[type="time"]').count(), `frame ${i} no native picker`).toBe(0);
        const d = await triggers.nth(0).boundingBox();
        const t = await triggers.nth(1).boundingBox();
        expect(t!.y, `frame ${i} time below date`).toBeGreaterThanOrEqual(d!.y + d!.height - 1);
        expect(Math.abs(t!.x - d!.x), `frame ${i} date and time share a column`).toBeLessThanOrEqual(1);
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

    test(`SEE PRICES arrow mirrors only in Arabic (${lang}) @component`, async ({ page }) => {
      await openGallery(page);
      await page.evaluate((l) => (window as unknown as Loc).VamosLocale.setLang(l), lang);
      await page.waitForTimeout(300);
      const arrow = page.locator(FRAMES).first().locator("[data-bs-next] .vt-btn > span:last-child");
      const transform = await arrow.evaluate((el) => getComputedStyle(el).transform);
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

  test("everything is on the page when it opens: Where, When, Who, one SEE PRICES @component", async ({ page }) => {
    await page.locator('[data-bg-open="empty"]').click();
    await expect(page.locator(LIVE)).toBeVisible();
    await page.waitForTimeout(450);
    await expect(title(page)).toHaveText("Book a transfer");
    for (const h of ["Where", "When", "Who"]) await expect(page.locator(`${LIVE} [data-bs-sech]`, { hasText: h })).toBeVisible();
    await expect(page.locator(`${LIVE} [data-bs-next] button`)).toHaveCount(1);
    await expect(page.locator(`${LIVE} [data-bs-next] button`)).toContainText(/see prices/i);
    await expect(page.locator(`${LIVE} [data-bs-head] button[aria-label="Previous step"]`)).toHaveCount(0);
    await expect(page.locator(`${LIVE} [data-bs="1"] [role="progressbar"], ${LIVE} [data-bs-prog]`)).toHaveCount(0);
    for (const sel of ['input[id$="-from"]', 'input[id$="-to"]', "[data-bs-date] button", "[data-bs-time] button", "[data-step]"]) {
      await expect(page.locator(`${LIVE} ${sel}`).first(), sel).toBeVisible();
    }
  });

  test("Date and Time open the laptop picker, not the OS picker @component", async ({ page }) => {
    await page.locator('[data-bg-open="empty"]').click();
    await page.waitForTimeout(450);
    expect(await page.locator(`${LIVE} input[type="date"], ${LIVE} input[type="time"]`).count()).toBe(0);
    await page.locator(`${LIVE} [data-bs-date] button[aria-haspopup]`).click();
    const cal = page.getByRole("dialog", { name: "Date" });
    await expect(cal).toBeVisible();
    await expect(cal.getByRole("button", { name: "Next month" })).toBeVisible();
    await expect(cal.getByRole("button", { name: "Hour up" })).toHaveCount(0);
    await cal.getByRole("button", { name: "Next month" }).click();
    await cal.getByRole("button", { name: "5", exact: true }).click();
    await expect(page.locator(`${LIVE} [data-bs-date] button[aria-haspopup]`)).not.toContainText("Select a date");
    await expect(page.getByRole("dialog", { name: "Date" })).toHaveCount(0);
    await page.locator(`${LIVE} [data-bs-time] button[aria-haspopup]`).click();
    const tp = page.getByRole("dialog", { name: "Time" });
    await expect(tp).toBeVisible();
    await expect(tp.getByRole("button", { name: "Hour up" })).toBeVisible();
    await tp.getByRole("button", { name: "Hour up" }).click();
    await expect(page.locator(`${LIVE} [data-bs-time] button[aria-haspopup]`)).not.toContainText("Select a time");
    // Escape closes the picker first, the sheet second.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Time" })).toHaveCount(0);
    await expect(page.locator(LIVE)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(LIVE)).toHaveCount(0);
  });

  test("SEE PRICES on an incomplete page warns and focuses the first missing field; Escape closes and restores the lock @component", async ({ page }) => {
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
    await expect(title(page)).toHaveText("Book a transfer");

    await page.keyboard.press("Escape");
    await expect(page.locator(LIVE)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    expect(await page.evaluate(() => (history.state && history.state.vtSheet) ?? null)).toBeNull();
  });

  test("a missing time is named and its field is the one that takes focus @component", async ({ page }) => {
    await page.locator('[data-bg-open="trip"]').click();
    await page.waitForTimeout(450);
    await page.locator(`${LIVE} [data-bs-time] button[aria-haspopup]`).click();
    await page.getByRole("dialog", { name: "Time" }).getByRole("button", { name: "Clear" }).click();
    await page.keyboard.press("Escape");
    await page.locator(`${LIVE} [data-bs-next] button`).click();
    await expect(page.locator(`${LIVE} [data-bs-msg]`)).toContainText(/Choose a date and a pickup time/);
    await expect(page.locator(`${LIVE} [data-bs-date] button[aria-haspopup]`)).toBeFocused();
  });

  test("browser back closes the sheet and Forward never reopens it; Close removes the entry @component", async ({ page }) => {
    await page.locator('[data-bg-open="trip"]').click();
    await expect(page.locator(LIVE)).toBeVisible();
    await page.goBack();
    await expect(page.locator(LIVE)).toHaveCount(0);
    await page.locator('[data-bg-open="trip"]').click();
    await expect(page.locator(LIVE)).toBeVisible();
    await page.locator(`${LIVE} [data-bs-head] button[aria-label="Close booking"]`).click();
    await expect(page.locator(LIVE)).toHaveCount(0);
    expect(await page.evaluate(() => (history.state && history.state.vtSheet) ?? null)).toBeNull();
    await page.goForward().catch(() => undefined);
    await page.waitForTimeout(300);
    await expect(page.locator(LIVE)).toHaveCount(0);
  });

  test("SEE PRICES removes the sheet's history entry before onSubmit fires @component", async ({ page }) => {
    await page.locator('[data-bg-open="trip"]').click();
    await page.waitForTimeout(450);
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

  test("the sheet header is 44px and the footer rides the viewport bottom @component", async ({ page }) => {
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
