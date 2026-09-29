// apps/web/lib/checkout/reprice.test.ts
//
// D-12: checkout fails closed when the live price book cannot load, and
// pricing_live is the real derivePricingLive(rate_version) AND public_chf —
// never the literal true.

import { describe, expect, it } from "vitest";
import { loadCheckoutReprice } from "./reprice";
import type { LaunchFlags } from "../db/quote";

const LIVE_BOOK_DOC = {
  rate_version: { id: 7, slug: "v7", status: "live" },
  classes: [],
  distance_rates: [],
  fixed_routes: [],
  surcharges: [],
  zones: [],
};

const DRAFT_BOOK_DOC = {
  rate_version: { id: 8, slug: "v8", status: "draft" },
  classes: [],
  distance_rates: [],
  fixed_routes: [],
  surcharges: [],
  zones: [],
};

const ENV = {} as CloudflareEnv;

describe("loadCheckoutReprice", () => {
  it("is ok with pricingLive true when the live rate version is live and public_chf is on", async () => {
    const result = await loadCheckoutReprice(ENV, {
      loadRateBook: async () => LIVE_BOOK_DOC,
      loadLaunchFlags: async () => ({ public_chf: true, vat_rate_bps: 81 }) satisfies LaunchFlags,
    });
    expect(result).toEqual({
      ok: true,
      pricingLive: true,
      liveRateVersionId: 7,
      extrasCatalog: [],
    });
  });

  it("refuses to go ok:false when the rate book load throws (fail closed)", async () => {
    const result = await loadCheckoutReprice(ENV, {
      loadRateBook: async () => {
        throw new Error("db down");
      },
      loadLaunchFlags: async () => ({ public_chf: true, vat_rate_bps: 81 }) satisfies LaunchFlags,
    });
    expect(result).toEqual({ ok: false });
  });

  it("is pricingLive false when the live book loads but public_chf is off", async () => {
    const result = await loadCheckoutReprice(ENV, {
      loadRateBook: async () => LIVE_BOOK_DOC,
      loadLaunchFlags: async () => ({ public_chf: false, vat_rate_bps: 81 }) satisfies LaunchFlags,
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.pricingLive).toBe(false);
  });

  it("is pricingLive false and liveRateVersionId null when the loaded version is draft", async () => {
    const result = await loadCheckoutReprice(ENV, {
      loadRateBook: async () => DRAFT_BOOK_DOC,
      loadLaunchFlags: async () => ({ public_chf: true, vat_rate_bps: 81 }) satisfies LaunchFlags,
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.pricingLive).toBe(false);
    expect(result.ok && result.liveRateVersionId).toBeNull();
  });
});
