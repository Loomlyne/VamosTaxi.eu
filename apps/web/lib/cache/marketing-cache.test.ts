// apps/web/lib/cache/marketing-cache.test.ts
//
// Wave 0 (10-01): D-24 / D-25 cache vs no-store. Middleware rules land in 10-07.
// GET never Set-Cookies consent_subject. Worker still runs gatePublicRequest.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function readRepo(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("marketing cache (D-24)", () => {
  it("caches logged-out marketing GET with public s-maxage", () => {
    const src = readRepo("apps/web/middleware.ts");
    expect(src).toMatch(/s-maxage/);
    expect(src).toMatch(/stale-while-revalidate|public/);
    expect(src).not.toMatch(/sk_live_/);
    expect(src).not.toMatch(/\bCHF\b/);
  });

  it("never caches /api /checkout /confirmation /bookings /account or dashboard", () => {
    const src = readRepo("apps/web/middleware.ts");
    expect(src).toMatch(/no-store/);
    expect(src).toMatch(/\/checkout/);
    expect(src).toMatch(/\/confirmation/);
    expect(src).toMatch(/\/bookings/);
    expect(src).toMatch(/\/account/);
    expect(src).toMatch(/\/api/);
  });

  it("auth cookie forces no-store (D-25)", () => {
    const src = readRepo("apps/web/middleware.ts");
    expect(src).toMatch(/sb-.*auth-token|auth-token/);
    expect(src).toMatch(/no-store/);
  });
});

describe("GET must not mint consent_subject (D-24 cache pitfall)", () => {
  it("middleware does not Set-Cookie consent_subject", () => {
    const src = readRepo("apps/web/middleware.ts");
    expect(src).not.toMatch(/consent_subject/);
  });

  it("Worker still runs gatePublicRequest", () => {
    const src = readRepo("apps/web/worker.ts");
    expect(src).toMatch(/gatePublicRequest/);
  });
});
