// apps/web/lib/ops/draft-preview-unpaid.test.ts
//
// 18-05 Task 3: discard / preview / test unpaid / clone (D-05 D-09 D-10 D-33).
// Source-read: withAdmin, no Stripe session, no mail, is_test Pay off.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mapAccountBooking } from "../account/bookings";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");

function webSource(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

const DISCARD = "app/[locale]/(ops)/api/staff/rate-versions/[id]/discard/route.ts";
const CLONE = "app/[locale]/(ops)/api/staff/rate-versions/[id]/clone/route.ts";
const PREVIEW = "app/[locale]/(ops)/api/staff/rate-book/preview/route.ts";
const TEST_UNPAID = "app/[locale]/(ops)/api/staff/rate-book/test-unpaid/route.ts";

describe("discard / clone / preview / test-unpaid dual-mount (D-09 D-10)", () => {
  it("all four locale routes exist with matching app/api/staff re-exports", () => {
    const pairs: Array<[string, string]> = [
      [DISCARD, "app/api/staff/rate-versions/[id]/discard/route.ts"],
      [CLONE, "app/api/staff/rate-versions/[id]/clone/route.ts"],
      [PREVIEW, "app/api/staff/rate-book/preview/route.ts"],
      [TEST_UNPAID, "app/api/staff/rate-book/test-unpaid/route.ts"],
    ];
    for (const [locale, mount] of pairs) {
      const src = webSource(locale);
      const reexport = webSource(mount);
      expect(src).toMatch(/export const POST = withAdmin/);
      expect(src).toMatch(/export const dynamic = "force-dynamic"/);
      expect(reexport).toMatch(/export const dynamic = "force-dynamic"/);
      expect(reexport).toMatch(/export \{ POST \}/);
    }
  });

  it("clone route source calls fork with the requested version id (D-09)", () => {
    const src = webSource(CLONE);
    expect(src).toMatch(/forkLiveRateVersion\(env, claims, \{/);
    expect(src).toMatch(/id: source\.id/);
    expect(src).toMatch(/label: source\.label/);
  });

  it("discard only deletes the draft and returns live (D-06)", () => {
    const src = webSource(DISCARD);
    expect(src).toMatch(/target\.status !== "draft"/);
    expect(src).toMatch(/delete from public\.rate_versions where id = \$\{id\} and status = 'draft'/);
    expect(src).not.toMatch(/forkLiveRateVersion/);
    expect(src).not.toMatch(/status = 'live'/);
    expect(src).not.toMatch(/status = 'retired'/);
  });
});

describe("preview is draft priceQuote, not public preferDraft (D-05 D-29)", () => {
  it("preview source calls priceQuote and not the public engine preferDraft true", () => {
    const preview = webSource(PREVIEW);
    const helper = webSource("lib/ops/draft-preview.ts");
    const loader = webSource("lib/ops/rate-book.ts");
    expect(helper).toMatch(/priceQuote\(/);
    expect(preview).toMatch(/priceDraftPreview/);
    expect(preview).not.toMatch(/preferDraft:\s*true/);
    expect(preview).not.toMatch(/loadAndPrice/);
    expect(helper).not.toMatch(/preferDraft:\s*true/);
    expect(loader).toMatch(/quote_rate_book\(true\)/);
    expect(loader).toMatch(/loadDraftQuoteBookDoc/);
  });

  it("recap order is start, km, bands, region, extras, VAT, total", () => {
    const helper = webSource("lib/ops/draft-preview.ts");
    expect(helper).toMatch(/code: "start"/);
    expect(helper).toMatch(/code: "km"/);
    expect(helper).toMatch(/code: "bands"/);
    expect(helper).toMatch(/code: "region"/);
    expect(helper).toMatch(/code: "extras"/);
    expect(helper).toMatch(/code: "vat"/);
    expect(helper).toMatch(/code: "total"/);
  });
});

describe("test unpaid has no Stripe and no mail (D-33)", () => {
  it("test-unpaid source has no Stripe Checkout session create", () => {
    const src = webSource(TEST_UNPAID);
    expect(src).toMatch(/export const POST = withAdmin/);
    expect(src).toMatch(/createBooking/);
    expect(src).toMatch(/is_test = true/);
    expect(src).toMatch(/mintLockDeadline/);
    expect(src).not.toMatch(/createCheckoutSession/);
    expect(src).not.toMatch(/from "@\/lib\/checkout\/stripe"/);
    expect(src).not.toMatch(/sendConfirmation/);
    expect(src).not.toMatch(/sendPayLink/);
    expect(src).not.toMatch(/from "postgres"/);
  });

  it("account bookings mapper sets pay_url null when is_test", () => {
    const row = mapAccountBooking({
      reference: "VT-26-0001",
      status: "pending",
      price_total_rappen: 12000,
      pickup_text: "A",
      dropoff_text: "B",
      scheduled_local: "2026-09-12T04:15",
      scheduled_at: "2026-09-12T02:15:00.000Z",
      pax: 1,
      is_test: true,
    });
    expect(row.pay_url).toBeNull();
    expect(row.payable).toBe(false);
  });
});

describe("public engine preferDraft stays host-gated (D-05)", () => {
  it("engine.ts public preferDraft remains dashboardHost && PRICING_PREVIEW", () => {
    const engine = webSource("lib/quote/engine.ts");
    expect(engine).toMatch(
      /preferDraft\s*=\s*dashboardHost\s*&&\s*env\.PRICING_PREVIEW\s*===\s*"true"/,
    );
  });
});
