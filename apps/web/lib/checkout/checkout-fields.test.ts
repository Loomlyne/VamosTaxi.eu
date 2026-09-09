import { describe, expect, it } from "vitest";
import { e164Phone, isCheckoutEmail } from "./contact-validate";
import { mergeVamosTrip, peekLockClassRappen, placeMapboxId, placeText, rappenToFrancs, formatRailDate, geoLocale } from "./vamos-trip";

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

  it("reads mapbox ids and formats rail dates", () => {
    expect(placeMapboxId({ mapbox_id: "dpa.abc" })).toBe("dpa.abc");
    expect(placeMapboxId(null)).toBe("");
    expect(geoLocale("de")).toBe("de");
    expect(geoLocale("xx")).toBe("en");
    expect(formatRailDate("2026-09-23", "en")).toMatch(/23/);
  });
});
