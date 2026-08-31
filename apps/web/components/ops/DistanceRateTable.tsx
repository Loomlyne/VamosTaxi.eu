"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  deleteDistanceRate,
  setDistanceRateAvailable,
  upsertDistanceRate,
  type RateBookActionResult,
} from "@/app/[locale]/(ops)/ops/pricing/[versionId]/actions";
import { Button } from "@/components/core";
import { Table, type TableColumn } from "@/components/data/Table";
import { Dialog } from "@/components/feedback/Dialog";
import { Counter } from "@/components/forms/Counter";
import { Input } from "@/components/forms/Input";
import { Select } from "@/components/forms/Select";
import { Switch } from "@/components/forms/Switch";
import { formatAmount } from "@/lib/currency";
import type { DistanceRateRow, RateVersionStatus, VehicleClassOption } from "@/lib/ops/rate-book";
import { vehicleClassLabelKey } from "@/lib/ops/rate-book";

type TableRow = DistanceRateRow & Record<string, unknown>;

function parseRappen(raw: string): number | null {
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

function ClassCell({ slug }: { slug: string }) {
  const key = vehicleClassLabelKey(slug);
  if (!key) {
    return (
      <span data-tok data-class-missing={slug}>
        {slug}
      </span>
    );
  }
  return (
    <span data-vt-no-i18n="1" data-class-key={key}>
      {slug}
    </span>
  );
}

function unpriced(row: DistanceRateRow): boolean {
  return row.baseFareRappen == null || row.perKmRappen == null || row.minFareRappen == null;
}

export function DistanceRateTable({
  versionId,
  status,
  rows,
  classes,
}: {
  versionId: number;
  status: RateVersionStatus;
  rows: DistanceRateRow[];
  classes: VehicleClassOption[];
}) {
  const t = useTranslations("ops");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const frozen = status !== "draft";
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DistanceRateRow | null>(null);
  const [vehicleClassId, setVehicleClassId] = useState(classes[0]?.id ?? "");
  const [baseFare, setBaseFare] = useState("");
  const [perKm, setPerKm] = useState("");
  const [minFare, setMinFare] = useState("");
  const [maxPax, setMaxPax] = useState(3);
  const [available, setAvailable] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [pending, startPending] = useTransition();

  const classOptions = useMemo(
    () => classes.map((row) => ({ value: row.id, label: row.slug })),
    [classes],
  );

  const openCreate = () => {
    setEditing(null);
    setVehicleClassId(classes[0]?.id ?? "");
    setBaseFare("");
    setPerKm("");
    setMinFare("");
    setMaxPax(3);
    setAvailable(true);
    setErrorKey(null);
    setFormOpen(true);
  };

  const openEdit = (row: DistanceRateRow) => {
    setEditing(row);
    setVehicleClassId(row.vehicleClassId);
    setBaseFare("");
    setPerKm("");
    setMinFare("");
    setMaxPax(row.maxPax);
    setAvailable(row.available);
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
      const result: RateBookActionResult = await upsertDistanceRate(versionId, editing?.id ?? null, {
        vehicleClassId,
        baseFareRappen: parseRappen(baseFare),
        perKmRappen: parseRappen(perKm),
        minFareRappen: parseRappen(minFare),
        maxPax,
        available,
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
        key: "class",
        header: t("pricing.col-class"),
        render: (row) => <ClassCell slug={row.vehicleClassSlug} />,
      },
      {
        key: "base",
        header: t("pricing.col-base"),
        align: "right",
        render: (row) => amountCell(row.baseFareRappen),
      },
      {
        key: "perKm",
        header: t("pricing.col-per-km"),
        align: "right",
        render: (row) => amountCell(row.perKmRappen),
      },
      {
        key: "min",
        header: t("pricing.col-min"),
        align: "right",
        render: (row) => amountCell(row.minFareRappen),
      },
      {
        key: "maxPax",
        header: t("pricing.rateBook.col-max-pax"),
        align: "right",
        render: (row) => row.maxPax,
      },
      {
        key: "available",
        header: t("pricing.rateBook.col-available"),
        render: (row) => (
          <Switch
            checked={row.available}
            label={t("pricing.rateBook.col-available")}
            onChange={(event) => {
              const next = event.currentTarget.checked;
              startTransition(async () => {
                await setDistanceRateAvailable(versionId, row.id, next);
                router.refresh();
              });
            }}
          />
        ),
      },
      {
        key: "state",
        header: t("pricing.col-status"),
        render: (row) =>
          unpriced(row) ? (
            <span className="vt-rate-book__unpriced" data-ops-unpriced="1">
              {t("pricing.rateBook.unpriced")}
            </span>
          ) : null,
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
                  await deleteDistanceRate(versionId, row.id);
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
    [frozen, router, t, versionId],
  );

  return (
    <div>
      <div className="vt-rate-book__toolbar">
        <p className="vt-rate-book__hint">{t("pricing.rateBook.available-hint")}</p>
        <Button size="sm" disabled={frozen} onClick={openCreate} data-ops-add-distance>
          {t("pricing.rateBook.add-distance")}
        </Button>
      </div>
      <Table
        rowKey="id"
        emptyMessage={t("pricing.rateBook.empty-distance")}
        columns={columns}
        rows={rows as TableRow[]}
      />
      <Dialog
        open={formOpen}
        title={editing ? t("pricing.rateBook.edit") : t("pricing.rateBook.add-distance")}
        closeLabel={t("pricing.rateBook.cancel")}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={pending}>
              {t("pricing.rateBook.cancel")}
            </Button>
            <Button onClick={submit} disabled={pending || frozen} data-ops-save-distance>
              {t("pricing.rateBook.save")}
            </Button>
          </>
        }
      >
        <div className="vt-rate-book__form">
          {errorKey ? <p className="vt-rate-book__error">{messageFor(errorKey)}</p> : null}
          <Select
            label={t("pricing.col-class")}
            options={classOptions}
            value={vehicleClassId}
            disabled={frozen}
            onChange={(event) => setVehicleClassId(event.currentTarget.value)}
          />
          <Counter
            label={t("pricing.rateBook.col-max-pax")}
            value={maxPax}
            min={1}
            max={16}
            disabled={frozen}
            onChange={setMaxPax}
          />
          <Input
            label={t("pricing.col-base")}
            type="number"
            inputMode="numeric"
            value={baseFare}
            disabled={frozen}
            onChange={(event) => setBaseFare(event.currentTarget.value)}
            data-ops-rappen="base"
          />
          <Input
            label={t("pricing.col-per-km")}
            type="number"
            inputMode="numeric"
            value={perKm}
            disabled={frozen}
            onChange={(event) => setPerKm(event.currentTarget.value)}
            data-ops-rappen="per-km"
          />
          <Input
            label={t("pricing.col-min")}
            type="number"
            inputMode="numeric"
            value={minFare}
            disabled={frozen}
            onChange={(event) => setMinFare(event.currentTarget.value)}
            data-ops-rappen="min"
          />
          <Switch
            checked={available}
            disabled={false}
            label={t("pricing.rateBook.col-available")}
            onChange={(event) => setAvailable(event.currentTarget.checked)}
          />
        </div>
      </Dialog>
    </div>
  );
}
