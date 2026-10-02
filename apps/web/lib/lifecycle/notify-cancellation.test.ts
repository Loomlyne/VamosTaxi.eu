// apps/web/lib/lifecycle/notify-cancellation.test.ts
//
// 26.2 audit U02-1: the cancellation claim settles on the customer's send outcome only.
// A failed customer mail with a successful bookings@ copy must settle as failed.
// Mocks asSystem and the mail sender. No live Resend, no database.

import { beforeEach, describe, expect, it, vi } from "vitest";

const sendCancellation = vi.fn();
vi.mock("@vamos/emails/confirmation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vamos/emails/confirmation")>();
  return { ...actual, sendCancellation: (...args: unknown[]) => sendCancellation(...args) };
});

type Call = { text: string; values: unknown[] };
const settleCalls: Call[] = [];
vi.mock("../db/identity", () => ({
  asSystem: async (_env: unknown, fn: (sql: unknown) => Promise<unknown>) => {
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      if (text.includes("notification_settle")) settleCalls.push({ text, values });
      return Promise.resolve(text.includes("notification_claim") ? [{ id: 7 }] : []);
    };
    return fn(sql);
  },
}));

import { notifyCancellation } from "./notify-lifecycle";

const ENV = { RESEND_API_KEY: "re_test_key" } as unknown as CloudflareEnv;
const TRIP = {
  bookingId: "00000000-0000-4000-8000-000000000009",
  customerEmail: "customer@example.test",
  reference: "VT-0000",
  locale: "en",
  pickupText: "A",
  dropoffText: "B",
  scheduledLocal: "2026-10-10 10:00",
  refundLine: "none",
} as unknown as Parameters<typeof notifyCancellation>[1];

describe("notifyCancellation settles on the customer outcome", () => {
  beforeEach(() => {
    sendCancellation.mockReset();
    settleCalls.length = 0;
  });

  it("records a failed customer mail as failed even when the ops copy went out", async () => {
    sendCancellation.mockImplementation(async (_mail: unknown, _trip: unknown, to: string) =>
      to === "customer@example.test"
        ? { ok: false, error: "rejected" }
        : { ok: true, providerMessageId: "msg_ops" },
    );
    await notifyCancellation(ENV, TRIP);
    expect(sendCancellation).toHaveBeenCalledTimes(2);
    expect(settleCalls).toHaveLength(1);
    expect(settleCalls[0]?.values).toEqual([7, null, "rejected"]);
  });

  it("records the customer message id when the customer mail went out", async () => {
    sendCancellation.mockImplementation(async (_mail: unknown, _trip: unknown, to: string) => ({
      ok: true,
      providerMessageId: to === "customer@example.test" ? "msg_customer" : "msg_ops",
    }));
    await notifyCancellation(ENV, TRIP);
    expect(settleCalls[0]?.values).toEqual([7, "msg_customer", null]);
  });
});
