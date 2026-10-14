// Phase 31 (S-03, D-10, D-11, D-13): the customer refund mail. Claim first, never throws, the sweep retries a
// failed send; a failed or empty claim alerts info@ with the booking reference and the Stripe refund id only.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const alertSend = vi.hoisted(() =>
  vi.fn(async (env: { RESEND_API_KEY: string }) =>
    env.RESEND_API_KEY
      ? ({ ok: true, providerMessageId: "msg_alert" } as const)
      : ({ ok: false, error: "RESEND_API_KEY is not bound" } as const),
  ),
);

vi.mock("@vamos/emails/confirmation", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sendRefundMailAlert: alertSend,
}));

import {
  REFUND_MAIL_TEMPLATE_VERSION,
  deliverRefundMailByClaimWithDeps,
  mailCustomerRefundWithDeps,
  type RefundMailDeps,
} from "./refund-mail";
import { alertRefundMailNotSent } from "./refund-mail-alert";

const BOOKING_ID = "8a1f6c2e-aaaa-4bbb-8ccc-dddddddddddd";
const RE_ID = "re_3PqXyZ0000000001";
const INPUT = { bookingId: BOOKING_ID, stripeRefundId: RE_ID, refundRappen: 4000 };

type Mocked = RefundMailDeps & {
  claim: ReturnType<typeof vi.fn>;
  readClaim: ReturnType<typeof vi.fn>;
  readBooking: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  settle: ReturnType<typeof vi.fn>;
  alert: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
};

function deps(patch: Partial<Record<keyof RefundMailDeps, unknown>> = {}): Mocked {
  return {
    claim: vi.fn(async () => 77),
    readClaim: vi.fn(async () => ({ bookingId: BOOKING_ID, stripeRefundId: RE_ID, refundRappen: 2500 })),
    readBooking: vi.fn(async () => ({
      reference: "VT-26-0753",
      locale: "de",
      contactName: "Nadia Keller",
      contactEmail: "Nadia@Example.test",
      payerEmail: "billing@company.test",
    })),
    send: vi.fn(async () => ({ ok: true, providerMessageId: "msg_1" })),
    settle: vi.fn(async () => undefined),
    alert: vi.fn(async () => true),
    emit: vi.fn(),
    ...patch,
  } as Mocked;
}

/** Every emitted field set, flattened: ids and stage only, never an address, a name or an amount. */
function expectIdsOnly(d: Mocked) {
  for (const call of d.emit.mock.calls) {
    const fields = (call[2] ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(fields)) {
      expect(["bookingId", "refundId", "claimId", "stage"], key).toContain(key);
    }
    const flat = JSON.stringify(fields);
    expect(flat).not.toContain("@");
    expect(flat).not.toMatch(/Nadia|4000|2500|40\.00|25\.00/);
  }
}

describe("REFUND_MAIL_TEMPLATE_VERSION", () => {
  it("matches the claim regex and names the signature date", () => {
    expect(REFUND_MAIL_TEMPLATE_VERSION).toMatch(/^[a-z_]+@\d{4}-\d{2}-\d{2}-\d+$/);
    expect(REFUND_MAIL_TEMPLATE_VERSION).toBe("refund@2026-10-13-1");
  });
});

