// apps/web/lib/ops/chauffeurs.test.ts
//
// Licence-state (Europe/Zurich wall-clock), spoken-language gate, and the
// input validator. No Hyperdrive, no Docker.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";

const asStaff = vi.fn();

vi.mock("../db/identity", () => ({
  asStaff: (...args: unknown[]) => asStaff(...args),
}));

import {
  LICENCE_EXPIRING_WITHIN_DAYS,
  SPOKEN_LANGUAGES,
  assertChauffeurInput,
  emailsMatch,
  licenceState,
  loadChauffeur,
  loadChauffeurByEmail,
  loadChauffeurDetailsList,
  loadChauffeurs,
  ChauffeurInputError,
  type ChauffeurInput,
} from "./chauffeurs";

const env = {} as CloudflareEnv;

const claims: VamosClaims = {
  sub: "11111111-1111-4111-8111-111111111111",
  role: "authenticated",
  aal: "aal2",
  app_metadata: { vamos_role: "dispatcher" },
};

function baseInput(over: Partial<ChauffeurInput> = {}): ChauffeurInput {
  return {
    fullName: "Ada Driver",
    phone: "+41 79 000 00 01",
    email: null,
    defaultVehicleId: null,
    licenceNumber: "CHE-123",
    licenceExpiresOn: null,
    languages: ["de", "en"],
    status: "off",
    photoPath: null,
    note: "",
    ...over,
  };
}

describe("SPOKEN_LANGUAGES", () => {
  it("is a closed superset of the four platform locales plus Zurich operator codes", () => {
    const codes = SPOKEN_LANGUAGES.map((entry) => entry.code);
    expect(codes).toEqual([
      "en",
      "de",
      "fr",
      "ar",
      "it",
      "es",
      "pt",
      "ru",
      "tr",
      "sq",
      "hr",
      "pl",
    ]);
    for (const entry of SPOKEN_LANGUAGES) {
      expect(entry.key).toBe(`ops.spoken.${entry.code}`);
    }
  });
});

describe("LICENCE_EXPIRING_WITHIN_DAYS", () => {
  it("is the 60-day threshold the copy and the tests share", () => {
    expect(LICENCE_EXPIRING_WITHIN_DAYS).toBe(60);
  });
});

describe("licenceState", () => {
  it("returns unknown for a missing date", () => {
    expect(licenceState(null)).toBe("unknown");
  });

  it("returns expired for a date before the Zurich civil day", () => {
    const now = new Date("2026-09-01T10:00:00+02:00");
    expect(licenceState("2026-08-31", now)).toBe("expired");
  });

  it("returns expiring for today and for a date within 60 Zurich days", () => {
    const now = new Date("2026-09-01T10:00:00+02:00");
    expect(licenceState("2026-09-01", now)).toBe("expiring");
    expect(licenceState("2026-10-31", now)).toBe("expiring");
  });

  it("returns valid for a date more than 60 Zurich days out", () => {
    const now = new Date("2026-09-01T10:00:00+02:00");
    expect(licenceState("2026-11-01", now)).toBe("valid");
  });

  it("does not treat a licence that expires today as expired at 23:10 Zurich the day before", () => {
    const now = new Date("2026-08-31T23:10:00+02:00");
    expect(licenceState("2026-09-01", now)).not.toBe("expired");
  });

  it("marks expired at 00:10 Zurich the morning after the expiry date", () => {
    const now = new Date("2026-09-01T00:10:00+02:00");
    expect(licenceState("2026-08-31", now)).toBe("expired");
  });
});

