// apps/web/tests/integration/ops-reviews-publish.spec.ts
//
// OPS-08: publish / hide / reorder / locked refusal against a local stack.
// Tagged @ops-reviews. component-1440 only.
// Needs Postgres: run pnpm db:start && pnpm db:reset from packages/db.

import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { waitForNextServer, WEB_ROOT } from "../support/server-harness";
import {
  createStaffFixture,
  localAuthUp,
  resetStaffFixtures,
  totpCode,
} from "../support/ops-fixtures";

const RUN_PROJECT = "component-1440";
const PORT = 4285;
const LOCAL_NEXT = join(WEB_ROOT, "node_modules", ".bin", "next");
const NEXT_BIN = LOCAL_NEXT;
const MAIN_DB_PKG = "/Users/koss/Developer/VamosTaxi.eu/packages/db/package.json";
const DB_URL =
  process.env.OPS_FIXTURE_DB_URL ?? "postgres://postgres:***@127.0.0.1:54322/postgres";
const PUBLIC_DB_URL =
  process.env.OPS_PUBLIC_DB_URL ?? "postgres://vamos_public:***@127.0.0.1:54322/postgres";
const STACK_MSG = "run pnpm db:start && pnpm db:reset from packages/db";

const createdRefs: string[] = [];

let devServer: ChildProcess | null = null;
let baseURL = "";

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "Review proofs run once under component-1440.",
  );
});

function loadSql() {
  const req = createRequire(MAIN_DB_PKG);
  return req("postgres") as (
    url: string,
  ) => {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
    end: (opts?: { timeout?: number }) => Promise<void>;
  };
}

