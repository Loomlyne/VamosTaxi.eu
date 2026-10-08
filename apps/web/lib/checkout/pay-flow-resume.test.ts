import { describe, expect, it, vi } from "vitest";
import { freshResume } from "./pay-flow";

// J5 (W3-05): the stored Stripe resume URL is checked again at PAY; a dead page is never reused.

const Q = "11111111-2222-4333-8444-555555555555";
const answer = (body: unknown): typeof fetch => vi.fn(async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;

describe("freshResume", () => {
  it("open with a Stripe URL → go there", async () => {
    const url = "https://checkout.stripe.com/c/pay/cs_live_a1";
    expect(await freshResume(answer({ state: "open", url }), Q)).toEqual({ kind: "open", url });
  });

  it("expired, purged or none → dead (the stored URL is dropped, a new payment opens)", async () => {
    for (const state of ["expired", "purged", "none"]) {
      expect(await freshResume(answer({ state }), Q), state).toEqual({ kind: "dead" });
    }
  });

  it("open with a URL that is not Stripe's → dead", async () => {
    expect(await freshResume(answer({ state: "open", url: "https://evil.example/pay" }), Q)).toEqual({ kind: "dead" });
  });

  it("paid meanwhile → its confirmation", async () => {
    expect(await freshResume(answer({ state: "paid", reference: "VT-26-4821" }), Q)).toEqual({
      kind: "paid",
      reference: "VT-26-4821",
    });
    expect(await freshResume(answer({ state: "paid", reference: "../x" }), Q)).toEqual({ kind: "dead" });
  });

  it("a network error or unreadable body → dead, never the old URL", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("network");
    }) as unknown as typeof fetch;
    expect(await freshResume(down, Q)).toEqual({ kind: "dead" });
    const junk = vi.fn(async () => new Response("<html>")) as unknown as typeof fetch;
    expect(await freshResume(junk, Q)).toEqual({ kind: "dead" });
  });

  it("asks for this quote, with the cookie, uncached", async () => {
    const f = answer({ state: "none" });
    await freshResume(f, Q);
    expect(f).toHaveBeenCalledWith(`/api/checkout/resume?quote=${Q}`, { credentials: "same-origin", cache: "no-store" });
  });
});
