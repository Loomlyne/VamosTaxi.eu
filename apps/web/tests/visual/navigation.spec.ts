// apps/web/tests/visual/navigation.spec.ts
//
// Screenshot-diff baselines for the navigation trio (Tabs, StepIndicator,
// SectionHeader — Plan 10). Same uniform strategy core.spec.ts (Plan 06) and
// forms.spec.ts (Plan 09) already established: every component diffed `mountPort`
// (the React port) against `mountBundle` (the vendored design-system source,
// reference-only per D-30), regardless of whether a real `.dc.html` mock happens to
// reference it — hunting down one exact live mock usage per component adds no
// meaningful coverage over the bundle comparison both prior batches already settled
// on (see core.spec.ts's own header comment for the full reasoning).
//
// States covered follow the Component State Matrix rows exactly (01-UI-SPEC.md):
//   Tabs           — Default, Hover, Focus, Selected, Disabled* (per-tab)
//   StepIndicator  — Default (done/current/todo together), Selected (current step),
//                     Error (invalid step)
//   SectionHeader  — Default only (typographic composition, no interaction states of
//                     its own); variant permutations (level, tone, action link) are
//                     screenshotted anyway, matching Badge/Card's own precedent in
//                     core.spec.ts of diffing every real CSS branch even when the
//                     matrix marks it a "variant," not an "interaction state."
//
// All three components' CSS carries no `@media` breakpoint rule (confirmed by
// reading every extracted .css file at port time) — the Fidelity Contract's
// reduced-viewport allowance (1440/390 only) applies uniformly here, same as
// core.spec.ts/forms.spec.ts.

import { test, expect, type Page, type Locator } from "../support/test";
import { mountBundle, mountPort, waitForMockReady } from "../support/mock-harness";

const REDUCED_VIEWPORT_PROJECTS = new Set(["component-1440", "component-390"]);

function portPath(name: string): string {
  return `apps/web/components/navigation/${name}.tsx`;
}

type InteractionState = "default" | "hover" | "focus" | "disabled";

