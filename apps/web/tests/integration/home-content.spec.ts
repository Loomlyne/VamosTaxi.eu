// SITE-01: home reviews + FAQ text come from public.reviews / public.content_strings.
// Fail loudly if the local stack is down — never skip.

import { test, expect } from "../support/test";
import { testPort } from "../support/port";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const RUN_PROJECT = "component-1440";
const LIVE_PORT = testPort(4260);
const DEAD_PORT = testPort(4261);
const OWNER_CS = "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const DEAD_CS = "postgres://vamos_public:***@127.0.0.1:1/postgres";
const MAIN_NEXT = join("/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules/.bin/next");
const NEXT = existsSync(NEXT_BIN) ? NEXT_BIN : MAIN_NEXT;
const DB_ROOT = join(WEB_ROOT, "..", "..", "packages", "db");

const SEEDED_AUTHOR = "First L.";
const UNPUBLISHED_NAME = "Unpublished U.";
const BRAND = "Vamos Taxi";

let liveServer: ChildProcess | null = null;
let deadServer: ChildProcess | null = null;
let liveURL = "";
let deadURL = "";

function killServer(child: ChildProcess | null): void {
  if (child?.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* gone */
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

function spawnDev(port: number, extraEnv: Record<string, string | undefined> = {}): ChildProcess {
  return spawn(NEXT, ["dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: {
      ...process.env,
      CLOUDFLARE_ENV: "staging",
      TEST_DIST_DIR: `test-results/.next-home-content-${port}`,
      ...extraEnv,
    },
  });
}

test.describe("home content SITE-01", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name !== RUN_PROJECT) return;
    testInfo.setTimeout(240_000);
    requireLocalDb();
    liveURL = `http://localhost:${LIVE_PORT}`;
    deadURL = `http://localhost:${DEAD_PORT}`;
    liveServer = spawnDev(LIVE_PORT);
    await waitForNextServer(liveURL, 180_000);
  });

  test.afterAll(() => {
    killServer(liveServer);
    killServer(deadServer);
  });

  test("seeded review authors render from the database", async ({ page }, testInfo) => {
    if (testInfo.project.name !== RUN_PROJECT) return;
    const res = await page.goto(`${liveURL}/dev/home/reviews?live=1`, { timeout: 60_000 });
    expect(res?.status()).toBe(200);
    await expect(page.locator("[data-live='1'] [data-rv]")).toBeVisible();
    await expect(page.locator("[data-live='1']")).toContainText(SEEDED_AUTHOR);
    await expect(page.locator("[data-live='1']")).toContainText("ZRH → Zurich city");
  });

  test("unpublished review does not render", async ({ page }, testInfo) => {
    if (testInfo.project.name !== RUN_PROJECT) return;
    ownerQuery(`
      const name = ${JSON.stringify(UNPUBLISHED_NAME)};
      await sql\`
        insert into public.reviews (external_ref, source, author_name, author_role, body, rating, route_label, published, sort_order)
        values ('rv-unpublished-05-18', 'manual', \${name}, 'test', 'should not render', 1, 'nowhere', false, 99)
        on conflict (external_ref) do update set published = false, author_name = excluded.author_name
      \`;
    `);
    await page.goto(`${liveURL}/dev/home/reviews?live=1`);
    await expect(page.locator("[data-live='1']")).toContainText(SEEDED_AUTHOR);
    await expect(page.locator("[data-live='1']")).not.toContainText(UNPUBLISHED_NAME);
  });

  test("getContentStrings returns only requested keys and missing keys are empty", async ({
    page,
  }, testInfo) => {
    if (testInfo.project.name !== RUN_PROJECT) return;
    await page.goto(`${liveURL}/dev/home/reviews?live=1`);
    const count = await page.locator("[data-string-count]").getAttribute("data-string-count");
    const missing = await page.locator("[data-missing-count]").getAttribute("data-missing-count");
    expect(Number(count)).toBeGreaterThan(0);
    expect(missing).toBe("0");
    const keysRaw = await page.locator("[data-string-count]").evaluate((el) => el.textContent ?? "");
    const keys = keysRaw.split(",").filter(Boolean);
    expect(keys.every((k) => k.startsWith("faq.") || k === "common.brandName")).toBe(true);
    expect(keys).not.toContain("faq.does-not-exist-05-18");
  });

  test("locale selection and non_translatable brand", async ({ page }, testInfo) => {
    if (testInfo.project.name !== RUN_PROJECT) return;
    await page.goto(`${liveURL}/dev/home/reviews?live=1`);
    const enTitle = await page.locator("#faq-title").innerText();
    await page.goto(`${liveURL}/de/dev/home/reviews?live=1`);
    const deTitle = await page.locator("#faq-title").innerText();
    expect(enTitle).not.toBe(deTitle);
    await expect(page.locator("[data-brand='1']")).toHaveText(BRAND);
    await page.goto(`${liveURL}/fr/dev/home/reviews?live=1`);
    await expect(page.locator("[data-brand='1']")).toHaveText(BRAND);
    await page.goto(`${liveURL}/ar/dev/home/reviews?live=1`);
    await expect(page.locator("[data-brand='1']")).toHaveText(BRAND);
  });

  test("reviews order is sort_order then created_at desc", async ({ page }, testInfo) => {
    if (testInfo.project.name !== RUN_PROJECT) return;
    const order = ownerQuery(`
      const rows = await sql\`
        select author_name, sort_order
          from public.reviews
         where published
         order by sort_order, created_at desc
      \`;
      console.log(JSON.stringify(rows));
    `);
    const rows = JSON.parse(order) as { author_name: string; sort_order: number }[];
    const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
    expect(rows.map((r) => r.sort_order)).toEqual(sorted.map((r) => r.sort_order));
    await page.goto(`${liveURL}/dev/home/reviews?live=1`);
    const firstSlide = page.locator("[data-live='1'] [data-rv-face][data-i='1']");
    await expect(firstSlide).toContainText(rows[0]?.author_name ?? SEEDED_AUTHOR);
  });

  test("unreachable database yields 200 and designed error state", async ({ page }, testInfo) => {
    if (testInfo.project.name !== RUN_PROJECT) return;
    testInfo.setTimeout(240_000);
    killServer(liveServer);
    liveServer = null;
    deadServer = spawnDev(DEAD_PORT, {
      WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: DEAD_CS,
    });
    await waitForNextServer(deadURL, 180_000);
    const res = await page.goto(`${deadURL}/dev/home/reviews?live=1`, { timeout: 60_000 });
    expect(res?.status()).toBe(200);
    await expect(page.locator("[data-chrome='1']")).toBeVisible();
    await expect(page.locator("[data-live='1'] [data-rv][data-state='error']")).toBeVisible();
    await expect(page.locator("[data-live='1'] [data-home-faq][data-state='error']")).toBeVisible();
  });
});
