// apps/web/lib/health/leak-gate.test.ts
//
// Wave 0 (10-01): already-true leak / Sentry / .eu / db-smoke gate (D-18, D-28).
// Health path is /api/internal/health — not public /health, not under /api/dev.
// Keep /api/dev/db-smoke empty 404. No Sentry this phase. No vamostaxi.eu bind.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { gatePublicRequest } from "../dc-mock-urls";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const webRoot = join(repoRoot, "apps/web");

function readRepo(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

function req(path: string): Request {
  return new Request(`https://vamostaxi.site${path}`, { method: "GET" });
}

describe("db-smoke leak 404 (D-18)", () => {
  it("GET /api/dev/db-smoke is empty 404", async () => {
    const src = readRepo("apps/web/app/api/dev/db-smoke/route.ts");
    expect(src).toMatch(/new Response\(null,\s*\{\s*status:\s*404/);
    expect(src).not.toMatch(/sk_live_/);
    expect(src).not.toMatch(/\bCHF\b/);
    const gated = gatePublicRequest(req("/api/dev/db-smoke"));
    expect(gated).toBeInstanceOf(Response);
    const res = gated as Response;
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  });

  it("gatePublicRequest 404s /api/dev/*", async () => {
    for (const path of ["/api/dev", "/api/dev/health", "/api/dev/anything"]) {
      const gated = gatePublicRequest(req(path));
      expect(gated).toBeInstanceOf(Response);
      expect((gated as Response).status).toBe(404);
      expect(await (gated as Response).text()).toBe("");
    }
  });
});

describe("health is not public and not under /api/dev (D-18)", () => {
  it("has no public /health route; path is /api/internal/health", () => {
    expect(existsSync(join(webRoot, "app/api/health/route.ts"))).toBe(false);
    expect(existsSync(join(webRoot, "app/health/route.ts"))).toBe(false);
    expect(existsSync(join(webRoot, "app/[locale]/health/route.ts"))).toBe(false);
    expect(existsSync(join(webRoot, "app/api/dev/health/route.ts"))).toBe(false);
    const healthPath = "/api/internal/health";
    expect(healthPath.startsWith("/api/dev")).toBe(false);
    expect(healthPath).not.toBe("/health");
  });
});

describe("no vamostaxi.eu bind (D-28)", () => {
  it("wrangler.jsonc custom domains do not include vamostaxi.eu", () => {
    const src = readRepo("apps/web/wrangler.jsonc");
    const domains = [
      ...src.matchAll(/"pattern":\s*"([^"]+)",\s*"custom_domain":\s*true/g),
    ].map((m) => m[1]);
    expect(domains.length).toBeGreaterThan(0);
    for (const domain of domains) {
      expect(domain).not.toMatch(/vamostaxi\.eu/);
    }
  });

  it("CI does not smoke .eu or db:push the live bookings project (K94)", () => {
    const staging = readRepo(".github/workflows/deploy-staging.yml").replace(
      /^\s*#.*$/gm,
      "",
    );
    expect(staging).not.toMatch(/vamostaxi\.eu/);
    expect(staging).not.toMatch(/db:push/);
    expect(staging).toMatch(/curl -sfI https:\/\/vamostaxi\.site/);
    expect(staging).toMatch(/if: false/);
    const production = readRepo(".github/workflows/deploy-production.yml").replace(
      /^\s*#.*$/gm,
      "",
    );
    expect(production).not.toMatch(/staging\.vamostaxi\.eu/);
  });
});

describe("no Sentry this phase (D-02)", () => {
  it("apps/web/package.json has no sentry dependency", () => {
    const pkg = JSON.parse(readRepo("apps/web/package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
    expect(names.every((name) => !name.toLowerCase().includes("sentry"))).toBe(
      true,
    );
  });
});
