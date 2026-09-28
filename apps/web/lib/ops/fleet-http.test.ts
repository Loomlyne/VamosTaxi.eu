// apps/web/lib/ops/fleet-http.test.ts
//
// Parse/present + SQLSTATE mapping for fleet JSON. No Hyperdrive.

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../db/identity", () => ({
  asStaff: vi.fn(),
}));

const createSupabaseServerClient = vi.fn();

vi.mock("../supabase/server", () => ({
  createSupabaseServerClient: (...args: unknown[]) => createSupabaseServerClient(...args),
  createServerSupabaseClient: (...args: unknown[]) => createSupabaseServerClient(...args),
}));

import { VehicleInputError } from "./fleet";
import { ChauffeurDuplicateEmailError, ChauffeurInputError } from "./chauffeurs-model";
import { jsonErr, jsonOk, withStaff } from "./staff-json";
import {
  chauffeurErrorCopy,
  chauffeurJsonError,
  fleetJsonError,
  klassToSlug,
  parseChauffeurBody,
  parseVehicleBody,
  parseVehicleClassPatch,
  presentChauffeur,
  presentVehicles,
  slugToKlass,
} from "./fleet-http";
import type { StaffAuthClient } from "./session";

function jwtWithRole(role?: "dispatcher" | "admin"): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify(role ? { app_metadata: { vamos_role: role } } : {}),
  ).toString("base64url");
  return `${header}.${payload}.sig`;
}

function mockClient(opts: {
  user: { id: string; email?: string | null; app_metadata?: { vamos_role?: unknown } } | null;
}): StaffAuthClient {
  const accessToken = jwtWithRole(
    opts.user?.app_metadata?.vamos_role === "dispatcher" || opts.user?.app_metadata?.vamos_role === "admin"
      ? opts.user.app_metadata.vamos_role
      : undefined,
  );
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.user }, error: null }),
      getSession: async () => ({
        data: { session: opts.user ? { access_token: accessToken } : null },
      }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1" } }),
      },
    },
  };
}

async function readJson(response: Response): Promise<{ status: number; type: string; body: unknown }> {
  return {
    status: response.status,
    type: response.headers.get("content-type") ?? "",
    body: await response.json(),
  };
}

describe("presentVehicles", () => {
  it("returns [] for an empty table", () => {
    expect(presentVehicles([])).toEqual([]);
  });

  it("maps slug to DC klass and photoPath to photo", () => {
    const presented = presentVehicles([
      {
        id: "11111111-1111-4111-8111-111111111111",
        vehicleClassId: "22222222-2222-4222-8222-222222222222",
        classSlug: "van",
        model: "V-Class",
        plate: "GE 1",
        firstRegistered: 2019,
        seats: 8,
        bags: 8,
        status: "service",
        photoPath: "vehicles/11111111-1111-4111-8111-111111111111/a.jpg",
        note: "",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        morningChauffeurId: null,
        nightChauffeurId: null,
      },
    ]);
    expect(presented[0]?.klass).toBe("Van luxury");
    expect(presented[0]?.year).toBe("2019");
    expect(presented[0]?.photo).toBe("vehicles/11111111-1111-4111-8111-111111111111/a.jpg");
    expect(JSON.stringify(presented)).not.toMatch(/CHF/);
  });
});

describe("parseVehicleBody", () => {
  it("accepts DC klass/year/photo and drops a non-uuid id", () => {
    const parsed = parseVehicleBody({
      id: "v-local",
      klass: "Business",
      model: "E-Class",
      plate: "ZH 123",
      year: "2018",
      seats: 3,
      bags: 3,
      photo: "vehicles/x/y.jpg",
    });
    expect(parsed.id).toBeNull();
    expect(parsed.classSlug).toBe("mercedes-benz-v-class");
    expect(parsed.input.firstRegistered).toBe(2018);
    expect(parsed.input.photoPath).toBe("vehicles/x/y.jpg");
  });

  it("rejects a data URI photo", () => {
    expect(() =>
      parseVehicleBody({
        klass: "Economy",
        model: "A",
        plate: "ZH 1",
        seats: 3,
        bags: 3,
        photo: "data:image/png;base64,aaa",
      }),
    ).toThrow(VehicleInputError);
  });

  it("does not treat First as a shipped class", () => {
    expect(klassToSlug("First")).toBeNull();
    expect(slugToKlass("economy")).toBe("Economy");
  });

  it("D-14: a vehicle save by class name lands on the live class slug", () => {
    for (const [klass, slug] of [
      ["Economy", "saden"],
      ["Business", "mercedes-benz-v-class"],
      ["Van luxury", "van-luxury"],
    ] as const) {
      const parsed = parseVehicleBody({ klass, model: "M", plate: "ZH 1", seats: 3, bags: 3 });
      expect(parsed.classSlug, klass).toBe(slug);
      expect(parsed.input.vehicleClassId).toBe("");
    }
    expect(parseVehicleBody({ classSlug: "van-luxury", model: "M" }).classSlug).toBe("van-luxury");
  });

  it("D-14: live and legacy slugs present as the three classes", () => {
    expect(slugToKlass("saden")).toBe("Economy");
    expect(slugToKlass("mercedes-benz-v-class")).toBe("Business");
    expect(slugToKlass("van-luxury")).toBe("Van luxury");
    expect(slugToKlass("van")).toBe("Van luxury");
    expect(slugToKlass("business")).toBe("Business");
  });
});

