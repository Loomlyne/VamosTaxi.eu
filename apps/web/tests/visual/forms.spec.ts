// apps/web/tests/visual/forms.spec.ts
//
// Screenshot-diff baselines for the eight form controls this plan ports (Input,
// Textarea, Select, Checkbox, Radio, Switch, Counter, DatePicker), following
// core.spec.ts's own established shape (Plan 06): every component diffed
// `mountPort` (the React port) against `mountBundle` (the vendored design-system
// source, D-30 reference-only) for every state its Component State Matrix row
// marks. DatePicker has no `.dc.html` mock usage anywhere in `app/` (confirmed by
// the existing `COMPONENTS_WITHOUT_MOCK_USAGE` audit in mock-harness.ts, Plan 06) —
// diffed against the bundle the same way as the other seven, for the same
// consistency reason core.spec.ts's own header comment gives for using
// mountPort-vs-mountBundle uniformly rather than hunting a real `.dc.html` usage
// per component.
//
// None of the eight extracted .css files carry a viewport `@media` rule (confirmed
// by reading every file at port time — Select.css and DatePicker.css each carry
// only a `prefers-reduced-motion` query, not a breakpoint) — the Fidelity
// Contract's reduced-viewport allowance (1440/390 only) applies uniformly here,
// same as core.spec.ts.
//
// A REAL METHODOLOGY GAP, found and worked around here (see `focusTextField`
// below): Input/Textarea/Select's focused-border treatment is React state (a
// `useState` toggling the wrapper's `.vt-input--focus` class via onFocus/onBlur —
// Law 01's text-input focus exception), not a native CSS `:focus-visible`
// pseudo-class. `mountPort` renders fully static, non-hydrated markup (mock-
// harness.ts's own header comment), so a real `locator.focus()` there never fires
// that handler and the class never appears — the same class of gap 01-06-SUMMARY.md
// documents for Avatar's onError fallback. `mountBundle`, by contrast, boots real
// client-side React (`ReactDOM.createRoot(...).render(...)`), so a real focus()
// there DOES work. `focusTextField` compensates only on the port side by adding the
// class directly — verifying the CSS rule's own visual outcome (the actual
// regression risk Law 01 cares about: does `.vt-input.vt-input--focus` really
// produce `box-shadow:none`, not `var(--vt-ring)`), while the separate onFocus/
// onBlur wiring that adds the class in the real hydrated app is covered by
// Input.tsx/Textarea.tsx/Select.tsx's own committed source (the chained-handlers
// Rule 1 fix, Task 1) and by this plan's own German/Arabic manual pass against the
// real opennextjs-cloudflare preview server. Checkbox/Radio/Switch/Counter/
// DatePicker's own focus treatment is a genuine `:focus-visible` pseudo-class (on
// the native input/button itself, or a sibling selector keyed off it), which needs
// no such workaround — real `locator.focus()` works identically on both sides.
//
// DatePicker's `open` calendar-panel state is the same kind of React-state gap
// (internal `useState`, no controlled prop) with no CSS-only workaround available —
// it is not screenshot-tested here; recorded in .planning/WINDOWS.md as an
// unrun-verify follow-up, same treatment as Avatar's onError.

import { test, expect, type Page } from "@playwright/test";
import { mountBundle, mountPort, waitForMockReady } from "../support/mock-harness";
import enMessages from "../../i18n/messages/en.json";

const REDUCED_VIEWPORT_PROJECTS = new Set(["component-1440", "component-390"]);

