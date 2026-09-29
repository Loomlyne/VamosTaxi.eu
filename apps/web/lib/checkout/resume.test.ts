import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { resumeCheckoutWithDeps, type ResumeDeps, type ResumeRow } from "./resume";

const Q = "00000000-0000-4000-8000-000000000001";

function row(over: Partial<ResumeRow> = {}): ResumeRow {
  return {
    booking_id: "b1",
    quote_id: Q,
    reference: "VT-26-0001",
    status: "pending",
    contact_name: "Ada",
    contact_email: "ada@example.test",
    contact_phone: "+41000000001",
    company_name: "",
    company_address: "",
    company_vat: "",
    note: "bell",
    class_slug: "economy",
    extra_codes: ["child_seat"],
    coupon_code: null,
    charged_rappen: 1000,
    pay_link_sent: false,
    latest_session_id: "cs_test_abc",
    checkout_trip_query: "from=ZRH",
    ...over,
  };
}

const open = { status: "open", url: "https://checkout.stripe.test/x", currency: "chf", amount_total: 1000 } as Stripe.Checkout.Session;

function deps(over: Partial<ResumeDeps> = {}): ResumeDeps {
  return {
    hashCookie: async () => "ab".repeat(32),
    readRow: async () => row(),
    retrieveSession: async () => open,
    ...over,
  };
}

describe("resumeCheckoutWithDeps", () => {
  it("no cookie -> none and no lookup", async () => {
    const readRow = vi.fn();
    expect(await resumeCheckoutWithDeps(Q, "", deps({ readRow }))).toEqual({ state: "none" });
    expect(readRow).not.toHaveBeenCalled();
  });

  it("bad quote id or undecodable cookie -> none", async () => {
    expect(await resumeCheckoutWithDeps("nope", "tok", deps())).toEqual({ state: "none" });
    expect(await resumeCheckoutWithDeps(Q, "tok", deps({ hashCookie: async () => "" }))).toEqual({ state: "none" });
  });

  it("open session -> open with url and fields", async () => {
    const a = await resumeCheckoutWithDeps(Q, "tok", deps());
    expect(a).toMatchObject({
      state: "open",
      url: open.url,
      booking_id: "b1",
      quote_id: Q,
      trip_query: "from=ZRH",
      class: "economy",
      extra_codes: ["child_seat"],
      charged_rappen: 1000,
      contact: { name: "Ada" },
    });
  });

  it("expired session, amount drift or lookup failure -> expired without url", async () => {
    const expired = { ...open, status: "expired" } as Stripe.Checkout.Session;
    for (const d of [
      deps({ retrieveSession: async () => expired }),
      deps({ retrieveSession: async () => ({ ...open, amount_total: 999 }) as Stripe.Checkout.Session }),
      deps({ retrieveSession: async () => { throw new Error("stripe down"); } }),
      deps({ readRow: async () => row({ latest_session_id: null }) }),
    ]) {
      const a = await resumeCheckoutWithDeps(Q, "tok", d);
      expect(a.state).toBe("expired");
      expect(a).not.toHaveProperty("url");
      expect(a).toHaveProperty("booking_id", "b1");
    }
  });

  it("no matching booking -> purged with nothing else", async () => {
    expect(await resumeCheckoutWithDeps(Q, "tok", deps({ readRow: async () => null }))).toEqual({ state: "purged" });
  });

  it("confirmed/paid -> paid with the reference only", async () => {
    for (const status of ["paid", "confirmed"]) {
      expect(await resumeCheckoutWithDeps(Q, "tok", deps({ readRow: async () => row({ status }) }))).toEqual({
        state: "paid",
        reference: "VT-26-0001",
      });
    }
  });

  it("cancelled booking has nothing to resume", async () => {
    expect(await resumeCheckoutWithDeps(Q, "tok", deps({ readRow: async () => row({ status: "cancelled" }) }))).toEqual({ state: "purged" });
  });
});
