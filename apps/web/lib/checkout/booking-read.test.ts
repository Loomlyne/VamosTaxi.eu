import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashManageToken, mintManageToken } from "./manage-token";

const asGuest = vi.fn();

vi.mock("../db/identity", () => ({
  asGuest: (...args: unknown[]) => asGuest(...args),
}));

import {
  BOOKING_COLUMNS,
  BOOKING_REFERENCE_RE,
  LEG_COLUMNS,
  SNAPSHOT_COLUMNS,
  readBookingForConfirmation,
  readBookingStatus,
} from "./booking-read";

const ENV = {} as CloudflareEnv;
const REF = "VT-26-0001";

type QueryCall = { text: string; values: unknown[] };

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function makeSql(
  bookings: unknown[],
  legs: unknown[] = [],
  snapshots: unknown[] = [],
  payments: unknown[] = [],
) {
  const calls: QueryCall[] = [];
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join(" ");
    calls.push({ text, values });
    if (/from public\.bookings/i.test(text)) return bookings;
    if (/from public\.booking_legs/i.test(text)) return legs;
    if (/from public\.price_snapshots/i.test(text)) return snapshots;
    if (/from public\.booking_payments/i.test(text)) return payments;
    return [];
  };
  return { sql, calls };
}

describe("readBookingForConfirmation / readBookingStatus", () => {
  beforeEach(() => {
    asGuest.mockReset();
  });

  it("mints then hashes to the same 64-char hex GUC", async () => {
    const minted = await mintManageToken();
    const hex = await hashManageToken(minted.raw);
    expect(hex).toHaveLength(64);
    expect(hex).toBe(toHex(minted.hash));
  });

  it("rejects a malformed reference without querying", async () => {
    const result = await readBookingForConfirmation(ENV, "cookie", "not-a-ref");
    expect(result).toEqual({ visible: false });
    expect(asGuest).not.toHaveBeenCalled();
  });

  it("accepts VT-YY-#### and VT-YY-#####", () => {
    expect(BOOKING_REFERENCE_RE.test("VT-26-0001")).toBe(true);
    expect(BOOKING_REFERENCE_RE.test("VT-26-00012")).toBe(true);
    expect(BOOKING_REFERENCE_RE.test("VT-26-000")).toBe(false);
  });

  it("no cookie returns not-visible and sets the GUC to nothing", async () => {
    const { sql, calls } = makeSql([]);
    asGuest.mockImplementation(async (_env: CloudflareEnv, hex: string, fn: (s: typeof sql) => unknown) => {
      expect(hex).toBe("");
      return fn(sql);
    });
    const a = await readBookingForConfirmation(ENV, "", REF);
    const b = await readBookingStatus(ENV, "", REF);
    expect(a).toEqual({ visible: false });
    expect(b).toEqual({ visible: false });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(calls.length).toBeGreaterThan(0);
  });

  it("unknown token hashes to 64 hex, queries, returns not-visible", async () => {
    const minted = await mintManageToken();
    let seenHex = "";
    const { sql } = makeSql([]);
    asGuest.mockImplementation(async (_env: CloudflareEnv, hex: string, fn: (s: typeof sql) => unknown) => {
      seenHex = hex;
      return fn(sql);
    });
    const result = await readBookingStatus(ENV, minted.raw, REF);
    expect(seenHex).toHaveLength(64);
    expect(seenHex).toMatch(/^[0-9a-f]{64}$/);
    expect(result).toEqual({ visible: false });
  });

  it("selects only the granted columns — never SELECT *", async () => {
    const { sql, calls } = makeSql([{ id: "b1", reference: REF, status: "pending" }], [], []);
    asGuest.mockImplementation(async (_env: CloudflareEnv, _hex: string, fn: (s: typeof sql) => unknown) =>
      fn(sql),
    );
    await readBookingForConfirmation(ENV, "", REF);
    const joined = calls.map((c) => c.text).join("\n");
    expect(joined).not.toMatch(/select\s+\*/i);
    const bookingSql = calls.find((c) => /from public\.bookings/i.test(c.text))?.text ?? "";
    const legSql = calls.find((c) => /from public\.booking_legs/i.test(c.text))?.text ?? "";
    const snapSql = calls.find((c) => /from public\.price_snapshots/i.test(c.text))?.text ?? "";
    expect(bookingSql.length).toBeGreaterThan(0);
    expect(legSql.length).toBeGreaterThan(0);
    expect(snapSql.length).toBeGreaterThan(0);
    expect(snapSql).not.toMatch(/vat_rappen/);
    expect(snapSql).not.toMatch(/quoted_at/);
    expect(snapSql).not.toMatch(/valid_until/);
    for (const col of BOOKING_COLUMNS) {
      expect(bookingSql).toContain(col);
    }
    for (const col of LEG_COLUMNS) {
      expect(legSql).toContain(col);
    }
    for (const col of SNAPSHOT_COLUMNS) {
      expect(snapSql).toContain(col);
    }
  });

  it("visible booking maps the first leg", async () => {
    const { sql } = makeSql(
      [
        {
          id: "b1",
          reference: REF,
          status: "pending",
          price_total_rappen: 10810,
          contact_name: "koussay zayani",
          contact_email: "koussayzayeni@gmail.com",
          contact_phone: "+971509758018",
        },
      ],
      [
        {
          pickup_text: "ZRH Arrivals",
          dropoff_text: "Bahnhofstrasse 1",
          scheduled_local: "2026-10-01T10:00",
          vehicle_class_id: "vc-1",
          pax: 2,
          bags: 2,
          flight_no: "LX123",
        },
      ],
      [
        {
          id: "s1",
          lines: [{ code: "distance_fare", params: { vehicleClass: "business" }, amount_rappen: 10810 }],
          total_rappen: 10810,
          coupon_code: null,
          discount_rappen: 0,
          subtotal_rappen: 10810,
          policy: { extras: ["child_seat"] },
          duration_min: 16,
          distance_km: "10.61",
        },
      ],
    );
    asGuest.mockImplementation(async (_env: CloudflareEnv, _hex: string, fn: (s: typeof sql) => unknown) =>
      fn(sql),
    );
    const result = await readBookingForConfirmation(ENV, "token", REF);
    expect(result).toEqual({
      visible: true,
      reference: REF,
      status: "pending",
      pickupText: "ZRH Arrivals",
      dropoffText: "Bahnhofstrasse 1",
      scheduledLocal: "2026-10-01T10:00",
      vehicleClassId: "vc-1",
      vehicleClassSlug: "business",
      pax: 2,
      bags: 2,
      flightNo: "LX123",
      extras: ["child_seat"],
      contactName: "koussay zayani",
      contactEmail: "koussayzayeni@gmail.com",
      contactPhone: "+971509758018",
      couponCode: null,
      discountRappen: 0,
      subtotalRappen: 10810,
      priceTotalRappen: 10810,
      fareLines: [{ code: "distance_fare", vehicleClass: "business", amountRappen: 10810 }],
      durationMin: 16,
      distanceKm: 10.61,
      paidAt: null,
      paymentStatus: null,
    });
    const status = await readBookingStatus(ENV, "token", REF);
    expect(status).toEqual({ visible: true, status: "pending", reference: REF, paymentStatus: null });
  });

  it("unknown token and no cookie are byte-identical not-visible payloads", async () => {
    asGuest.mockImplementation(async (_env: CloudflareEnv, _hex: string, fn: (s: (t: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]>) => unknown) => {
      const sql = async () => [];
      return fn(sql);
    });
    const missing = await readBookingStatus(ENV, "", REF);
    const unknown = await readBookingStatus(ENV, "!!!!", REF);
    expect(JSON.stringify(missing)).toBe(JSON.stringify(unknown));
    expect(missing).toEqual({ visible: false });
  });

  it("attaches captured_at from the payment row", async () => {
    const { sql } = makeSql(
      [{ id: "b1", reference: REF, status: "confirmed", price_total_rappen: 10810 }],
      [
        {
          pickup_text: "Zurich Airport",
          dropoff_text: "Zurich Hauptbahnhof",
          scheduled_local: "2026-09-11T00:55",
          vehicle_class_id: "vc-1",
          pax: 1,
          bags: 0,
        },
      ],
      [{ id: "s1", lines: [], total_rappen: 10810, duration_min: 16, distance_km: 10.61 }],
      [{ status: "succeeded", captured_at: "2026-09-10T19:53:06.074Z", charged_rappen: 10810 }],
    );
    asGuest.mockImplementation(async (_env: CloudflareEnv, _hex: string, fn: (s: typeof sql) => unknown) =>
      fn(sql),
    );
    const result = await readBookingForConfirmation(ENV, "token", REF);
    expect(result).toMatchObject({
      visible: true,
      paidAt: "2026-09-10T19:53:06.074Z",
      paymentStatus: "succeeded",
      priceTotalRappen: 10810,
      durationMin: 16,
      distanceKm: 10.61,
      bags: 0,
    });
  });
});
