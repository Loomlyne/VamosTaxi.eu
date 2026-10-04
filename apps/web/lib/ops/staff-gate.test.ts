// apps/web/lib/ops/staff-gate.test.ts
//
// INT-09 / D-16 / D-16a / D-16b: the one gate decision shared by requireStaffClaims and both
// middleware gates. Mirrors app.is_staff()/app.is_admin() in SQL (20260928180000).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { effectiveNextLevel, staffGateDecision } from "./staff-gate";

describe("staffGateDecision", () => {
  it("admin with no enrolled factor at aal1 is allowed (D-16)", () => {
    expect(staffGateDecision({ role: "admin", currentLevel: "aal1", nextLevel: "aal1" })).toBe("allow");
  });

  it("admin at aal1 with an enrolled factor must step up (D-16a)", () => {
    expect(staffGateDecision({ role: "admin", currentLevel: "aal1", nextLevel: "aal2" })).toBe("step-up");
  });

  it("admin at aal2 is allowed", () => {
    expect(staffGateDecision({ role: "admin", currentLevel: "aal2", nextLevel: "aal2" })).toBe("allow");
  });

  it("admin with a missing current level and an enrolled factor must step up", () => {
    expect(staffGateDecision({ role: "admin", currentLevel: null, nextLevel: "aal2" })).toBe("step-up");
    expect(staffGateDecision({ role: "admin", currentLevel: undefined, nextLevel: "aal2" })).toBe("step-up");
  });

  it("dispatcher is denied at any level (D-16b)", () => {
    expect(staffGateDecision({ role: "dispatcher", currentLevel: "aal1", nextLevel: "aal1" })).toBe("deny");
    expect(staffGateDecision({ role: "dispatcher", currentLevel: "aal2", nextLevel: "aal2" })).toBe("deny");
  });

  it("no role or an unknown role is denied", () => {
    expect(staffGateDecision({ role: undefined, currentLevel: "aal2", nextLevel: "aal2" })).toBe("deny");
    expect(staffGateDecision({ role: "", currentLevel: "aal1", nextLevel: "aal1" })).toBe("deny");
    expect(staffGateDecision({ role: "Admin", currentLevel: "aal2", nextLevel: "aal2" })).toBe("deny");
    expect(staffGateDecision({ role: { admin: true }, currentLevel: "aal2", nextLevel: "aal2" })).toBe("deny");
  });
});

describe("effectiveNextLevel", () => {
  it("is aal2 when the server-verified user has a verified factor, whatever the client reported", () => {
    expect(effectiveNextLevel("aal1", [{ status: "verified" }])).toBe("aal2");
    expect(effectiveNextLevel(null, [{ status: "unverified" }, { status: "verified" }])).toBe("aal2");
  });

  it("is aal2 when the reported next level is aal2", () => {
    expect(effectiveNextLevel("aal2", [])).toBe("aal2");
    expect(effectiveNextLevel("aal2", undefined)).toBe("aal2");
  });

  it("ignores unverified factors (no lockout on a half-finished enrolment)", () => {
    expect(effectiveNextLevel("aal1", [{ status: "unverified" }])).toBe("aal1");
  });

  it("is aal1 with no factors and no reported level", () => {
    expect(effectiveNextLevel(undefined, undefined)).toBe("aal1");
    expect(effectiveNextLevel(null, null)).toBe("aal1");
  });
});

describe("staffGateDecision: a passkey is a sign-in option, not a forced step (quick 260928-wg9)", () => {
  const admin = { role: "admin", currentLevel: "aal1", nextLevel: "aal1" } as const;

  it("password, magic link, e-mail code and passkey sessions are each enough on their own", () => {
    for (const method of ["password", "otp", "magiclink", "passkey"]) {
      expect(staffGateDecision({ ...admin, amrMethods: [method] })).toBe("allow");
    }
    expect(staffGateDecision({ ...admin })).toBe("allow");
  });

  it("a passkey session does not stand in for an enrolled authenticator app (SQL needs aal2)", () => {
    expect(staffGateDecision({ role: "admin", currentLevel: "aal1", nextLevel: "aal2", amrMethods: ["passkey"] })).toBe("step-up");
  });

  it("a dispatcher is denied even on a passkey session (D-16b)", () => {
    expect(staffGateDecision({ role: "dispatcher", currentLevel: "aal1", nextLevel: "aal1", amrMethods: ["passkey"] })).toBe("deny");
  });
});

describe("middleware wiring (source contract)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const middleware = readFileSync(join(here, "../../middleware.ts"), "utf8");
  const session = readFileSync(join(here, "session.ts"), "utf8");
  const assetGate = readFileSync(join(here, "asset-gate.ts"), "utf8");
  // The dashboard host's console rule lives in one function, shared by the documents
  // (dashboardHostMiddleware) and the /app/ops/* screen files (asset-gate.ts).
  const consoleRule = session.slice(
    session.indexOf("export async function dashboardConsoleAllowed("),
    session.indexOf("export async function getStaffClaims("),
  );
  const dash = middleware.slice(
    middleware.indexOf("async function dashboardHostMiddleware("),
    middleware.indexOf("function opsRedirectUrl("),
  );
  const ops = middleware.slice(
    middleware.indexOf("async function opsStaffGate("),
    middleware.indexOf("export default async function middleware("),
  );

  it("the dashboard host gate and the /ops gate both decide through staffGateDecision", () => {
    expect(consoleRule.length).toBeGreaterThan(0);
    expect(consoleRule).toContain("staffGateDecision(");
    expect(dash).toContain("dashboardConsoleAllowed(client.supabase");
    expect(dash).not.toContain("staffGateDecision(");
    expect(ops).toContain("staffGateDecision(");
  });

  it("the screen-file gate uses the very same console rule as the dashboard documents", () => {
    expect(assetGate).toContain("dashboardConsoleAllowed(client.supabase");
    expect(assetGate).not.toContain("staffGateDecision(");
    expect(assetGate).not.toContain("vamos_role");
  });

  it("both gates pass the amr inputs to staffGateDecision", () => {
    for (const gate of [consoleRule, ops]) {
      expect(gate).toContain("passkeyGateInputs(");
      expect(gate).toMatch(/\.\.\.passkey/);
    }
  });

  it("the /ops gate never redirects to the missing /ops/mfa-challenge page", () => {
    expect(middleware).not.toContain("mfa-challenge");
  });

  it("the dashboard console admits only an allow decision for the admin role (D-16b)", () => {
    expect(middleware).not.toMatch(/role === "dispatcher"/);
    expect(consoleRule).not.toMatch(/role === "dispatcher"/);
    expect(consoleRule).toMatch(/const inConsole = role === "admin" && gate === "allow"/);
    expect(dash).toMatch(/const inConsole = await dashboardConsoleAllowed\(/);
  });
});
