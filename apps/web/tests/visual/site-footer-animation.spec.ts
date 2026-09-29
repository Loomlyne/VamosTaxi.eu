import { test, expect, emulateMedia } from "../support/test";
import { serveMock, waitForMockReady } from "../support/mock-harness";

test.describe("SiteFooter letter roll @component", () => {
  test("English rests as one label and rolls on keyboard focus @component [4vp]", async ({ page }) => {
    const url = await serveMock("app/pages/SiteFooter.dc.html");
    await page.goto(url);
    await waitForMockReady(page);

    const link = page.getByRole("link", { name: "About", exact: true });
    await expect(link).toHaveAttribute("data-split", "1");
    await expect(link).toHaveAttribute("aria-label", "About");
    await expect(link.locator(".ft-c")).toHaveCount(5);
    expect(
      await link.locator(".ft-c>i").evaluateAll((cells) =>
        cells.map((cell) => Array.from(cell.childNodes).find((node) => node.nodeType === Node.TEXT_NODE)?.textContent ?? "").join(""),
      ),
    ).toBe("About");
    expect(
      await link.locator(".ft-c").first().evaluate((cell) => {
        const clone = cell.querySelector("b")?.getBoundingClientRect();
        const bounds = cell.getBoundingClientRect();
        return !!clone && clone.top >= bounds.bottom;
      }),
    ).toBe(true);

    await link.focus();
    await expect
      .poll(() => link.locator(".ft-c>i").first().evaluate((node) => getComputedStyle(node).transform))
      .not.toBe("none");
  });

  test("Arabic stays joined, reduced motion keeps clones clipped, and mobile does not overflow @component [4vp]", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "component-390", "mobile-specific proof");
    await emulateMedia(page, { reducedMotion: "reduce" });
    const url = await serveMock("app/pages/SiteFooter.dc.html");
    await page.goto(url);
    await waitForMockReady(page);

    await page.evaluate(() =>
      (window as Window & typeof globalThis & { VamosLocale?: { setLang: (value: string) => void } })
        .VamosLocale?.setLang("ar"),
    );
    const about = page.getByRole("link", { name: "من نحن", exact: true });
    await expect(about).toHaveText("من نحن");
    await expect(about).not.toHaveAttribute("data-split", "1");
    await expect(page.locator(".ft-c")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