async function withSql<T>(
  url: string,
  fn: (sql: ReturnType<ReturnType<typeof loadSql>>) => Promise<T>,
): Promise<T> {
  const postgres = loadSql();
  const sql = postgres(url);
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Asserted against the publicSql path (vamos_public), not an ops WHERE published filter.
async function publicReviewIds(): Promise<string[]> {
  return withSql(PUBLIC_DB_URL, async (sql) => {
    const rows = (await sql`
      select id from public.reviews order by sort_order asc, created_at desc
    `) as { id: string }[];
    return rows.map((row) => row.id);
  });
}

async function restoreSeededReviews(): Promise<void> {
  const refs = createdRefs.splice(0, createdRefs.length);
  await withSql(DB_URL, async (sql) => {
    if (refs.length > 0) {
      await sql`delete from public.reviews where external_ref = any(${refs}::text[])`;
    }
    await sql`
      update public.reviews set
        published = true,
        sort_order = case external_ref
          when 'rv-1' then 1
          when 'rv-2' then 2
          when 'rv-3' then 3
          when 'rv-4' then 4
          when 'rv-5' then 5
        end,
        verified = (external_ref <> 'rv-5'),
        author_name = 'First L.',
        route_label = case external_ref
          when 'rv-1' then 'ZRH → Zurich city'
          when 'rv-2' then 'ZRH → Zermatt'
          when 'rv-3' then 'Zurich → Basel EuroAirport'
          when 'rv-4' then 'ZRH → Zurich city'
          when 'rv-5' then 'Zurich, four hours'
        end,
        body = case external_ref
          when 'rv-1' then 'One verbatim sentence from a real review sits here — pasted from the platform, never rewritten.'
          when 'rv-2' then 'Two or three sentences is the length this block is drawn for. Longer reviews are cut at the end and marked with an ellipsis; nothing inside the quote is edited, reordered or tidied up.'
          when 'rv-3' then 'This is about the longest excerpt the measure holds before it is trimmed. A review that runs past it keeps its opening and loses only its tail, so the words a traveller chose first are the words that show…'
          when 'rv-4' then 'German reviews land here too. Strings grow around 30 per cent and the block takes it without the card reflowing.'
          when 'rv-5' then 'Whichever platform a review came from, that platform’s own mark sits at the top of the card — one review, one source, no borrowed logos.'
        end,
        updated_at = now()
      where external_ref in ('rv-1', 'rv-2', 'rv-3', 'rv-4', 'rv-5')
    `;
  });
}

test.describe("ops reviews publish @ops-reviews", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000);
    const up = await localAuthUp();
    if (!up) throw new Error(STACK_MSG);
    if (!existsSync(LOCAL_NEXT)) throw new Error(STACK_MSG);
    if (!process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(STACK_MSG);
    }
    baseURL = `http://localhost:${PORT}`;
    devServer = spawn(NEXT_BIN, ["dev", "-p", String(PORT)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
    });
    await waitForNextServer(baseURL);
  });

  test.afterEach(async () => {
    await restoreSeededReviews();
  });

  test.afterAll(async () => {
    await restoreSeededReviews();
    await resetStaffFixtures();
    if (devServer?.pid) {
      try {
        process.kill(-devServer.pid, "SIGTERM");
      } catch {
        // gone
      }
    }
  });

  async function signInDispatcher(page: import("@playwright/test").Page) {
    const fixture = await createStaffFixture({ role: "dispatcher", enrolTotp: true });
    if (!fixture.factorSecret) throw new Error("expected factor secret");
    await page.goto(`${baseURL}/ops/sign-in`);
    await page.locator('input[name="email"]').fill(fixture.email);
    await page.locator('input[name="password"]').fill(fixture.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/ops\/mfa-challenge/);
    await page.locator('input[name="code"]').fill(totpCode(fixture.factorSecret));
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/ops/);
    return fixture;
  }

  test("seeded reviews render with source marks and initials fallback", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/reviews`);
    await expect(page.locator("[data-page=ops-reviews]")).toBeVisible();
    const rows = page.locator("[data-review-id]");
    await expect(rows).toHaveCount(5);
    await expect(page.locator("[data-review-source=google]").first()).toBeVisible();
    await expect(page.locator("[data-review-source=tripadvisor]")).toBeVisible();
    await expect(page.locator("[data-review-source=trustpilot]")).toBeVisible();
    await expect(page.locator("[data-review-source=manual]")).toBeVisible();
    const avatar = page.getByTestId("reviews-avatar").first();
    await expect(avatar).toContainText(/F/i);
    const avatarPaths = await withSql(DB_URL, async (sql) => {
      const seeded = (await sql`
        select avatar_path from public.reviews
        where external_ref in ('rv-1', 'rv-2', 'rv-3', 'rv-4', 'rv-5')
      `) as { avatar_path: string | null }[];
      return seeded.map((row) => row.avatar_path);
    });
    expect(avatarPaths.every((path) => path == null)).toBe(true);
    expect(avatarPaths.some((path) => path?.startsWith("data:"))).toBe(false);
  });

  test("hiding a review drops it from the publicSql reviews read", async ({ page }) => {
    const fixture = await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/reviews`);
    const google = page.locator("[data-review-source=google]").first();
    const id = await google.getAttribute("data-review-id");
    expect(id).toBeTruthy();
    const before = await publicReviewIds();
    expect(before).toContain(id);
    await google.getByTestId("reviews-publish").click();
    await expect(google).toHaveAttribute("data-review-published", "0", { timeout: 15_000 });
    const after = await publicReviewIds();
    expect(after).not.toContain(id);
    const audit = await withSql(DB_URL, async (sql) => {
      const rows = (await sql`
        select actor_kind, actor_id
        from public.audit_log
        where table_name = 'reviews'
        order by created_at desc
        limit 1
      `) as { actor_kind: string; actor_id: string | null }[];
      return rows[0] ?? null;
    });
    expect(audit?.actor_kind).toBe("staff");
    expect(audit?.actor_id).toBe(fixture.userId);
  });

  test("moving the third review up persists and the first up control is inert", async ({
    page,
  }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/reviews`);
    const rows = page.locator("[data-review-id]");
    const thirdId = await rows.nth(2).getAttribute("data-review-id");
    const first = rows.first();
    await expect(first.getByTestId("reviews-move-up")).toBeDisabled();
    await rows.nth(2).getByTestId("reviews-move-up").click();
    await expect(rows.nth(1)).toHaveAttribute("data-review-id", thirdId ?? "", {
      timeout: 15_000,
    });
  });

  test("two console-created reviews that share sort_order 0 still reorder", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/reviews`);
    const stamp = Date.now();
    const firstRef = `t0614-a-${stamp}`;
    const secondRef = `t0614-b-${stamp}`;
    createdRefs.push(firstRef, secondRef);

    await page.getByTestId("reviews-add").click();
    await page.getByTestId("reviews-name").fill("Tie A");
    await page.getByTestId("reviews-external-ref").fill(firstRef);
    await page.getByTestId("reviews-save").click();
    await expect(page.getByText("Tie A")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("reviews-add").click();
    await page.getByTestId("reviews-name").fill("Tie B");
    await page.getByTestId("reviews-external-ref").fill(secondRef);
    await page.getByTestId("reviews-save").click();
    await expect(page.getByText("Tie B")).toBeVisible({ timeout: 15_000 });

    const tieA = page.locator("[data-review-id]", { hasText: "Tie A" });
    const before = await page.locator("[data-review-id]").allTextContents();
    await tieA.getByTestId("reviews-move-up").click();
    await expect(page.locator("[data-review-id]").first()).toContainText("Tie A", {
      timeout: 15_000,
    });
    const after = await page.locator("[data-review-id]").allTextContents();
    expect(after[0]).not.toBe(before[0]);
  });

  test("a google review cannot be rewritten; publish and move stay available", async ({
    page,
  }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/reviews`);
    const google = page.locator("[data-review-source=google]").first();
    await expect(google.getByTestId("reviews-publish")).toBeEnabled();
    await expect(google.getByTestId("reviews-move-down")).toBeEnabled();
    await google.getByTestId("reviews-edit").click();
    await expect(page.getByTestId("reviews-locked-note")).toBeVisible();
    await expect(page.getByTestId("reviews-name")).toBeDisabled();
    await expect(page.getByTestId("reviews-body")).toBeDisabled();
    await expect(page.getByTestId("reviews-source")).toBeDisabled();
    await expect(page.getByTestId("reviews-url")).toBeDisabled();
    await page.getByTestId("reviews-route").fill("ZRH → Geneva");
    await page.getByTestId("reviews-save").click();
    await expect(google).toContainText("ZRH → Geneva", { timeout: 15_000 });
  });

  test("manual review body can be edited and duplicate external_ref is refused", async ({
    page,
  }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/reviews`);
    const manual = page.locator("[data-review-source=manual]");
    await manual.getByTestId("reviews-edit").click();
    await expect(page.getByTestId("reviews-body")).toBeEnabled();
    await page.getByTestId("reviews-body").fill("Staff-curated wording for the manual row.");
    await page.getByTestId("reviews-save").click();
    await expect(manual).toContainText("Staff-curated wording for the manual row.", {
      timeout: 15_000,
    });

    const stamp = Date.now();
    const ref = `t0614-dup-${stamp}`;
    createdRefs.push(ref);
    await page.getByTestId("reviews-add").click();
    await page.getByTestId("reviews-name").fill("Dup A");
    await page.getByTestId("reviews-external-ref").fill(ref);
    await page.getByTestId("reviews-save").click();
    await expect(page.getByText("Dup A")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("reviews-add").click();
    await page.getByTestId("reviews-name").fill("Dup B");
    await page.getByTestId("reviews-external-ref").fill(ref);
    await page.getByTestId("reviews-save").click();
    await expect(page.getByTestId("reviews-error")).toBeVisible();
  });
});
