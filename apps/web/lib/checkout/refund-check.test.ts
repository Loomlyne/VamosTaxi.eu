// apps/web/lib/checkout/refund-check.test.ts
//
// Phase 31 D-09 / D-12 / C-02: the nightly read-only refund check. Synthetic ids (re_t_*, pi_t_*,
// VT-26-0001) and synthetic rappen integers only, never a product CHF figure.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WEB_ROOT } from "../../tests/support/server-harness";

const stripeMocks = vi.hoisted(() => ({
  list: vi.fn(),
  autoPagingToArray: vi.fn(),
  stripeFromEnv: vi.fn(),
}));
vi.mock("./stripe", () => ({ stripeFromEnv: stripeMocks.stripeFromEnv }));

const readerMocks = vi.hoisted(() => ({ loadRefundCheckRows: vi.fn() }));
vi.mock("../db/system-reads", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../db/system-reads")>()),
  loadRefundCheckRows: readerMocks.loadRefundCheckRows,
}));

const mailMocks = vi.hoisted(() => ({ sendRefundCheck: vi.fn() }));
vi.mock("@vamos/emails/confirmation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vamos/emails/confirmation")>()),
  sendRefundCheck: mailMocks.sendRefundCheck,
}));

import {
  REFUND_CHECK_CAP,
  refundCheck,
  refundCheckWithDeps,
  type RefundCheckDeps,
  type StripeRefundLite,
} from "./refund-check";
import type { RefundCheckRow } from "../db/system-reads";
import { deliverRefundCheckAlert, deliverRefundCheckDidNotRun, MustFixMailError } from "../ops/must-fix-mail";
import { SUPPORT_EMAIL } from "../contact-channels";

const NOW = new Date("2026-10-13T03:00:00.000Z");
const NOW_S = Math.floor(NOW.getTime() / 1000);

function refund(over: Partial<StripeRefundLite> = {}): StripeRefundLite {
  return {
    id: "re_t_1",
    amount: 4000,
    currency: "chf",
    status: "succeeded",
    created: NOW_S - 3600,
    payment_intent: "pi_t_1",
    metadata: {},
    ...over,
  };
}

/** A reader row for a refund recorded on booking VT-26-0001 with matching totals. */
function row(over: Partial<RefundCheckRow> = {}): RefundCheckRow {
  return {
    stripe_refund_id: "re_t_1",
    payment_intent_id: "pi_t_1",
    payment_found: true,
    payment_status: "succeeded",
    booking_reference: "VT-26-0001",
    site_refund_rappen: "4000",
    site_reason: "stripe_dashboard",
    site_reversed: false,
    booking_refunded_rappen: "4000",
    booking_rows_sum_rappen: "4000",
    booking_refund_status: "refunded",
    ...over,
  };
}

function deps(refunds: StripeRefundLite[], rows: Record<string, Partial<RefundCheckRow>> = {}, truncated = false) {
  const d = {
    listRefunds: vi.fn(async () => ({ refunds, truncated })),
    readSite: vi.fn(async (items: { id: string; payment_intent: string | null }[]) =>
      items.map((item) => row({ stripe_refund_id: item.id, payment_intent_id: item.payment_intent, ...rows[item.id] })),
    ),
    sendAlert: vi.fn(async () => undefined),
    sendDidNotRun: vi.fn(async () => undefined),
    emit: vi.fn(),
  } satisfies RefundCheckDeps;
  return d;
}