async function applyState(page: Page, locator: Locator, state: InteractionState): Promise<void> {
  switch (state) {
    case "hover":
      await locator.hover();
      return;
    case "focus":
      await locator.focus();
      return;
    case "default":
    case "disabled":
      return; // "disabled" is a static prop, not an interaction — nothing to simulate.
  }
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

// ── Tabs ──────────────────────────────────────────────────────────────────────────

test.describe("Tabs @component", () => {
  const ITEMS = ["Airport", "Hotel", "Custom"];

  test("default (unselected) — port matches the vendored bundle @component", async ({ page }) => {
    const props = { items: ITEMS };
    const name = "tabs-default.png";

    const bundleUrl = await mountBundle("Tabs", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Tabs"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("selected — port matches the vendored bundle @component", async ({ page }) => {
    const props = { items: ITEMS, value: "Hotel" };
    const name = "tabs-selected.png";

    const bundleUrl = await mountBundle("Tabs", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Tabs"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  const STATES: Array<"hover" | "focus"> = ["hover", "focus"];
  for (const state of STATES) {
    test(`${state} — port matches the vendored bundle @component`, async ({ page }) => {
      const props = { items: ITEMS, value: "Hotel" };
      const name = `tabs-${state}.png`;

      const bundleUrl = await mountBundle("Tabs", props);
      await page.goto(bundleUrl);
      await waitForMockReady(page);
      const bundleTab = page.locator("#root .vt-tab").first();
      await applyState(page, bundleTab, state);
      await expect(page.locator("#root")).toHaveScreenshot(name);

      const portUrl = await mountPort(portPath("Tabs"), props);
      await page.goto(portUrl);
      await waitForMockReady(page);
      const portTab = page.locator("#root .vt-tab").first();
      await applyState(page, portTab, state);
      await expect(page.locator("#root")).toHaveScreenshot(name);
    });
  }

  test("disabled per-tab (Rule 2 addition, port only — see Tabs.tsx) @component", async ({ page }) => {
    // No meaningful bundle counterpart: the compiled `function Tabs` accepts an
    // object-shaped item (`{value, label, icon}`) without crashing, but has no
    // `disabled` concept at all (confirmed by reading it directly) — it silently
    // ignores the field and renders every tab as a normal, clickable button, with
    // none of the `.vt-tab--disabled` styling (opacity, `pointer-events:none`,
    // native `disabled` attribute) the port adds. A bundle-vs-port diff here would
    // therefore be a real, expected mismatch, not a harness bug — same "single-sided
    // screenshot baseline" treatment forms.spec.ts's own Checkbox indeterminate/
    // invalid Rule 2 additions get.
    const props = {
      items: [
        { value: "economy", label: "Economy" },
        { value: "business", label: "Business" },
        { value: "van", label: "Van", disabled: true },
      ],
      value: "economy",
    };

    const portUrl = await mountPort(portPath("Tabs"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("tabs-disabled.png");
  });

  test("variant=underline — port matches the vendored bundle @component", async ({ page }) => {
    const props = { variant: "underline", items: ITEMS, value: "Hotel" };
    const name = "tabs-underline.png";

    const bundleUrl = await mountBundle("Tabs", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Tabs"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });
});

// ── StepIndicator ─────────────────────────────────────────────────────────────────
//
// No hover/press/focus row in the Component State Matrix — StepIndicator has no
// interaction states of its own (confirmed by reading `function StepIndicator`
// directly: every visual branch is derived purely from `current`/`error`, both
// static props). "Selected" (the current step) is already visible in the default
// fixture below, since a step flow with more than one step always has exactly one
// current step by construction — no separate screenshot needed to prove that combo
// exists.

test.describe("StepIndicator @component", () => {
  test("default (done / current / todo together) — port matches the vendored bundle @component", async ({
    page,
  }) => {
    const props = { steps: ["Trip", "Vehicle", "Payment", "Confirm"], current: 1 };
    const name = "stepindicator-default.png";

    const bundleUrl = await mountBundle("StepIndicator", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("StepIndicator"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("error (Rule 2 addition, port only — see StepIndicator.tsx) @component", async ({ page }) => {
    // No bundle counterpart: the compiled `function StepIndicator` (design-
    // system/_ds_bundle.js) treats every `steps` entry as a raw string used
    // directly as both the React key and the rendered label — confirmed directly
    // (and the hard way: passing this test's object-shaped `steps` array through
    // `mountBundle` throws "Objects are not valid as a React child" and leaves
    // `#root` empty, since the bundle has no `{ label, error }` item shape at all).
    // Same "single-sided screenshot baseline" treatment forms.spec.ts's own
    // Checkbox indeterminate/invalid Rule 2 additions get.
    const props = {
      steps: [{ label: "Trip" }, { label: "Vehicle", error: true }, { label: "Payment" }],
      current: 1,
    };

    const portUrl = await mountPort(portPath("StepIndicator"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("stepindicator-error.png");
  });
});

// ── SectionHeader ─────────────────────────────────────────────────────────────────
//
// Default only per the Component State Matrix (typographic composition, no
// interaction states of its own) — the level/tone/action-link permutations below are
// real CSS branches worth their own baseline anyway, the same "screenshot every
// variant even though the matrix calls it a variant, not a state" precedent Badge's
// seven tones already set in core.spec.ts.

test.describe("SectionHeader @component", () => {
  test("default — port matches the vendored bundle @component", async ({ page }) => {
    const props = { eyebrow: "Booking", title: "Your transfer", subtitle: "Fixed price, no surge." };
    const name = "sectionheader-default.png";

    const bundleUrl = await mountBundle("SectionHeader", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("SectionHeader"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("with action link — port matches the vendored bundle @component", async ({ page }) => {
    const props = { title: "Recent bookings", actionLabel: "View all" };
    const name = "sectionheader-action-link.png";

    const bundleUrl = await mountBundle("SectionHeader", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("SectionHeader"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("tone=inverse — port matches the vendored bundle @component", async ({ page }) => {
    const props = { title: "Departure", eyebrow: "Airport", tone: "inverse" };
    const name = "sectionheader-inverse.png";

    const bundleUrl = await mountBundle("SectionHeader", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await page.evaluate(() => {
      document.body.style.background = "#1E1F1F";
    });
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("SectionHeader"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await page.evaluate(() => {
      document.body.style.background = "#1E1F1F";
    });
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });
});
