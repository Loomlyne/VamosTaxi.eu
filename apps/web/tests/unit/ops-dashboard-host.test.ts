// apps/web/tests/unit/ops-dashboard-host.test.ts
//
// Named-host contract without Next/Playwright (worktree has no next/server).
// Source + DC HTML: /ops 308, /login is DC, never Coming soon / OpsSignIn.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");

const middleware = readFileSync(join(webRoot, "middleware.ts"), "utf8");
const login = readFileSync(join(repoRoot, "app/ops/ops-login.dc.html"), "utf8");
const authForm = readFileSync(join(repoRoot, "app/ops/AuthForm.dc.html"), "utf8");
const supabaseMw = readFileSync(join(webRoot, "lib/supabase/middleware.ts"), "utf8");

describe("dashboard host DC login @ops-dashboard-host", () => {
  it("named host /ops 308s; dashboardHostMiddleware serves DC, never Next ops rewrite", () => {
    expect(middleware).toMatch(/host === "dashboard\.vamostaxi\.site"/);
    expect(middleware).toContain("return dashboardHostMiddleware(request)");
    expect(middleware).toMatch(/NextResponse\.redirect\(dashboardAbs\(request, dest\), 308\)/);
    expect(middleware).toMatch(
      /copyCookies\(client\.response, NextResponse\.redirect\(dashboardAbs\(request, "\/login"\), 308\)\)/,
    );
    expect(middleware).toMatch(
      /serveOpsDc\(request, client\.response, "ops-login\.dc\.html"/,
    );
    expect(middleware).toMatch(/serveOpsDc\(request, client\.response, "ops\.dc\.html"/);
    const dashboardFn = middleware.slice(
      middleware.indexOf("async function dashboardHostMiddleware"),
      middleware.indexOf("function opsRedirectUrl"),
    );
    expect(dashboardFn).toContain("serveOpsDc(");
    expect(dashboardFn).not.toMatch(/NextResponse\.rewrite/);
    // The only rewrites left are the public host's 404s — never into Next ops.
    const rewrites = middleware.match(/NextResponse\.rewrite\([^)]*\)/g) ?? [];
    expect(rewrites.every((call) => call === "NextResponse.rewrite(gone)")).toBe(true);
    expect(middleware.match(/gone\.pathname = "\/__vamos_gone";/g)?.length).toBe(rewrites.length);
    expect(middleware).not.toMatch(/\[locale\]\/ops/);
  });

  it("signed-in /login serves ops-login before console 404", () => {
    const afterRole = middleware.slice(middleware.indexOf("const inConsole = role"));
    const loginIdx = afterRole.indexOf('dashPath === "/login"');
    const loginHtmlIdx = afterRole.indexOf("ops-login.dc.html");
    const notFoundIdx = afterRole.indexOf("opsConsoleNotFound");
    expect(loginIdx).toBeGreaterThan(-1);
    expect(loginHtmlIdx).toBeGreaterThan(-1);
    expect(notFoundIdx).toBeGreaterThan(-1);
    expect(loginIdx).toBeLessThan(notFoundIdx);
    expect(loginHtmlIdx).toBeLessThan(notFoundIdx);
  });

  it("cookie-setting factory uses NextResponse.next({ request }) (D-09)", () => {
    expect(supabaseMw).toContain("NextResponse.next({ request })");
    expect(supabaseMw).toMatch(/box\.response = NextResponse\.next\(\{ request \}\)/);
  });

  it("/login is DC Dispatch sign in with password eye POST /api/auth, not React ops", () => {
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
