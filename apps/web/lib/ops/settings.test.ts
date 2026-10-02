// apps/web/lib/ops/settings.test.ts
//
// Pure validator / mapper cases. No Hyperdrive, no settings_versions write.

import { describe, expect, it, vi } from "vitest";

vi.mock("../db/identity", () => ({
  asStaff: vi.fn(),
}));
import {
  assertPolicyDraftInput,
  assertSettingsInput,
  mapSqlState,
  policyDraftChanges,
  SettingsInputError,
  type PolicyDraftInput,
  type PolicyVersionRow,
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

// ---------------------------------------------------------------------------
// The policy draft (owner, 2026-10-02). Pure cases only — no DB, no publish.
// ---------------------------------------------------------------------------

describe("assertPolicyDraftInput", () => {
  const draft = (over: Partial<PolicyDraftInput> = {}): PolicyDraftInput => ({
    min_advance_minutes: 180,
    free_cancel_hours: 24,
    airport_waiting_minutes: 60,
    city_waiting_minutes: 30,
    ...over,
  });

  it("keeps whole numbers inside the bounds", () => {
    expect(assertPolicyDraftInput(draft())).toEqual(draft());
  });

  it("keeps null — a box he has not filled in is not a zero", () => {
    expect(assertPolicyDraftInput(draft({ city_waiting_minutes: null })).city_waiting_minutes).toBeNull();
  });

  it("allows a real zero", () => {
    expect(assertPolicyDraftInput(draft({ free_cancel_hours: 0 })).free_cancel_hours).toBe(0);
  });

  it("refuses a fraction rather than rounding it", () => {
    expect(() => assertPolicyDraftInput(draft({ city_waiting_minutes: 30.5 }))).toThrow(
      SettingsInputError,
    );
  });

  it("refuses a negative waiting time", () => {
    expect(() => assertPolicyDraftInput(draft({ airport_waiting_minutes: -1 }))).toThrow(
      SettingsInputError,
    );
  });

  it("refuses more than a day of waiting", () => {
    expect(() => assertPolicyDraftInput(draft({ airport_waiting_minutes: 1441 }))).toThrow(
      SettingsInputError,
    );
  });

  it("names the field and a copy id, so the page can say which box is wrong", () => {
    try {
      assertPolicyDraftInput(draft({ min_advance_minutes: -5 }));
      throw new Error("should have refused");
    } catch (err) {
      expect(err).toBeInstanceOf(SettingsInputError);
      expect((err as SettingsInputError).field).toBe("min_advance_minutes");
      expect((err as SettingsInputError).copyId).toBe("settings-error-min-advance");
    }
  });
});

describe("policyDraftChanges", () => {
  const live = {
    min_advance_minutes: 180,
    free_cancel_hours: 24,
    airport_waiting_minutes: 60,
    city_waiting_minutes: 15,
  } as unknown as PolicyVersionRow;

  const draft: PolicyDraftInput = {
    min_advance_minutes: 180,
    free_cancel_hours: 24,
    airport_waiting_minutes: 60,
    city_waiting_minutes: 15,
  };

  it("finds nothing when the draft is what is live", () => {
    expect(policyDraftChanges(draft, live)).toEqual([]);
  });

  it("names the one value that moved — the real case: /terms promises 30, live grants 15", () => {
    expect(policyDraftChanges({ ...draft, city_waiting_minutes: 30 }, live)).toEqual([
      { field: "city_waiting_minutes", from: 15, to: 30 },
    ]);
  });

  it("treats a cleared box as a change, not as 'same'", () => {
    expect(policyDraftChanges({ ...draft, free_cancel_hours: null }, live)).toEqual([
      { field: "free_cancel_hours", from: 24, to: null },
    ]);
  });

  it("with no live version every filled value is a change", () => {
    expect(policyDraftChanges(draft, null)).toHaveLength(4);
  });
});
