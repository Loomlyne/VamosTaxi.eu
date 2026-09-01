"use client";

import { Badge, Tag } from "@/components/core";
import type { BadgeTone } from "@/components/core";
import { Table } from "@/components/data/Table";
import { Alert } from "@/components/feedback/Alert";
import { Tabs } from "@/components/navigation/Tabs";
import type { CompletenessGap, RateVersionRow, RateVersionStatus } from "@/lib/ops/pricing";
import { CURRENCIES, useCurrency, type CurrencyCode } from "@/lib/currency-store";
import { useTranslations } from "next-intl";
import { useState } from "react";

export type PricingVersionListProps = {
  versions: RateVersionRow[];
  currentId: number | null;
  liveId: number | null;
  gaps: CompletenessGap[];
};

const TONES: Record<RateVersionStatus, BadgeTone> = {
  draft: "inverse",
  live: "outline",
  retired: "danger",
};

const MARKS: CurrencyCode[] = ["CHF", "EUR", "USD", "AED"];

const wrapStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
  minInlineSize: 0,
};

const metaStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  alignItems: "center",
  gap: 10,
  minInlineSize: 0,
};

const kickerStyle = {
  fontFamily: "var(--vt-font-body)",
  fontSize: "var(--vt-label-sm)",
  letterSpacing: "var(--vt-label-tracking)",
  textTransform: "uppercase" as const,
  fontWeight: "var(--vt-label-weight)",
  color: "var(--vt-text-muted)",
};

function statusKey(status: RateVersionStatus): "pricing.status-draft" | "pricing.status-live" | "pricing.status-retired" {
  if (status === "draft") return "pricing.status-draft";
  if (status === "live") return "pricing.status-live";
  return "pricing.status-retired";
}

export function PricingVersionList({ versions, currentId, liveId, gaps }: PricingVersionListProps) {
  const t = useTranslations("ops");
  const { currency, setCurrency, money } = useCurrency();
  const [tab, setTab] = useState("distance");
  const current = versions.find((row) => row.id === currentId) ?? versions[0] ?? null;
  const live = versions.find((row) => row.id === liveId) ?? null;

  const amountCell = (amount: number | null) => (
    <span data-tok data-ops-amount>
      {money(amount)}
    </span>
  );

  const distanceRows = gaps
    .filter((gap) => gap.kind === "distance_rate")
    .map((gap) => ({ id: gap.name, name: gap.name, base: null, perKm: null, min: null }));
  const surchargeRows = gaps
    .filter((gap) => gap.kind === "surcharge")
    .map((gap) => ({ id: gap.name, name: gap.name, amount: null }));
  const routeRows = gaps
    .filter((gap) => gap.kind === "fixed_route")
    .map((gap) => ({ id: gap.name, name: gap.name, price: null }));

  return (
    <div style={wrapStyle}>
      <Alert tone="inverse" title={t("pricing.placeholder-alert-title")}>
        {t("pricing.placeholder-alert-body")}
      </Alert>
      <div style={metaStyle}>
        {current ? (
          <>
            <span style={kickerStyle}>{t("pricing.editing", { label: current.label })}</span>
            <Badge tone={TONES[current.status]} data-ops-version-status={current.status}>
              {t(statusKey(current.status))}
            </Badge>
          </>
        ) : (
          <span style={kickerStyle}>{t("no-rate-versions-yet")}</span>
        )}
        {live ? (
          <Badge tone={TONES.live} data-ops-live-version={live.slug}>
            {t("pricing.live-version", { label: live.label })}
          </Badge>
        ) : (
          <Badge tone="outline" data-ops-live-version="">
            {t("pricing.no-live-version")}
          </Badge>
        )}
        <span style={{ ...kickerStyle, marginInlineStart: "auto" }}>{t("pricing.currency-label")}</span>
        {MARKS.map((code) => (
          <Tag
            key={code}
            active={currency === code}
            onClick={() => setCurrency(code)}
            data-vt-no-i18n="1"
          >
            {CURRENCIES[code].sym}
          </Tag>
        ))}
      </div>
      <Table
        rowKey="id"
        emptyMessage={t("no-rate-versions-yet")}
        columns={[
          { key: "slug", header: t("pricing.col-slug") },
          { key: "label", header: t("pricing.col-label") },
          {
            key: "status",
            header: t("pricing.col-status"),
            render: (row) => (
              <Badge tone={TONES[row.status as RateVersionStatus]} data-ops-version-status={row.status}>
                {t(statusKey(row.status as RateVersionStatus))}
              </Badge>
            ),
          },
        ]}
        rows={versions.map((row) => ({
          id: row.id,
          slug: row.slug,
          label: row.label,
          status: row.status,
        }))}
      />
      <Tabs
        variant="underline"
        value={tab}
        onChange={setTab}
        items={[
          { value: "distance", label: t("pricing.tab-distance") },
          { value: "routes", label: t("pricing.tab-routes") },
          { value: "surcharges", label: t("pricing.tab-surcharges") },
        ]}
      />
      {tab === "distance" ? (
        <Table
          rowKey="id"
          emptyMessage={t("pricing.gap-none")}
          columns={[
            { key: "name", header: t("pricing.col-class") },
            { key: "base", header: t("pricing.col-base"), align: "right", render: (row) => amountCell(row.base as number | null) },
            { key: "perKm", header: t("pricing.col-per-km"), align: "right", render: (row) => amountCell(row.perKm as number | null) },
            { key: "min", header: t("pricing.col-min"), align: "right", render: (row) => amountCell(row.min as number | null) },
          ]}
          rows={distanceRows}
        />
      ) : null}
      {tab === "routes" ? (
        <Table
          rowKey="id"
          emptyMessage={t("pricing.empty-routes")}
          columns={[
            { key: "name", header: t("pricing.col-route") },
            { key: "price", header: t("pricing.col-price"), align: "right", render: (row) => amountCell(row.price as number | null) },
          ]}
          rows={routeRows}
        />
      ) : null}
      {tab === "surcharges" ? (
        <Table
          rowKey="id"
          emptyMessage={t("pricing.gap-none")}
          columns={[
            { key: "name", header: t("pricing.col-code") },
            { key: "amount", header: t("pricing.col-amount"), align: "right", render: (row) => amountCell(row.amount as number | null) },
          ]}
          rows={surchargeRows}
        />
      ) : null}
    </div>
  );
}
