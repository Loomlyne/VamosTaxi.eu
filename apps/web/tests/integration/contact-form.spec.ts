// SITE-04 contact route against a real next dev
// and local Postgres. Fail loudly if the stack is down — never skip.
// Queries go through a child process so this file never imports `postgres`
// (D-10 / apps/web restricted-imports).

import { test, expect } from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const RUN_PROJECT = "component-1440";
const ALWAYS_PASS_SECRET = "1x0000000000000000000000000000AA";
const ALWAYS_FAIL_SECRET = "2x0000000000000000000000000000AA";
const DUMMY_TOKEN = "XXXX.DUMMY.TOKEN";
const EDGE_CS = "postgres://vamos_edge:vamos_edge@127.0.0.1:54322/postgres";
const NEXT = process.env.NEXT_BIN ?? NEXT_BIN;
const DB_ROOT = join(WEB_ROOT, "..", "..", "packages", "db");

const PASS_PORT = 4200;
const FAIL_PORT = 4201;

let passServer: ChildProcess | null = null;
let failServer: ChildProcess | null = null;
let passURL = "";
let failURL = "";

function killServer(child: ChildProcess | null): void {
  if (child?.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

function ownerQuery(script: string): string {
  let ownerConnection: string;
  try {
    const status = JSON.parse(
      execFileSync("pnpm", ["--filter", "@vamos/db", "exec", "supabase", "status", "-o", "json"], {
        cwd: join(WEB_ROOT, "..", ".."),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    ) as { DB_URL?: string };
    ownerConnection = status.DB_URL ?? "";
    const parsed = new URL(ownerConnection);
    if (
      !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
      parsed.port !== "54322" ||
      parsed.username !== "postgres"
    ) {
      throw new Error("unexpected local database target");
    }
  } catch {
    throw new Error("Local stack is not running. Run `pnpm db:start && pnpm db:reset`.");
  }

  try {
    return execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import postgres from "postgres";
         const sql = postgres(${JSON.stringify(ownerConnection)}, { max: 1 });
         try {
           ${script}
         } finally {
           await sql.end({ timeout: 2 });
         }`,
      ],
      {
        encoding: "utf8",
        cwd: DB_ROOT,
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", NODE_DISABLE_COLORS: "1" },
      },
    )
      .replace(/\u001b\[[0-9;]*m/g, "")
      .trim();
  } catch {
    throw new Error("Local stack is not running. Run `pnpm db:start && pnpm db:reset`.");
  }
}

function requireLocalDb(): void {
  const out = ownerQuery(`const rows = await sql\`select 1 as ok\`; console.log(String(rows[0].ok));`);
  if (out !== "1") {
    throw new Error("Local stack is not running. Run `pnpm db:start && pnpm db:reset`.");
  }
}

function contactRows(key: string): number {
  const out = ownerQuery(
    `const key = ${JSON.stringify(key)};
     const rows = await sql\`select count(*)::text as n from public.contact_submissions where idempotency_key = \${key}\`;
     console.log(rows[0].n);`,
  );
  return Number(out);
}

function spawnDev(port: number, secret: string): ChildProcess {
  const env = { ...process.env };
  delete env.RESEND_API_KEY;
  return spawn(NEXT, ["dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: {
      ...env,
      CLOUDFLARE_ENV: "staging",
      TEST_DIST_DIR: `test-results/.next-contact-${port}`,
      TURNSTILE_SECRET_KEY: secret,
      // Cloudflare's documented test Siteverify record binds its test token to example.com.
      CONTACT_TURNSTILE_ALLOWED_HOSTNAMES: "example.com",
      WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_NOCACHE: EDGE_CS,
      RESEND_API_KEY: "",
    },
  });
}

function contactPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Ada Contact",
    email: "ada.contact@example.test",
    phone: "+41000000000",
    bookingRef: "VT-26-0001",
    message: "Please call about a Zurich pickup.",
    locale: "en",
    turnstileToken: DUMMY_TOKEN,
    idempotencyKey: crypto.randomUUID(),
    ...overrides,
  };
}

function assertHygiene(body: string, email: string): void {
  expect(body).not.toContain(email);
  expect(body.toLowerCase()).not.toContain("stack");
  expect(body).not.toMatch(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
}

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== RUN_PROJECT) return;
  testInfo.setTimeout(180_000);
  requireLocalDb();
  passURL = `http://localhost:${PASS_PORT}`;
  failURL = `http://localhost:${FAIL_PORT}`;
  // One workerd at a time — two next-dev share miniflare sqlite and crash with SQLITE_BUSY.
  passServer = spawnDev(PASS_PORT, ALWAYS_PASS_SECRET);
  await waitForNextServer(passURL, 180_000);
});