describe("refundCheckWithDeps: window and cap", () => {
  it("lists refunds created between 48 h and 30 minutes ago, in unix seconds", async () => {
    const d = deps([]);
    await refundCheckWithDeps(d, NOW);
    expect(d.listRefunds).toHaveBeenCalledTimes(1);
    expect(d.listRefunds).toHaveBeenCalledWith({ gte: NOW_S - 48 * 3600, lt: NOW_S - 30 * 60 });
  });

  it("nothing to compare: the reader is not called and no mail goes out", async () => {
    const d = deps([]);
    const result = await refundCheckWithDeps(d, NOW);
    expect(d.readSite).not.toHaveBeenCalled();
    expect(d.sendAlert).not.toHaveBeenCalled();
    expect(result).toEqual({
      outcome: "ok",
      stripeRefunds: 0,
      compared: 0,
      skippedInFlight: 0,
      skippedAppMissing: 0,
      findings: 0,
      truncated: false,
      mailed: false,
    });
  });

  it("the cap is 500: more than 500 listed compares the newest 500 and says truncated", async () => {
    expect(REFUND_CHECK_CAP).toBe(500);
    const many = Array.from({ length: 501 }, (_, i) => refund({ id: `re_t_${i}`, metadata: {} }));
    const d = deps(many, { re_t_0: { payment_found: false } });
    const result = await refundCheckWithDeps(d, NOW);
    expect(d.readSite.mock.calls[0]![0]).toHaveLength(500);
    expect(d.readSite.mock.calls[0]![0][0]).toEqual({ id: "re_t_0", payment_intent: "pi_t_1" });
    expect(result.truncated).toBe(true);
    expect(d.sendAlert.mock.calls[0]![0]).toMatchObject({ truncated: true });
  });

  it("the lister's own truncated flag is carried; exactly 500 without it is not truncated", async () => {
    const five = Array.from({ length: 500 }, (_, i) => refund({ id: `re_t_${i}` }));
    expect((await refundCheckWithDeps(deps(five), NOW)).truncated).toBe(false);
    expect((await refundCheckWithDeps(deps([refund()], {}, true), NOW)).truncated).toBe(true);
  });
});

describe("refundCheckWithDeps: skipped before the reader", () => {
  it("in-flight, booking_missing app refunds and non-CHF refunds never reach the reader", async () => {
    const d = deps([
      refund({ id: "re_t_pending", status: "pending" }),
      refund({ id: "re_t_action", status: "requires_action" }),
      refund({ id: "re_t_missing_app", metadata: { vamos_reason: "booking_missing" }, payment_intent: null }),
      refund({ id: "re_t_eur", currency: "eur" }),
      refund({ id: "re_t_ok" }),
    ]);
    const result = await refundCheckWithDeps(d, NOW);
    expect(d.readSite).toHaveBeenCalledTimes(1);
    expect(d.readSite).toHaveBeenCalledWith([{ id: "re_t_ok", payment_intent: "pi_t_1" }]);
    expect(result).toMatchObject({ stripeRefunds: 5, compared: 1, skippedInFlight: 2, skippedAppMissing: 1, findings: 0 });
  });
});

