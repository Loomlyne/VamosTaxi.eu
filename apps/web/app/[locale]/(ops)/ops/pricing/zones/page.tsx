import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getTranslations } from "next-intl/server";
import { ServiceZonePanel } from "@/components/ops/ServiceZonePanel";
import { loadServiceZones } from "@/lib/ops/rate-book";
import { requireStaffClaims, type StaffAuthClient } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const sectionStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 20,
  minInlineSize: 0,
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

export default async function OpsServiceZonesPage() {
  const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
  const claims = await requireStaffClaims(supabase);
  const { env } = getCloudflareContext();
  const zones = await loadServiceZones(env, claims);
  const t = await getTranslations("ops");

  return (
    <section data-ops-zones="1" style={sectionStyle}>
      <header>
        <h1 style={titleStyle}>{t("pricing.rateBook.zones-title")}</h1>
        <p style={subtitleStyle}>{t("pricing.rateBook.zones-subtitle")}</p>
      </header>
      <ServiceZonePanel zones={zones} />
    </section>
  );
}
