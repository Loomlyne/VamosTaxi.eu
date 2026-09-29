// D-05 / D-13 / D-24: the trip travels in the URL — home hand-off, checkout,
// the Stripe cancel_url and resume all read and write this one contract.

import { describe, expect, it } from "vitest";
import { buildTripQuery, parseTripQuery } from "./trip-url";

const GS = "3f0c2a4e-8b1d-4c6f-9a2e-5d7b1c0e9f11";
const RESUME = "00000000-0000-4000-8000-000000000001";

function full(): Record<string, string> {
  return {
    from: "Zurich Airport",
    fid: "dXJuOm1ieHBvaToxMjM",
    to: "Bahnhofstrasse 1, Zurich",
    tid: "dXJuOm1ieGFkcjo0NTY",
    gs: GS,
    when: "2026-10-01T08:00",
    pax: "2",
    bags: "3",
    flight: "lx 318",
  };
}

describe("parseTripQuery", () => {
  it("reads a full trip and normalises the flight number", () => {
    const { trip, errors } = parseTripQuery(new URLSearchParams(full()));
    expect(errors).toEqual([]);
    expect(trip).toMatchObject({
      from: "Zurich Airport",
      fid: "dXJuOm1ieHBvaToxMjM",
      to: "Bahnhofstrasse 1, Zurich",
      tid: "dXJuOm1ieGFkcjo0NTY",
      gs: GS,
      when: "2026-10-01T08:00",
      pax: 2,
      bags: 3,
      flight: "LX318",
      flightDisplay: "LX 318",
      class: null,
      extras: [],
      resume: null,
      pay: null,
    });
    expect(parseTripQuery({ ...full(), flight: "EZY1234" }).trip.flightDisplay).toBe("EZY 1234");
    expect(parseTripQuery({ ...full(), flight: "U21234" }).trip.flightDisplay).toBe("U2 1234");
  });

  it("lists missing fields in form order", () => {
    const { errors } = parseTripQuery({ pax: "2" });
    expect(errors.map((error) => error.field)).toEqual(["from", "to", "when"]);
    expect(errors.every((error) => error.reason === "required")).toBe(true);
    const bad = parseTripQuery({ flight: "not a flight", when: "soon", pax: "0" });
    expect(bad.errors.map((error) => error.field)).toEqual([
      "from",
      "flight",
      "to",
      "when",
      "travellers",
    ]);
  });

  it("rejects out-of-range and malformed fields without throwing", () => {
    expect(parseTripQuery({ ...full(), pax: "0" }).trip.pax).toBeNull();
    expect(parseTripQuery({ ...full(), pax: "9" }).trip.pax).toBeNull();
    expect(parseTripQuery({ ...full(), pax: "2.5" }).trip.pax).toBeNull();
    expect(parseTripQuery({ ...full(), bags: "17" }).trip.bags).toBeNull();
    expect(parseTripQuery({ ...full(), bags: "17" }).errors.map((e) => e.field)).toEqual([
      "travellers",
    ]);
    expect(parseTripQuery({ ...full(), when: "2026-02-30T08:00" }).trip.when).toBeNull();
    expect(parseTripQuery({ ...full(), when: "2026-10-01 08:00" }).trip.when).toBeNull();
    expect(parseTripQuery({ ...full(), from: "x".repeat(201) }).trip.from).toBeNull();
    expect(parseTripQuery({ ...full(), fid: "x".repeat(201) }).trip.fid).toBeNull();
    expect(parseTripQuery({ ...full(), gs: "not-a-uuid" }).trip.gs).toBeNull();
    expect(parseTripQuery({ ...full(), resume: "nope" }).trip.resume).toBeNull();
    expect(parseTripQuery({ ...full(), resume: RESUME }).trip.resume).toBe(RESUME);
  });

  it("missing bags means none; missing pax is required", () => {
    const { bags: _bags, ...noBags } = full();
    expect(parseTripQuery(noBags).trip.bags).toBe(0);
    const { pax: _pax, ...noPax } = full();
    expect(parseTripQuery(noPax).errors).toEqual([{ field: "travellers", reason: "required" }]);
  });

  it("parses class and extras; drops bad codes, dedupes, caps at 20", () => {
    const { trip } = parseTripQuery({
      ...full(),
      class: "business",
      extras: "child-seat,child-seat,Bad Code,anything-owner-typed,,x".concat(
        ",".concat(Array.from({ length: 30 }, (_, i) => `e${i}`).join(",")),
      ),
    });
    expect(trip.class).toBe("business");
    expect(trip.extras.slice(0, 3)).toEqual(["child-seat", "anything-owner-typed", "x"]);
    expect(trip.extras).toHaveLength(20);
    expect(parseTripQuery({ ...full(), class: "<script>" }).trip.class).toBeNull();
  });

  it("keeps a flight on a non-airport pickup; the server decides airport", () => {
    const { trip, errors } = parseTripQuery({ ...full(), from: "Bahnhofstrasse 1, Zurich" });
    expect(errors).toEqual([]);
    expect(trip.flight).toBe("LX318");
  });
});

describe("buildTripQuery", () => {
  it("round-trips fid, tid and gs and the rest of the trip", () => {
    const first = parseTripQuery({ ...full(), class: "economy", extras: "child-seat" }).trip;
    const query = buildTripQuery(first);
    const again = parseTripQuery(new URLSearchParams(query)).trip;
    expect(again).toEqual(first);
    const params = new URLSearchParams(query);
    expect(params.get("fid")).toBe("dXJuOm1ieHBvaToxMjM");
    expect(params.get("tid")).toBe("dXJuOm1ieGFkcjo0NTY");
    expect(params.get("gs")).toBe(GS);
    expect(params.get("flight")).toBe("LX318");
  });

  it("never carries contact keys; resume and pay only when asked", () => {
    const trip = parseTripQuery({
      ...full(),
      name: "Someone",
      email: "a@b.c",
      phone: "+41000",
      resume: RESUME,
      pay: "unpaid",
    }).trip;
    const plain = new URLSearchParams(buildTripQuery(trip));
    for (const key of ["name", "email", "phone", "resume", "pay"]) {
      expect(plain.has(key)).toBe(false);
    }
    const withResume = new URLSearchParams(buildTripQuery(trip, { resume: true, pay: true }));
    expect(withResume.get("resume")).toBe(RESUME);
    expect(withResume.get("pay")).toBe("unpaid");
    expect(withResume.has("email")).toBe(false);
  });

  it("omits empty fields", () => {
    const { trip } = parseTripQuery({ from: "A place" });
    expect(buildTripQuery(trip)).toBe("from=A+place&bags=0");
  });
});
