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

import { CONFIRMATION_TEMPLATE_VERSION, sendConfirmation, sendPriceChanged } from "./send";

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
