// apps/web/lib/ops/no-car-surfaces.test.ts
//
// Quick 261001-chauffeur-car (owner, 2026-10-01: no cars). Every surface that showed the car must
// work with NO vehicle: where a customer or a mail showed the car's plate it now shows the
// chauffeur's plate (20261007160000 feeds it: reminder_24h_candidates.plate, manage_driver_for.plate,
// assign.ts loadCustomerAssignment), the car model is shown nowhere, and nothing prints "null" or
// "undefined". No new customer-facing words.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { assignmentCustomerPlainText, reminder24hPlainText } from "@vamos/emails/confirmation";
import { describe, expect, it } from "vitest";
import { driverFromJson } from "../checkout/manage-money";
import { mapBoardBooking, type SqlBoardRow } from "./bookings-map";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

const LOCALES = ["en", "de", "fr", "ar"] as const;
const trip = (locale: (typeof LOCALES)[number], over: Record<string, unknown> = {}) => ({
  reference: "VT-26-0042",
  locale,
  pickupText: "Zurich Airport (ZRH)",
  dropoffText: "Bahnhofstrasse 1, 8001 Zurich",
  scheduledLocal: "2026-10-05T14:30",
  chauffeurName: "Marco Rossi",
  vehicle: null,
  plate: "ZH 123 456",
  ...over,
});

describe("customer mails: the chauffeur's plate, no car model, never 'null'", () => {
  for (const locale of LOCALES) {
    it(`24 h reminder (${locale})`, () => {
      const text = reminder24hPlainText(trip(locale) as never);
      expect(text).toContain("ZH 123 456");
      expect(text).toContain("Marco Rossi");
      expect(text).not.toMatch(/\bnull\b|\bundefined\b/);
      const noPlate = reminder24hPlainText(trip(locale, { plate: null }) as never);
      expect(noPlate).not.toMatch(/\bnull\b|\bundefined\b/);
      expect(noPlate.split("\n").length).toBe(text.split("\n").length - 1);
    });
    it(`driver assigned (${locale})`, () => {
      const text = assignmentCustomerPlainText(trip(locale) as never);
      expect(text).toContain("ZH 123 456");
      expect(text).not.toMatch(/\bnull\b|\bundefined\b/);
      const noPlate = assignmentCustomerPlainText(trip(locale, { plate: null }) as never);
      expect(noPlate).not.toMatch(/\bnull\b|\bundefined\b/);
      expect(noPlate.split("\n").length).toBe(text.split("\n").length - 1);
    });
  }
});

describe("manage-booking 'your driver' block", () => {
  it("reads the driver with no car model as an empty model, the plate as sent", () => {
    expect(driverFromJson({ first_name: "Marco", phone: "+41790000001", vehicle_model: null, plate: "ZH 123 456" })).toEqual({
      firstName: "Marco",
      phone: "+41790000001",
      vehicleModel: "",
      plate: "ZH 123 456",
    });
  });

  it("the Vehicle row shows the plate alone, and is left out when there is no plate (no empty line)", () => {
    const src = read("app/pages/manage-booking.dc.html");
    expect(src).toMatch(/const driverCar = driver \? \[driver\.vehicleModel, driver\.plate\]\.filter\(Boolean\)\.join/);
    const row = src.indexOf('<span data-row-k="1">Vehicle</span>');
    expect(row).toBeGreaterThan(0);
    const before = src.slice(Math.max(0, row - 260), row);
    expect(before).toMatch(/<sc-if value="\{\{ hasDriverCar \}\}"[^>]*>\s*<div data-row="1">\s*<span style="min-width:0">$/);
    expect(src).toMatch(/hasDriverCar: !!driverCar/);
  });
});

describe("dashboard board row: the trip's class id and the driver's plate", () => {
  const base: SqlBoardRow = {
    id: "b0000000-0000-4000-8000-000000000042",
    reference: "VT-26-0042",
    status: "assigned",
    contact_name: "Ada Example",
    contact_email: "ada@example.com",
    contact_phone: null,
    company_name: null,
    note: null,
    pay_link_sent_at: null,
    pickup_text: "Zurich Airport (ZRH)",
    dropoff_text: "Bahnhofstrasse 1",
    scheduled_local: "2026-10-05T14:30",
    scheduled_at: "2026-10-05T12:30:00.000Z",
    flight_no: null,
    pax: 2,
    bags: 2,
    class_slug: "mercedes-benz-v-class",
    chauffeur_name: "Marco Rossi",
    payment_status: "succeeded",
    captured_at: "2026-10-01T08:00:00.000Z",
    payment_created_at: "2026-10-01T08:00:00.000Z",
    stripe_checkout_session_id: null,
    charged_rappen: 0,
  };

  it("carries vehicleClassId and chauffeurPlate; no car → vehicle stays empty", () => {
    const row = mapBoardBooking({
      ...base,
      vehicle_class_id: "e0000000-0000-4000-8000-00000000b501",
      class_name: "Business",
      chauffeur_plate: "ZH 123 456",
    } as SqlBoardRow);
    expect(row.vehicleClassId).toBe("e0000000-0000-4000-8000-00000000b501");
    expect(row.chauffeurPlate).toBe("ZH 123 456");
    expect(row.vehicle).toBe("");
    expect(JSON.stringify(row)).not.toMatch(/"null"|undefined/);
  });

  it("the staff read selects the leg's class id and the chauffeur's plate", () => {
    const src = read("apps/web/lib/ops/bookings.ts");
    expect(src).toMatch(/l\.vehicle_class_id,/);
    expect(src).toMatch(/ch\.plate as chauffeur_plate,/);
  });

  it("the console store keeps them (cleanBooking copies a fixed field list)", () => {
    const win: Record<string, unknown> = { dispatchEvent: () => true, addEventListener: () => undefined };
    vm.runInContext(read("app/vamos-ops-data.js"), vm.createContext({ window: win, CustomEvent: class {}, setTimeout: () => 0, clearTimeout: () => undefined, console }));
    const ops = win.VamosOps as {
      bookings: { blank: (r: unknown) => Record<string, unknown> };
      chauffeurs: { blank: (r: unknown) => Record<string, unknown> };
    };
    const b = ops.bookings.blank({ id: "VT-26-0042", vehicleClassId: "cls-b", chauffeurPlate: "ZH 123 456" });
    expect(b.vehicleClassId).toBe("cls-b");
    expect(b.chauffeurPlate).toBe("ZH 123 456");
    const c = ops.chauffeurs.blank({ id: "c1", name: "Marco", plate: "ZH 123 456", vehicleClassId: "cls-b" });
    expect(c.plate).toBe("ZH 123 456");
    expect(c.vehicleClassId).toBe("cls-b");
  });
});
