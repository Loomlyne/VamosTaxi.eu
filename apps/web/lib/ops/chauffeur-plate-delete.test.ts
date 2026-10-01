// apps/web/lib/ops/chauffeur-plate-delete.test.ts
//
// Quick 261001-chauffeur-car, owner decisions 2026-10-01 (.planning/decisions/2026-10-01-no-cars-page.md):
//   - each chauffeur carries a plate number (chauffeurs.plate, 20261007160000): trimmed, case kept,
//     REQUIRED, and two chauffeurs may share one (decision 7); the write and read paths carry it;
//   - deleting a chauffeur (decision 7) keeps his row for his finished trips; his trips that are
//     not finished go back to unassigned (ops_delete_chauffeur, asSystem); he leaves every list;
//   - his profile reads every booking he was ever assigned to, newest first, the ones he was taken
//     off marked as such (booking_legs + assignment events, read-only).
//
// asStaff is stood in with a recording sql tag; no database.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";

const asStaff = vi.fn();
const asSystem = vi.fn();

vi.mock("../db/identity", () => ({
  asStaff: (...args: unknown[]) => asStaff(...args),
  asSystem: (...args: unknown[]) => asSystem(...args),
}));

import { assertChauffeurInput, ChauffeurInputError, loadChauffeur, loadChauffeurByEmail, loadChauffeurDetailsList, loadChauffeurs, type ChauffeurInput } from "./chauffeurs";
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
  asSystem.mockReset();
});

// ── plate on the chauffeur ──────────────────────────────────────────────────────────────────
describe("the plate number on the chauffeur", () => {
  it("is trimmed and keeps its case; absent means keep the stored one", () => {
    expect(assertChauffeurInput(baseInput({ plate: "  zh 123 456 " })).plate).toBe("zh 123 456");
    expect(assertChauffeurInput(baseInput()).plate).toBeUndefined();
  });

  it("is required: empty is refused in the existing words (decision 7)", () => {
    for (const plate of ["", "   ", null]) {
      expect(() => assertChauffeurInput(baseInput({ plate }))).toThrow("chauffeurs-failure-plate-required");
    }
    expect(chauffeurErrorCopy("chauffeurs-failure-plate-required")).toBe("Plate number is required.");
  });

  it("a new chauffeur without a plate is refused before any write", async () => {
    const rec = recorder([]);
    runWith(rec);
    await expect(insertChauffeur(env, claims, null, assertChauffeurInput(baseInput()))).rejects.toThrow("chauffeurs-failure-plate-required");
    expect(rec.calls).toHaveLength(0);
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

  it("two chauffeurs may share a plate: no plate-taken refusal is left in the JSON door", () => {
    const src = readFileSync(fileURLToPath(new URL("./fleet-http.ts", import.meta.url)), "utf8");
    expect(src).not.toMatch(/chauffeurs-plate-taken|chauffeurs_plate_active_key/);
  });
});

// ── delete a chauffeur ──────────────────────────────────────────────────────────────────────
type SysCall = { text: string; values: unknown[] };
function systemWith(rows: unknown[] | Error) {
  const calls: SysCall[] = [];
  asSystem.mockImplementation(async (_env: unknown, fn: (sql: unknown) => Promise<unknown>) =>
    fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ text: strings.join("?").replace(/\s+/g, " ").trim(), values });
      return rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows);
    }),
  );
  return calls;
}

describe("deleting a chauffeur (decision 7)", () => {
  it("runs ops_delete_chauffeur as the system role with his id and the owner as actor", async () => {
    const calls = systemWith([{ reference: "VT-26-0050" }, { reference: "VT-26-0051" }]);
    await expect(deleteChauffeurRow(env, claims, MARCO)).resolves.toEqual({
      kind: "deleted",
      unassigned: ["VT-26-0050", "VT-26-0051"],
    });
    expect(calls[0]?.text).toMatch(/select reference from public\.ops_delete_chauffeur\(\?::uuid, \?::uuid\)/);
    expect(calls[0]?.values).toEqual([MARCO, claims.sub]);
    expect(asStaff).not.toHaveBeenCalled();
  });

  it("a chauffeur who is not there (or already deleted) answers gone — mapped around the wrapper", async () => {
    systemWith(Object.assign(new Error("not-found"), { code: "P0002" }));
    await expect(deleteChauffeurRow(env, claims, MARCO)).resolves.toEqual({ kind: "gone" });
  });

  it("any other failure is thrown (the route answers 500 in words)", async () => {
    systemWith(Object.assign(new Error("boom"), { code: "08006" }));
    await expect(deleteChauffeurRow(env, claims, MARCO)).rejects.toThrow("boom");
  });

  it("no mail goes to him: the delete path sends nothing", () => {
    const src = readFileSync(fileURLToPath(new URL("./chauffeurs-write.ts", import.meta.url)), "utf8");
    expect(src).not.toMatch(/sendChauffeur|notify/);
  });

  it("the route answers 404 when gone, 200 with the trips taken off him", async () => {
    expect(chauffeurDeleteJson(MARCO, { kind: "gone" }).status).toBe(404);
    const ok = chauffeurDeleteJson(MARCO, { kind: "deleted", unassigned: ["VT-26-0050"] });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { data?: unknown }).data).toEqual({ id: MARCO, unassigned: ["VT-26-0050"] });
  });

  it("the DELETE route uses that answer", () => {
    const route = readFileSync(
      fileURLToPath(new URL("../../app/[locale]/(ops)/api/staff/chauffeurs/[id]/route.ts", import.meta.url)),
      "utf8",
    );
    expect(route).toMatch(/const result = await deleteChauffeurRow\(env, claims, id\)/);
    expect(route).toMatch(/return chauffeurDeleteJson\(id, result\)/);
  });

  it("a deleted chauffeur leaves every dashboard read and cannot be edited", async () => {
    const rec = recorder([]);
    runWith(rec);
    await loadChauffeurs(env, claims);
    await loadChauffeurDetailsList(env, claims);
    await loadChauffeur(env, claims, MARCO);
    await loadChauffeurByEmail(env, claims, "marco@example.test");
    const reads = rec.calls.filter((c) => /from public\.chauffeurs c/.test(c.text));
    expect(reads).toHaveLength(4);
    for (const r of reads) expect(r.text).toMatch(/c\.deleted_at is null/);
    await updateChauffeurRow(env, claims, MARCO, assertChauffeurInput(baseInput({ plate: "ZH 1" })));
    const upd = rec.calls.find((c) => /update public\.chauffeurs set full_name/.test(c.text));
    expect(upd?.text).toMatch(/where id = \? and deleted_at is null/);
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
