// apps/web/tests/integration/lenis.spec.ts
//
// PLAT-05's automated proof (01-VALIDATION.md) — the four behaviours
// apps/web/lib/lenis-provider.tsx's must_haves promise, each one otherwise only a claim
// in a document: singleton, prefers-reduced-motion, the sheet-lock stop/start cycle in
// both directions, and scroll resync across a client-side navigation (RESEARCH Pitfall
// 7 — the one the vendored `assets/lenis-boot.js` never had to prove because the mocks
// reload between "pages"). A `data-lenis-prevent` nested-scroll region is asserted too,
// since the ported tables and the future ops board depend on it.
//
// Runs against the real Next.js app (`next dev`, spawned in beforeAll) rather than
// tests/support/mock-harness.ts's static component rig: these behaviours depend on the
// real [locale]/providers.tsx client boundary and the real App Router (client-side
// <Link>/router.push navigation, MutationObserver against the real document), which a
// harness that server-renders one component in isolation has no way to exercise.
//
// Tagged "@lenis" so `pnpm test:visual --grep @lenis` (the narrower form 01-VALIDATION.md
// maps PLAT-05 to) runs this suite alone. Lenis's house settings don't vary by
// breakpoint, so — matching tests/visual/button.spec.ts's own REDUCED_VIEWPORT_PROJECTS
// precedent for a component whose behaviour doesn't change across widths — every test
// here actually only runs under the "component-1440" project; the other three viewport
// projects would otherwise each spin up a redundant, identical dev server for no
// additional coverage.
//
// The body-lock release assertion was confirmed to be non-vacuous by deliberately
// reverting `isLocked()` to the naive computed-style port documented in
// lenis-provider.tsx's file header and watching this suite go red before restoring the
// inline-style fix (01-08-SUMMARY.md "Deviations" / "Tests verified red-then-green" has
// the exact failure: the release direction hangs forever, reproducing T-01-23's "instance
// that never restarts" DoS). The singleton test was checked the same way against a
// version of the boot effect with the `if (activeLenis) { reuse; return; }` guard
// removed and did NOT go red — a single `next dev` page load never actually double-mounts
// this provider, so that specific guard is a defensive backstop with no automated
// regression coverage here, matching this plan's own `verification: backstop` marking for
// the "second mount reuses the first" truth (01-08-SUMMARY.md has the full note).

import { test, expect, type Page, emulateMedia, pinReducedTransparency } from "../support/test";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const RUN_PROJECT = "component-1440";
// Playwright compiles this file to CommonJS (apps/web/package.json has no "type":
// "module"), so __dirname is the plain CJS global, matching
// tests/support/mock-harness.ts's own convention — and tests/support/server-harness.ts,
// which resolves WEB_ROOT/NEXT_BIN from its own __dirname the same way.

let devServer: ChildProcess | null = null;
let baseURL = "";

test.beforeAll(async ({}, testInfo) => {
  // Only the one project this spec actually runs under spends the cost of a dev server.
  if (testInfo.project.name !== RUN_PROJECT) return;

  // A cold `next dev` compile can take longer than the default 30s hook timeout under
  // load (e.g. the full `pnpm test:visual` run starting all four viewport projects'
  // workers at once) — this hook's own server-readiness poll is what actually bounds
  // the wait (waitForServer's 60s), not this number; it only has to be comfortably
  // larger than that.
  testInfo.setTimeout(90_000);

  const port = 3500 + testInfo.workerIndex;
  baseURL = `http://localhost:${port}`;
  devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
  });
  await waitForNextServer(baseURL);
});

