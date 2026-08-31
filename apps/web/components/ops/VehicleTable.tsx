"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { deleteVehicle, setVehicleStatus } from "@/app/[locale]/(ops)/ops/vehicles/actions";
import { Button, Icon } from "@/components/core";
import { ListRow } from "@/components/data/ListRow";
import { Table, type TableColumn } from "@/components/data/Table";
import { Dialog } from "@/components/feedback/Dialog";
import { Tabs } from "@/components/navigation/Tabs";
import { photoUrl } from "@/lib/ops/photos";
import { vehicleClassLabelKey } from "@/lib/ops/vehicle-class-label";
import type { VehicleClassRow, VehicleRow, VehicleStatus } from "@/lib/ops/fleet";
import { VehicleForm } from "./VehicleForm";
import "./VehicleTable.css";

type VehicleTableRow = VehicleRow & Record<string, unknown>;

function classLabel(
  slug: string,
  tCommon: (key: "vehicleClassEconomy" | "vehicleClassBusiness" | "vehicleClassVan") => string,
  gap: string,
): { text: string; labelled: boolean } {
  const key = vehicleClassLabelKey(slug);
  if (key === "common.vehicleClassEconomy") return { text: tCommon("vehicleClassEconomy"), labelled: true };
  if (key === "common.vehicleClassBusiness") return { text: tCommon("vehicleClassBusiness"), labelled: true };
  if (key === "common.vehicleClassVan") return { text: tCommon("vehicleClassVan"), labelled: true };
  return { text: gap, labelled: false };
}

function statusColor(status: VehicleStatus): string {
  if (status === "workshop") return "var(--vt-danger)";
  if (status === "idle") return "var(--vt-text-muted)";
  return "var(--vt-text-primary)";
}

function VehiclePhoto({
  path,
  plate,
  marked = false,
}: {
  path: string | null;
  plate: string;
  marked?: boolean;
}) {
  const src = photoUrl(path);
  const [broken, setBroken] = useState(false);
  const show = Boolean(src) && !broken;
  return (
    <span
      className="vehicle-table__photo"
      data-vehicle-photo={show ? "present" : "empty"}
      data-testid={marked && !show ? "vehicle-photo-fallback" : undefined}
      aria-label={plate}
    >
      {show && src ? (
        <img src={src} alt="" onError={() => setBroken(true)} />
      ) : (
        <Icon name="car-front" size={18} />
      )}
    </span>
  );
}

export function VehicleFleetTabs({ value }: { value: "vehicles" | "classes" }) {
  const t = useTranslations("ops");
  const router = useRouter();
  return (
    <Tabs
      data-testid="vehicles-tabs"
      items={[
        { value: "vehicles", label: t("fleet-tab-vehicles") },
        { value: "classes", label: t("fleet-tab-classes") },
      ]}
      value={value}
      onChange={(next) => {
        router.push(next === "classes" ? "/ops/vehicles?tab=classes" : "/ops/vehicles");
      }}
    />
  );
}

