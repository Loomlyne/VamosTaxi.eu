// apps/web/tests/integration/feedback-behaviour.spec.ts
//
// The automated proof 01-UI-SPEC.md's § E6 "Feedback set" row calls for explicitly:
// "Phase 1 automates these, because a screenshot diff cannot see them." Five
// assertions, each one otherwise only a claim in Dialog.tsx's own header comment or
// this plan's must_haves:
//   - focus trap: tabbing repeatedly never lets focus leave the open dialog
//   - focus restoration: closing the dialog returns focus to the element that
//     opened it
//   - the document and the Lenis smooth-scroll instance both stop while the dialog
//     is open, and both restart once it closes — the same cycle
//     tests/integration/lenis.spec.ts's own "body lock" test already asserts from
//     the provider's side; asserting it here too, from the dialog's side, is what
//     proves the two mechanisms (Dialog.tsx's inline `document.body.style.overflow`
//     write, apps/web/lib/lenis-provider.tsx's inline-style-reading
//     MutationObserver) actually meet rather than merely coexist
//   - the dialog's own tall body scrolls inside itself while the page behind it
//     does not move — the same nested-scroll methodology
//     tests/integration/lenis.spec.ts's own "nested scroll" test uses for a
//     `data-lenis-prevent` region, applied here to `.vt-dialog` itself (the element
//     Dialog.tsx marks `data-lenis-prevent` on)
//   - a toast renders inside a live region, so assistive technology announces it
//
// Runs against the real Next.js app (`next dev`, spawned in beforeAll), the same
// pattern tests/integration/lenis.spec.ts already established — these behaviours
// depend on the real [locale]/providers.tsx client boundary (the actual
// LenisProvider instance Dialog's scroll lock cooperates with) and real React
// effects (Dialog's focus-trap/restoration/scroll-lock useEffect chain), neither of
// which tests/support/mock-harness.ts's static-render rig can exercise — the same
// "mountPort renders fully static, non-hydrated markup" boundary
// tests/visual/feedback.spec.ts's own Tooltip note documents.
//
// The fixture under test is the real dev gallery route
// (app/[locale]/dev/components/feedback/FeedbackGallery.tsx's AutoOpenDialogDemo and
// dismissible Toast tile) rather than a bespoke test-only page — this plan's
// `<files>` scope names no additional route, and reusing the gallery means the exact
// same component instances a human reviews in the German/Arabic manual pass are the
// ones this spec asserts against.
//
// Tagged "@feedback-behaviour" so `pnpm test:visual --grep @feedback-behaviour`
// (01-10-PLAN.md's own verify command) runs this suite alone, and the plain
// `pnpm test:visual` still picks it up as part of the full run.

import { test, expect, type Page } from "../support/test";
import { testPort } from "../support/port";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import { nextDevEnv } from "../support/test-stack";

const RUN_PROJECT = "component-1440";

let devServer: ChildProcess | null = null;
let baseURL = "";

test.beforeAll(async ({}, testInfo) => {
  // Only the one project this spec actually runs under spends the cost of a dev
  // server — same reasoning lenis.spec.ts's own beforeAll documents.
  if (testInfo.project.name !== RUN_PROJECT) return;

  testInfo.setTimeout(90_000);

  // Offset from lenis.spec.ts's own 3500-range by 100 so the two specs' dev servers
  // never contend for the same port even if a worker index is reused across files
  // within the same run.
  const port = testPort(3600) + testInfo.workerIndex;
  baseURL = `http://localhost:${port}`;
  devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: nextDevEnv({}, { gallery: true }),
  });
  await waitForNextServer(baseURL);
});