describe("parseVehicleClassPatch", () => {
  it("refuses a slug field", () => {
    expect(() =>
      parseVehicleClassPatch({
        id: "11111111-1111-4111-8111-111111111111",
        passengerCapacity: 3,
        luggageCapacity: 3,
        slug: "van",
      }),
    ).toThrow(/fleet-failure-slug/);
  });
});

describe("parseChauffeurBody", () => {
  it("maps DC name/licence/vehicle/languages", () => {
    const parsed = parseChauffeurBody({
      name: "Ada",
      phone: "+41 79 000 00 00",
      licence: "CH 1",
      vehicle: "11111111-1111-4111-8111-111111111111",
      languages: ["German", "English"],
    });
    expect(parsed.input.fullName).toBe("Ada");
    expect(parsed.input.licenceNumber).toBe("CH 1");
    expect(parsed.input.defaultVehicleId).toBe("11111111-1111-4111-8111-111111111111");
    expect(parsed.input.vehicleClassId).toBeNull();
    expect(parsed.input.languages).toEqual(["de", "en"]);
  });

  it("turns a display-language string and an empty vehicle id into codes and null", () => {
    const parsed = parseChauffeurBody({
      name: "Ada",
      phone: "+41 79 000 00 00",
      licence: "CH 1",
      defaultVehicleId: "",
      vehicle: "",
      vehicleClassId: "22222222-2222-4222-8222-222222222222",
      languages: "German, English",
    });
    expect(parsed.input.defaultVehicleId).toBeNull();
    expect(parsed.input.vehicleClassId).toBe("22222222-2222-4222-8222-222222222222");
    expect(parsed.input.languages).toEqual(["de", "en"]);
    expect(parsed.input.languages).not.toContain("German");
  });

  it("maps vehicleClassId onto the class column, not defaultVehicleId", () => {
    const parsed = parseChauffeurBody({
      name: "Ada",
      phone: "+41 79 000 00 00",
      licence: "",
      vehicleClassId: "22222222-2222-4222-8222-222222222222",
      defaultVehicleId: "11111111-1111-4111-8111-111111111111",
    });
    expect(parsed.input.vehicleClassId).toBe("22222222-2222-4222-8222-222222222222");
    expect(parsed.input.defaultVehicleId).toBe("11111111-1111-4111-8111-111111111111");
    expect(parsed.input.licenceNumber).toBe("");
  });
});

describe("fleetJsonError", () => {
  it("maps duplicate plate 23505 to JSON 409", async () => {
    const result = await readJson(fleetJsonError({ code: "23505" }));
    expect(result.status).toBe(409);
    expect(result.body).toEqual({ ok: false, code: "23505" });
  });

  it("maps class-has-vehicles 23503 to JSON 409", async () => {
    const result = await readJson(fleetJsonError({ code: "23503" }));
    expect(result.status).toBe(409);
    expect(result.body).toEqual({ ok: false, code: "23503" });
  });
});

