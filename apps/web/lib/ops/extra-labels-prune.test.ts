// apps/web/lib/ops/extra-labels-prune.test.ts
//
// 26.2 P4 A6 (owner, 2026-09-30: "anything deleted should be deleted completely"): after an
// extra is deleted, a draft is discarded or a book is published, the names of extras that no
// live or draft book uses any more are deleted. The SQL side is proven by
// packages/db/supabase/tests/extra_labels_prune.test.sql; here: the call, and that a failure
// never undoes the write before it.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const statements: string[] = [];
let fail = false;

vi.mock("../db/identity", () => ({
  asStaff: async (_env: unknown, _claims: unknown, fn: (tx: unknown) => unknown) => {
    const tx = (strings: TemplateStringsArray) => {
      statements.push(strings.join("?").replace(/\s+/g, " ").trim());
      if (fail) return Promise.reject(new Error("function public.staff_extra_labels_prune() does not exist"));
      return Promise.resolve([{ deleted: 1 }]);
    };
    return fn(tx);
  },
}));

import { pruneExtraLabels } from "./rate-book";

const env = {} as CloudflareEnv;
const claims = { sub: "admin" } as never;

beforeEach(() => {
  statements.length = 0;
  fail = false;
});

describe("pruneExtraLabels", () => {
  it("calls the admin prune function once", async () => {
    await pruneExtraLabels(env, claims);
    expect(statements).toEqual(["select public.staff_extra_labels_prune() as deleted"]);
  });

  it("logs and returns when the prune fails, so the delete or publish before it stands", async () => {
    fail = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(pruneExtraLabels(env, claims)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("ops_extra_labels_prune_failed", expect.stringContaining("does not exist"));
    log.mockRestore();
  });
});

describe("the three dashboard writes that can orphan a name call the prune", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const staffApi = join(here, "../../app/[locale]/(ops)/api/staff");
  it.each([
    ["rate-book/route.ts", /if \(table === "surcharges"\) await pruneExtraLabels\(env, claims\);/],
    ["rate-versions/[id]/discard/route.ts", /await pruneExtraLabels\(env, claims\);/],
    ["rate-versions/[id]/publish/route.ts", /await pruneExtraLabels\(env, claims\);/],
  ])("%s", (file, re) => {
    expect(readFileSync(join(staffApi, file), "utf8")).toMatch(re);
  });
});
