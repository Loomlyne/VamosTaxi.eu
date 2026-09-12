// apps/web/lib/health/header.test.ts
//
// Wave 0 (10-01): D-18 secret-header 404. Header helper + route land in 10-08.
// Missing/wrong X-Vamos-Health-Key is empty 404, never 401 JSON.
// Compare via equal-length digest + timingSafeEqual, not string ===.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function readRepo(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("health header compare (D-18)", () => {
  it("hashes both sides to equal length then timingSafeEqual — not string ===", () => {
    const src = readRepo("apps/web/lib/health/header.ts");
    expect(src).toMatch(/X-Vamos-Health-Key/);
    expect(src).toMatch(/timingSafeEqual/);
    expect(src).toMatch(/digest|sha-256|SHA-256|sha256/i);
    expect(src).not.toMatch(/presented\s*===\s*|header\s*===\s*secret|secret\s*===\s*/);
    expect(src).not.toMatch(/sk_live_/);
    expect(src).not.toMatch(/\bCHF\b/);
  });
});

describe("GET /api/internal/health unauthorized (D-18)", () => {
  it("missing or wrong header is empty 404, never 401 JSON", () => {
    const src = readRepo("apps/web/app/api/internal/health/route.ts");
    expect(src).toMatch(/X-Vamos-Health-Key/);
    expect(src).toMatch(/\/api\/internal\/health/);
    expect(src).toMatch(/new Response\(null,\s*\{\s*status:\s*404/);
    expect(src).not.toMatch(/401/);
    expect(src).not.toMatch(/status:\s*401/);
    expect(src).not.toMatch(/\/api\/dev/);
    expect(src).not.toMatch(/sk_live_/);
  });
});
