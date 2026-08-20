// apps/web/tests/visual/button.spec.ts
//
// The first screenshot-diff spec (D-25) — proof the harness in
// apps/web/tests/support/mock-harness.ts works end-to-end, offline, before the remaining
// 32 components' specs land with their own port batches (Plans 06-09).
//
// Two comparisons, deliberately different in what they prove:
//
//   1. "default state, mock vs port" renders the actual `.dc.html` mock
//      (app/home/CookieBanner.dc.html, served CDN-free through `serveMock`) and diffs its
//      real "Accept all" button against the React port with the same props — this is the
//      harder, riskier half of the rig (rewriting a live mock's CDN script tags, running
//      the whole dc-runtime + Babel-in-browser + `_ds_bundle.js` offline) and is the
//      Fidelity Contract's actual source of truth (01-UI-SPEC.md: "never
//      design-system/_ds_bundle.js read as prose").
//
//   2. The state matrix (default/hover/press/focus/disabled x primary/ghost) diffs the
//      port against `mountBundle('Button', props)` — the same underlying bundle a mock's
//      `x-import` resolves to, rendered directly, so state simulation (real Playwright
//      hover/mouse-down/focus, not a scripted event) isn't coupled to hunting for a
//      conveniently ungated live instance of every state in some mock page. Icon-bearing
//      Button usages are avoided everywhere in this spec on purpose: Button.tsx's `icon`/
//      `iconEnd` slots are still a no-op placeholder until the primitives batch ports
//      `Icon` (Plan 06) — comparing an icon-bearing mock button against an icon-less port
//      button would be a real, expected, unrelated diff, not a harness bug.
//
// Both viewport-reduced to 1440/390: Button's CSS has no media query or responsive rule
// (fixed control height per size prop, intrinsic pill width) — the Fidelity Contract
// explicitly allows a component whose layout does not change across breakpoints to skip
// the middle two breakpoints (01-UI-SPEC.md § Component Port Fidelity Contract,
// "Viewports" row).

import { test, expect, type Page, type Locator } from "@playwright/test";
import { serveMock, mountPort, mountBundle, waitForMockReady } from "../support/mock-harness";

const REDUCED_VIEWPORT_PROJECTS = new Set(["component-1440", "component-390"]);
const PORT_COMPONENT = "apps/web/components/core/Button.tsx";

type InteractionState = "default" | "hover" | "press" | "focus" | "disabled";

async function applyState(page: Page, locator: Locator, state: InteractionState): Promise<void> {
  switch (state) {
    case "hover":
      await locator.hover();
      return;
    case "press":
      await locator.hover();
      await page.mouse.down();
      return;
    case "focus":
      await locator.focus();
      return;
    case "default":
    case "disabled":
      return; // "disabled" is a static prop, not an interaction — nothing to simulate.
  }
}

async function resetState(page: Page, state: InteractionState): Promise<void> {
  if (state === "press") await page.mouse.up();
}

test.describe("Button @component", () => {
  // D-25 as amended / RESEARCH Open Question 3: the whole point of vendoring React/
  // ReactDOM/Babel is that this suite makes no request to a package CDN. Asserted, not
  // just arranged — any request whose host isn't this run's own local harness server
  // fails the test outright, so a future regression (a mock accidentally reverting to
  // its unpkg script tag, a typo in the vendor map) is caught here rather than by
  // trusting the absence of a network log line.
  const externalRequests: string[] = [];

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      !REDUCED_VIEWPORT_PROJECTS.has(testInfo.project.name),
      "Button's CSS has no responsive rule — Fidelity Contract allows the reduced 1440/390 set.",
    );
    externalRequests.length = 0;
    page.on("request", (request) => {
      const url = new URL(request.url());
      const isLocal =
        url.protocol === "data:" ||
        url.hostname === "127.0.0.1" ||
        url.hostname === "localhost";
      if (!isLocal) externalRequests.push(request.url());
    });
  });

  test.afterEach(() => {
    expect(
      externalRequests,
      `no request in this suite may leave localhost (D-25/D-31) — saw: ${externalRequests.join(", ")}`,
    ).toEqual([]);
  });

  test("default state matches the CookieBanner mock end-to-end @component", async ({
    page,
  }, testInfo) => {
    // Desktop only. CookieBanner.dc.html's own container CSS
    // (`@media (min-width:640px){[data-ck-acts]{flex-direction:row;...}}`) makes the
    // *mock's* embedded "Accept all" stretch full-width below 640px — a real,
    // container-driven layout difference that belongs to CookieBanner, not to Button
    // (whose own CSS carries no media query, confirmed by reading Button.css). The
    // isolated `mountPort` render has no such surrounding container, so this specific
    // "diff a real mock instance" comparison is only apples-to-apples at the viewport
    // where the container doesn't override the button's intrinsic width. The
    // state-matrix tests below stay at both 1440 and 390 — neither side there sits
    // inside any container, so no such distortion applies.
    test.skip(
      testInfo.project.name !== "component-1440",
      "CookieBanner's own responsive container CSS changes the mock button's width below 640px — not a Button-component regression to diff at 390.",
    );

    const mockUrl = await serveMock("app/home/CookieBanner.dc.html");
    await page.goto(mockUrl);
    await waitForMockReady(page);
    const mockButton = page.locator(".vt-btn.vt-btn--primary");
    await expect(mockButton).toBeVisible();
    // Unique snapshot name — distinct from the state-matrix test's own
    // "button-primary-md-default.png" below, which renders different label text
    // ("Vamos" vs this test's real "Accept all") and would otherwise collide on the
    // same file path (Playwright keys a screenshot baseline by test file + snapshot
    // name + project, not by test title).
    await expect(mockButton).toHaveScreenshot("button-primary-md-default-cookie-banner-mock.png");

    const portUrl = await mountPort(PORT_COMPONENT, {
      variant: "primary",
      size: "md",
      children: "Accept all",
    });
    await page.goto(portUrl);
    await waitForMockReady(page);
    const portButton = page.locator("#root .vt-btn");
    await expect(portButton).toHaveScreenshot("button-primary-md-default-cookie-banner-mock.png");
  });

  const VARIANTS = ["primary", "ghost"] as const;
  const STATES: InteractionState[] = ["default", "hover", "press", "focus", "disabled"];

  for (const variant of VARIANTS) {
    for (const state of STATES) {
      test(`${variant} / ${state} — port matches the vendored bundle @component`, async ({
        page,
      }) => {
        const props = {
          variant,
          size: "md",
          disabled: state === "disabled",
          children: "Vamos",
        };
        const snapshotName = `button-${variant}-md-${state}.png`;

        const bundleUrl = await mountBundle("Button", props);
        await page.goto(bundleUrl);
        await waitForMockReady(page);
        const bundleButton = page.locator("#root .vt-btn");
        await expect(bundleButton).toBeVisible();
        try {
          await applyState(page, bundleButton, state);
          await expect(bundleButton).toHaveScreenshot(snapshotName);
        } finally {
          await resetState(page, state);
        }

        const portUrl = await mountPort(PORT_COMPONENT, props);
        await page.goto(portUrl);
        await waitForMockReady(page);
        const portButton = page.locator("#root .vt-btn");
        try {
          await applyState(page, portButton, state);
          await expect(portButton).toHaveScreenshot(snapshotName);
        } finally {
          await resetState(page, state);
        }
      });
    }
  }
});
