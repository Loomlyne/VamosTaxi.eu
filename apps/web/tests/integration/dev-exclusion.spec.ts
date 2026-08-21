// apps/web/tests/integration/dev-exclusion.spec.ts
//
// D-28's own three-way contract for the dev-only states gallery (01-UI-SPEC.md §
// Dev-Only States Gallery, "Production/sitemap exclusion" row): reachable in local dev
// and on staging (for review), absent from a genuine production deploy, and carrying
// `X-Robots-Tag: noindex` in every one of those cases.
//
// This project builds ONCE (`opennextjs-cloudflare build`/`next build`) and deploys the
// SAME artifact to `env.staging` and `env.production` — the two differ only in the
// Cloudflare `vars`/bindings injected at request time (`apps/web/wrangler.jsonc`'s own
// comment). `apps/web/app/[locale]/dev/layout.tsx`'s own comment records why this means
// the exclusion check MUST run per-request (`export const dynamic = "force-dynamic"`)
// rather than at build time — this suite proves that claim against a real, once-built
// `next start` server, toggling only the runtime `DEPLOY_ENV` env var between the
// "production" and "staging" checks, never rebuilding — the same "one build, two
// deploys" shape the real Cloudflare setup has.
//
// Sequential, not parallel (`test.describe.configure({ mode: "serial" })`): only one
// `next start` process is ever alive at a time, since `DEPLOY_ENV` is read once at
// server-start-adjacent request time and toggling it under a live server would race
// whichever request happened to be in flight.
//
// Tagged "@dev-exclusion" per this plan's own artifact list.

import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

const RUN_PROJECT = "component-1440";
const WEB_ROOT = join(__dirname, "..", "..");

async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms: ${String(lastError)}`);
}

function killServer(proc: ChildProcess | null): void {
  if (proc?.pid) {
    try {
      process.kill(-proc.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
}

test.describe("Dev gallery production exclusion @dev-exclusion", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== RUN_PROJECT,
      "Exclusion/header behaviour doesn't vary by breakpoint — this spec runs once, under component-1440.",
    );
  });

  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name !== RUN_PROJECT) return;
    testInfo.setTimeout(180_000);
    // One production build, reused by every `next start` in this file — the exact
    // "build once, toggle DEPLOY_ENV at request time" shape this suite exists to prove.
    execFileSync("pnpm", ["exec", "next", "build"], { cwd: WEB_ROOT, stdio: "ignore" });
  });

  test("a genuine production deploy (no DEPLOY_ENV) returns not-found for the gallery, with the noindex header still present", async ({}, testInfo) => {
    testInfo.setTimeout(60_000);
    const port = 4200 + testInfo.workerIndex;
    const baseURL = `http://localhost:${port}`;
    // `DEPLOY_ENV` genuinely absent (deleted, not set to an empty string) — matching
    // `apps/web/wrangler.jsonc`'s own documented state under `env.production`, which
    // carries no `vars.DEPLOY_ENV` entry at all rather than an empty one.
    const prodEnv: NodeJS.ProcessEnv = { ...process.env };
    delete prodEnv.DEPLOY_ENV;
    const server = spawn("pnpm", ["exec", "next", "start", "-p", String(port)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
      env: prodEnv,
    });
    try {
      await waitForServer(baseURL);
      const res = await fetch(`${baseURL}/dev/components/core`);
      expect(res.status).toBe(404);
      expect(res.headers.get("x-robots-tag")).toMatch(/noindex/i);
    } finally {
      killServer(server);
    }
  });

  test("staging (DEPLOY_ENV=staging) resolves the gallery normally, with the noindex header present", async ({}, testInfo) => {
    testInfo.setTimeout(60_000);
    const port = 4300 + testInfo.workerIndex;
    const baseURL = `http://localhost:${port}`;
    const server = spawn("pnpm", ["exec", "next", "start", "-p", String(port)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
      env: { ...process.env, DEPLOY_ENV: "staging" },
    });
    try {
      await waitForServer(baseURL);

      // All seven gallery pages resolve (the index + the six design-system categories
      // + the shell review surface).
      for (const category of ["core", "forms", "navigation", "feedback", "data", "transfer", "shell"]) {
        const res = await fetch(`${baseURL}/dev/components/${category}`);
        expect(res.status, `category "${category}" should resolve on staging`).toBe(200);
        expect(res.headers.get("x-robots-tag")).toMatch(/noindex/i);
      }
      const indexRes = await fetch(`${baseURL}/dev/components`);
      expect(indexRes.status).toBe(200);
      expect(indexRes.headers.get("x-robots-tag")).toMatch(/noindex/i);

      // The prefixed-locale URL shape (`/de/dev/components/core`) carries the same
      // header — the two next.config.ts `headers()` source patterns this plan adds,
      // proven independently rather than assumed from the unprefixed English case above.
      const dePrefixedRes = await fetch(`${baseURL}/de/dev/components/core`);
      expect(dePrefixedRes.headers.get("x-robots-tag")).toMatch(/noindex/i);

      // The served sitemap and the home page's own alternates carry no dev route —
      // Plan 12's shared PUBLIC_ROUTES list was never extended with one, asserted
      // against the real served output rather than assumed.
      const sitemapRes = await fetch(`${baseURL}/sitemap.xml`);
      const sitemapBody = await sitemapRes.text();
      expect(sitemapBody).not.toContain("/dev/");

      const homeBody = await (await fetch(`${baseURL}/`)).text();
      expect(homeBody).not.toMatch(/hreflang[^>]*dev\//);
    } finally {
      killServer(server);
    }
  });
});
