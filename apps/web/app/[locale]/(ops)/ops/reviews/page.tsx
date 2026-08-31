import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getTranslations } from "next-intl/server";
import { ReviewTable } from "@/components/ops";
import { asStaff } from "@/lib/db/identity";
import { loadReviews } from "@/lib/ops/reviews";
import { requireStaffClaims, type StaffAuthClient } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OpsReviewsPage() {
  const t = await getTranslations("ops");
  const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
  const claims = await requireStaffClaims(supabase);
  const { env } = getCloudflareContext();
  const rows = await loadReviews(env, claims);
  const classOptions = await asStaff<{ id: string; slug: string }[]>(
    env,
    claims,
    async (sql): Promise<{ id: string; slug: string }[]> => {
      const list = await sql<{ id: string; slug: string }[]>`
        select id, slug from public.vehicle_classes order by slug
      `;
      return Array.isArray(list) ? list : [];
    },
  );

  const published = rows.filter((row) => row.published).length;
  const hidden = rows.length - published;

  return (
    <section data-page="ops-reviews">
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "14px 22px",
          paddingBlockEnd: 18,
          borderBlockEnd: "1px solid var(--vt-border-subtle)",
        }}
      >
        <div style={{ minInlineSize: 0 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--vt-font-display)",
              fontSize: "var(--vt-heading-2)",
              fontWeight: "var(--vt-weight-semibold)",
              letterSpacing: "var(--vt-heading-tracking)",
            }}
          >
            {t("reviews")}
          </h1>
          <p
            style={{
              marginBlockStart: 4,
              marginBlockEnd: 0,
              fontSize: "var(--vt-body-xs)",
              color: "var(--vt-text-muted)",
            }}
          >
            {t("reviews-subtitle")}
          </p>
        </div>
      </header>

      <div
        style={{
          paddingBlock: "26px 48px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          minInlineSize: 0,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <span data-chip="1">
            {t("reviews-published-count", { count: published })}
          </span>
          <span data-chip="1">{t("reviews-hidden-count", { count: hidden })}</span>
          <p
            style={{
              flex: "1 1 260px",
              minInlineSize: 0,
              margin: 0,
              fontSize: "var(--vt-body-xs)",
              color: "var(--vt-text-muted)",
            }}
          >
            {t("reviews-order-note")}
          </p>
        </div>

        <ReviewTable rows={rows} classOptions={classOptions} />
      </div>
    </section>
  );
}
