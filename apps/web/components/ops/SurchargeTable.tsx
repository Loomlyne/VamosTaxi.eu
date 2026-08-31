"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  deleteSurcharge,
  setSurchargeActive,
  upsertSurcharge,
  type RateBookActionResult,
} from "@/app/[locale]/(ops)/ops/pricing/[versionId]/actions";
import { Button } from "@/components/core";
import { Table, type TableColumn } from "@/components/data/Table";
import { Dialog } from "@/components/feedback/Dialog";
import { Input } from "@/components/forms/Input";
import { Select } from "@/components/forms/Select";
import { Switch } from "@/components/forms/Switch";
import { formatAmount } from "@/lib/currency";
import { SURCHARGE_CODES, type SurchargeCode } from "@/lib/ops/surcharge-codes";
import type {
  RateVersionStatus,
  SurchargeAppliesTo,
  SurchargeKind,
  SurchargeRow,
} from "@/lib/ops/rate-book";

const RULE_GAPS = { start: "—", end: "—", minutes: "—", step: "—" };

function surchargeLabel(code: SurchargeCode, tPrice: (key: string) => string): string {
  switch (code) {
    case "airport_pickup":
      return tPrice("surcharge.airport_pickup.label");
    case "night":
      return tPrice("surcharge.night.label");
    case "waiting_airport":
      return tPrice("surcharge.waiting_airport.label");
    case "waiting_city":
      return tPrice("surcharge.waiting_city.label");
    case "extra_stop":
      return tPrice("surcharge.extra_stop.label");
    case "child_seat":
      return tPrice("surcharge.child_seat.label");
    case "meet_greet":
      return tPrice("surcharge.meet_greet.label");
    case "ski_rack":
      return tPrice("surcharge.ski_rack.label");
  }
}

function surchargeRule(
  code: SurchargeCode,
  tPrice: (key: string, values?: typeof RULE_GAPS) => string,
): string {
  switch (code) {
    case "airport_pickup":
      return tPrice("surcharge.airport_pickup.rule");
    case "night":
      return tPrice("surcharge.night.rule", RULE_GAPS);
    case "waiting_airport":
      return tPrice("surcharge.waiting_airport.rule", RULE_GAPS);
    case "waiting_city":
      return tPrice("surcharge.waiting_city.rule", RULE_GAPS);
    case "extra_stop":
      return tPrice("surcharge.extra_stop.rule");
    case "child_seat":
      return tPrice("surcharge.child_seat.rule");
    case "meet_greet":
      return tPrice("surcharge.meet_greet.rule");
    case "ski_rack":
      return tPrice("surcharge.ski_rack.rule");
  }
}

function kindLabel(kind: SurchargeKind, t: (key: string) => string): string {
  if (kind === "amount") return t("pricing.rateBook.kind-amount");
  if (kind === "percent") return t("pricing.rateBook.kind-percent");
  return t("pricing.rateBook.kind-included");
}

function appliesLabel(applies: SurchargeAppliesTo, t: (key: string) => string): string {
  return applies === "booking"
    ? t("pricing.rateBook.applies-booking")
    : t("pricing.rateBook.applies-leg");
}

type TableRow = SurchargeRow & Record<string, unknown>;

function parseRappen(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  return Number(trimmed);
}

function parsePercent(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  return Number(trimmed);
}

function amountCell(rappen: number | null) {
  return (
    <span data-tok data-ops-amount>
      {formatAmount(rappen)}
    </span>
  );
}

