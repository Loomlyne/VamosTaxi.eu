import { test, expect, type Page } from "@playwright/test";
import { serveMock, waitForMockReady } from "../support/mock-harness";

const RETURN_NAME = /^(Return|Rückfahrt|Aller-retour|ذهاب وعودة)$/;

async function dismissCookies(page: Page) {
  const accept = page.getByRole("button", { name: /Accept all/i });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
  }
}

async function openBookingIfNarrow(page: Page, projectName: string) {
  if (projectName !== "component-390") return;
  const summary = page.locator('[data-upto-wide] button[aria-haspopup="dialog"]');
  await expect(summary).toBeVisible();
  await summary.click();
  await expect(page.locator('[data-shell][data-open="1"]')).toBeVisible();
}

test.describe("Home one-way only @component", () => {
  test("booking box has no Return tab @component", async ({ page }, testInfo) => {
    const url = await serveMock("app/home/home.dc.html");
    await page.goto(url);
    await waitForMockReady(page);
    await dismissCookies(page);
    await openBookingIfNarrow(page, testInfo.project.name);

    await expect(page.getByRole("tab", { name: RETURN_NAME })).toHaveCount(0);
    await expect(page.getByRole("tablist", { name: /Trip type|Fahrtart/i })).toHaveCount(0);
  });
});
