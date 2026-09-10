import { describe, expect, it } from "vitest";
import { formatFlightInput, normaliseFlightNumber } from "../flight/format";

describe("flight input format", () => {
  it("matches the home flight input", () => {
    expect(normaliseFlightNumber("ek 900")).toBe("EK900");
    expect(formatFlightInput("ek900")).toBe("EK 900");
    expect(formatFlightInput("EK 87")).toBe("EK 87");
  });
});
