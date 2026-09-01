import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getTranslations } from "next-intl/server";
import { StaffTable } from "@/components/ops/StaffTable";
import { loadStaff } from "@/lib/ops/staff";
import { OpsAuthError, requireAdminClaims, type StaffAuthClient } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OpsStaffPage() {
  const t = await getTranslations("ops.staffRoster");
  const supabase = (await createServerSupabaseClient()) as StaffAuthClient;

  try {
    const claims = await requireAdminClaims(supabase);
    const { env } = getCloudflareContext();
    const roster = await loadStaff(env, claims);

    if (roster.access !== "ok") {
      return <StaffRefused title={t("title")} body={t("refused")} />;
    }

    return (
      <section data-page="ops-staff">
        <StaffTable rows={roster.rows} />
      </section>
    );
  } catch (error) {
    if (error instanceof OpsAuthError && error.reason === "not-admin") {
      return <StaffRefused title={t("title")} body={t("refused")} />;
    }
    throw error;
  }
}

function StaffRefused({ title, body }: { title: string; body: string }) {
  return (
    <section data-page="ops-staff" data-staff-refused="1">
      <h1
        style={{
          margin: 0,
          fontFamily: "var(--vt-font-display)",
          fontSize: "var(--vt-heading-2)",
          fontWeight: "var(--vt-weight-semibold)",
          letterSpacing: "var(--vt-heading-tracking)",
        }}
      >
        {title}
      </h1>
      <p
        style={{
          marginBlockStart: 12,
          marginBlockEnd: 0,
          maxInlineSize: "64ch",
          fontFamily: "var(--vt-font-body)",
          fontSize: "var(--vt-body-md)",
          lineHeight: 1.6,
          color: "var(--vt-text-muted)",
        }}
      >
        {body}
      </p>
    </section>
  );
}
