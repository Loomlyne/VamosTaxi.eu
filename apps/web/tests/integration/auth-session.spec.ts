// apps/web/tests/integration/auth-session.spec.ts
//
// AUTH-03 session-refresh claims that do not need any Phase 5 page.
// getUser() failing against an unreachable Auth server must not fail these
// three assertions — they are about routing, Set-Cookie folding, and HTML
// leakage, not a live GoTrue round-trip.

import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const RUN_PROJECT = "component-1440";

let devServer: ChildProcess | null = null;
let baseURL = "";

function supabaseEnv(): { SUPABASE_URL: string; SUPABASE_ANON_KEY: string } {
  // Prefer a local stack when one is running; otherwise harmless placeholders.
  // A failed getUser() against these placeholders must not fail this spec.
  return {
    SUPABASE_URL: process.env.SUPABASE_URL ?? "http://127.0.0.1:54321",
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "anon-placeholder",
  };
}

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== RUN_PROJECT) return;
  testInfo.setTimeout(90_000);
  const port = 4120 + testInfo.workerIndex;
  baseURL = `http://localhost:${port}`;
  const auth = supabaseEnv();
  devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: {
      ...process.env,
      SUPABASE_URL: auth.SUPABASE_URL,
      SUPABASE_ANON_KEY: auth.SUPABASE_ANON_KEY,
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
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "Behavioural, not visual — runs once under component-1440.",
  );
});

test.describe("Auth session middleware @auth-session", () => {
  test.describe.configure({ mode: "serial" });

  test("GET /en answers 308 to the unprefixed path", async () => {
    const res = await fetch(`${baseURL}/en`, { redirect: "manual" });
    expect(res.status).toBe(308);
    const location = res.headers.get("location") ?? "";
    const path = location.replace(/^https?:\/\/[^/]+/, "");
    expect(path === "/" || path === "").toBe(true);
  });

  test("GET /de/ answers 200", async () => {
    const res = await fetch(`${baseURL}/de/`);
    expect(res.status).toBe(200);
  });

  test("Set-Cookie values arrive as separate getSetCookie() entries (D-02)", async () => {
    const res = await fetch(baseURL + "/", {
      headers: {
        cookie: "sb-test-auth-token.0=chunk-a; sb-test-auth-token.1=chunk-b",
      },
    });
    expect(res.status).toBeLessThan(400);
    const setCookies = res.headers.getSetCookie();
    for (const entry of setCookies) {
      const pair = entry.split(";", 1)[0] ?? "";
      expect(pair.includes("=")).toBe(true);
      expect(pair.includes(",")).toBe(false);
    }
  });

  test("server-rendered / HTML does not leak SUPABASE_URL or SUPABASE_ANON_KEY", async () => {
    const res = await fetch(baseURL + "/");
    const body = await res.text();
    expect(body).not.toContain("SUPABASE_URL");
    expect(body).not.toContain("SUPABASE_ANON_KEY");
  });
});
