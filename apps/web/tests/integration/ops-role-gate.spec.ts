// apps/web/tests/integration/ops-role-gate.spec.ts
//
// OPS-10: dispatcher never sees Pricing/Staff; non-staff /ops redirects home.
// Tagged @ops-role-gate. component-1440 only. Skips when local Auth is down.

import { spawn, type ChildProcess } from "node:child_process";
import { test, expect } from "@playwright/test";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import {
  createCustomerFixture,
  createStaffFixture,
  localAuthUp,
  resetStaffFixtures,
  totpCode,
} from "../support/ops-fixtures";

const RUN_PROJECT = "component-1440";
const PORT = 4260;

let devServer: ChildProcess | null = null;
let baseURL = "";

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "Role-gate proofs run once under component-1440.",
  );
});

test.describe("ops role gate @ops-role-gate", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000);
    const up = await localAuthUp();
    test.skip(!up, "local auth health is down — run pnpm db:start");
    test.skip(
      !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY,
      "SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY unset — live proofs skipped",
    );
    baseURL = `http://localhost:${PORT}`;
    devServer = spawn(NEXT_BIN, ["dev", "-p", String(PORT)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
    });
    await waitForNextServer(baseURL);
  });

  test.afterAll(async () => {
    await resetStaffFixtures();
    if (devServer?.pid) {
      try {
        process.kill(-devServer.pid, "SIGTERM");
      } catch {
        // gone
      }
    }
  });

  async function signInAndClearMfa(
    page: import("@playwright/test").Page,
    email: string,
    password: string,
    secret: string,
  ) {
    await page.goto(`${baseURL}/ops/sign-in`);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/ops\/mfa-challenge/);
    await page.locator('input[name="code"]').fill(totpCode(secret));
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/ops/);
  }

  test("dispatcher sidebar HTML has no pricing or staff management link", async ({ page }) => {
    const fixture = await createStaffFixture({ role: "dispatcher", enrolTotp: true });
    if (!fixture.factorSecret) throw new Error("expected factor secret");
    await signInAndClearMfa(page, fixture.email, fixture.password, fixture.factorSecret);
    await page.goto(`${baseURL}/ops`);
    const html = await page.content();
    expect(html.match(/href="[^"]*\/ops\/pricing"/g) ?? []).toHaveLength(0);
    expect(html.match(/href="[^"]*\/ops\/staff"/g) ?? []).toHaveLength(0);
  });

  test("signed-in non-staff user requesting /ops is redirected home", async ({ page }) => {
    const customer = await createCustomerFixture();
    await page.goto(`${baseURL}/ops/sign-in`);
    await page.locator('input[name="email"]').fill(customer.email);
    await page.locator('input[name="password"]').fill(customer.password);
    await page.locator('button[type="submit"]').click();
    const res = await page.request.get(`${baseURL}/ops`, { maxRedirects: 0 });
    expect([301, 302, 303, 307, 308]).toContain(res.status());
    const location = res.headers().location ?? "";
    expect(location === "/" || location.endsWith("/") || /\/$/.test(new URL(location, baseURL).pathname)).toBeTruthy();
    expect(new URL(location, baseURL).pathname).toBe("/");
  });

  test("admin reaches /ops/pricing", async ({ page }) => {
    const fixture = await createStaffFixture({ role: "admin", enrolTotp: true });
    if (!fixture.factorSecret) throw new Error("expected factor secret");
    await signInAndClearMfa(page, fixture.email, fixture.password, fixture.factorSecret);
    const res = await page.goto(`${baseURL}/ops/pricing`);
    expect(res?.status()).toBe(200);
    await expect(page.locator("[data-ops-pricing]")).toBeVisible();
  });
});
