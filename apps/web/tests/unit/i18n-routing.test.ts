// apps/web/tests/unit/i18n-routing.test.ts
//
// K52: next-intl must not set NEXT_LOCALE without Secure (404s used to).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const routingSrc = readFileSync(join(here, "../../i18n/routing.ts"), "utf8");

describe("i18n routing cookie (K52)", () => {
  it("disables Accept-Language detection and marks NEXT_LOCALE Secure", () => {
    expect(routingSrc).toMatch(/localeDetection:\s*false/);
    expect(routingSrc).toMatch(/localeCookie:\s*\{/);
    expect(routingSrc).toMatch(/secure:\s*true/);
    expect(routingSrc).toMatch(/sameSite:\s*"lax"/);
  });
});
