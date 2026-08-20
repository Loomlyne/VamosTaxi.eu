import { defineConfig, devices } from "@playwright/test";

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
      // UI-SPEC's own Component Port Fidelity Contract calls this a *default*, not yet
      // owner-confirmed against a real baseline set — re-tuned in Plan 14 once all 33
      // components have baselines (01-UI-SPEC.md § Component Port Fidelity Contract,
      // "Tolerance" row; the sentence this comment is required to carry, per Task 3).
      maxDiffPixelRatio: 0.01,
      // In-flight hover/press/dialog-entrance transitions must never cause a flaky
      // capture — every screenshot in this suite is taken with motion switched off.
      animations: "disabled",
    },
  },

  // Every spec under tests/visual carries "@component" as a literal substring of its
  // test title, which is what `--grep @component` matches against — `--grep @component`
  // and the plain `pnpm test:visual` therefore run the exact same suite until a
  // non-component visual project is added later.
  projects: Object.entries(VIEWPORTS).map(([label, viewport]) => ({
    name: `component-${label}`,
    use: {
      ...devices["Desktop Chrome"],
      viewport,
      deviceScaleFactor: 1,
    },
  })),
});
