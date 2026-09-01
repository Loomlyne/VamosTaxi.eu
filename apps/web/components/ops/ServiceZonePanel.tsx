"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createNavigation } from "next-intl/navigation";
import {
  deleteServiceZone,
  setServiceZoneActive,
  upsertServiceZone,
  type ZoneActionResult,
} from "@/app/[locale]/(ops)/ops/pricing/zones/actions";
import { Button } from "@/components/core";
import { Table, type TableColumn } from "@/components/data/Table";
import { Dialog } from "@/components/feedback/Dialog";
import { Input } from "@/components/forms/Input";
import { Switch } from "@/components/forms/Switch";
import { routing } from "@/i18n/routing";
import type { ServiceZoneRow } from "@/lib/ops/rate-book";

const { Link } = createNavigation(routing);

type TableRow = ServiceZoneRow & Record<string, unknown>;

export function ServiceZonePanel({ zones }: { zones: ServiceZoneRow[] }) {
  const t = useTranslations("ops");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceZoneRow | null>(null);
  const [slug, setSlug] = useState("");
  const [iata, setIata] = useState("");
  const [active, setActive] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [pending, startPending] = useTransition();

  const openCreate = () => {
    setEditing(null);
    setSlug("");
    setIata("");
    setActive(true);
    setErrorKey(null);
    setFormOpen(true);
  };

  const openEdit = (row: ServiceZoneRow) => {
    setEditing(row);
    setSlug(row.slug);
    setIata(row.iata ?? "");
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
      const result: ZoneActionResult = await upsertServiceZone(editing?.id ?? null, {
        slug,
        iata: iata.trim() === "" ? null : iata,
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
        key: "slug",
        header: t("pricing.rateBook.col-slug"),
        render: (row) => (
          <span className="vt-dir-keep" data-vt-no-i18n="1" data-zone-slug={row.slug}>
            {row.slug}
          </span>
        ),
      },
      {
        key: "name",
        header: t("pricing.rateBook.col-label"),
        render: (row) =>
          row.label ? (
            <span data-zone-key={`zone.${row.slug}`}>{row.label}</span>
          ) : (
            <span data-tok data-zone-missing={row.slug}>
              {t("pricing.rateBook.zone-missing")}{" "}
              <Link href={`/ops/content?q=${encodeURIComponent(`zone.${row.slug}`)}`}>
                {t("pricing.rateBook.zone-missing-fix")}
              </Link>
            </span>
          ),
      },
      {
        key: "iata",
        header: t("pricing.rateBook.col-iata"),
        render: (row) =>
          row.iata ? (
            <span className="vt-dir-keep" data-vt-no-i18n="1">
              {row.iata}
            </span>
          ) : (
            "—"
          ),
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
                await setServiceZoneActive(row.id, next);
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
            <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
              {t("pricing.rateBook.edit")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                startTransition(async () => {
                  await deleteServiceZone(row.id);
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
    [router, t],
  );

  return (
    <div className="vt-rate-book">
      <p className="vt-rate-book__hint">{t("pricing.rateBook.zones-hint")}</p>
      <div className="vt-rate-book__toolbar">
        <Button size="sm" onClick={openCreate} data-ops-add-zone>
          {t("pricing.rateBook.zones-add")}
        </Button>
      </div>
      <Table rowKey="id" columns={columns} rows={zones as TableRow[]} />
      <Dialog
        open={formOpen}
        title={editing ? t("pricing.rateBook.edit") : t("pricing.rateBook.zones-add")}
        closeLabel={t("pricing.rateBook.cancel")}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={pending}>
              {t("pricing.rateBook.cancel")}
            </Button>
            <Button onClick={submit} disabled={pending} data-ops-save-zone>
              {t("pricing.rateBook.save")}
            </Button>
          </>
        }
      >
        <div className="vt-rate-book__form">
          {errorKey ? <p className="vt-rate-book__error">{messageFor(errorKey)}</p> : null}
          <Input
            label={t("pricing.rateBook.col-slug")}
            value={slug}
            error={
              errorKey === "pricing.rateBook.error-zone-slug"
                ? t("pricing.rateBook.error-zone-slug")
                : undefined
            }
            onChange={(event) => setSlug(event.currentTarget.value)}
            data-ops-zone-slug
          />
          <Input
            label={t("pricing.rateBook.col-iata")}
            value={iata}
            onChange={(event) => setIata(event.currentTarget.value)}
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
