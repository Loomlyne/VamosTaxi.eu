import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 26.1-23: staff password sign-in has exactly one door — POST /api/auth
// action "signin", which refuses a magic_link account (26.1-22). The old
// server action here signed in with a password without that check and had
// no importers, so it is gone and must not come back.
const source = readFileSync(resolve(__dirname, "staff-ops.ts"), "utf8");

describe("lib/auth/staff-ops.ts", () => {
  it("has no password sign-in that bypasses the sign-in-method check", () => {
    expect(source).not.toMatch(/staffSignInAction/);
    expect(source).not.toMatch(/signInWithPassword/);
  });
});
