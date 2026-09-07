import { describe, expect, it } from "vitest";
import {
  bareCheckoutPath,
  bouncePath,
  checkoutWindowHours,
  hasDetails,
  hasQuoteLock,
  localePath,
} from "./steps";

const LOCKED = { quote_id: "q1", lock: "tok", detailsComplete: false };
const READY = { quote_id: "q1", lock: "tok", detailsComplete: true };

describe("hasQuoteLock", () => {
  it("requires lock and quote id", () => {
    expect(hasQuoteLock(null)).toBe(false);
    expect(hasQuoteLock({ lock: "tok" })).toBe(false);
    expect(hasQuoteLock({ quote_id: "q1" })).toBe(false);
    expect(hasQuoteLock(LOCKED)).toBe(true);
    expect(hasQuoteLock({ quoteId: "q1", lock: "tok" })).toBe(true);
  });

  it("treats an expired lock as gone (D-31)", () => {
    expect(hasQuoteLock({ ...LOCKED, expires_at: "2000-01-01T00:00:00.000Z" })).toBe(false);
    expect(bouncePath("trip", { ...LOCKED, expires_at: "2000-01-01T00:00:00.000Z" })).toBe("/");
    expect(hasQuoteLock({ ...LOCKED, expires_at: "2099-01-01T00:00:00.000Z" })).toBe(true);
  });
});

describe("bouncePath", () => {
  it("sends a visitor without a lock home from every step", () => {
    expect(bouncePath("trip", null)).toBe("/");
    expect(bouncePath("details", {})).toBe("/");
    expect(bouncePath("payment", { quote_id: "q1" })).toBe("/");
  });

  it("keeps trip and details when a lock exists", () => {
    expect(bouncePath("trip", LOCKED)).toBeNull();
    expect(bouncePath("details", LOCKED)).toBeNull();
  });

  it("bounces payment to details when contact is incomplete", () => {
    expect(bouncePath("payment", LOCKED)).toBe("/checkout/details");
    expect(bouncePath("payment", READY)).toBeNull();
  });

  it("lets Trip stay on /checkout/trip (not home) when a lock exists", () => {
    expect(bouncePath("trip", READY)).toBeNull();
    expect(hasDetails(LOCKED)).toBe(false);
  });
});

describe("bareCheckoutPath", () => {
  it("goes to trip with a lock, else home", () => {
    expect(bareCheckoutPath(LOCKED)).toBe("/checkout/trip");
    expect(bareCheckoutPath(null)).toBe("/");
  });
});

describe("localePath", () => {
  it("leaves English unprefixed", () => {
    expect(localePath("en", "/checkout/trip")).toBe("/checkout/trip");
    expect(localePath("de", "/checkout/trip")).toBe("/de/checkout/trip");
    expect(localePath("ar", "/")).toBe("/ar");
  });
});

describe("checkoutWindowHours", () => {
  it("uses hours only for a whole number of hours", () => {
    expect(checkoutWindowHours(1440)).toBe(24);
    expect(checkoutWindowHours(60)).toBe(1);
    expect(checkoutWindowHours(30)).toBeNull();
    expect(checkoutWindowHours(null)).toBeNull();
  });
});
