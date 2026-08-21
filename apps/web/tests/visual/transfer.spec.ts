// apps/web/tests/visual/transfer.spec.ts
//
// Screenshot-diff baselines for the four transfer composites this plan ports
// (StatusBadge, RouteSummary, PriceSummary, VehicleCard), following data.spec.ts's
// own established shape in this same plan (itself following core.spec.ts's and
// forms.spec.ts's precedent, Plans 06/09): each state diffed `mountPort` against
// `mountBundle` wherever the state's props survive the JSON-embedding boundary; a
// Rule 2 addition the compiled source has no concept of at all (PriceSummary's own
// loading/empty/error, VehicleCard's own disabled/loading — see each component's own
// header comment) is a single-sided port-only baseline instead.
//
// `StatusBadge` and `RouteSummary` are `useTranslations()` callers (I18N-01) —
// `mountPort` needs a real `NextIntlClientProvider` ancestor or the hook throws (see
// mock-harness.ts's own "Plan 11 addition" comment on `MountPortIntlOptions`, added
// specifically for this plan). The real `en.json` dictionary is imported directly
// below rather than an inline stub, so a screenshot mismatch here would also catch a
// dictionary regression, not just a component one. The bundle side needs no such
// provider — it renders its own hardcoded English literals (the same values, since
// both `statusBadge.*` and `common.pickup`/`common.destination` were migrated
// verbatim from the mock's own copy in Plan 07's dictionary pass, RouteSummary.tsx's
// own comment) — so an `en`-locale bundle-vs-port diff is still a meaningful pixel
// comparison, not a false pass.
//
// Viewports: `RouteSummary` and `VehicleCard` are named explicitly in this plan's own
// Task 3 instruction ("the vehicle card and the route summary have responsive layout
// rules, so they are diffed at all four viewports") — `VehicleCard.css` carries a
// real `@media (max-width:560px)` rule; `RouteSummary` is diffed at all four
// viewports for the same reason Table.tsx is in data.spec.ts (the mirroring rules
// this component carries are exactly what the narrower breakpoints exist to prove
// hasn't silently broken). `StatusBadge` and `PriceSummary`'s CSS carries no
// viewport rule — the Fidelity Contract's reduced-viewport allowance (1440/390 only)
// applies to them.

import { test, expect, type Page } from "@playwright/test";
import { mountBundle, mountPort, waitForMockReady } from "../support/mock-harness";
import enMessages from "../../i18n/messages/en.json";
import deMessages from "../../i18n/messages/de.json";

const REDUCED_VIEWPORT_PROJECTS = new Set(["component-1440", "component-390"]);
const FULL_VIEWPORT_MARK = "[4vp]";

function portPath(name: string): string {
  return `apps/web/components/transfer/${name}.tsx`;
}

