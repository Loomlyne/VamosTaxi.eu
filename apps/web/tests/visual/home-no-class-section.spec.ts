import { test, expect, type Page } from "../support/test";
import { serveMock, waitForMockReady } from "../support/mock-harness";

// Quick 260930-hnc. The laptop home carries no "Choose your class" section: SEE PRICES already leads to
// /checkout, which holds the class cards. The class line-up is stubbed below, so a section that still exists
// WOULD render three cards here; the test fails then and passes once it is gone.

const CATALOG = [
  { slug: "economy", name: "Economy", eligible: true, ineligible_reason: null, effective_max_pax: 3, max_bags: 3, total_rappen: null },
  { slug: "business", name: "Business", eligible: true, ineligible_reason: null, effective_max_pax: 3, max_bags: 3, total_rappen: null },
  { slug: "van-luxury", name: "Van luxury", eligible: true, ineligible_reason: null, effective_max_pax: 7, max_bags: 7, total_rappen: null },
];

async function openHome(page: Page, width: number) {
  const quoteCalls: string[] = [];
  await page.route("**/api/quote", async (route) => {
    quoteCalls.push(route.request().method());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, classes: CATALOG, fixed_routes: [] }) });
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(await serveMock("app/home/home.dc.html"));
  await waitForMockReady(page);
  const accept = page.getByRole("button", { name: /Accept all/i });
  if (await accept.isVisible().catch(() => false)) await accept.click();
  await page.waitForTimeout(800);
  return quoteCalls;
}

test.describe("Home has no class section @component", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "component-1440", "laptop widths run in the 1440 project");
  });

  test("at 1440 there is no class section, the bar and SEE PRICES stay, and the home bar sends no quote", async ({ page }) => {
    const calls = await openHome(page, 1440);
    await expect(page.locator("[data-cc]")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Choose your class" })).toHaveCount(0);
    await expect(page.locator("#book")).toBeVisible();
    await expect(page.locator("#book").getByRole("button", { name: /see prices/i })).toBeVisible();
    expect(calls.filter((m) => m === "POST"), "the bar does not price a trip").toEqual([]);
  });
});
