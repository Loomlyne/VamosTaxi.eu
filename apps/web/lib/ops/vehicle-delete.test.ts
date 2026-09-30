// apps/web/lib/ops/vehicle-delete.test.ts
//
// Quick 261001-cars-page (owner, 2026-10-01): the Cars page deletes a car. His rule: refuse, in
// plain words, while a driver has the car or a trip that is not finished is assigned to it;
// otherwise delete it completely — the car row, its seat rows (cascade), its stored photo — and
// the finished trips that drove it drop the car (they keep their driver). Before this job a delete
// silently took the car from its driver (chauffeurs.default_vehicle_id on delete set null) and
// failed with a bare 23503 for any car that ever drove a trip (booking_legs restrict).
//
// Also here: PATCH of a car that is not in the table answers "gone" (it answered 200 "saved"),
// and a replaced or removed car photo is deleted from storage.
//
// asStaff is stood in; the statements are recorded the way postgres.js hands them over.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";

const asStaff = vi.fn();
vi.mock("../db/identity", () => ({ asStaff: (...a: unknown[]) => asStaff(...a) }));
vi.mock("../supabase/server", () => ({ createSupabaseServerClient: () => ({}), createServerSupabaseClient: () => ({}) }));

import { assertVehicleInput } from "./fleet";
import { parseVehicleBody, vehicleDeleteJson } from "./fleet-http";
import { deleteVehicleRow, updateVehicleRow } from "./fleet-write";
import { deleteVehiclePhoto } from "./vehicle-photo";

const env = {} as CloudflareEnv;
const claims: VamosClaims = { sub: "a0000000-0000-4000-8000-000000000015", role: "authenticated", app_metadata: { vamos_role: "admin" } };
const CAR = "87a4578f-0000-4000-8000-000000000013";
const CLASS = "e0000000-0000-4000-8000-00000000ec01";
const PHOTO = `vehicles/${CAR}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg`;

type Answer = (text: string, values: unknown[]) => unknown[] | undefined;

/** A postgres.js tag stand-in: records every statement; `answer` picks the rows it returns. */
function recorder(answer: Answer) {
  const calls: { text: string; values: unknown[] }[] = [];
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("$");
    calls.push({ text, values });
    return Promise.resolve(answer(text, values) ?? []);
  };
  asStaff.mockImplementation(async (_e: unknown, _c: unknown, fn: (s: unknown) => unknown) => fn(sql));
  return calls;
}

function world(opts: { car?: boolean; drivers?: string[]; open?: string[]; photo?: string | null; status?: string }) {
  return recorder((text) => {
    if (/from public\.vehicles/.test(text) && /for update/.test(text)) {
      return opts.car === false ? [] : [{ id: CAR, photo_path: opts.photo ?? null, status: opts.status ?? "service" }];
    }
    if (/from public\.chauffeurs/.test(text)) return (opts.drivers ?? []).map((full_name) => ({ full_name }));
    if (/from public\.booking_legs/.test(text) && /select/.test(text) && !/update public\.booking_legs/.test(text)) {
      return (opts.open ?? []).map((reference) => ({ reference }));
    }
    if (/update public\.booking_legs/.test(text)) return [{ id: "l1" }, { id: "l2" }];
    return [];
  });
}

beforeEach(() => {
  asStaff.mockReset();
});

describe("deleteVehicleRow — the owner's delete rule", () => {
  it("refuses while a driver has the car, names the driver, and deletes nothing", async () => {
    const calls = world({ drivers: ["Marco"] });
    const result = await deleteVehicleRow(env, claims, CAR);
    expect(result).toEqual({ kind: "in-use", drivers: ["Marco"], references: [] });
    expect(calls.some((c) => /delete from public\.vehicles/.test(c.text))).toBe(false);
    expect(calls.some((c) => /update public\.booking_legs/.test(c.text))).toBe(false);
  });

  it("refuses while a trip that is not finished uses the car, naming each reference once", async () => {
    const calls = world({ open: ["VT-26-0042", "VT-26-0042", "VT-26-0051"] });
    const result = await deleteVehicleRow(env, claims, CAR);
    expect(result).toEqual({ kind: "in-use", drivers: [], references: ["VT-26-0042", "VT-26-0051"] });
    expect(calls.some((c) => /delete from public\.vehicles/.test(c.text))).toBe(false);
    const open = calls.find((c) => /from public\.booking_legs/.test(c.text) && !/update/.test(c.text));
    // A trip counts as finished when its leg is cancelled, completed, no-show or refunded, or its
    // booking is; an erased booking is history too.
    expect(open?.text).toMatch(/l\.status not in \('cancelled', 'completed', 'no_show', 'refunded'\)/);
    expect(open?.text).toMatch(/b\.status not in \('cancelled', 'completed', 'no_show', 'refunded'\)/);
    expect(open?.text).toMatch(/b\.erased_at is null/);
  });

  it("locks the car row first, so an Assign cannot slip in between the check and the delete", async () => {
    const calls = world({});
    await deleteVehicleRow(env, claims, CAR);
    expect(calls[0]?.text).toMatch(/select[\s\S]*from public\.vehicles[\s\S]*for update/);
  });

  it("otherwise: finished trips drop the car, then the car row goes; the stored photo is handed back", async () => {
    const calls = world({ photo: PHOTO });
    const result = await deleteVehicleRow(env, claims, CAR);
    expect(result).toEqual({ kind: "deleted", photoPath: PHOTO, clearedLegs: 2 });
    const clear = calls.findIndex((c) => /update public\.booking_legs\s+set assigned_vehicle_id = null/.test(c.text));
    const del = calls.findIndex((c) => /delete from public\.vehicles where id = \$::uuid/.test(c.text));
    expect(clear).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(clear);
    // Only the car is taken off those trips — the driver stays.
    expect(calls[clear]?.text).not.toMatch(/assigned_chauffeur_id/);
    expect(calls[del]?.values).toEqual([CAR]);
  });

  it("a car that is not in the table answers gone", async () => {
    world({ car: false });
    expect(await deleteVehicleRow(env, claims, CAR)).toEqual({ kind: "gone" });
  });
});

