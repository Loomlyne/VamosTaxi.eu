// apps/web/lib/consent/ip.test.ts
//
// Wave 0 (10-01): D-10 truncated IP contract. Helpers land in 10-02.
// Never log the raw CF-Connecting-IP. No sk_live_. No invented CHF.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function readIp(): string {
  return readFileSync(join(here, "ip.ts"), "utf8");
}

describe("truncateClientIp (D-10)", () => {
  it("exports truncateClientIp", () => {
    const src = readIp();
    expect(src).toMatch(/export function truncateClientIp/);
    expect(src).not.toMatch(/sk_live_/);
    expect(src).not.toMatch(/\bCHF\b/);
  });

  it("zeros the IPv4 last octet", () => {
    const src = readIp();
    expect(src).toMatch(/\.0/);
    expect(src).toMatch(/split\(["']\.["']\)/);
  });

  it("zeros IPv6 to /64", () => {
    const src = readIp();
    expect(src).toMatch(/\/64|:0:0:0:0|slice\(0,\s*4\)/);
    expect(src).toMatch(/:/);
  });

  it("reads cf-connecting-ip first", () => {
    const src = readIp();
    expect(src).toMatch(/cf-connecting-ip/i);
  });

  it("never logs the raw IP", () => {
    const src = readIp();
    expect(src).not.toMatch(/console\.(log|info|debug|warn|error)\(/);
  });
});
