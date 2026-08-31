import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getTranslations } from "next-intl/server";
import { ProfilePanes } from "@/components/ops/ProfilePanes";
import { loadOwnProfile } from "@/lib/ops/staff";
import { requireStaffClaims, type StaffAuthClient } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** packages/db/supabase/config.toml [auth] secure_password_change — local convenience. Hosted should be true. */
const SECURE_PASSWORD_CHANGE = false;
/** packages/db/supabase/config.toml [auth.email] enable_confirmations — local convenience. Hosted should be true. */
const ENABLE_CONFIRMATIONS = false;

export default async function OpsProfilePage() {
  const t = await getTranslations("ops.profileScreen");
  const supabase = await createServerSupabaseClient();
  const claims = await requireStaffClaims(supabase as StaffAuthClient);
  const { env } = getCloudflareContext();
  const profile = await loadOwnProfile(env, claims);

  if (!profile) {
    return (
      <section data-page="ops-profile">
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--vt-font-display)",
            fontSize: "var(--vt-heading-2)",
            fontWeight: "var(--vt-weight-semibold)",
          }}
        >
          {t("title")}
        </h1>
        <p style={{ marginBlockStart: 12, color: "var(--vt-text-muted)" }}>{t("missing")}</p>
      </section>
    );
  }

  const listed = await supabase.auth.mfa.listFactors();
  const factors = (listed.data?.totp ?? []).map((factor) => ({
    id: factor.id,
    status: factor.status,
    factorType: "totp" as const,
  }));

  return (
    <ProfilePanes
      profile={profile}
      email={claims.email ?? ""}
      factors={factors}
      securePasswordChange={SECURE_PASSWORD_CHANGE}
      confirmationsEnabled={ENABLE_CONFIRMATIONS}
    />
  );
}