test.afterAll(() => {
  if (devServer?.pid) {
    try {
      // `detached: true` puts `next dev` (and the child processes it spawns) in its
      // own process group — killing the negative pid kills the whole group, not
      // just the immediate `pnpm exec` wrapper.
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
    "Focus/scroll behaviour doesn't vary by breakpoint — this spec runs once, under component-1440.",
  );
});

const DIALOG_SELECTOR = '[role="dialog"]';
const TRIGGER_SELECTOR = '[data-testid="dialog-trigger"] button';

async function gotoFeedbackGallery(page: Page): Promise<void> {
  await page.goto(baseURL + "/dev/components/feedback");
  // AutoOpenDialogDemo focuses its trigger, then opens the dialog on the very next
  // commit (see FeedbackGallery.tsx's own comment on why) — wait for the panel to
  // actually be in the DOM before asserting anything about it.
  await page.locator(DIALOG_SELECTOR).waitFor({ state: "visible" });
}

test.describe("Feedback behaviour @feedback-behaviour", () => {
  // One dev server per worker (Playwright's beforeAll/afterAll are worker-scoped,
  // not suite-scoped) is the whole cost this spec exists to avoid — force every
  // test here into the same worker so exactly one `next dev` process ever gets
  // spawned, same reasoning lenis.spec.ts's own describe.configure carries.
  test.describe.configure({ mode: "serial" });

  test("focus trap: tabbing repeatedly never lets focus leave the open dialog", async ({ page }) => {
    await gotoFeedbackGallery(page);

    const focusableCount = await page
      .locator(`${DIALOG_SELECTOR} a[href], ${DIALOG_SELECTOR} button:not([disabled])`)
      .count();
    // Tab well past the number of focusable elements inside the panel — if the trap
    // ever leaked, this would land focus on the trigger button (which sits just
    // outside the panel in DOM order) or on document.body.
    for (let i = 0; i < focusableCount + 5; i++) {
      await page.keyboard.press("Tab");
    }

    const stillInside = await page.evaluate((selector) => {
      const panel = document.querySelector(selector);
      return !!panel && panel.contains(document.activeElement);
    }, DIALOG_SELECTOR);
    expect(stillInside).toBe(true);
  });

  test("focus restoration: closing the dialog (Escape) returns focus to the element that opened it", async ({
    page,
  }) => {
    await gotoFeedbackGallery(page);

    await page.keyboard.press("Escape");
    await page.locator(DIALOG_SELECTOR).waitFor({ state: "hidden" });

    const restoredToTrigger = await page.evaluate((selector) => {
      const trigger = document.querySelector(selector);
      return !!trigger && document.activeElement === trigger;
    }, TRIGGER_SELECTOR);
    expect(restoredToTrigger).toBe(true);
  });

  test("scroll lock: the document and the Lenis instance both stop while the dialog is open, and both restart once it closes", async ({
    page,
  }) => {
    await gotoFeedbackGallery(page);

    // The same inline-style signal apps/web/lib/lenis-provider.tsx's own
    // MutationObserver watches for (Dialog.tsx sets it directly on open) —
    // asserted here from the dialog's side, meeting the cycle
    // tests/integration/lenis.spec.ts's own "body lock" test already asserts from
    // the provider's side.
    await page.waitForFunction(() => document.body.style.overflow === "hidden");
    await page.waitForFunction(() => window.__vamosLenisDebug?.().isStopped === true);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    expect((await page.evaluate(() => window.__vamosLenisDebug?.()))?.isStopped).toBe(true);

    await page.keyboard.press("Escape");
    await page.locator(DIALOG_SELECTOR).waitFor({ state: "hidden" });

    await page.waitForFunction(() => document.body.style.overflow === "");
    await page.waitForFunction(() => window.__vamosLenisDebug?.().isStopped === false);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    expect((await page.evaluate(() => window.__vamosLenisDebug?.()))?.isStopped).toBe(false);
  });

  test("dialog body: scrolls inside itself while the page behind it does not move", async ({ page }) => {
    await gotoFeedbackGallery(page);

    const panel = page.locator(DIALOG_SELECTOR);
    const box = await panel.boundingBox();
    if (!box) throw new Error("dialog panel has no bounding box");

    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 1200);
    await page.waitForFunction(
      (selector) => (document.querySelector(selector)?.scrollTop ?? 0) > 0,
      DIALOG_SELECTOR,
    );

    const after = await page.evaluate(() => window.scrollY);
    const panelScrollTop = await page.evaluate(
      (selector) => document.querySelector(selector)?.scrollTop ?? 0,
      DIALOG_SELECTOR,
    );

    expect(after).toBe(before);
    expect(panelScrollTop).toBeGreaterThan(0);
  });

  test("toast: renders inside a live region", async ({ page }) => {
    await page.goto(baseURL + "/dev/components/feedback");

    const toast = page.locator('[data-testid="toast-demo"] [role="status"]');
    await expect(toast).toBeVisible();
    await expect(toast).toHaveText(/booking confirmed/i);
  });
});
