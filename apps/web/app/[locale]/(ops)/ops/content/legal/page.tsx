import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getTranslations } from "next-intl/server";
import { ContentCoverage } from "@/components/ops";
import "@/components/ops/ContentStringTable.css";
import { loadLegalCoverage } from "@/lib/ops/content";
import { requireStaffClaims, type StaffAuthClient } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OpsContentLegalPage() {
  const supabase = await createServerSupabaseClient();
  const claims = await requireStaffClaims(supabase as StaffAuthClient);
  const { env } = getCloudflareContext();
  const t = await getTranslations("ops");
  const docs = await loadLegalCoverage(env, claims);
  const titles = {
    terms: t("content-legal-terms"),
    privacy: t("content-legal-privacy"),
    cookies: t("content-legal-cookies"),
    imprint: t("content-legal-imprint"),
    cancellation: t("content-legal-cancellation"),
  };

  return (
    <section data-ops-content-legal="1">
      <header className="ops-content__header">
        <div>
          <h1>{t("content-legal-title")}</h1>
          <p>{t("content-legal-subtitle")}</p>
        </div>
      </header>
      <ContentCoverage
        seedNotice={t("content-legal-seed-notice")}
        totalLabel={(n) => t("content-legal-total", { n })}
        pendingLabel={(n) => t("content-legal-pending", { n })}
        completeLabel={t("content-legal-complete")}
        gapsLabel={(n) => t("content-legal-gaps", { n })}
        openLabel={t("content-legal-open")}
        docs={docs.map((doc) => ({
          ...doc,
          title: titles[doc.slug],
          href: `/ops/content?namespace=legal&q=${doc.slug}`,
        }))}
      />
    </section>
  );
}
