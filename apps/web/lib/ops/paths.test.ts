import { readFileSync } from "node:fs";
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

  it("the content-string e2e signs in through /login and the code step, not mfa-challenge", () => {
    const spec = readFileSync(join(webRoot, "tests/integration/content-string-edit.spec.ts"), "utf8");
    expect(spec).not.toMatch(/mfa-challenge/);
    expect(spec).toMatch(/Enter the 6-digit code/);
  });
});
