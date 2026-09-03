import { test, expect } from "@playwright/test";
import { serveMock, waitForMockReady } from "../support/mock-harness";

test.describe("Home fleet availability @customer", () => {
  test("a held First class stays selectable while an ineligible class has an honest non-selecting CTA @customer", async ({ page }) => {
    await page.route("**/api/quote", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          quote_id: "test-quote",
          lock: "test-lock",
          expires_at: "2099-01-01T00:00:00.000Z",
          classes: [
            { slug: "economy", eligible: true },
            { slug: "business", eligible: false, ineligible_reason: "pax" },
            { slug: "van", eligible: true },
          ],
        }),
      });
    });
    const url = await serveMock("app/home/home.dc.html");
    await page.goto(url);
    await waitForMockReady(page);

    const pickup = page.getByRole("combobox", { name: "Pickup" });
    await pickup.fill("Zurich Airport");
    await page.getByRole("option", { name: /Zurich Airport \(ZRH\), Terminal 2/ }).click();

    const destination = page.getByRole("combobox", { name: "Destination" });
    await destination.fill("Bahnhofstrasse");
    await page.getByRole("option", { name: /Zurich, Bahnhofstrasse 1/ }).click();

    await page.getByRole("button", { name: "Select date & time" }).click();
    await page.getByRole("button", { name: "5", exact: true }).click();

    await page.locator("[data-party] button").first().click();

    const first = page.locator("[data-fleet-card]").filter({ hasText: "First" });
    const business = page.locator("[data-fleet-card]").filter({ hasText: "Business" });
    await expect(first).toHaveAttribute("role", "button");
    await expect(first).toContainText("Select");
    await expect(business).toHaveAttribute("role", "group");
    await expect(business).toContainText("Does not fit your party");
    await expect(business.locator("[aria-disabled=true]")).toHaveCount(1);

    await first.focus();
    await page.keyboard.press("Enter");
    await expect(first).toHaveAttribute("data-picked", "1");
    await expect(first).toContainText("Selected");
  });
});
