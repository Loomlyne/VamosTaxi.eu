"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { inviteStaff } from "@/app/[locale]/(ops)/ops/staff/actions";
import { Button } from "@/components/core";
import { Dialog } from "@/components/feedback/Dialog";
import { Input, Select } from "@/components/forms";
import type { StaffRole } from "@/lib/ops/staff";

function inviteErrorCopy(key: string, t: (id: string) => string): string {
  if (key === "staff-invalid-email" || key === "staffRoster.error-invalid") return t("error-invalid");
  if (key === "staff-invalid-role") return t("error-role");
  if (key === "staffRoster.error-delivery") return t("error-delivery");
  if (key === "staffRoster.error-already") return t("error-already");
  if (key === "staffRoster.error-row") return t("error-row");
  return t("error");
}

export function StaffInviteDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("ops.staffRoster");
  const [, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("dispatcher");
  const [errorKey, setErrorKey] = useState<string | null>(null);

  function reset() {
    setEmail("");
    setRole("dispatcher");
    setErrorKey(null);
  }

  return (
    <Dialog
      open={open}
      title={t("invite-title")}
      closeLabel={t("close")}
      onClose={() => {
        reset();
        onClose();
      }}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            {t("cancel")}
          </Button>
          <Button
            data-testid="staff-invite-submit"
            onClick={() => {
              startTransition(async () => {
                const result = await inviteStaff({ email, role });
                if (!result.ok) {
                  setErrorKey(result.key);
                  return;
                }
                reset();
                onSaved();
              });
            }}
          >
            {t("invite")}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0, fontSize: "var(--vt-body-sm)", lineHeight: 1.6, color: "var(--vt-text-muted)" }}>
          {t("invite-copy-gap")}
        </p>
        <Input
          label={t("email")}
          type="email"
          autoComplete="off"
          className="vt-dir-keep"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Select
          label={t("role")}
          value={role}
          options={[
            { value: "dispatcher", label: t("role-dispatcher") },
            { value: "admin", label: t("role-admin") },
          ]}
          onChange={(event) => setRole(event.target.value === "admin" ? "admin" : "dispatcher")}
        />
        {errorKey ? (
          <p style={{ margin: 0, color: "var(--vt-danger)", fontSize: "var(--vt-body-sm)" }}>
            {inviteErrorCopy(errorKey, t)}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
