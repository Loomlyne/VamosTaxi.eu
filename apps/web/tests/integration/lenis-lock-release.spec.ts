// apps/web/tests/integration/lenis-lock-release.spec.ts
//
// The page scroll lock must release. assets/lenis-boot.js stops Lenis while html or body
// compute to overflow hidden/clip. lenis.stop() puts `lenis-stopped` on <html>, and
// lenis.css turns that class into `overflow: clip`, so reading the COMPUTED value of html
// counted Lenis's own clip as a lock, called stop() again and never start(): after any
// sheet, menu or dialog closed the page could not be scrolled until a reload.
//
// Runs on the real mock page /faq (real lenis.js, lenis-boot.js, SiteHeader phone menu),
// served by a small static server over apps/web/public (synced from app/ and assets/),
// with /api/* answered empty. No next dev, no Worker.

import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import type { AddressInfo } from "node:net";
import { WEB_ROOT } from "../support/server-harness";

const PUBLIC = join(WEB_ROOT, "public");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

let server: Server;
let base = "";

// One viewport project is enough: the spec sets its own viewports.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "" && testInfo.project.name !== "component-1440", "runs once");
});

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname.startsWith("/api/")) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, data: [] }));
      return;
    }
    const path = url.pathname === "/faq" ? "/app/pages/faq.html" : url.pathname;
    const file = normalize(join(PUBLIC, path));
    if (!file.startsWith(PUBLIC) || !existsSync(file)) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
    res.end(readFileSync(file));
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(() => {
  server.close();
});

async function open(page: Page): Promise<void> {
  await page.goto(`${base}/faq`, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean((window as unknown as { __vtLenis?: unknown }).__vtLenis), null, { timeout: 15_000 });
  await page.waitForTimeout(500);
}

const stopped = (page: Page) => page.evaluate(() => document.documentElement.classList.contains("lenis-stopped"));

async function wheelMoves(page: Page): Promise<boolean> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.mouse.move(400, 400);
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(700);
  return (await page.evaluate(() => window.scrollY)) > 200;
}

async function touchMoves(page: Page): Promise<boolean> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.synthesizeScrollGesture", { x: 195, y: 500, yDistance: -600, speed: 1200, gestureSourceType: "touch" });
  await page.waitForTimeout(400);
  return (await page.evaluate(() => window.scrollY)) > 200;
}

test.describe("@lenis lock release", () => {
  test("a body lock stops Lenis and releasing it starts Lenis again (wheel)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    expect(await wheelMoves(page)).toBe(true);

    await page.evaluate(() => { document.body.style.overflow = "hidden"; });
    await expect.poll(() => stopped(page)).toBe(true);

    await page.evaluate(() => { document.body.style.overflow = ""; });
    await expect.poll(() => stopped(page), { timeout: 3000 }).toBe(false);
    expect(await wheelMoves(page)).toBe(true);
  });

  test("the booking sheet lock on html and body releases too", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    await page.evaluate(() => {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    });
    await expect.poll(() => stopped(page)).toBe(true);
    await page.evaluate(() => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    });
    await expect.poll(() => stopped(page), { timeout: 3000 }).toBe(false);
    expect(await wheelMoves(page)).toBe(true);
  });

  test("a lock that stays on keeps Lenis stopped", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    await page.evaluate(() => { document.body.style.overflow = "hidden"; });
    await page.waitForTimeout(800);
    expect(await stopped(page)).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __vtLenis: { isStopped: boolean } }).__vtLenis.isStopped)).toBe(true);
  });

  test("the real phone menu on /faq at 390: open, close, the page scrolls again", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await open(page);
    expect(await touchMoves(page)).toBe(true);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator("[data-hd-menu-btn]").first().click();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await expect.poll(() => stopped(page)).toBe(true);

    await page.locator("[data-hd-scrim]").first().click({ position: { x: 20, y: 400 } });
    await expect.poll(() => page.evaluate(() => document.body.style.overflow), { timeout: 4000 }).toBe("");
    await expect.poll(() => stopped(page), { timeout: 3000 }).toBe(false);
    expect(await touchMoves(page)).toBe(true);
    await context.close();
  });
});
