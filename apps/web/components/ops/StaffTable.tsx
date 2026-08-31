"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { setStaffActive, setStaffRole } from "@/app/[locale]/(ops)/ops/staff/actions";
import { Avatar, Button } from "@/components/core";
import { Table, type TableColumn } from "@/components/data/Table";
import { Dialog } from "@/components/feedback/Dialog";
import type { StaffRole, StaffRow } from "@/lib/ops/staff";
import { photoUrl } from "@/lib/ops/photos";
import { StaffInviteDialog } from "./StaffInviteDialog";
import "./StaffTable.css";

/** packages/db/supabase/config.toml [auth] jwt_expiry — residual deactivation window. */
const ACCESS_TOKEN_TTL_SECONDS = 3600;

type TableRow = StaffRow & Record<string, unknown>;

function day(value: string | null): string {
  if (!value) return "—";
  return value.slice(0, 10);
}

export function StaffTable({ rows }: { rows: StaffRow[] }) {
  const t = useTranslations("ops.staffRoster");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<StaffRow | null>(null);
  const [nextRole, setNextRole] = useState<StaffRole>("dispatcher");
  const [activeTarget, setActiveTarget] = useState<StaffRow | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const minutes = Math.round(ACCESS_TOKEN_TTL_SECONDS / 60);

  const columns = useMemo<TableColumn<TableRow>[]>(
    () => [
      {
        key: "person",
        header: t("col-name"),
        render: (row) => (
          <span className="ops-staff__person">
            <Avatar name={row.fullName || t("unnamed")} src={photoUrl(row.avatarPath) ?? undefined} size="sm" />
            <span>{row.fullName || t("unnamed")}</span>
          </span>
        ),
      },
      {
        key: "email",
        header: t("col-email"),
        render: () => (
          <span className="vt-dir-keep" dir="ltr">
            —
          </span>
        ),
      },
      {
        key: "role",
        header: t("col-role"),
        render: (row) => (
          <span className={row.role === "admin" ? "ops-staff__chip ops-staff__chip--admin" : "ops-staff__chip ops-staff__chip--dispatcher"}>
            {row.role === "admin" ? t("role-admin") : t("role-dispatcher")}
          </span>
        ),
      },
      {
        key: "enrolment",
        header: t("col-enrolment"),
        render: (row) => (
          <span className={row.mfaEnrolled ? undefined : "ops-staff__muted"}>
            {row.mfaEnrolled ? t("enrolled") : t("not-enrolled")}
          </span>
        ),
      },
      {
        key: "invited",
        header: t("col-invited"),
        render: (row) => <span className="vt-dir-keep">{day(row.invitedAt)}</span>,
      },
      {
        key: "accepted",
        header: t("col-accepted"),
        render: (row) => (
          <span className={row.acceptedAt ? "vt-dir-keep" : "ops-staff__muted"}>
            {row.acceptedAt ? day(row.acceptedAt) : t("pending")}
          </span>
        ),
      },
      {
        key: "active",
        header: t("col-active"),
        render: (row) => (
          <span className={row.active ? undefined : "ops-staff__danger"}>{row.active ? t("active") : t("inactive")}</span>
        ),
      },
      {
        key: "actions",
        header: t("col-actions"),
        render: (row) => (
          <span className="ops-staff__actions">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setErrorKey(null);
                setNextRole(row.role === "admin" ? "dispatcher" : "admin");
                setRoleTarget(row);
              }}
            >
              {row.role === "admin" ? t("demote") : t("promote")}
            </Button>
            <Button
              size="sm"
              variant={row.active ? "danger" : "ghost"}
              onClick={() => {
                setErrorKey(null);
                setActiveTarget(row);
              }}
            >
              {row.active ? t("deactivate") : t("reactivate")}
            </Button>
          </span>
        ),
      },
    ],
    [t],
  );

  const tableRows: TableRow[] = rows.map((row) => ({ ...row }));

  return (
    <div className="ops-staff" data-testid="staff-table">
      <header className="ops-staff__head">
        <div className="ops-staff__head-copy">
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        <div className="ops-staff__head-actions">
          <Button data-testid="staff-invite" onClick={() => setInviteOpen(true)}>
            {t("invite")}
          </Button>
        </div>
      </header>

      <p className="ops-staff__enrol-note">{t("enrol-note")}</p>

      <Table
        columns={columns}
        rows={tableRows}
        rowKey="userId"
        emptyMessage={<span data-testid="staff-empty">{t("empty")}</span>}
      />

      <StaffInviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSaved={() => {
          setInviteOpen(false);
          router.refresh();
        }}
      />

      <Dialog
        open={roleTarget != null}
        title={nextRole === "admin" ? t("promote-title") : t("demote-title")}
        closeLabel={t("close")}
        onClose={() => setRoleTarget(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRoleTarget(null)}>
              {t("cancel")}
            </Button>
            <Button
              data-testid="staff-role-confirm"
              onClick={() => {
                if (!roleTarget) return;
                const id = roleTarget.userId;
                const role = nextRole;
                startTransition(async () => {
                  const result = await setStaffRole(id, role);
                  if (!result.ok) {
                    setErrorKey(result.key);
                    return;
                  }
                  setRoleTarget(null);
                  router.refresh();
                });
              }}
            >
              {t("confirm")}
            </Button>
          </>
        }
      >
        <p className="ops-staff__dialog-body">{t("role-confirm-body")}</p>
        {errorKey ? <p className="ops-staff__error">{errorKey === "staff-last-admin" ? t("last-admin") : t("error")}</p> : null}
      </Dialog>

      <Dialog
        open={activeTarget != null}
        title={activeTarget?.active ? t("deactivate-title") : t("reactivate-title")}
        closeLabel={t("close")}
        onClose={() => setActiveTarget(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setActiveTarget(null)}>
              {t("cancel")}
            </Button>
            <Button
              variant={activeTarget?.active ? "danger" : "primary"}
              data-testid="staff-active-confirm"
              onClick={() => {
                if (!activeTarget) return;
                const id = activeTarget.userId;
                const next = !activeTarget.active;
                startTransition(async () => {
                  const result = await setStaffActive(id, next);
                  if (!result.ok) {
                    setErrorKey(result.key);
                    return;
                  }
                  setActiveTarget(null);
                  router.refresh();
                });
              }}
            >
              {t("confirm")}
            </Button>
          </>
        }
      >
        <p className="ops-staff__dialog-body">
          {activeTarget?.active ? t("deactivate-body", { minutes }) : t("reactivate-body")}
        </p>
        {errorKey ? <p className="ops-staff__error">{errorKey === "staff-last-admin" ? t("last-admin") : t("error")}</p> : null}
      </Dialog>
    </div>
  );
}
