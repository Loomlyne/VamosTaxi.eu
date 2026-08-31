"use server";

// dynamic = "force-dynamic" — D-06 fence. A real export is illegal in a "use server" module.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { emailSchema, passwordSchema } from "@/lib/auth/schemas";
import { asStaff } from "@/lib/db/identity";
import { log } from "@/lib/logger";
import { getStaffClaims } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type StaffSignInResult = { ok: true } | { ok: false };
export type StaffFactorResult =
  | { enrolled: true; factorId: string }
  | { enrolled: false };
export type StaffChallengeResult =
  | { ok: true; challengeId: string }
  | { ok: false };
export type StaffVerifyResult = { ok: true; href: string } | { ok: false };

function authLog(action: string, reason: string): void {
  log("error", "ops-auth", { requestId: crypto.randomUUID(), route: action, locale: null }, { reason });
}

export async function staffSignInAction(input: {
  email: string;
  password: string;
}): Promise<StaffSignInResult> {
  const email = emailSchema.safeParse(input.email);
  const password = passwordSchema.safeParse(input.password);
  if (!email.success || !password.success) {
    authLog("staffSignInAction", "invalid-input");
    return { ok: false };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.data,
    password: password.data,
  });
  if (error) {
    authLog("staffSignInAction", error.code ?? "auth-failed");
    return { ok: false };
  }
  return { ok: true };
}

export async function staffListVerifiedFactor(): Promise<StaffFactorResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) {
    authLog("staffListVerifiedFactor", error.code ?? "list-failed");
    return { enrolled: false };
  }
  const verified = (data?.all ?? []).find((factor) => factor.status === "verified");
  if (!verified) return { enrolled: false };
  return { enrolled: true, factorId: verified.id };
}

export async function staffMfaChallenge(factorId: string): Promise<StaffChallengeResult> {
  if (!factorId) {
    authLog("staffMfaChallenge", "invalid-input");
    return { ok: false };
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.mfa.challenge({ factorId });
  if (error || !data?.id) {
    authLog("staffMfaChallenge", error?.code ?? "challenge-failed");
    return { ok: false };
  }
  return { ok: true, challengeId: data.id };
}

async function claimInviteNonFatal(): Promise<void> {
  try {
    const supabase = await createServerSupabaseClient();
    const claims = await getStaffClaims(supabase);
    if (!claims || claims.aal !== "aal2") return;
    const { env } = getCloudflareContext();
    await asStaff(env, claims, async (sql) => {
      await sql`select public.staff_claim_invite()`;
      return null;
    });
  } catch {
    authLog("staffClaimInvite", "claim-failed");
  }
}

export async function staffMfaVerify(input: {
  factorId: string;
  challengeId: string;
  code: string;
  next?: string | null;
}): Promise<StaffVerifyResult> {
  const code = input.code.replace(/\s+/g, "");
  if (!input.factorId || !input.challengeId || !/^\d{6}$/.test(code)) {
    authLog("staffMfaVerify", "invalid-input");
    return { ok: false };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.mfa.verify({
    factorId: input.factorId,
    challengeId: input.challengeId,
    code,
  });
  if (error) {
    authLog("staffMfaVerify", error.code ?? "verify-failed");
    return { ok: false };
  }

  await claimInviteNonFatal();
  let href = "/ops";
  const next = input.next;
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.includes("://")) {
    href = next;
  }
  return { ok: true, href };
}
