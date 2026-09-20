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

describe("geo GET cache", () => {
  it("suggest/retrieve/reverse success JSON is private no-store", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
    for (const rel of [
      "app/api/geo/suggest/route.ts",
      "app/api/geo/retrieve/route.ts",
      "app/api/geo/reverse/route.ts",
    ]) {
      const file = readFileSync(join(root, rel), "utf8");
      expect(file, rel).toContain('Cache-Control": "private, no-store"');
      expect(file, rel).toContain("{ headers: GEO_JSON }");
    }
  });
});

describe("staff invite origin", () => {
  it("Server Action pins Origin header, not Host", () => {
    const file = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../app/[locale]/(ops)/ops/staff/actions.ts"),
      "utf8",
    );
    expect(file).toContain('headerList.get("origin")');
    expect(file).not.toContain('headerList.get("host")');
  });
});

describe("pay-link open cache", () => {
  it("client_secret JSON sends private no-store", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../app/api/checkout/pay-link/open/route.ts"),
      "utf8",
    );
    expect(src).toContain('cache-control": "private, no-store"');
    expect(src.match(/headers: PAY_JSON/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe("account bookings POST cache", () => {
  it("POST 401/404/success send private no-store", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../app/api/account/bookings/route.ts"),
      "utf8",
    );
    expect(src).toContain('Cache-Control": "private, no-store"');
    expect(src).toContain("status: 401, headers: noStore");
    expect(src).toContain("status: 404, headers: noStore");
  });
});

describe("review/photo/invite JSON cache", () => {
  it("review photo/submit, staff photos, invite, pay-link send private no-store", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
    const files = [
      "app/api/reviews/photo/route.ts",
      "app/api/reviews/submit/route.ts",
      "app/[locale]/(ops)/api/photos/upload/route.ts",
      "app/[locale]/(ops)/api/staff/invite/route.ts",
      "app/api/checkout/pay-link/route.ts",
    ];
    for (const rel of files) {
      const file = readFileSync(join(root, rel), "utf8");
      expect(file, rel).toMatch(/cache-control\": \"private, no-store\"/i);
    }
  });
});

describe("flight/contact/reviews/publish cache", () => {
  it("flight success JSON uses FLIGHT_JSON private no-store", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../app/api/flight/[no]/route.ts"),
      "utf8",
    );
    expect(src).toContain('Cache-Control": "private, no-store"');
    expect(src.match(/headers: FLIGHT_JSON/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("contact formFailure/formSuccess send private no-store", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../forms/notify.ts"),
      "utf8",
    );
    expect(src).toContain('cache-control": "private, no-store"');
    expect(src).toContain("{ status, headers: NO_STORE }");
    expect(src).toContain("{ headers: NO_STORE }");
  });

  it("public reviews GET JSON is private no-store", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../app/api/reviews/route.ts"),
      "utf8",
    );
    expect(src).toContain('cache-control": "private, no-store"');
    expect(src).toContain("headers: noStore");
  });

  it("staff publish jsonFail uses jsonErr (staff no-store)", () => {
    const src = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts",
      ),
      "utf8",
    );
    expect(src).toContain("return jsonErr(code, status, { gaps })");
    expect(src).not.toMatch(/Response\.json\(\{ ok: false, code, gaps \}/);
  });
});
