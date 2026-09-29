import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import {
  returnRedirectTarget,
  sessionFacts,
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
    expect(await returnRedirectTarget(deps(), { sessionId: CS, ref: "", locale: "en" })).toBe(
      `/confirmation/${REF}`,
    );
  });

  it("paid + settle throws → still the confirmation", async () => {
    const d = deps({
      settle: vi.fn(async () => {
        throw new Error("resend down");
      }),
    });
    expect(await returnRedirectTarget(d, { sessionId: CS, ref: "", locale: "de" })).toBe(
      `/de/confirmation/${REF}`,
    );
  });

  it("paid + settle reports failed → still the confirmation (never a failure page)", async () => {
    const d = deps({ settle: vi.fn(async () => "failed" as const) });
    expect(await returnRedirectTarget(d, { sessionId: CS, ref: REF, locale: "en" })).toBe(
      `/confirmation/${REF}`,
    );
  });

  it("paid + reference lookup throws → reference from session metadata", async () => {
    const d = deps({
      lookupReference: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    expect(await returnRedirectTarget(d, { sessionId: CS, ref: "", locale: "fr" })).toBe(
      `/fr/confirmation/${REF}`,
    );
  });

  it("paid + no reference anywhere → confirmation by session, not an error", async () => {
    const d = deps({
      readSession: vi.fn(async () => read({ reference: null })),
      lookupReference: vi.fn(async () => ""),
    });
    expect(await returnRedirectTarget(d, { sessionId: CS, ref: "bad", locale: "en" })).toBe(
      `/confirmation?session=${CS}`,
    );
  });

  it("a valid ref query param is used without a lookup", async () => {
    const d = deps();
    await returnRedirectTarget(d, { sessionId: CS, ref: REF, locale: "en" });
    expect(d.lookupReference).not.toHaveBeenCalled();
  });

  it("unpaid → checkout resume with the quote id", async () => {
    const d = deps({ readSession: vi.fn(async () => read({ status: "unpaid" })) });
    expect(await returnRedirectTarget(d, { sessionId: CS, ref: "", locale: "ar" })).toBe(
      `/ar/checkout?resume=${QUOTE}&pay=unpaid`,
    );
    expect(d.settle).not.toHaveBeenCalled();
  });

  it("invalid session id → plain checkout, no query, no Stripe call", async () => {
    const d = deps();
    expect(await returnRedirectTarget(d, { sessionId: "cs_x';--", ref: "", locale: "en" })).toBe(
      "/checkout",
    );
    expect(d.readSession).not.toHaveBeenCalled();
  });

  it("Stripe retrieve failure → checkout?pay=unknown", async () => {
    const d = deps({ readSession: vi.fn(async () => read({ status: "unknown", session: null })) });
    expect(await returnRedirectTarget(d, { sessionId: CS, ref: "", locale: "en" })).toBe(
      "/checkout?pay=unknown",
    );
  });

  it("duplicate → confirmation with charge=refunded (D-22 unchanged)", async () => {
    const d = deps({ settle: vi.fn(async () => "duplicate" as const) });
    expect(await returnRedirectTarget(d, { sessionId: CS, ref: "", locale: "en" })).toBe(
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
