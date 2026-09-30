// apps/web/lib/ops/rate-book-stored-codes.test.ts
//
// 26.2-bp B4: the dashboard rate-book reader must return every surcharge row a
// price book holds. Old books (and any draft cloned from one) store codes with
// an underscore (child_seat, meet_greet); the database allows [a-z0-9_-]{1,64}.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";

const asStaff = vi.fn();

vi.mock("../db/identity", () => ({
  asStaff: (...args: unknown[]) => asStaff(...args),
}));

const CLAIMS = { sub: "staff-1", role: "authenticated" } as VamosClaims;
const ENV = {} as CloudflareEnv;

function surcharge(id: number, code: string) {
  return {
    id,
    rate_version_id: 13,
    code,
    kind: "included",
    amount_rappen: null,
    percent: null,
    applies_to: "leg",
    active: true,
    rule_id: null,
  };
}

function mockBook(codes: string[]) {
  asStaff.mockImplementation(async (_env: CloudflareEnv, _claims: unknown, fn: (tx: unknown) => unknown) => {
    const tx = async (strings: TemplateStringsArray) => {
      const text = strings.join("?");
      if (text.includes("from public.rate_versions")) {
        return [
          {
            id: 13,
            slug: "ops-draft-from-13",
            label: "Book 13 draft",
            status: "draft",
            vat_rate_bps: null,
            quote_lock_minutes: null,
            free_wait_minutes: null,
          },
        ];
      }
      if (text.includes("from public.surcharges")) {
        return codes.map((code, i) => surcharge(i + 1, code));
      }
      return [];
    };
    return fn(tx);
  });
}

describe("loadRateBook returns every stored surcharge row (26.2-bp B4)", () => {
  beforeEach(() => {
    asStaff.mockReset();
  });

  it("keeps the underscore codes of an old price book next to the kebab ones", async () => {
    mockBook(["child_seat", "meet_greet", "vip-welcome"]);
    const { loadRateBook } = await import("./rate-book");

    const book = await loadRateBook(ENV, CLAIMS, 13);

    expect(book?.surcharges.map((row) => row.code)).toEqual(["child_seat", "meet_greet", "vip-welcome"]);
  });

  it("still leaves out a code the database check would refuse", async () => {
    mockBook(["Child Seat", "", "vip-welcome"]);
    const { loadRateBook } = await import("./rate-book");

    const book = await loadRateBook(ENV, CLAIMS, 13);

    expect(book?.surcharges.map((row) => row.code)).toEqual(["vip-welcome"]);
  });
});
