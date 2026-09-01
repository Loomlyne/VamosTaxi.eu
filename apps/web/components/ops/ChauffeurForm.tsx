"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  createChauffeur,
  updateChauffeur,
  type ChauffeurActionResult,
} from "@/app/[locale]/(ops)/ops/chauffeurs/actions";
import { Button } from "@/components/core";
import { Dialog } from "@/components/feedback/Dialog";
import { Input } from "@/components/forms/Input";
import { Select } from "@/components/forms/Select";
import { Textarea } from "@/components/forms/Textarea";
import { LanguageChips } from "@/components/ops/LanguageChips";
import { OpsPhotoField } from "@/components/ops/OpsPhotoField";
import type { ChauffeurDetail, ChauffeurInput, ChauffeurStatus } from "@/lib/ops/chauffeurs-model";
import type { VehicleOption } from "@/lib/ops/fleet";

const FIELD_KEYS = new Set([
  "chauffeurs-failure-name-required",
  "chauffeurs-failure-phone-required",
  "chauffeurs-failure-licence-required",
  "chauffeurs-failure-licence-date",
  "chauffeurs-failure-languages",
  "chauffeurs-failure-photo",
  "chauffeurs-failure-vehicle",
]);

export function ChauffeurForm({
  open,
  row,
  vehicles,
  onClose,
  onSaved,
}: {
  open: boolean;
  row: ChauffeurDetail | null;
  vehicles: VehicleOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("ops");
  const [pending, startTransition] = useTransition();
  const [id] = useState(() => row?.id ?? crypto.randomUUID());
  const [fullName, setFullName] = useState(row?.fullName ?? "");
  const [phone, setPhone] = useState(row?.phone ?? "");
  const [email, setEmail] = useState(row?.email ?? "");
  const [defaultVehicleId, setDefaultVehicleId] = useState(row?.defaultVehicleId ?? "");
  const [licenceNumber, setLicenceNumber] = useState(row?.licenceNumber ?? "");
  const [licenceExpiresOn, setLicenceExpiresOn] = useState(row?.licenceExpiresOn ?? "");
  const [languages, setLanguages] = useState<string[]>(row?.languages ?? []);
  const [status, setStatus] = useState<ChauffeurStatus>(row?.status ?? "off");
  const [note, setNote] = useState(row?.note ?? "");
  const [photoPath, setPhotoPath] = useState<string | null>(row?.photoPath ?? null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const vehicleOptions = useMemo(
    () => [
      { value: "", label: t("chauffeurs-vehicle-none") },
      ...vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.label })),
    ],
    [t, vehicles],
  );

  const statusOptions = useMemo(
    () => [
      { value: "shift", label: t("chauffeurs-status-shift") },
      { value: "off", label: t("chauffeurs-status-off") },
      { value: "leave", label: t("chauffeurs-status-leave") },
    ],
    [t],
  );

  const messageFor = (key: string): string => {
    switch (key) {
      case "chauffeurs-failure-name-required":
        return t("chauffeurs-failure-name-required");
      case "chauffeurs-failure-phone-required":
        return t("chauffeurs-failure-phone-required");
      case "chauffeurs-failure-licence-required":
        return t("chauffeurs-failure-licence-required");
      case "chauffeurs-failure-licence-date":
        return t("chauffeurs-failure-licence-date");
      case "chauffeurs-failure-languages":
        return t("chauffeurs-failure-languages");
      case "chauffeurs-failure-photo":
        return t("chauffeurs-failure-photo");
      case "chauffeurs-failure-vehicle":
        return t("chauffeurs-failure-vehicle");
      default:
        return t("chauffeurs-failure-error");
    }
  };

  const fieldError = (key: string) => (errorKey === key ? messageFor(key) : undefined);
  const formError = errorKey && !FIELD_KEYS.has(errorKey) ? messageFor(errorKey) : undefined;

  const submit = () => {
    const input: ChauffeurInput = {
      fullName,
      phone,
      email: email.trim() === "" ? null : email,
      defaultVehicleId: defaultVehicleId === "" ? null : defaultVehicleId,
      licenceNumber,
      licenceExpiresOn: licenceExpiresOn.trim() === "" ? null : licenceExpiresOn,
      languages,
      status,
      photoPath,
      note,
    };
    startTransition(async () => {
      setErrorKey(null);
      let result: ChauffeurActionResult;
      if (row) result = await updateChauffeur(row.id, input);
      else result = await createChauffeur(id, input);
      if (!result.ok) {
        setErrorKey(result.key);
        return;
      }
      onSaved();
    });
  };

  return (
    <Dialog
      open={open}
      title={row ? t("chauffeurs-edit") : t("chauffeurs-add")}
      closeLabel={t("chauffeurs-close")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("chauffeurs-cancel")}
          </Button>
          <Button onClick={submit} disabled={pending} data-testid="chauffeurs-save">
            {t("chauffeurs-save")}
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
        <Input
          label={t("chauffeurs-field-name")}
          error={fieldError("chauffeurs-failure-name-required")}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          data-testid="chauffeurs-name"
        />
        <Input
          label={t("chauffeurs-field-phone")}
          error={fieldError("chauffeurs-failure-phone-required")}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          dir="ltr"
          className="vt-dir-keep"
          data-testid="chauffeurs-phone"
        />
        <Input
          label={t("chauffeurs-field-email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          dir="ltr"
          className="vt-dir-keep"
          data-testid="chauffeurs-email"
        />
        <Select
          label={t("chauffeurs-field-vehicle")}
          options={vehicleOptions}
          value={defaultVehicleId}
          onChange={(e) => setDefaultVehicleId(e.target.value)}
          data-testid="chauffeurs-vehicle"
        />
        <Input
          label={t("chauffeurs-field-licence")}
          error={fieldError("chauffeurs-failure-licence-required")}
          value={licenceNumber}
          onChange={(e) => setLicenceNumber(e.target.value)}
          required
          dir="ltr"
          className="vt-dir-keep"
          data-testid="chauffeurs-licence"
        />
        <Input
          label={t("chauffeurs-field-expires")}
          error={fieldError("chauffeurs-failure-licence-date")}
          type="date"
          value={licenceExpiresOn}
          onChange={(e) => setLicenceExpiresOn(e.target.value)}
          dir="ltr"
          className="vt-dir-keep"
          data-testid="chauffeurs-expires"
        />
        <Select
          label={t("chauffeurs-field-status")}
          options={statusOptions}
          value={status}
          onChange={(e) => {
            const next = e.target.value;
            if (next === "shift" || next === "off" || next === "leave") setStatus(next);
          }}
          data-testid="chauffeurs-status"
        />
        <div style={{ gridColumn: "1 / -1" }}>
          <span
            style={{
              display: "block",
              marginBlockEnd: 8,
              fontSize: "var(--vt-label-sm)",
              letterSpacing: "var(--vt-label-tracking)",
              textTransform: "uppercase",
              fontWeight: "var(--vt-label-weight)",
              color: "var(--vt-text-muted)",
            }}
          >
            {t("chauffeurs-field-languages")}
          </span>
          <LanguageChips value={languages} onChange={setLanguages} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <span
            style={{
              display: "block",
              marginBlockEnd: 8,
              fontSize: "var(--vt-label-sm)",
              letterSpacing: "var(--vt-label-tracking)",
              textTransform: "uppercase",
              fontWeight: "var(--vt-label-weight)",
              color: "var(--vt-text-muted)",
            }}
          >
            {t("chauffeurs-field-photo")}
          </span>
          <OpsPhotoField kind="chauffeur" recordId={id} value={photoPath} onChange={setPhotoPath} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <Textarea
            label={t("chauffeurs-field-note")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {formError ? (
          <p
            role="alert"
            data-testid="chauffeurs-form-error"
            style={{ gridColumn: "1 / -1", color: "var(--vt-danger)", margin: 0 }}
          >
            {formError}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