describe("mailCustomerRefundWithDeps", () => {
  it("claim answers null (already claimed): no read, no send, no settle, no alert", async () => {
    const d = deps({ claim: vi.fn(async () => null) });
    await mailCustomerRefundWithDeps(d, INPUT);
    expect(d.claim).toHaveBeenCalledWith(BOOKING_ID, RE_ID);
    expect(d.readBooking).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
    expect(d.settle).not.toHaveBeenCalled();
    expect(d.alert).not.toHaveBeenCalled();
  });

  it("claim answers an id: read, send to contact then payer with their idempotency keys, settle with the first id", async () => {
    const d = deps({
      send: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, providerMessageId: "msg_contact" })
        .mockResolvedValueOnce({ ok: true, providerMessageId: "msg_payer" }),
    });
    await mailCustomerRefundWithDeps(d, INPUT);
    expect(d.readBooking).toHaveBeenCalledWith(BOOKING_ID);
    expect(d.send).toHaveBeenCalledTimes(2);
    expect(d.send.mock.calls[0]?.[0]).toEqual({
      locale: "de",
      to: "nadia@example.test",
      name: "Nadia Keller",
      reference: "VT-26-0753",
      amountRappen: 4000,
      idempotencyKey: `refund-mail:${RE_ID}`,
    });
    expect(d.send.mock.calls[1]?.[0]).toMatchObject({
      to: "billing@company.test",
      idempotencyKey: `refund-mail:${RE_ID}:payer`,
    });
    expect(d.settle).toHaveBeenCalledWith(77, "msg_contact", null);
    expect(d.alert).not.toHaveBeenCalled();
  });

  it("a payer address equal to the contact gets one mail only", async () => {
    const d = deps({
      readBooking: vi.fn(async () => ({
        reference: "VT-26-0753",
        locale: "en",
        contactName: "Nadia",
        contactEmail: "nadia@example.test",
        payerEmail: " NADIA@example.test ",
      })),
    });
    await mailCustomerRefundWithDeps(d, INPUT);
    expect(d.send).toHaveBeenCalledTimes(1);
  });

  it("the amount is the Stripe refund's own rappen, passed through untouched", async () => {
    for (const refundRappen of [4000, 1, 123456]) {
      const d = deps();
      await mailCustomerRefundWithDeps(d, { ...INPUT, refundRappen });
      for (const call of d.send.mock.calls) {
        expect((call[0] as { amountRappen: number }).amountRappen).toBe(refundRappen);
      }
    }
  });

  it("the mail language follows the booking: de stays de, an unknown or missing locale is en", async () => {
    for (const [locale, want] of [
      ["de", "de"],
      ["fr", "fr"],
      ["ar", "ar"],
      ["it", "en"],
      [null, "en"],
    ] as const) {
      const d = deps({
        readBooking: vi.fn(async () => ({
          reference: "VT-26-0753",
          locale,
          contactName: "Nadia",
          contactEmail: "nadia@example.test",
          payerEmail: null,
        })),
      });
      await mailCustomerRefundWithDeps(d, INPUT);
      expect((d.send.mock.calls[0]?.[0] as { locale: string }).locale, String(locale)).toBe(want);
    }
  });

  it("a send that answers ok:false is recorded on the claim with a short code, no throw", async () => {
    const d = deps({ send: vi.fn(async () => ({ ok: false, error: "missing-copy" })) });
    await expect(mailCustomerRefundWithDeps(d, INPUT)).resolves.toBeUndefined();
    expect(d.settle).toHaveBeenCalledWith(77, null, "missing_copy");
    expect(d.emit).toHaveBeenCalledWith("error", "customer_refund_mail", expect.objectContaining({ stage: "send" }));
  });

  it("provider text never reaches the claim: an unknown Resend error becomes send_failed", async () => {
    const d = deps({ send: vi.fn(async () => ({ ok: false, error: "Invalid `to` field: nadia@example.test" })) });
    await mailCustomerRefundWithDeps(d, INPUT);
    expect(d.settle).toHaveBeenCalledWith(77, null, "send_failed");
  });

  it("a thrown send is recorded on the claim, no throw", async () => {
    const d = deps({ send: vi.fn(async () => Promise.reject(new Error("network"))) });
    await expect(mailCustomerRefundWithDeps(d, INPUT)).resolves.toBeUndefined();
    expect(d.settle).toHaveBeenCalledWith(77, null, "send_threw");
  });

  it("the payer copy failing still records an error so the sweep retries (the contact's key guards a resend)", async () => {
    const d = deps({
      send: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, providerMessageId: "msg_contact" })
        .mockResolvedValueOnce({ ok: false, error: "rate limited" }),
    });
    await mailCustomerRefundWithDeps(d, INPUT);
    expect(d.settle).toHaveBeenCalledWith(77, null, "send_failed");
  });

  it("no booking, or a booking with no address: claim settled no_recipient, nothing sent, no throw", async () => {
    for (const booking of [
      null,
      { reference: "VT-26-0753", locale: "en", contactName: "", contactEmail: "  ", payerEmail: null },
    ]) {
      const d = deps({ readBooking: vi.fn(async () => booking) });
      await expect(mailCustomerRefundWithDeps(d, INPUT)).resolves.toBeUndefined();
      expect(d.send).not.toHaveBeenCalled();
      expect(d.settle).toHaveBeenCalledWith(77, null, "no_recipient");
    }
  });

  it("a thrown booking read is recorded on the claim, no throw", async () => {
    const d = deps({ readBooking: vi.fn(async () => Promise.reject(new Error("42501"))) });
    await expect(mailCustomerRefundWithDeps(d, INPUT)).resolves.toBeUndefined();
    expect(d.send).not.toHaveBeenCalled();
    expect(d.settle).toHaveBeenCalledWith(77, null, "read_failed");
  });

  it("a thrown settle is logged and never thrown", async () => {
    const d = deps({ settle: vi.fn(async () => Promise.reject(new Error("down"))) });
    await expect(mailCustomerRefundWithDeps(d, INPUT)).resolves.toBeUndefined();
    expect(d.emit).toHaveBeenCalledWith("error", "customer_refund_mail", expect.objectContaining({ stage: "settle" }));
  });

  it("claim throws (P0002 refund_not_recorded): error logged, reference read, info@ alerted once; no send, no settle", async () => {
    const d = deps({
      claim: vi.fn(async () => Promise.reject(Object.assign(new Error("refund_not_recorded"), { code: "P0002" }))),
    });
    await expect(mailCustomerRefundWithDeps(d, INPUT)).resolves.toBeUndefined();
    expect(d.emit).toHaveBeenCalledWith(
      "error",
      "customer_refund_mail",
      expect.objectContaining({ stage: "claim", refundId: RE_ID }),
    );
    expect(d.readBooking).toHaveBeenCalledWith(BOOKING_ID);
    expect(d.alert).toHaveBeenCalledTimes(1);
    expect(d.alert).toHaveBeenCalledWith({ reference: "VT-26-0753", stripeRefundId: RE_ID });
    expect(d.send).not.toHaveBeenCalled();
    expect(d.settle).not.toHaveBeenCalled();
  });

  it("claim throws and the reference read throws too: the alert still goes, with reference null", async () => {
    const d = deps({
      claim: vi.fn(async () => Promise.reject(new Error("refund_not_recorded"))),
      readBooking: vi.fn(async () => Promise.reject(new Error("down"))),
    });
    await mailCustomerRefundWithDeps(d, INPUT);
    expect(d.alert).toHaveBeenCalledWith({ reference: null, stripeRefundId: RE_ID });
    expect(d.send).not.toHaveBeenCalled();
  });

  it("claim answers neither null nor a positive id (no row came back): claim_empty logged and info@ alerted", async () => {
    for (const odd of [undefined, 0, -3, Number.NaN, 1.5]) {
      const d = deps({ claim: vi.fn(async () => odd) });
      await mailCustomerRefundWithDeps(d, INPUT);
      expect(d.emit, String(odd)).toHaveBeenCalledWith(
        "error",
        "customer_refund_mail",
        expect.objectContaining({ stage: "claim_empty", refundId: RE_ID }),
      );
      expect(d.alert, String(odd)).toHaveBeenCalledTimes(1);
      expect(d.send).not.toHaveBeenCalled();
      expect(d.settle).not.toHaveBeenCalled();
    }
  });

  it("the alert answers false or throws: logged as stage alert, still no throw", async () => {
    for (const alert of [vi.fn(async () => false), vi.fn(async () => Promise.reject(new Error("boom")))]) {
      const d = deps({ claim: vi.fn(async () => Promise.reject(new Error("x"))), alert });
      await expect(mailCustomerRefundWithDeps(d, INPUT)).resolves.toBeUndefined();
      expect(d.emit).toHaveBeenCalledWith(
        "error",
        "customer_refund_mail",
        expect.objectContaining({ stage: "alert", refundId: RE_ID }),
      );
    }
  });

  it("every log line carries ids and stage only, on every path", async () => {
    const paths: Mocked[] = [
      deps(),
      deps({ send: vi.fn(async () => ({ ok: false, error: "x" })) }),
      deps({ readBooking: vi.fn(async () => null) }),
      deps({ claim: vi.fn(async () => Promise.reject(new Error("x"))), alert: vi.fn(async () => false) }),
      deps({ claim: vi.fn(async () => undefined) }),
      deps({ settle: vi.fn(async () => Promise.reject(new Error("x"))) }),
    ];
    for (const d of paths) {
      await mailCustomerRefundWithDeps(d, INPUT);
      expectIdsOnly(d);
    }
  });
});