describe("assertChauffeurInput", () => {
  it("rejects an empty full_name and phone, and stores a blank licence", () => {
    expect(() => assertChauffeurInput(baseInput({ fullName: "  " }))).toThrow(ChauffeurInputError);
    expect(() => assertChauffeurInput(baseInput({ phone: "   " }))).toThrow(ChauffeurInputError);
    expect(assertChauffeurInput(baseInput({ licenceNumber: "" })).licenceNumber).toBe("");
    expect(assertChauffeurInput(baseInput({ licenceNumber: "   " })).licenceNumber).toBe("");
  });

  it("stores an empty class as null and rejects a class id that is not a uuid", () => {
    expect(assertChauffeurInput(baseInput({ vehicleClassId: "" })).vehicleClassId).toBeNull();
    expect(assertChauffeurInput(baseInput({ vehicleClassId: null })).vehicleClassId).toBeNull();
    expect(() => assertChauffeurInput(baseInput({ vehicleClassId: "economy" }))).toThrow(
      ChauffeurInputError,
    );
  });

  it("rejects a languages entry outside SPOKEN_LANGUAGES", () => {
    expect(() => assertChauffeurInput(baseInput({ languages: ["de", "xx"] }))).toThrow(
      ChauffeurInputError,
    );
  });

  it("de-duplicates and sorts languages", () => {
    expect(assertChauffeurInput(baseInput({ languages: ["de", "en", "de"] })).languages).toEqual([
      "de",
      "en",
    ]);
  });

  it("accepts a null email, licence expiry and default vehicle", () => {
    const parsed = assertChauffeurInput(baseInput());
    expect(parsed.email).toBeNull();
    expect(parsed.licenceExpiresOn).toBeNull();
    expect(parsed.defaultVehicleId).toBeNull();
  });

  it("rejects a default vehicle that is not a uuid", () => {
    expect(() => assertChauffeurInput(baseInput({ defaultVehicleId: "2098890" }))).toThrow(
      ChauffeurInputError,
    );
  });

  it("normalises the phone to a single stored shape", () => {
    expect(assertChauffeurInput(baseInput({ phone: "+41 79 000 00 01" })).phone).toBe(
      "+41790000001",
    );
    expect(assertChauffeurInput(baseInput({ phone: "079 000 00 01" })).phone).toBe("+41790000001");
  });

  it("rejects a data URI in photo_path", () => {
    expect(() =>
      assertChauffeurInput(baseInput({ photoPath: "data:image/png;base64,xx" })),
    ).toThrow(ChauffeurInputError);
  });

  it("ignores a client status toggle — duty is computed, asserted status stays off (D-10)", () => {
    expect(assertChauffeurInput(baseInput({ status: "shift" })).status).toBe("off");
    expect(assertChauffeurInput(baseInput({ status: "leave" })).status).toBe("off");
  });
});

describe("emailsMatch (D-05)", () => {
  it("matches on lower(trim) and ignores empty", () => {
    expect(emailsMatch("Ada@Vamos.eu", " ada@vamos.eu ")).toBe(true);
    expect(emailsMatch("", "ada@vamos.eu")).toBe(false);
    expect(emailsMatch(null, null)).toBe(false);
  });
});

describe("loadChauffeurs", () => {
  beforeEach(() => {
    asStaff.mockReset();
  });

  it("does not select licence_number on the list projection", async () => {
    let sqlText = "";
    asStaff.mockImplementation(
      async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
        const sql = async (strings: TemplateStringsArray) => {
          sqlText += strings.join(" ");
          return [];
        };
        return fn(sql);
      },
    );
    await loadChauffeurs(env, claims);
    expect(sqlText).not.toMatch(/licence_number/);
    expect(sqlText).toMatch(/active desc/i);
    expect(sqlText).toMatch(/licence_expires_on asc nulls last/i);
  });
});

describe("loadChauffeur", () => {
  beforeEach(() => {
    asStaff.mockReset();
  });

  it("returns the licence number on the detail record", async () => {
    asStaff.mockImplementation(
      async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
        const sql = async () => [
          {
            id: "c1",
            full_name: "Ada Driver",
            phone: "+41790000001",
            email: null,
            default_vehicle_id: null,
            default_vehicle_plate: null,
            licence_number: "CHE-123",
            licence_expires_on: null,
            languages: ["de"],
            status: "off",
            photo_path: null,
            note: "",
            active: true,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
        ];
        return fn(sql);
      },
    );
    const row = await loadChauffeur(env, claims, "c1");
    expect(row?.licenceNumber).toBe("CHE-123");
  });
});

