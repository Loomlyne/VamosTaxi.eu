import { describe, expect, it } from "vitest";
import { buildInvite, zurichLocalToUtc } from "./ics";
import type { BookingForEmail } from "./types";

function booking(scheduledLocal: string, pickupText = "Zurich Airport"): BookingForEmail {
  return {
    reference: "VT-10001",
    contactName: "Ada",
    contactEmail: "ada@example.test",
    locale: "en",
    displayCurrency: "CHF",
    totalRappen: null,
    manageUrl: "https://vamostaxi.site/en/manage?token=raw",
    legs: [
      {
        legSeq: 1,
        direction: "outbound",
        pickupText,
        dropoffText: "Zurich",
        scheduledLocal,
        scheduledAt: "2026-01-01T00:00:00.000Z",
        flightNo: null,
        vehicleClassLabel: "Economy",
        pax: 1,
        bags: 0,
        estimatedDurationMinutes: 30,
      },
    ],
  };
}

describe("zurichLocalToUtc", () => {
  it("CEST window: 10:00 Europe/Zurich is 08:00 UTC", () => {
    const utc = zurichLocalToUtc("2026-07-15T10:00");
    expect(utc.toISOString()).toBe("2026-07-15T08:00:00.000Z");
  });

  it("CET window: 10:00 Europe/Zurich is 09:00 UTC", () => {
    const utc = zurichLocalToUtc("2026-01-15T10:00");
    expect(utc.toISOString()).toBe("2026-01-15T09:00:00.000Z");
  });
});

describe("buildInvite", () => {
  it("returns a calendar with the booking reference in SUMMARY", () => {
    const value = buildInvite(booking("2026-07-15T10:00"));
    expect(value).toContain("BEGIN:VCALENDAR");
    expect(value).toContain("BEGIN:VEVENT");
    expect(value).toContain("VT-10001");
    expect(value).toContain("DTSTART:20260715T080000Z");
  });

  it("round-trips a comma and a semicolon in the pickup address", () => {
    const value = buildInvite(booking("2026-07-15T10:00", "Bahnhofstrasse 1, Zurich; door B"));
    expect(value).toContain("Bahnhofstrasse");
    expect(value).toMatch(/Zurich/);
    expect(value).toContain("BEGIN:VEVENT");
  });

  it("throws rather than returning a partial string when there is no leg", () => {
    const empty = booking("2026-07-15T10:00");
    empty.legs = [];
    expect(() => buildInvite(empty)).toThrow(/leg/);
  });
});
