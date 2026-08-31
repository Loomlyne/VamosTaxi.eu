import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getTranslations } from "next-intl/server";
import { ChauffeurTable } from "@/components/ops";
import { loadChauffeur, loadChauffeurs } from "@/lib/ops/chauffeurs";
import { loadVehicleOptions } from "@/lib/ops/fleet";
import { requireStaffClaims, type StaffAuthClient } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OpsChauffeursPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const query = await searchParams;
  const selectedId = typeof query.id === "string" && query.id.length > 0 ? query.id : null;
  const t = await getTranslations("ops");
  const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
  const claims = await requireStaffClaims(supabase);
  const { env } = getCloudflareContext();
  const [chauffeurs, vehicles, selected] = await Promise.all([
    loadChauffeurs(env, claims),
    loadVehicleOptions(env, claims),
    selectedId ? loadChauffeur(env, claims, selectedId) : Promise.resolve(null),
  ]);

  const onShift = chauffeurs.filter((row) => row.active && row.status === "shift").length;
  const paired = chauffeurs.filter((row) => row.defaultVehicleId != null).length;

  return (
    <section data-page="ops-chauffeurs">
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
            {t("chauffeurs")}
          </h1>
          <p
            style={{
              marginBlockStart: 4,
              marginBlockEnd: 0,
              fontSize: "var(--vt-body-xs)",
              color: "var(--vt-text-muted)",
            }}
          >
            {t("chauffeurs-subtitle")}
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
          <CountTile
            label={t("chauffeurs-count-all")}
            value={String(chauffeurs.length)}
            foot={t("chauffeurs-foot-all")}
          />
          <CountTile
            label={t("chauffeurs-count-shift")}
            value={String(onShift)}
            foot={t("chauffeurs-foot-shift")}
          />
          <CountTile
            label={t("chauffeurs-count-paired")}
            value={String(paired)}
            foot={t("chauffeurs-foot-paired")}
          />
        </div>
        <ChauffeurTable
          key={selected?.id ?? "list"}
          rows={chauffeurs}
          vehicles={vehicles}
          selected={selected}
        />
        <p
          style={{
            margin: 0,
            maxInlineSize: "78ch",
            fontSize: "var(--vt-body-xs)",
            lineHeight: 1.6,
            color: "var(--vt-text-muted)",
          }}
        >
          {t("chauffeurs-note")}
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
