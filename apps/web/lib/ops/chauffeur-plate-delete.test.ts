// apps/web/lib/ops/chauffeur-plate-delete.test.ts
//
// Quick 261001-chauffeur-car, owner decisions 2026-10-01 (.planning/decisions/2026-10-01-no-cars-page.md):
//   - each chauffeur carries a plate number (chauffeurs.plate, 20261007160000): trimmed, case kept,
//     unique among active chauffeurs; the write and read paths carry it;
//   - deleting a chauffeur is refused while an unfinished trip has him (names and references in the
//     answer); otherwise he is deleted completely and his finished trips keep their record without him;
//   - his profile reads every booking he was ever assigned to, newest first, the ones he was taken
//     off marked as such (booking_legs + assignment events, read-only).
//
// asStaff is stood in with a recording sql tag; no database.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";

const asStaff = vi.fn();

vi.mock("../db/identity", () => ({
  asStaff: (...args: unknown[]) => asStaff(...args),
}));

import { assertChauffeurInput, ChauffeurInputError, type ChauffeurInput } from "./chauffeurs";
import { chauffeurDeleteJson, chauffeurErrorCopy, chauffeurJsonError, parseChauffeurBody, presentChauffeur } from "./fleet-http";
import { deleteChauffeurRow, insertChauffeur, updateChauffeurRow } from "./chauffeurs-write";
import { loadChauffeurHistory } from "./chauffeur-history";

const env = {} as CloudflareEnv;
const claims: VamosClaims = {
  sub: "11111111-1111-4111-8111-111111111111",
  role: "authenticated",
  aal: "aal2",
  app_metadata: { vamos_role: "admin" },
};
const MARCO = "c0000000-0000-4000-8000-00000000aa01";

function baseInput(over: Partial<ChauffeurInput> = {}): ChauffeurInput {
  return {
    fullName: "Marco Rossi",
    phone: "+41 79 000 00 01",
    email: "marco@example.test",
    defaultVehicleId: null,
    licenceNumber: "CH 000 000",
    languages: ["de", "en"],
    ...over,
  };
}

type Call = { text: string; values: unknown[] };
/** A sql tag that records every statement and answers by the first matching rule. */
function recorder(rules: { match: RegExp; rows: unknown[] }[]) {
  const calls: Call[] = [];
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    const hit = rules.find((r) => r.match.test(text));
    return Promise.resolve(hit ? hit.rows : []);
  };
  return { sql, calls };
}
function runWith(rec: ReturnType<typeof recorder>) {
  asStaff.mockImplementation(async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) => fn(rec.sql));
}

beforeEach(() => {
  asStaff.mockReset();
});

// ── plate on the chauffeur ──────────────────────────────────────────────────────────────────
describe("the plate number on the chauffeur", () => {
  it("is trimmed, keeps its case, empty means none, absent means keep", () => {
    expect(assertChauffeurInput(baseInput({ plate: "  zh 123 456 " })).plate).toBe("zh 123 456");
    expect(assertChauffeurInput(baseInput({ plate: "   " })).plate).toBeNull();
    expect(assertChauffeurInput(baseInput({ plate: null })).plate).toBeNull();
    expect(assertChauffeurInput(baseInput()).plate).toBeUndefined();
  });

  it("refuses a plate longer than the column allows", () => {
    expect(() => assertChauffeurInput(baseInput({ plate: "X".repeat(33) }))).toThrow(ChauffeurInputError);
    expect(() => assertChauffeurInput(baseInput({ plate: "X".repeat(33) }))).toThrow("chauffeurs-failure-plate");
    expect(chauffeurErrorCopy("chauffeurs-failure-plate")).toBe("The plate number is too long.");
  });

  it("the JSON door reads plate when sent, and leaves it out when not", () => {
    expect(parseChauffeurBody({ name: "Marco", phone: "+41 79 000 00 01", plate: "ZH 1" }).input.plate).toBe("ZH 1");
    expect(parseChauffeurBody({ name: "Marco", phone: "+41 79 000 00 01", plate: "" }).input.plate).toBeNull();
    expect(parseChauffeurBody({ name: "Marco", phone: "+41 79 000 00 01" }).input.plate).toBeUndefined();
  });

  it("the dashboard gets the plate back", () => {
    const row = presentChauffeur({
      id: MARCO,
      fullName: "Marco Rossi",
      phone: "+41790000001",
      email: null,
      defaultVehicleId: null,
      defaultVehiclePlate: null,
      vehicleClassId: null,
      vehicleClassName: null,
      plate: "ZH 123 456",
      licenceExpiresOn: null,
      languages: [],
      status: "off",
      photoPath: null,
      note: "",
      active: true,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
      shiftWeekdays: [],
      shiftStart: null,
      shiftEnd: null,
      leaveRanges: [],
    });
    expect(row.plate).toBe("ZH 123 456");
  });

  it("insert writes the plate; update writes it, or keeps the column when the form sent none", async () => {
    const rec = recorder([{ match: /insert into public\.chauffeurs/, rows: [{ id: MARCO }] }, { match: /update public\.chauffeurs set full_name/, rows: [{ id: MARCO }] }]);
    runWith(rec);
    await insertChauffeur(env, claims, null, assertChauffeurInput(baseInput({ plate: "ZH 123 456" })));
    const insert = rec.calls.find((c) => /insert into public\.chauffeurs/.test(c.text));
    expect(insert?.text).toMatch(/plate/);
    expect(insert?.values).toContain("ZH 123 456");
    await updateChauffeurRow(env, claims, MARCO, assertChauffeurInput(baseInput({ plate: "ZH 9" })));
    const mainUpdate = () => rec.calls.filter((c) => /update public\.chauffeurs set full_name/.test(c.text)).at(-1);
    const update = mainUpdate();
    expect(update?.text).toMatch(/plate = case when \?::boolean then plate else \?::text end/);
    expect(update?.values).toContain("ZH 9");
    expect(update?.values).toContain(false);
    await updateChauffeurRow(env, claims, MARCO, assertChauffeurInput(baseInput()));
    const keep = mainUpdate();
    expect(keep?.values).toContain(true);
  });

  it("a plate another active chauffeur has comes back as plain words, not a 500", async () => {
    const err = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
      constraint_name: "chauffeurs_plate_active_key",
    });
    const res = chauffeurJsonError(err);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code?: string; error?: string; message?: string };
    expect(body.code ?? body.error).toBe("chauffeurs-plate-taken");
    expect(body.message).toBe("Another chauffeur already has this plate number.");
  });
});

