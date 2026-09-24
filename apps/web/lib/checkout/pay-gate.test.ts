import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "../..");
const repo = join(web, "../..");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const ROUTES = [
  "app/api/checkout/intent/route.ts",
  "app/api/checkout/pay-link/route.ts",
  "app/api/checkout/pay-link/open/route.ts",
] as const;

describe("pay gate does not SELECT bookings as vamos_checkout", () => {
  it("reads is_test through checkout_booking_is_test", () => {
    for (const rel of ROUTES) {
      const src = read(join(web, rel));
      expect(src, rel).not.toMatch(/from public\.bookings/);
      expect(src, rel).toContain("checkout_booking_is_test");
    }
  });

  it("grants the definer to vamos_checkout only", () => {
    const sql = read(
      join(repo, "packages/db/supabase/migrations/20260923200000_checkout_booking_is_test.sql"),
    );
    expect(sql).toContain("security definer");
    expect(sql).toContain("grant execute on function public.checkout_booking_is_test");
    expect(sql).toContain("to vamos_checkout");
    expect(sql).not.toContain("grant select");
  });
});
