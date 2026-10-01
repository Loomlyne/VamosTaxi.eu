// apps/web/lib/ops/vehicle-status-keep.test.ts
//
// Quick 261001-cars-page, signed 2026-10-01 (owner): the Cars page has no Status — no field, no
// column, no words. The vehicles.status column stays; the form no longer sends it: a save without
// a status keeps the stored one, and a new car gets the column's default (the insert does not
// name the column). An explicit status from another caller is still written. Nothing else reads
// vehicles.status (checked: ops_assign_leg, Assign, chauffeur desk, board); the only tie was the
// "off-road" mail on a switch to the workshop, which a save without a status never sends.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";

const asStaff = vi.fn();
vi.mock("../db/identity", () => ({ asStaff: (...a: unknown[]) => asStaff(...a) }));
vi.mock("../supabase/server", () => ({ createSupabaseServerClient: () => ({}), createServerSupabaseClient: () => ({}) }));

import { assertVehicleInput } from "./fleet";
import { parseVehicleBody } from "./fleet-http";
import { insertVehicle, updateVehicleRow } from "./fleet-write";

const env = {} as CloudflareEnv;
const claims: VamosClaims = { sub: "a0000000-0000-4000-8000-000000000015", role: "authenticated", app_metadata: { vamos_role: "admin" } };
const CAR = "87a4578f-0000-4000-8000-000000000013";
const CLASS = "e0000000-0000-4000-8000-00000000ec01";
const body = { vehicleClassId: CLASS, model: "Mercedes V-Class", plate: "ZH 000 000", seats: 6, bags: 6 };

function recorder(stored = "workshop") {
  const calls: { text: string; values: unknown[] }[] = [];
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("$");
    calls.push({ text, values });
    if (/from public\.vehicles/.test(text) && /for update/.test(text)) return Promise.resolve([{ status: stored, photo_path: null }]);
    if (/insert into public\.vehicles/.test(text)) return Promise.resolve([{ id: CAR }]);
    return Promise.resolve([]);
  };
  asStaff.mockImplementation(async (_e: unknown, _c: unknown, fn: (s: unknown) => unknown) => fn(sql));
  return calls;
}

beforeEach(() => {
  asStaff.mockReset();
});

describe("a car save without a status keeps the stored status", () => {
  it("the body without status parses to undefined, and stays undefined", () => {
    const parsed = parseVehicleBody(body);
    expect(parsed.input.status).toBeUndefined();
    expect(assertVehicleInput(parsed.input).status).toBeUndefined();
    expect(assertVehicleInput(parseVehicleBody({ ...body, status: "idle" }).input).status).toBe("idle");
  });

  it("update keeps the column when the form sent none, and sends no off-road mail", async () => {
    const calls = recorder("service");
    const saved = await updateVehicleRow(env, claims, CAR, assertVehicleInput(parseVehicleBody(body).input));
    expect(saved).toEqual({ found: true, mustFix: [], oldPhoto: null });
    const update = calls.find((c) => /update public\.vehicles set/.test(c.text));
    expect(update?.text).toMatch(/status = case when \$::boolean then status else \$::public\.vehicle_status end/);
    const at = update!.text.split("$").findIndex((part) => /status = case when $/.test(part));
    expect(update!.values[at]).toBe(true);
    expect(calls.some((c) => /from public\.booking_legs/.test(c.text))).toBe(false);
  });

  it("an explicit status from another caller is still written (and workshop still mails)", async () => {
    const calls = recorder("service");
    await updateVehicleRow(env, claims, CAR, assertVehicleInput(parseVehicleBody({ ...body, status: "workshop" }).input));
    const update = calls.find((c) => /update public\.vehicles set/.test(c.text));
    expect(update?.values).toContain(false);
    expect(update?.values).toContain("workshop");
    expect(calls.some((c) => /from public\.booking_legs/.test(c.text))).toBe(true);
  });
});

describe("a new car without a status gets the column's default", () => {
  it("the insert does not name the status column", async () => {
    const calls = recorder();
    await insertVehicle(env, claims, CAR, assertVehicleInput(parseVehicleBody(body).input));
    const insert = calls.find((c) => /insert into public\.vehicles/.test(c.text));
    expect(insert?.text).not.toMatch(/\bstatus\b/);
    expect(calls.some((c) => /update public\.vehicles set status/.test(c.text))).toBe(false);
  });

  it("an explicit status is written right after the insert", async () => {
    const calls = recorder();
    await insertVehicle(env, claims, null, assertVehicleInput(parseVehicleBody({ ...body, status: "idle" }).input));
    const set = calls.find((c) => /update public\.vehicles set status = \$::public\.vehicle_status where id = \$::uuid/.test(c.text));
    expect(set?.values).toEqual(["idle", CAR]);
  });
});
