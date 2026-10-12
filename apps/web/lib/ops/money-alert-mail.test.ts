import { beforeEach, describe, expect, it, vi } from "vitest";

// J7 (W6-05, W6-07): the ops mail for a reversed refund and a dispute. Ids only; it throws when it did not go out.

const sendOpsMustFix = vi.fn();
vi.mock("@vamos/emails/confirmation", () => ({
  sendOpsMustFix: (...args: unknown[]) => sendOpsMustFix(...args),
}));

const ENV = { RESEND_API_KEY: "re_key_test" } as CloudflareEnv;
const INPUT = { eventId: "evt_1", type: "charge.dispute.created", objectId: "du_1", reference: "VT-26-0101", status: "needs_response" };

beforeEach(() => {
  sendOpsMustFix.mockReset();
});

describe("deliverMoneyAlert", () => {
  it("sends the must-fix mail to the support inbox with the reference and the three ids and nothing else", async () => {
    sendOpsMustFix.mockResolvedValue({ ok: true, providerMessageId: "m1" });
    const { deliverMoneyAlert } = await import("./money-alert-mail");
    await deliverMoneyAlert(ENV, "dispute", INPUT);
    expect(sendOpsMustFix).toHaveBeenCalledTimes(1);
    const [env, payload, to] = sendOpsMustFix.mock.calls[0]!;
    expect(env).toEqual({ RESEND_API_KEY: "re_key_test" });
    expect(to).toBe("info@vamostaxi.site");
    expect(payload).toEqual({
      locale: "en",
      kind: "dispute",
      trips: [{ reference: "VT-26-0101", pickupText: "", dropoffText: "", scheduledLocal: "" }],
      detail: { eventId: "evt_1", eventType: "charge.dispute.created", objectId: "du_1" },
    });
  });

  it("uses the refund-failed kind for a reversed refund", async () => {
    sendOpsMustFix.mockResolvedValue({ ok: true, providerMessageId: "m2" });
    const { deliverMoneyAlert } = await import("./money-alert-mail");
    await deliverMoneyAlert(ENV, "refund-failed", { ...INPUT, type: "refund.failed", objectId: "re_1" });
    expect(sendOpsMustFix.mock.calls[0]![1]).toMatchObject({ kind: "refund-failed", detail: { objectId: "re_1" } });
  });

  it("throws when Resend refuses, so the caller keeps the event open (never a silent failure)", async () => {
    sendOpsMustFix.mockResolvedValue({ ok: false, error: "domain not verified" });
    const { deliverMoneyAlert } = await import("./money-alert-mail");
    await expect(deliverMoneyAlert(ENV, "dispute", INPUT)).rejects.toThrow("domain not verified");
  });

  it("throws when no mail key is bound, without calling Resend", async () => {
    const { deliverMoneyAlert } = await import("./money-alert-mail");
    await expect(deliverMoneyAlert({} as CloudflareEnv, "dispute", INPUT)).rejects.toThrow("RESEND_API_KEY");
    expect(sendOpsMustFix).not.toHaveBeenCalled();
  });

  it("a booking that cannot be named still sends (an empty reference, the ids carry it)", async () => {
    sendOpsMustFix.mockResolvedValue({ ok: true, providerMessageId: "m3" });
    const { deliverMoneyAlert } = await import("./money-alert-mail");
    await deliverMoneyAlert(ENV, "dispute", { ...INPUT, reference: null });
    expect(sendOpsMustFix.mock.calls[0]![1].trips).toHaveLength(1);
  });
});
