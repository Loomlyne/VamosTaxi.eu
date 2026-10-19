import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { PAY_OUTCOMES, parseTripQuery } from "./trip-url";
import {
  ReturnDeadlineError,
  checkoutOutcomePath,
  errorLogFields,
  returnRedirectTarget,
  sessionFacts,
  withDeadline,
  type ReturnRedirectDeps,
  type ReturnSession,
} from "./return-settle";

const CS = "cs_test_a1B2c3";
const QUOTE = "11111111-2222-4333-8444-555555555555";
const REF = "VT-26-4821";

function stripeSession(patch: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: CS,
    payment_status: "paid",
    client_reference_id: REF,
    metadata: { booking_id: QUOTE, booking_reference: REF },
    ...patch,
  } as Stripe.Checkout.Session;
}

function read(patch: Partial<ReturnSession> = {}): ReturnSession {
  return { status: "paid", quoteId: QUOTE, reference: REF, session: stripeSession(), ...patch };
}

function deps(patch: Partial<ReturnRedirectDeps> = {}): ReturnRedirectDeps {
  return {
    readSession: vi.fn(async () => read()),
    settle: vi.fn(async () => "paid" as const),
    lookupReference: vi.fn(async () => REF),
    ...patch,
  };
}

describe("returnRedirectTarget (26.3 D-27)", () => {
  it("paid + settle ok → confirmation", async () => {
    expect(await returnRedirectTarget(deps(), { sessionId: CS, locale: "en" })).toBe(
      `/confirmation/${REF}`,
    );
  });

  it("paid + settle throws → still the confirmation", async () => {
    const d = deps({
      settle: vi.fn(async () => {
        throw new Error("resend down");
      }),
    });
    expect(await returnRedirectTarget(d, { sessionId: CS, locale: "de" })).toBe(
      `/de/confirmation/${REF}`,
    );
  });

  it("paid + settle reports failed → still the confirmation (never a failure page)", async () => {
    const d = deps({ settle: vi.fn(async () => "failed" as const) });
    expect(await returnRedirectTarget(d, { sessionId: CS, locale: "en" })).toBe(
      `/confirmation/${REF}`,
    );
  });

  it("paid + reference lookup throws → reference from session metadata", async () => {
    const d = deps({
      lookupReference: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    expect(await returnRedirectTarget(d, { sessionId: CS, locale: "fr" })).toBe(
      `/fr/confirmation/${REF}`,
    );
  });

  it("paid + no reference anywhere → confirmation by session, not an error", async () => {
    const d = deps({
      readSession: vi.fn(async () => read({ reference: null })),
      lookupReference: vi.fn(async () => ""),
    });
    expect(await returnRedirectTarget(d, { sessionId: CS, locale: "en" })).toBe(
      `/confirmation?session=${CS}`,
    );
  });

  it("unpaid → checkout resume with the quote id", async () => {
    const d = deps({ readSession: vi.fn(async () => read({ status: "unpaid" })) });
    expect(await returnRedirectTarget(d, { sessionId: CS, locale: "ar" })).toBe(
      `/ar/checkout?resume=${QUOTE}&pay=unpaid`,
    );
    expect(d.settle).not.toHaveBeenCalled();
  });

  it("invalid session id → plain checkout, no query, no Stripe call", async () => {
    const d = deps();
    expect(await returnRedirectTarget(d, { sessionId: "cs_x';--", locale: "en" })).toBe(
      "/checkout",
    );
    expect(d.readSession).not.toHaveBeenCalled();
  });

  it("Stripe unreadable + reference in the database → the confirmation, flagged check=1 (W3-01)", async () => {
    const d = deps({ readSession: vi.fn(async () => read({ status: "unknown", session: null })) });
    expect(await returnRedirectTarget(d, { sessionId: CS, locale: "en" })).toBe(`/confirmation/${REF}?check=1`);
    expect(d.settle).not.toHaveBeenCalled();
  });

  it("Stripe unreadable + no reference anywhere → /confirmation?session, never the empty trip editor (W3-01)", async () => {
    const d = deps({
      readSession: vi.fn(async () => read({ status: "unknown", session: null })),
      lookupReference: vi.fn(async () => ""),
    });
    expect(await returnRedirectTarget(d, { sessionId: CS, locale: "fr" })).toBe(`/fr/confirmation?session=${CS}`);
  });

  it("Stripe unreadable + the lookup throws → still the confirmation by session, and the failure is logged", async () => {
    const onFailure = vi.fn();
    const d = deps({
      readSession: vi.fn(async () => {
        throw Object.assign(new Error("sk_live_secret in message"), { type: "StripeAuthenticationError" });
      }),
      lookupReference: vi.fn(async () => {
        throw new Error("db down");
      }),
      onFailure,
    });
    expect(await returnRedirectTarget(d, { sessionId: CS, locale: "ar" })).toBe(`/ar/confirmation?session=${CS}`);
    expect(onFailure.mock.calls.map((c) => c[0])).toEqual(["return-retrieve-failed", "return-lookup-failed"]);
  });

  it("the ref query value does not exist as an input any more (W3-10)", async () => {
    const d = deps({ lookupReference: vi.fn(async () => "VT-26-9999") });
    const target = await returnRedirectTarget(d, { sessionId: CS, locale: "en", ref: REF } as never);
    expect(target).toBe("/confirmation/VT-26-9999");
  });

  it("the database reference wins over the session metadata reference", async () => {
    const d = deps({
      readSession: vi.fn(async () => read({ reference: "VT-26-1111" })),
      lookupReference: vi.fn(async () => "VT-26-2222"),
    });
    expect(await returnRedirectTarget(d, { sessionId: CS, locale: "en" })).toBe("/confirmation/VT-26-2222");
  });

  it("settle throwing is logged at the failure hook, with the deadline reason for a deadline", async () => {
    const onFailure = vi.fn();
    const d = deps({
      settle: vi.fn(async () => {
        throw new ReturnDeadlineError("settle");
      }),
      onFailure,
    });
    expect(await returnRedirectTarget(d, { sessionId: CS, locale: "en" })).toBe(`/confirmation/${REF}`);
    expect(onFailure).toHaveBeenCalledWith("return-deadline", expect.any(ReturnDeadlineError));
    const d2 = deps({ settle: vi.fn(async () => "failed" as const), onFailure });
    await returnRedirectTarget(d2, { sessionId: CS, locale: "en" });
    expect(onFailure).toHaveBeenCalledWith("return-settle-failed");
  });

  it("duplicate → confirmation with charge=refunded (D-22 unchanged)", async () => {
    const d = deps({ settle: vi.fn(async () => "duplicate" as const) });
    expect(await returnRedirectTarget(d, { sessionId: CS, locale: "en" })).toBe(
      `/confirmation/${REF}?charge=refunded`,
    );
  });
});

describe("sessionFacts", () => {
  it("rejects a non-uuid quote id and a malformed reference", () => {
    const facts = sessionFacts(
      stripeSession({
        payment_status: "unpaid",
        client_reference_id: null,
        metadata: { booking_id: "https://evil.example", booking_reference: "x" },
      }),
    );
    expect(facts).toMatchObject({ status: "unpaid", quoteId: null, reference: null });
  });
});

describe("returnRedirectTarget per-visitor limit (F6)", () => {
  it("refused → the checking page by reference, no Stripe read (W3-01)", async () => {
    const d = deps({ allowRead: vi.fn(async () => false) });
    expect(await returnRedirectTarget(d, { sessionId: CS, locale: "de" })).toBe(`/de/confirmation/${REF}?check=1`);
    expect(d.readSession).not.toHaveBeenCalled();
    expect(d.settle).not.toHaveBeenCalled();
  });
  it("allowed → unchanged", async () => {
    const d = deps({ allowRead: vi.fn(async () => true) });
    expect(await returnRedirectTarget(d, { sessionId: CS, locale: "en" })).toBe(`/confirmation/${REF}`);
    expect(d.readSession).toHaveBeenCalledTimes(1);
  });
  it("a malformed id never spends the limit", async () => {
    const allowRead = vi.fn(async () => true);
    await returnRedirectTarget(deps({ allowRead }), { sessionId: "nope", locale: "en" });
    expect(allowRead).not.toHaveBeenCalled();
  });
});

describe("checkoutOutcomePath: every pay outcome the route emits parses back (W3-01)", () => {
  it("each PayOutcome survives the checkout URL parser", () => {
    for (const outcome of PAY_OUTCOMES) {
      const path = checkoutOutcomePath("de", outcome);
      const parsed = parseTripQuery(new URL(`https://x.test${path}`).searchParams);
      expect(parsed.trip.pay, outcome).toBe(outcome);
    }
    const withQuote = checkoutOutcomePath("en", "unpaid", QUOTE);
    expect(withQuote).toBe(`/checkout?resume=${QUOTE}&pay=unpaid`);
    expect(parseTripQuery(new URL(`https://x.test${withQuote}`).searchParams).trip).toMatchObject({
      resume: QUOTE,
      pay: "unpaid",
    });
  });

  it("every `pay=` literal in the return code is a PayOutcome", () => {
    const web = join(__dirname, "..", "..");
    const text = ["lib/checkout/return-settle.ts", "app/api/checkout/return/route.ts"]
      .map((rel) => readFileSync(join(web, rel), "utf8"))
      .join("\n");
    const emitted = [...text.matchAll(/pay=([a-z]+)/g)].map((m) => m[1]);
    for (const value of emitted) expect(PAY_OUTCOMES as readonly string[], value).toContain(value);
    for (const outcome of ["unknown", "unpaid"]) {
      expect(text, outcome).toMatch(new RegExp(`"${outcome}"`));
    }
  });
});

describe("withDeadline (W3-11)", () => {
  it("rejects with ReturnDeadlineError when the work is slower than the deadline", async () => {
    vi.useFakeTimers();
    try {
      const slow = new Promise<string>(() => {});
      const settled = withDeadline(slow, 6000, "settle");
      const assertion = expect(settled).rejects.toBeInstanceOf(ReturnDeadlineError);
      await vi.advanceTimersByTimeAsync(6001);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("passes the value through and leaves no timer behind", async () => {
    vi.useFakeTimers();
    try {
      await expect(withDeadline(Promise.resolve("ok"), 6000, "settle")).resolves.toBe("ok");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("errorLogFields (W3-02): class only, never message, id or URL", () => {
  it("keeps the Stripe error class and drops the message", () => {
    const fields = errorLogFields(
      Object.assign(new Error("Invalid API Key provided: sk_live_****abcd cs_live_a1B2"), {
        type: "StripeAuthenticationError",
        code: "api_key_invalid",
        statusCode: 401,
      }),
    );
    expect(fields).toEqual({
      errorName: "Error",
      errorType: "StripeAuthenticationError",
      errorCode: "api_key_invalid",
      errorStatus: 401,
    });
    expect(JSON.stringify(fields)).not.toMatch(/sk_|cs_|Invalid API/);
  });
  it("copes with a non-error throw", () => {
    expect(errorLogFields("boom")).toEqual({ errorKind: "string" });
  });
});
