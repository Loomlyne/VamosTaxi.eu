import { describe, expect, it } from "vitest";
import { base64urlEncode } from "../crypto/hmac";
import { flightKey, lockFlightNoDiffers, peekLockFlightNo } from "./flight-no";

function fakeLock(payload: unknown): string {
  const body = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  return `v1.${body}.mac`;
}

describe("flightKey", () => {
  it("ignores case and spacing; blank and null mean no flight", () => {
    expect(flightKey(" lx 1234 ")).toBe("LX1234");
    expect(flightKey("")).toBe("");
    expect(flightKey("   ")).toBe("");
    expect(flightKey(null)).toBe("");
    expect(flightKey(undefined)).toBe("");
  });
});

describe("peekLockFlightNo", () => {
  it("reads leg 1 flight_no from the lock payload", () => {
    expect(peekLockFlightNo(fakeLock({ legs: [{ leg_seq: 1, flight_no: "LX1234" }] }))).toBe("LX1234");
  });

  it("returns null for no flight, a missing leg, or a malformed lock", () => {
    expect(peekLockFlightNo(fakeLock({ legs: [{ leg_seq: 1, flight_no: null }] }))).toBeNull();
    expect(peekLockFlightNo(fakeLock({ legs: [] }))).toBeNull();
    expect(peekLockFlightNo("not-a-lock")).toBeNull();
    expect(peekLockFlightNo(undefined)).toBeNull();
  });
});

describe("lockFlightNoDiffers (D-08b, 26.1-30)", () => {
  const withFlight = fakeLock({ legs: [{ leg_seq: 1, flight_no: "LX1234" }] });
  const noFlight = fakeLock({ legs: [{ leg_seq: 1, flight_no: null }] });

  it("is true when the details flight number is not the one the lock priced", () => {
    expect(lockFlightNoDiffers(noFlight, "LX1234")).toBe(true);
    expect(lockFlightNoDiffers(withFlight, "")).toBe(true);
    expect(lockFlightNoDiffers(withFlight, "LX999")).toBe(true);
  });

  it("is false when they match, ignoring case and spacing", () => {
    expect(lockFlightNoDiffers(withFlight, "lx 1234")).toBe(false);
    expect(lockFlightNoDiffers(noFlight, "  ")).toBe(false);
  });

  it("is false when there is no lock to compare against", () => {
    expect(lockFlightNoDiffers(undefined, "LX1234")).toBe(false);
  });
});
