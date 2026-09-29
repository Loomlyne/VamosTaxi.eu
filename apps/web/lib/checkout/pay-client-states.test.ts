import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PAY_LINK_POLL_BUDGET_MS,
  PAY_LINK_POLL_INTERVAL_MS,
  payLinkSessionKey,
  payPollStep,
  payStateFromOpen,
  sessionIdFromClientSecret,
  splitAroundMarker,
  storedPayLinkSessionId,
} from "./pay-client-states";
import { returnSettleOutcome } from "./return-settle";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");

function source(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

describe("payStateFromOpen (D-20/D-21/D-22)", () => {
  it("reads pay_link_paid as already paid, with the reference", () => {
    expect(payStateFromOpen({ code: "pay_link_paid", reference: "VT-26-0001" })).toEqual({
      kind: "alreadyPaid",
      reference: "VT-26-0001",
    });
  });

  it("reads pay_link_refunded_duplicate as the race-lost refund, with the reference", () => {
    expect(
      payStateFromOpen({ code: "pay_link_refunded_duplicate", reference: "VT-26-0001" }),
    ).toEqual({ kind: "raceRefunded", reference: "VT-26-0001" });
  });

  it("reads pay_link_expired and quote_expired as the recipient's expired state", () => {
    expect(payStateFromOpen({ code: "pay_link_expired" })).toEqual({ kind: "expired" });
    expect(payStateFromOpen({ code: "quote_expired" })).toEqual({ kind: "expired" });
  });

  it("reads a Stripe-hosted url as payable, a bare client secret as not (D-46)", () => {
    expect(payStateFromOpen({ url: "https://checkout.stripe.com/c/pay/cs_test_abc" })).toEqual({
      kind: "payable",
    });
    expect(payStateFromOpen({ client_secret: "cs_test_abc_secret_xyz" })).toEqual({
      kind: "alert",
      key: "paymentWindowClosed",
    });
  });

  it("keeps every other refusal on its existing alert key", () => {
    expect(payStateFromOpen({ code: "pricing_not_live" })).toEqual({
      kind: "alert",
      key: "pricingNotLive",
    });
    expect(payStateFromOpen({ code: "quote_already_booked" })).toEqual({
      kind: "alert",
      key: "quoteAlreadyBooked",
    });
    expect(payStateFromOpen({ code: "invalid_request" })).toEqual({
      kind: "alert",
      key: "paymentWindowClosed",
    });
    expect(payStateFromOpen({})).toEqual({ kind: "alert", key: "paymentWindowClosed" });
    expect(payStateFromOpen(null)).toEqual({ kind: "alert", key: "paymentWindowClosed" });
  });

  it("never echoes a reference that is not a booking reference", () => {
    expect(payStateFromOpen({ code: "pay_link_paid", reference: "<script>" })).toEqual({
      kind: "alreadyPaid",
      reference: "",
    });
    expect(payStateFromOpen({ code: "pay_link_refunded_duplicate", reference: 42 })).toEqual({
      kind: "raceRefunded",
      reference: "",
    });
  });

  it("lets a refusal code win over a stray client secret", () => {
    expect(
      payStateFromOpen({ code: "pay_link_paid", reference: "VT-26-0001", url: "https://checkout.stripe.com/c/pay/x" }),
    ).toEqual({ kind: "alreadyPaid", reference: "VT-26-0001" });
  });
});

describe("sessionIdFromClientSecret", () => {
  it("reads the Checkout Session id before _secret_", () => {
    expect(sessionIdFromClientSecret("cs_test_abc_secret_xyz")).toBe("cs_test_abc");
    expect(sessionIdFromClientSecret("cs_live_A1b2_secret_q")).toBe("cs_live_A1b2");
  });

  it("answers null for anything malformed", () => {
    expect(sessionIdFromClientSecret("not-a-secret")).toBeNull();
    expect(sessionIdFromClientSecret("_secret_xyz")).toBeNull();
    expect(sessionIdFromClientSecret("pi_123_secret_xyz")).toBeNull();
    expect(sessionIdFromClientSecret("")).toBeNull();
    expect(sessionIdFromClientSecret(undefined)).toBeNull();
    expect(sessionIdFromClientSecret(12)).toBeNull();
  });
});

describe("storedPayLinkSessionId", () => {
  it("keeps a Checkout Session id and drops anything else", () => {
    expect(storedPayLinkSessionId("cs_test_abc")).toBe("cs_test_abc");
    expect(storedPayLinkSessionId("cs_live_A1")).toBe("cs_live_A1");
    expect(storedPayLinkSessionId("cs_test_abc_secret_x")).toBeNull();
    expect(storedPayLinkSessionId("pi_123")).toBeNull();
    expect(storedPayLinkSessionId(null)).toBeNull();
    expect(storedPayLinkSessionId("")).toBeNull();
  });
});

describe("payLinkSessionKey", () => {
  it("derives the sessionStorage key from the token's first 12 characters", () => {
    expect(payLinkSessionKey("abcdefghijklmnopqrstuvwxyz")).toBe(
      "vamos.payLink.session.abcdefghijkl",
    );
  });

  it("normalises whitespace the same way the open call does", () => {
    expect(payLinkSessionKey("  abcd efgh ijkl mnop ")).toBe(payLinkSessionKey("abcdefghijklmnop"));
  });
});

describe("payPollStep (after the recipient's own payment)", () => {
  it("continues to the success path once the link answers paid", () => {
    expect(payPollStep({ kind: "alreadyPaid", reference: "VT-26-0001" })).toBe("continue");
  });

  it("stops on the race card when the recipient's charge was the refunded one", () => {
    expect(payPollStep({ kind: "raceRefunded", reference: "VT-26-0001" })).toBe("raceRefunded");
  });

  it("keeps waiting on anything else", () => {
    expect(payPollStep({ kind: "payable" })).toBe("wait");
    expect(payPollStep({ kind: "expired" })).toBe("wait");
    expect(payPollStep({ kind: "alert", key: "quoteAlreadyBooked" })).toBe("wait");
  });

  it("uses the confirmation page's poll budget (1 s interval, 12 s)", () => {
    expect(PAY_LINK_POLL_INTERVAL_MS).toBe(1000);
    expect(PAY_LINK_POLL_BUDGET_MS).toBe(12_000);
  });
});

describe("splitAroundMarker", () => {
  it("splits a translated sentence around the placeholder marker", () => {
    expect(splitAroundMarker("No need to pay again — \u0001 is confirmed.", "\u0001")).toEqual({
      before: "No need to pay again — ",
      after: " is confirmed.",
    });
  });

  it("answers null when the marker is missing", () => {
    expect(splitAroundMarker("No marker here", "\u0001")).toBeNull();
  });
});

describe("return route duplicate (D-22)", () => {
  it("reads a settled duplicate as duplicate, a plain ack as paid, a retry as failed", () => {
    expect(returnSettleOutcome({ ack: true, settled: { duplicate: true, revived: false } })).toBe(
      "duplicate",
    );
    expect(returnSettleOutcome({ ack: true })).toBe("paid");
    expect(returnSettleOutcome({ ack: true, settled: { duplicate: false, revived: true } })).toBe(
      "paid",
    );
    expect(returnSettleOutcome({ retry: true })).toBe("failed");
  });

  it("sends a duplicate return to the confirmation with charge=refunded", () => {
    const route = source("lib/checkout/return-settle.ts");
    expect(route).toContain('result === "duplicate"');
    expect(route).toContain("?charge=refunded");
    expect(route).toContain("BOOKING_REFERENCE_RE.test(bookingRef)");
  });

  it("settlePaidReturn answers duplicate through returnSettleOutcome", () => {
    const settle = source("lib/checkout/return-settle.ts");
    expect(settle).toContain('Promise<"paid" | "duplicate" | "unpaid" | "failed">');
    expect(settle).toContain("return returnSettleOutcome(handled)");
  });
});

describe("PayClient (D-46): trip, price, one PAY, no card form", () => {
  const client = source("app/[locale]/checkout/pay/[token]/PayClient.tsx");

  it("has no card panel, client secret or card fields", () => {
    for (const banned of ["PaymentPanel", "client_secret", "TokenDummyFields", "cardNumber", "cardCvc", "cc-"]) {
      expect(client).not.toContain(banned);
    }
  });

  it("opens the hosted session and leaves for Stripe with location.assign", () => {
    expect(client).toContain("window.location.assign(json.url)");
    expect(client).toContain('t("openingPayment")');
    expect(client).toContain('t("payStartFailed")');
    expect(client).toContain('t("methodNote")');
    expect(client).toContain('t("payTotal"');
  });
});
