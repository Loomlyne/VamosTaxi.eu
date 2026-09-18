// apps/web/lib/ops/settings.test.ts
//
// Pure validator / mapper cases. No Hyperdrive, no settings_versions write.

import { describe, expect, it, vi } from "vitest";

vi.mock("../db/identity", () => ({
  asStaff: vi.fn(),
}));
import {
  assertSettingsInput,
  mapSqlState,
  SettingsInputError,
  type SettingsInput,
} from "./settings";

function valid(over: Partial<SettingsInput> = {}): SettingsInput {
  return {
    company: "Vamos Taxi",
    address: "",
    uid_number: "",
    phone: "",
    email: "",
    default_lang: "en",
    default_currency: "CHF",
    accepts_cash: false,
    accepts_card: true,
    accepts_twint: true,
    accepts_invoice: false,
    email_confirmation: true,
    email_reminder: true,
    sms_reminder: false,
    ops_alerts: true,
    chauffeur_turnaround_minutes: 30,
    vat_rate_bps: 0,
    ...over,
  };
}

describe("assertSettingsInput", () => {
  it("accepts empty owner-owed fields", () => {
    expect(assertSettingsInput(valid()).uid_number).toBe("");
    expect(assertSettingsInput(valid()).email).toBe("");
    expect(assertSettingsInput(valid()).address).toBe("");
  });

  it("accepts a Swiss UID in CHE-###.###.### shape", () => {
    expect(assertSettingsInput(valid({ uid_number: "CHE-123.456.789" })).uid_number).toBe(
      "CHE-123.456.789",
    );
  });

  it("rejects a uid_number that is not Swiss UID shape", () => {
    expect(() => assertSettingsInput(valid({ uid_number: "CHE123456789" }))).toThrow(
      SettingsInputError,
    );
    try {
      assertSettingsInput(valid({ uid_number: "CHE123456789" }));
    } catch (err) {
      expect(err).toMatchObject({ field: "uid_number", copyId: "settings-error-uid" });
    }
  });

  it("rejects an email that is not an address", () => {
    try {
      assertSettingsInput(valid({ email: "not-an-address" }));
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toMatchObject({ field: "email", copyId: "settings-error-email" });
    }
  });

  it("rejects a default_lang outside en/de/fr/ar", () => {
    try {
      assertSettingsInput(valid({ default_lang: "it" as SettingsInput["default_lang"] }));
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toMatchObject({ field: "default_lang", copyId: "settings-error-lang" });
    }
  });

  it("rejects a negative chauffeur_turnaround_minutes", () => {
    try {
      assertSettingsInput(valid({ chauffeur_turnaround_minutes: -1 }));
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toMatchObject({
        field: "chauffeur_turnaround_minutes",
        copyId: "settings-error-turnaround",
      });
    }
  });
});

describe("mapSqlState", () => {
  it("maps 23514 and 23001 without reading a message", () => {
    expect(mapSqlState({ code: "23514", message: "ignore me" })).toEqual({
      kind: "check",
      copyId: "check-constraint",
    });
    expect(mapSqlState({ code: "23001", message: "ignore me" })).toEqual({
      kind: "append-only",
      copyId: "settings-error-append-only",
    });
    expect(mapSqlState({ code: "23505" })).toEqual({ kind: "unknown" });
  });
});
