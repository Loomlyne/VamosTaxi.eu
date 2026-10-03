import { test, expect } from "../support/test";
import { testPort } from "../support/port";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import { nextDevEnv } from "../support/test-stack";

const PORTS: Record<string, number> = {
  "component-1440": testPort(4213),
  "component-1024": testPort(4211),
  "component-768": testPort(4212),
  "component-390": testPort(4210),
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
      process.kill(-devServer.pid, "SIGTERM");
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
    env: nextDevEnv({ TEST_DIST_DIR: `test-results/.next-faq-${port}` }, { gallery: true }),
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
    await startServer(PORTS[testInfo.project.name] ?? testPort(4219));
  });

  test.beforeEach(async () => {
    await ensureServer();
  });

  test.afterAll(() => {
    if (devServer?.pid) {
      try {
        // The whole group: on the Linux runner the leader is the logging wrapper (next-dev-logged.sh) and a signal
        // to the leader alone left `next dev` running on the port.
        process.kill(-devServer.pid, "SIGTERM");
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

  test("topics rail: swipe row at 390, rail beside the questions above 900 @component", async ({ page }, testInfo) => {
    const project = testInfo.project.name;
    test.skip(
      project !== "component-390" && project !== "component-1024" && project !== "component-1440",
      "layout steps",
    );
    await page.goto(baseURL + "/faq");
    await expect(page.locator("[data-faq-topic]")).toHaveCount(4);
    const dir = await page.locator("[data-faq-topics]").evaluate((el) => getComputedStyle(el).flexDirection);
    const cols = await page.locator("[data-faq-layout]").evaluate((el) => getComputedStyle(el).gridTemplateColumns);
    const count = cols.split(" ").filter(Boolean).length;
    if (project === "component-390") {
      expect(dir).toBe("row");
      expect(count).toBe(1);
    } else {
      expect(dir).toBe("column");
      expect(count).toBe(2);
    }
  });

  test("full set: the FAQ page carries the page-only questions @component", async ({ page }) => {
    await page.goto(baseURL + "/faq");
    await expect(page.locator("[data-faq-toggle]")).toHaveCount(19);
    await page.locator("[data-faq-topic]").nth(3).click();
    await expect(page.locator('[data-faq-set][data-on="1"] [data-faq-toggle]')).toHaveCount(5);
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
    // /faq is the DC mock (apps/web/middleware.ts DC_PAGES), whose first answer is open on arrival
    // (app/pages/faq.dc.html, `open: { 1: true }`). Enter and Space each flip the state from there.
    const first = await toggle.getAttribute("aria-expanded");
    expect(first === "true" || first === "false").toBe(true);
    const flipped = first === "true" ? "false" : "true";
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", flipped);
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-expanded", first ?? "");
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", flipped);
    const shadow = await toggle.evaluate((el) => getComputedStyle(el).boxShadow);
    const ring = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--vt-ring").trim(),
    );
    expect(shadow.replace(/\s+/g, " ")).toContain("0px 0px 0px 3px");
    expect(ring).toContain("0 0 0 3px");
    expect(shadow).not.toMatch(/hsl/i);
  });

  test("open mark stays full-strength yellow @component", async ({ page }) => {
    await page.goto(baseURL + "/faq");
    const card = page.locator("[data-faq-card]").first();
    const toggle = card.locator("[data-faq-toggle]");
    await expect(async () => {
      if ((await toggle.getAttribute("aria-expanded")) !== "true") {
        await toggle.click();
      }
      expect(await toggle.getAttribute("aria-expanded")).toBe("true");
    }).toPass();
    const accent = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.background = "var(--vt-accent)";
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    });
    const mark = card.locator("[data-faq-mark]");
    await expect(mark).toHaveCSS("background-color", accent);
    await toggle.hover();
    await expect(mark).not.toHaveCSS("background-color", "rgb(209, 156, 4)");
  });

  test("rtl: the mark sits at the inline end @component", async ({ page }) => {
    await page.goto(baseURL + "/ar/faq");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const left = await page.locator("[data-faq-mark]").first().evaluate((el) => el.getBoundingClientRect().left);
    const textLeft = await page.locator("[data-faq-q]").first().evaluate((el) => el.getBoundingClientRect().left);
    expect(left).toBeLessThan(textLeft);
  });

  test("toggle accessible name differs en vs de @component", async ({ page }) => {
    await page.goto(baseURL + "/faq");
    const enNames = await page.locator("[data-faq-toggle]").evaluateAll((els) =>
      els.map((el) => (el as HTMLButtonElement).innerText.trim()),
    );
    await page.goto(baseURL + "/de/faq");
    expect(enNames.length).toBeGreaterThan(0);
    // The page is a mock: its English markup is translated by the locale runtime after the load event, so a read
    // straight after goto can still see English on a slow runner (flaky on Linux, one toggle each time). Poll until
    // every toggle has changed, and print the ones that did not.
    await expect
      .poll(
        async () => {
          const deNames = await page.locator("[data-faq-toggle]").evaluateAll((els) =>
            els.map((el) => (el as HTMLButtonElement).innerText.trim()),
          );
          if (deNames.length !== enNames.length) return `${deNames.length} toggles in de, ${enNames.length} in en`;
          return deNames.filter((name, i) => name === enNames[i]).join(" | ") || "all differ";
        },
        { timeout: 15_000, message: "every FAQ toggle reads German" },
      )
      .toBe("all differ");
  });
});
