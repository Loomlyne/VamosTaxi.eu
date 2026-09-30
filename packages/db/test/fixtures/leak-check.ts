// packages/db/test/fixtures/leak-check.ts
//
// The "no foreign row" half of DATA-06's A1 assertion, in one place so it can be unit-tested
// without a deployed probe (the deployed suite is skipped unless PROBE_BASE_URL is set).

import { expect } from "vitest";

/**
 * Fails when `refs` (the references one probe returned) contains ANY reference that belongs
 * to the other identity. `message` is the assertion message shown on failure.
 */
export function expectNoForeignReference(
  refs: readonly string[],
  otherReferences: readonly string[],
  message: string,
): void {
  // Not `not.toEqual(expect.arrayContaining(other))`: that only fails when EVERY one of the
  // other identity's references is present, so a partial leak would pass.
  const foreign = refs.filter((ref) => otherReferences.includes(ref));
  expect(foreign, message).toEqual([]);
}
