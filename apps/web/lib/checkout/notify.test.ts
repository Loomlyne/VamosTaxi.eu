import { describe, expect, it, vi, type Mocked } from "vitest";
import {
  deliverConfirmationWithDeps,
  sweepStuckNotificationsWithDeps,
  type ConfirmationDeps,
  moneyFromRow,
  type SweepDeps,
} from "./notify";

const SETTLED = {
  booking_id: "00000000-0000-4000-8000-000000000001",
  reference: "VT-26-00001",
  locale: "de",
  contact_email: "guest@example.test",
};

const ROW = {
  reference: "VT-26-00001",
  locale: "de",
  contact_name: "Guest",
  contact_email: "guest@example.test",
  payer_email: null,
  price_total_rappen: 99999,
  pickup_text: "ZRH",
  dropoff_text: "Zurich HB",
  scheduled_local: "2026-10-01T08:15",
  flight_no: null,
  pax: 1,
  bags: 0,
  vehicle_class_name: "Business",
  policy_extras: ["child_seat"],
  lines: null,
  vat_rate_bps: 81,
  coupon_code: null,
  charged_rappen: 10810,
  presentment_amount_minor: null,
  presentment_currency: null,
};

function makeDeps(overrides: Partial<ConfirmationDeps> = {}) {
  const deps = {
    apiKey: "re_test",
    claim: vi.fn(async () => 7 as number | null),
    load: vi.fn(async () => ROW as Record<string, unknown> | null),
    mintToken: vi.fn(async () => ({ raw: "tok", hash: new Uint8Array(32) })),
    send: vi.fn(async () => ({ ok: true as const, providerMessageId: "msg_1" })),
    settle: vi.fn(async () => undefined),
    emit: vi.fn(),
    ...overrides,
  };
  return deps as unknown as Mocked<ConfirmationDeps>;
}

function logText(emit: { mock: { calls: unknown[] } }): string {
  return JSON.stringify(emit.mock.calls);
}

