import { beforeEach, describe, expect, it, vi } from "vitest";

const sendOpsMustFix = vi.fn();
vi.mock("@vamos/emails/confirmation", () => ({ sendOpsMustFix: (...a: unknown[]) => sendOpsMustFix(...a) }));
const loadMustFixTrip = vi.fn();
vi.mock("../db/system-reads", () => ({ loadMustFixTrip: (...a: unknown[]) => loadMustFixTrip(...a) }));

import {
  MustFixMailError,
  deliverDifferenceNotAppliedAlert,
  deliverOverlapMustFix,
  deliverPaidAfterCancelAlert,
  deliverStuckPaymentAlert,
} from "./must-fix-mail";

const env = (key = "re_test") => ({ RESEND_API_KEY: key }) as unknown as CloudflareEnv;
const tripRow = { reference: "VT-1", locale: "en", pickup_text: "A", dropoff_text: "B", scheduled_local: "2030-01-01T10:00" };
const stuck = { eventId: "evt_1", type: "checkout.session.completed", objectId: "cs_1", reference: null };

beforeEach(() => {
  sendOpsMustFix.mockReset();
  loadMustFixTrip.mockReset();
  loadMustFixTrip.mockResolvedValue(tripRow);
});

describe("W4-02: an ops must-fix mail that did not go out is never read as sent", () => {
  it("the stuck-payment alert resolves when Resend accepts it", async () => {
    sendOpsMustFix.mockResolvedValue({ ok: true, providerMessageId: "m1" });
    await expect(deliverStuckPaymentAlert(env(), stuck)).resolves.toBeUndefined();
    expect(sendOpsMustFix).toHaveBeenCalledTimes(1);
    const payload = sendOpsMustFix.mock.calls[0]?.[1];
    expect(payload.kind).toBe("stuck-payment");
    // ids only, no PII
    expect(payload.detail).toEqual({ eventId: "evt_1", eventType: "checkout.session.completed", objectId: "cs_1" });
  });

  it("the stuck-payment alert throws when sendOpsMustFix answers { ok: false }", async () => {
    sendOpsMustFix.mockResolvedValue({ ok: false, error: "domain not verified" });
    await expect(deliverStuckPaymentAlert(env(), stuck)).rejects.toBeInstanceOf(MustFixMailError);
    await expect(deliverStuckPaymentAlert(env(), stuck)).rejects.toMatchObject({ code: "send_failed" });
  });

  it("the stuck-payment alert throws when no Resend key is bound (it used to return silently)", async () => {
    await expect(deliverStuckPaymentAlert(env(""), stuck)).rejects.toMatchObject({ code: "no_api_key" });
    expect(sendOpsMustFix).not.toHaveBeenCalled();
  });

  it("the error carries a fixed code, never the provider's text", async () => {
    sendOpsMustFix.mockResolvedValue({ ok: false, error: "to: someone@example.test is not allowed" });
    const err = await deliverStuckPaymentAlert(env(), stuck).catch((e: Error) => e);
    expect(String((err as Error).message)).not.toContain("someone@example.test");
  });

  it.each([
    ["paid-after-cancel", deliverPaidAfterCancelAlert],
    ["difference-not-applied", deliverDifferenceNotAppliedAlert],
    ["overlap", deliverOverlapMustFix],
  ] as const)("the %s alert throws on { ok: false }, on a missing key and on a booking that cannot be found", async (_kind, fn) => {
    sendOpsMustFix.mockResolvedValue({ ok: false, error: "rate limited" });
    await expect(fn(env(), "booking-1")).rejects.toMatchObject({ code: "send_failed" });
    await expect(fn(env(""), "booking-1")).rejects.toMatchObject({ code: "no_api_key" });
    loadMustFixTrip.mockResolvedValue(null);
    await expect(fn(env(), "booking-1")).rejects.toMatchObject({ code: "trip_not_found" });
    sendOpsMustFix.mockResolvedValue({ ok: true, providerMessageId: "m" });
    loadMustFixTrip.mockResolvedValue(tripRow);
    await expect(fn(env(), "booking-1")).resolves.toBeUndefined();
  });
});
