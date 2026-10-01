import { test, expect, type Page } from "../support/test";
import { serveMock, waitForMockReady } from "../support/mock-harness";

// Phase 26.3 plan 04 (D-04): the home booking box has no trip-type tabs any more. One box,
// one flow. What the box does is proven in home-booking-box.spec.ts.

const TAB_NAMES = /^(One way|Airport pickup|City to city|Return|Einfache Fahrt|Flughafenabholung|Stadt zu Stadt|Rückfahrt|Aller simple|Aller-retour|De ville en ville)$/;

async function dismissCookies(page: Page) {
  const accept = page.getByRole("button", { name: /Accept all/i });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
  }
}

test.describe("Home has no trip-type tabs @component", () => {
  test("the booking box carries no tablist and no trip-type tab @component", async ({ page }) => {
    const url = await serveMock("app/home/home.dc.html");
    await page.goto(url);
    await waitForMockReady(page);
    await dismissCookies(page);

    // 26.4 (D-01): at 1080px and under the one-line bar replaces the box, so #book is the bar there.
    const wide = (page.viewportSize()?.width ?? 0) > 1080;
    if (wide) await expect(page.locator("#book [data-box]")).toBeVisible();
    else await expect(page.locator("#book")).toBeVisible();
    await expect(page.locator("#book").getByRole("tablist")).toHaveCount(0);
    await expect(page.locator("#book").getByRole("tab", { name: TAB_NAMES })).toHaveCount(0);
    await expect(page.locator("#book")).not.toContainText(/Pick one to skip a step|Fixed prices for this route/);
  });
});
