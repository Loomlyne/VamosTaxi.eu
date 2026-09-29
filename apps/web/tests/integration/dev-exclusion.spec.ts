// apps/web/tests/integration/dev-exclusion.spec.ts
//
// D-02 (Phase 26.0, 2026-09-29): the dev-only states gallery is reachable ONLY under
// `next dev` with VAMOS_DEV_GALLERY=1 (`lib/dev-gallery.ts` devGalleryEnabled()). A
// production build answers 404 on every /dev route whatever DEPLOY_ENV says (production
// or staging) and even when VAMOS_DEV_GALLERY=1 is in its env; staging no longer serves
// the gallery. `X-Robots-Tag: noindex` stays on /dev in every case.
// D-03: public home on vamostaxi.site is indexable even when DEPLOY_ENV=staging.
//
// This project builds ONCE and deploys the SAME artifact to `env.staging` and
// `env.production`; this suite builds once and toggles only the runtime env of
// `next start`, never rebuilding, and sets VAMOS_DEV_GALLERY=1 on purpose in every
// production-mode server to prove the flag cannot open the gallery there.
//
// Sequential, not parallel (`test.describe.configure({ mode: "serial" })`): only one
// `next start` process is ever alive at a time, since `DEPLOY_ENV` is read once at
// server-start-adjacent request time and toggling it under a live server would race
// whichever request happened to be in flight.
//
// `TEST_DIST_DIR` (`next.config.ts`'s own comment has the full story): this file's own
// `next build` writes to an isolated `distDir` rather than the shared `apps/web/.next`
// every other integration spec's `next dev` also targets — a real, reproduced conflict
// during a full-suite run (`execFileSync` throwing while another worker's `next dev`
// was mid-compile against the same directory; each spec passes clean in isolation).
//
// Tagged "@dev-exclusion" per this plan's own artifact list.

import { test, expect } from "../support/test";
import { testPort } from "../support/port";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { nextDevEnv } from "../support/test-stack";
import { execFileLogged, NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const NEXT = process.env.NEXT_BIN ?? (existsSync(NEXT_BIN) ? NEXT_BIN : join(WEB_ROOT, "../../../../apps/web/node_modules/.bin/next"));

/** Phase 5 shipped these under app/[locale]/dev (partner-form is deleted from V1). */
const MIN_DEV_ROUTES = 8;

function walkDevPages(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkDevPages(full, files);
    else if (entry === "page.tsx") files.push(full);
  }
  return files;
}

function devRoutePaths(): string[] {
  const root = join(WEB_ROOT, "app", "[locale]", "dev");
  return walkDevPages(root).map((abs) => {
    const rel = relative(root, abs).replace(/\\/g, "/").replace(/\/page\.tsx$/, "").replace(/page\.tsx$/, "");
    return rel ? `/dev/${rel}` : "/dev";
  });
}

const RUN_PROJECT = "component-1440";

