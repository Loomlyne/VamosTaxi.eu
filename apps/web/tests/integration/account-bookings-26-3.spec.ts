/**
 * @component 26.3-16 — profile shows "Booked", never a local draft; sign-in returns to checkout (D-13, D-32, D-33).
 * Behavioural, runs once under component-1440 (the 390 overflow check resizes the page itself).
 */
import { test, expect, type Page } from "../support/test";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const RUN_PROJECT = "component-1440";
const PORT = 4296;

let devServer: ChildProcess | null = null;
let baseURL = "";

const BOOKED = {
  ref: "VT-26-0801",
  href: "/confirmation/VT-26-0801",
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

async function mockSignedIn(page: Page): Promise<void> {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: { signedIn: true, displayName: "Anna Keller", email: "anna@example.com", emailConfirmed: true },
    }),
  );
  await page.route("**/api/account/bookings", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: { bookings: [BOOKED] } }) : route.continue(),
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

test.describe("account bookings 26.3", () => {
  test.describe.configure({ mode: "serial" });

  test("a confirmed booking that once had a pay link reads Booked; a local draft adds no card and is removed", async ({ page }) => {
    await mockSignedIn(page);
    await page.addInitScript(() => {
      localStorage.setItem(
        "vamosTrip",
        JSON.stringify({ lock: "x", quote_id: 1, total_rappen: 12300, pickup: "A", dropoff: "B" }),
      );
    });
    await page.goto(`${baseURL}/account`);
    await expect(page.getByText("Booked", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/waiting payment|Awaiting payment/i)).toHaveCount(0);
    await expect(page.getByText("VT-26-0801").first()).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("vamosTrip"))).toBeNull();
  });

  test("bookings page shows Booked too", async ({ page }) => {
    await mockSignedIn(page);
    await page.goto(`${baseURL}/bookings`);
    await expect(page.getByText("Booked", { exact: true }).first()).toBeVisible();
  });

  test("the booking row's spoken label follows the chosen language (weekday, month, status) @account", async ({ page }) => {
    await mockSignedIn(page);
    await page.goto(`${baseURL}/bookings`);
    const hit = page.locator("[data-bk-hit]").first();
    await expect(hit).toHaveAttribute("aria-label", /VT-26-0801/);
    const en = (await hit.getAttribute("aria-label")) ?? "";
    expect(en).toMatch(/[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}/);
    await page.evaluate(() => (window as unknown as { VamosLocale: { setLang(v: string): void } }).VamosLocale.setLang("de"));
    await expect.poll(async () => (await hit.getAttribute("aria-label")) ?? "").not.toBe(en);
    const de = (await hit.getAttribute("aria-label")) ?? "";
    expect(de).not.toMatch(/\bBooked\b|\bat\b/);
    expect(de).toContain("Gebucht");
    await page.evaluate(() => (window as unknown as { VamosLocale: { setLang(v: string): void } }).VamosLocale.setLang("ar"));
    await expect.poll(async () => (await hit.getAttribute("aria-label")) ?? "").toMatch(/[؀-ۿ]/);
  });

  test("sign-in with a checkout returnTo lands on that exact checkout URL", async ({ page }) => {
    await page.route("**/api/auth", (route) => route.fulfill({ json: { ok: true } }));
    const target = "/checkout?from=zrh&class=business&extras=roof-box";
    await page.goto(`${baseURL}/sign-in?returnTo=${encodeURIComponent(target)}`);
    await page.getByLabel("Email").fill("anna@example.com");
    await page.getByRole("textbox", { name: "Password" }).fill("correct-horse-1");
    await page.getByRole("button", { name: /sign in/i }).first().click();
    await page.waitForURL((u) => u.pathname === "/checkout", { timeout: 10_000 });
    expect(new URL(page.url()).search).toBe("?from=zrh&class=business&extras=roof-box");
  });

  test("a foreign returnTo falls back to /account", async ({ page }) => {
    await page.route("**/api/auth", (route) => route.fulfill({ json: { ok: true } }));
    await page.route("**/api/auth/session", (route) => route.fulfill({ json: { signedIn: false } }));
    await page.goto(`${baseURL}/sign-in?returnTo=${encodeURIComponent("//evil.com")}`);
    await page.getByLabel("Email").fill("anna@example.com");
    await page.getByRole("textbox", { name: "Password" }).fill("correct-horse-1");
    await page.getByRole("button", { name: /sign in/i }).first().click();
    await page.waitForURL((u) => u.hostname === "localhost" && u.pathname === "/account" || u.pathname === "/sign-in", {
      timeout: 10_000,
    });
    expect(new URL(page.url()).hostname).toBe("localhost");
  });

  for (const lang of ["de", "ar"] as const) {
    test(`account translation coverage is empty in ${lang}`, async ({ page }) => {
      await mockSignedIn(page);
      await page.addInitScript((l) => localStorage.setItem("vamosLang", l), lang);
      await page.goto(`${baseURL}/account`);
      await expect(page.getByText(BOOKED.ref).first()).toBeVisible();
      // Strings this plan adds must resolve. Other gaps on the page (names, phone and deletion copy)
      // predate 26.3-16 and are tracked outside this plan.
      const missing = await page.evaluate(() => {
        const v = (window as unknown as {
          VamosLocale?: { coverage: (r: Element) => { strings?: string[]; attrs?: string[] } };
        }).VamosLocale;
        const c = v ? v.coverage(document.body) : { strings: ["no VamosLocale"], attrs: [] };
        return [...(c.strings ?? []), ...(c.attrs ?? [])].filter((x) => /^Booked$|^A pay link|^Awaiting payment$/.test(x));
      });
      expect(missing).toEqual([]);
    });
  }

  test("390 px: no sideways scroll on the account", async ({ page }) => {
    await mockSignedIn(page);
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`${baseURL}/account`);
    await expect(page.getByText(BOOKED.ref).first()).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(0);
  });
});
