import { describe, expect, it } from "vitest";
import {
  buildIntentBody,
  checkoutReturnPath,
  isStripeCheckoutUrl,
  readReturnStash,
  RETURN_STORAGE_KEY,
  sameSelectionAsResumed,
  signInHref,
  writeReturnStash,
  type CurrentSelection,
  type ResumedBooking,
} from "./pay-flow";
import { parseTripQuery, type Trip } from "./trip-url";

const GS = "11111111-1111-4111-8111-111111111111";
const QS = `from=Zurich%20Airport&fid=A&to=Bahnhofstrasse%201&tid=B&gs=${GS}&when=2026-12-15T08:15&pax=2&bags=3&flight=LX318`;
const parse = (q: string): Trip => parseTripQuery(new URLSearchParams(q)).trip;
const trip = parse(QS);

const contact = { firstName: "Amira", lastName: "Keller", email: "amira@example.com", mobile: "+41796267082" };
const company = { name: "", address: "", vat: "" };

describe("buildIntentBody", () => {
  const body = buildIntentBody({
    quoteId: "22222222-2222-4222-8222-222222222222",
    lock: "lock",
    trip,
    vehicleClass: "business",
    extraCodes: ["child-seat", "pet-crate"],
    coupon: null,
    contact,
    company,
    note: " Gate 3 ",
    supersedes: null,
    locale: "de",
    currency: "CHF",
    idempotencyKey: "k1",
  });

  it("carries selections and no amount (T-26.3-19-01)", () => {
    const text = JSON.stringify(body);
    for (const key of ["amount", "total", "rappen", "lines", "net_", "charged", "vat_rappen"]) {
      expect(text).not.toContain(key);
    }
    expect(body.extra_codes).toEqual(["child-seat", "pet-crate"]);
    expect(body.vehicle_class).toBe("business");
    expect(body.contact).toEqual({ name: "Amira Keller", email: "amira@example.com", phone: "+41796267082" });
    expect(body.driver_note).toBe("Gate 3");
    expect(body).not.toHaveProperty("supersedes");
  });

  it("puts the URL trip and the flight in the body, no contact in the trip", () => {
    expect(body.trip).toMatchObject({ from: "Zurich Airport", when: "2026-12-15T08:15", pax: 2, bags: 3, flight: "LX318" });
    expect(body.flight_no).toBe("LX318");
    expect(JSON.stringify(body.trip)).not.toContain("amira");
  });

  it("adds supersedes only when set", () => {
    const b = buildIntentBody({
      quoteId: "q", lock: "l", trip, vehicleClass: "economy", extraCodes: [], coupon: "SPRING", contact, company,
      note: "", supersedes: "33333333-3333-4333-8333-333333333333", locale: "en", currency: "CHF", idempotencyKey: "k",
    });
    expect(b.supersedes).toBe("33333333-3333-4333-8333-333333333333");
    expect(b.coupon).toBe("SPRING");
  });
});

describe("isStripeCheckoutUrl", () => {
  it("accepts only https://checkout.stripe.com", () => {
    expect(isStripeCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test_1")).toBe(true);
    expect(isStripeCheckoutUrl("https://checkout.stripe.com.evil.com/x")).toBe(false);
    expect(isStripeCheckoutUrl("http://checkout.stripe.com/x")).toBe(false);
    expect(isStripeCheckoutUrl("https://evil.com/https://checkout.stripe.com")).toBe(false);
    expect(isStripeCheckoutUrl("javascript:alert(1)")).toBe(false);
    expect(isStripeCheckoutUrl("//checkout.stripe.com/x")).toBe(false);
    expect(isStripeCheckoutUrl(null)).toBe(false);
  });
});

describe("returnTo", () => {
  it("carries trip, class and extras, never contact data", () => {
    const path = checkoutReturnPath("/checkout", trip, "business", ["child-seat", "pet-crate"]);
    expect(path.startsWith("/checkout?")).toBe(true);
    const params = new URLSearchParams(path.split("?")[1]);
    expect(params.get("class")).toBe("business");
    expect(params.get("extras")).toBe("child-seat,pet-crate");
    expect(params.get("when")).toBe("2026-12-15T08:15");
    expect(path).not.toMatch(/email|phone|name=|resume|pay=/);
    expect(signInHref(path)).toBe(`/sign-in?returnTo=${encodeURIComponent(path)}`);
  });
});

describe("sameSelectionAsResumed", () => {
  const resumed: ResumedBooking = {
    trip_query: QS,
    contact: { name: "Amira Keller", email: "amira@example.com", phone: "+41796267082" },
    company: { name: "", address: "", vat: "" },
    note: "",
    class: "business",
    extra_codes: ["child-seat"],
    coupon: null,
  };
  const current: CurrentSelection = {
    trip,
    vehicleClass: "business",
    extraCodes: ["child-seat"],
    coupon: null,
    contact,
    company,
    note: "",
  };

  it("is true when nothing changed", () => {
    expect(sameSelectionAsResumed(resumed, current, parse)).toBe(true);
  });

  it("is false for a different class, extra, voucher, contact, company, note or trip", () => {
    expect(sameSelectionAsResumed(resumed, { ...current, vehicleClass: "economy" }, parse)).toBe(false);
    expect(sameSelectionAsResumed(resumed, { ...current, extraCodes: [] }, parse)).toBe(false);
    expect(sameSelectionAsResumed(resumed, { ...current, coupon: "SPRING" }, parse)).toBe(false);
    expect(sameSelectionAsResumed(resumed, { ...current, contact: { ...contact, lastName: "Meier" } }, parse)).toBe(false);
    expect(sameSelectionAsResumed(resumed, { ...current, company: { ...company, name: "Vamos AG" } }, parse)).toBe(false);
    expect(sameSelectionAsResumed(resumed, { ...current, note: "Gate 3" }, parse)).toBe(false);
    expect(sameSelectionAsResumed(resumed, { ...current, trip: { ...trip, pax: 3 } }, parse)).toBe(false);
  });

  it("ignores extra order and voucher case", () => {
    const r = { ...resumed, extra_codes: ["b", "a"], coupon: "Spring" };
    expect(sameSelectionAsResumed(r, { ...current, extraCodes: ["a", "b"], coupon: "SPRING" }, parse)).toBe(true);
  });
});

describe("return stash", () => {
  const store = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      raw: m,
    };
  };

  it("is read once and removed, and holds no contact data", () => {
    const s = store();
    writeReturnStash(s, { voucher: "SPRING", company: { name: "Vamos AG", address: "Bahnhofstrasse 1", vat: "CHE-1" }, note: "Gate 3" });
    expect(s.raw.get(RETURN_STORAGE_KEY)).not.toMatch(/email|phone|@/);
    const first = readReturnStash(s);
    expect(first).toEqual({ voucher: "SPRING", company: { name: "Vamos AG", address: "Bahnhofstrasse 1", vat: "CHE-1" }, note: "Gate 3" });
    expect(readReturnStash(s)).toBeNull();
  });

  it("survives garbage", () => {
    const s = store();
    s.setItem(RETURN_STORAGE_KEY, "{not json");
    expect(readReturnStash(s)).toBeNull();
  });
});