describe("refundCheckWithDeps: classification", () => {
  it("payment found nowhere: not linked (payment none when Stripe gives none)", async () => {
    const d = deps(
      [refund({ id: "re_t_u1", payment_intent: "pi_t_x" }), refund({ id: "re_t_u2", payment_intent: null, amount: 1250 })],
      { re_t_u1: { payment_found: false, booking_reference: null }, re_t_u2: { payment_found: false, booking_reference: null } },
    );
    await refundCheckWithDeps(d, NOW);
    expect(d.sendAlert.mock.calls[0]![0].unlinked).toEqual([
      { refundId: "re_t_u1", amountRappen: 4000, paymentIntentId: "pi_t_x" },
      { refundId: "re_t_u2", amountRappen: 1250, paymentIntentId: null },
    ]);
  });

  it("Stripe succeeded, no site row: missing on the booking, with Stripe's created time", async () => {
    const d = deps([refund({ id: "re_t_m" })], {
      re_t_m: { site_refund_rappen: null, site_reversed: false, booking_refunded_rappen: "0", booking_rows_sum_rappen: "0" },
    });
    await refundCheckWithDeps(d, NOW);
    expect(d.sendAlert.mock.calls[0]![0].missing).toEqual([
      {
        reference: "VT-26-0001",
        amountRappen: 4000,
        refundId: "re_t_m",
        createdAt: new Date((NOW_S - 3600) * 1000).toISOString(),
      },
    ]);
  });

  it("Stripe succeeded, site row with another amount: amounts differ", async () => {
    const d = deps([refund({ id: "re_t_a" })], {
      re_t_a: { site_refund_rappen: "3000", booking_refunded_rappen: "3000", booking_rows_sum_rappen: "3000" },
    });
    await refundCheckWithDeps(d, NOW);
    expect(d.sendAlert.mock.calls[0]![0].amountDiffers).toEqual([
      { reference: "VT-26-0001", stripeRappen: 4000, siteRappen: 3000, refundId: "re_t_a" },
    ]);
  });

  it("Stripe succeeded, site row reversed: status differs (succeeded / failed)", async () => {
    const d = deps([refund({ id: "re_t_r" })], { re_t_r: { site_reversed: true, booking_refunded_rappen: "0", booking_rows_sum_rappen: "0" } });
    await refundCheckWithDeps(d, NOW);
    expect(d.sendAlert.mock.calls[0]![0].statusDiffers).toEqual([
      { reference: "VT-26-0001", stripeStatus: "succeeded", siteStatus: "failed", refundId: "re_t_r" },
    ]);
  });

  it("Stripe failed or canceled, site row not reversed: status differs (failed / refunded)", async () => {
    const d = deps([refund({ id: "re_t_f", status: "failed" }), refund({ id: "re_t_c", status: "canceled" })]);
    await refundCheckWithDeps(d, NOW);
    expect(d.sendAlert.mock.calls[0]![0].statusDiffers).toEqual([
      { reference: "VT-26-0001", stripeStatus: "failed", siteStatus: "refunded", refundId: "re_t_f" },
      { reference: "VT-26-0001", stripeStatus: "canceled", siteStatus: "refunded", refundId: "re_t_c" },
    ]);
  });

  it("Stripe failed/canceled with a reversed site row, or with no site row: no finding", async () => {
    const d = deps([refund({ id: "re_t_f1", status: "failed" }), refund({ id: "re_t_c1", status: "canceled" })], {
      re_t_f1: { site_reversed: true },
      re_t_c1: { site_refund_rappen: null },
    });
    const result = await refundCheckWithDeps(d, NOW);
    expect(result.findings).toBe(0);
    expect(d.sendAlert).not.toHaveBeenCalled();
  });

  it("a matching recorded refund is no finding", async () => {
    const d = deps([refund()]);
    const result = await refundCheckWithDeps(d, NOW);
    expect(result).toMatchObject({ outcome: "ok", compared: 1, findings: 0, mailed: false });
    expect(d.sendAlert).not.toHaveBeenCalled();
  });

  it("booking refunded total differs from its refund rows: one totalDiffers line per booking", async () => {
    const d = deps([refund({ id: "re_t_1" }), refund({ id: "re_t_2", amount: 1000 })], {
      re_t_1: { booking_refunded_rappen: "4000", booking_rows_sum_rappen: "3000" },
      re_t_2: { site_refund_rappen: "1000", booking_refunded_rappen: "4000", booking_rows_sum_rappen: "3000" },
    });
    const result = await refundCheckWithDeps(d, NOW);
    expect(d.sendAlert.mock.calls[0]![0].totalDiffers).toEqual([
      { reference: "VT-26-0001", bookingRappen: 4000, rowsRappen: 3000 },
    ]);
    expect(result.findings).toBe(1);
  });

  it("a reader answer that does not line up with the input is refused (never a guessed match)", async () => {
    const d = deps([refund({ id: "re_t_1" }), refund({ id: "re_t_2" })]);
    d.readSite.mockResolvedValueOnce([row({ stripe_refund_id: "re_t_1" })]);
    await expect(refundCheckWithDeps(d, NOW)).rejects.toThrow("refund_check_rows_mismatch");
    d.readSite.mockResolvedValueOnce([row({ stripe_refund_id: "re_t_2" }), row({ stripe_refund_id: "re_t_1" })]);
    await expect(refundCheckWithDeps(d, NOW)).rejects.toThrow("refund_check_rows_mismatch");
    expect(d.sendAlert).not.toHaveBeenCalled();
  });
});

