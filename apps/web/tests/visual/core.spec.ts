// apps/web/tests/visual/core.spec.ts
//
// Screenshot-diff baselines for the eight core primitives Plan 06 adds alongside
// Button (Button already has its own committed spec — tests/visual/button.spec.ts,
// Plan 03 — and is deliberately not re-tested here to avoid a duplicate/competing
// baseline set for the same component).
//
// Every component in this file is diffed `mountPort` (the React port) against
// `mountBundle` (the vendored design-system source, D-30 reference-only) — the same
// half of button.spec.ts's own strategy COMPONENTS_WITHOUT_MOCK_USAGE already uses,
// applied here to all eight for consistency, since hunting down one exact
// icon/asset-bearing real `.dc.html` usage per component would not add meaningfully
// more coverage than the bundle comparison already gives (both sides render from the
// identical vendored SVG/PNG assets — verified byte-identical against the top-level
// `assets/` tree at port time, see 01-06-SUMMARY.md).
//
// Interaction states (hover/press/focus) are simulated with real Playwright
// pseudo-class triggers exactly as button.spec.ts established — CSS `:hover`/
// `:active`/`:focus-visible` apply to any rendered DOM regardless of React
// hydration, so this works even though `mountPort` serves static, non-hydrated
// markup (see this file's Avatar section for the one place that distinction
// actually matters).
//
// All eight components' CSS carries no `@media` breakpoint rule (confirmed by
// reading every extracted .css file at port time) — the Fidelity Contract's
// reduced-viewport allowance (1440/390 only) applies uniformly here, the same as
// Button's own spec.

import { test, expect, type Page, type Locator } from "@playwright/test";
import { mountBundle, mountPort, waitForMockReady } from "../support/mock-harness";

const REDUCED_VIEWPORT_PROJECTS = new Set(["component-1440", "component-390"]);

function portPath(name: string): string {
  return `apps/web/components/core/${name}.tsx`;
}

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
      return;
  }
}

async function resetState(page: Page, state: InteractionState): Promise<void> {
  if (state === "press") await page.mouse.up();
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
  testInfo.attach("external-request-guard", { body: "" }).catch(() => {});
  (page as unknown as { __externalRequests: string[] }).__externalRequests = externalRequests;
});

test.afterEach(async ({ page }) => {
  const externalRequests = (page as unknown as { __externalRequests?: string[] }).__externalRequests ?? [];
  expect(
    externalRequests,
    `no request in this suite may leave localhost (D-25/D-31) — saw: ${externalRequests.join(", ")}`,
  ).toEqual([]);
});

// ── Icon ──────────────────────────────────────────────────────────────────────────