// ── delete a chauffeur ──────────────────────────────────────────────────────────────────────
describe("deleting a chauffeur", () => {
  it("locks his row first and answers gone when he is not there", async () => {
    const rec = recorder([]);
    runWith(rec);
    await expect(deleteChauffeurRow(env, claims, MARCO)).resolves.toEqual({ kind: "gone" });
    expect(rec.calls[0]?.text).toMatch(/from public\.chauffeurs where id = \?::uuid for update/);
    expect(rec.calls.some((c) => /delete from public\.chauffeurs/.test(c.text))).toBe(false);
  });

  it("is refused while an unfinished trip has him — names and references, nothing written", async () => {
    const rec = recorder([
      { match: /from public\.chauffeurs where id/, rows: [{ id: MARCO, full_name: "Marco Rossi" }] },
      { match: /from public\.booking_legs as l join public\.bookings as b/, rows: [{ reference: "VT-26-0042" }, { reference: "VT-26-0043" }, { reference: "VT-26-0042" }] },
    ]);
    runWith(rec);
    await expect(deleteChauffeurRow(env, claims, MARCO)).resolves.toEqual({
      kind: "in-use",
      name: "Marco Rossi",
      references: ["VT-26-0042", "VT-26-0043"],
    });
    const open = rec.calls.find((c) => /from public\.booking_legs as l join public\.bookings as b/.test(c.text));
    // Unfinished = the leg and the booking are not closed — a trip whose pickup passed but that is
    // not Complete, No-show or Cancelled still blocks (the rule of the rejected Cars branch).
    expect(open?.text).toMatch(/l\.assigned_chauffeur_id = \?::uuid/);
    expect(open?.text).toMatch(/l\.status not in \('cancelled', 'completed', 'no_show', 'refunded'\)/);
    expect(open?.text).toMatch(/b\.status not in \('cancelled', 'completed', 'no_show', 'refunded'\)/);
    expect(open?.text).not.toMatch(/scheduled_at\s*>/);
    expect(rec.calls.some((c) => /update public\.booking_legs/.test(c.text))).toBe(false);
    expect(rec.calls.some((c) => /delete from public\.chauffeurs/.test(c.text))).toBe(false);
  });

  it("otherwise his finished trips let go of him and he is deleted completely", async () => {
    const rec = recorder([
      { match: /from public\.chauffeurs where id/, rows: [{ id: MARCO, full_name: "Marco Rossi" }] },
      { match: /update public\.booking_legs/, rows: [{ id: "l1" }, { id: "l2" }] },
    ]);
    runWith(rec);
    await expect(deleteChauffeurRow(env, claims, MARCO)).resolves.toEqual({ kind: "deleted", clearedLegs: 2 });
    const texts = rec.calls.map((c) => c.text);
    const clear = texts.findIndex((t) => /update public\.booking_legs set assigned_chauffeur_id = null where assigned_chauffeur_id = \?::uuid/.test(t));
    const del = texts.findIndex((t) => /delete from public\.chauffeurs where id = \?::uuid/.test(t));
    expect(clear).toBeGreaterThan(0);
    expect(del).toBeGreaterThan(clear);
    expect(texts.some((t) => /public\.vehicles/.test(t))).toBe(false);
  });

  it("the route answers 409 with plain words, 404 when gone, 200 when deleted", async () => {
    const refused = chauffeurDeleteJson(MARCO, { kind: "in-use", name: "Marco Rossi", references: ["VT-26-0042"] });
    expect(refused.status).toBe(409);
    const body = (await refused.json()) as Record<string, unknown>;
    expect(body.code ?? body.error).toBe("chauffeur-in-use");
    expect(body.name).toBe("Marco Rossi");
    expect(body.references).toEqual(["VT-26-0042"]);
    expect(body.message).toBe("Marco Rossi still has trips that are not finished: VT-26-0042. Assign them to another driver first.");
    expect(chauffeurDeleteJson(MARCO, { kind: "gone" }).status).toBe(404);
    const ok = chauffeurDeleteJson(MARCO, { kind: "deleted", clearedLegs: 0 });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { data?: { id?: string } }).data?.id).toBe(MARCO);
  });

  it("the DELETE route uses that answer (no bare 23503)", () => {
    const route = readFileSync(
      fileURLToPath(new URL("../../app/[locale]/(ops)/api/staff/chauffeurs/[id]/route.ts", import.meta.url)),
      "utf8",
    );
    expect(route).toMatch(/const result = await deleteChauffeurRow\(env, claims, id\)/);
    expect(route).toMatch(/return chauffeurDeleteJson\(id, result\)/);
  });
});

