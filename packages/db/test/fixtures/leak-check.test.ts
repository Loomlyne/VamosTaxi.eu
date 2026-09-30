// packages/db/test/fixtures/leak-check.test.ts
//
// Regression test for 26.2 unit 10, finding B1: the isolation gate's "no foreign row" check
// must fail on a PARTIAL leak (one of the other identity's rows), not only when every one of
// the other identity's rows is present. Database-free.

import { describe, expect, it } from "vitest";
import { expectNoForeignReference } from "./leak-check";

const OWN = ["own-1", "own-2", "own-3"];
const OTHER = ["other-1", "other-2", "other-3"];

describe("expectNoForeignReference (DATA-06 A1, no foreign row)", () => {
  it("passes when the probe returned only its own rows", () => {
    expect(() => expectNoForeignReference(OWN, OTHER, "leak")).not.toThrow();
  });

  it("fails when ONE row of the other identity is present", () => {
    expect(() => expectNoForeignReference([...OWN, "other-2"], OTHER, "leak")).toThrow(/leak/);
  });

  it("fails when every row of the other identity is present", () => {
    expect(() => expectNoForeignReference([...OWN, ...OTHER], OTHER, "leak")).toThrow(/leak/);
  });

  it("passes when the other identity has no rows at all", () => {
    expect(() => expectNoForeignReference(OWN, [], "leak")).not.toThrow();
  });
});
