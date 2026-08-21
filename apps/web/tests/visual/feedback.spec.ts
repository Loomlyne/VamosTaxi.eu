// apps/web/tests/visual/feedback.spec.ts
//
// Screenshot-diff baselines for the feedback set (Alert, Dialog, ProgressIndicator,
// Toast, Tooltip — Plan 10). Same uniform strategy core.spec.ts (Plan 06) and
// forms.spec.ts (Plan 09) already established: every component diffed `mountPort`
// against `mountBundle`, regardless of whether a real `.dc.html` mock happens to
// reference it.
//
// States covered follow the Component State Matrix rows (01-UI-SPEC.md):
//   Alert              — Default only; tone is a `variant` prop (info/success/danger/
//                         inverse — `accent` is dropped, Law 02), screenshotted per
//                         tone anyway, same precedent Badge's seven tones set in
//                         core.spec.ts.
//   Toast              — Default only; tone is a `variant` prop, enter/exit motion
//                         only, no interaction states. The dismiss button
//                         (`onClose`-gated) cannot be screenshot-tested through this
//                         harness at all — `onClose` is a function prop and both
//                         `mountPort`/`mountBundle` pass props through
//                         `JSON.stringify`, which silently drops function values
//                         (the same "onClick cannot cross the boundary as a
//                         serialisable prop" limitation forms.spec.ts's Tag test
//                         documents). Verified visually instead in the dev gallery
//                         (FeedbackGallery.tsx's dismissible Toast tile) and proven
//                         behaviourally (live region) by
//                         tests/integration/feedback-behaviour.spec.ts.
//   Tooltip            — Default, Focus ("shown"). "Shown" is real React state
//                         toggled by a live onMouseEnter/onFocus handler, not a CSS
//                         `:hover` pseudo-class and not a controllable prop (by
//                         design, see Tooltip.tsx's header comment). `mountPort`
//                         serves fully static, non-hydrated markup with no attached
//                         event handlers, so a Playwright hover()/focus() on that
//                         side has nothing to react to — the same test-methodology
//                         boundary 01-06-SUMMARY.md documents for Avatar's
//                         onError/loading states. Only the bundle side (a real,
//                         client-hydrated React app) can be driven into this state
//                         here; the port side's rendering fidelity for "shown" is
//                         verified manually instead, via the dev gallery's
//                         AutoShowTooltip fixture, during the German/Arabic passes —
//                         recorded as a Known Stub, not silently skipped.
//   Dialog             — Default (open), Focus (focus-trap on open — a static
//                         screenshot of a focused element inside the open panel;
//                         the trap's actual behaviour is proven by
//                         tests/integration/feedback-behaviour.spec.ts, not here).
//                         `onClose` cannot cross the harness boundary either (same
//                         limitation as Toast), so the header close button never
//                         renders through this harness; verified in the gallery
//                         instead.
//   ProgressIndicator  — Default/Loading (this component *is* the loading
//                         affordance — there is no separate skeleton visual to
//                         diff, confirmed by reading `function ProgressIndicator`
//                         directly, so these two matrix rows collapse to one
//                         baseline, the same "no skeleton in source" treatment
//                         core.spec.ts's Avatar loading tile documents), Error
//                         (tone=danger).
//
// All five components' CSS carries no `@media` breakpoint rule (confirmed by
// reading every extracted .css file at port time) — the Fidelity Contract's
// reduced-viewport allowance (1440/390 only) applies uniformly here, same as
// core.spec.ts/forms.spec.ts/navigation.spec.ts.

import { test, expect, type Page } from "@playwright/test";
import { mountBundle, mountPort, waitForMockReady } from "../support/mock-harness";

const REDUCED_VIEWPORT_PROJECTS = new Set(["component-1440", "component-390"]);

function portPath(name: string): string {
  return `apps/web/components/feedback/${name}.tsx`;
}

async function withDarkBackground(page: Page): Promise<void> {
  // Inverse-tone tiles whose CSS only recolours text/track (ProgressIndicator,
  // SectionHeader) rather than painting their own background (unlike Alert/Toast,
  // which already carry a fixed charcoal background in every tone) need a dark page
  // background to be legible in the diff — matching the charcoal wrapper
  // CoreGallery.tsx/FeedbackGallery.tsx use for the same tiles.
  await page.evaluate(() => {
    document.body.style.background = "#1E1F1F";
  });
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    !REDUCED_VIEWPORT_PROJECTS.has(testInfo.project.name),
    "None of this batch's CSS carries a responsive rule — Fidelity Contract allows the reduced 1440/390 set.",
  );
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    const isLocal =
      url.protocol === "data:" || url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (!isLocal) externalRequests.push(request.url());
  });
  (page as unknown as { __externalRequests: string[] }).__externalRequests = externalRequests;
});

