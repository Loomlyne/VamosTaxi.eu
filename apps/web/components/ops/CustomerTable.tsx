import { getTranslations } from "next-intl/server";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { Badge, Button } from "@/components/core";
import { Table } from "@/components/data";
import type { TableColumn } from "@/components/data";
import type { CustomerRow } from "@/lib/ops/customers";

const { Link } = createNavigation(routing);

type Row = CustomerRow & Record<string, unknown>;

export async function CustomerTable({
  customers,
  query,
}: {
  customers: CustomerRow[];
  query: string;
}) {
  const t = await getTranslations("ops");
  const rows = customers as Row[];

  const columns: TableColumn<Row>[] = [
    {
      key: "fullName",
      header: t("customers-col-name"),
      render: (row) => (
        <Link href={`/ops/customers/${row.id}`} data-customer-id={row.id}>
          <span>{row.fullName}</span>
          {row.redacted ? (
            <span style={{ display: "block", fontSize: "var(--vt-body-xs)", color: "var(--vt-text-muted)" }}>
              {t("customers-redacted")}
            </span>
          ) : row.email ? (
            <span style={{ display: "block", fontSize: "var(--vt-body-xs)", color: "var(--vt-text-muted)" }}>
              {row.email}
            </span>
          ) : null}
        </Link>
      ),
    },
    {
      key: "phone",
      header: t("customers-col-phone"),
      width: "170px",
      render: (row) => (row.redacted ? t("customers-dash") : (row.phone || t("customers-dash"))),
    },
    {
      key: "company",
      header: t("customers-col-company"),
      width: "190px",
      render: (row) => (row.redacted ? t("customers-dash") : (row.company || t("customers-dash"))),
    },
    {
      key: "tripCount",
      header: t("customers-col-trips"),
      width: "92px",
      align: "right",
      render: (row) => String(row.tripCount),
    },
    {
      key: "type",
      header: t("customers-col-type"),
      width: "130px",
      render: (row) => (
        <Badge tone={row.type === "corporate" ? "inverse" : "neutral"}>
          {row.type === "corporate" ? t("customers-type-corporate") : t("customers-type-private")}
        </Badge>
      ),
    },
  ];

  return (
    <div data-customers-table="1">
      {/* Phase 8 / OPS-01…05: the mock's Add customer control is deferred. This
          screen is read-only (D-26) — no create, edit or delete affordance. */}
      <form method="GET" action="" style={{ marginBlockEnd: 16, display: "flex", flexWrap: "wrap", gap: 10 }}>
        <label style={{ flex: "1 1 240px", minInlineSize: 0 }}>
          <input
            type="search"
            name="q"
            defaultValue={query}
            aria-label={t("customers-search")}
            placeholder={t("customers-search")}
            style={{
              inlineSize: "100%",
              paddingBlock: 10,
              paddingInline: 12,
              border: "1px solid var(--vt-border-subtle)",
              borderRadius: "var(--vt-radius-md)",
              background: "var(--vt-bg-surface)",
              color: "var(--vt-text-primary)",
              fontSize: "var(--vt-body-md)",
            }}
          />
        </label>
        <Button type="submit" variant="secondary" size="sm">
          {t("customers-search-submit")}
        </Button>
      </form>
      <Table
        columns={columns}
        rows={rows}
        emptyMessage={
          <span data-customers-empty="1">
            <strong style={{ display: "block" }}>{t("customers-empty")}</strong>
            <span>{t("customers-empty-body")}</span>
          </span>
        }
      />
    </div>
  );
}