describe("deliverRefundMailByClaimWithDeps (the sweep path)", () => {
  it("readClaim null: nothing read, sent or settled", async () => {
    const d = deps({ readClaim: vi.fn(async () => null) });
    await deliverRefundMailByClaimWithDeps(d, 91);
    expect(d.readClaim).toHaveBeenCalledWith(91);
    expect(d.readBooking).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
    expect(d.settle).not.toHaveBeenCalled();
  });

  it("uses the claim's Stripe refund id and recorded rappen, never claims again", async () => {
    const d = deps();
    await deliverRefundMailByClaimWithDeps(d, 91);
    expect(d.claim).not.toHaveBeenCalled();
    expect(d.send.mock.calls[0]?.[0]).toMatchObject({
      amountRappen: 2500,
      idempotencyKey: `refund-mail:${RE_ID}`,
    });
    expect(d.send.mock.calls[1]?.[0]).toMatchObject({ idempotencyKey: `refund-mail:${RE_ID}:payer` });
    expect(d.settle).toHaveBeenCalledWith(91, "msg_1", null);
  });

  it("a failed send on retry is recorded again, and a thrown readClaim never throws", async () => {
    const failing = deps({ send: vi.fn(async () => ({ ok: false, error: "RESEND_API_KEY is not bound" })) });
    await deliverRefundMailByClaimWithDeps(failing, 91);
    expect(failing.settle).toHaveBeenCalledWith(91, null, "no_api_key");

    const thrown = deps({ readClaim: vi.fn(async () => Promise.reject(new Error("down"))) });
    await expect(deliverRefundMailByClaimWithDeps(thrown, 91)).resolves.toBeUndefined();
    expect(thrown.settle).not.toHaveBeenCalled();
    expect(thrown.emit).toHaveBeenCalledWith(
      "error",
      "customer_refund_mail",
      expect.objectContaining({ stage: "read_claim", claimId: 91 }),
    );
    expectIdsOnly(failing);
    expectIdsOnly(thrown);
  });
});