test.afterEach(async ({ page }) => {
  const externalRequests = (page as unknown as { __externalRequests?: string[] }).__externalRequests ?? [];
  expect(
    externalRequests,
    `no request in this suite may leave localhost (D-25/D-31) — saw: ${externalRequests.join(", ")}`,
  ).toEqual([]);
});

// ── Alert ─────────────────────────────────────────────────────────────────────────

test.describe("Alert @component", () => {
  const TONES = ["info", "success", "danger", "inverse"] as const;

  for (const tone of TONES) {
    test(`tone=${tone} — port matches the vendored bundle @component`, async ({ page }) => {
      const props = { tone, title: "Fixed price", children: "Your quote does not change once confirmed." };
      const name = `alert-${tone}.png`;

      const bundleUrl = await mountBundle("Alert", props);
      await page.goto(bundleUrl);
      await waitForMockReady(page);
      await expect(page.locator("#root")).toHaveScreenshot(name);

      const portUrl = await mountPort(portPath("Alert"), props);
      await page.goto(portUrl);
      await waitForMockReady(page);
      await expect(page.locator("#root")).toHaveScreenshot(name);
    });
  }

  test("long body wraps rather than truncating — port matches the vendored bundle @component", async ({
    page,
  }) => {
    const props = {
      tone: "danger",
      title: "Trip could not go ahead",
      children:
        "Your driver waited past the included grace period and the trip could not go ahead as booked. We've refunded the fare in full to your original payment method.",
    };
    const name = "alert-long-body.png";

    const bundleUrl = await mountBundle("Alert", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Alert"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });
});

// ── Toast ─────────────────────────────────────────────────────────────────────────

test.describe("Toast @component", () => {
  const TONES = ["neutral", "success", "danger"] as const;

  for (const tone of TONES) {
    test(`tone=${tone} — port matches the vendored bundle @component`, async ({ page }) => {
      const props = { tone, children: "Booking confirmed" };
      const name = `toast-${tone}.png`;

      const bundleUrl = await mountBundle("Toast", props);
      await page.goto(bundleUrl);
      await waitForMockReady(page);
      await expect(page.locator("#root")).toHaveScreenshot(name);

      const portUrl = await mountPort(portPath("Toast"), props);
      await page.goto(portUrl);
      await waitForMockReady(page);
      await expect(page.locator("#root")).toHaveScreenshot(name);
    });
  }

  test("long body wraps rather than truncating — port matches the vendored bundle @component", async ({
    page,
  }) => {
    const props = {
      tone: "danger",
      children:
        "Your driver waited past the included grace period and the trip could not go ahead as booked.",
    };
    const name = "toast-long-body.png";

    const bundleUrl = await mountBundle("Toast", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Toast"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });
});

// ── Tooltip ───────────────────────────────────────────────────────────────────────

test.describe("Tooltip @component", () => {
  test("default (not shown) — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Fixed price, no surge", children: "Fixed price" };
    const name = "tooltip-default.png";

    const bundleUrl = await mountBundle("Tooltip", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Tooltip"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("shown (bundle only — see this file's header comment for the port-side gap) @component", async ({
    page,
  }) => {
    // placement="bottom", not the default "top": the harness's base page has no
    // margin above the mounted component (mock-harness.ts's own `baseStyle()`), so a
    // top-placed bubble (`bottom:calc(100% + 8px)`, pushing it *above* the trigger)
    // renders above the viewport's own top edge and gets clipped by the browser
    // itself — not a locator-cropping issue like Dialog's scrim above, an actual
    // off-screen position. Bottom placement keeps the bubble on-screen without
    // touching the shared harness.
    const props = { label: "Fixed price, no surge", children: "Fixed price", placement: "bottom" };

    const bundleUrl = await mountBundle("Tooltip", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    // The bubble centres itself on the trigger (`left:50%;transform:translateX(-50%)`)
    // and the harness's base page has no side margin at all — without room to one
    // side, half the bubble renders past the viewport's own left edge and gets
    // clipped, the same off-screen-not-cropped issue the placement choice above
    // avoids vertically.
    await page.evaluate(() => {
      document.body.style.paddingInlineStart = "160px";
    });
    await page.locator("#root .vt-tip").hover();
    // A full-page screenshot, not `#root`-scoped: `.vt-tip__bubble` is
    // `position:absolute`, which never enlarges `.vt-tip`'s (or #root's) own
    // layout box even though the bubble paints outside it — the same
    // fixed-positioning-collapses-the-box class of issue Dialog's `.vt-dialog__scrim`
    // ran into above, one level more subtle here since `#root` itself doesn't
    // report "not visible" (it still has the trigger button's own non-zero size),
    // it just silently crops the bubble out of frame.
    await expect(page).toHaveScreenshot("tooltip-shown.png");
  });
});

// ── Dialog ────────────────────────────────────────────────────────────────────────

// Dialog's outer `.vt-dialog__scrim` is `position:fixed;inset:0` — taken out of
// normal document flow, so `#root` (the element every other component's tests in
// this suite screenshot) collapses to a 0×0 box around it and Playwright's
// actionability check reports it "not visible." Every Dialog test below screenshots
// `.vt-dialog__scrim` directly instead — the one component in this batch that needs
// this, since it's the only one whose root visual element is fixed-positioned.
const SCRIM = "#root .vt-dialog__scrim";

test.describe("Dialog @component", () => {
  test("default (open) — port matches the vendored bundle @component", async ({ page }) => {
    const props = {
      open: true,
      title: "Cancel this booking?",
      subtitle: "This can't be undone.",
      children: "Your driver will be notified immediately.",
    };
    const name = "dialog-default.png";

    const bundleUrl = await mountBundle("Dialog", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator(SCRIM)).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Dialog"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator(SCRIM)).toHaveScreenshot(name);
  });

  test("size=sm — port matches the vendored bundle @component", async ({ page }) => {
    const props = { open: true, size: "sm", title: "Confirm", children: "Are you sure?" };
    const name = "dialog-sm.png";

    const bundleUrl = await mountBundle("Dialog", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator(SCRIM)).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Dialog"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator(SCRIM)).toHaveScreenshot(name);
  });

  test("size=lg — port matches the vendored bundle @component", async ({ page }) => {
    const props = { open: true, size: "lg", title: "Trip details", children: "18.4 km, 24 minutes." };
    const name = "dialog-lg.png";

    const bundleUrl = await mountBundle("Dialog", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator(SCRIM)).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Dialog"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator(SCRIM)).toHaveScreenshot(name);
  });

  test("focus (focus-trap on open) — port matches the vendored bundle @component", async ({ page }) => {
    // A static screenshot of a focused element inside the panel — the trap's actual
    // keyboard behaviour (Tab never leaves, focus returns to the trigger on close) is
    // proven by tests/integration/feedback-behaviour.spec.ts, not by a screenshot.
    const props = {
      open: true,
      title: "Cancel this booking?",
      children: "Your driver will be notified immediately.",
    };
    const name = "dialog-focus.png";

    const bundleUrl = await mountBundle("Dialog", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await page.locator("#root .vt-dialog").focus();
    await expect(page.locator(SCRIM)).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Dialog"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await page.locator("#root .vt-dialog").focus();
    await expect(page.locator(SCRIM)).toHaveScreenshot(name);
  });
});

// ── ProgressIndicator ─────────────────────────────────────────────────────────────

test.describe("ProgressIndicator @component", () => {
  test("default / loading — port matches the vendored bundle @component", async ({ page }) => {
    // This component *is* the loading affordance (Component State Matrix) — there is
    // no separate skeleton visual to diff (confirmed by reading `function
    // ProgressIndicator` directly), so Default and Loading collapse to one baseline,
    // matching the "no skeleton in source" treatment core.spec.ts's Avatar loading
    // tile already documents.
    const props = { value: 45, label: "Confirming your driver", valueLabel: "45%" };
    const name = "progressindicator-default.png";

    const bundleUrl = await mountBundle("ProgressIndicator", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("ProgressIndicator"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("error (failed step) — port matches the vendored bundle @component", async ({ page }) => {
    const props = { value: 100, tone: "danger", label: "Payment", valueLabel: "Failed" };
    const name = "progressindicator-error.png";

    const bundleUrl = await mountBundle("ProgressIndicator", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("ProgressIndicator"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("segmented — port matches the vendored bundle @component", async ({ page }) => {
    const props = { value: 3, segments: 4, label: "Booking steps" };
    const name = "progressindicator-segmented.png";

    const bundleUrl = await mountBundle("ProgressIndicator", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("ProgressIndicator"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("size=sm — port matches the vendored bundle @component", async ({ page }) => {
    const props = { value: 70, size: "sm", label: "Uploading photo" };
    const name = "progressindicator-sm.png";

    const bundleUrl = await mountBundle("ProgressIndicator", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("ProgressIndicator"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("tone=inverse — port matches the vendored bundle @component", async ({ page }) => {
    const props = { value: 60, inverse: true, label: "Matching a driver", valueLabel: "60%" };
    const name = "progressindicator-inverse.png";

    const bundleUrl = await mountBundle("ProgressIndicator", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await withDarkBackground(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("ProgressIndicator"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await withDarkBackground(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });
});
