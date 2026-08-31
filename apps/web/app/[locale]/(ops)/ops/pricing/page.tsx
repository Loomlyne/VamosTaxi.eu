import { notFound } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getTranslations } from "next-intl/server";
import { PricingCompleteness } from "@/components/ops/PricingCompleteness";
import { PricingPublishDialog } from "@/components/ops/PricingPublishDialog";
import { PricingVersionList } from "@/components/ops/PricingVersionList";
import { loadCompleteness, loadRateVersions } from "@/lib/ops/pricing";
import { OpsAuthError, requireAdminClaims, type StaffAuthClient } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const sectionStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 20,
  minInlineSize: 0,
};

const headerStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 14,
};

const titleStyle = {
  margin: 0,
  fontFamily: "var(--vt-font-display)",
  fontSize: "var(--vt-heading-2)",
  fontWeight: "var(--vt-weight-semibold)",
  letterSpacing: "var(--vt-heading-tracking)",
};

const subtitleStyle = {
  margin: "4px 0 0",
  fontFamily: "var(--vt-font-body)",
  fontSize: "var(--vt-body-xs)",
  color: "var(--vt-text-muted)",
};

export default async function OpsPricingPage() {
  const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
  let claims;
  try {
    claims = await requireAdminClaims(supabase);
  } catch (error) {
    if (error instanceof OpsAuthError && error.reason === "not-admin") notFound();
    throw error;
  }

  const { env } = getCloudflareContext();
  const versions = await loadRateVersions(env, claims);
  const draft = versions.find((row) => row.status === "draft") ?? versions[0] ?? null;
  const live = versions.find((row) => row.status === "live") ?? null;
  const gaps = draft ? await loadCompleteness(env, claims, draft.id) : [];
  const t = await getTranslations("ops");

  return (
    <section data-ops-pricing="1" style={sectionStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={titleStyle}>{t("pricing.title")}</h1>
          <p style={subtitleStyle}>{t("pricing.subtitle")}</p>
        </div>
      </header>
      <PricingVersionList
        versions={versions}
        currentId={draft?.id ?? null}
        liveId={live?.id ?? null}
        gaps={gaps}
      />
      <PricingCompleteness gaps={gaps} />
      <PricingPublishDialog versionId={draft?.id ?? null} inert={gaps.length > 0} />
    </section>
  );
}
