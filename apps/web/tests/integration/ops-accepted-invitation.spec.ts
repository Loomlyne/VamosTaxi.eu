// apps/web/tests/integration/ops-accepted-invitation.spec.ts
//
// Acceptance is a database authorization boundary: a merely active invite
// cannot receive a staff role or access the dashboard. The self-only claim
// endpoint is the one bridge available before that role exists.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";

const here = __dirname;
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");
const migration = readFileSync(
  join(repoRoot, "packages/db/supabase/migrations/20260901000001_staff_invitation_acceptance_gate.sql"),
  "utf8",
);
const claimRoute = readFileSync(join(webRoot, "app/api/staff/claim-invite/route.ts"), "utf8");
const claimRouteReexport = readFileSync(
  join(webRoot, "app/[locale]/(ops)/api/staff/claim-invite/route.ts"),
  "utf8",
);
const authForm = readFileSync(join(repoRoot, "app/ops/AuthForm.dc.html"), "utf8");

test.describe("accepted staff invitations @ops-accepted-invite", () => {
  test("only active accepted staff receive a console role; an invitee can claim their own invite once", () => {
    expect(migration).toMatch(/s\.active\s+and\s+s\.accepted_at\s+is\s+not\s+null/i);
    expect(migration).toMatch(/create\s+or\s+replace\s+function\s+public\.staff_claim_invite/i);
    expect(migration).toMatch(/app\.uid\(\)/i);
    expect(migration).toMatch(/accepted_at\s*=\s*coalesce\(accepted_at,\s*now\(\)\)/i);
    expect(migration).toMatch(/grant\s+execute\s+on\s+function\s+public\.staff_claim_invite\(\)\s+to\s+authenticated/i);
    expect(migration).not.toMatch(/staff_claim_invite requires an active aal2/i);
    expect(migration).not.toMatch(/mfa_enrolled\s*=\s*true/i);
  });

  test("the live dashboard login claims before redirecting and exposes a real passkey ceremony", () => {
    expect(claimRoute).toMatch(/supabase\.rpc\("staff_claim_invite"\)/);
    expect(claimRoute).toMatch(/supabase\.auth\.refreshSession\(\)/);
    expect(claimRoute).toContain("authSetCookieHeader");
    expect(claimRoute).toContain('headers.append("Set-Cookie"');
    expect(claimRoute).toContain("createServerSupabaseClient(request, { cookies: setCookies })");
    expect(claimRouteReexport).toMatch(/export\s+\{\s*POST\s*\}/);
    expect(authForm).toContain("/api/staff/claim-invite");
    expect(authForm).toContain("navigator.credentials.get");
    expect(authForm).toContain("passkey-start");
    expect(authForm).toContain("passkey-verify");
    expect(authForm).not.toContain("vamosOpsAuth");
  });
});
