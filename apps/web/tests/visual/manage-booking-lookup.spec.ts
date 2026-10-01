import { test, expect } from "../support/test";
import { serveMock, waitForMockReady } from "../support/mock-harness";

async function openLookup(page: import("../support/test").Page): Promise<void> {
  const url = await serveMock("app/pages/manage-booking.dc.html");
  await page.goto(url);
  await waitForMockReady(page);
  await expect(page.getByRole("heading", { name: "Open your booking" })).toBeVisible();
}

test.describe("Manage booking lookup gate @customer", () => {
  test("keyboard activation opens sign in and a reference submission never opens the fixture @customer [4vp]", async ({ page }) => {
    await openLookup(page);

    const signIn = page.getByRole("link", { name: /sign in/i }).first();
    await signIn.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/sign-in(\.dc\.html)?$/);

    await page.goBack();
    await waitForMockReady(page);
    await page.getByLabel("Booking reference").fill("VT-4821");
    await page.getByLabel("Email address").fill("customer@example.com");
    await page.getByLabel("Email address").press("Enter");

    await expect(page.getByRole("alert")).toContainText("We could not find this booking.");
    await expect(page.getByRole("heading", { name: "VT-4821" })).toHaveCount(0);
  });

  test("an active server session hides the account prompt without client-side account storage @customer", async ({ page }) => {
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ signedIn: true }),
      });
    });
    await openLookup(page);

    await expect(page.getByText("Booked with an account?", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Or use your reference", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => Object.keys(window.localStorage).filter((key) => /session|account|booking/i.test(key)))).toEqual([]);
  });
});
