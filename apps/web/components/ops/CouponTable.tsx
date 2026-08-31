"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { deleteCoupon, setCouponActive } from "@/app/[locale]/(ops)/ops/coupons/actions";
import { Button } from "@/components/core";
import { Table, type TableColumn } from "@/components/data/Table";
import { Dialog } from "@/components/feedback/Dialog";
import { formatAmount } from "@/lib/currency";
import type { CouponRow } from "@/lib/ops/coupons";
import { CouponForm } from "./CouponForm";

type CouponTableRow = CouponRow & Record<string, unknown>;

function couponStatus(row: CouponRow, nowMs: number): "expired" | "paused" | "live" {
  if (row.validUntil && Date.parse(row.validUntil) < nowMs) return "expired";
  if (!row.active) return "paused";
  return "live";
}

function valueLabel(row: CouponRow): string {
  if (row.kind === "percent") {
    return row.percent == null ? "00 %" : `${row.percent} %`;
  }
  return formatAmount(row.amountRappen == null ? null : row.amountRappen / 100);
}

function limitLabel(row: CouponRow, unlimited: string): string {
  return row.globalLimit == null ? unlimited : String(row.globalLimit);
}

export function CouponTable({ rows }: { rows: CouponRow[] }) {
  const t = useTranslations("ops");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CouponRow | null>(null);
  const [deleting, setDeleting] = useState<CouponRow | null>(null);
  const nowMs = Date.now();

  const columns = useMemo<TableColumn<CouponTableRow>[]>(
    () => [
      {
        key: "code",
        header: t("coupons-col-code"),
        render: (row) => (
          <span
            className="vt-dir-keep"
            data-coupon-code={row.code}
            style={{ fontFamily: "var(--vt-font-mono, inherit)" }}
          >
            {row.code}
          </span>
        ),
      },
      {
        key: "value",
        header: t("coupons-col-value"),
        width: "150px",
        render: (row) => valueLabel(row),
      },
      {
        key: "uses",
        header: t("coupons-col-uses"),
        width: "128px",
        render: (row) => limitLabel(row, t("coupons-unlimited")),
      },
      {
        key: "expires",
        header: t("coupons-col-expires"),
        width: "150px",
        render: (row) =>
          row.validUntil ? (
            <span className="vt-dir-keep">{row.validUntil.slice(0, 10)}</span>
          ) : (
            t("coupons-no-end")
          ),
      },
      {
        key: "active",
        header: t("coupons-col-status"),
        width: "128px",
        render: (row) => {
          const status = couponStatus(row, nowMs);
          const color =
            status === "expired"
              ? "var(--vt-danger)"
              : status === "paused"
                ? "var(--vt-text-muted)"
                : "var(--vt-text-primary)";
          const label =
            status === "expired"
              ? t("coupons-expired")
              : status === "paused"
                ? t("coupons-paused")
                : t("coupons-live");
          return (
            <span data-coupon-status={status} style={{ color, fontWeight: "var(--vt-weight-semibold)" }}>
              {label}
            </span>
          );
        },
      },
      {
        key: "actions",
        header: t("edit"),
        width: "220px",
        render: (row) => (
          <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(row);
                setFormOpen(true);
              }}
            >
              {t("edit")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-testid={`coupons-toggle-${row.code}`}
              onClick={() => {
                startTransition(async () => {
                  await setCouponActive(row.id, !row.active);
                  router.refresh();
                });
              }}
            >
              {row.active ? t("coupons-deactivate") : t("coupons-activate")}
            </Button>
            <Button
              size="sm"
              variant="danger"
              data-testid={`coupons-delete-${row.code}`}
              onClick={() => setDeleting(row)}
            >
              {t("coupons-delete")}
            </Button>
          </span>
        ),
      },
    ],
    [nowMs, router, t],
  );

  const tableRows: CouponTableRow[] = rows.map((row) => ({ ...row }));

  return (
    <div data-testid="coupons-table">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBlockEnd: 12 }}>
        <Button
          data-testid="coupons-add"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          {t("coupons-add")}
        </Button>
      </div>
      <Table
        columns={columns}
        rows={tableRows}
        emptyMessage={
          <span data-testid="coupons-empty">
            {t("coupons-empty")}
            <span style={{ display: "block", color: "var(--vt-text-muted)", marginBlockStart: 4 }}>
              {t("coupons-empty-body")}
            </span>
          </span>
        }
      />
      {formOpen ? (
        <CouponForm
          key={editing?.id ?? "new"}
          open={formOpen}
          row={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            router.refresh();
          }}
        />
      ) : null}
      <Dialog
        open={deleting != null}
        title={t("coupons-delete")}
        closeLabel={t("coupons-close")}
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              {t("coupons-cancel")}
            </Button>
            <Button
              variant="danger"
              data-testid="coupons-delete-confirm"
              onClick={() => {
                if (!deleting) return;
                const id = deleting.id;
                startTransition(async () => {
                  await deleteCoupon(id);
                  setDeleting(null);
                  router.refresh();
                });
              }}
            >
              {t("coupons-delete")}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>{t("coupons-delete-body")}</p>
      </Dialog>
    </div>
  );
}