describe("refundCheckWithDeps: mail and failures", () => {
  it("findings: one alert with the whole report, mailed true, counts only in the result", async () => {
    const d = deps([refund({ id: "re_t_m" }), refund({ id: "re_t_u" })], {
      re_t_m: { site_refund_rappen: null },
      re_t_u: { payment_found: false, booking_reference: null },
    });
    const result = await refundCheckWithDeps(d, NOW);
    expect(d.sendAlert).toHaveBeenCalledTimes(1);
    expect(d.sendDidNotRun).not.toHaveBeenCalled();
    expect(result).toEqual({
      outcome: "ok",
      stripeRefunds: 2,
      compared: 2,
      skippedInFlight: 0,
      skippedAppMissing: 0,
      findings: 2,
      truncated: false,
      mailed: true,
    });
    for (const [key, value] of Object.entries(result)) {
      if (key === "outcome") continue;
      expect(["number", "boolean"]).toContain(typeof value);
    }
  });

  it.each([
    ["network", Object.assign(new Error("connect ECONNRESET"), { type: "StripeConnectionError" })],
    ["5xx", Object.assign(new Error("server"), { type: "StripeAPIError", statusCode: 503 })],
    ["auth", Object.assign(new Error("Invalid API Key"), { type: "StripeAuthenticationError", statusCode: 401 })],
  ])("listing fails (%s): one did-not-run mail, the reader is never called", async (_label, err) => {
    const d = deps([]);
    d.listRefunds.mockRejectedValueOnce(err);
    const result = await refundCheckWithDeps(d, NOW);
    expect(d.sendDidNotRun).toHaveBeenCalledTimes(1);
    expect(d.readSite).not.toHaveBeenCalled();
    expect(d.sendAlert).not.toHaveBeenCalled();
    expect(result).toMatchObject({ outcome: "did_not_run", stripeRefunds: 0, compared: 0, mailed: true });
    // The log carries a fixed word, never Stripe's error text.
    for (const call of d.emit.mock.calls) expect(JSON.stringify(call)).not.toContain((err as Error).message);
  });

  it("the reader fails: the check rejects and sends neither mail (the did-not-run text names Stripe)", async () => {
    const d = deps([refund()]);
    d.readSite.mockRejectedValueOnce(new Error("db down"));
    await expect(refundCheckWithDeps(d, NOW)).rejects.toThrow("db down");
    expect(d.sendDidNotRun).not.toHaveBeenCalled();
    expect(d.sendAlert).not.toHaveBeenCalled();
  });

  it("a mail that does not go out rejects (the cron logs it)", async () => {
    const d = deps([refund({ id: "re_t_m" })], { re_t_m: { site_refund_rappen: null } });
    d.sendAlert.mockRejectedValueOnce(new MustFixMailError("send_failed"));
    await expect(refundCheckWithDeps(d, NOW)).rejects.toBeInstanceOf(MustFixMailError);
  });
});

describe("refundCheck(env): Stripe list only, through the definer reader", () => {
  const env = { RESEND_API_KEY: "re_test_key", STRIPE_SECRET_KEY: "sk_test_x" } as unknown as CloudflareEnv;

  beforeEach(() => {
    stripeMocks.list.mockReset();
    stripeMocks.autoPagingToArray.mockReset();
    stripeMocks.stripeFromEnv.mockReset();
    readerMocks.loadRefundCheckRows.mockReset();
    mailMocks.sendRefundCheck.mockReset();
    mailMocks.sendRefundCheck.mockResolvedValue({ ok: true, providerMessageId: "msg_1" });
    stripeMocks.list.mockReturnValue({ autoPagingToArray: stripeMocks.autoPagingToArray });
    // The client stand-in exposes only refunds.list: any create/update/del/cancel would throw.
    stripeMocks.stripeFromEnv.mockReturnValue({ refunds: { list: stripeMocks.list } });
  });

  it("asks Stripe for one window, pages of 100, at most 501, and normalises payment_intent to its id", async () => {
    stripeMocks.autoPagingToArray.mockResolvedValue([
      { id: "re_t_1", amount: 4000, currency: "chf", status: "succeeded", created: NOW_S - 3600, payment_intent: { id: "pi_t_1" }, metadata: {} },
      { id: "re_t_2", amount: 500, currency: "chf", status: "succeeded", created: NOW_S - 3600, payment_intent: null, metadata: null },
    ]);
    readerMocks.loadRefundCheckRows.mockImplementation(async (_env, items: { id: string; payment_intent: string | null }[]) =>
      items.map((item) => row({ stripe_refund_id: item.id, payment_intent_id: item.payment_intent, ...(item.id === "re_t_2" ? { payment_found: false } : {}) })),
    );
    const result = await refundCheck(env, NOW);
    expect(stripeMocks.list).toHaveBeenCalledWith({ created: { gte: NOW_S - 48 * 3600, lt: NOW_S - 30 * 60 }, limit: 100 });
    expect(stripeMocks.autoPagingToArray).toHaveBeenCalledWith({ limit: 501 });
    expect(readerMocks.loadRefundCheckRows).toHaveBeenCalledWith(env, [
      { id: "re_t_1", payment_intent: "pi_t_1" },
      { id: "re_t_2", payment_intent: null },
    ]);
    expect(result).toMatchObject({ outcome: "ok", compared: 2, findings: 1, mailed: true });
    expect(mailMocks.sendRefundCheck).toHaveBeenCalledTimes(1);
    const [, mail, to] = mailMocks.sendRefundCheck.mock.calls[0]!;
    expect(to).toBe(SUPPORT_EMAIL);
    expect(mail.subject).toBe("Refund check: 1 Stripe refund(s) do not match a booking");
    expect(mail.text).toContain("- refund re_t_2 · CHF 5.00 · payment none");
  });

  it("Stripe does not answer: the did-not-run mail goes to info@", async () => {
    stripeMocks.autoPagingToArray.mockRejectedValue(Object.assign(new Error("timeout"), { type: "StripeConnectionError" }));
    const result = await refundCheck(env, NOW);
    expect(result.outcome).toBe("did_not_run");
    expect(readerMocks.loadRefundCheckRows).not.toHaveBeenCalled();
    const [, mail, to] = mailMocks.sendRefundCheck.mock.calls[0]!;
    expect(to).toBe(SUPPORT_EMAIL);
    expect(mail.subject).toBe("Refund check did not run");
  });
});

