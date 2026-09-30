// apps/web/lib/security/origin-host-shape.test.ts
//
// 26.2-u02: a Host value whose "port" is really userinfo must not become a link
// that points at another site.

import { describe, expect, it } from "vitest";
import { trustedSiteOrigin } from "./origin";

describe("trustedSiteOrigin host shape", () => {
  it.each(["localhost:1@evil.example", "vamostaxi.site:443@evil.example", "vamostaxi.site:abc"])(
    "refuses %s",
    (host) => {
      expect(trustedSiteOrigin(host)).toBeNull();
    },
  );

  it.each([
    ["vamostaxi.site", "https://vamostaxi.site"],
    ["dashboard.vamostaxi.site", "https://dashboard.vamostaxi.site"],
    ["localhost:3000", "http://localhost:3000"],
    ["dashboard.localhost:8787", "http://dashboard.localhost:8787"],
  ])("keeps %s", (host, origin) => {
    expect(trustedSiteOrigin(host)).toBe(origin);
  });
});
