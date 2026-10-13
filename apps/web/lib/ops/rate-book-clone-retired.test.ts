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
    rates: find("distance_rates"),
    routes: find("fixed_routes"),
    rules: find("rate_version_rules"),
    surcharges: find("surcharges"),
    bands: find("distance_bands"),
    regions: find("region_premiums"),
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

  it("distance_bands keeps class-less bands (left join, null class allowed)", async () => {
    const c = await copies();
    expect(c.bands).toMatch(/left join public\.vehicle_classes vc/);
    expect(c.bands).toContain("vehicle_class_id is null or vc.hidden_at is null");
  });

  it("city_pair rules of a retired class are not copied", async () => {
    const c = await copies();
    expect(c.rules).toContain("city_pair");
    expect(c.rules).toContain("hidden_at is not null");
    expect(c.rules).toContain("payload ->> 'vehicleClassId'");
    expect(c.rules).toMatch(/order by id/);
  });

  it("surcharges, region premiums and coupons are copied as before", async () => {
    const c = await copies();
    for (const text of [c.surcharges, c.regions, c.coupons]) {
      expect(text).not.toContain("vehicle_classes");
    }
    expect(c.surcharges).toContain("rule_id");
  });
});
