// apps/web/tests/visual/legal-terms.spec.ts
import { test, expect } from "../support/test";
import { testPort } from "../support/port";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const SECTION_IDS = [
  "parties",
  "scope",
  "booking",
  "price",
  "carriers",
  "passenger",
  "luggage",
  "waiting",
  "noshow",
  "changes",
  "payment",
  "complaints",
  "liability",
  "force",
  "data",
  "law",
];

const PORTS: Record<string, number> = {
  "component-1440": testPort(4140),
  "component-1024": testPort(4141),
  "component-768": testPort(4142),
  "component-390": testPort(4143),
};

let devServer: ChildProcess | null = null;
let baseURL = "";

test.describe("Terms page @component", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(90_000);
    const port = PORTS[testInfo.project.name] ?? testPort(4149);
    baseURL = `http://localhost:${port}`;
    devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
    });
    await waitForNextServer(baseURL);
  });

  test.afterAll(() => {
    if (devServer?.pid) {
      try {
        process.kill(-devServer.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
    devServer = null;
  });

  for (const locale of ["en", "de", "fr", "ar"] as const) {
    const path = locale === "en" ? "/terms" : `/${locale}/terms`;

    test(`screenshot ${locale} @component`, async ({ page }) => {
      await page.goto(baseURL + path);
      await expect(page.locator("main")).toBeVisible();
      await expect(page).toHaveScreenshot(`terms-${locale}.png`);
    });
  }

  test("no sideways scroll at 390 @component", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-390", "390 only");
    for (const path of ["/terms", "/de/terms", "/fr/terms", "/ar/terms"]) {
      await page.goto(baseURL + path);
      // Measure the rendered mock, not the boot frame (flaky on Linux at 390).
      await expect(page.locator(`#${SECTION_IDS[0]}`)).toHaveCount(1);
      // On a miss the poll's last value names the widest elements, so a red run says what overflows and where.
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const iw = window.innerWidth;
              const sw = document.documentElement.scrollWidth;
              if (sw <= iw) return "fits";
              const wide = [...document.querySelectorAll("body *")]
                .map((el) => ({ el, right: Math.round(el.getBoundingClientRect().right) }))
                .filter((x) => x.right > iw)
                .sort((a, b) => b.right - a.right)
                .slice(0, 4)
                .map((x) => `${x.el.tagName.toLowerCase()}${x.el.id ? "#" + x.el.id : ""}[${String(x.el.getAttribute("class") ?? "").slice(0, 30)}] right=${x.right}`);
              return `scrollWidth ${sw} > ${iw}: ${wide.join(" ; ")}`;
            }),
          { message: `no sideways scroll on ${path}` },
        )
        .toBe("fits");
    }
  });

  test("TOC hashes match section ids @component", async ({ page }) => {
    await page.goto(baseURL + "/terms");
    for (const id of SECTION_IDS) {
      await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
    const hrefs = await page.locator("[data-lg-tl]").evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute("href")),
    );
    expect(hrefs.sort()).toEqual(SECTION_IDS.map((id) => `#${id}`).sort());
  });

  test("hreflang in raw response @component", async ({ page }) => {
    const res = await page.goto(baseURL + "/terms");
    const body = (await res?.text()) ?? "";
    expect(body).toMatch(/hreflang="en"/i);
    expect(body).toMatch(/hreflang="de"/i);
    expect(body).toMatch(/hreflang="fr"/i);
    expect(body).toMatch(/hreflang="ar"/i);
    expect(body).toMatch(/hreflang="x-default"/i);
  });

  // 26.0 (main-green-3): /terms is the DC mock app/pages/terms.dc.html (middleware DC_PAGES). Since e27014c1 a
  // live legal page carries no labelled gap, so there may be no [data-tok] at all; whatever pills exist read the
  // same English words in every language (ADR-011). The old first().textContent() waited 90 s for a pill.
  test("rtl and English data-tok @component", async ({ page }) => {
    await page.goto(baseURL + "/ar/terms");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl"); // dir="rtl"
    await expect(page.locator(`#${SECTION_IDS[0]}`)).toHaveCount(1);
    const tok = await page.locator("[data-tok]").allTextContents();
    await page.goto(baseURL + "/terms");
    await expect(page.locator(`#${SECTION_IDS[0]}`)).toHaveCount(1);
    const tokEn = await page.locator("[data-tok]").allTextContents();
    expect(tok).toEqual(tokEn);
  });

  test("print control 44px keyboard @component", async ({ page }) => {
    await page.goto(baseURL + "/terms");
    // The mock's own print button (the React page's .vt-legal-print never renders here).
    const btn = page.getByRole("button", { name: "Print or save as PDF" });
    await expect(btn).toBeVisible();
    const box = await btn.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await btn.focus();
    await expect(btn).toBeFocused();
  });
});
