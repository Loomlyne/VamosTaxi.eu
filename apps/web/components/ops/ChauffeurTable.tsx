"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  deleteChauffeur,
  setChauffeurActive,
} from "@/app/[locale]/(ops)/ops/chauffeurs/actions";
import { Avatar, Button } from "@/components/core";
import { ListRow } from "@/components/data/ListRow";
import { Table, type TableColumn } from "@/components/data/Table";
import { Dialog } from "@/components/feedback/Dialog";
import {
  licenceState,
  SPOKEN_LANGUAGES,
  type ChauffeurDetail,
  type ChauffeurRow,
  type ChauffeurStatus,
  type LicenceState,
} from "@/lib/ops/chauffeurs";
import type { VehicleOption } from "@/lib/ops/fleet";
import { photoUrl } from "@/lib/ops/photos";
import { ChauffeurForm } from "./ChauffeurForm";
import "./ChauffeurTable.css";

type ChauffeurTableRow = ChauffeurRow & Record<string, unknown>;

function spokenName(
  code: string,
  tSpoken: (key: string) => string,
): string {
  return SPOKEN_LANGUAGES.some((entry) => entry.code === code) ? tSpoken(code) : code;
}

export function ChauffeurTable({
  rows,
  vehicles,
  selected,
}: {
  rows: ChauffeurRow[];
  vehicles: VehicleOption[];
  selected: ChauffeurDetail | null;
}) {
  const t = useTranslations("ops");
  const tSpoken = useTranslations("ops.spoken");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ChauffeurRow | null>(null);

  const formOpen = creating || selected != null;

  const closeForm = () => {
    setCreating(false);
    router.push("/ops/chauffeurs");
  };

  const columns = useMemo<TableColumn<ChauffeurTableRow>[]>(
    () => [
      {
        key: "photo",
        header: t("chauffeurs-col-photo"),
        width: "64px",
        render: (row) => <ChauffeurPhoto row={row} marked />,
      },
      {
        key: "name",
        header: t("chauffeurs-col-name"),
        render: (row) => (
          <span
            className="chauffeur-table__stack"
            data-chauffeur-name={row.fullName}
            data-active={row.active ? "true" : "false"}
          >
            <span>{row.fullName}</span>
            {row.email ? (
              <span className="chauffeur-table__stack-sub vt-dir-keep" dir="ltr">
                {row.email}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        key: "phone",
        header: t("chauffeurs-col-phone"),
        width: "148px",
        render: (row) => (
          <span className="vt-dir-keep" dir="ltr">
            {row.phone}
          </span>
        ),
      },
      {
        key: "vehicle",
        header: t("chauffeurs-col-vehicle"),
        width: "132px",
        render: (row) =>
          row.defaultVehiclePlate ? (
            <span className="vt-dir-keep" dir="ltr" data-chauffeur-plate={row.defaultVehiclePlate}>
              {row.defaultVehiclePlate}
            </span>
          ) : (
            <span className="chauffeur-table__stack-sub">{t("chauffeurs-vehicle-none")}</span>
          ),
      },
      {
        key: "languages",
        header: t("chauffeurs-col-languages"),
        render: (row) => (
          <span className="chauffeur-table__langs" data-testid="chauffeurs-langs">
            {row.languages.length === 0
              ? null
              : row.languages.map((code) => (
                  <span key={code} className="chauffeur-table__lang">
                    <span>{spokenName(code, tSpoken)}</span>
                    <span className="vt-dir-keep" dir="ltr">
                      {code}
                    </span>
                  </span>
                ))}
          </span>
        ),
      },
      {
        key: "licence",
        header: t("chauffeurs-col-licence"),
        width: "132px",
        render: (row) => <LicenceMark expiry={row.licenceExpiresOn} t={t} />,
      },
      {
        key: "status",
        header: t("chauffeurs-col-status"),
        width: "120px",
        render: (row) => (
          <span className="chauffeur-table__status" data-status={row.status}>
            {statusLabel(row.status, t)}
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
              onClick={() => router.push(`/ops/chauffeurs?id=${row.id}`)}
            >
              {t("edit")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-testid={`chauffeurs-deactivate-${row.fullName}`}
              onClick={() => {
                startTransition(async () => {
                  await setChauffeurActive(row.id, !row.active);
                  router.refresh();
                });
              }}
            >
              {row.active ? t("chauffeurs-deactivate") : t("chauffeurs-reactivate")}
            </Button>
            <Button
              size="sm"
              variant="danger"
              data-testid={`chauffeurs-delete-${row.fullName}`}
              onClick={() => setDeleting(row)}
            >
              {t("chauffeurs-delete")}
            </Button>
          </span>
        ),
      },
    ],
    [router, t, tSpoken],
  );

  const tableRows: ChauffeurTableRow[] = rows.map((row) => ({ ...row }));

  return (
    <div className="chauffeur-table" data-testid="chauffeurs-table">
      <div className="chauffeur-table__toolbar">
        <Button
          data-testid="chauffeurs-add"
          onClick={() => {
            setCreating(true);
          }}
        >
          {t("chauffeurs-add")}
        </Button>
      </div>
      <div className="chauffeur-table__desktop">
        <Table
          columns={columns}
          rows={tableRows}
          emptyMessage={
            <span data-testid="chauffeurs-empty">
              {t("chauffeurs-empty")}
              <span
                style={{
                  display: "block",
                  color: "var(--vt-text-muted)",
                  marginBlockEnd: 0,
                  marginBlockStart: 4,
                }}
              >
                {t("chauffeurs-empty-body")}
              </span>
            </span>
          }
        />
      </div>
      <div className="chauffeur-table__cards">
        {rows.length === 0 ? (
          <span>
            {t("chauffeurs-empty")}
            <span style={{ display: "block", color: "var(--vt-text-muted)", marginBlockStart: 4 }}>
              {t("chauffeurs-empty-body")}
            </span>
          </span>
        ) : (
          rows.map((row, index) => (
            <div
              key={row.id}
              data-chauffeur-name={row.fullName}
              data-active={row.active ? "true" : "false"}
            >
              <ListRow
                last={index === rows.length - 1}
                lead={<ChauffeurPhoto row={row} />}
                title={row.fullName}
                subtitle={
                  <>
                    <span className="vt-dir-keep" dir="ltr">
                      {row.phone}
                    </span>
                    {row.defaultVehiclePlate ? (
                      <>
                        {" · "}
                        <span className="vt-dir-keep" dir="ltr" data-chauffeur-plate={row.defaultVehiclePlate}>
                          {row.defaultVehiclePlate}
                        </span>
                      </>
                    ) : null}
                  </>
                }
                meta={
                  <span className="chauffeur-table__card-meta">
                    <span className="chauffeur-table__status" data-status={row.status}>
                      {statusLabel(row.status, t)}
                    </span>
                    <LicenceMark expiry={row.licenceExpiresOn} t={t} />
                  </span>
                }
              />
              <div className="chauffeur-table__card-actions">
                <Button size="sm" variant="ghost" onClick={() => router.push(`/ops/chauffeurs?id=${row.id}`)}>
                  {t("edit")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    startTransition(async () => {
                      await setChauffeurActive(row.id, !row.active);
                      router.refresh();
                    });
                  }}
                >
                  {row.active ? t("chauffeurs-deactivate") : t("chauffeurs-reactivate")}
                </Button>
                <Button size="sm" variant="danger" onClick={() => setDeleting(row)}>
                  {t("chauffeurs-delete")}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
      {formOpen ? (
        <ChauffeurForm
          key={selected?.id ?? "new"}
          open={formOpen}
          row={selected}
          vehicles={vehicles}
          onClose={closeForm}
          onSaved={() => {
            setCreating(false);
            router.push("/ops/chauffeurs");
            router.refresh();
          }}
        />
      ) : null}
      <Dialog
        open={deleting != null}
        title={t("chauffeurs-delete")}
        closeLabel={t("chauffeurs-close")}
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              {t("chauffeurs-cancel")}
            </Button>
            <Button
              variant="danger"
              data-testid="chauffeurs-delete-confirm"
              onClick={() => {
                if (!deleting) return;
                const id = deleting.id;
                startTransition(async () => {
                  await deleteChauffeur(id);
                  setDeleting(null);
                  router.refresh();
                });
              }}
            >
              {t("chauffeurs-delete")}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>{t("chauffeurs-delete-body")}</p>
      </Dialog>
    </div>
  );
}

function statusLabel(status: ChauffeurStatus, t: (key: string) => string): string {
  if (status === "shift") return t("chauffeurs-status-shift");
  if (status === "leave") return t("chauffeurs-status-leave");
  return t("chauffeurs-status-off");
}

function licenceCopy(state: LicenceState, t: (key: string) => string): string {
  if (state === "expired") return t("chauffeurs-licence-expired");
  if (state === "expiring") return t("chauffeurs-licence-expiring");
  if (state === "valid") return t("chauffeurs-licence-valid");
  return t("chauffeurs-licence-unknown");
}

function LicenceMark({
  expiry,
  t,
}: {
  expiry: string | null;
  t: (key: string) => string;
}) {
  const state = licenceState(expiry);
  const copy = licenceCopy(state, t);
  if (state === "unknown") {
    return (
      <span className="chauffeur-table__licence" data-licence-state="unknown" data-tok>
        {copy}
      </span>
    );
  }
  return (
    <span className="chauffeur-table__licence" data-licence-state={state}>
      {copy}
    </span>
  );
}

function ChauffeurPhoto({ row, marked = false }: { row: ChauffeurRow; marked?: boolean }) {
  const src = photoUrl(row.photoPath);
  const empty = !src;
  return (
    <span
      className="chauffeur-table__photo"
      data-testid={marked && empty ? "chauffeur-photo-fallback" : undefined}
    >
      <Avatar name={row.fullName} src={src ?? undefined} size="sm" />
    </span>
  );
}
