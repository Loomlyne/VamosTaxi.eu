import { describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";

const asStaff = vi.fn();

vi.mock("@/lib/db/identity", () => ({
  asStaff: (...args: unknown[]) => asStaff(...args),
}));

import { loadBookings } from "./bookings";

describe("loadBookings board query", () => {
  it("returns the snapshot lines so ops detail prints the stored fare rows (26.2-u03a)", async () => {
    let text = "";
    asStaff.mockImplementation(async (_env: unknown, _claims: unknown, fn: (sql: unknown) => unknown) => {
      const sql = async (strings: TemplateStringsArray) => {
        text = strings.join("?");
        return [];
      };
      return fn(sql);
    });
    await loadBookings({} as CloudflareEnv, { sub: "s", role: "authenticated" } as VamosClaims);
    // The outer select list is everything before the first "from public.bookings b".
    const outer = text.slice(0, text.indexOf("from public.bookings b"));
    expect(outer).toMatch(/\bsnap\.lines\b/);
  });
});