describe("deliverRefundCheckAlert / deliverRefundCheckDidNotRun", () => {
  const report = {
    missing: [],
    amountDiffers: [],
    totalDiffers: [],
    statusDiffers: [],
    unlinked: [{ refundId: "re_t_1", amountRappen: 4000, paymentIntentId: "pi_t_1" }],
    truncated: false,
  };

  beforeEach(() => {
    mailMocks.sendRefundCheck.mockReset();
  });

  it("send to SUPPORT_EMAIL only and resolve when Resend accepts", async () => {
    mailMocks.sendRefundCheck.mockResolvedValue({ ok: true, providerMessageId: "msg_1" });
    const env = { RESEND_API_KEY: "re_test_key" } as unknown as CloudflareEnv;
    await deliverRefundCheckAlert(env, report);
    await deliverRefundCheckDidNotRun(env);
    expect(mailMocks.sendRefundCheck).toHaveBeenCalledTimes(2);
    for (const call of mailMocks.sendRefundCheck.mock.calls) {
      expect(call[0]).toEqual({ RESEND_API_KEY: "re_test_key" });
      expect(call[2]).toBe(SUPPORT_EMAIL);
    }
  });

  it("no key: MustFixMailError no_api_key, nothing sent", async () => {
    const env = {} as CloudflareEnv;
    await expect(deliverRefundCheckAlert(env, report)).rejects.toMatchObject({ code: "no_api_key" });
    await expect(deliverRefundCheckDidNotRun(env)).rejects.toMatchObject({ code: "no_api_key" });
    expect(mailMocks.sendRefundCheck).not.toHaveBeenCalled();
  });

  it("a refused send: MustFixMailError send_failed", async () => {
    mailMocks.sendRefundCheck.mockResolvedValue({ ok: false, error: "rate limited" });
    const env = { RESEND_API_KEY: "re_test_key" } as unknown as CloudflareEnv;
    await expect(deliverRefundCheckAlert(env, report)).rejects.toMatchObject({ code: "send_failed" });
    await expect(deliverRefundCheckDidNotRun(env)).rejects.toMatchObject({ code: "send_failed" });
  });
});

describe("source pins", () => {
  const src = readFileSync(join(WEB_ROOT, "lib/checkout/refund-check.ts"), "utf8");
  const reads = readFileSync(join(WEB_ROOT, "lib/db/system-reads.ts"), "utf8");

  it("the check never calls a Stripe write method and never writes a table", () => {
    expect(src.match(/\.(create|update|del|cancel)\(/g)).toBeNull();
    expect(src).not.toMatch(/\b(insert\s+into|update\s+public\.|delete\s+from)\b/i);
    expect(src).toContain("refunds.list(");
  });

  it("the reader goes through refund_check_read with sql.json, never a JS array or JSON.stringify", () => {
    const at = reads.indexOf("export const loadRefundCheckRows");
    expect(at).toBeGreaterThan(-1);
    const body = reads.slice(at, reads.indexOf("\n};", at) + 3);
    expect(body).toMatch(/public\.refund_check_read\(\$\{sql\.json\(/);
    expect(body).toContain("asSystem");
    expect(body).not.toContain("JSON.stringify");
    expect(body).not.toContain("sql.array");
  });
});
