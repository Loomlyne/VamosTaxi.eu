// apps/web/lib/pricing/public-chf.test.ts
//
// Wave 0 (11-01): public CHF contract (D-18, D-19, D-23).
// Public pricing_live = derivePricingLive AND settings.public_chf.
// Live rate row (hosted id 5) is not the flip. formatAmount(null) stays CHF 000.
// Do not implement the AND here — 11-03 greens the engine source-read.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatAmount } from "../currency";
import { derivePricingLive } from "./rateBook";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");

function source(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

describe("formatAmount null is CHF 000 (D-19)", () => {
  it('formatAmount(null) === "CHF 000"', () => {
    expect(formatAmount(null)).toBe("CHF 000");
  });

  it("does not invent class-floor copy as the empty-shell amount", () => {
    expect(formatAmount(null)).not.toMatch(/80|100|130|150/);
  });
});

describe("derivePricingLive is not the public-CHF flip (D-23)", () => {
  it("stays status-only: live row is true, draft/null are false", () => {
    expect(derivePricingLive({ status: "live" })).toBe(true);
    expect(derivePricingLive({ status: "draft" })).toBe(false);
    expect(derivePricingLive({ status: "retired" })).toBe(false);
    expect(derivePricingLive(null)).toBe(false);
  });
});

describe("public pricing_live AND public_chf (D-18 D-23)", () => {
  it("engine HTTP pricing_live is derivePricingLive && flags.public_chf", () => {
    const engine = source("lib/quote/engine.ts");
    expect(engine).toMatch(/public_chf/);
    expect(engine).toMatch(
      /derivePricingLive\([^)]*\)\s*&&\s*(?:flags\.)?public_chf/,
    );
  });

  it("does not treat a live row alone as public pricing_live", () => {
    const engine = source("lib/quote/engine.ts");
    expect(engine).not.toMatch(
      /pricing_live:\s*rateBookMapper\.derivePricingLive\(book\.rate_version\),/,
    );
  });

  it("PRICING_PREVIEW must not set public_chf (D-18)", () => {
    const engine = source("lib/quote/engine.ts");
    expect(engine).toMatch(/PRICING_PREVIEW/);
    expect(engine).not.toMatch(
      /PRICING_PREVIEW[\s\S]{0,400}public_chf\s*=\s*true/,
    );
    expect(engine).not.toMatch(/update[\s\S]{0,200}public_chf/);
  });

  it("public host preferDraft is false; pipeline does not read PRICING_PREVIEW", () => {
    const engine = source("lib/quote/engine.ts");
    expect(engine).toMatch(
      /preferDraft\s*=\s*dashboardHost\s*&&\s*env\.PRICING_PREVIEW\s*===\s*"true"/,
    );
    const pipeline = source("lib/quote/pipeline.ts");
    expect(pipeline).not.toMatch(/env\.PRICING_PREVIEW/);
    expect(pipeline).not.toMatch(/preferDraft/);
    const deps = source("lib/quote/deps.ts");
    expect(deps).toMatch(/dashboard\.vamostaxi\.site/);
    expect(deps).toMatch(/dashboard\.localhost/);
    const quoteRoute = source("app/api/quote/route.ts");
    const repriceRoute = source("app/api/quote/reprice/route.ts");
    expect(quoteRoute).toMatch(/isNamedDashboardHost/);
    expect(repriceRoute).toMatch(/isNamedDashboardHost/);
  });
});
