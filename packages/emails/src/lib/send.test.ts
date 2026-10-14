import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingForEmail } from "./types";

const sendMock = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import {
  CONFIRMATION_TEMPLATE_VERSION,
  sendConfirmation,
  sendPriceChanged,
  sendRefund,
  sendRefundMailAlert,
} from "./send";

const booking: BookingForEmail = {
  reference: "VT-10001",
  contactName: "Ada",
  contactEmail: "ada@example.test",
  locale: "en",
  displayCurrency: "CHF",
  totalRappen: null,
  manageUrl: "https://vamostaxi.site/en/manage?token=raw",
  legs: [
    {
      legSeq: 1,
      direction: "outbound",
      pickupText: "Zurich Airport",
      dropoffText: "Zurich",
      scheduledLocal: "2026-07-15T10:00",
      scheduledAt: "2026-07-15T08:00:00.000Z",
      flightNo: null,
      vehicleClassLabel: "Economy",
      pax: 1,
      bags: 0,
      estimatedDurationMinutes: 25,
    },
  ],
};

describe("CONFIRMATION_TEMPLATE_VERSION", () => {
  it("matches the claim regex", () => {
    expect(CONFIRMATION_TEMPLATE_VERSION).toMatch(/^[a-z_]+@\d{4}-\d{2}-\d{2}-\d+$/);
  });
});

describe("sendConfirmation", () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it("returns providerMessageId and one .ics attachment", async () => {
    sendMock.mockResolvedValue({ data: { id: "re_123" }, error: null });
    const outcome = await sendConfirmation({ RESEND_API_KEY: "re_test" }, booking);
    expect(outcome).toEqual({ ok: true, providerMessageId: "re_123" });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0]?.[0] as {
      attachments: { filename: string; content: string }[];
      react: unknown;
      text: string;
    };
    expect(payload.attachments).toHaveLength(1);
    expect(payload.attachments[0]?.filename).toBe("VT-10001.ics");
    expect(payload.attachments[0]?.content).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(payload.react).toBeTruthy();
    expect(payload.text).toContain("VT-10001");
  });

  it("maps a Resend error to ok:false and never throws", async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: "rate limited" } });
    const outcome = await sendConfirmation({ RESEND_API_KEY: "re_test" }, booking);
    expect(outcome).toEqual({ ok: false, error: "rate limited" });
  });

  it("catches a thrown send", async () => {
    sendMock.mockRejectedValue(new Error("network"));
    const outcome = await sendConfirmation({ RESEND_API_KEY: "re_test" }, booking);
    expect(outcome).toEqual({ ok: false, error: "network" });
  });
});

describe("skip-send missing-copy (D-03)", () => {
  it("source-reads send.ts for missing-copy, From, and bookings@ — never info@", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "send.ts"), "utf8");
    expect(src).toContain("missing-copy");
    expect(src).toContain("hasCopySentinel");
    expect(src).toContain("Vamos Taxi <noreply@vamostaxi.site>");
    expect(src).toContain("bookings@vamostaxi.site");
    expect(src).not.toContain("info@vamostaxi.site");
    expect(src).toMatch(/export async function sendPriceChanged[\s\S]{0,180}skipped:\s*true/);
  });

  it("sendPriceChanged still returns skipped true without calling Resend", async () => {
    sendMock.mockReset();
    const outcome = await sendPriceChanged(
      { RESEND_API_KEY: "re_test" },
      { locale: "en", contactEmail: "ada@example.test", lockedRappen: 10000 },
    );
    expect(outcome).toEqual({ ok: true, skipped: true });
    expect(sendMock).not.toHaveBeenCalled();
  });
});

// Phase 31 D-10: the customer refund mail carries a Resend idempotency key as the second guard after the claim.
describe("sendRefund idempotency key (Phase 31 D-10)", () => {
  const input = {
    locale: "en" as const,
    kind: "issued" as const,
    to: "Ada@Example.test",
    name: "Ada",
    reference: "VT-26-0753",
    amountRappen: 4000,
  };

  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "msg_1" }, error: null });
  });

  it("passes { idempotencyKey } as the second argument when given", async () => {
    const outcome = await sendRefund({ RESEND_API_KEY: "re_test" }, { ...input, idempotencyKey: "refund-mail:re_1" });
    expect(outcome).toEqual({ ok: true, providerMessageId: "msg_1" });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]).toHaveLength(2);
    expect(sendMock.mock.calls[0]?.[1]).toEqual({ idempotencyKey: "refund-mail:re_1" });
    expect((sendMock.mock.calls[0]?.[0] as { to: string }).to).toBe("ada@example.test");
  });

  it("without a key the call is unchanged: one argument", async () => {
    await sendRefund({ RESEND_API_KEY: "re_test" }, input);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]).toHaveLength(1);
  });
});