async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
  return waitForNextServer(url, timeoutMs);
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

  // A single, fixed, gitignored (`test-results/`) build output — isolated from the
  // `apps/web/.next` directory every other integration spec's `next dev` targets.
  // Fixed rather than keyed by `testInfo.workerIndex`: this describe block is
  // `serial`-mode and gated to one Playwright project (`RUN_PROJECT`), so only one
  // worker ever builds here in a given run — a worker-suffixed name bought no real
  // isolation, only a fresh `${distDir}/types/**/*.ts` entry that Next's own
  // `writeConfigurationDefaults` appends to the committed `tsconfig.json` on every
  // run with a new distDir. A fixed name makes that append idempotent (Next only
  // writes when the exact string is missing from `include`) instead of growing the
  // file forever.
  const distDir = "test-results/.next-dev-exclusion";

  // One production build, reused by every `next start` in this file — the "build once,
  // toggle DEPLOY_ENV at request time" shape this suite exists to prove. Built lazily inside
  // the first production test (not in a hook) so a failing build is scoped to those tests.
  let built = false;
  function buildOnce(): void {
    if (built) return;
    execFileLogged(NEXT, ["build"], {
      cwd: WEB_ROOT,
      env: { ...process.env, TEST_DIST_DIR: distDir } as NodeJS.ProcessEnv,
      timeoutMs: 180_000,
    });
    built = true;
  }

  test("a genuine production deploy (no DEPLOY_ENV, VAMOS_DEV_GALLERY=1 in env) returns not-found for every walked /dev route, with the noindex header still present", async ({}, testInfo) => {
    testInfo.setTimeout(240_000);
    test.fail(true, "KNOWN-RED 26.0: `next build` fails type-check on main: non-route exports (decodeContentKey, readJsonObject, ...) in app/[locale]/(ops)/api/staff/content/[key]/route.ts — owner to rule");
    buildOnce();
    const port = testPort(4200) + testInfo.workerIndex;
    const baseURL = `http://localhost:${port}`;
    // `DEPLOY_ENV` genuinely absent (deleted, not set to an empty string) — matching
    // `apps/web/wrangler.jsonc`'s own documented state under `env.production`, which
    // carries no `vars.DEPLOY_ENV` entry at all rather than an empty one.
    const prodEnv: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", VAMOS_DEV_GALLERY: "1", TEST_DIST_DIR: distDir };
    delete prodEnv.DEPLOY_ENV;
    const paths = devRoutePaths();
    expect(paths.length, "walk of app/[locale]/dev/** must not be vacuously empty").toBeGreaterThanOrEqual(MIN_DEV_ROUTES);
    const server = spawn(NEXT, ["start", "-p", String(port)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
      env: prodEnv,
    });
    try {
      await waitForServer(baseURL);
      for (const path of paths) {
        const res = await fetch(`${baseURL}${path}`);
        expect(res.status, `${path} must 404 in production`).toBe(404);
        expect(res.headers.get("x-robots-tag")).toMatch(/noindex/i);
      }
    } finally {
      killServer(server);
    }
  });

  test("staging (DEPLOY_ENV=staging, VAMOS_DEV_GALLERY=1 in env) returns not-found for the gallery and /dev/quote, with the noindex header present", async ({}, testInfo) => {
    testInfo.setTimeout(240_000);
    test.fail(true, "KNOWN-RED 26.0: `next build` fails type-check on main: non-route exports (decodeContentKey, readJsonObject, ...) in app/[locale]/(ops)/api/staff/content/[key]/route.ts — owner to rule");
    buildOnce();
    const port = testPort(4300) + testInfo.workerIndex;
    const baseURL = `http://localhost:${port}`;
    const server = spawn(NEXT, ["start", "-p", String(port)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
      env: { ...process.env, NODE_ENV: "production", VAMOS_DEV_GALLERY: "1", DEPLOY_ENV: "staging", TEST_DIST_DIR: distDir },
    });
    try {
      await waitForServer(baseURL);

      for (const path of [
        ...["core", "forms", "navigation", "feedback", "data", "transfer", "shell"].map((c) => `/dev/components/${c}`),
        "/dev/quote",
        "/de/dev/quote",
        "/dev/components",
        "/de/dev/components/core",
      ]) {
        const res = await fetch(`${baseURL}${path}`);
        expect(res.status, `${path} must 404 on staging (D-02)`).toBe(404);
        expect(res.headers.get("x-robots-tag")).toMatch(/noindex/i);
      }

      // D-03: public home must not carry noindex even on staging. /dev stays noindex.
      const homeRes = await fetch(`${baseURL}/`);
      expect(homeRes.status).toBe(200);
      expect(homeRes.headers.get("x-robots-tag") ?? "").not.toMatch(/noindex/i);

      // The served sitemap and the home page's own alternates carry no dev route —
      // Plan 12's shared PUBLIC_ROUTES list was never extended with one, asserted
      // against the real served output rather than assumed.
      const sitemapRes = await fetch(`${baseURL}/sitemap.xml`);
      const sitemapBody = await sitemapRes.text();
      expect(sitemapBody).not.toContain("/dev/");

      const homeBody = await homeRes.text();
      expect(homeBody).not.toMatch(/hreflang[^>]*dev\//);
    } finally {
      killServer(server);
    }
  });

  for (const gallery of [false, true]) {
    test(`next dev ${gallery ? "with" : "without"} VAMOS_DEV_GALLERY=1 ${gallery ? "serves" : "404s"} /dev/components/core`, async ({}, testInfo) => {
      testInfo.setTimeout(180_000);
      const port = testPort(gallery ? 4320 : 4310) + testInfo.workerIndex;
      const baseURL = `http://localhost:${port}`;
      const server = spawn(NEXT, ["dev", "-p", String(port)], {
        cwd: WEB_ROOT,
        stdio: "ignore",
        detached: true,
        env: nextDevEnv({ TEST_DIST_DIR: `test-results/.next-dev-exclusion-dev-${gallery ? "on" : "off"}` }, { gallery }),
      });
      try {
        await waitForNextServer(baseURL, 180_000);
        for (const path of ["/dev/components/core", "/dev/quote"]) {
          const res = await fetch(`${baseURL}${path}`);
          expect(res.status, `${path} under next dev, gallery=${gallery}`).toBe(gallery ? 200 : 404);
          expect(res.headers.get("x-robots-tag")).toMatch(/noindex/i);
        }
      } finally {
        killServer(server);
      }
    });
  }
});