describe("deliverConfirmationWithDeps", () => {
  it("claims before it reads", async () => {
    const order: string[] = [];
    const d = makeDeps({
      claim: vi.fn(async () => {
        order.push("claim");
        return 7;
      }),
      load: vi.fn(async () => {
        order.push("load");
        return ROW;
      }),
    });
    await deliverConfirmationWithDeps(d, SETTLED);
    expect(order).toEqual(["claim", "load"]);
    expect(d.claim).toHaveBeenCalledWith(SETTLED.booking_id, "de");
    expect(d.settle).toHaveBeenCalledWith(7, "msg_1", null);
  });

  it("RPC read throws: resolves, logs an error without PII, sends nothing, records the failure", async () => {
    const d = makeDeps({
      load: vi.fn(async () => {
        throw Object.assign(new Error("permission denied for table price_snapshots"), {
          code: "42501",
        });
      }),
    });
    await expect(deliverConfirmationWithDeps(d, SETTLED)).resolves.toBeUndefined();
    expect(d.send).not.toHaveBeenCalled();
    expect(d.emit).toHaveBeenCalledWith("error", "confirmation_mail", {
      bookingId: SETTLED.booking_id,
      stage: "load",
    });
    expect(logText(d.emit)).not.toContain("guest@example.test");
    expect(d.settle).toHaveBeenCalledTimes(1);
    expect(d.settle.mock.calls[0]?.[0]).toBe(7);
    expect(d.settle.mock.calls[0]?.[1]).toBeNull();
    expect(String(d.settle.mock.calls[0]?.[2])).toContain("permission denied");
  });

  it("claim returns null (already claimed): no read, no send", async () => {
    const d = makeDeps({ claim: vi.fn(async () => null) });
    await deliverConfirmationWithDeps(d, SETTLED);
    expect(d.load).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
    expect(d.settle).not.toHaveBeenCalled();
  });

  it("send returns not ok: the failure is settled on the claim", async () => {
    const d = makeDeps({
      send: vi.fn(async () => ({ ok: false as const, error: "rate limited" })),
    });
    await deliverConfirmationWithDeps(d, SETTLED);
    expect(d.settle).toHaveBeenCalledWith(7, null, "rate limited");
    expect(d.emit).toHaveBeenCalledWith("error", "confirmation_mail", {
      bookingId: SETTLED.booking_id,
      stage: "send",
    });
  });

  it("send throws: caught, failure settled, resolves", async () => {
    const d = makeDeps({
      send: vi.fn(async () => {
        throw new Error("network down");
      }),
    });
    await expect(deliverConfirmationWithDeps(d, SETTLED)).resolves.toBeUndefined();
    expect(d.settle).toHaveBeenCalledWith(7, null, "network down");
  });

  it("settle itself throws: still resolves", async () => {
    const d = makeDeps({
      settle: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    await expect(deliverConfirmationWithDeps(d, SETTLED)).resolves.toBeUndefined();
    expect(d.emit).toHaveBeenCalledWith("error", "confirmation_mail", {
      bookingId: SETTLED.booking_id,
      stage: "settle",
    });
  });

  it("an existing claim id (sweep) skips claiming", async () => {
    const d = makeDeps();
    await deliverConfirmationWithDeps(d, SETTLED, { claimId: 42 });
    expect(d.claim).not.toHaveBeenCalled();
    expect(d.settle).toHaveBeenCalledWith(42, "msg_1", null);
  });

  it("no API key: claims nothing", async () => {
    const d = makeDeps({ apiKey: undefined });
    await deliverConfirmationWithDeps(d, SETTLED);
    expect(d.claim).not.toHaveBeenCalled();
  });

  it("builds the payload from RPC columns only (extras from policy_extras)", async () => {
    const d = makeDeps();
    await deliverConfirmationWithDeps(d, SETTLED);
    const payload = d.send.mock.calls[0]![0];
    expect(payload.extras?.map((e) => e.name)).toEqual(["Child seat"]);
    expect(payload.manageUrl).toBe("https://vamostaxi.site/de/manage-booking?token=tok");
  });
});

describe("sweepStuckNotificationsWithDeps", () => {
  function sweepDeps(overrides: Partial<SweepDeps> = {}) {
    const deps = {
      stuck: vi.fn(async () => [{ id: 11, booking_id: "b-stuck", locale: "fr" }]),
      missing: vi.fn(async () => [
        { booking_id: "b-missing-1", locale: "en" },
        { booking_id: "b-missing-2", locale: "ar" },
      ]),
      deliver: vi.fn(async () => undefined),
      emit: vi.fn(),
      ...overrides,
    };
    return deps as unknown as Mocked<SweepDeps>;
  }

  it("delivers both notification_sweep rows (on their claim) and missing-claim rows", async () => {
    const d = sweepDeps();
    await sweepStuckNotificationsWithDeps(d, 10 * 60 * 1000);
    expect(d.stuck).toHaveBeenCalledWith("600 seconds", ["confirmation"]);
    expect(d.missing).toHaveBeenCalledWith("600 seconds");
    expect(d.deliver).toHaveBeenCalledTimes(3);
    expect(d.deliver.mock.calls[0]).toEqual([
      { booking_id: "b-stuck", reference: "", locale: "fr", contact_email: "" },
      { claimId: 11 },
    ]);
    expect(d.deliver.mock.calls[1]?.[1]).toEqual({});
    expect(d.deliver.mock.calls[2]?.[0]).toMatchObject({ booking_id: "b-missing-2", locale: "ar" });
  });

  it("one failing booking does not stop the rest", async () => {
    const d = sweepDeps({
      deliver: vi.fn(async (settled: { booking_id: string }) => {
        if (settled.booking_id === "b-stuck" || settled.booking_id === "b-missing-1") {
          throw new Error("boom");
        }
      }),
    });
    await expect(sweepStuckNotificationsWithDeps(d)).resolves.toBeUndefined();
    expect(d.deliver).toHaveBeenCalledTimes(3);
    expect(d.emit).toHaveBeenCalledWith("error", "notification_sweep", {
      bookingId: "b-missing-1",
      stage: "missing",
    });
  });

  it("a failing stuck query still runs the missing-claim pass", async () => {
    const d = sweepDeps({
      stuck: vi.fn(async () => {
        throw new Error("db");
      }),
    });
    await sweepStuckNotificationsWithDeps(d);
    expect(d.missing).toHaveBeenCalledTimes(1);
    expect(d.deliver).toHaveBeenCalledTimes(2);
  });
});

describe("confirmation payload money (S6)", () => {
  const LINES = [
    { kind: "fare", code: "fare", i18n_key: "price.fare", params: {}, amount_rappen: 10000 },
    {
      kind: "surcharge",
      code: "ski-rack",
      i18n_key: "price.surcharge.custom",
      params: { names: { en: "Ski rack", de: "Skiträger" } },
      amount_rappen: 2000,
    },
    { kind: "coupon", code: "coupon", i18n_key: "price.coupon", params: {}, amount_rappen: -1000 },
    { kind: "vat", code: "vat", i18n_key: "price.vat", params: {}, amount_rappen: 910 },
  ];
  const FULL = {
    ...ROW,
    lines: LINES,
    coupon_code: "WELCOME",
    charged_rappen: 12000,
    vat_rate_bps: 81,
  };

  async function sentPayload(row: Record<string, unknown>) {
    const d = makeDeps({ load: vi.fn(async () => row) });
    await deliverConfirmationWithDeps(d, SETTLED);
    return d.send.mock.calls[0]![0];
  }

  it("maps lines in order, total is charged_rappen, class name from data", async () => {
    const payload = await sentPayload(FULL);
    expect(payload.money?.lines).toEqual([
      { kind: "fare", label: "Business", amountRappen: 10000 },
      { kind: "surcharge", label: "Skiträger", amountRappen: 2000 },
      { kind: "coupon", label: "WELCOME", amountRappen: -1000 },
      { kind: "vat", label: "", amountRappen: 910 },
    ]);
    expect(payload.money?.chargedRappen).toBe(12000);
    expect(payload.totalRappen).toBe(12000);
    expect(payload.legs[0]?.vehicleClassLabel).toBe("Business");
    expect(payload.extras).toEqual([
      { name: "Skiträger", names: { en: "Ski rack", de: "Skiträger" }, amountRappen: 2000 },
    ]);
  });

  it("presentment is null for CHF or missing, set for another currency", () => {
    expect(moneyFromRow(FULL, "de")?.presentment).toBeNull();
    expect(
      moneyFromRow({ ...FULL, presentment_currency: "CHF", presentment_amount_minor: 12000 }, "de")?.presentment,
    ).toBeNull();
    expect(
      moneyFromRow({ ...FULL, presentment_currency: "eur", presentment_amount_minor: 13400 }, "de")?.presentment,
    ).toEqual({ amountMinor: 13400, currency: "EUR" });
  });

  it("legacy snapshot without lines: net + VAT from the charge, no crash", () => {
    const money = moneyFromRow({ ...ROW, lines: null, charged_rappen: 10810, vat_rate_bps: 81 }, "en");
    expect(money?.lines).toEqual([
      { kind: "fare", label: "Business", amountRappen: 10000 },
      { kind: "vat", label: "", amountRappen: 810 },
    ]);
    expect(money?.chargedRappen).toBe(10810);
  });

  // 261003: the shape checkout really saves. Fare and extra lines keep their pre-voucher figure in
  // params.list_rappen; the coupon line has amount_rappen null and params.discount_rappen. Internal rappen.
  describe("real saved shape (fare pieces + voucher)", () => {
    const SAVED = [
      { kind: "fare", code: "distance_fare", i18n_key: "price.line.transfer", params: { vehicleClass: "business", list_rappen: 4000 }, amount_rappen: 0 },
      { kind: "fare", code: "airport_fee", i18n_key: "price.line.airport_fee", params: { list_rappen: 1500 }, amount_rappen: 500 },
      { kind: "fare", code: "fixed_route", i18n_key: "price.line.fixed_route", params: { origin: "Zürich", destination: "Genève" }, amount_rappen: 2500 },
      { kind: "surcharge", code: "ski-rack", i18n_key: "price.surcharge.custom", params: { names: { en: "Ski rack", de: "Skiträger" } }, amount_rappen: 1000 },
      { kind: "coupon", code: "WELCOME", i18n_key: "price.line.coupon", params: { amountRappen: 5000, discount_rappen: 5000 }, amount_rappen: null },
      { kind: "vat", code: "vat", i18n_key: "price.line.vat", params: { vatRateBps: 81 }, amount_rappen: 400 },
    ];
    const ROW_SAVED = { ...ROW, lines: SAVED, coupon_code: "WELCOME", charged_rappen: 4400, vat_rate_bps: 81 };

    it("shows fare, fee, route, extra, voucher, VAT; the rows add up to the total paid", () => {
      const money = moneyFromRow(ROW_SAVED, "de")!;
      expect(money.lines).toEqual([
        { kind: "fare", label: "Business", amountRappen: 4000 },
        { kind: "airport_fee", label: "", amountRappen: 1500 },
        { kind: "route", label: "", amountRappen: 2500, origin: "Zürich", destination: "Genève" },
        { kind: "surcharge", label: "Skiträger", amountRappen: 1000 },
        { kind: "coupon", label: "WELCOME", amountRappen: -5000 },
        { kind: "vat", label: "", amountRappen: 400 },
      ]);
      expect(money.lines.reduce((n, l) => n + l.amountRappen, 0)).toBe(money.chargedRappen);
    });

    it("a voucher on a plain one-line booking now shows the voucher row and the full fare", () => {
      const money = moneyFromRow(
        {
          ...ROW,
          coupon_code: "WELCOME",
          charged_rappen: 8000,
          lines: [
            { kind: "fare", code: "distance_fare", params: { list_rappen: 10000 }, amount_rappen: 7400 },
            { kind: "coupon", code: "WELCOME", params: { discount_rappen: 2600 }, amount_rappen: null },
            { kind: "vat", code: "vat", params: { vatRateBps: 81 }, amount_rappen: 600 },
          ],
        },
        "en",
      )!;
      expect(money.lines.map((l) => [l.kind, l.amountRappen])).toEqual([
        ["fare", 10000],
        ["coupon", -2600],
        ["vat", 600],
      ]);
      expect(money.lines.reduce((n, l) => n + l.amountRappen, 0)).toBe(8000);
    });

    it("an extra the voucher took down to 0 still has its row, so the rows still add up", () => {
      const money = moneyFromRow(
        {
          ...ROW,
          coupon_code: "BIG",
          charged_rappen: 0,
          lines: [
            { kind: "fare", code: "distance_fare", params: { list_rappen: 3000 }, amount_rappen: 0 },
            { kind: "surcharge", code: "ski-rack", params: { list_rappen: 500, names: { en: "Ski rack" } }, amount_rappen: 0 },
            { kind: "coupon", code: "BIG", params: { discount_rappen: 3500 }, amount_rappen: null },
            { kind: "vat", code: "vat", params: { vatRateBps: 81 }, amount_rappen: 0 },
          ],
        },
        "en",
      )!;
      expect(money.lines.map((l) => [l.kind, l.amountRappen])).toEqual([
        ["fare", 3000],
        ["surcharge", 500],
        ["coupon", -3500],
        ["vat", 0],
      ]);
    });

    it("an old booking (one fare line, no params) maps exactly as before", () => {
      const money = moneyFromRow(
        { ...ROW, charged_rappen: 10810, lines: [{ kind: "fare", code: "distance_fare", params: {}, amount_rappen: 10000 }, { kind: "vat", code: "vat", params: {}, amount_rappen: 810 }] },
        "en",
      )!;
      expect(money.lines).toEqual([
        { kind: "fare", label: "Business", amountRappen: 10000 },
        { kind: "vat", label: "", amountRappen: 810 },
      ]);
    });
  });

  it("no captured charge: no money block", () => {
    expect(moneyFromRow({ ...ROW, charged_rappen: null }, "en")).toBeUndefined();
  });
});
