import { describe, expect, it } from "vitest";
import { createBooking } from "./create-booking";

// G8: the pay_link-mode recorder tests that lived here (bad HMAC, quote_expired,
// 23P01, 23505 and the session.expire calls) moved to the web runner's
// "shared gates" block in intent.test.ts.
describe("createBooking module", () => {
  it("is the named checkout write helper", () => {
    expect(typeof createBooking).toBe("function");
  });
});