test.beforeEach(async ({ page }, testInfo) => {
  const needsFullViewport = testInfo.title.includes(FULL_VIEWPORT_MARK);
  test.skip(
    !needsFullViewport && !REDUCED_VIEWPORT_PROJECTS.has(testInfo.project.name),
    "This state's CSS carries no viewport breakpoint rule — Fidelity Contract allows the reduced 1440/390 set.",
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

async function diffBothSides(
  page: Page,
  componentName: string,
  props: Record<string, unknown>,
  name: string,
  intl?: { messages: Record<string, unknown> },
): Promise<void> {
  const bundleUrl = await mountBundle(componentName, props);
  await page.goto(bundleUrl);
  await waitForMockReady(page);
  await expect(page.locator("#root")).toHaveScreenshot(name);

  const portUrl = await mountPort(
    portPath(componentName),
    props,
    intl ? { locale: "en", messages: intl.messages } : undefined,
  );
  await page.goto(portUrl);
  await waitForMockReady(page);
  await expect(page.locator("#root")).toHaveScreenshot(name);
}

// ── StatusBadge ───────────────────────────────────────────────────────────────────
//
// Three representative statuses (one per distinct tone family) plus the
// showIcon=false variant are diffed against the bundle; the full nine-value set is
// exercised in the dev gallery (TransferGallery.tsx) and its own German/Arabic
// manual pass, per this plan's Task 3 instruction — duplicating all nine as
// screenshot pairs here would not add meaningfully more Fidelity Contract coverage
// than these three already give (same reasoning core.spec.ts's own header comment
// gives for not hunting a mock usage per component).

test.describe("StatusBadge @component", () => {
  test("quote (outline tone) — port matches the vendored bundle @component", async ({ page }) => {
    await diffBothSides(page, "StatusBadge", { status: "quote" }, "statusbadge-quote.png", {
      messages: enMessages,
    });
  });

  test("paid (success tone) — port matches the vendored bundle @component", async ({ page }) => {
    await diffBothSides(page, "StatusBadge", { status: "paid" }, "statusbadge-paid.png", {
      messages: enMessages,
    });
  });

  test("cancelled (danger tone) — port matches the vendored bundle @component", async ({ page }) => {
    await diffBothSides(page, "StatusBadge", { status: "cancelled" }, "statusbadge-cancelled.png", {
      messages: enMessages,
    });
  });

  test("showIcon=false — port matches the vendored bundle @component", async ({ page }) => {
    await diffBothSides(
      page,
      "StatusBadge",
      { status: "confirmed", showIcon: false },
      "statusbadge-no-icon.png",
      { messages: enMessages },
    );
  });

  test("absent status renders no badge (T-01-29, port only) @component", async ({ page }) => {
    // Not a screenshot-diff — `StatusBadge` returns `null` for an absent/unrecognised
    // status (T-01-29), so `#root` is a genuinely empty, zero-size element;
    // `toHaveScreenshot()` on a zero-size locator times out waiting for it to become
    // "visible" rather than ever capturing a meaningful pixel comparison. The
    // structural assertion below is the correct test for "renders nothing" — it
    // fails loudly if a future change makes StatusBadge render a fallback badge
    // instead of nothing.
    const portUrl = await mountPort(portPath("StatusBadge"), { status: undefined }, {
      locale: "en",
      messages: enMessages,
    });
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toBeEmpty();
  });

  test("German label — pending (Zahlung ausstehend), port only @component", async ({ page }) => {
    // The longest lifecycle label in the dictionary (E5's own unresolved-until-proven
    // row) — proves it widens the badge rather than clipping, before the manual DE
    // pass repeats the same check inside a real table cell (TransferGallery.tsx).
    const portUrl = await mountPort(portPath("StatusBadge"), { status: "pending" }, {
      locale: "de",
      messages: deMessages,
    });
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("statusbadge-pending-de.png");
  });
});

// ── RouteSummary ──────────────────────────────────────────────────────────────────

test.describe("RouteSummary @component", () => {
  test("one-way (partial — no return leg) — port matches the vendored bundle @component [4vp]", async ({
    page,
  }) => {
    await diffBothSides(
      page,
      "RouteSummary",
      {
        pickup: "Zurich Airport (ZRH)",
        pickupDetail: "Terminal 2, Arrivals",
        dropoff: "Baur au Lac",
        dropoffDetail: "Talstrasse 1, Zurich",
        meta: [{ icon: "car-front", label: "Economy" }],
      },
      "routesummary-one-way.png",
      { messages: enMessages },
    );
  });

  test("with return leg reference — port matches the vendored bundle @component [4vp]", async ({ page }) => {
    await diffBothSides(
      page,
      "RouteSummary",
      {
        pickup: "Zurich Airport (ZRH)",
        pickupDetail: "Terminal 2, Arrivals",
        dropoff: "Dolder Grand",
        dropoffDetail: "Kurhausstrasse 65, Zurich",
        meta: [
          { icon: "car-front", label: "Business" },
          { icon: "clock", label: "08:15" },
          { icon: "arrow-right", label: "Return: Sun 18:00" },
        ],
      },
      "routesummary-return.png",
      { messages: enMessages },
    );
  });

  test("empty (Rule 2 addition, port only — see RouteSummary.tsx) @component [4vp]", async ({ page }) => {
    const portUrl = await mountPort(
      portPath("RouteSummary"),
      { empty: true, emptyMessage: "Enter a pickup and drop-off to see your route." },
      { locale: "en", messages: enMessages },
    );
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("routesummary-empty.png");
  });

  test("loading (Rule 2 addition, port only — see RouteSummary.tsx) @component [4vp]", async ({ page }) => {
    const portUrl = await mountPort(
      portPath("RouteSummary"),
      { loading: true, loadingLabel: "Looking up your route…" },
      { locale: "en", messages: enMessages },
    );
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("routesummary-loading.png");
  });
});

// ── PriceSummary ──────────────────────────────────────────────────────────────────
//
// ADR-004/I18N-05's own currency-layer decision means the port's `PriceLine` shape
// (`amount: number | null`, formatted internally through `formatAmount`) and the
// compiled bundle's own shape (`value: ReactNode`, a pre-formatted string the caller
// supplies directly — confirmed by reading `function PriceSummary` in
// `_ds_bundle.js` directly: it renders `l.value`/`total` verbatim, with no
// formatting call of its own at all) are deliberately different prop shapes for the
// identical visual output. A single shared `props` object (this file's
// `diffBothSides` helper) can't serve both, so `diffPriceSummary` below builds each
// side's own shape from one small line-spec list, rather than dropping this state to
// a port-only baseline the way a genuine Rule 2 addition would (unlike
// loading/empty/error, this one has a real bundle-side counterpart to diff against).

interface PriceLineSpec {
  label: string;
  icon?: string;
  credit?: boolean;
  muted?: boolean;
}

async function diffPriceSummary(
  page: Page,
  lineSpecs: PriceLineSpec[],
  name: string,
): Promise<void> {
  const bundleUrl = await mountBundle("PriceSummary", {
    lines: lineSpecs.map((l) => ({ ...l, value: "CHF 000" })),
    total: "CHF 000",
    totalLabel: "Total",
  });
  await page.goto(bundleUrl);
  await waitForMockReady(page);
  await expect(page.locator("#root")).toHaveScreenshot(name);

  const portUrl = await mountPort(portPath("PriceSummary"), {
    lines: lineSpecs.map((l) => ({ ...l, amount: null })),
    total: null,
    totalLabel: "Total",
  });
  await page.goto(portUrl);
  await waitForMockReady(page);
  await expect(page.locator("#root")).toHaveScreenshot(name);
}

test.describe("PriceSummary @component", () => {
  test("many lines, with a credit (discount) line — port matches the vendored bundle @component", async ({
    page,
  }) => {
    await diffPriceSummary(
      page,
      [
        { label: "Transfer fare", icon: "car-front" },
        { label: "Meet & greet", icon: "user" },
        { label: "Loyalty discount", credit: true },
        { label: "Booking fee", muted: true },
      ],
      "pricesummary-many.png",
    );
  });

  test("partial — no discount line — port matches the vendored bundle @component", async ({ page }) => {
    await diffPriceSummary(
      page,
      [
        { label: "Transfer fare", icon: "car-front" },
        { label: "Meet & greet", icon: "user" },
      ],
      "pricesummary-no-discount.png",
    );
  });

  test("empty (Rule 2 addition, port only — see PriceSummary.tsx) @component", async ({ page }) => {
    const portUrl = await mountPort(portPath("PriceSummary"), {
      empty: true,
      emptyMessage: "Your price will appear here once a route is set.",
    });
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("pricesummary-empty.png");
  });

  test("loading (Rule 2 addition, port only — see PriceSummary.tsx) @component", async ({ page }) => {
    const portUrl = await mountPort(portPath("PriceSummary"), {
      loading: true,
      loadingLabel: "Calculating your price…",
    });
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("pricesummary-loading.png");
  });

  test("error (Rule 2 addition, port only — see PriceSummary.tsx) @component", async ({ page }) => {
    const portUrl = await mountPort(portPath("PriceSummary"), {
      error: "Couldn't calculate your price. Try again.",
    });
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("pricesummary-error.png");
  });
});

// ── VehicleCard ───────────────────────────────────────────────────────────────────
//
// No `.dc.html` mock uses VehicleCard anywhere in `app/` (mock-harness.ts's
// `COMPONENTS_WITHOUT_MOCK_USAGE` already records this) — diffed against the
// vendored bundle directly via `mountBundle`, same as StatTile in data.spec.ts.

test.describe("VehicleCard @component", () => {
  test("default (icon fallback) — port matches the vendored bundle @component [4vp]", async ({ page }) => {
    await diffBothSides(
      page,
      "VehicleCard",
      {
        name: "Economy",
        examples: "Mercedes E-Class or similar",
        price: "CHF 000",
        priceNote: "Total, all taxes included",
        passengers: 3,
        luggage: 2,
      },
      "vehiclecard-default.png",
    );
  });

  test("selected, with badge and features — port matches the vendored bundle @component [4vp]", async ({
    page,
  }) => {
    await diffBothSides(
      page,
      "VehicleCard",
      {
        name: "Business",
        examples: "Mercedes V-Class or similar",
        price: "CHF 000",
        priceNote: "Total, all taxes included",
        passengers: 4,
        luggage: 3,
        badge: "Popular",
        features: [{ icon: "snowflake", label: "Climate control" }],
        selected: true,
      },
      "vehiclecard-selected.png",
    );
  });

  test("disabled — capacity exceeded (Rule 2 addition, port only — see VehicleCard.tsx) @component [4vp]", async ({
    page,
  }) => {
    const portUrl = await mountPort(portPath("VehicleCard"), {
      name: "Economy",
      examples: "Mercedes E-Class or similar",
      price: "CHF 000",
      passengers: 3,
      luggage: 2,
      disabled: true,
    });
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("vehiclecard-disabled.png");
  });

  test("loading — price still computing (Rule 2 addition, port only — see VehicleCard.tsx) @component [4vp]", async ({
    page,
  }) => {
    const portUrl = await mountPort(portPath("VehicleCard"), {
      name: "Van",
      examples: "Mercedes V-Class XL or similar",
      passengers: 7,
      luggage: 6,
      loading: true,
    });
    await page.goto(portUrl);
    await waitForMockReady(page);
    await expect(page.locator("#root")).toHaveScreenshot("vehiclecard-loading.png");
  });
});