test.afterAll(() => {
  if (devServer?.pid) {
    try {
      // `detached: true` puts `next dev` (and the child processes it spawns) in its
      // own process group — killing the negative pid kills the whole group, not just
      // the immediate `pnpm exec` wrapper.
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
    "Lenis's house settings don't vary by breakpoint — this spec runs once, under component-1440.",
  );
});

type LenisDebugSnapshot = { instances: number; isStopped: boolean | null };

async function debugSnapshot(page: Page): Promise<LenisDebugSnapshot | undefined> {
  return page.evaluate(() => window.__vamosLenisDebug?.());
}

test.describe("Lenis smooth scroll @lenis", () => {
  // One dev server per worker (Playwright's beforeAll/afterAll are worker-scoped, not
  // suite-scoped) is the whole cost this spec exists to avoid — force every test here
  // into the same worker so exactly one `next dev` process ever gets spawned.
  test.describe.configure({ mode: "serial" });

  test("singleton: exactly one instance is live, no matter how many components mount", async ({
    page,
  }) => {
    await page.goto(baseURL + "/");
    await page.waitForFunction(() => typeof window.__vamosLenisDebug === "function");
    const snapshot = await debugSnapshot(page);
    expect(snapshot?.instances).toBe(1);
  });

  test("reduced motion: no instance runs at all — torn down, not softened — and the change is honoured mid-session", async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await pinReducedTransparency(page);
    await page.goto(baseURL + "/");
    // No instance ever boots under reduced motion, so there is no
    // window.__vamosLenisDebug-becomes-a-function moment to wait on the way the other
    // tests do — wait for the app to finish hydrating some other way, then assert.
    await page.getByRole("heading").first().waitFor({ state: "visible" });
    const snapshot = await page.evaluate(() => window.__vamosLenisDebug?.());
    expect(snapshot?.instances ?? 0).toBe(0);

    // Mid-session: flip the media query after mount (Playwright's emulateMedia changes
    // it live) and confirm an instance still never appears.
    await emulateMedia(page, { reducedMotion: "reduce" });
    const stillNone = await page.evaluate(() => window.__vamosLenisDebug?.());
    expect(stillNone?.instances ?? 0).toBe(0);

    await context.close();
  });

  test("body lock: the instance stops while a sheet sets body{overflow:hidden}, and restarts once it's released", async ({
    page,
  }) => {
    await page.goto(baseURL + "/");
    await page.waitForFunction(() => typeof window.__vamosLenisDebug === "function");

    // The mocks' own lock signal (app/home/home.dc.html's lockScroll()): inline style
    // on document.body, exactly what a sheet/dialog sets while open.
    await page.evaluate(() => {
      document.body.style.overflow = "hidden";
    });
    await page.waitForFunction(() => window.__vamosLenisDebug?.().isStopped === true);
    expect((await debugSnapshot(page))?.isStopped).toBe(true);

    // Release — the direction Phase 5's dialogs depend on and T-01-23 flags as the DoS
    // risk if it silently regresses.
    await page.evaluate(() => {
      document.body.style.overflow = "";
    });
    await page.waitForFunction(() => window.__vamosLenisDebug?.().isStopped === false);
    expect((await debugSnapshot(page))?.isStopped).toBe(false);
  });

  test("navigation: scroll resets to the top on a client-side route change, and the instance stays singular", async ({
    page,
  }) => {
    await page.goto(baseURL + "/");
    await page.waitForFunction(() => typeof window.__vamosLenisDebug === "function");

    // Phase 1's stub home page isn't tall enough to scroll on its own — give it room,
    // without touching page.tsx (out of this plan's file scope).
    await page.evaluate(() => {
      const spacer = document.createElement("div");
      spacer.style.height = "3000px";
      spacer.setAttribute("data-test-spacer", "1");
      document.body.appendChild(spacer);
    });
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForFunction(() => window.scrollY > 0);

    // Dev-only test hook wrapping the App Router's own router.push — the same
    // client-side transition a real <Link> click triggers (see lenis-provider.tsx's
    // TEST_HOOKS_ENABLED doc comment for why this exists instead of a hidden <Link>).
    await page.evaluate(() => window.__vamosTestNav?.("/de"));
    await page.waitForURL("**/de");
    await page.waitForFunction(() => window.scrollY === 0);

    const snapshot = await debugSnapshot(page);
    expect(snapshot?.instances).toBe(1);
  });

  test("nested scroll: a data-lenis-prevent region keeps its own scroll, the page underneath doesn't move", async ({
    page,
  }) => {
    await page.goto(baseURL + "/");
    await page.waitForFunction(() => typeof window.__vamosLenisDebug === "function");

    const target = await page.evaluate(() => {
      const region = document.createElement("div");
      region.setAttribute("data-lenis-prevent", "1");
      region.setAttribute("data-test-nested-scroll", "1");
      region.style.cssText =
        "position:fixed;top:40px;left:40px;width:300px;height:200px;overflow:auto;z-index:9999;background:#fff";
      const tall = document.createElement("div");
      tall.style.height = "2000px";
      region.appendChild(tall);
      document.body.appendChild(region);
      const rect = region.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });

    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.move(target.x, target.y);
    await page.mouse.wheel(0, 800);
    await page.waitForFunction(() => {
      const el = document.querySelector<HTMLElement>("[data-test-nested-scroll]");
      return !!el && el.scrollTop > 0;
    });

    const after = await page.evaluate(() => window.scrollY);
    const nestedScrollTop = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>("[data-test-nested-scroll]");
      return el ? el.scrollTop : 0;
    });

    expect(after).toBe(before);
    expect(nestedScrollTop).toBeGreaterThan(0);
  });
});
