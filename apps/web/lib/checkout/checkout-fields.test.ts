import { describe, expect, it } from "vitest";
import { e164Phone, isCheckoutEmail } from "./contact-validate";
import { firstPricedLockSlug, mergeVamosTrip, peekLockClassRappen, peekLockClassTotals, peekLockExtras, placeMapboxId, placeText, rappenToFrancs, formatRailDate, geoLocale } from "./vamos-trip";

describe("checkout contact + rail helpers", () => {
  it("stores phone as plus plus digits", () => {
    expect(e164Phone("+971 50 975 8018")).toBe("+971509758018");
    expect(e164Phone("41796267082")).toBe("+41796267082");
    expect(e164Phone("")).toBe("");
  });

  it("refuses email without a dotted domain", () => {
    expect(isCheckoutEmail("koussayzayeni@gmail.com")).toBe(true);
    expect(isCheckoutEmail("name@host")).toBe(false);
    expect(isCheckoutEmail("not-an-email")).toBe(false);
  });

  it("prefers the stored full address on the rail", () => {
    expect(placeText({ text: "Zurich HB", s: "8001 Zürich, Switzerland" }, "Zurich HB")).toBe(
      "Zurich HB, 8001 Zürich, Switzerland",
    );
    expect(placeText({ text: "The Dolder Grand, Zurich" }, "short")).toBe("The Dolder Grand, Zurich");
    expect(placeText(null, "Zurich HB")).toBe("Zurich HB");
  });

  it("does not treat an idle null total as the pay class when the trip has a fare", () => {
    const payload = JSON.stringify({
      class_totals: [
        { slug: "economy", total_rappen: null },
        { slug: "mercedes-benz-v-class", total_rappen: 18500 },
      ],
    });
    const lock = `k1.${Buffer.from(payload).toString("base64url")}.sig`;
    expect(peekLockClassTotals(lock).map((row) => row.slug)).toEqual([
      "economy",
      "mercedes-benz-v-class",
    ]);
    expect(peekLockClassRappen(lock, "economy")).toBeNull();
    expect(firstPricedLockSlug(lock, ["economy"])).toBe("mercedes-benz-v-class");
    expect(firstPricedLockSlug(lock, ["mercedes-s-class-special", "mercedes-benz-v-class"])).toBe(
      "mercedes-benz-v-class",
    );
    expect(firstPricedLockSlug(lock, [])).toBe("mercedes-benz-v-class");
    const closed = `k1.${Buffer.from(JSON.stringify({ class_totals: [{ slug: "economy", total_rappen: null }] })).toString("base64url")}.sig`;
    expect(firstPricedLockSlug(closed, ["economy", "mercedes-benz-v-class"])).toBe("");
  });

  it("peeks lock class totals and never invents a fare", () => {
    const payload = JSON.stringify({
      class_totals: [
        { slug: "economy", total_rappen: 8000 },
        { slug: "van", total_rappen: null },
      ],
    });
    const lock = `k1.${Buffer.from(payload).toString("base64url")}.sig`;
    expect(peekLockClassRappen(lock, "economy")).toBe(8000);
    expect(rappenToFrancs(8000)).toBe(80);
    expect(peekLockClassRappen(lock, "van")).toBeNull();
    expect(peekLockClassRappen(lock, "first")).toBeNull();
    expect(peekLockClassRappen("not-a-lock", "economy")).toBeNull();
    expect(rappenToFrancs(null)).toBeNull();
    const extrasLock = `k1.${Buffer.from(JSON.stringify({ extras: { child_seats: 1 } })).toString("base64url")}.sig`;
    expect(peekLockExtras(extrasLock)?.child_seats).toBe(1);
    expect(peekLockExtras(lock)).toBeNull();
  });

  it("drops the previous quote's flight when a new quote_id lands", () => {
    const prev = mergeVamosTrip(
      { quote_id: "quote-a", flight: "ek 200", flightNumber: "ek 200", pickup: "ZRH" },
      { quote_id: "quote-b", pickup: "ZRH", dropoff: "HB" },
    );
    expect(prev.flight).toBe("");
    expect(prev.flightNumber).toBe("");
    expect(prev.quote_id).toBe("quote-b");
    const typed = mergeVamosTrip(
      { quote_id: "quote-a", flightNumber: "ek 200" },
      { quote_id: "quote-b", flight: "LX 318", flightNumber: "LX 318" },
    );
    expect(typed.flightNumber).toBe("LX 318");
    const same = mergeVamosTrip(
      { quote_id: "quote-a", flightNumber: "ek 200" },
      { quote_id: "quote-a", pickup: "ZRH" },
    );
    expect(same.flightNumber).toBe("ek 200");
  });

  it("does not carry child seat onto a new quote", () => {
    const next = mergeVamosTrip(
      { quote_id: "quote-a", childSeat: true, oversizedLuggage: true, skiRack: true, stops: 1 },
      { quote_id: "quote-b", pickup: "ZRH" },
    );
    expect(next.childSeat).toBe(false);
    expect(next.oversizedLuggage).toBe(false);
    expect(next.skiRack).toBe(false);
    expect(next.stops).toBe(0);
  });

  it("drops leftover contact when a new home quote lands", () => {
    const next = mergeVamosTrip(
      {
        quote_id: "quote-a",
        detailsComplete: true,
        contact: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", mobile: "+41796267082" },
        guest: true,
        airline: "LX",
        notes: "old",
      },
      { quote_id: "quote-b", pickup: "ZRH" },
    );
    expect(next.contact).toBeUndefined();
    expect(next.detailsComplete).toBe(false);
    expect(next.guest).toBeUndefined();
    expect(next.airline).toBe("");
    expect(next.notes).toBe("");
  });

  it("keeps extras when a checkout reprice remints quote_id", () => {
    const next = mergeVamosTrip(
      { quote_id: "quote-a", childSeat: true, oversizedLuggage: false, skiRack: false, stops: 0 },
      { quote_id: "quote-b", lock: "k1.abc.sig", childSeat: true, oversizedLuggage: false, skiRack: false, stops: 0 },
    );
    expect(next.childSeat).toBe(true);
    expect(next.quote_id).toBe("quote-b");
  });

  it("reads mapbox ids and formats rail dates", () => {
    expect(placeMapboxId({ mapbox_id: "dpa.abc" })).toBe("dpa.abc");
    expect(placeMapboxId(null)).toBe("");
    expect(geoLocale("de")).toBe("de");
    expect(geoLocale("xx")).toBe("en");
    expect(formatRailDate("2026-09-23", "en")).toMatch(/23/);
  });
});
