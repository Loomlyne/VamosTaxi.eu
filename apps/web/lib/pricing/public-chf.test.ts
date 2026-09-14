// apps/web/lib/pricing/public-chf.test.ts
//
// Wave 0 (11-01) + 18-10: public CHF contract (D-18, D-19, D-23, D-40).
// Public pricing_live = derivePricingLive AND settings.public_chf.
// Live rate row (hosted id 5) is not the flip. formatAmount(null) stays CHF 000.
// 18-02 SQL must not SET public_chf = true. Worker staging name is vamos.
// Do not implement the AND here — 11-03 greens the engine source-read.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatAmount } from "../currency";
import { derivePricingLive } from "./rateBook";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");
const OPS_PRICING_SQL =
  "packages/db/supabase/migrations/20260913180000_ops_pricing_source.sql";

function source(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

function repoSource(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

/** Full-line `//` comments only — do not strip `postgres://` inside strings. */
function stripJsoncLineComments(src: string): string {
  return src.replace(/^\s*\/\/.*$/gm, "");
}

function wranglerConfig(): {
  env: {
    staging: {
      name: string;
      routes?: Array<{ pattern: string; custom_domain?: boolean }>;
      vars?: { STRIPE_PUBLISHABLE_KEY?: string };
    };
  };
} {
  return JSON.parse(stripJsoncLineComments(source("wrangler.jsonc"))) as ReturnType<
    typeof wranglerConfig
  >;
}

function sqlNonCommentLines(src: string): string[] {
  return src.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith("--");
  });
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

describe("D-40 grep gates: Worker vamos, no .eu, no sk_live_, SQL does not flip public_chf", () => {
  it("env.staging name is vamos; wrangler non-comment config has no vamostaxi.eu", () => {
    const cfg = wranglerConfig();
    expect(cfg.env.staging.name).toBe("vamos");
    const stripped = stripJsoncLineComments(source("wrangler.jsonc"));
    expect(stripped).not.toMatch(/vamostaxi\.eu/);
    const routes = cfg.env.staging.routes ?? [];
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(route.pattern).not.toMatch(/vamostaxi\.eu/);
    }
  });

  it("staging Stripe publishable stays pk_test_; wrangler has no sk_live_", () => {
    const wrangler = source("wrangler.jsonc");
    expect(wrangler).not.toMatch(/sk_live_/);
    const key = wranglerConfig().env.staging.vars?.STRIPE_PUBLISHABLE_KEY ?? "";
    expect(key).toMatch(/^pk_test_/);
  });

  it("checkout and stripe implementation files have no sk_live_", () => {
    const checkoutDir = join(webRoot, "lib/checkout");
    const files = readdirSync(checkoutDir).filter(
      (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
    );
    expect(files).toContain("stripe.ts");
    expect(files).toContain("stripe-appearance.ts");
    for (const name of files) {
      const src = source(`lib/checkout/${name}`);
      expect(src, name).not.toMatch(/sk_live_/);
    }
  });

  it("18-02 SQL non-comment lines have zero public_chf = true", () => {
    const sql = repoSource(OPS_PRICING_SQL);
    const body = sqlNonCommentLines(sql).join("\n");
    expect(body).not.toMatch(/public_chf\s*=\s*true/);
    expect(sql).toMatch(/public_chf/);
  });
});
