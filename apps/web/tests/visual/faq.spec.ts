import { test, expect } from "../support/test";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const PORTS: Record<string, number> = {
  "component-1440": 4213,
  "component-1024": 4211,
  "component-768": 4212,
  "component-390": 4210,
};

const LOCALES = ["en", "de", "fr", "ar"] as const;

let devServer: ChildProcess | null = null;
let baseURL = "";
let serverPort = 0;

function pathFor(locale: string, route: "/faq" | "/dev/faq"): string {
  return locale === "en" ? route : `/${locale}${route}`;
}

async function startServer(port: number): Promise<void> {
  if (devServer?.pid) {
    try {
      process.kill(devServer.pid, "SIGTERM");
    } catch {
      /* gone */
    }
    devServer = null;
  }
  serverPort = port;
  baseURL = `http://localhost:${port}`;
  devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: {
      ...process.env,
      TEST_DIST_DIR: `test-results/.next-faq-${port}`,
    },
  });
  await waitForNextServer(baseURL, 180_000);
  for (const path of ["/faq", "/dev/faq"] as const) {
    const res = await fetch(baseURL + path);
    if (res.status >= 400) {
      throw new Error(`warmup ${path} status ${res.status}`);
    }
  }
}

async function ensureServer(): Promise<void> {
  try {
    const res = await fetch(baseURL + "/faq");
    if (res.status < 400) return;
  } catch {
    /* down */
  }
  await startServer(serverPort);
}

test.describe("FAQ page and gallery @component", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(240_000);
    await startServer(PORTS[testInfo.project.name] ?? 4219);
  });

  test.beforeEach(async () => {
    await ensureServer();
  });

  test.afterAll(() => {
    if (devServer?.pid) {
      try {
        process.kill(devServer.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
    devServer = null;
  });

  for (const locale of LOCALES) {
    test(`screenshot gallery ${locale} @component`, async ({ page }) => {
      await page.goto(baseURL + pathFor(locale, "/dev/faq"), { timeout: 60_000 });
      await expect(page.locator("[data-faq-gallery]")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("[data-faq-card][data-state=loading]").first()).toBeVisible();
      await expect(page).toHaveScreenshot(`faq-gallery-${locale}.png`, { fullPage: true });
    });

    test(`screenshot faq ${locale} @component`, async ({ page }) => {
      await page.goto(baseURL + pathFor(locale, "/faq"), { timeout: 60_000 });
      await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
      await expect(page).toHaveScreenshot(`faq-${locale}.png`, { fullPage: true });
    });
  }

  test("grid-template-columns 390/1024/1440 @component", async ({ page }, testInfo) => {
    const project = testInfo.project.name;
    test.skip(
      project !== "component-390" && project !== "component-1024" && project !== "component-1440",
      "column steps",
    );
    await page.goto(baseURL + "/faq");
    const cols = await page.locator("[data-faq-grid]").first().evaluate((el) => {
      return getComputedStyle(el).gridTemplateColumns;
    });
    const count = cols.split(" ").filter(Boolean).length;
    if (project === "component-390") expect(count).toBe(1);
    if (project === "component-1024") expect(count).toBe(2);
    if (project === "component-1440") expect(count).toBe(3);
  });

  test("no sideways scroll at 390 @component", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-390", "390 only");
    for (const locale of LOCALES) {
      await page.goto(baseURL + pathFor(locale, "/faq"));
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
      expect(overflow).toBe(true);
    }
  });

  test("keyboard disclosure aria-controls and ring @component", async ({ page }) => {
    await page.goto(baseURL + "/faq");
    const toggle = page.locator("[data-faq-toggle]").first();
    await toggle.focus();
    await expect(toggle).toBeFocused();
    const controls = await toggle.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    const panel = page.locator(`#${controls}`);
    await expect(panel).toHaveCount(1);
    expect(await toggle.getAttribute("aria-expanded")).toBe("false");
    await page.keyboard.press("Enter");
    expect(await toggle.getAttribute("aria-expanded")).toBe("true");
    await page.keyboard.press("Space");
    expect(await toggle.getAttribute("aria-expanded")).toBe("false");
    await page.keyboard.press("Enter");
    const shadow = await toggle.evaluate((el) => getComputedStyle(el).boxShadow);
    const ring = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--vt-ring").trim(),
    );
    expect(shadow.replace(/\s+/g, " ")).toContain("0px 0px 0px 3px");
    expect(ring).toContain("0 0 0 3px");
    expect(shadow).not.toMatch(/hsl/i);
  });

  test("open circle stays full-strength yellow @component", async ({ page }) => {
    await page.goto(baseURL + "/faq");
    const card = page.locator("[data-faq-card]").first();
    const toggle = card.locator("[data-faq-toggle]");
    await expect(async () => {
      if ((await toggle.getAttribute("aria-expanded")) !== "true") {
        await toggle.click();
      }
      expect(await toggle.getAttribute("aria-expanded")).toBe("true");
    }).toPass();
    const circle = card.locator("[data-faq-circle]");
    const yellow = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--vt-yellow").trim(),
    );
    const brown = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.background = "#D19C04";
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    });
    const yellowRgb = await page.evaluate((token) => {
      const probe = document.createElement("div");
      probe.style.background = token;
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    }, yellow);
    await expect(circle).toHaveCSS("background-color", yellowRgb);
    expect(await circle.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(brown);
    await toggle.hover();
    await expect(circle).toHaveCSS("background-color", yellowRgb);
    expect(await circle.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(brown);
  });

  test("rtl circle inset-inline-end @component", async ({ page }) => {
    await page.goto(baseURL + "/ar/faq");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const inset = await page
      .locator("[data-faq-circle]")
      .first()
      .evaluate((el) => getComputedStyle(el).insetInlineEnd);
    expect(inset).not.toBe("auto");
  });

  test("toggle accessible name differs en vs de @component", async ({ page }) => {
    await page.goto(baseURL + "/faq");
    const enNames = await page.locator("[data-faq-toggle]").evaluateAll((els) =>
      els.map((el) => (el as HTMLButtonElement).innerText.trim()),
    );
    await page.goto(baseURL + "/de/faq");
    const deNames = await page.locator("[data-faq-toggle]").evaluateAll((els) =>
      els.map((el) => (el as HTMLButtonElement).innerText.trim()),
    );
    expect(enNames.length).toBeGreaterThan(0);
    expect(enNames.length).toBe(deNames.length);
    for (let i = 0; i < enNames.length; i += 1) {
      expect(deNames[i]).not.toBe(enNames[i]);
    }
  });
});
