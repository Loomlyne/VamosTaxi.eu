import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { OpsAuthCard } from "@/components/ops/OpsAuthCard";
import { OpsAcceptInvite } from "@/components/ops/OpsAcceptInvite";
import { passwordSchema } from "@/lib/auth/schemas";
import { asStaff } from "@/lib/db/identity";
import { log } from "@/lib/logger";
import { getStaffClaims } from "@/lib/ops/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function authLog(action: string, reason: string): void {
  log("error", "ops-invite-accept", { requestId: crypto.randomUUID(), route: action, locale: null }, { reason });
}

async function establishInviteSession(input: {
  accessToken?: string;
  refreshToken?: string;
  code?: string;
}): Promise<{ ok: boolean }> {
  "use server";
  const supabase = await createSupabaseServerClient();
  if (input.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(input.code);
    if (error) {
      authLog("establishInviteSession", error.code ?? "exchange-failed");
      return { ok: false };
    }
    return { ok: true };
  }
  if (input.accessToken && input.refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: input.accessToken,
      refresh_token: input.refreshToken,
    });
    if (error) {
      authLog("establishInviteSession", error.code ?? "set-session-failed");
      return { ok: false };
    }
    return { ok: true };
  }
  return { ok: false };
}

async function setInvitePassword(password: string): Promise<{ ok: boolean }> {
  "use server";
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) {
    authLog("setInvitePassword", "invalid-input");
    return { ok: false };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    authLog("setInvitePassword", error.code ?? "update-failed");
    return { ok: false };
  }
  return { ok: true };
}

async function startTotpEnrol(): Promise<
  { ok: true; factorId: string; qrCode: string; secret: string } | { ok: false }
> {
  "use server";
  const supabase = await createSupabaseServerClient();
  const listed = await supabase.auth.mfa.listFactors();
  if (listed.error) {
    authLog("startTotpEnrol", listed.error.code ?? "list-failed");
    return { ok: false };
  }
  const unverified = (listed.data?.all ?? []).filter(
    (factor: { id: string; factor_type: string; status: string }) =>
      factor.factor_type === "totp" && factor.status === "unverified",
  );
  for (const factor of unverified) {
    const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (removed.error) {
      authLog("startTotpEnrol", removed.error.code ?? "unenroll-failed");
      return { ok: false };
    }
  }
  const enrolled = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (enrolled.error || !enrolled.data?.totp) {
    authLog("startTotpEnrol", enrolled.error?.code ?? "enroll-failed");
    return { ok: false };
  }
  return {
    ok: true,
    factorId: enrolled.data.id,
    qrCode: enrolled.data.totp.qr_code,
    secret: enrolled.data.totp.secret,
  };
}

async function challengeTotp(factorId: string): Promise<{ ok: true; challengeId: string } | { ok: false }> {
  "use server";
  if (!factorId) {
    authLog("challengeTotp", "invalid-input");
    return { ok: false };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.mfa.challenge({ factorId });
  if (error || !data?.id) {
    authLog("challengeTotp", error?.code ?? "challenge-failed");
    return { ok: false };
  }
  return { ok: true, challengeId: data.id };
}

async function verifyTotpAndClaim(input: {
  factorId: string;
  challengeId: string;
  code: string;
}): Promise<{ ok: true; claimed: boolean } | { ok: false }> {
  "use server";
  const code = input.code.replace(/\s+/g, "");
  if (!input.factorId || !input.challengeId || !/^\d{6}$/.test(code)) {
    authLog("verifyTotpAndClaim", "invalid-input");
    return { ok: false };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.mfa.verify({
    factorId: input.factorId,
    challengeId: input.challengeId,
    code,
  });
  if (error) {
    authLog("verifyTotpAndClaim", error.code ?? "verify-failed");
    return { ok: false };
  }

  let claimed = true;
  try {
    const claims = await getStaffClaims(supabase);
    if (!claims || claims.aal !== "aal2") {
      claimed = false;
    } else {
      const { env } = getCloudflareContext();
      await asStaff(env, claims, async (sql) => {
        await sql`select public.staff_claim_invite()`;
        return null;
      });
    }
  } catch {
    authLog("verifyTotpAndClaim", "claim-failed");
    claimed = false;
  }
  return { ok: true, claimed };
}

export default async function OpsAcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; code?: string }>;
}) {
  const params = await searchParams;
  const tokenHash = params.token_hash;
  const type = params.type;
  const code = params.code;

  if (tokenHash && type === "invite") {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });
    if (error) authLog("accept-invite-page", error.code ?? "otp-failed");
  } else if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) authLog("accept-invite-page", error.code ?? "exchange-failed");
  }

  const t = await getTranslations("ops");
  return (
    <OpsAuthCard title={t("accept-invite")}>
      <OpsAcceptInvite
        establishSession={establishInviteSession}
        setPassword={setInvitePassword}
        startEnrol={startTotpEnrol}
        challenge={challengeTotp}
        verifyAndClaim={verifyTotpAndClaim}
      />
    </OpsAuthCard>
  );
}