function portPath(name: string): string {
  return `apps/web/components/forms/${name}.tsx`;
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    !REDUCED_VIEWPORT_PROJECTS.has(testInfo.project.name),
    "None of this batch's CSS carries a viewport breakpoint rule — Fidelity Contract allows the reduced 1440/390 set.",
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

/** See this file's header comment. Only needed for the text-field focus exception
 *  trio (Input/Textarea/Select) — real `:focus-visible`-driven controls (Checkbox,
 *  Radio, Switch, Counter, DatePicker's field) need only `locator.focus()`. */
async function focusTextField(
  page: Page,
  wrapperSelector: string,
  innerSelector: string,
  isPort: boolean,
): Promise<void> {
  await page.locator(innerSelector).focus();
  if (isPort) {
    await page
      .locator(wrapperSelector)
      .evaluate((el) => el.classList.add("vt-input--focus"));
  }
}

// ── Input ─────────────────────────────────────────────────────────────────────────

test.describe("Input @component", () => {
  test("default — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Pickup address", placeholder: "Zurich Airport (ZRH)" };

    const bundleUrl = await mountBundle("Input", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("input-default.png");

    const portUrl = await mountPort(portPath("Input"), props, { messages: enMessages });
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("input-default.png");
  });

  test("hover — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Pickup address", placeholder: "Zurich Airport (ZRH)" };
    const name = "input-hover.png";

    const bundleUrl = await mountBundle("Input", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await page.locator("#root .vt-input").hover();
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Input"), props, { messages: enMessages });
    await page.goto(portUrl);
    await waitForMockReady(page);
    await page.locator("#root .vt-input").hover();
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("focus (Law 01 exception — border only, no ring) — port matches the vendored bundle @component", async ({
    page,
  }) => {
    const props = { label: "Pickup address", placeholder: "Zurich Airport (ZRH)" };
    const name = "input-focus.png";

    const bundleUrl = await mountBundle("Input", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await focusTextField(page, "#root .vt-input", "#root input", false);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Input"), props, { messages: enMessages });
    await page.goto(portUrl);
    await waitForMockReady(page);
    await focusTextField(page, "#root .vt-input", "#root input", true);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("disabled — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Reference", defaultValue: "VT-4821", disabled: true };
    const name = "input-disabled.png";

    const bundleUrl = await mountBundle("Input", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Input"), props, { messages: enMessages });
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("error (hint suppressed) — port matches the vendored bundle @component", async ({ page }) => {
    const props = {
      label: "Email",
      defaultValue: "not-an-email",
      hint: "We'll send your confirmation here",
      error: "Check the email address",
    };
    const name = "input-error.png";

    const bundleUrl = await mountBundle("Input", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Input"), props, { messages: enMessages });
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });
});

// ── Textarea ──────────────────────────────────────────────────────────────────────

test.describe("Textarea @component", () => {
  test("default — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Special instructions", placeholder: "Meet at arrivals, gate 3" };

    const bundleUrl = await mountBundle("Textarea", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("textarea-default.png");

    const portUrl = await mountPort(portPath("Textarea"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("textarea-default.png");
  });

  test("hover — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Special instructions", placeholder: "Meet at arrivals, gate 3" };
    const name = "textarea-hover.png";

    const bundleUrl = await mountBundle("Textarea", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await page.locator("#root .vt-input").hover();
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Textarea"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await page.locator("#root .vt-input").hover();
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("focus (Law 01 exception) — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Special instructions", placeholder: "Meet at arrivals, gate 3" };
    const name = "textarea-focus.png";

    const bundleUrl = await mountBundle("Textarea", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await focusTextField(page, "#root .vt-input", "#root textarea", false);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Textarea"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await focusTextField(page, "#root .vt-input", "#root textarea", true);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("disabled — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Internal note", defaultValue: "Reviewed 12 Aug", disabled: true };
    const name = "textarea-disabled.png";

    const bundleUrl = await mountBundle("Textarea", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Textarea"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("error (hint suppressed) — port matches the vendored bundle @component", async ({ page }) => {
    const props = {
      label: "Cancellation reason",
      hint: "Helps us improve",
      error: "Tell us why you're cancelling",
    };
    const name = "textarea-error.png";

    const bundleUrl = await mountBundle("Textarea", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Textarea"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });
});

// ── Select ────────────────────────────────────────────────────────────────────────

test.describe("Select @component", () => {
  const VEHICLE_OPTIONS = ["Economy", "Business", "Van"];

  test("default (placeholder) — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Vehicle class", placeholder: "Choose a class", options: VEHICLE_OPTIONS };

    const bundleUrl = await mountBundle("Select", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("select-default.png");

    const portUrl = await mountPort(portPath("Select"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("select-default.png");
  });

  test("selected — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Vehicle class", options: VEHICLE_OPTIONS, defaultValue: "Business" };
    const name = "select-selected.png";

    const bundleUrl = await mountBundle("Select", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Select"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("focus (Law 01 exception) — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Vehicle class", placeholder: "Choose a class", options: VEHICLE_OPTIONS };
    const name = "select-focus.png";

    const bundleUrl = await mountBundle("Select", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await focusTextField(page, "#root .vt-input", "#root select", false);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Select"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await focusTextField(page, "#root .vt-input", "#root select", true);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("disabled — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Currency", options: ["CHF"], defaultValue: "CHF", disabled: true };
    const name = "select-disabled.png";

    const bundleUrl = await mountBundle("Select", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Select"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("error (hint suppressed) — port matches the vendored bundle @component", async ({ page }) => {
    const props = {
      label: "Payment method",
      placeholder: "Choose a method",
      options: ["Card", "Twint"],
      hint: "Charged only after you confirm",
      error: "Choose a payment method",
    };
    const name = "select-error.png";

    const bundleUrl = await mountBundle("Select", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Select"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("loading (Rule 2 addition, port only — see Select.tsx) @component", async ({ page }) => {
    // Port only, same reasoning as DatePicker's disabled/error/loading below: the
    // compiled `function Select` signature has no `loading` param (confirmed by
    // reading the source directly, and by Select.tsx's own header comment) — a
    // `loading` prop passed to mountBundle lands in its `...rest` spread as a
    // harmless, invisible DOM attribute rather than toggling any visual state, so
    // there is nothing meaningful on the bundle side to diff against.
    const props = { label: "Airport", placeholder: "Loading airports…", loading: true };

    const portUrl = await mountPort(portPath("Select"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("select-loading.png");
  });
});

// ── Checkbox ──────────────────────────────────────────────────────────────────────

test.describe("Checkbox @component", () => {
  test("default (unchecked) — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Meet & greet" };

    const bundleUrl = await mountBundle("Checkbox", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("checkbox-default.png");

    const portUrl = await mountPort(portPath("Checkbox"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("checkbox-default.png");
  });

  test("hover — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Meet & greet" };
    const name = "checkbox-hover.png";

    const bundleUrl = await mountBundle("Checkbox", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await page.locator("#root .vt-check").hover();
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Checkbox"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await page.locator("#root .vt-check").hover();
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("focus — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Meet & greet" };
    const name = "checkbox-focus.png";

    const bundleUrl = await mountBundle("Checkbox", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await page.locator("#root .vt-check input").focus();
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Checkbox"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await page.locator("#root .vt-check input").focus();
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("checked — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Meet & greet", checked: true };
    const name = "checkbox-checked.png";

    const bundleUrl = await mountBundle("Checkbox", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Checkbox"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("indeterminate (Rule 2 addition, port only — see Checkbox.tsx) @component", async ({ page }) => {
    // No bundle counterpart: the compiled source has no indeterminate concept at
    // all (confirmed by reading `function Checkbox` directly), so there is nothing
    // to diff against here — a single-sided screenshot baseline, same treatment
    // Select.css's own Rule 2 loading addition gets no bundle comparison for.
    const props = { label: "Select all extras", indeterminate: true };

    const portUrl = await mountPort(portPath("Checkbox"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("checkbox-indeterminate.png");
  });

  test("invalid (Rule 2 addition, port only — see Checkbox.tsx) @component", async ({ page }) => {
    const props = { label: "Accept the terms", invalid: true };

    const portUrl = await mountPort(portPath("Checkbox"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("checkbox-invalid.png");
  });

  test("disabled — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Priority boarding", disabled: true };
    const name = "checkbox-disabled.png";

    const bundleUrl = await mountBundle("Checkbox", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Checkbox"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });
});

// ── Radio ─────────────────────────────────────────────────────────────────────────

test.describe("Radio @component", () => {
  test("default (unselected) — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Economy" };

    const bundleUrl = await mountBundle("Radio", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("radio-default.png");

    const portUrl = await mountPort(portPath("Radio"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("radio-default.png");
  });

  test("hover — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Economy" };
    const name = "radio-hover.png";

    const bundleUrl = await mountBundle("Radio", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await page.locator("#root .vt-check").hover();
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Radio"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await page.locator("#root .vt-check").hover();
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("focus — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Economy" };
    const name = "radio-focus.png";

    const bundleUrl = await mountBundle("Radio", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await page.locator("#root .vt-check input").focus();
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Radio"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await page.locator("#root .vt-check input").focus();
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("selected — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Business", checked: true };
    const name = "radio-selected.png";

    const bundleUrl = await mountBundle("Radio", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Radio"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("disabled — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Van", disabled: true };
    const name = "radio-disabled.png";

    const bundleUrl = await mountBundle("Radio", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Radio"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });
});

// ── Switch ────────────────────────────────────────────────────────────────────────

test.describe("Switch @component", () => {
  test("off (default) — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Send SMS reminders", checked: false };

    const bundleUrl = await mountBundle("Switch", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("switch-off.png");

    const portUrl = await mountPort(portPath("Switch"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("switch-off.png");
  });

  test("focus — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Send SMS reminders", checked: false };
    const name = "switch-focus.png";

    const bundleUrl = await mountBundle("Switch", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await page.locator("#root .vt-switch input").focus();
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Switch"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await page.locator("#root .vt-switch input").focus();
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("on (selected) — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Send SMS reminders", checked: true };
    const name = "switch-on.png";

    const bundleUrl = await mountBundle("Switch", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Switch"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("disabled — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Auto-confirm bookings", disabled: true };
    const name = "switch-disabled.png";

    const bundleUrl = await mountBundle("Switch", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Switch"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });
});

// ── Counter ───────────────────────────────────────────────────────────────────────

test.describe("Counter @component", () => {
  test("default — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Passengers", value: 2 };

    const bundleUrl = await mountBundle("Counter", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("counter-default.png");

    const portUrl = await mountPort(portPath("Counter"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("counter-default.png");
  });

  test("focus — port matches the vendored bundle @component", async ({ page }) => {
    const props = { label: "Passengers", value: 2 };
    const name = "counter-focus.png";

    const bundleUrl = await mountBundle("Counter", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await page.locator("#root .vt-counter__btn").first().focus();
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("Counter"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await page.locator("#root .vt-counter__btn").first().focus();
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("disabled (Rule 2 addition, port only — see Counter.tsx) @component", async ({ page }) => {
    // Port only, not a bundle-vs-port diff: the compiled `function Counter`
    // signature has no `disabled` param at all (confirmed by reading the source
    // directly) — passed to mountBundle it lands in `...rest`, spread onto the
    // outer wrapper div as a harmless, invisible DOM attribute, so the bundle
    // renders fully enabled regardless. Same reasoning as the error test below.
    const props = { label: "Child seats", value: 1, disabled: true };

    const portUrl = await mountPort(portPath("Counter"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("counter-disabled.png");
  });

  test("error (Rule 2 addition, port only — see Counter.tsx) @component", async ({ page }) => {
    // No bundle counterpart: the compiled source has no error/capacity-clamp
    // concept at all — same single-sided-baseline treatment as Checkbox's
    // indeterminate/invalid additions above.
    const props = { label: "Passengers", value: 9, max: 8, error: "Exceeds this vehicle's capacity" };

    const portUrl = await mountPort(portPath("Counter"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("counter-error.png");
  });
});

// ── DatePicker ────────────────────────────────────────────────────────────────────
//
// No `.dc.html` mock uses DatePicker at all — diffed against the vendored bundle,
// same as every other control in this file (see this file's own header comment).
// The `open` calendar-panel state is not screenshot-tested here — see this file's
// header comment for why (recorded in .planning/WINDOWS.md).

test.describe("DatePicker @component", () => {
  const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  test("default (empty) — port matches the vendored bundle @component", async ({ page }) => {
    const props = {
      label: "Pickup date",
      placeholder: "Pick a date",
      monthLabel: "August 2026",
      dowLabels: DOW,
    };

    const bundleUrl = await mountBundle("DatePicker", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("datepicker-default.png");

    const portUrl = await mountPort(portPath("DatePicker"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("datepicker-default.png");
  });

  test("focus (Law 01's date-field exception, same border-only rule) — port matches the vendored bundle @component", async ({
    page,
  }) => {
    const props = {
      label: "Pickup date",
      placeholder: "Pick a date",
      monthLabel: "August 2026",
      dowLabels: DOW,
    };
    const name = "datepicker-focus.png";

    const bundleUrl = await mountBundle("DatePicker", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await page.locator("#root .vt-dp__field").focus();
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("DatePicker"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await page.locator("#root .vt-dp__field").focus();
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  test("selected — port matches the vendored bundle @component", async ({ page }) => {
    const props = {
      label: "Pickup date",
      value: "14 August 2026",
      time: "08:15",
      selectedDay: 14,
      monthLabel: "August 2026",
      dowLabels: DOW,
    };
    const name = "datepicker-selected.png";

    const bundleUrl = await mountBundle("DatePicker", props);
    await page.goto(bundleUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);

    const portUrl = await mountPort(portPath("DatePicker"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot(name);
  });

  // disabled/error/loading below are port-only, single-sided baselines — same
  // treatment as Checkbox's indeterminate/invalid and Counter's error above. Found
  // during this task's own run, not assumed up front: the compiled `function
  // DatePicker` signature has no `disabled`/`error`/`loading` param at all (confirmed
  // by reading the source directly), so passing those props to mountBundle doesn't
  // toggle any visual state there — they land in the source's own `...rest` spread
  // (a harmless, invisible DOM attribute on the wrapper) and the bundle renders as
  // if the prop were never passed. A bundle-vs-port diff on these three therefore
  // doesn't compare two states of the same thing; it compares the Rule 2 addition's
  // real behaviour against the closest the bundle happens to fall back to, which
  // isn't a meaningful screenshot-diff target (confirmed empirically: "error" showed
  // the bundle silently rendering the hint instead, since the bundle has no
  // error-suppresses-hint fallback to trigger).

  test("disabled (Rule 2 addition, port only — see DatePicker.tsx) @component", async ({ page }) => {
    const props = {
      label: "Return date",
      placeholder: "Not available for one-way transfers",
      monthLabel: "August 2026",
      dowLabels: DOW,
      disabled: true,
    };

    const portUrl = await mountPort(portPath("DatePicker"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("datepicker-disabled.png");
  });

  test("error (Rule 2 addition, hint suppressed, port only — see DatePicker.tsx) @component", async ({
    page,
  }) => {
    const props = {
      label: "Pickup date",
      placeholder: "Pick a date",
      hint: "Bookings open up to 90 days ahead",
      error: "Choose a date at least 2 hours from now",
      monthLabel: "August 2026",
      dowLabels: DOW,
    };

    const portUrl = await mountPort(portPath("DatePicker"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("datepicker-error.png");
  });

  test("loading (Rule 2 addition, port only — see DatePicker.tsx) @component", async ({ page }) => {
    const props = { label: "Pickup date", placeholder: "Checking availability…", loading: true };

    const portUrl = await mountPort(portPath("DatePicker"), props);
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("datepicker-loading.png");
  });
});
