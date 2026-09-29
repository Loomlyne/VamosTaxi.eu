import { test, expect } from "@playwright/test";
import { serveMock, waitForMockReady } from "../support/mock-harness";

test.describe("Home fleet availability @customer", () => {
  test("a held Economy class stays selectable while an ineligible class has an honest non-selecting CTA @customer", async ({ page }, testInfo) => {
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
            { slug: "economy", eligible: true, total_rappen: 13000 },
            { slug: "business", eligible: false, ineligible_reason: "pax", effective_max_pax: 4 },
            { slug: "van", eligible: true, total_rappen: 15000 },
          ],
        }),
      });
    });
    const url = await serveMock("app/home/home.dc.html");
    await page.goto(url);
    await waitForMockReady(page);
    const acceptCookies = page.getByRole("button", { name: /Accept all/i });
    if (await acceptCookies.isVisible().catch(() => false)) await acceptCookies.click();

    const pickup = page.getByRole("combobox", { name: "Pickup" });
    await pickup.fill("Zurich Airport");
    await page.getByRole("option", { name: /Zurich Airport \(ZRH\), Terminal 2/ }).click();

    const destination = page.getByRole("combobox", { name: "Destination" });
    await destination.fill("Bahnhofstrasse");
    await page.getByRole("option", { name: /Zurich, Bahnhofstrasse 1/ }).click();

    await page.getByRole("button", { name: "Select date & time" }).click();
    // The calendar is live: days before today are not buttons. Next month's 5th always is.
    await page.getByRole("button", { name: "Next month" }).click();
    await page.getByRole("button", { name: "5", exact: true }).click();

    // Airport pickup requires a flight number before classes unlock (00c538f).
    const flight = page.getByRole("textbox", { name: /^Flight/ }).first();
    await flight.fill("LX 54");
    await flight.press("Escape");

    await page.locator("[data-party] button:visible").first().click();

    // Product classes are Economy, Business and Van (First is dropped); a slug the
    // quote does not return never renders.
    const held = page.locator("[data-fleet-card]").filter({ hasText: "Economy" });
    const business = page.locator("[data-fleet-card]").filter({ hasText: "Business" });
    await expect(page.locator("[data-fleet-card]").filter({ hasText: "First" })).toHaveCount(0);
    await expect(held).toHaveAttribute("role", "button");
    await expect(held).toContainText("Select");
    await expect(business).toHaveAttribute("role", "group");
    // Server-ineligible CTA states the class limit (be1c808), not a generic refusal.
    await expect(business).toContainText("Up to 4 passengers");
    await expect(business.locator("[aria-disabled=true]")).toHaveCount(1);

    // Under 700px the fleet strip is hidden (data-hide-narrow, f38c70d): the phone
    // opens the trip at checkout instead, so there is no card to activate here.
    if (testInfo.project.name === "component-390") {
      await expect(page.locator("[data-fleet-strip]")).toBeHidden();
      return;
    }

    await held.focus();
    await page.keyboard.press("Enter");
    await expect(held).toHaveAttribute("data-picked", "1");
    await expect(held).toContainText("Selected");
  });
});