export function VehicleTable({
  rows,
  classes,
}: {
  rows: VehicleRow[];
  classes: VehicleClassRow[];
}) {
  const tCommon = useTranslations("common");
  const t = useTranslations("ops");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VehicleRow | null>(null);
  const [deleting, setDeleting] = useState<VehicleRow | null>(null);

  const gap = t("fleet-class-gap");

  const columns = useMemo<TableColumn<VehicleTableRow>[]>(
    () => [
      {
        key: "photo",
        header: t("fleet-col-photo"),
        width: "64px",
        render: (row) => <VehiclePhoto path={row.photoPath} plate={row.plate} marked />,
      },
      {
        key: "klass",
        header: t("fleet-col-class"),
        render: (row) => {
          const label = classLabel(row.classSlug, tCommon, gap);
          return (
            <span className="vehicle-table__stack">
              {label.labelled ? (
                <span data-vehicle-class={row.classSlug}>{label.text}</span>
              ) : (
                <span data-tok data-vehicle-class={row.classSlug}>
                  {label.text}
                </span>
              )}
              <span className="vehicle-table__stack-sub">{row.model}</span>
            </span>
          );
        },
      },
      {
        key: "plate",
        header: t("fleet-col-plate"),
        width: "132px",
        render: (row) => (
          <span className="vt-dir-keep" data-vehicle-plate={row.plate}>
            {row.plate}
          </span>
        ),
      },
      {
        key: "cap",
        header: t("fleet-col-capacity"),
        width: "128px",
        render: (row) => `${row.seats} / ${row.bags}`,
      },
      {
        key: "status",
        header: t("fleet-col-status"),
        width: "150px",
        render: (row) => (
          <span
            data-vehicle-status={row.status}
            style={{ color: statusColor(row.status), fontWeight: "var(--vt-weight-semibold)" }}
          >
            {row.status === "workshop"
              ? t("fleet-status-workshop")
              : row.status === "idle"
                ? t("fleet-status-idle")
                : t("fleet-status-service")}
          </span>
        ),
      },
      {
        key: "actions",
        header: t("edit"),
        width: "280px",
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
              data-testid={`vehicles-workshop-${row.plate}`}
              onClick={() => {
                startTransition(async () => {
                  await setVehicleStatus(row.id, "workshop");
                  router.refresh();
                });
              }}
            >
              {t("fleet-set-workshop")}
            </Button>
            <Button
              size="sm"
              variant="danger"
              data-testid={`vehicles-delete-${row.plate}`}
              onClick={() => setDeleting(row)}
            >
              {t("fleet-delete")}
            </Button>
          </span>
        ),
      },
    ],
    [gap, router, t, tCommon],
  );

  const tableRows: VehicleTableRow[] = rows.map((row) => ({ ...row }));

  return (
    <div className="vehicle-table" data-testid="vehicles-table">
      <div className="vehicle-table__toolbar">
        <Button
          data-testid="vehicles-add"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          {t("fleet-add")}
        </Button>
      </div>
      <div className="vehicle-table__desktop">
        <Table
          columns={columns}
          rows={tableRows}
          emptyMessage={
            <span data-testid="vehicles-empty">
              {t("fleet-empty")}
              <span style={{ display: "block", color: "var(--vt-text-muted)", marginBlockEnd: 0, marginBlockStart: 4 }}>
                {t("fleet-empty-body")}
              </span>
            </span>
          }
        />
      </div>
      <div className="vehicle-table__cards">
        {rows.length === 0 ? (
          <span>
            {t("fleet-empty")}
            <span style={{ display: "block", color: "var(--vt-text-muted)", marginBlockStart: 4 }}>
              {t("fleet-empty-body")}
            </span>
          </span>
        ) : (
          rows.map((row, index) => {
            const label = classLabel(row.classSlug, tCommon, gap);
            return (
              <div key={row.id}>
                <ListRow
                  last={index === rows.length - 1}
                  lead={<VehiclePhoto path={row.photoPath} plate={row.plate} />}
                  title={
                    label.labelled ? (
                      label.text
                    ) : (
                      <span data-tok>{label.text}</span>
                    )
                  }
                  subtitle={
                    <>
                      {row.model}
                      {" · "}
                      <span className="vt-dir-keep">{row.plate}</span>
                    </>
                  }
                  meta={
                    <span className="vehicle-table__card-meta">
                      <span style={{ color: statusColor(row.status) }}>
                        {row.status === "workshop"
                          ? t("fleet-status-workshop")
                          : row.status === "idle"
                            ? t("fleet-status-idle")
                            : t("fleet-status-service")}
                      </span>
                      <span>
                        {row.seats} / {row.bags}
                      </span>
                    </span>
                  }
                />
                <div className="vehicle-table__card-actions">
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
                    onClick={() => {
                      startTransition(async () => {
                        await setVehicleStatus(row.id, "workshop");
                        router.refresh();
                      });
                    }}
                  >
                    {t("fleet-set-workshop")}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleting(row)}>
                    {t("fleet-delete")}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
      {formOpen ? (
        <VehicleForm
          key={editing?.id ?? "new"}
          open={formOpen}
          row={editing}
          classes={classes}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            router.refresh();
          }}
        />
      ) : null}
      <Dialog
        open={deleting != null}
        title={t("fleet-delete")}
        closeLabel={t("fleet-close")}
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              {t("fleet-cancel")}
            </Button>
            <Button
              variant="danger"
              data-testid="vehicles-delete-confirm"
              onClick={() => {
                if (!deleting) return;
                const id = deleting.id;
                startTransition(async () => {
                  await deleteVehicle(id);
                  setDeleting(null);
                  router.refresh();
                });
              }}
            >
              {t("fleet-delete")}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>{t("fleet-delete-body")}</p>
      </Dialog>
    </div>
  );
}