// ── the chauffeur's bookings history ────────────────────────────────────────────────────────
describe("the chauffeur's bookings history (read-only)", () => {
  it("reads his current legs and every assignment event naming him, skips erased bookings", async () => {
    const rec = recorder([]);
    runWith(rec);
    await loadChauffeurHistory(env, claims, MARCO);
    const text = rec.calls.map((c) => c.text).join("\n");
    expect(text).toMatch(/l\.assigned_chauffeur_id = \?::uuid/);
    expect(text).toMatch(/e\.kind = 'assignment\.chauffeur_set'/);
    expect(text).toMatch(/e\.payload ->> 'chauffeur_id' = \?/);
    expect(text).toMatch(/b\.erased_at is null/);
    expect(text).not.toMatch(/\b(insert|update|delete)\b/i);
  });

  it("newest first; a booking he was taken off is marked, the one he has now is not", async () => {
    const rec = recorder([
      {
        match: /select/,
        rows: [
          {
            booking_id: "b1",
            reference: "VT-26-0040",
            status: "completed",
            pickup_text: "Zurich Airport (ZRH)",
            dropoff_text: "Bahnhofstrasse 1, Zurich",
            scheduled_local: "2026-09-20T08:00",
            scheduled_at: "2026-09-20T06:00:00.000Z",
            is_current: true,
          },
          {
            booking_id: "b2",
            reference: "VT-26-0050",
            status: "assigned",
            pickup_text: "Zurich HB",
            dropoff_text: "Zurich Airport (ZRH)",
            scheduled_local: "2026-10-05T14:30",
            scheduled_at: "2026-10-05T12:30:00.000Z",
            is_current: false,
          },
        ],
      },
    ]);
    runWith(rec);
    await expect(loadChauffeurHistory(env, claims, MARCO)).resolves.toEqual([
      {
        bookingId: "b2",
        reference: "VT-26-0050",
        status: "assigned",
        pickup: "Zurich HB",
        dropoff: "Zurich Airport (ZRH)",
        date: "2026-10-05",
        time: "14:30",
        takenOff: true,
      },
      {
        bookingId: "b1",
        reference: "VT-26-0040",
        status: "completed",
        pickup: "Zurich Airport (ZRH)",
        dropoff: "Bahnhofstrasse 1, Zurich",
        date: "2026-09-20",
        time: "08:00",
        takenOff: false,
      },
    ]);
  });

  it("is served read-only at GET /api/staff/chauffeurs/:id/bookings on both mounts", () => {
    const route = readFileSync(
      fileURLToPath(new URL("../../app/[locale]/(ops)/api/staff/chauffeurs/[id]/bookings/route.ts", import.meta.url)),
      "utf8",
    );
    expect(route).toMatch(/export async function GET/);
    expect(route).not.toMatch(/export (async function|const) (POST|PATCH|PUT|DELETE)/);
    expect(route).toMatch(/withStaff/);
    expect(route).toMatch(/loadChauffeurHistory/);
    const mount = readFileSync(
      fileURLToPath(new URL("../../app/api/staff/chauffeurs/[id]/bookings/route.ts", import.meta.url)),
      "utf8",
    );
    expect(mount).toMatch(/export \{ GET \} from/);
  });
});
