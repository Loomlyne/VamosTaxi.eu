// apps/web/lib/health/probe.test.ts
//
// Wave 0 (10-01): D-21 / D-22 authorized health body. Probes land in 10-08.
// Do not call live Stripe or Mapbox. No sk_live_. No invented CHF. Never :6543.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function readProbe(): string {
  return readFileSync(join(here, "probe.ts"), "utf8");
}

describe("probeHealth body (D-21)", () => {
  it("returns only { ok, db, payments, maps } booleans", () => {
    const src = readProbe();
    expect(src).toMatch(/export async function probeHealth/);
    expect(src).toMatch(/\bok\b/);
    expect(src).toMatch(/\bdb\b/);
    expect(src).toMatch(/\bpayments\b/);
    expect(src).toMatch(/\bmaps\b/);
    expect(src).not.toMatch(/connectionString|DATABASE_URL|postgres:\/\//i);
    expect(src).not.toMatch(/cus_|pi_|ch_|sk_live_/);
    expect(src).not.toMatch(/:6543/);
    expect(src).not.toMatch(/\bCHF\b/);
  });
});

describe("probeHealth dependencies (D-22)", () => {
  it("pings Hyperdrive SELECT 1, Stripe balance.retrieve (no charge), Mapbox token metadata", () => {
    const src = readProbe();
    expect(src).toMatch(/select 1/i);
    expect(src).toMatch(/balance\.retrieve/);
    expect(src).toMatch(/api\.mapbox\.com\/tokens\/v2/);
    expect(src).not.toMatch(/charges\.create|paymentIntents\.create/);
    expect(src).not.toMatch(/geocoding|\/directions\/|\/mapbox\.places/);
    expect(src).not.toMatch(/sk_live_/);
  });
});
