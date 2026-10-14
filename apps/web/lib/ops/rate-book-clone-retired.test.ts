// apps/web/lib/ops/rate-book-clone-retired.test.ts
//
// Phase 30 CLS-06 (T-30-13): a new price book copied from the live one carries no row of a retired
// class. Recorder test of the statements `forkLiveRateVersion` issues; the behaviour proof on a real
// database is rate-book-clone-retired.local.test.ts. Synthetic ids only.
import { describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";

vi.mock("../db/identity", () => ({ asStaff: vi.fn() }));

import { forkLiveRateVersion } from "./rate-book";

const env = {} as CloudflareEnv;
const claims: VamosClaims = {
  sub: "a0000000-0000-4000-8000-000000000030",
  role: "authenticated",
  app_metadata: { vamos_role: "admin" },
};

/** A postgres.js tag stand-in: no existing draft, the version insert returns id 99. */
function recorder() {
  const calls: string[] = [];
  const tx = (strings: TemplateStringsArray) => {
    const text = strings.join("$");
    calls.push(text);
    if (/select id from public\.rate_versions/.test(text)) return Promise.resolve([]);
    if (/insert into public\.rate_versions/.test(text)) return Promise.resolve([{ id: 99 }]);
    return Promise.resolve([]);
  };
  return { tx: tx as never, calls };
}

async function copies() {
  const r = recorder();
  await forkLiveRateVersion(env, claims, { id: 7, label: "Live book" }, r.tx);
  const find = (table: string) =>
    r.calls.find((t) => new RegExp(`insert into public\\.${table}\\b`).test(t)) ?? "";
  return {
    all: r.calls.join("\n"),
    rates: find("distance_rates"),
    routes: find("fixed_routes"),
    surcharges: find("surcharges"),
    coupons: find("coupons"),
  };
}

describe("cloneRateVersionFrom skips retired classes (CLS-06)", () => {
  it("distance_rates and fixed_routes join the live classes only", async () => {
    const c = await copies();
    for (const text of [c.rates, c.routes]) {
      expect(text).toMatch(/join public\.vehicle_classes vc/);
      expect(text).toContain("hidden_at is null");
      expect(text).not.toMatch(/left join/);
    }
  });

  it("surcharges and coupons are copied as before", async () => {
    const c = await copies();
    expect(c.surcharges).not.toBe("");
    expect(c.coupons).not.toBe("");
    for (const text of [c.surcharges, c.coupons]) {
      expect(text).not.toContain("vehicle_classes");
    }
  });

  it("decision 2026-10-13 items 10, 13: no km band, region % or rule copy, no surcharges.rule_id", async () => {
    const c = await copies();
    expect(c.all).not.toMatch(/distance_bands|region_premiums|rate_version_rules|rule_id/);
  });
});
