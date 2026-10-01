import { defineConfig, devices } from "@playwright/test";
import { E2E_SPECS } from "./tests/e2e-specs";

// The D-25 screenshot-diff gate: one `.dc.html` mock (or, for the six components no mock
// uses, the vendored bundle — apps/web/tests/support/mock-harness.ts) diffed against its
// React port, per component and variant, at the four fixed breakpoints the whole project
// is checked at (.claude/CLAUDE.md § Responsive Design). Every project below is tagged
// "@component" so `pnpm test:visual --grep @component` (the narrower form
// 01-VALIDATION.md maps PLAT-04 to) and the plain `pnpm test:visual` both work — this
// plan ships no other kind of Playwright project yet.
//
// No network egress: apps/web/tests/support/mock-harness.ts serves both the mock side
// and the port side from a local, offline HTTP server backed by apps/web/tests/vendor/'s
// vendored React/ReactDOM/Babel — never unpkg.com (Open Question 3, 01-RESEARCH.md).

const VIEWPORTS: Record<string, { width: number; height: number }> = {
  "1440": { width: 1440, height: 900 },
  "1024": { width: 1024, height: 900 },
  "768": { width: 768, height: 1000 },
  "390": { width: 390, height: 900 },
};

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],

  expect: {
    toHaveScreenshot: {
      // UI-SPEC's own Component Port Fidelity Contract called 0.01 (1%) a *default*,
      // not yet owner-confirmed against a real baseline set — settled here, Plan 14
      // Task 3, once all 33 components had baselines.
      //
      // Method: every screenshot in the suite was re-run with the tolerance forced to
      // 0.0001 (near-zero) on an otherwise unchanged tree, twice, to see exactly which
      // states carry real, non-zero anti-aliasing/rendering noise rather than diffing
      // clean. 356 of 373 states diffed at a TRUE zero (no pixels different at all,
      // not just under the old 1%) both times. Eight states across five components
      // carried a genuine, stable, non-zero pixel count — real ratios computed from
      // the reported pixel count over the actual screenshot's own width×height (the
      // reporter's own printed "ratio 0.01" is rounded display, not the real value):
      //
      //   SiteFooter "default", 1440           641 /  1,314,720 px = 0.049%
      //   Tabs "variant=underline", 1440         37 /     63,360 px = 0.058%
      //   StatTile "tone=inverse", 390/1440       58 /     46,020 px = 0.126%
      //   Tabs "disabled per-tab", 390/1440       28 /     18,720 px = 0.150%
      //   VehicleCard "selected", all 4vp        137 /     56,160 px = 0.244%
      //   Dialog "focus", 1440                 3,818 /  1,296,000 px = 0.295%
      //   Dialog "focus", 390                   2,654 /    351,000 px = 0.756%
      //   VehicleCard "default", all 4vp         472 /     54,600 px = 0.864%
      //
      // The global default is tightened to 0.005 (0.5%) — comfortably above every
      // observed ratio except the two genuine outliers (Dialog's real focus-trap
      // event and VehicleCard's icon-fallback glyph, both plausibly higher-noise:
      // a live focus/scrim compositing pass and an SVG-mask icon glyph's own
      // anti-aliasing, respectively — neither is a missing state, a wrong token, a
      // renamed class or a layout shift, the Fidelity Contract's own "never
      // acceptable" list). A tenth of the old 1% for the 356 clean states means a
      // real regression (a missing state, a wrong token, a layout shift) can no
      // longer hide under slack that was never actually being used. The two outliers
      // get their own scoped, higher per-test tolerance overrides at their own call
      // sites (`tests/visual/feedback.spec.ts`'s Dialog focus test,
      // `tests/visual/transfer.spec.ts`'s VehicleCard "default" test) — matching the
      // old global default exactly, not a blanket loosening for everything else.
      //
      // Re-verified stable at these settled values: `pnpm test:visual` passed twice
      // in a row on the unchanged tree (0 failures, 0 flakes) after this change.
      maxDiffPixelRatio: 0.005,
      // In-flight hover/press/dialog-entrance transitions must never cause a flaky
      // capture — every screenshot in this suite is taken with motion switched off.
      animations: "disabled",
    },
  },

  // Every spec under tests/visual carries "@component" as a literal substring of its
  // test title, which is what `--grep @component` matches against.
  //
  // 26.0 D-01, three modes:
  //   - macOS CI job (CI=1): offline darwin screenshots and file-read checks only. That runner
  //     has no Docker, so the specs in E2E_SPECS (they boot Next or need the database) are ignored.
  //   - Linux e2e job (CI=1 VAMOS_E2E=1): runs exactly E2E_SPECS against its own throwaway
  //     Supabase stack. darwin screenshot assertions are skipped there (ignoreSnapshots); the
  //     pictures are compared on the owner's Mac. No Linux baselines exist.
  //   - local (neither set): every spec runs.
  ...(process.env.VAMOS_E2E === "1"
    ? { testMatch: E2E_SPECS, ignoreSnapshots: process.platform !== "darwin" }
    : process.env.CI
      ? { testIgnore: E2E_SPECS }
      : {}),
  projects: Object.entries(VIEWPORTS).map(([label, viewport]) => ({
    name: `component-${label}`,
    use: {
      ...devices["Desktop Chrome"],
      viewport,
      deviceScaleFactor: 1,
    },
  })),
});
