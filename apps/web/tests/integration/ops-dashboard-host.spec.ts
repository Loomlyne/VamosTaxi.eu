// apps/web/tests/integration/ops-dashboard-host.spec.ts
//
// Host gate (D-01a / 06-03): dashboard.vamostaxi.site /ops 308s, /login is DC
// ops-login (Dispatch sign in + data-af-eye), never Coming soon / OpsSignIn.
// Database-free. No next spawn — Playwright is too heavy for this proof.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "../support/test";

const RUN_PROJECT = "component-1440";
const here = __dirname;
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "Dashboard host proofs do not vary by breakpoint — this spec runs once, under component-1440.",
  );
});

test.describe("dashboard host DC login @ops-dashboard-host", () => {
  const middleware = readFileSync(join(webRoot, "middleware.ts"), "utf8");
  const login = readFileSync(join(repoRoot, "app/ops/ops-login.dc.html"), "utf8");
  const authForm = readFileSync(join(repoRoot, "app/ops/AuthForm.dc.html"), "utf8");
  const supabaseMw = readFileSync(join(webRoot, "lib/supabase/middleware.ts"), "utf8");

  test("named host /ops 308s; dashboardHostMiddleware serves DC, never Next ops rewrite", () => {
    expect(middleware).toMatch(/host === "dashboard\.vamostaxi\.site"/);
    expect(middleware).toContain('return dashboardHostMiddleware(request)');
    expect(middleware).toMatch(/NextResponse\.redirect\(dashboardAbs\(request, dest\), 308\)/);
    expect(middleware).toMatch(
      /serveOpsDc\(request, client\.response, "ops-login\.dc\.html"/,
    );
    expect(middleware).toMatch(/serveOpsDc\(request, client\.response, "ops\.dc\.html"/);
    expect(middleware).toMatch(/gone\.pathname = "\/__vamos_gone"/);
    expect(middleware).not.toMatch(/\[locale\]\/ops/);
  });

  test("cookie-setting factory uses NextResponse.next({ request }) (D-09)", () => {
    expect(supabaseMw).toContain("NextResponse.next({ request })");
    expect(supabaseMw).toMatch(/box\.response = NextResponse\.next\(\{ request \}\)/);
  });

  test("/login is DC Dispatch sign in with password eye POST /api/auth, not React ops", () => {
    expect(login).toContain("Dispatch sign in");
    expect(login).toContain("location.replace('/login')");
    expect(login).toContain('dc-import name="AuthForm"');
    expect(login).toContain("https://vamostaxi.site/sign-in");
    expect(authForm).toContain("fetch('/api/auth'");
    expect(authForm).toContain("data-af-eye");
    expect(authForm).toContain("Dispatch sign in");
    expect(authForm).toContain("top:calc((var(--vt-label-md) * var(--vt-body-leading)) + 6px)");
    expect(authForm).toContain("location.replace('/dashboard')");
    expect(authForm).not.toMatch(/location\.replace\('\/'\)/);
    expect(authForm).not.toMatch(/enrollPasskey/);
    const combined = `${login}\n${authForm}`;
    expect(combined).not.toMatch(/Coming soon/);
    expect(combined).not.toMatch(/OpsSignInForm/);
    expect(combined).not.toMatch(/OpsSignIn/);
    expect(combined).not.toContain("koss@vamostaxi.site");
    expect(combined).not.toMatch(/data-page=["']ops/);
  });
});