describe("chauffeurJsonError", () => {
  it("maps missing vehicle 23503 to JSON 409 with a sentence", async () => {
    const result = await readJson(chauffeurJsonError({ code: "23503" }));
    expect(result.status).toBe(409);
    expect(result.body).toEqual({
      ok: false,
      code: "23503",
      message: "That vehicle is missing.",
    });
  });

  it("maps unique 23505 and check 23514 to sentences", async () => {
    const unique = await readJson(chauffeurJsonError({ code: "23505" }));
    expect(unique.status).toBe(409);
    expect(unique.body).toEqual({
      ok: false,
      code: "23505",
      message: "That value is already on file.",
    });
    const check = await readJson(chauffeurJsonError({ code: "23514" }));
    expect(check.body).toEqual({
      ok: false,
      code: "23514",
      message: "One of the fields is not a valid value.",
    });
  });

  it("maps ChauffeurInputError keys to exact copy, never a bare code", async () => {
    const result = await readJson(
      chauffeurJsonError(new ChauffeurInputError("chauffeurs-failure-licence-required")),
    );
    expect(result.status).toBe(400);
    expect(result.body).toEqual({
      ok: false,
      code: "chauffeurs-failure-licence-required",
      message: "Licence number is required.",
    });
    expect(JSON.stringify(result.body)).not.toMatch(/CHF/);
  });

  it("maps duplicate email to 409 with existingId (D-05)", async () => {
    const result = await readJson(
      chauffeurJsonError(new ChauffeurDuplicateEmailError("c-existing", "Ada Driver")),
    );
    expect(result.status).toBe(409);
    expect(result.body).toEqual({
      ok: false,
      code: "chauffeurs-duplicate-email",
      message: "This email is already on file.",
      existingId: "c-existing",
      fullName: "Ada Driver",
    });
  });

  // K38 (8e8ea9c): the code stays in the envelope; the sentence never echoes Postgres.
  it("maps unknown SQLSTATE to fixed copy with the code only in the envelope", async () => {
    const result = await readJson(chauffeurJsonError({ code: "42804" }));
    expect(result.status).toBe(500);
    expect(result.body).toEqual({
      ok: false,
      code: "42804",
      message: "The chauffeur could not be saved.",
    });
  });
});

describe("chauffeurErrorCopy", () => {
  it("covers validation, FK, unique, and licence keys", () => {
    expect(chauffeurErrorCopy("chauffeurs-failure-vehicle")).toBe("That vehicle is missing.");
    expect(chauffeurErrorCopy("22P02")).toMatch(/wrong type/);
  });

  it("covers duplicate email (D-05)", () => {
    expect(chauffeurErrorCopy("chauffeurs-duplicate-email")).toBe("This email is already on file.");
  });
});

describe("GET /api/staff/vehicles (withStaff door)", () => {
  const request = new Request("http://vamos.test/api/staff/vehicles");

  beforeEach(() => {
    createSupabaseServerClient.mockReset();
  });

  it("returns JSON 401 { ok: false, code: no-session } without cookies", async () => {
    createSupabaseServerClient.mockResolvedValue(mockClient({ user: null }));
    const result = await readJson(await withStaff(async () => jsonOk([]))(request));
    expect(result.status).toBe(401);
    expect(result.type).toMatch(/application\/json/);
    expect(result.body).toEqual({ ok: false, code: "no-session" });
  });

  it("authenticated empty list is JSON []", async () => {
    createSupabaseServerClient.mockResolvedValue(
      mockClient({
        user: {
          id: "55555555-5555-4555-8555-555555555555",
          email: "admin@vamos.test",
          app_metadata: { vamos_role: "admin" },
        },
      }),
    );
    const result = await readJson(await withStaff(async () => jsonOk(presentVehicles([])))(request));
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true, data: [] });
  });
});

describe("jsonErr photo upload non-staff", () => {
  it("not-staff is JSON 403", async () => {
    const result = await readJson(jsonErr("not-staff", 403));
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ ok: false, code: "not-staff" });
  });
});

describe("presentChauffeur", () => {
  const saved = {
    id: "017bc319-36d4-4cae-a6d2-198a4a53087b",
    fullName: "Koussay",
    phone: "+971509758018",
    email: null,
    defaultVehicleId: null,
    defaultVehiclePlate: null,
    vehicleClassId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    vehicleClassName: "Economy",
    licenceExpiresOn: null,
    languages: ["en"],
    status: "off" as const,
    photoPath: null,
    note: "",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    shiftWeekdays: [],
    shiftStart: null,
    shiftEnd: null,
    leaveRanges: [],
    licenceNumber: "CH 459 821",
  };

  it("puts the saved class name, phone, and licence on the list payload", () => {
    const json = presentChauffeur(saved);
    expect(json.vehicleClassName).toBe("Economy");
    expect(json.className).toBe("Economy");
    expect(json.name).toBe("Koussay");
    expect(json.phone).toBe("+971509758018");
    expect(json.licence).toBe("CH 459 821");
    expect(json.vehicleClassId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("does not invent a class name when none is saved", () => {
    const json = presentChauffeur({
      ...saved,
      vehicleClassId: null,
      vehicleClassName: null,
    });
    expect(json.vehicleClassName).toBe("");
    expect(json.className).toBe("");
  });
});
