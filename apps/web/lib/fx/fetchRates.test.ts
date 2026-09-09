import { describe, expect, it } from "vitest";
import { parseErApi, parseFawaz } from "./fetchRates";

describe("FX upstream parse", () => {
  it("reads EUR/USD/AED from open.er-api.com", () => {
    const parsed = parseErApi({
      result: "success",
      time_last_update_utc: "Sun, 06 Sep 2026 00:02:31 +0000",
      rates: { EUR: 1.063086, USD: 1.234718, AED: 4.534498 },
    });
    expect(parsed?.rates.USD).toBe(1.234718);
    expect(parsed?.rates.AED).toBe(4.534498);
    expect(parsed?.source).toBe("open.er-api.com");
  });

  it("rejects a payload missing AED", () => {
    expect(
      parseErApi({
        result: "success",
        rates: { EUR: 1, USD: 1 },
      }),
    ).toBeNull();
  });

  it("reads lowercase fawaz chf map", () => {
    const parsed = parseFawaz({
      date: "2026-09-06",
      chf: { eur: 1.06, usd: 1.23, aed: 4.53 },
    });
    expect(parsed?.rates.AED).toBe(4.53);
    expect(parsed?.source).toBe("fawazahmed0/currency-api");
  });
});