export function SurchargeTable({
  versionId,
  status,
  rows,
}: {
  versionId: number;
  status: RateVersionStatus;
  rows: SurchargeRow[];
}) {
  const tPrice = useTranslations("price");
  const t = useTranslations("ops");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const frozen = status !== "draft";
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SurchargeRow | null>(null);
  const [code, setCode] = useState<string>(SURCHARGE_CODES[0]);
  const [kind, setKind] = useState<SurchargeKind>("amount");
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState("");
  const [appliesTo, setAppliesTo] = useState<"leg" | "booking">("leg");
  const [active, setActive] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [pending, startPending] = useTransition();

  const codeOptions = useMemo(
    () => SURCHARGE_CODES.map((value) => ({ value, label: value })),
    [],
  );
  const kindOptions = useMemo(
    () => [
      { value: "amount", label: t("pricing.rateBook.kind-amount") },
      { value: "percent", label: t("pricing.rateBook.kind-percent") },
      { value: "included", label: t("pricing.rateBook.kind-included") },
    ],
    [t],
  );
  const appliesOptions = useMemo(
    () => [
      { value: "leg", label: t("pricing.rateBook.applies-leg") },
      { value: "booking", label: t("pricing.rateBook.applies-booking") },
    ],
    [t],
  );

  const selectKind = (next: SurchargeKind) => {
    setKind(next);
    if (next === "percent") setAmount("");
    else if (next === "amount") setPercent("");
    else {
      setAmount("");
      setPercent("");
    }
  };

  const openCreate = () => {
    setEditing(null);
    setCode(SURCHARGE_CODES[0]);
    setKind("amount");
    setAmount("");
    setPercent("");
    setAppliesTo("leg");
    setActive(true);
    setErrorKey(null);
    setFormOpen(true);
  };

  const openEdit = (row: SurchargeRow) => {
    setEditing(row);
    setCode(row.code);
    setKind(row.kind);
    setAmount("");
    setPercent(row.percent == null ? "" : String(row.percent));
    setAppliesTo(row.appliesTo);
    setActive(row.active);
    setErrorKey(null);
    setFormOpen(true);
  };

  const messageFor = (key: string): string => {
    try {
      return t(key);
    } catch {
      return t("pricing.rateBook.failure-unknown");
    }
  };

  const submit = () => {
    startPending(async () => {
      setErrorKey(null);
      const result: RateBookActionResult = await upsertSurcharge(versionId, editing?.id ?? null, {
        code,
        kind,
        amountRappen: kind === "amount" ? parseRappen(amount) : null,
        percent: kind === "percent" ? parsePercent(percent) : null,
        appliesTo,
        active,
      });
      if (!result.ok) {
        setErrorKey(result.key);
        return;
      }
      setFormOpen(false);
      router.refresh();
    });
  };

  const columns = useMemo<TableColumn<TableRow>[]>(
    () => [
      {
        key: "code",
        header: t("pricing.col-code"),
        render: (row) => (
          <span className="vt-dir-keep" data-vt-no-i18n="1" data-surcharge-code={row.code}>
            {row.code}
          </span>
        ),
      },
      {
        key: "label",
        header: t("pricing.rateBook.col-label"),
        render: (row) => surchargeLabel(row.code, tPrice),
      },
      {
        key: "rule",
        header: t("pricing.rateBook.col-rule"),
        render: (row) => surchargeRule(row.code, tPrice),
      },
      {
        key: "kind",
        header: t("pricing.rateBook.col-kind"),
        render: (row) => kindLabel(row.kind, t),
      },
      {
        key: "amount",
        header: t("pricing.col-amount"),
        align: "right",
        render: (row) =>
          row.kind === "percent"
            ? row.percent == null
              ? t("pricing.rateBook.unpriced")
              : `${row.percent} %`
            : amountCell(row.amountRappen),
      },
      {
        key: "applies",
        header: t("pricing.rateBook.col-applies"),
        render: (row) => appliesLabel(row.appliesTo, t),
      },
      {
        key: "active",
        header: t("pricing.rateBook.col-active"),
        render: (row) => (
          <Switch
            checked={row.active}
            label={t("pricing.rateBook.col-active")}
            onChange={(event) => {
              const next = event.currentTarget.checked;
              startTransition(async () => {
                await setSurchargeActive(versionId, row.id, next);
                router.refresh();
              });
            }}
          />
        ),
      },
      {
        key: "actions",
        header: t("pricing.rateBook.edit"),
        render: (row) => (
          <span className="vt-rate-book__actions">
            <Button size="sm" variant="ghost" disabled={frozen} onClick={() => openEdit(row)}>
              {t("pricing.rateBook.edit")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={frozen}
              onClick={() => {
                startTransition(async () => {
                  await deleteSurcharge(versionId, row.id);
                  router.refresh();
                });
              }}
            >
              {t("pricing.rateBook.delete")}
            </Button>
          </span>
        ),
      },
    ],
    [frozen, router, t, tPrice, versionId],
  );

  const amountDisabled = frozen || kind !== "amount";
  const percentDisabled = frozen || kind !== "percent";

  return (
    <div>
      <div className="vt-rate-book__toolbar">
        <p className="vt-rate-book__hint">{t("pricing.rateBook.available-hint")}</p>
        <Button size="sm" disabled={frozen} onClick={openCreate} data-ops-add-surcharge>
          {t("pricing.rateBook.add-surcharge")}
        </Button>
      </div>
      <Table
        rowKey="id"
        emptyMessage={t("pricing.rateBook.empty-surcharges")}
        columns={columns}
        rows={rows as TableRow[]}
      />
      <Dialog
        open={formOpen}
        title={editing ? t("pricing.rateBook.edit") : t("pricing.rateBook.add-surcharge")}
        closeLabel={t("pricing.rateBook.cancel")}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={pending}>
              {t("pricing.rateBook.cancel")}
            </Button>
            <Button onClick={submit} disabled={pending || frozen} data-ops-save-surcharge>
              {t("pricing.rateBook.save")}
            </Button>
          </>
        }
      >
        <div className="vt-rate-book__form">
          {errorKey ? <p className="vt-rate-book__error">{messageFor(errorKey)}</p> : null}
          <Select
            label={t("pricing.col-code")}
            options={codeOptions}
            value={code}
            disabled={frozen}
            onChange={(event) => setCode(event.currentTarget.value)}
          />
          <Select
            label={t("pricing.rateBook.col-kind")}
            options={kindOptions}
            value={kind}
            disabled={frozen}
            onChange={(event) => {
              const next = event.currentTarget.value;
              if (next === "amount" || next === "percent" || next === "included") selectKind(next);
            }}
          />
          <Input
            label={t("pricing.col-amount")}
            type="number"
            inputMode="numeric"
            value={kind === "amount" ? amount : ""}
            disabled={amountDisabled}
            onChange={(event) => setAmount(event.currentTarget.value)}
            data-ops-rappen="surcharge"
          />
          <Input
            label={t("pricing.rateBook.col-percent")}
            type="number"
            inputMode="decimal"
            value={kind === "percent" ? percent : ""}
            disabled={percentDisabled}
            onChange={(event) => setPercent(event.currentTarget.value)}
          />
          <Select
            label={t("pricing.rateBook.col-applies")}
            options={appliesOptions}
            value={appliesTo}
            disabled={frozen}
            onChange={(event) =>
              setAppliesTo(event.currentTarget.value === "booking" ? "booking" : "leg")
            }
          />
          <Switch
            checked={active}
            label={t("pricing.rateBook.col-active")}
            onChange={(event) => setActive(event.currentTarget.checked)}
          />
        </div>
      </Dialog>
    </div>
  );
}
