import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { NEXT_BIN as LOCAL_NEXT, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const PORTS: Record<string, number> = {
  "component-1440": 4240,
  "component-1024": 4241,
  "component-768": 4242,
  "component-390": 4243,
};

const LOCALES = ["en", "de", "fr", "ar"] as const;
const CARD_STATES = [
  "light-default",
  "light-hover",
  "light-press",
  "light-focus",
  "light-selected",
  "light-disabled",
  "light-loading",
] as const;

const BANNED_RGB = [
  "rgb(255, 251, 238)",
  "rgb(254, 243, 205)",
  "rgb(254, 231, 155)",
  "rgb(253, 214, 90)",
  "rgb(209, 156, 4)",
  "rgb(166, 123, 5)",
];

let devServer: ChildProcess | null = null;
let baseURL = "";

function resolveNextBin(): string {
  if (existsSync(LOCAL_NEXT)) return LOCAL_NEXT;
  let dir = WEB_ROOT;
  for (let i = 0; i < 10; i++) {
    const nested = join(dir, "apps", "web", "node_modules", ".bin", "next");
    if (existsSync(nested)) return nested;
    const here = join(dir, "node_modules", ".bin", "next");
    if (existsSync(here)) return here;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return LOCAL_NEXT;
}

function pathFor(locale: string) {
  return locale === "en" ? "/dev/home/services" : `/${locale}/dev/home/services`;
}

test.describe("Home services @component", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(90_000);
    const port = PORTS[testInfo.project.name] ?? 4249;
    baseURL = `http://localhost:${port}`;
    devServer = spawn(resolveNextBin(), ["dev", "-p", String(port)], {
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
        /* gone */
      }
    }
  });

  for (const locale of LOCALES) {
    for (const state of CARD_STATES) {
      test(`screenshot ${locale} ${state} @component`, async ({ page }) => {
        await page.goto(baseURL + pathFor(locale));
        const tile = page.locator(`[data-state="${state}"]`);
        await expect(tile.locator("[data-svc-card]")).toBeVisible();
        await expect(tile).toHaveScreenshot(`svc-${locale}-${state}.png`);
      });
    }
  }

  test("Law 01 no coloured box-shadow or blur @component", async ({ page }) => {
    await page.goto(baseURL + pathFor("en"));
    for (const state of CARD_STATES) {
      const card = page.locator(`[data-state="${state}"] [data-svc-card]`);
      const { shadow, filter } = await card.evaluate((el) => {
        const s = getComputedStyle(el);
        return { shadow: s.boxShadow, filter: s.filter };
      });
      expect(filter, state).not.toMatch(/blur/i);
      if (shadow && shadow !== "none") {
        const isRing = /0px\s+0px\s+0px\s+3px/.test(shadow);
        expect(isRing || !/rgb\(|hsl\(|#/.test(shadow), `${state} box-shadow ${shadow}`).toBe(true);
      }
    }
  });

  test("Law 02 no banned yellow @component", async ({ page }) => {
    await page.goto(baseURL + pathFor("en"));
    const hits = await page.locator("[data-svc-card]").evaluateAll((els, banned) => {
      const found: string[] = [];
      for (const el of els) {
        const walk = [el, ...Array.from(el.querySelectorAll("*"))];
        for (const node of walk) {
          const s = getComputedStyle(node);
          for (const prop of ["background-color", "color"]) {
            const v = s.getPropertyValue(prop);
            if ((banned as string[]).includes(v)) found.push(`${prop}:${v}`);
          }
        }
      }
      return found;
    }, BANNED_RGB);
    expect(hits).toEqual([]);
  });

  test("grid-template-columns 390 vs 1440 @component", async ({ page }, testInfo) => {
    await page.goto(baseURL + pathFor("en"));
    const cols = await page.locator("[data-state='section-hourly-off'] [data-svc-track]").evaluate((el) => {
      return getComputedStyle(el).gridTemplateColumns;
    });
    const count = cols.split(" ").filter(Boolean).length;
    if (testInfo.project.name === "component-390") {
      expect(count).toBe(1);
    }
    if (testInfo.project.name === "component-1440") {
      expect(count).toBeGreaterThan(1);
    }
  });

  test("no sideways scroll at 390 @component", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-390", "390");
    for (const locale of LOCALES) {
      await page.goto(baseURL + pathFor(locale));
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
  });

  test("disabled card is not focusable and has no href @component", async ({ page }) => {
    await page.goto(baseURL + pathFor("en"));
    const card = page.locator("[data-state='light-disabled'] [data-svc-card]");
    await expect(card).toBeVisible();
    await expect(card).not.toHaveAttribute("href");
    const tag = await card.evaluate((el) => el.tagName);
    expect(tag).not.toBe("A");
    const tabIndex = await card.evaluate((el) => (el as HTMLElement).tabIndex);
    expect(tabIndex).toBeLessThan(0);
  });

  test("reducedMotion disables proximity @component", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(baseURL + pathFor("en"));
    const card = page.locator("[data-state='light-default'] [data-svc-card]");
    await expect(card).toBeVisible();
    const before = await card.evaluate((el) => {
      const s = getComputedStyle(el);
      const media = el.querySelector("[data-svc-media]");
      const ms = media ? getComputedStyle(media) : s;
      return {
        px: s.getPropertyValue("--card-px"),
        py: s.getPropertyValue("--card-py"),
        bg: ms.backgroundImage,
      };
    });
    const box = await card.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    }
    const after = await card.evaluate((el) => {
      const s = getComputedStyle(el);
      const media = el.querySelector("[data-svc-media]");
      const ms = media ? getComputedStyle(media) : s;
      return {
        px: s.getPropertyValue("--card-px"),
        py: s.getPropertyValue("--card-py"),
        bg: ms.backgroundImage,
      };
    });
    expect(after).toEqual(before);
  });

  test("rtl logical properties @component", async ({ page }) => {
    await page.goto(baseURL + pathFor("ar"));
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const padding = await page.locator("[data-svc-inner]").first().evaluate((el) => {
      const s = getComputedStyle(el);
      return { inline: s.paddingInlineStart, physical: s.paddingLeft };
    });
    expect(padding.inline).not.toBe("");
    expect(padding.inline).not.toBe("0px");
  });

  test("accessible name differs en vs de @component", async ({ page }) => {
    await page.goto(baseURL + pathFor("en"));
    const enName = await page
      .locator("[data-state='light-default'] [data-svc-card]")
      .evaluate((el) => (el as HTMLElement).innerText);
    await page.goto(baseURL + pathFor("de"));
    const deName = await page
      .locator("[data-state='light-default'] [data-svc-card]")
      .evaluate((el) => (el as HTMLElement).innerText);
    expect(enName.trim().length).toBeGreaterThan(0);
    expect(deName.trim().length).toBeGreaterThan(0);
    expect(enName).not.toBe(deName);
  });
});
