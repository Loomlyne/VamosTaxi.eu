// apps/web/lib/ops/staff-gate.test.ts
//
// INT-09 / D-16 / D-16a / D-16b: the one gate decision shared by requireStaffClaims and both
// middleware gates. Mirrors app.is_staff()/app.is_admin() in SQL (20260928180000).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { effectiveNextLevel, isPasskeySession, passkeyCheckNeeded, staffGateDecision } from "./staff-gate";

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

describe("staffGateDecision with a registered passkey (D-16a, 26.1-25)", () => {
  const admin = { role: "admin", currentLevel: "aal1", nextLevel: "aal1" } as const;

  it("a password session must step up once a passkey is registered", () => {
    expect(staffGateDecision({ ...admin, hasPasskey: true, amrMethods: ["password"] })).toBe("step-up");
  });

  it("a magic-link session must step up once a passkey is registered", () => {
    expect(staffGateDecision({ ...admin, hasPasskey: true, amrMethods: ["otp"] })).toBe("step-up");
    expect(staffGateDecision({ ...admin, hasPasskey: true, amrMethods: ["magiclink"] })).toBe("step-up");
  });

  it("a session with no amr at all must step up once a passkey is registered", () => {
    expect(staffGateDecision({ ...admin, hasPasskey: true })).toBe("step-up");
    expect(staffGateDecision({ ...admin, hasPasskey: true, amrMethods: null })).toBe("step-up");
  });

  it("a passkey sign-in session is allowed (GoTrue records amr passkey at aal1)", () => {
    expect(staffGateDecision({ ...admin, hasPasskey: true, amrMethods: ["passkey"] })).toBe("allow");
  });

  it("an aal2 session is allowed with a passkey registered", () => {
    expect(
      staffGateDecision({ role: "admin", currentLevel: "aal2", nextLevel: "aal1", hasPasskey: true, amrMethods: ["password", "totp"] }),
    ).toBe("allow");
  });

  it("only the exact passkey method counts, not a look-alike", () => {
    expect(staffGateDecision({ ...admin, hasPasskey: true, amrMethods: ["webauthn"] })).toBe("step-up");
    expect(staffGateDecision({ ...admin, hasPasskey: true, amrMethods: ["Passkey"] })).toBe("step-up");
  });

  it("no passkey and no factor: aal1 is still enough (D-16)", () => {
    expect(staffGateDecision({ ...admin, hasPasskey: false, amrMethods: ["password"] })).toBe("allow");
  });

  it("a passkey session does not stand in for an enrolled authenticator app (SQL needs aal2)", () => {
    expect(
      staffGateDecision({ role: "admin", currentLevel: "aal1", nextLevel: "aal2", hasPasskey: true, amrMethods: ["passkey"] }),
    ).toBe("step-up");
  });

  it("a dispatcher is denied even on a passkey session (D-16b)", () => {
    expect(
      staffGateDecision({ role: "dispatcher", currentLevel: "aal1", nextLevel: "aal1", hasPasskey: true, amrMethods: ["passkey"] }),
    ).toBe("deny");
  });
});

describe("isPasskeySession", () => {
  it("reads object and string amr entries", () => {
    expect(isPasskeySession([{ method: "passkey", timestamp: 1 }])).toBe(true);
    expect(isPasskeySession(["passkey"])).toBe(true);
    expect(isPasskeySession([{ method: "password" }, "otp"])).toBe(false);
    expect(isPasskeySession(null)).toBe(false);
    expect(isPasskeySession(undefined)).toBe(false);
  });
});

describe("passkeyCheckNeeded", () => {
  it("is true only for an admin whose session is not already strong and has no enrolled factor", () => {
    expect(passkeyCheckNeeded({ role: "admin", currentLevel: "aal1", nextLevel: "aal1", amrMethods: ["password"] })).toBe(true);
  });

  it("is false when the passkey cannot change the decision", () => {
    expect(passkeyCheckNeeded({ role: "dispatcher", currentLevel: "aal1", nextLevel: "aal1" })).toBe(false);
    expect(passkeyCheckNeeded({ role: undefined, currentLevel: "aal1", nextLevel: "aal1" })).toBe(false);
    expect(passkeyCheckNeeded({ role: "admin", currentLevel: "aal2", nextLevel: "aal2" })).toBe(false);
    expect(passkeyCheckNeeded({ role: "admin", currentLevel: "aal1", nextLevel: "aal2" })).toBe(false);
    expect(passkeyCheckNeeded({ role: "admin", currentLevel: "aal1", nextLevel: "aal1", amrMethods: ["passkey"] })).toBe(false);
  });
});

describe("middleware wiring (source contract)", () => {
  const middleware = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../middleware.ts"), "utf8");

  it("both the dashboard host gate and the /ops gate call staffGateDecision", () => {
    expect(middleware.split("staffGateDecision(").length - 1).toBeGreaterThanOrEqual(2);
    const dash = middleware.slice(
      middleware.indexOf("async function dashboardHostMiddleware("),
      middleware.indexOf("function opsRedirectUrl("),
    );
    expect(dash).toContain("staffGateDecision(");
    const ops = middleware.slice(
      middleware.indexOf("async function opsStaffGate("),
      middleware.indexOf("export default async function middleware("),
    );
    expect(ops).toContain("staffGateDecision(");
  });

  it("both gates pass the passkey inputs to staffGateDecision (26.1-25)", () => {
    const dash = middleware.slice(
      middleware.indexOf("async function dashboardHostMiddleware("),
      middleware.indexOf("function opsRedirectUrl("),
    );
    const ops = middleware.slice(
      middleware.indexOf("async function opsStaffGate("),
      middleware.indexOf("export default async function middleware("),
    );
    for (const gate of [dash, ops]) {
      expect(gate).toContain("passkeyGateInputs(");
      expect(gate).toMatch(/\.\.\.passkey/);
    }
  });

  it("the /ops gate never redirects to the missing /ops/mfa-challenge page", () => {
    expect(middleware).not.toContain("mfa-challenge");
  });

  it("the dashboard console admits only an allow decision for the admin role (D-16b)", () => {
    expect(middleware).not.toMatch(/role === "dispatcher"/);
    expect(middleware).toMatch(/const inConsole = role === "admin" && gate === "allow"/);
  });
});
