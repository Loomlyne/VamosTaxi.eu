import { getTranslations } from "next-intl/server";
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";
import { Badge } from "@/components/core";
import { Alert } from "@/components/feedback";
import type { CustomerRow } from "@/lib/ops/customers";

const { Link } = createNavigation(routing);

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minInlineSize: 0 }}>
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
      <span style={{ fontSize: "var(--vt-body-md)", color: "var(--vt-text-primary)" }}>{value}</span>
    </div>
  );
}

export async function CustomerDetail({ customer }: { customer: CustomerRow }) {
  const t = await getTranslations("ops");

  return (
    <div data-customer-detail="1" data-redacted={customer.redacted ? "1" : undefined}>
      <p style={{ marginBlockEnd: 16 }}>
        <Link href="/ops/customers">{t("customers-back")}</Link>
      </p>
      <h1
        style={{
          margin: 0,
          fontFamily: "var(--vt-font-display)",
          fontSize: "var(--vt-heading-2)",
          fontWeight: "var(--vt-weight-semibold)",
          letterSpacing: "var(--vt-heading-tracking)",
        }}
      >
        {customer.fullName}
      </h1>
      {customer.redacted ? (
        <div style={{ marginBlockStart: 16 }}>
          <Alert tone="info" title={t("customers-redacted")} data-redacted-notice="1">
            {t("customers-redacted-notice")}
          </Alert>
        </div>
      ) : (
        <div
          style={{
            marginBlockStart: 20,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(212px, 1fr))",
            gap: 16,
          }}
        >
          <Field label={t("customers-field-name")} value={customer.fullName} />
          <Field label={t("email")} value={customer.email ?? t("customers-dash")} />
          <Field label={t("customers-field-phone")} value={customer.phone ?? t("customers-dash")} />
          <Field
            label={t("customers-field-type")}
            value={customer.type === "corporate" ? t("customers-type-corporate") : t("customers-type-private")}
          />
          <Field label={t("customers-field-company")} value={customer.company ?? t("customers-dash")} />
          <Field label={t("customers-field-since")} value={customer.since} />
          <Field label={t("customers-col-trips")} value={String(customer.tripCount)} />
          <Field label={t("customers-field-note")} value={customer.note ?? t("customers-dash")} />
          <div>
            <Badge tone={customer.type === "corporate" ? "inverse" : "neutral"}>
              {customer.type === "corporate" ? t("customers-type-corporate") : t("customers-type-private")}
            </Badge>
          </div>
        </div>
      )}
      {/* Phase 8 / OPS-01…05: the mock's Edit customer / Delete this customer
          controls stay read-only text until booking mutation ships (D-26). */}
    </div>
  );
}