describe("loadChauffeurByEmail", () => {
  beforeEach(() => {
    asStaff.mockReset();
  });

  it("returns null without querying when email is empty", async () => {
    asStaff.mockImplementation(async () => {
      throw new Error("should not query");
    });
    expect(await loadChauffeurByEmail(env, claims, "  ")).toBeNull();
    expect(asStaff).not.toHaveBeenCalled();
  });

  it("selects by lower(trim(email))", async () => {
    let sqlText = "";
    asStaff.mockImplementation(
      async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
        const sql = async (strings: TemplateStringsArray) => {
          sqlText += strings.join(" ");
          return [];
        };
        return fn(sql);
      },
    );
    await loadChauffeurByEmail(env, claims, "Ada@Vamos.eu");
    expect(sqlText).toMatch(/lower\(trim\(c\.email\)\)/);
  });
});

describe("loadChauffeurDetailsList", () => {
  beforeEach(() => {
    asStaff.mockReset();
  });

  function staffReturning(row: Record<string, unknown>) {
    asStaff.mockImplementation(
      async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
        const sql = async (strings: TemplateStringsArray) => {
          const text = strings.join(" ");
          if (text.includes("vehicle_class_name") || text.includes("cls.name")) return [row];
          return [];
        };
        return fn(sql);
      },
    );
  }

  it("selects the saved class name and keeps name, phone, class, and licence on the row", async () => {
    let sqlText = "";
    asStaff.mockImplementation(
      async (_env: unknown, _claims: unknown, fn: (sql: unknown) => Promise<unknown>) => {
        const sql = async (strings: TemplateStringsArray) => {
          sqlText += strings.join(" ");
          if (!strings.join(" ").includes("vehicle_class_name")) return [];
          return [
            {
              id: "017bc319-36d4-4cae-a6d2-198a4a53087b",
              full_name: "Koussay",
              phone: "+971509758018",
              email: null,
              default_vehicle_id: null,
              default_vehicle_plate: null,
              vehicle_class_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              vehicle_class_name: "Economy",
              licence_number: "CH 459 821",
              licence_expires_on: null,
              languages: ["en"],
              status: "off",
              photo_path: null,
              note: "",
              active: true,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
            },
          ];
        };
        return fn(sql);
      },
    );
    const rows = await loadChauffeurDetailsList(env, claims);
    expect(sqlText).toMatch(/cls\.name as vehicle_class_name/);
    expect(sqlText).toMatch(/c\.phone/);
    expect(sqlText).toMatch(/c\.licence_number/);
    expect(rows[0]?.fullName).toBe("Koussay");
    expect(rows[0]?.phone).toBe("+971509758018");
    expect(rows[0]?.vehicleClassName).toBe("Economy");
    expect(rows[0]?.vehicleClassId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(rows[0]?.licenceNumber).toBe("CH 459 821");
  });

  it("does not drop a saved class when the driver returns camelCase columns", async () => {
    staffReturning({
      id: "c-camel",
      fullName: "Koussay",
      phone: "+971509758018",
      vehicleClassId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      vehicleClassName: "Economy",
      licenceNumber: "CH 459 821",
      status: "off",
      languages: ["en"],
      note: "",
      active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    const rows = await loadChauffeurDetailsList(env, claims);
    expect(rows[0]?.vehicleClassName).toBe("Economy");
    expect(rows[0]?.phone).toBe("+971509758018");
    expect(rows[0]?.licenceNumber).toBe("CH 459 821");
  });

  it("leaves the class empty when none is saved", async () => {
    staffReturning({
      id: "c-empty",
      full_name: "Koussay",
      phone: "+971509758018",
      vehicle_class_id: null,
      vehicle_class_name: null,
      licence_number: "CH 459 821",
      status: "off",
      languages: [],
      note: "",
      active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    const rows = await loadChauffeurDetailsList(env, claims);
    expect(rows[0]?.vehicleClassName).toBeNull();
    expect(rows[0]?.vehicleClassId).toBeNull();
  });
});
