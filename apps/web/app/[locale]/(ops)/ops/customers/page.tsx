import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getTranslations } from "next-intl/server";
import { CustomerTable } from "@/components/ops/CustomerTable";
import { loadCustomers } from "@/lib/ops/customers";
import { requireStaffClaims, type StaffAuthClient } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OpsCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const query = (await searchParams).q ?? "";
  const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
  const claims = await requireStaffClaims(supabase);
  const { env } = getCloudflareContext();
  const customers = await loadCustomers(env, claims, query);
  const t = await getTranslations("ops");

  return (
    <section data-page="ops-customers">
      <header style={{ marginBlockEnd: 24 }}>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--vt-font-display)",
            fontSize: "var(--vt-heading-2)",
            fontWeight: "var(--vt-weight-semibold)",
            letterSpacing: "var(--vt-heading-tracking)",
          }}
        >
          {t("customers")}
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: "var(--vt-body-xs)", color: "var(--vt-text-muted)" }}>
          {t("customers-subtitle")}
        </p>
      </header>
      <CustomerTable customers={customers} query={query} />
    </section>
  );
}
