// apps/web/lib/ops/chauffeur-class-keep.test.ts
//
// Quick 260930-dash-design, signed 2026-10-01: the driver form drops its Class field — a driver's
// class is his car's class. The chauffeurs.vehicle_class_id column stays (no migration) and the
// form stops writing it: a body without vehicleClassId keeps the stored value; an explicit "" or
// null still clears it (other callers).
import { describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";

const asStaff = vi.fn();
vi.mock("../db/identity", () => ({ asStaff: (...a: unknown[]) => asStaff(...a) }));
vi.mock("./chauffeur-desk", async (orig) => ({
  ...(await orig<typeof import("./chauffeur-desk")>()),
  persistChauffeurDesk: vi.fn(async () => undefined),
}));
vi.mock("../supabase/server", () => ({ createSupabaseServerClient: () => ({}), createServerSupabaseClient: () => ({}) }));

import { parseChauffeurBody } from "./fleet-http";
import { assertChauffeurInput } from "./chauffeurs";
import { insertChauffeur, updateChauffeurRow } from "./chauffeurs-write";
import { ChauffeurInputError } from "./chauffeurs-model";

const env = {} as CloudflareEnv;
const claims: VamosClaims = { sub: "a0000000-0000-4000-8000-000000000015", role: "authenticated", app_metadata: { vamos_role: "admin" } };
const ID = "c0000000-0000-4000-8000-00000000aa01";
const CLASS = "e0000000-0000-4000-8000-00000000ec01";

/** A postgres.js tag stand-in that records the statement and its values. */
function recorder() {
  const calls: { text: string; values: unknown[] }[] = [];
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join("$"), values });
    return Promise.resolve([{ id: ID }]);
  };
  return { sql, calls };
}

describe("the driver form stops writing the class", () => {
  it("a body without vehicleClassId leaves it undefined (keep); an empty one still clears", () => {
    const kept = parseChauffeurBody({ name: "Marco", phone: "+41 79 111 11 11", defaultVehicleId: "" });
    expect(kept.input.vehicleClassId).toBeUndefined();
    expect(assertChauffeurInput(kept.input).vehicleClassId).toBeUndefined();
    const cleared = parseChauffeurBody({ name: "Marco", phone: "+41 79 111 11 11", vehicleClassId: "" });
    expect(cleared.input.vehicleClassId).toBeNull();
    expect(assertChauffeurInput(cleared.input).vehicleClassId).toBeNull();
  });

  it("update keeps the stored vehicle_class_id when the form sent none", async () => {
    const r = recorder();
    asStaff.mockImplementation(async (_e: unknown, _c: unknown, fn: (sql: unknown) => unknown) => fn(r.sql));
    const input = assertChauffeurInput(parseChauffeurBody({ name: "Marco", phone: "+41 79 111 11 11" }).input);
    await updateChauffeurRow(env, claims, ID, input);
    const update = r.calls.find((c) => /update public\.chauffeurs set/.test(c.text));
    expect(update?.text).toMatch(/vehicle_class_id = case when \$::boolean then vehicle_class_id else \$::uuid end/);
    const at = update!.text.split("$").findIndex((part) => /vehicle_class_id = case when $/.test(part));
    expect(update!.values[at]).toBe(true);
  });

  it("update still writes an explicit class, and a new driver starts without one", async () => {
    const r = recorder();
    asStaff.mockImplementation(async (_e: unknown, _c: unknown, fn: (sql: unknown) => unknown) => fn(r.sql));
    const input = assertChauffeurInput(parseChauffeurBody({ name: "Marco", phone: "+41 79 111 11 11", vehicleClassId: CLASS }).input);
    await updateChauffeurRow(env, claims, ID, input);
    const update = r.calls.find((c) => /update public\.chauffeurs set/.test(c.text));
    expect(update?.values).toContain(false);
    expect(update?.values).toContain(CLASS);
    const n = recorder();
    asStaff.mockImplementation(async (_e: unknown, _c: unknown, fn: (sql: unknown) => unknown) => fn(n.sql));
    // Decision 7 (2026-10-01): a new chauffeur needs a plate number.
    await insertChauffeur(env, claims, null, assertChauffeurInput(parseChauffeurBody({ name: "Luca", phone: "+41 79 222 22 22", plate: "ZH 222 222" }).input));
    const insert = n.calls.find((c) => /insert into public\.chauffeurs/.test(c.text));
    expect(insert?.values).not.toContain(undefined);
  });
});

describe("Phase 30 CLS-08: a retired class can be kept, never newly chosen", () => {
  const RETIRED = "e0000000-0000-4000-8000-00000000ec99";
  const OTHER = "e0000000-0000-4000-8000-00000000ec02";

  /** Recorder whose class lookup answers a retired class and the stored class of the chauffeur. */
  function retiredRecorder(stored: string | null) {
    const calls: { text: string; values: unknown[] }[] = [];
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("$");
      calls.push({ text, values });
      if (/from public\.vehicle_classes/.test(text)) {
        return Promise.resolve([{ hidden_at: "2026-10-12T00:00:00Z", vehicle_class_id: stored }]);
      }
      return Promise.resolve([{ id: ID }]);
    };
    return { sql, calls };
  }
  const input = (vehicleClassId?: string) =>
    assertChauffeurInput(
      parseChauffeurBody({ name: "Marco", phone: "+41 79 111 11 11", plate: "ZH 111 111", ...(vehicleClassId ? { vehicleClassId } : {}) }).input,
    );

  it("update with a retired class that differs from the stored one is refused, nothing written", async () => {
    const r = retiredRecorder(OTHER);
    asStaff.mockImplementation(async (_e: unknown, _c: unknown, fn: (sql: unknown) => unknown) => fn(r.sql));
    const err = await updateChauffeurRow(env, claims, ID, input(RETIRED)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChauffeurInputError);
    expect((err as ChauffeurInputError).message).toBe("class-retired");
    expect(r.calls.some((c) => /update public\.chauffeurs/.test(c.text))).toBe(false);
  });

  it("update re-sending the stored retired class goes through", async () => {
    const r = retiredRecorder(RETIRED);
    asStaff.mockImplementation(async (_e: unknown, _c: unknown, fn: (sql: unknown) => unknown) => fn(r.sql));
    await expect(updateChauffeurRow(env, claims, ID, input(RETIRED))).resolves.toBe(true);
    expect(r.calls.some((c) => /update public\.chauffeurs/.test(c.text))).toBe(true);
  });

  it("update without a class does no class lookup and keeps the column", async () => {
    const r = retiredRecorder(RETIRED);
    asStaff.mockImplementation(async (_e: unknown, _c: unknown, fn: (sql: unknown) => unknown) => fn(r.sql));
    await updateChauffeurRow(env, claims, ID, input());
    expect(r.calls.some((c) => /from public\.vehicle_classes/.test(c.text))).toBe(false);
    expect(r.calls.find((c) => /update public\.chauffeurs/.test(c.text))?.text).toMatch(/then vehicle_class_id else/);
  });

  it("insert with a retired class is refused, nothing written", async () => {
    const r = retiredRecorder(null);
    asStaff.mockImplementation(async (_e: unknown, _c: unknown, fn: (sql: unknown) => unknown) => fn(r.sql));
    const err = await insertChauffeur(env, claims, null, input(RETIRED)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChauffeurInputError);
    expect((err as ChauffeurInputError).message).toBe("class-retired");
    expect(r.calls.some((c) => /insert into public\.chauffeurs/.test(c.text))).toBe(false);
  });
});