// Phase 31: a lost customer refund mail is never silent. Internal, English only, ids only.
describe("sendRefundMailAlert (Phase 31)", () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "msg_alert" }, error: null });
  });

  it("without a key answers ok:false and never calls Resend", async () => {
    const outcome = await sendRefundMailAlert(
      { RESEND_API_KEY: "" },
      { reference: "VT-26-0753", stripeRefundId: "re_1" },
      "ops@example.test",
    );
    expect(outcome).toEqual({ ok: false, error: "RESEND_API_KEY is not bound" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends once with subject, escaped html and text, and the idempotency key as the second argument", async () => {
    const outcome = await sendRefundMailAlert(
      { RESEND_API_KEY: "re_test" },
      { reference: "VT-<26>&0753", stripeRefundId: "re_1" },
      " Ops@Example.test ",
      "refund-mail-alert:re_1",
    );
    expect(outcome).toEqual({ ok: true, providerMessageId: "msg_alert" });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const [payload, options] = sendMock.mock.calls[0] as [
      { from: string; to: string; subject: string; html: string; text: string },
      unknown,
    ];
    expect(options).toEqual({ idempotencyKey: "refund-mail-alert:re_1" });
    expect(payload.from).toBe("Vamos Taxi <noreply@vamostaxi.site>");
    expect(payload.to).toBe("ops@example.test");
    expect(payload.subject).toBe("Refund mail not sent: VT-<26>&0753");
    expect(payload.text).toContain(
      "Stripe made refund re_1 on booking VT-<26>&0753, but the customer refund email could not be prepared, so the customer has not been told by email. Open the refund in Stripe and tell the customer yourself.",
    );
    expect(payload.html).toContain("VT-&lt;26&gt;&amp;0753");
    expect(payload.html).not.toContain("VT-<26>");
  });

  it("no reference: the subject names the refund id and the body says no reference", async () => {
    await sendRefundMailAlert({ RESEND_API_KEY: "re_test" }, { reference: null, stripeRefundId: "re_9" }, "ops@example.test");
    const [payload] = sendMock.mock.calls[0] as [{ subject: string; text: string }];
    expect(payload.subject).toBe("Refund mail not sent: re_9");
    expect(payload.text).toContain("Stripe made refund re_9 on booking no reference,");
    expect(sendMock.mock.calls[0]).toHaveLength(1);
  });

  // 31-06 deferred item, fixed in 31-13: the layouts' default footer is the sign-in link line; this
  // internal mail ends with the phone only, the way refund.ts and refund-check.ts do.
  it("ends with the phone-only footer, never the sign-in link line", async () => {
    await sendRefundMailAlert({ RESEND_API_KEY: "re_test" }, { reference: "VT-26-0753", stripeRefundId: "re_1" }, "ops@example.test");
    const [payload] = sendMock.mock.calls[0] as [{ html: string; text: string }];
    expect(payload.text.endsWith("\n\n+41 79 626 70 82")).toBe(true);
    expect(payload.html).toContain("+41 79 626 70 82");
    for (const out of [payload.html, payload.text]) {
      expect(out).not.toContain("This link works once");
      expect(out).not.toContain("expires after 1 hour");
    }
  });

  it("maps a Resend error or a throw to ok:false", async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: { message: "rate limited" } });
    expect(
      await sendRefundMailAlert({ RESEND_API_KEY: "re_test" }, { reference: "VT-1", stripeRefundId: "re_1" }, "o@x.test"),
    ).toEqual({ ok: false, error: "rate limited" });
    sendMock.mockRejectedValueOnce(new Error("network"));
    expect(
      await sendRefundMailAlert({ RESEND_API_KEY: "re_test" }, { reference: "VT-1", stripeRefundId: "re_1" }, "o@x.test"),
    ).toEqual({ ok: false, error: "network" });
  });
});
