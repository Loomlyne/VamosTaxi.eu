import { describe, expect, it, vi, type Mocked } from "vitest";
import {
  deliverConfirmationWithDeps,
  sweepStuckNotificationsWithDeps,
  type ConfirmationDeps,
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
  price_total_rappen: null,
  pickup_text: "ZRH",
  dropoff_text: "Zurich HB",
  scheduled_local: "2026-10-01T08:15",
  flight_no: null,
  pax: 1,
  bags: 0,
  vehicle_class_slug: "business",
  policy_extras: ["child_seat"],
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
    const payload = d.send.mock.calls[0]?.[0] as { extras: string[]; manageUrl: string };
    expect(payload.extras).toEqual(["child_seat"]);
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
