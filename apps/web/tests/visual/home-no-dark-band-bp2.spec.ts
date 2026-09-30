import { test, expect, type Page } from "@playwright/test";
import { serveMock, waitForMockReady } from "../support/mock-harness";

// Quick 260930-bp2 item 3. On the phone home page nothing sits below the footer: the document ends where the
// footer ends. A dark empty band under the footer means something (a fixed sheet, a spacer, a min-height) still
// reserves room after the last visible content.

async function openHome(page: Page, width: number, lang = "en") {
  await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true,"suggestions":[],"classes":[]}' }));
  await page.addInitScript((l) => { try { localStorage.setItem("vamosLang", l); } catch {} }, lang);
  await page.setViewportSize({ width, height: 844 });
  await page.goto(await serveMock("app/home/home.dc.html"));
  await waitForMockReady(page);
  const accept = page.getByRole("button", { name: /Accept all/i });
  if (await accept.isVisible().catch(() => false)) await accept.click();
  await page.waitForTimeout(800);
}

async function bandBelowContent(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const doc = document.documentElement;
    let lowest = 0;
    let who = "";
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const cs = getComputedStyle(el);
      if (cs.position === "fixed" || cs.display === "none" || cs.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const b = r.bottom + window.scrollY;
      if (b > lowest && b <= doc.scrollHeight + 2000) { lowest = b; who = el.tagName + "." + (el.getAttribute("data-fab") ?? el.id ?? "") ; }
    }
    return { scrollHeight: doc.scrollHeight, bodyHeight: document.body.scrollHeight, lowest: Math.round(lowest), who, band: Math.round(doc.scrollHeight - lowest) };
  });
}

test.describe("Phone home has no empty band under the footer @component", () => {
  for (const [proj, width] of [["component-390", 390], ["component-768", 768]] as const) {
    for (const lang of ["en", "de", "ar"]) {
      test(`${width} ${lang}: the page ends where the footer ends`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== proj);
        await openHome(page, width, lang);
        const m = await bandBelowContent(page);
        console.log(width, lang, JSON.stringify(m));
        expect(m.band, JSON.stringify(m)).toBeLessThanOrEqual(2);
      });
    }
  }
});
