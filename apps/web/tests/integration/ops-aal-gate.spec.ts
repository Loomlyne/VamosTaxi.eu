// apps/web/tests/integration/ops-aal-gate.spec.ts
//
// AUTH-05 ops half: aal1 cannot reach console pages; MFA verify unlocks them.
// Tagged @ops-aal-gate. component-1440 only. Skips when local Auth is down.

import { spawn, type ChildProcess } from "node:child_process";
import { test, expect } from "@playwright/test";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import {
  createStaffFixture,
  localAuthUp,
  resetStaffFixtures,
  totpCode,
} from "../support/ops-fixtures";

const RUN_PROJECT = "component-1440";
const PORT = 4270;

let devServer: ChildProcess | null = null;
let baseURL = "";

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "AAL-gate proofs run once under component-1440.",
  );
});

function locationPath(res: { headers: () => Record<string, string>; url: () => string }): string {
  const location = res.headers().location ?? "";
  return new URL(location, res.url()).pathname;
}

test.describe("ops aal gate @ops-aal-gate", () => {
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

  test("aal1 staff requesting /ops/vehicles is redirected to /ops/mfa-challenge", async ({ page }) => {
    const fixture = await createStaffFixture({ role: "dispatcher", enrolTotp: true });
    await page.goto(`${baseURL}/ops/sign-in`);
    await page.locator('input[name="email"]').fill(fixture.email);
    await page.locator('input[name="password"]').fill(fixture.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/ops\/mfa-challenge/);

    const vehicles = await page.request.get(`${baseURL}/ops/vehicles`, { maxRedirects: 0 });
    expect([301, 302, 303, 307, 308]).toContain(vehicles.status());
    expect(locationPath(vehicles)).toBe("/ops/mfa-challenge");
  });

  test("aal1 session reaches /ops/mfa-challenge and /ops/accept-invite without a loop", async ({ page }) => {
    const fixture = await createStaffFixture({ role: "dispatcher", enrolTotp: true });
    await page.goto(`${baseURL}/ops/sign-in`);
    await page.locator('input[name="email"]').fill(fixture.email);
    await page.locator('input[name="password"]').fill(fixture.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/ops\/mfa-challenge/);

    const challenge = await page.request.get(`${baseURL}/ops/mfa-challenge`, { maxRedirects: 0 });
    expect(challenge.status()).toBeLessThan(400);

    const invite = await page.request.get(`${baseURL}/ops/accept-invite`, { maxRedirects: 0 });
    expect(invite.status()).not.toBe(0);
    const inviteLocation = invite.headers().location ?? "";
    expect(inviteLocation.includes("/ops/mfa-challenge")).toBe(false);
    expect(inviteLocation.includes("/ops/sign-in")).toBe(false);
  });

  test("after MFA verify the session reaches /ops/vehicles", async ({ page }) => {
    const fixture = await createStaffFixture({ role: "dispatcher", enrolTotp: true });
    if (!fixture.factorSecret) throw new Error("expected factor secret");
    await page.goto(`${baseURL}/ops/sign-in`);
    await page.locator('input[name="email"]').fill(fixture.email);
    await page.locator('input[name="password"]').fill(fixture.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/ops\/mfa-challenge/);
    await page.locator('input[name="code"]').fill(totpCode(fixture.factorSecret));
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes("/ops/mfa-challenge"));

    const vehicles = await page.request.get(`${baseURL}/ops/vehicles`, { maxRedirects: 0 });
    expect(vehicles.status()).toBeLessThan(400);
  });
});