test.afterAll(() => {
  killServer(passServer);
  killServer(failServer);
  passServer = null;
  failServer = null;
});

test.describe("SITE-04 contact form API", () => {
  test.describe.configure({ mode: "serial" });

  test("verified submission persists once but returns unavailable when delivery configuration is absent", async ({}, testInfo) => {
    if (testInfo.project.name !== RUN_PROJECT) return;
    const payload = contactPayload({ email: `ada.${crypto.randomUUID()}@example.test` });
    const res = await fetch(`${passURL}/api/contact`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(JSON.parse(text)).toEqual({ ok: false, code: "unavailable" });
    expect(contactRows(payload.idempotencyKey as string)).toBe(1);
    assertHygiene(text, payload.email as string);
  });

  test("repeat idempotencyKey retries unfinished delivery without inserting a second row", async ({}, testInfo) => {
    if (testInfo.project.name !== RUN_PROJECT) return;
    const payload = contactPayload({ email: `ada.${crypto.randomUUID()}@example.test` });
    const post = () =>
      fetch(`${passURL}/api/contact`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    const first = await post();
    expect(first.status).toBe(503);
    expect(await first.json()).toEqual({ ok: false, code: "unavailable" });
    const second = await post();
    const text = await second.text();
    expect(second.status).toBe(503);
    expect(JSON.parse(text)).toEqual({ ok: false, code: "unavailable" });
    expect(contactRows(payload.idempotencyKey as string)).toBe(1);
    assertHygiene(text, payload.email as string);
  });

  test("over-long message is invalid_input with no field detail and no row", async ({}, testInfo) => {
    if (testInfo.project.name !== RUN_PROJECT) return;
    const payload = contactPayload({
      email: `ada.${crypto.randomUUID()}@example.test`,
      message: "m".repeat(4001),
    });
    const res = await fetch(`${passURL}/api/contact`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    expect(res.status).toBe(400);
    const body = JSON.parse(text) as Record<string, unknown>;
    expect(body).toEqual({ ok: false, code: "invalid_input" });
    expect(JSON.stringify(body)).not.toMatch(/issues|flatten|fieldErrors/);
    expect(contactRows(payload.idempotencyKey as string)).toBe(0);
    assertHygiene(text, payload.email as string);
  });

  test("always-fail secret returns challenge_failed and writes no row", async ({}, testInfo) => {
    if (testInfo.project.name !== RUN_PROJECT) return;
    testInfo.setTimeout(180_000);
    killServer(passServer);
    passServer = null;
    failServer = spawnDev(FAIL_PORT, ALWAYS_FAIL_SECRET);
    await waitForNextServer(failURL, 180_000);
    const payload = contactPayload({ email: `ada.${crypto.randomUUID()}@example.test` });
    const res = await fetch(`${failURL}/api/contact`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    expect(res.status).toBe(403);
    expect(JSON.parse(text)).toEqual({ ok: false, code: "challenge_failed" });
    expect(contactRows(payload.idempotencyKey as string)).toBe(0);
    assertHygiene(text, payload.email as string);
  });
});
