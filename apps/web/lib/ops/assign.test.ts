// apps/web/lib/ops/assign.test.ts
//
// 08-04: chauffeur-uuid assign mapper + file proofs. No Hyperdrive.
// Do not import app/api/**/route.ts.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { mapAssignSqlError } from "./assign-map";
import { OPS_SQLSTATE } from "./sqlstate";

vi.mock("../supabase/server", () => ({
  createSupabaseServerClient: () => ({}),
  createServerSupabaseClient: () => ({}),
}));

import { jsonErr, jsonOk, staffOriginAllowed } from "./staff-json";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("OPS_SQLSTATE exclusion", () => {
  it("maps GiST overlap as 23P01", () => {
    expect(OPS_SQLSTATE.exclusion).toBe("23P01");
  });
});

describe("mapAssignSqlError", () => {
  it("returns overlap with otherRef and otherLocal on 23P01", () => {
    const mapped = mapAssignSqlError(
      { code: "23P01" },
      { otherRef: "VT-26-0101", otherLocal: "2026-09-24T15:50" },
    );
    expect(mapped).toEqual({
      ok: false,
      code: "overlap",
      otherRef: "VT-26-0101",
      otherLocal: "2026-09-24T15:50",
    });
  });

  it("maps named RPC refuses", () => {
    expect(mapAssignSqlError({ code: "P0001", message: "no-email" })).toEqual({
      ok: false,
      code: "no-email",
    });
    expect(mapAssignSqlError({ code: "P0001", message: "no-vehicle" })).toEqual({
      ok: false,
      code: "no-vehicle",
    });
    expect(mapAssignSqlError({ code: "P0001", message: "not-paid" })).toEqual({
      ok: false,
      code: "not-paid",
    });
    expect(mapAssignSqlError({ code: "P0001", message: "frozen" })).toEqual({
      ok: false,
      code: "frozen",
    });
    expect(mapAssignSqlError({ code: "P0001", message: "capacity" })).toEqual({
      ok: false,
      code: "capacity",
    });
  });
});

describe("staffOriginAllowed", () => {
  it("denies missing Origin; allows dashboard and this-account ops-changes", () => {
    expect(staffOriginAllowed(null)).toBe(false);
    expect(staffOriginAllowed("https://dashboard.vamostaxi.site")).toBe(true);
    expect(staffOriginAllowed("http://dashboard.localhost:3000")).toBe(true);
    expect(staffOriginAllowed("https://vamos-ops-changes.koussayzayeni.workers.dev")).toBe(
      true,
    );
    expect(
      staffOriginAllowed("https://preview-vamos-ops-changes.koussayzayeni.workers.dev"),
    ).toBe(true);
    expect(staffOriginAllowed("https://evil-ops-changes.workers.dev")).toBe(false);
    expect(staffOriginAllowed("https://evil-ops-changes.koussayzayeni.workers.dev")).toBe(
      false,
    );
    expect(staffOriginAllowed("https://ops-changes.koussayzayeni.workers.dev")).toBe(false);
    expect(staffOriginAllowed("http://dashboard.vamostaxi.site")).toBe(false);
    expect(staffOriginAllowed("https://evil.example")).toBe(false);
  });
});

