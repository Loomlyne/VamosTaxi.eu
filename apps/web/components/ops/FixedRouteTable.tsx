"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  deleteFixedRoute,
  setFixedRouteLive,
  upsertFixedRoute,
  type RateBookActionResult,
} from "@/app/[locale]/(ops)/ops/pricing/[versionId]/actions";
import { Button } from "@/components/core";
import { Table, type TableColumn } from "@/components/data/Table";
import { Dialog } from "@/components/feedback/Dialog";
import { Input } from "@/components/forms/Input";
import { Select } from "@/components/forms/Select";
import { Switch } from "@/components/forms/Switch";
import { formatAmount } from "@/lib/currency";
import type {
  FixedRouteRow,
  RateVersionStatus,
  ServiceZoneRow,
  VehicleClassOption,
} from "@/lib/ops/rate-book";
import { vehicleClassLabelKey } from "@/lib/ops/rate-book";

type TableRow = FixedRouteRow & Record<string, unknown>;

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

function ZoneLabel({ slug, iata }: { slug: string; iata: string | null }) {
  return (
    <span>
      <span data-zone-slug={slug}>{slug}</span>
      {iata ? (
        <>
          {" "}
          <span className="vt-dir-keep" data-vt-no-i18n="1">
            {iata}
          </span>
        </>
      ) : null}
    </span>
  );
}

export function FixedRouteTable({
  versionId,
  status,
  rows,
  zones,
  classes,
}: {
  versionId: number;
  status: RateVersionStatus;
  rows: FixedRouteRow[];
  zones: ServiceZoneRow[];
  classes: VehicleClassOption[];
}) {
  const t = useTranslations("ops");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const frozen = status !== "draft";
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FixedRouteRow | null>(null);
  const [originZoneId, setOriginZoneId] = useState(zones[0]?.id ?? "");
  const [destZoneId, setDestZoneId] = useState(zones[1]?.id ?? zones[0]?.id ?? "");
  const [vehicleClassId, setVehicleClassId] = useState(classes[0]?.id ?? "");
  const [price, setPrice] = useState("");
  const [live, setLive] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [pending, startPending] = useTransition();

  const zoneOptions = useMemo(
    () => zones.map((row) => ({ value: row.id, label: row.slug })),
    [zones],
  );
  const classOptions = useMemo(
    () => classes.map((row) => ({ value: row.id, label: row.slug })),
    [classes],
  );

  const openCreate = () => {
    setEditing(null);
    setOriginZoneId(zones[0]?.id ?? "");
    setDestZoneId(zones[1]?.id ?? zones[0]?.id ?? "");
    setVehicleClassId(classes[0]?.id ?? "");
    setPrice("");
    setLive(false);
    setErrorKey(null);
    setFormOpen(true);
  };

  const openEdit = (row: FixedRouteRow) => {
    setEditing(row);
    setOriginZoneId(row.originZoneId);
    setDestZoneId(row.destZoneId);
    setVehicleClassId(row.vehicleClassId);
    setPrice("");
    setLive(row.live);
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
      const result: RateBookActionResult = await upsertFixedRoute(versionId, editing?.id ?? null, {
        originZoneId,
        destZoneId,
        vehicleClassId,
        priceRappen: parseRappen(price),
        live,
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
        key: "origin",
        header: t("pricing.rateBook.col-origin"),
        render: (row) => <ZoneLabel slug={row.originSlug} iata={row.originIata} />,
      },
      {
        key: "dest",
        header: t("pricing.rateBook.col-dest"),
        render: (row) => <ZoneLabel slug={row.destSlug} iata={row.destIata} />,
      },
      {
        key: "class",
        header: t("pricing.col-class"),
        render: (row) => <ClassCell slug={row.vehicleClassSlug} />,
      },
      {
        key: "price",
        header: t("pricing.col-price"),
        align: "right",
        render: (row) => amountCell(row.priceRappen),
      },
      {
        key: "live",
        header: t("pricing.rateBook.col-live"),
        render: (row) => (
          <Switch
            checked={row.live}
            label={t("pricing.rateBook.col-live")}
            onChange={(event) => {
              const next = event.currentTarget.checked;
              startTransition(async () => {
                await setFixedRouteLive(versionId, row.id, next);
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
          row.live && row.priceRappen == null ? (
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
                  await deleteFixedRoute(versionId, row.id);
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
        <Button size="sm" disabled={frozen} onClick={openCreate} data-ops-add-route>
          {t("pricing.rateBook.add-route")}
        </Button>
      </div>
      <Table
        rowKey="id"
        emptyMessage={t("pricing.empty-routes")}
        columns={columns}
        rows={rows as TableRow[]}
      />
      <Dialog
        open={formOpen}
        title={editing ? t("pricing.rateBook.edit") : t("pricing.rateBook.add-route")}
        closeLabel={t("pricing.rateBook.cancel")}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={pending}>
              {t("pricing.rateBook.cancel")}
            </Button>
            <Button onClick={submit} disabled={pending || frozen} data-ops-save-route>
              {t("pricing.rateBook.save")}
            </Button>
          </>
        }
      >
        <div className="vt-rate-book__form">
          {errorKey ? <p className="vt-rate-book__error">{messageFor(errorKey)}</p> : null}
          <Select
            label={t("pricing.rateBook.col-origin")}
            options={zoneOptions}
            value={originZoneId}
            disabled={frozen}
            onChange={(event) => setOriginZoneId(event.currentTarget.value)}
            error={originZoneId === destZoneId ? t("pricing.rateBook.error-same-zone") : undefined}
          />
          <Select
            label={t("pricing.rateBook.col-dest")}
            options={zoneOptions}
            value={destZoneId}
            disabled={frozen}
            onChange={(event) => setDestZoneId(event.currentTarget.value)}
          />
          <Select
            label={t("pricing.col-class")}
            options={classOptions}
            value={vehicleClassId}
            disabled={frozen}
            onChange={(event) => setVehicleClassId(event.currentTarget.value)}
          />
          <Input
            label={t("pricing.col-price")}
            type="number"
            inputMode="numeric"
            value={price}
            disabled={frozen}
            onChange={(event) => setPrice(event.currentTarget.value)}
            data-ops-rappen="price"
          />
          <Switch
            checked={live}
            label={t("pricing.rateBook.col-live")}
            onChange={(event) => setLive(event.currentTarget.checked)}
          />
        </div>
      </Dialog>
    </div>
  );
}
