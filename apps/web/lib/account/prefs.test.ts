import { describe, expect, it } from "vitest";
import {
  OFFERS_TOPIC_ID,
  RECEIPTS_TOPIC_ID,
  nameParts,
  parsePrefsBody,
  prefsFromMetadata,
  prefsToMetadata,
  topicsFromPrefs,
} from "./prefs";

describe("account mail prefs", () => {
  it("defaults receipts on and offers off until the account has saved", () => {
    expect(prefsFromMetadata(undefined)).toEqual({
      prefs: { receipts: true, offers: false },
      synced: false,
    });
    expect(prefsFromMetadata({})).toEqual({
      prefs: { receipts: true, offers: false },
      synced: false,
    });
  });

  it("reads string flags from user metadata", () => {
    expect(prefsFromMetadata({ receipts: "false", offers: "true" })).toEqual({
      prefs: { receipts: false, offers: true },
      synced: true,
    });
  });

  it("maps toggles onto Resend topic subscriptions", () => {
    expect(topicsFromPrefs({ receipts: true, offers: false })).toEqual([
      { id: RECEIPTS_TOPIC_ID, subscription: "opt_in" },
      { id: OFFERS_TOPIC_ID, subscription: "opt_out" },
    ]);
    expect(prefsToMetadata({ receipts: false, offers: true })).toEqual({
      receipts: "false",
      offers: "true",
    });
  });

  it("rejects a body that is not two booleans", () => {
    expect(parsePrefsBody({ receipts: true })).toBeNull();
    expect(parsePrefsBody({ receipts: "true", offers: false })).toBeNull();
    expect(parsePrefsBody({ receipts: true, offers: false })).toEqual({
      receipts: true,
      offers: false,
    });
  });

  it("splits a stored full name without inventing one", () => {
    expect(nameParts({ first_name: "Koss", last_name: "Z" })).toEqual({
      firstName: "Koss",
      lastName: "Z",
    });
    expect(nameParts({ full_name: "Koss Zayeni" })).toEqual({
      firstName: "Koss",
      lastName: "Zayeni",
    });
    expect(nameParts({})).toEqual({});
  });
});
