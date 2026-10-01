/**
 * @component 265-09: the approved "Your account" paragraph on the live /privacy mock, in four
 * languages: text, no gap pill, translation coverage empty, no sideways scroll, Arabic RTL.
 * The texts come from the decision file. Runs once under component-1440 (resizes itself).
 */
import { test, expect } from "../support/test";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const RUN_PROJECT = "component-1440";
const PORT = 4336;
const LOCALES = ["en", "de", "fr", "ar"] as const;

const doc = readFileSync(join(WEB_ROOT, "../../.planning/decisions/2026-09-30-legal-pages.md"), "utf8");
const section = doc.split('## Privacy paragraph "Your account"')[1] ?? "";
const TEXT: Record<string, string> = {};
for (const m of section.matchAll(/^\| (en|de|fr|ar) \| (.+) \|$/gm)) TEXT[m[1] ?? ""] = (m[2] ?? "").replace(/\*\*/g, "");

let devServer: ChildProcess | null = null;
let baseURL = "";

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== RUN_PROJECT) return;
  testInfo.setTimeout(90_000);
  baseURL = `http://localhost:${PORT}`;
  devServer = spawn(NEXT_BIN, ["dev", "-p", String(PORT)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: {
      ...process.env,
      SUPABASE_URL: process.env.SUPABASE_URL ?? "http://127.0.0.1:54321",
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "anon-placeholder",
    },
  });
  await waitForNextServer(baseURL);
});

test.afterAll(() => {
  if (devServer?.pid) {
    try {
      process.kill(-devServer.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
  devServer = null;
});

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== RUN_PROJECT, "Behavioural, not visual: runs once under component-1440.");
});

test.describe("privacy 'Your account' paragraph 265-09", () => {
  test("four approved texts were found", () => {
    expect(Object.keys(TEXT).sort()).toEqual(["ar", "de", "en", "fr"]);
  });

  for (const lang of LOCALES) {
    test(`${lang}: paragraph verbatim, no gap pill, coverage empty, dir`, async ({ page }) => {
      await page.addInitScript((l) => localStorage.setItem("vamosLang", l), lang);
      await page.goto(`${baseURL}/privacy`);
      const collect = page.locator("#collect");
      await expect(collect).toBeVisible();
      await expect.poll(async () => ((await collect.innerText()).replace(/\s+/g, " ").includes(TEXT[lang] ?? "?"))).toBe(true);
      await expect(collect.locator("[data-tok]", { hasText: "Your account paragraph" })).toHaveCount(0);
      const missing = await page.evaluate(() => {
        const v = (window as unknown as {
          VamosLocale?: { coverage: (r: Element) => { strings?: string[]; attrs?: string[] } | string[] };
        }).VamosLocale;
        const root = document.querySelector("#collect");
        if (!v || !root) return ["no VamosLocale or #collect"];
        const c = v.coverage(root);
        return Array.isArray(c) ? c : [...(c.strings ?? []), ...(c.attrs ?? [])];
      });
      expect(missing).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.dir)).toBe(lang === "ar" ? "rtl" : "ltr");
    });
  }

  for (const lang of ["de", "ar"] as const) {
    for (const width of [1440, 1024, 768, 390]) {
      test(`${lang} ${width}px: no sideways scroll`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript((l) => localStorage.setItem("vamosLang", l), lang);
        await page.goto(`${baseURL}/privacy`);
        await expect(page.locator("#collect")).toBeVisible();
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(over).toBeLessThanOrEqual(0);
      });
    }
  }
});
