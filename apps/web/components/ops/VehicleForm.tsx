"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  createVehicle,
  updateVehicle,
  type VehicleActionResult,
} from "@/app/[locale]/(ops)/ops/vehicles/actions";
import { Button } from "@/components/core";
import { Dialog } from "@/components/feedback/Dialog";
import { Counter } from "@/components/forms/Counter";
import { Input } from "@/components/forms/Input";
import { Select } from "@/components/forms/Select";
import { Textarea } from "@/components/forms/Textarea";
import { OpsPhotoField } from "@/components/ops/OpsPhotoField";
import type {
  VehicleClassRow,
  VehicleInput,
  VehicleRow,
  VehicleStatus,
} from "@/lib/ops/fleet";
import { vehicleClassLabelKey } from "@/lib/ops/fleet";

const FIELD_KEYS = new Set([
  "fleet-failure-class-required",
  "fleet-failure-model-required",
  "fleet-failure-plate-required",
  "fleet-failure-seats",
  "fleet-failure-bags",
  "fleet-failure-year",
  "fleet-failure-photo",
  "fleet-failure-duplicate",
]);

export function VehicleForm({
  open,
  row,
  classes,
  onClose,
  onSaved,
}: {
  open: boolean;
  row: VehicleRow | null;
  classes: VehicleClassRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const tCommon = useTranslations("common");
  const t = useTranslations("ops");
  const [pending, startTransition] = useTransition();
  const [id] = useState(() => row?.id ?? crypto.randomUUID());
  const [vehicleClassId, setVehicleClassId] = useState(
    row?.vehicleClassId ?? classes[0]?.id ?? "",
  );
  const [model, setModel] = useState(row?.model ?? "");
  const [plate, setPlate] = useState(row?.plate ?? "");
  const [year, setYear] = useState(
    row?.firstRegistered == null ? "" : String(row.firstRegistered),
  );
  const [seats, setSeats] = useState(row?.seats ?? 3);
  const [bags, setBags] = useState(row?.bags ?? 3);
  const [status, setStatus] = useState<VehicleStatus>(row?.status ?? "service");
  const [note, setNote] = useState(row?.note ?? "");
  const [photoPath, setPhotoPath] = useState<string | null>(row?.photoPath ?? null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const classOptions = useMemo(
    () =>
      classes.map((cls) => {
        const key = vehicleClassLabelKey(cls.slug);
        const label =
          key === "common.vehicleClassEconomy"
            ? tCommon("vehicleClassEconomy")
            : key === "common.vehicleClassBusiness"
              ? tCommon("vehicleClassBusiness")
              : key === "common.vehicleClassVan"
                ? tCommon("vehicleClassVan")
                : t("fleet-class-gap");
        return { value: cls.id, label };
      }),
    [classes, t, tCommon],
  );

  const statusOptions = useMemo(
    () => [
      { value: "service", label: t("fleet-status-service") },
      { value: "idle", label: t("fleet-status-idle") },
      { value: "workshop", label: t("fleet-status-workshop") },
    ],
    [t],
  );

  const messageFor = (key: string): string => {
    switch (key) {
      case "fleet-failure-class-required":
        return t("fleet-failure-class-required");
      case "fleet-failure-model-required":
        return t("fleet-failure-model-required");
      case "fleet-failure-plate-required":
        return t("fleet-failure-plate-required");
      case "fleet-failure-seats":
        return t("fleet-failure-seats", { min: 1, max: 16 });
      case "fleet-failure-bags":
        return t("fleet-failure-bags", { min: 0, max: 16 });
      case "fleet-failure-year":
        return t("fleet-failure-year", { min: 1990, max: 2100 });
      case "fleet-failure-photo":
        return t("fleet-failure-photo");
      case "fleet-failure-duplicate":
        return t("fleet-failure-duplicate");
      case "fleet-failure-check":
        return t("fleet-failure-check");
      default:
        return t("fleet-failure-error");
    }
  };

  const fieldError = (key: string) => (errorKey === key ? messageFor(key) : undefined);
  const formError = errorKey && !FIELD_KEYS.has(errorKey) ? messageFor(errorKey) : undefined;

  const submit = () => {
    const trimmedYear = year.trim();
    const firstRegistered = trimmedYear === "" ? null : Number(trimmedYear);
    const input: VehicleInput = {
      vehicleClassId,
      model,
      plate,
      firstRegistered,
      seats,
      bags,
      status,
      photoPath,
      note,
    };
    startTransition(async () => {
      setErrorKey(null);
      let result: VehicleActionResult;
      if (row) result = await updateVehicle(row.id, input);
      else result = await createVehicle(id, input);
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
      title={row ? t("fleet-edit") : t("fleet-add")}
      closeLabel={t("fleet-close")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("fleet-cancel")}
          </Button>
          <Button onClick={submit} disabled={pending} data-testid="vehicles-save">
            {t("fleet-save")}
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
        <Select
          label={t("fleet-field-class")}
          hint={t("fleet-hint-class")}
          error={fieldError("fleet-failure-class-required")}
          options={classOptions}
          value={vehicleClassId}
          onChange={(e) => setVehicleClassId(e.target.value)}
          data-testid="vehicles-class"
        />
        <Input
          label={t("fleet-field-model")}
          error={fieldError("fleet-failure-model-required")}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          required
          data-testid="vehicles-model"
        />
        <Input
          label={t("fleet-field-plate")}
          hint={t("fleet-hint-plate")}
          error={fieldError("fleet-failure-plate-required") ?? fieldError("fleet-failure-duplicate")}
          value={plate}
          onChange={(e) => setPlate(e.target.value)}
          required
          dir="ltr"
          className="vt-dir-keep"
          data-testid="vehicles-plate"
        />
        <Input
          label={t("fleet-field-year")}
          hint={t("fleet-hint-year")}
          error={fieldError("fleet-failure-year")}
          type="number"
          inputMode="numeric"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          data-testid="vehicles-year"
        />
        <Counter
          label={t("fleet-field-seats")}
          error={fieldError("fleet-failure-seats")}
          value={seats}
          min={1}
          max={16}
          onChange={setSeats}
          decrementLabel={t("fleet-fewer")}
          incrementLabel={t("fleet-more")}
          data-testid="vehicles-seats"
        />
        <Counter
          label={t("fleet-field-bags")}
          error={fieldError("fleet-failure-bags")}
          value={bags}
          min={0}
          max={16}
          onChange={setBags}
          decrementLabel={t("fleet-fewer")}
          incrementLabel={t("fleet-more")}
          data-testid="vehicles-bags"
        />
        <Select
          label={t("fleet-field-status")}
          options={statusOptions}
          value={status}
          onChange={(e) => {
            const next = e.target.value;
            if (next === "service" || next === "idle" || next === "workshop") setStatus(next);
          }}
          data-testid="vehicles-status"
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
            {t("fleet-field-photo")}
          </span>
          <OpsPhotoField kind="vehicle" recordId={id} value={photoPath} onChange={setPhotoPath} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <Textarea
            label={t("fleet-field-note")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {formError ? (
          <p
            role="alert"
            data-testid="vehicles-form-error"
            style={{ gridColumn: "1 / -1", color: "var(--vt-danger)", margin: 0 }}
          >
            {formError}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
