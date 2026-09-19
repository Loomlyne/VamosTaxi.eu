import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../app/api/auth/callback/route.ts"),
  "utf8",
);

describe("callback redirect origin", () => {
  it("pins Location to trustedSiteOrigin, not request url.origin", () => {
    expect(src).toContain("trustedSiteOrigin(url.host)");
    expect(src).not.toContain("const origin = url.origin");
  });

  it("rejects protocol-relative next and unknown routes", () => {
    expect(src).toContain('raw.startsWith("//")');
    expect(src).toContain("PUBLIC_ROUTES");
  });
});

describe("checkout public origin", () => {
  it("Stripe and pay-link URLs use publicSiteOrigin", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
    for (const rel of [
      "app/api/checkout/intent/route.ts",
      "app/api/checkout/pay-link/route.ts",
      "app/api/checkout/pay-link/open/route.ts",
    ]) {
      const file = readFileSync(join(root, rel), "utf8");
      expect(file).toContain("publicSiteOrigin(new URL(request.url).host)");
      expect(file).not.toContain("new URL(request.url).origin");
    }
  });

  it("checkout writes Origin-CSRF before parse", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
    for (const rel of [
      "app/api/checkout/intent/route.ts",
      "app/api/checkout/pay-link/route.ts",
      "app/api/checkout/pay-link/open/route.ts",
    ]) {
      const file = readFileSync(join(root, rel), "utf8");
      const csrfAt = file.indexOf("csrfForbidden(request)");
      const jsonAt = file.indexOf("request.json()");
      expect(csrfAt, rel).toBeGreaterThan(-1);
      expect(jsonAt, rel).toBeGreaterThan(csrfAt);
    }
  });
});

describe("quote writes", () => {
  it("Origin-CSRF before parse; dashboardHost from request URL host", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
    for (const rel of ["app/api/quote/route.ts", "app/api/quote/reprice/route.ts"]) {
      const file = readFileSync(join(root, rel), "utf8");
      const csrfAt = file.indexOf('csrfForbidden(request, "auth")');
      const jsonAt = file.indexOf("request.json()");
      expect(csrfAt, rel).toBeGreaterThan(-1);
      expect(jsonAt, rel).toBeGreaterThan(csrfAt);
      expect(file).toContain("isNamedDashboardHost(new URL(request.url).host)");
      expect(file).not.toContain('request.headers.get("host")');
    }
  });
});

describe("checkout extras cache", () => {
  it("success and catch both send no-store", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../app/api/checkout/extras/route.ts"),
      "utf8",
    );
    expect(src.match(/Cache-Control\": \"no-store\"/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
