import { test, expect, emulateMedia } from "../support/test";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

// Reviews wall drift (quick 261003, R2-4). Serves the synced DC mock (apps/web/public) on its own port.
// FIXTURE ROWS ONLY: every review below is a test fixture, served to the browser through a stubbed
// /api/reviews. None of it exists in app/, the seed or any file the live site reads.
const PUBLIC_DIR = path.resolve(__dirname, "../../public");
const PORT = 4814;
const TYPES: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".json": "application/json",
};

const FIXTURE_ROWS = Array.from({ length: 8 }, (_, i) => ({
  id: `FIXTURE-${i}`,
  source: (["google", "trustpilot", "tripadvisor"] as const)[i % 3],
  rating: 4 + (i % 2),
  authorName: `FIXTURE reviewer ${i + 1}`,
  routeLabel: "",
  body: `FIXTURE review ${i + 1}. Test text only, not a real review.`,
  published: true,
  sortOrder: i,
  sourceUrl: "",
}));
const rows = (n: number) => FIXTURE_ROWS.slice(0, n);

let server: http.Server;
let owned = true;

test.describe("Reviews drift @component", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeAll(async () => {
    server = http.createServer((q, s) => {
      const p = path.join(PUBLIC_DIR, decodeURIComponent((q.url ?? "/").split("?")[0] ?? "/"));
      fs.readFile(p, (e, d) => {
        if (e) { s.statusCode = 404; return s.end(); }
        s.setHeader("content-type", TYPES[path.extname(p)] ?? "application/octet-stream");
        s.end(d);
      });
    });
    // Another worker (other viewport project) may already serve the same folder on this port: reuse it.
    await new Promise<void>((r) => {
      server.once("error", () => { owned = false; r(); });
      server.listen(PORT, "127.0.0.1", () => r());
    });
  });
  test.afterAll(async () => {
    if (owned) await new Promise<void>((r) => server.close(() => r()));
  });

  async function open(page: import("@playwright/test").Page, n: number, width?: number) {
    await page.setViewportSize({ width: width ?? page.viewportSize()?.width ?? 1440, height: 900 });
    await page.route("**/api/**", (r) =>
      r.request().url().includes("/api/reviews")
        ? r.fulfill({ json: { ok: true, data: rows(n) } })
        : r.fulfill({ json: { ok: true, data: [] } }),
    );
    await page.goto(`http://127.0.0.1:${PORT}/app/pages/about.dc.html`, { waitUntil: "load" });
    await page.waitForSelector("#reviews [data-rv-wall] [data-rv-item]", { timeout: 20_000 });
  }

  /** Phones (<=680) never drift (owner R2-4): at the 390 project the drift checks run at 768. */
  const driftWidth = (page: import("@playwright/test").Page) => ((page.viewportSize()?.width ?? 1440) <= 680 ? 768 : undefined);

  test("6 published reviews stay static, 7 drift @component", async ({ page }) => {
    const w = driftWidth(page);
    await open(page, 6, w);
    await expect(page.locator("#reviews [data-rv-drift]")).toHaveCount(0);
    await expect(page.locator("#reviews [data-rv-wall] [data-rv-item]")).toHaveCount(6);
    await page.unrouteAll();
    const p2 = await page.context().newPage();
    await open(p2, 7, w);
    await expect(p2.locator("#reviews [data-rv-drift]")).toHaveCount(1);
    await expect(p2.locator("#reviews [data-rv-col]")).toHaveCount((p2.viewportSize()?.width ?? 1440) > 1080 ? 3 : 2);
    const name = await p2.locator("#reviews [data-rv-col]").first().evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toBe("rvdrift");
  });

  test("clones (3 repeats per review) are aria-hidden and inert @component", async ({ page }) => {
    await open(page, 7, driftWidth(page));
    const clones = page.locator("#reviews [data-rv-clone]");
    await expect(clones).toHaveCount(21);
    for (let i = 0; i < 21; i++) {
      await expect(clones.nth(i)).toHaveAttribute("aria-hidden", "true");
      expect(await clones.nth(i).evaluate((el) => el.hasAttribute("inert"))).toBe(true);
    }
    await expect(page.locator("#reviews [data-rv-item]:not([data-rv-clone])")).toHaveCount(7);
  });

  test("7 reviews: every column track outlasts the wall, no gap at any point of the loop @component", async ({ page }) => {
    await open(page, 7, driftWidth(page));
    const m = await page.evaluate(() => {
      const wall = document.querySelector("#reviews [data-rv-wall]") as HTMLElement;
      const wh = wall.getBoundingClientRect().height;
      return [...wall.querySelectorAll("[data-rv-col]")].map((c) => {
        const h = (c as HTMLElement).getBoundingClientRect().height;
        return { wh, track: h, set: h / 4, reach: h - h / 4 };
      });
    });
    for (const c of m) {
      // at the end of one loop the view starts one set down: track minus one set must still cover the wall
      expect(c.reach).toBeGreaterThanOrEqual(c.wh);
    }
  });

  test("hover pauses the drift @component", async ({ page }) => {
    await open(page, 7, driftWidth(page));
    const state = () => page.locator("#reviews [data-rv-col]").first().evaluate((el) => el.getAnimations()[0]?.playState);
    expect(await state()).toBe("running");
    await page.locator("#reviews [data-rv-wall]").hover();
    expect(await state()).toBe("paused");
  });

  test("reduced motion: no animation, clones hidden, every review shown @component", async ({ page }) => {
    await emulateMedia(page, { reducedMotion: "reduce" });
    await open(page, 7, driftWidth(page));
    const col = page.locator("#reviews [data-rv-col]").first();
    expect(await col.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    await expect(page.locator("#reviews [data-rv-clone]").first()).toBeHidden();
    const wall = page.locator("#reviews [data-rv-wall]");
    expect(await wall.evaluate((el) => getComputedStyle(el).overflow)).toBe("visible");
    expect(await wall.evaluate((el) => getComputedStyle(el).maskImage)).toBe("none");
    await expect(page.locator("#reviews [data-rv-item]:not([data-rv-clone])").first()).toBeVisible();
  });

  test("phone 390: static wall, no drift, no sideways scroll @component", async ({ page }) => {
    await open(page, 7, 390);
    await expect(page.locator("#reviews [data-rv-drift]")).toHaveCount(0);
    await expect(page.locator("#reviews [data-rv-wall] [data-rv-item]")).toHaveCount(7);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("crossing 680px re-splits the columns @component", async ({ page }) => {
    await open(page, 8, 1440);
    await expect(page.locator("#reviews [data-rv-col]")).toHaveCount(3);
    await page.setViewportSize({ width: 900, height: 900 });
    await expect(page.locator("#reviews [data-rv-col]")).toHaveCount(2);
    await page.setViewportSize({ width: 600, height: 900 });
    await expect(page.locator("#reviews [data-rv-drift]")).toHaveCount(0);
  });
});