describe("alertRefundMailNotSent", () => {
  beforeEach(() => {
    alertSend.mockClear();
  });

  it("sends to info@ only, with the refund's idempotency key", async () => {
    const ok = await alertRefundMailNotSent({ RESEND_API_KEY: "re_test" } as CloudflareEnv, {
      reference: "VT-26-0753",
      stripeRefundId: RE_ID,
    });
    expect(ok).toBe(true);
    expect(alertSend).toHaveBeenCalledTimes(1);
    const [env, input, to, key] = alertSend.mock.calls[0] as unknown as [unknown, unknown, string, string];
    expect(env).toEqual({ RESEND_API_KEY: "re_test" });
    expect(input).toEqual({ reference: "VT-26-0753", stripeRefundId: RE_ID });
    expect(to).toBe("info@vamostaxi.site");
    expect(key).toBe(`refund-mail-alert:${RE_ID}`);
  });

  it("without RESEND_API_KEY it answers false and never throws", async () => {
    await expect(
      alertRefundMailNotSent({} as CloudflareEnv, { reference: null, stripeRefundId: RE_ID }),
    ).resolves.toBe(false);
  });

  it("a thrown sender answers false", async () => {
    alertSend.mockImplementationOnce(async () => Promise.reject(new Error("boom")));
    await expect(
      alertRefundMailNotSent({ RESEND_API_KEY: "re_test" } as CloudflareEnv, {
        reference: "VT-26-0753",
        stripeRefundId: RE_ID,
      }),
    ).resolves.toBe(false);
  });
});

describe("source fences", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "refund-mail.ts"), "utf8");
  const alertSrc = readFileSync(join(here, "refund-mail-alert.ts"), "utf8");

  it("refund-mail.ts claims through notification_claim_refund, is force-dynamic, and binds the alert", () => {
    expect(src).toContain('export const dynamic = "force-dynamic"');
    expect(src).toContain("notification_claim_refund(");
    expect(src).not.toContain("notification_claim(");
    expect(src).toContain("alertRefundMailNotSent");
    expect(src).not.toMatch(/LifecycleKind|refund_failed|assignment_customer/);
  });

  it("the alert file has no database import", () => {
    expect(alertSrc).not.toMatch(/db\/identity|@vamos\/db|asSystem/);
    expect(alertSrc).toContain("refund-mail-alert:");
  });
});
