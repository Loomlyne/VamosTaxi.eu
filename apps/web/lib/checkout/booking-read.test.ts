import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashManageToken, mintManageToken } from "./manage-token";

const asGuest = vi.fn();

vi.mock("../db/identity", () => ({
  asGuest: (...args: unknown[]) => asGuest(...args),
}));

import {
  BOOKING_REFERENCE_RE,
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
    if (/guest_confirmation_read/i.test(text)) {
      if (!bookings.length) return [{ payload: null }];
      return [{
        payload: {
          booking: bookings[0],
          legs,
          snapshot: snapshots[0] ?? null,
          payment: payments[0] ?? null,
        },
      }];
    }
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

  it("reads confirmation through guest_confirmation_read, never the bookings table", async () => {
    const { sql, calls } = makeSql([{ id: "b1", reference: REF, status: "pending" }], [], []);
    asGuest.mockImplementation(async (_env: CloudflareEnv, _hex: string, fn: (s: typeof sql) => unknown) =>
      fn(sql),
    );
    await readBookingForConfirmation(ENV, "", REF);
    const joined = calls.map((c) => c.text).join("\n");
    expect(joined).toContain("guest_confirmation_read");
    expect(joined).not.toMatch(/from public\.bookings/i);
    expect(joined).not.toMatch(/select\s+\*/i);
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
      extras: [],
      contactName: "koussay zayani",
      contactEmail: "koussayzayeni@gmail.com",
      contactPhone: "+971509758018",
      couponCode: null,
      discountRappen: 0,
      subtotalRappen: 10810,
      priceTotalRappen: 10810,
      fareLines: [
        { code: "distance_fare", vehicleClass: "business", amountRappen: 10810, params: { vehicleClass: "business" } },
      ],
      durationMin: 16,
      distanceKm: 10.61,
      paidAt: null,
      paymentStatus: null,
      refundStatus: null,
      refundOwedRappen: null,
      refundedRappen: null,
      receipt: {
        rows: [{ kind: "fare", label: "Fare", labelKey: "price.line.transfer", amountRappen: 10810 },
          { kind: "total", label: "Total paid", labelKey: "price.line.total", amountRappen: 10810 },
        ],
        chargedRappen: 10810,
        presentment: null,
        vehicleClassName: null,
      },
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

  it("carries the refund facts so the voucher refund line survives a reload (26.1-18 deferred)", async () => {
    const { sql } = makeSql([
      {
        id: "b1",
        reference: REF,
        status: "cancelled",
        price_total_rappen: 8000,
        refund_status: "refunded",
        refund_owed_rappen: 8000,
        refunded_rappen: "8000",
      },
    ]);
    asGuest.mockImplementation(async (_env: CloudflareEnv, _hex: string, fn: (s: typeof sql) => unknown) =>
      fn(sql),
    );
    const result = await readBookingForConfirmation(ENV, "token", REF);
    expect(result.visible).toBe(true);
    if (!result.visible) return;
    expect(result.refundStatus).toBe("refunded");
    expect(result.refundOwedRappen).toBe(8000);
    expect(result.refundedRappen).toBe(8000);
  });

  it("keeps pending_ops with no owed amount decided yet", async () => {
    const { sql } = makeSql([
      {
        id: "b1",
        reference: REF,
        status: "cancelled",
        price_total_rappen: 8000,
        refund_status: "pending_ops",
        refund_owed_rappen: null,
        refunded_rappen: 0,
      },
    ]);
    asGuest.mockImplementation(async (_env: CloudflareEnv, _hex: string, fn: (s: typeof sql) => unknown) =>
      fn(sql),
    );
    const result = await readBookingForConfirmation(ENV, "token", REF);
    if (!result.visible) throw new Error("expected visible");
    expect(result.refundStatus).toBe("pending_ops");
    expect(result.refundOwedRappen).toBeNull();
    expect(result.refundedRappen).toBe(0);
  });
});

describe("receipt on the visible booking", () => {
  beforeEach(() => {
    asGuest.mockReset();
  });

  async function read(snapshot: unknown, payment: unknown) {
    const { sql } = makeSql(
      [{ id: "b1", reference: REF, status: "confirmed", price_total_rappen: 9800 }],
      [{ pickup_text: "A", dropoff_text: "B", scheduled_local: "2026-09-11T10:00", vehicle_class_id: "c1", pax: 1, bags: 0, vehicle_class_name: "Business" }],
      [snapshot],
      [payment],
    );
    asGuest.mockImplementation(async (_e: unknown, _h: unknown, fn: (s: unknown) => unknown) => fn(sql));
    const minted = await mintManageToken();
    const out = await readBookingForConfirmation(ENV, minted.raw, REF);
    if (!out.visible) throw new Error("expected visible");
    return out;
  }

  const snapshot = {
    total_rappen: 9800,
    lines: [
      { kind: "fare", code: "distance_fare", i18n_key: "price.line.transfer", params: { vehicleClass: "business" }, amount_rappen: 10000 },
      { kind: "surcharge", code: "roof-box", i18n_key: "price.surcharge.custom", params: { names: { en: "Roof box" } }, amount_rappen: 2000 },
    ],
  };

  it("renders an extra code nobody hard-coded and exposes presentment when not CHF", async () => {
    const out = await read(snapshot, {
      status: "captured",
      charged_rappen: 9800,
      presentment_amount_minor: 10500,
      presentment_currency: "EUR",
    });
    expect(out.receipt.rows.some((r) => r.label === "Roof box" && r.amountRappen === 2000)).toBe(true);
    expect(out.receipt.chargedRappen).toBe(9800);
    expect(out.receipt.presentment).toEqual({ amountMinor: 10500, currency: "EUR" });
    expect(out.receipt.vehicleClassName).toBe("Business");
  });

  it("presentment is null when the customer paid in CHF", async () => {
    const out = await read(snapshot, {
      status: "captured",
      charged_rappen: 9800,
      presentment_amount_minor: 9800,
      presentment_currency: "CHF",
    });
    expect(out.receipt.presentment).toBeNull();
  });
});
