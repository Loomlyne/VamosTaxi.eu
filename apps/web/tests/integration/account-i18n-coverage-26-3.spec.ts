/**
 * @component 26.3-G2 — account and bookings resolve every visible string in de, fr and ar (Law 03),
 * and nothing scrolls sideways at 390 px in de and ar.
 * Behavioural, runs once under component-1440 (the 390 check resizes the page itself).
 */
import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const RUN_PROJECT = "component-1440";
const PORT = 4297;

let devServer: ChildProcess | null = null;
let baseURL = "";

const BOOKINGS = [
  {
    ref: "VT-26-0801", href: "/confirmation/VT-26-0801", date: "Fri 14 Aug", time: "06:45",
    route: "Zurich → Zurich Airport (ZRH)", pickup: "Zurich", dropoff: "Zurich Airport (ZRH)",
    pax: 2, priceRappen: 0, status: "booked", when: "upcoming", group: "August 2030",
    reviewState: "none", reviewHref: "",
  },
  {
    ref: "VT-26-0702", href: "/confirmation/VT-26-0702", date: "Mon 6 Jul", time: "09:10",
    route: "Zurich Airport (ZRH) → Zurich", pickup: "Zurich Airport (ZRH)", dropoff: "Zurich",
    pax: 1, priceRappen: 0, status: "completed", when: "past", group: "July 2026",
    reviewState: "none", reviewHref: "",
  },
];

async function mockSignedIn(page: Page): Promise<void> {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: { signedIn: true, displayName: "Anna Keller", email: "anna@example.com", emailConfirmed: true } }),
  );
  await page.route("**/api/account/bookings", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: { bookings: BOOKINGS } }) : route.continue(),
  );
  await page.route("**/api/account/prefs", (route) => route.fulfill({ json: {} }));
}

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
  test.skip(testInfo.project.name !== RUN_PROJECT, "Behavioural, not visual — runs once under component-1440.");
});

const PAGES = ["account", "bookings"] as const;

async function open(page: Page, path: string, lang: string): Promise<void> {
  await mockSignedIn(page);
  await page.addInitScript((l) => localStorage.setItem("vamosLang", l), lang);
  await page.goto(`${baseURL}/${path}`);
  await expect(page.getByText(BOOKINGS[0].ref).first()).toBeVisible();
  await page.waitForTimeout(600);
}

test.describe("account surfaces translation 26.3-G2", () => {
  test.describe.configure({ mode: "serial" });
  for (const path of PAGES) {
    for (const lang of ["de", "fr", "ar"] as const) {
      test(`${path}: coverage is empty in ${lang}`, async ({ page }) => {
        await open(page, path, lang);
        const missing = await page.evaluate(() => {
          const v = (window as unknown as {
            VamosLocale?: { coverage: (r: Element) => { strings?: string[]; attrs?: string[] } | string[] };
          }).VamosLocale;
          if (!v) return ["no VamosLocale"];
          const c = v.coverage(document.body);
          if (Array.isArray(c)) return c;
          return [...(c.strings ?? []), ...(c.attrs ?? [])];
        });
        // The signed-in person's own name, e-mail and initials, and the single wordmark letters, are data, not copy.
        const data = new Set(["Anna", "Anna Keller", "anna@example.com"]);
        expect(missing.filter((x) => !data.has(x) && !/^[A-Z]{1,2}$/.test(x))).toEqual([]);
      });
    }
    for (const lang of ["de", "ar"] as const) {
      test(`${path}: 390 px no sideways scroll in ${lang}`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 800 });
        await open(page, path, lang);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(over).toBeLessThanOrEqual(0);
      });
    }
  }
});
