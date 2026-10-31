import { describe, expect, it } from "vitest";
import { airportByName, validateEditor } from "./trip-editor-rules";

const base = {
  from: "Bahnhofstrasse 1",
  fromId: "a",
  to: "Zurich Airport",
  toId: "b",
  when: "2030-01-01T10:00",
  pax: 1,
  bags: 0,
};

describe("validateEditor flight rule (D-09)", () => {
  it("airport pickup without a flight is allowed", () => {
    expect(validateEditor({ ...base, airport: true, flight: "" }).flight).toBeUndefined();
  });
  it("airport pickup with a bad flight is invalid", () => {
    expect(validateEditor({ ...base, airport: true, flight: "??" }).flight).toBe("invalid");
  });
  it("other pickup without a flight has no flight error", () => {
    expect(validateEditor({ ...base, airport: false, flight: "" }).flight).toBeUndefined();
  });
  it("other pickup with a good flight has no flight error", () => {
    expect(validateEditor({ ...base, airport: false, flight: "LX318" }).flight).toBeUndefined();
  });
  it("other pickup with a bad flight is invalid", () => {
    expect(validateEditor({ ...base, airport: false, flight: "??" }).flight).toBe("invalid");
  });
});

describe("validateEditor chosen places", () => {
  const trip = { ...base, airport: false, flight: "" };
  it("typed words without a chosen place must be chosen from the list", () => {
    expect(validateEditor({ ...trip, fromId: null }).from).toBe("choose");
    expect(validateEditor({ ...trip, toId: null }).to).toBe("choose");
  });
  it("an empty field stays required, and two chosen places pass", () => {
    expect(validateEditor({ ...trip, from: " ", fromId: null }).from).toBe("required");
    expect(validateEditor({ ...trip, to: "", toId: null }).to).toBe("required");
    expect(validateEditor(trip)).toEqual({});
  });
  it("the same place twice is still the same place", () => {
    expect(validateEditor({ ...trip, toId: "a" }).to).toBe("same");
  });
});

describe("airportByName", () => {
  it("reads airport names", () => {
    expect(airportByName("Zurich Airport (ZRH)")).toBe(true);
    expect(airportByName("Flughafen Zürich")).toBe(true);
    expect(airportByName("Bahnhofstrasse 1")).toBe(false);
  });
});
