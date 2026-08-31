"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/core";
import { useCurrency } from "@/lib/currency-store";
import type { CompletenessGap, CompletenessKind } from "@/lib/ops/pricing";

export type PricingCompletenessProps = {
  gaps: CompletenessGap[];
};

const KIND_ORDER: CompletenessKind[] = ["distance_rate", "surcharge", "fixed_route"];

const KIND_KEY: Record<CompletenessKind, "pricing.gap-distance" | "pricing.gap-surcharge" | "pricing.gap-route"> = {
  distance_rate: "pricing.gap-distance",
  surcharge: "pricing.gap-surcharge",
  fixed_route: "pricing.gap-route",
};

const listStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 8,
  minInlineSize: 0,
};

const rowStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 8,
  minInlineSize: 0,
};

const summaryStyle = {
  cursor: "pointer",
  fontFamily: "var(--vt-font-body)",
  fontSize: "var(--vt-body-sm)",
  fontWeight: "var(--vt-weight-semibold)",
};

const itemStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  fontFamily: "var(--vt-font-body)",
  fontSize: "var(--vt-body-sm)",
};

export function PricingCompleteness({ gaps }: PricingCompletenessProps) {
  const t = useTranslations("ops");
  const { money } = useCurrency();
  const [open, setOpen] = useState<CompletenessKind | null>(KIND_ORDER.find((kind) => gaps.some((gap) => gap.kind === kind)) ?? null);

  return (
    <Card padding="lg" data-ops-completeness="1">
      <div style={listStyle}>
        <strong style={{ fontFamily: "var(--vt-font-display)", fontSize: "var(--vt-heading-4)" }}>
          {t("pricing.completeness-title")}
        </strong>
        {KIND_ORDER.map((kind) => {
          const rows = gaps.filter((gap) => gap.kind === kind);
          const count = rows.length;
          return (
            <div key={kind} style={rowStyle} data-ops-gap-kind={kind} data-ops-gap-count={count}>
              <button
                type="button"
                style={{ ...summaryStyle, textAlign: "start", background: "none", border: 0, padding: 0, color: "inherit" }}
                aria-expanded={open === kind}
                onClick={() => setOpen(open === kind ? null : kind)}
              >
                {t(KIND_KEY[kind], { count })}
              </button>
              {open === kind
                ? rows.map((row) => (
                    <div key={row.name} style={itemStyle} data-ops-gap-name={row.name}>
                      <span>{row.name}</span>
                      <span data-tok data-ops-amount>
                        {money(null)}
                      </span>
                    </div>
                  ))
                : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
