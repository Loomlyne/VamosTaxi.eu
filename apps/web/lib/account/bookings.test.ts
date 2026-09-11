import { readFileSync } from "node:fs";
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
};

describe("mapAccountBooking", () => {
  it("maps a paid confirmed trip onto BookingRow fields", () => {
    const row = mapAccountBooking(base, now);
    expect(row.ref).toBe("VT-26-0720");
    expect(row.href).toBe("/confirmation/VT-26-0720");
    expect(row.date).toBe("Thu 10 Sept");
    expect(row.time).toBe("02:45");
    expect(row.route).toBe("Zurich Airport → Zurich Hauptbahnhof");
    expect(row.vehicle).toBe("");
    expect(row.chauffeur).toBe("");
    expect(row.pax).toBe(1);
    expect(row.priceRappen).toBe(12000);
    expect(row.status).toBe("confirmed");
    expect(row.when).toBe("past");
    expect(row.group).toBe("September 2026");
  });

  it("keeps chauffeur and vehicle empty until assigned", () => {
    const row = mapAccountBooking(
      {
        ...base,
        chauffeur_name: null,
        vehicle_plate: null,
        vehicle_model: null,
      },
      now,
    );
    expect(row.chauffeur).toBe("");
    expect(row.vehicle).toBe("");
    expect(row.vehicle).not.toBe("Business");
    expect(row.vehicle).not.toBe("Economy");
  });

  it("joins chauffeur name and fleet plate/model after assign", () => {
    const row = mapAccountBooking(
      {
        ...base,
        status: "assigned",
        chauffeur_name: "Lena Meier",
        vehicle_plate: "ZH 12345",
        vehicle_model: "V-Class",
      },
      now,
    );
    expect(row.chauffeur).toBe("Lena Meier");
    expect(row.vehicle).toBe("ZH 12345 · V-Class");
    expect(row.status).toBe("assigned");
    expect(row.vehicle).not.toMatch(/Business|Economy|Van|First/);
  });

  it("maps unpaid pending onto needs-payment and finish-pay href", () => {
    const row = mapAccountBooking(
      {
        ...base,
        status: "pending",
        scheduled_local: "2026-09-12T04:15",
        scheduled_at: "2026-09-12T02:15:00.000Z",
      },
      now,
    );
    expect(row.status).toBe("unpaid");
    expect(row.href).toBe("/checkout/payment");
    expect(row.when).toBe("upcoming");
  });

  it("keeps unpaid in upcoming after the pickup time", () => {
    const row = mapAccountBooking(
      {
        ...base,
        status: "pending",
        scheduled_local: "2026-09-09T04:15",
        scheduled_at: "2026-09-09T02:15:00.000Z",
      },
      now,
    );
    expect(row.status).toBe("unpaid");
    expect(row.when).toBe("upcoming");
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

  it("does not invent a CHF string or Isolation name", () => {
    const row = mapAccountBooking(base, now);
    expect(JSON.stringify(row)).not.toMatch(/CHF/);
    expect(JSON.stringify(row)).not.toMatch(/Isolation/);
  });
});

describe("GET /api/account/bookings", () => {
  it("lists by asCustomer contact_email and never asSystem SELECT", () => {
    const src = readFileSync(new URL("../../app/api/account/bookings/route.ts", import.meta.url), "utf8");
    expect(src).toContain("asCustomer");
    expect(src).toContain("contact_email");
    expect(src).not.toContain("asSystem");
    expect(src).toContain("<> 'quote'");
    expect(src).not.toContain("not in ('quote', 'pending')");
  });
});
