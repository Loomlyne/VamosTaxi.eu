/**
 * @component 260929-acl — a failed bookings read is an error state with TRY AGAIN, never "no bookings".
 * Behavioural, runs once under component-1440 (the 390 check resizes the page itself).
 */
import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const RUN_PROJECT = "component-1440";
const PORT = 4297;
const ERROR_COPY = "We could not load your bookings. Try again.";

let devServer: ChildProcess | null = null;
let baseURL = "";

const BOOKED = {
  ref: "VT-26-0802",
  href: "/confirmation/VT-26-0802",
  date: "Fri 14 Aug",
  time: "06:45",
  route: "Zurich → Zurich Airport (ZRH)",
  pickup: "Zurich",
  dropoff: "Zurich Airport (ZRH)",
  pax: 2,
  priceRappen: 0,
  status: "booked",
  when: "upcoming",
  group: "August 2030",
  reviewState: "none",
  reviewHref: "",
};

/** The list answers 500 until `recover()` is called, then the guest booking as Booked. */
async function mockList(page: Page): Promise<{ recover: () => void }> {
  let failing = true;
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: { signedIn: true, displayName: "Anna Keller", email: "anna@example.com", emailConfirmed: true },
    }),
  );
  await page.route("**/api/account/bookings", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return failing
      ? route.fulfill({ status: 500, json: { error: "list_failed" } })
      : route.fulfill({ json: { bookings: [BOOKED] } });
  });
  await page.route("**/api/account/prefs", (route) => route.fulfill({ json: {} }));
  return { recover: () => { failing = false; } };
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

test.describe("account list failure 260929", () => {
  for (const path of ["/account", "/bookings"] as const) {
    test(`${path}: a 500 shows the error state, TRY AGAIN recovers to Booked`, async ({ page }) => {
      const list = await mockList(page);
      await page.goto(`${baseURL}${path}`);
      await expect(page.getByText(ERROR_COPY)).toBeVisible();
      await expect(page.getByText(/No transfers yet|No transfer booked yet/)).toHaveCount(0);
      const retry = page.getByRole("button", { name: /try again/i });
      await expect(retry).toBeVisible();
      const box = await retry.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      list.recover();
      await retry.click();
      await expect(page.getByText("Booked", { exact: true }).first()).toBeVisible();
      await expect(page.getByText(ERROR_COPY)).toHaveCount(0);
    });

    for (const lang of ["de", "ar"] as const) {
      test(`${path}: the error state is translated in ${lang}`, async ({ page }) => {
        await mockList(page);
        await page.addInitScript((l) => localStorage.setItem("vamosLang", l), lang);
        await page.goto(`${baseURL}${path}`);
        await expect(page.getByRole("alert")).toBeVisible();
        await expect(page.getByText(ERROR_COPY)).toHaveCount(0);
        const missing = await page.evaluate(() => {
          const v = (window as unknown as {
            VamosLocale?: { coverage: (r: Element) => { strings?: string[]; attrs?: string[] } | string[] };
          }).VamosLocale;
          const c = v ? v.coverage(document.body) : { strings: ["no VamosLocale"], attrs: [] };
          const all = Array.isArray(c) ? c : [...(c.strings ?? []), ...(c.attrs ?? [])];
          return all.filter((x) => /could not load your bookings|^Try again$/i.test(x));
        });
        expect(missing).toEqual([]);
      });
    }

    test(`${path}: 390 px, error state, no sideways scroll`, async ({ page }) => {
      await mockList(page);
      await page.setViewportSize({ width: 390, height: 800 });
      await page.goto(`${baseURL}${path}`);
      await expect(page.getByText(ERROR_COPY)).toBeVisible();
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over).toBeLessThanOrEqual(0);
    });
  }
});