test.describe("Icon @component", () => {
  test("default — port matches the vendored bundle @component", async ({ page }) => {
    const props = { name: "car-front", size: 24 };

    const bundleUrl = await mountBundle("Icon", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("icon-default.png");

    const portUrl = await mountPort(portPath("Icon"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("icon-default.png");
  });
});

// ── Logo ──────────────────────────────────────────────────────────────────────────

test.describe("Logo @component", () => {
  const VARIANTS = [
    { variant: "primary", form: "wordmark", name: "logo-primary-wordmark.png" },
    { variant: "reversed", form: "mark", name: "logo-reversed-mark.png" },
  ] as const;

  for (const { variant, form, name } of VARIANTS) {
    test(`${variant}/${form} — port matches the vendored bundle @component`, async ({ page }) => {
      const props = { variant, form, height: 40 };

      const bundleUrl = await mountBundle("Logo", props);
      await page.goto(bundleUrl);
      await waitForMockReady(page);
      await expect(page.locator("#root")).toHaveScreenshot(name);

      const portUrl = await mountPort(portPath("Logo"), props);
      await page.goto(portUrl);
      await waitForMockReady(page);
      await expect(page.locator("#root")).toHaveScreenshot(name);
    });
  }
});

// ── CheckerMark ───────────────────────────────────────────────────────────────────

test.describe("CheckerMark @component", () => {
  test("default — port matches the vendored bundle @component", async ({ page }) => {
    const props = { size: 48 };

    const bundleUrl = await mountBundle("CheckerMark", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("checkermark-default.png");

    const portUrl = await mountPort(portPath("CheckerMark"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("checkermark-default.png");
  });
});

// ── Avatar ────────────────────────────────────────────────────────────────────────
//
// NOTE (see 01-06-SUMMARY.md § Deviations / Known Stubs): only the two states below
// that need no client hydration are diffed here. `mountPort` renders fully static
// markup with no client-side script — Avatar's Rule 2 onError/mount-effect fallback
// (the addition that makes "empty image source" and "failed image source" both
// resolve to the initials monogram, never a broken-image glyph) never executes in
// that harness, so an "error" or "loading" screenshot taken through mountPort would
// not actually exercise the behaviour it claims to test. That behaviour was verified
// directly against a real `next build` + `opennextjs-cloudflare preview` server
// during this plan's execution (confirmed: a same-origin 404 image resolves to the
// initials fallback, never a broken image) but is not covered by a committed,
// repeatable test — recorded in .planning/WINDOWS.md as an unrun-verify follow-up.
test.describe("Avatar @component", () => {
  test("default (image) — port matches the vendored bundle @component", async ({ page }) => {
    const props = { name: "Anna Keller", src: "/assets/photography/fleet-van-street.jpg" };

    const bundleUrl = await mountBundle("Avatar", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("avatar-default-image.png");

    const portUrl = await mountPort(portPath("Avatar"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("avatar-default-image.png");
  });

  test("default (initials) — port matches the vendored bundle @component", async ({ page }) => {
    const props = { name: "Jonas Meier" };

    const bundleUrl = await mountBundle("Avatar", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("avatar-default-initials.png");

    const portUrl = await mountPort(portPath("Avatar"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("avatar-default-initials.png");
  });

  test("empty — port matches the vendored bundle @component", async ({ page }) => {
    const props = {};

    const bundleUrl = await mountBundle("Avatar", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("avatar-empty.png");

    const portUrl = await mountPort(portPath("Avatar"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("avatar-empty.png");
  });
});

// ── Badge ─────────────────────────────────────────────────────────────────────────

test.describe("Badge @component", () => {
  const TONES = ["neutral", "accent", "success", "danger", "info", "inverse", "outline"] as const;

  for (const tone of TONES) {
    test(`tone=${tone} — port matches the vendored bundle @component`, async ({ page }) => {
      const props = { tone, children: "Label" };
      const name = `badge-${tone}.png`;

      const bundleUrl = await mountBundle("Badge", props);
      await page.goto(bundleUrl);
      await waitForMockReady(page);
      await expect(page.locator("#root")).toHaveScreenshot(name);

      const portUrl = await mountPort(portPath("Badge"), props);
      await page.goto(portUrl);
      await waitForMockReady(page);
      await expect(page.locator("#root")).toHaveScreenshot(name);
    });
  }
});

// ── Card ──────────────────────────────────────────────────────────────────────────

test.describe("Card @component", () => {
  test("default — port matches the vendored bundle @component", async ({ page }) => {
    const props = { padding: "md", children: "Card" };

    const bundleUrl = await mountBundle("Card", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("card-default.png");

    const portUrl = await mountPort(portPath("Card"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("card-default.png");
  });

  test("selected — port matches the vendored bundle @component", async ({ page }) => {
    const props = { padding: "md", selectable: true, selected: true, children: "Card" };

    const bundleUrl = await mountBundle("Card", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("card-selected.png");

    const portUrl = await mountPort(portPath("Card"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("card-selected.png");
  });

  const CARD_STATES: Array<"hover" | "focus"> = ["hover", "focus"];
  for (const state of CARD_STATES) {
    test(`selectable / ${state} — port matches the vendored bundle @component`, async ({ page }) => {
      const props = { padding: "md", selectable: true, children: "Card" };
      const name = `card-selectable-${state}.png`;

      const bundleUrl = await mountBundle("Card", props);
      await page.goto(bundleUrl);
      await waitForMockReady(page);
      const bundleCard = page.locator("#root .vt-card");
      await applyState(page, bundleCard, state);
      await expect(page.locator("#root")).toHaveScreenshot(name);

      const portUrl = await mountPort(portPath("Card"), props);
      await page.goto(portUrl);
      await waitForMockReady(page);
      const portCard = page.locator("#root .vt-card");
      await applyState(page, portCard, state);
      await expect(page.locator("#root")).toHaveScreenshot(name);
    });
  }
});

// ── IconButton ────────────────────────────────────────────────────────────────────
//
// "Selected" is intentionally absent — see IconButton.tsx's own note: neither the
// compiled source nor the real header mock (a bespoke [data-hd-bell], not built from
// IconButton) has a selected/pressed prop or CSS rule to diff.

test.describe("IconButton @component", () => {
  const STATES: InteractionState[] = ["default", "hover", "press", "focus", "disabled"];

  for (const state of STATES) {
    test(`${state} — port matches the vendored bundle @component`, async ({ page }) => {
      const props = { icon: "bell", label: "Notifications", disabled: state === "disabled" };
      const name = `iconbutton-${state}.png`;

      const bundleUrl = await mountBundle("IconButton", props);
      await page.goto(bundleUrl);
      await waitForMockReady(page);
      const bundleBtn = page.locator("#root .vt-iconbtn");
      try {
        await applyState(page, bundleBtn, state);
        await expect(page.locator("#root")).toHaveScreenshot(name);
      } finally {
        await resetState(page, state);
      }

      const portUrl = await mountPort(portPath("IconButton"), props);
      await page.goto(portUrl);
      await waitForMockReady(page);
      const portBtn = page.locator("#root .vt-iconbtn");
      try {
        await applyState(page, portBtn, state);
        await expect(page.locator("#root")).toHaveScreenshot(name);
      } finally {
        await resetState(page, state);
      }
    });
  }
});

// ── Tag ───────────────────────────────────────────────────────────────────────────
//
// Hover/press/focus are all "—" (not applicable) on Tag's Component State Matrix
// row — only Default, Selected (active) and Disabled are real states here.

test.describe("Tag @component", () => {
  test("default — port matches the vendored bundle @component", async ({ page }) => {
    const props = { children: "Airport" };

    const bundleUrl = await mountBundle("Tag", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("tag-default.png");

    const portUrl = await mountPort(portPath("Tag"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("tag-default.png");
  });

  test("selected (active) — port matches the vendored bundle @component", async ({ page }) => {
    // `onClick` cannot cross the mountPort/mountBundle boundary as a serialisable
    // prop (both render from a props object that only carries JSON-safe values);
    // `active` alone reaches the `.vt-tag--active` class this state actually
    // renders — the same tone the gallery's "selected (active filter)" tile shows.
    const props = { active: true, children: "Active filter" };

    const bundleUrl = await mountBundle("Tag", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("tag-selected.png");

    const portUrl = await mountPort(portPath("Tag"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("tag-selected.png");
  });
});
