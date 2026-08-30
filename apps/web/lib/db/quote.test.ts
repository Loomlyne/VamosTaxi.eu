// apps/web/lib/db/quote.test.ts
//
// File-read proofs for the quote RPC door. No database, no network, no Docker.
// The wrappers need a live connection; these tests prove the two things that
// can be proven without one: names match the migrations, and the source
// never takes the refused paths.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const quoteSourcePath = join(here, "quote.ts");
const rpcMigrationPath = join(
  repoRoot,
  "packages/db/supabase/migrations/20260825000005_quote_read_rpc.sql",
);
const couponMigrationPath = join(
  repoRoot,
  "packages/db/supabase/migrations/20260825000006_coupon_release.sql",
);

const CALLED_FUNCTIONS = [
  "quote_rate_book",
  "quote_settings_version",
  "quote_lock_deadline",
  "evaluate_coupon",
] as const;

describe("quote RPC contract", () => {
  it("every called function is defined as create function public.<name> in a 04-06 migration", () => {
    const rpcSql = readFileSync(rpcMigrationPath, "utf8");
    const couponSql = readFileSync(couponMigrationPath, "utf8");
    const combined = `${rpcSql}\n${couponSql}`;
    for (const name of CALLED_FUNCTIONS) {
      expect(combined.includes(`create function public.${name}`), name).toBe(
        true,
      );
    }
  });
});

describe("quote.ts source shape", () => {
  const source = readFileSync(quoteSourcePath, "utf8");

  it("calls asQuote once per wrapper", () => {
    const matches = source.match(/asQuote/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(4);
  });

  it("never imports the cacheable public helper, the cacheable binding, or the core package", () => {
    expect(source.includes("publicSql")).toBe(false);
    expect(/(^|[^A-Z_])HYPERDRIVE([^A-Z_]|$)/m.test(source)).toBe(false);
    expect(source.includes("@vamos/db")).toBe(false);
  });

  it("never uses unsafe SQL or string-built templates", () => {
    expect(source.includes("tx.unsafe")).toBe(false);
    expect(source.includes("sql.unsafe")).toBe(false);
    expect(source.includes("` +") || source.includes("+ `")).toBe(false);
  });

  it("leaves upper() and the lock clock to Postgres", () => {
    expect(source.includes("toUpperCase")).toBe(false);
    expect(source.includes("new Date")).toBe(false);
    expect(source.includes("Date.now")).toBe(false);
  });
});
