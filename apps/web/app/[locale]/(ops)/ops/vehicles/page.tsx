import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getTranslations } from "next-intl/server";
import { VehicleClassPanel, VehicleFleetTabs, VehicleTable } from "@/components/ops";
import { loadVehicleClasses, loadVehicles } from "@/lib/ops/fleet";
import { requireStaffClaims, type StaffAuthClient } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OpsVehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const query = await searchParams;
  const tab = query.tab === "classes" ? "classes" : "vehicles";
  const t = await getTranslations("ops");
  const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
  const claims = await requireStaffClaims(supabase);
  const { env } = getCloudflareContext();
  const [vehicles, classes] = await Promise.all([
    loadVehicles(env, claims),
    loadVehicleClasses(env, claims),
  ]);

  const inService = vehicles.filter((row) => row.status === "service").length;
  const largest = vehicles.reduce((max, row) => (row.seats > max ? row.seats : max), 0);

  return (
    <section data-page="ops-vehicles">
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
            {t("vehicles")}
          </h1>
          <p
            style={{
              marginBlockStart: 4,
              marginBlockEnd: 0,
              fontSize: "var(--vt-body-xs)",
              color: "var(--vt-text-muted)",
            }}
          >
            {t("fleet-subtitle")}
          </p>
        </div>
        <div style={{ marginInlineStart: "auto" }}>
          <VehicleFleetTabs value={tab} />
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
        {tab === "vehicles" ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(212px, 1fr))",
                gap: 16,
              }}
            >
              <CountTile
                label={t("fleet-count-all")}
                value={String(vehicles.length)}
                foot={t("fleet-foot-all")}
              />
              <CountTile
                label={t("fleet-count-service")}
                value={String(inService)}
                foot={t("fleet-foot-service")}
              />
              <CountTile
                label={t("fleet-count-seats")}
                value={String(largest)}
                foot={t("fleet-foot-seats")}
              />
            </div>
            <VehicleTable rows={vehicles} classes={classes} />
            <p
              style={{
                margin: 0,
                maxInlineSize: "78ch",
                fontSize: "var(--vt-body-xs)",
                lineHeight: 1.6,
                color: "var(--vt-text-muted)",
              }}
            >
              {t("fleet-note")}
            </p>
          </>
        ) : (
          <VehicleClassPanel classes={classes} />
        )}
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
