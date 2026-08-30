// SITE-04 contact + partner-application routes against a real next dev
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
const OWNER_CS = "postgres://postgres:***@127.0.0.1:54322/postgres";
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

function ownerQuery(sqlJs: string): string {
  try {
    return execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import postgres from "postgres";
         const sql = postgres(${JSON.stringify(OWNER_CS)}, { max: 1, connect_timeout: 5 });
         try {
           ${sqlJs}
         } finally {
           await sql.end({ timeout: 2 });
         }`,
      ],
      { encoding: "utf8", cwd: DB_ROOT },
    ).trim();
  } catch {
    throw new Error("Local stack is not running. Run `pnpm db:start && pnpm db:reset`.");
  }
}

function requireLocalDb(): void {
  const out = ownerQuery(`const rows = await sql\`select 1 as ok\`; console.log(rows[0].ok);`);
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

function partnerRows(key: string): number {
  const out = ownerQuery(
    `const key = ${JSON.stringify(key)};
     const rows = await sql\`select count(*)::text as n from public.partner_applications where idempotency_key = \${key}\`;
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
      TURNSTILE_SECRET_KEY: secret,
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

function partnerPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "Ada Partner",
    city: "Zurich",
    phone: "+41000000000",
    email: "ada.partner@example.test",
    vehicle: "Mercedes V-Class",
    permit: "ZH-123",
    acceptedTerms: true,
    acceptedPrivacy: true,
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
  passServer = spawnDev(PASS_PORT, ALWAYS_PASS_SECRET);
  failServer = spawnDev(FAIL_PORT, ALWAYS_FAIL_SECRET);
  await Promise.all([waitForNextServer(passURL), waitForNextServer(failURL)]);
});

test.afterAll(() => {
  killServer(passServer);
  killServer(failServer);
  passServer = null;
  failServer = null;
});

test.describe("SITE-04 contact form API", () => {
  test.describe.configure({ mode: "serial" });

  test("happy path writes contact_submissions and returns 200 with RESEND_API_KEY unset", async ({}, testInfo) => {
    if (testInfo.project.name !== RUN_PROJECT) return;
    const payload = contactPayload({ email: `ada.${crypto.randomUUID()}@example.test` });
    const res = await fetch(`${passURL}/api/contact`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ ok: true, created: true });
    expect(contactRows(payload.idempotencyKey as string)).toBe(1);
    assertHygiene(text, payload.email as string);
  });

  test("repeat idempotencyKey returns created: false and does not insert a second row", async ({}, testInfo) => {
    if (testInfo.project.name !== RUN_PROJECT) return;
    const payload = contactPayload({ email: `ada.${crypto.randomUUID()}@example.test` });
    const post = () =>
      fetch(`${passURL}/api/contact`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    const first = await post();
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, created: true });
    const second = await post();
    const text = await second.text();
    expect(second.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ ok: true, created: false });
    expect(contactRows(payload.idempotencyKey as string)).toBe(1);
    assertHygiene(text, payload.email as string);
  });

  test("always-fail secret returns challenge_failed and writes no row", async ({}, testInfo) => {
    if (testInfo.project.name !== RUN_PROJECT) return;
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

  test("partner application with acceptedPrivacy false is 400 and writes no row", async ({}, testInfo) => {
    if (testInfo.project.name !== RUN_PROJECT) return;
    const payload = partnerPayload({
      email: `ada.${crypto.randomUUID()}@example.test`,
      acceptedPrivacy: false,
    });
    const res = await fetch(`${passURL}/api/partner-application`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    expect(res.status).toBe(400);
    expect(JSON.parse(text)).toEqual({ ok: false, code: "invalid_input" });
    expect(partnerRows(payload.idempotencyKey as string)).toBe(0);
    assertHygiene(text, payload.email as string);
  });
});
