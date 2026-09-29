import { describe, expect, it } from "vitest";
import { gatePublicRequest } from "../dc-mock-urls";

function doc(path: string, host = "vamostaxi.site"): Request {
  return new Request(`https://${host}${path}`, { headers: { "sec-fetch-dest": "document" } });
}

describe("D-41: the new checkout routes never open as a document", () => {
  it.each(["/api/checkout/price", "/api/checkout/resume?quote=x", "/api/checkout/me"])(
    "%s answers not-found to a document navigation",
    (path) => {
      expect(gatePublicRequest(doc(path))).toBe("not-found");
    },
  );

  it("fetch requests still pass", () => {
    for (const path of ["/api/checkout/price", "/api/checkout/resume", "/api/checkout/me"]) {
      expect(gatePublicRequest(new Request(`https://vamostaxi.site${path}`))).toBeNull();
    }
  });

  it("the two allowed document routes stay allowed", () => {
    expect(gatePublicRequest(doc("/api/checkout/return"))).toBeNull();
    expect(gatePublicRequest(doc("/api/auth/callback?code=abc", "dashboard.vamostaxi.site"))).toBeNull();
  });
});
