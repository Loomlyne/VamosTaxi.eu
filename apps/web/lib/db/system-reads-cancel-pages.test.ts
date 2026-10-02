// apps/web/lib/db/system-reads-cancel-pages.test.ts
//
// 261002 settle safety (P-2): loadCancelChangePages reads the Stripe pages of the change requests a
// cancel ended, through the definer function (vamos_system has no table SELECT; system-reads.test.ts
// guards the raw-table rule for every asSystem block, this file's loader is on its list).

import { beforeEach, describe, expect, it, vi } from "vitest";

const asSystem = vi.fn();
vi.mock("./identity", () => ({ asSystem: (...a: unknown[]) => asSystem(...a) }));

import { loadCancelChangePages } from "./system-reads";

const BOOKING = "b0000000-0000-4000-8000-000000000801";
const env = {} as CloudflareEnv;

let seen: { text: string; values: unknown[] }[] = [];

function answers(rows: unknown) {
  asSystem.mockImplementation(async (_e: unknown, fn: (sql: unknown) => unknown) =>
    fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      seen.push({ text: strings.join("?"), values });
      return Promise.resolve(rows);
    }),
  );
}

beforeEach(() => {
  asSystem.mockReset();
  seen = [];
});

describe("loadCancelChangePages", () => {
  it("calls the definer function with the booking id and returns the page ids", async () => {
    answers([{ extra_session_id: "cs_test_wait_1" }, { extra_session_id: "cs_test_wait_2" }]);
    expect(await loadCancelChangePages(env, BOOKING)).toEqual(["cs_test_wait_1", "cs_test_wait_2"]);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.text).toMatch(/from public\.booking_cancel_change_pages\(\?::uuid\)/);
    expect(seen[0]!.values).toEqual([BOOKING]);
    // A function call, never a table read (vamos_system would get 42501).
    expect(seen[0]!.text).not.toMatch(/from public\.booking_edit_requests/);
  });

  it("nothing listed (not cancelled, or no change ended) is an empty list", async () => {
    answers([]);
    expect(await loadCancelChangePages(env, BOOKING)).toEqual([]);
  });

  it("a null or blank page (a change that never got one) is dropped, the rest is trimmed", async () => {
    answers([{ extra_session_id: null }, { extra_session_id: "  " }, { extra_session_id: " cs_test_wait_1 " }]);
    expect(await loadCancelChangePages(env, BOOKING)).toEqual(["cs_test_wait_1"]);
  });

  it("a database error reaches the caller (paid-cancel catches it; the cancel's answer does not depend on it)", async () => {
    asSystem.mockRejectedValue(new Error("connection terminated"));
    await expect(loadCancelChangePages(env, BOOKING)).rejects.toThrow("connection terminated");
  });
});
