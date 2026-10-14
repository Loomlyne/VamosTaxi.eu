import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OPS_AUTH_INTERNAL, internalDashboardPath, publicDashboardPath } from "./paths";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

// 26.1-20 removed the /ops/mfa-challenge page. The second factor is now the 'mfa'
// stage of app/ops/AuthForm.dc.html on /login (26.1-23).
describe("ops auth paths", () => {
  it("no longer lists the removed /ops/mfa-challenge route", () => {
    expect(OPS_AUTH_INTERNAL).not.toContain("/ops/mfa-challenge");
    expect(OPS_AUTH_INTERNAL).toContain("/ops/sign-in");
  });

  it("keeps /login as the one sign-in door", () => {
    expect(internalDashboardPath("/login")).toBe("/ops/sign-in");
    expect(publicDashboardPath("/ops")).toBe("/");
  });

  // Phase 32 (plan 03, D-07): Content › Pages and Legal were removed together with content-string-edit.spec.ts, the
  // spec this pin used to read. The pin now covers every integration spec: none goes through mfa-challenge.
  it("no integration spec signs in through the removed mfa-challenge page", () => {
    const dir = join(webRoot, "tests/integration");
    expect(existsSync(join(dir, "content-string-edit.spec.ts"))).toBe(false);
    const hits = readdirSync(dir).filter((f) => f.endsWith(".spec.ts") && /mfa-challenge/.test(readFileSync(join(dir, f), "utf8")));
    expect(hits).toEqual([]);
  });
});
