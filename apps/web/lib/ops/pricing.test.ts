// apps/web/lib/ops/pricing.test.ts
//
// Completeness reader mirrors tg_rate_version_transition. asStaff is stubbed.
// D-08: required class fields are name, start, per-km, max pax. D-32: this
// file writes no CHF figure. Wave 0 stays red until 18-02 / 18-04.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "@/lib/db/identity";

vi.mock("../db/identity", () => ({
  asStaff: vi.fn(),
}));

import { asStaff } from "../db/identity";
import { loadCompleteness, loadRateVersions } from "./pricing";

const env = {} as CloudflareEnv;
const adminClaims: VamosClaims = {
  sub: "00000000-0000-4000-8000-000000000001",
  role: "authenticated",
  aal: "aal2",
  app_metadata: { vamos_role: "admin" },
};
const dispatcherClaims: VamosClaims = {
  sub: "00000000-0000-4000-8000-000000000002",
  role: "authenticated",
  aal: "aal2",
  app_metadata: { vamos_role: "dispatcher" },
};

function sqlOf(strings: TemplateStringsArray): string {
  return strings.join(" ");
}

beforeEach(() => {
  vi.mocked(asStaff).mockReset();
});

describe("loadRateVersions", () => {
  it("returns the seeded draft and reports no live version", async () => {
    vi.mocked(asStaff).mockImplementation(async (_env, _claims, fn) => {
      const tx = async (strings: TemplateStringsArray) => {
        expect(sqlOf(strings)).toMatch(/from public\.rate_versions/i);
        expect(sqlOf(strings)).toMatch(/order by created_at desc/i);
        return [
          {
            id: 1,
            slug: "seed-placeholder",
            label: "Staging matrix — placeholder, not owner-approved",
            status: "draft",
            note: "",
            created_at: "2026-01-01T00:00:00.000Z",
            created_by: null,
            published_at: null,
            published_by: null,
          },
        ];
      };
      return fn(tx as never);
    });

    const rows = await loadRateVersions(env, adminClaims);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("draft");
    expect(rows.some((row) => row.status === "live")).toBe(false);
  });

  it("returns an empty array for dispatcher claims", async () => {
    vi.mocked(asStaff).mockImplementation(async (_env, claims, fn) => {
      expect(claims.app_metadata?.vamos_role).toBe("dispatcher");
      const tx = async () => [];
      return fn(tx as never);
    });

    const rows = await loadRateVersions(env, dispatcherClaims);
    expect(rows).toEqual([]);
  });
});

describe("loadCompleteness", () => {
  // loadCompleteness must stay in lockstep with tg_rate_version_transition
  // (packages/db/supabase/migrations/20260823000008_rate_versions.sql and the
  // Phase 18 additive replacement). Changing one without the other is the
  // known failure mode: the checklist would disagree with the publish gate.

  it("D-08: required class fields are name, start, per-km, max pax — not min_fare", async () => {
    const seen: string[] = [];
    vi.mocked(asStaff).mockImplementation(async (_env, _claims, fn) => {
      const tx = async (strings: TemplateStringsArray) => {
        seen.push(sqlOf(strings).replace(/\s+/g, " ").trim());
        return [];
      };
      return fn(tx as never);
    });

    const gaps = await loadCompleteness(env, adminClaims, 1);
    expect(gaps).toEqual([]);
    expect(seen).toHaveLength(3);

    const distance = seen.find((s) => s.includes("distance_rates"));
    const surcharges = seen.find((s) => s.includes("surcharges"));
    const routes = seen.find((s) => s.includes("fixed_routes"));
    expect(distance).toMatch(/available/);
    expect(distance).toMatch(/vehicle_classes/);
    expect(distance).toMatch(/name/);
    expect(distance).toMatch(/base_fare_rappen/);
    expect(distance).toMatch(/per_km_rappen/);
    expect(distance).toMatch(/max_pax/);
    expect(distance).not.toMatch(/min_fare/);
    expect(surcharges).toMatch(/active and s\.kind <> 'included'/);
    expect(surcharges).toMatch(
      /coalesce\(s\.amount_rappen, \(s\.percent \* 100\)::integer\) is null/,
    );
    expect(routes).toMatch(/f\.live and f\.price_rappen is null/);
  });

  it("D-08: bands are not required when no band row was added", async () => {
    const seen: string[] = [];
    vi.mocked(asStaff).mockImplementation(async (_env, _claims, fn) => {
      const tx = async (strings: TemplateStringsArray) => {
        seen.push(sqlOf(strings).replace(/\s+/g, " ").trim());
        return [];
      };
      return fn(tx as never);
    });

    const gaps = await loadCompleteness(env, adminClaims, 1);
    expect(gaps).toEqual([]);
    const bandGapQuery = seen.find((s) => s.includes("distance_bands"));
    expect(bandGapQuery).toBeUndefined();
  });

  it("returns one gap row per unpriced distance_rate and unpriced active surcharge", async () => {
    vi.mocked(asStaff).mockImplementation(async (_env, _claims, fn) => {
      const tx = async (strings: TemplateStringsArray) => {
        const sql = sqlOf(strings);
        if (sql.includes("distance_rates")) {
          return [{ name: "economy" }, { name: "business" }, { name: "van" }];
        }
        if (sql.includes("surcharges")) {
          return [{ name: "night" }, { name: "airport_pickup" }];
        }
        return [];
      };
      return fn(tx as never);
    });

    const gaps = await loadCompleteness(env, adminClaims, 1);
    expect(gaps.filter((g) => g.kind === "distance_rate").map((g) => g.name)).toEqual([
      "economy",
      "business",
      "van",
    ]);
    expect(gaps.filter((g) => g.kind === "surcharge").map((g) => g.name)).toEqual([
      "night",
      "airport_pickup",
    ]);
    expect(gaps.filter((g) => g.kind === "fixed_route")).toEqual([]);
  });
});
