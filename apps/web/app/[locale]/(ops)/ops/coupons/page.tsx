import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getTranslations } from "next-intl/server";
import { CouponTable } from "@/components/ops";
import { loadCoupons } from "@/lib/ops/coupons";
import { requireStaffClaims, type StaffAuthClient } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OpsCouponsPage() {
  const t = await getTranslations("ops");
  const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
  const claims = await requireStaffClaims(supabase);
  const { env } = getCloudflareContext();
  const rows = await loadCoupons(env, claims);

  const live = rows.filter((row) => row.active).length;

  return (
    <section data-page="ops-coupons">
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
            {t("coupons")}
          </h1>
          <p
            style={{
              marginBlockStart: 4,
              marginBlockEnd: 0,
              fontSize: "var(--vt-body-xs)",
              color: "var(--vt-text-muted)",
            }}
          >
            {t("coupons-subtitle")}
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(212px, 1fr))",
            gap: 16,
          }}
        >
          <CountTile label={t("coupons-count-all")} value={String(rows.length)} foot={t("coupons-foot-all")} />
          <CountTile label={t("coupons-count-live")} value={String(live)} foot={t("coupons-foot-live")} />
        </div>

        <CouponTable rows={rows} />

        <p
          style={{
            margin: 0,
            maxInlineSize: "78ch",
            fontSize: "var(--vt-body-xs)",
            lineHeight: 1.6,
            color: "var(--vt-text-muted)",
          }}
        >
          {t("coupons-note")}
        </p>
      </div>
    </section>
  );
}

function CountTile({ label, value, foot }: { label: string; value: string; foot: string }) {
  return (
    <div
      style={{
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minBlockSize: 120,
        padding: "18px 20px",
        background: "var(--vt-bg-surface)",
        border: "1px solid var(--vt-border-subtle)",
        borderRadius: "var(--vt-radius-lg)",
      }}
    >
      <span
        style={{
          fontSize: "var(--vt-label-sm)",
          letterSpacing: "var(--vt-label-tracking)",
          textTransform: "uppercase",
          fontWeight: "var(--vt-label-weight)",
          color: "var(--vt-text-muted)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--vt-font-display)",
          fontSize: "var(--vt-figure-lg)",
          fontWeight: "var(--vt-weight-bold)",
          lineHeight: 1,
          color: "var(--vt-text-primary)",
        }}
      >
        {value}
      </span>
      <span
        style={{
          marginBlockStart: "auto",
          fontSize: "var(--vt-body-xs)",
          lineHeight: 1.45,
          color: "var(--vt-text-muted)",
        }}
      >
        {foot}
      </span>
    </div>
  );
}
