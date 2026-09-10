import { describe, expect, it } from "vitest";
import { mapAccountBooking, type AccountSqlRow } from "./bookings";

const now = new Date("2026-09-10T12:00:00.000Z");

const base: AccountSqlRow = {
  reference: "VT-26-0720",
  status: "confirmed",
  price_total_rappen: 12000,
  pickup_text: "Zurich Airport",
  dropoff_text: "Zurich Hauptbahnhof",
  scheduled_local: "2026-09-10T02:45",
  scheduled_at: "2026-09-10T00:45:00.000Z",
  pax: 1,
  class_slug: "business",
};

describe("mapAccountBooking", () => {
  it("maps a paid confirmed trip onto BookingRow fields", () => {
    const row = mapAccountBooking(base, now);
    expect(row.ref).toBe("VT-26-0720");
    expect(row.href).toBe("/confirmation/VT-26-0720");
    expect(row.date).toBe("Thu 10 Sept");
    expect(row.time).toBe("02:45");
    expect(row.route).toBe("Zurich Airport → Zurich Hauptbahnhof");
    expect(row.vehicle).toBe("Business");
    expect(row.pax).toBe(1);
    expect(row.priceRappen).toBe(12000);
    expect(row.status).toBe("confirmed");
    expect(row.when).toBe("past");
    expect(row.group).toBe("September 2026");
  });

  it("keeps a future confirmed trip in upcoming", () => {
    const row = mapAccountBooking(
      {
        ...base,
        scheduled_local: "2026-09-11T10:00",
        scheduled_at: "2026-09-11T08:00:00.000Z",
      },
      now,
    );
    expect(row.when).toBe("upcoming");
    expect(row.status).toBe("confirmed");
  });

  it("does not invent a CHF string", () => {
    const row = mapAccountBooking(base, now);
    expect(JSON.stringify(row)).not.toMatch(/CHF/);
  });
});
