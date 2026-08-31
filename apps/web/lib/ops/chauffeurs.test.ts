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
  licenceState,
  loadChauffeur,
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
      expect(entry.key).toBe(`ops.language.${entry.code}`);
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
  it("rejects an empty full_name, phone and licence_number", () => {
    expect(() => assertChauffeurInput(baseInput({ fullName: "  " }))).toThrow(ChauffeurInputError);
    expect(() => assertChauffeurInput(baseInput({ phone: "   " }))).toThrow(ChauffeurInputError);
    expect(() => assertChauffeurInput(baseInput({ licenceNumber: "" }))).toThrow(
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
          sqlText = strings.join(" ");
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