describe("staff JSON cache", () => {
  it("marks ok and err private no-store", () => {
    expect(jsonOk({ n: 1 }).headers.get("cache-control")).toBe("private, no-store");
    expect(jsonErr("csrf", 403).headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("08-04 assign file proofs", () => {
  it("migration is SECURITY DEFINER, vamos_system only, GiST kept", () => {
    const sql = read("packages/db/supabase/migrations/20260910164004_ops_assign_leg.sql");
    expect(sql).toMatch(/ops_assign_leg/);
    expect(sql).toMatch(/ops_unassign_leg/);
    expect(sql.toLowerCase()).toMatch(/security definer/);
    expect(sql).toMatch(/assignment\.chauffeur_set/);
    expect(sql).toMatch(/assignment\.vehicle_set/);
    expect(sql).toMatch(/assignment\.cleared/);
    expect(sql).not.toMatch(/drop constraint booking_legs_chauffeur_no_overlap/);
    expect(sql.toLowerCase()).not.toMatch(/grant execute[\s\S]*to anon/);
    expect(sql.toLowerCase()).not.toMatch(/grant execute[\s\S]*to authenticated/);
    expect(sql).toMatch(/to vamos_system/);
  });

  it("assign.ts calls asSystem RPCs and never asStaff INSERT into events", () => {
    const src = read("apps/web/lib/ops/assign.ts");
    expect(src).toMatch(/asSystem/);
    expect(src).toMatch(/ops_assign_leg/);
    expect(src).toMatch(/ops_unassign_leg/);
    expect(src).not.toMatch(/asStaff[\s\S]*insert into public\.booking_events/i);
    expect(src).not.toMatch(/:6543/);
  });

  it("sends chauffeur assign/unassign mail after RPC success, not before", () => {
    const src = read("apps/web/lib/ops/assign.ts");
    expect(src.indexOf("ops_assign_leg")).toBeGreaterThan(-1);
    expect(src.indexOf('notifyChauffeur(env, "assign"')).toBeGreaterThan(src.indexOf("ops_assign_leg"));
    expect(src.indexOf("ops_unassign_leg")).toBeGreaterThan(-1);
    expect(src.indexOf('notifyChauffeur(env, "unassign"')).toBeGreaterThan(
      src.indexOf("ops_unassign_leg"),
    );
    expect(src).toContain("sendChauffeurAssign");
    expect(src).toContain("sendChauffeurUnassign");
    expect(src).toMatch(/if \(result\.ok\)/);
    expect(src).not.toMatch(/select public\.notification_claim/);
    expect(src.toLowerCase()).not.toMatch(/gmail/);
    expect(src).not.toMatch(/wa\.me/);
    const send = read("packages/emails/src/lib/send.ts");
    expect(send).toContain("Vamos Taxi <noreply@vamostaxi.site>");
  });

  it("sends assignment-customer mail after ops_assign_leg ok (D-28)", () => {
    const src = read("apps/web/lib/ops/assign.ts");
    expect(src).toContain("sendAssignmentCustomer");
    expect(src).toContain("notifyAssignmentCustomer");
    const assignAt = src.indexOf("ops_assign_leg");
    const customerAt = src.lastIndexOf("notifyAssignmentCustomer");
    expect(assignAt).toBeGreaterThan(-1);
    expect(customerAt).toBeGreaterThan(assignAt);
    const unassignSlice = src.slice(src.indexOf("ops_unassign_leg"));
    expect(unassignSlice).not.toMatch(/notifyAssignmentCustomer/);
    expect(unassignSlice).not.toMatch(/sendAssignmentCustomer/);
  });

  it("bookings-write no longer matches chauffeur by full_name", () => {
    const w = read("apps/web/lib/ops/bookings-write.ts");
    expect(w).not.toMatch(/full_name = \$\{chauffeur\}/);
    expect(w).not.toMatch(/full_name = chauffeur/);
  });

  it("dual-mounts assign and unassign POST; list route has no POST", () => {
    const localeAssign = read(
      "apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/assign/route.ts",
    );
    const pubAssign = read("apps/web/app/api/staff/bookings/[id]/assign/route.ts");
    const localeUnassign = read(
      "apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/unassign/route.ts",
    );
    const pubUnassign = read("apps/web/app/api/staff/bookings/[id]/unassign/route.ts");
    expect(localeAssign).toMatch(/withStaff/);
    expect(localeAssign).toMatch(/chauffeurId/);
    expect(localeAssign).toMatch(/asSystem|assignBooking/);
    expect(pubAssign).toMatch(/export \{ POST \}/);
    expect(localeUnassign).toMatch(/withStaff/);
    expect(pubUnassign).toMatch(/export \{ POST \}/);
    const list = read("apps/web/app/[locale]/(ops)/api/staff/bookings/route.ts");
    expect(list).not.toMatch(/export const POST/);
  });

  it("OpsDetail posts chauffeur uuid, renders events, has no evQuote or hash", () => {
    const t = read("app/ops/OpsDetail.dc.html");
    expect(t).toMatch(/\/api\/staff\/bookings\//);
    expect(t).toMatch(/chauffeurId/);
    expect(t).toMatch(/\/unassign/);
    expect(t).not.toMatch(/location\.hash/);
    expect(t).not.toMatch(/\bevQuote\b/);
    expect(t).not.toMatch(/assigned:\s*\{\}/);
    expect(t).not.toMatch(/full_name/);
    const bookings = read("apps/web/lib/ops/bookings.ts") + read("apps/web/lib/ops/staff-json.ts");
    expect(bookings).toMatch(/booking_events|events/);
  });
});
