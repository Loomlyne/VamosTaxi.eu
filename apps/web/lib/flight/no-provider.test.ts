// apps/web/lib/flight/no-provider.test.ts
//
// Owner, 2026-10-05: "we just need flight number not tracking". The flight provider (AeroDataBox,
// /api/flight, FLIGHT_API_KEY, its rate counter, the lookup card) is gone. The flight number field,
// its shape check and its saving stay. This pins both halves so a lookup cannot creep back in.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../../../..");
const SELF = resolve(__dirname, "no-provider.test.ts");

const SCAN_ROOTS = ["app", "apps/web", "packages/emails/src", "scripts"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".open-next", ".wrangler", ".turbo", "public", "dist", "coverage"]);
const SCAN_EXT = /\.(ts|tsx|js|mjs|cjs|json|jsonc|html|css)$/;

/** Names that only the provider used. Case-insensitive. */
const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  ["the provider name", /aerodatabox/i],
  ["the lookup route", /\/api\/flight(?![\w-])/],
  ["the provider key", /FLIGHT_API_KEY/],
  ["the provider rate counter", /FLIGHT_RATE_LIMITER/],
  ["the lookup client", /lookupFlight|FLIGHT_API\b/],
];

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (SCAN_EXT.test(name)) yield full;
  }
}

describe("no flight provider", () => {
  it("the provider client, its fixtures and the lookup route are gone", () => {
    for (const rel of [
      "apps/web/lib/flight/aerodatabox.ts",
      "apps/web/lib/flight/aerodatabox.test.ts",
      "apps/web/lib/flight/fixtures.ts",
      "apps/web/app/api/flight",
    ]) {
      expect(existsSync(join(REPO, rel)), rel).toBe(false);
    }
  });

  it("the flight number shape check stays", () => {
    expect(existsSync(join(REPO, "apps/web/lib/flight/format.ts"))).toBe(true);
  });

  it("no source, mock, config or script names the provider, its route, key or counter", () => {
    const hits: string[] = [];
    for (const root of SCAN_ROOTS) {
      const dir = join(REPO, root);
      if (!existsSync(dir)) continue;
      for (const file of walk(dir)) {
        if (file === SELF) continue;
        const text = readFileSync(file, "utf8");
        for (const [what, re] of FORBIDDEN) {
          if (re.test(text)) hits.push(`${relative(REPO, file)}: ${what}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("wrangler.jsonc binds no flight counter or key", () => {
    const wr = readFileSync(join(REPO, "apps/web/wrangler.jsonc"), "utf8");
    expect(wr).not.toMatch(/FLIGHT_/);
  });
});