describe("vehicleDeleteJson — what the dashboard gets back", () => {
  it("in use: 409 car-in-use with the driver names and references, and an English sentence", async () => {
    const res = vehicleDeleteJson({ kind: "in-use", drivers: ["Marco"], references: ["VT-26-0042"] }, CAR);
    expect(res.status).toBe(409);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ok: false, code: "fleet-car-in-use", drivers: ["Marco"], references: ["VT-26-0042"] });
    expect(String(body.message)).toMatch(/Marco/);
    expect(String(body.message)).toMatch(/VT-26-0042/);
  });

  it("gone: 404 fleet-car-gone; deleted: 200 with the id", async () => {
    const gone = vehicleDeleteJson({ kind: "gone" }, CAR);
    expect(gone.status).toBe(404);
    expect(await gone.json()).toMatchObject({ ok: false, code: "fleet-car-gone" });
    const ok = vehicleDeleteJson({ kind: "deleted", photoPath: null, clearedLegs: 0 }, CAR);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, data: { id: CAR } });
  });
});

describe("updateVehicleRow — a missing car is gone, a replaced photo is handed back", () => {
  const input = assertVehicleInput(
    parseVehicleBody({ vehicleClassId: CLASS, model: "Mercedes V-Class", plate: "ZH 000 000", seats: 6, bags: 6, photo: "" }).input,
  );

  it("answers found:false and writes nothing when the car is not in the table", async () => {
    const calls = world({ car: false });
    expect(await updateVehicleRow(env, claims, CAR, input)).toEqual({ found: false });
    expect(calls.some((c) => /update public\.vehicles set/.test(c.text))).toBe(false);
  });

  it("hands back the old photo key when the saved car no longer points at it", async () => {
    world({ photo: PHOTO });
    const saved = await updateVehicleRow(env, claims, CAR, input);
    expect(saved).toEqual({ found: true, mustFix: [], oldPhoto: PHOTO });
  });

  it("keeps the photo (hands back none) when the same key is saved again", async () => {
    world({ photo: PHOTO });
    const same = assertVehicleInput({ ...input, photoPath: PHOTO });
    expect(await updateVehicleRow(env, claims, CAR, same)).toEqual({ found: true, mustFix: [], oldPhoto: null });
  });
});

describe("deleteVehiclePhoto — deleted means gone from storage too", () => {
  it("deletes the photo and its small copies, nothing else", async () => {
    const del = vi.fn(async () => undefined);
    const keys = await deleteVehiclePhoto({ delete: del }, PHOTO);
    expect(keys).toEqual([PHOTO, `${PHOTO}.w640.webp`, `${PHOTO}.w1280.webp`]);
    expect(del).toHaveBeenCalledWith(keys);
  });

  it("touches no key outside vehicles/ and no empty key", async () => {
    const del = vi.fn(async () => undefined);
    expect(await deleteVehiclePhoto({ delete: del }, "classes/x/a.jpg")).toEqual([]);
    expect(await deleteVehiclePhoto({ delete: del }, "")).toEqual([]);
    expect(await deleteVehiclePhoto({ delete: del }, null)).toEqual([]);
    expect(await deleteVehiclePhoto({ delete: del }, "vehicles/../secret.jpg")).toEqual([]);
    expect(del).not.toHaveBeenCalled();
  });
});

describe("the vehicles/[id] route uses all of the above", () => {
  it("DELETE maps the result and removes the photo; PATCH answers gone and removes a replaced photo", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../../app/[locale]/(ops)/api/staff/vehicles/[id]/route.ts"), "utf8");
    expect(src).toMatch(/vehicleDeleteJson\(/);
    expect(src).toMatch(/removeVehiclePhoto\(env, result\.photoPath/);
    expect(src).toMatch(/if \(!saved\.found\) return jsonErr\("fleet-car-gone", 404/);
    expect(src).toMatch(/removeVehiclePhoto\(env, saved\.oldPhoto/);
  });
});
