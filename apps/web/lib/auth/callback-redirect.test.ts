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

describe("auth reset origin", () => {
  it("JSON auth pins request URL host, not Host header", () => {
    const file = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../app/api/auth/route.ts"),
      "utf8",
    );
    expect(file).toContain("trustedSiteOrigin(new URL(request.url).host)");
    expect(file).not.toContain('request.headers.get("host")');
  });

  it("Server Actions pin Origin header, not Host", () => {
    const file = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../auth/actions.ts"),
      "utf8",
    );
    expect(file).toContain('h.get("origin")');
    expect(file).not.toContain('h.get("host")');
  });
});

describe("health cache", () => {
  it("404 and 200 send private no-store", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../app/api/internal/health/route.ts"),
      "utf8",
    );
    expect(src).toContain('cache-control": "private, no-store"');
    expect(src).toContain("Response.json(body, { headers: HEALTH_HEADERS })");
  });
});
