"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { updateVehicleClass } from "@/app/[locale]/(ops)/ops/vehicles/actions";
import { Button } from "@/components/core";
import { Counter } from "@/components/forms/Counter";
import { Switch } from "@/components/forms/Switch";
import { vehicleClassLabelKey, type VehicleClassRow } from "@/lib/ops/fleet";

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

function ClassEditor({ row }: { row: VehicleClassRow }) {
  const tCommon = useTranslations("common");
  const t = useTranslations("ops");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [passengers, setPassengers] = useState(row.passengerCapacity);
  const [luggage, setLuggage] = useState(row.luggageCapacity);
  const [sortOrder, setSortOrder] = useState(row.sortOrder);
  const [active, setActive] = useState(row.active);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const label = classLabel(row.slug, tCommon, t("fleet-class-gap"));

  const save = () => {
    startTransition(async () => {
      setErrorKey(null);
      const result = await updateVehicleClass(row.id, {
        passengerCapacity: passengers,
        luggageCapacity: luggage,
        sortOrder,
        active,
      });
      if (!result.ok) {
        setErrorKey(result.key);
        return;
      }
      router.refresh();
    });
  };

  const errorCopy =
    errorKey === "fleet-failure-passengers"
      ? t("fleet-failure-passengers", { min: 1, max: 16 })
      : errorKey === "fleet-failure-luggage"
        ? t("fleet-failure-luggage", { min: 0, max: 16 })
        : errorKey === "fleet-failure-class-has-vehicles"
          ? t("fleet-failure-class-has-vehicles")
          : errorKey
            ? t("fleet-failure-error")
            : null;

  return (
    <article
      data-testid={`vehicle-class-${row.slug}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: 20,
        background: "var(--vt-bg-surface)",
        border: "1px solid var(--vt-border-subtle)",
        borderRadius: "var(--vt-radius-lg)",
        minInlineSize: 0,
      }}
    >
      <header style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
        <h3
          style={{
            margin: 0,
            fontFamily: "var(--vt-font-display)",
            fontSize: "var(--vt-heading-4, var(--vt-heading-2))",
            fontWeight: "var(--vt-weight-semibold)",
          }}
        >
          {label.labelled ? label.text : <span data-tok>{label.text}</span>}
        </h3>
        <span style={{ fontSize: "var(--vt-body-xs)", color: "var(--vt-text-muted)" }}>
          {t("fleet-class-vehicles", { count: row.vehicleCount })}
        </span>
      </header>
      <div
        style={{
          display: "grid",
          gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        }}
      >
        <Counter
          label={t("fleet-class-passengers")}
          value={passengers}
          min={1}
          max={16}
          onChange={setPassengers}
          decrementLabel={t("fleet-fewer")}
          incrementLabel={t("fleet-more")}
          error={errorKey === "fleet-failure-passengers" ? t("fleet-failure-passengers", { min: 1, max: 16 }) : undefined}
          data-testid={`vehicle-class-passengers-${row.slug}`}
        />
        <Counter
          label={t("fleet-class-luggage")}
          value={luggage}
          min={0}
          max={16}
          onChange={setLuggage}
          decrementLabel={t("fleet-fewer")}
          incrementLabel={t("fleet-more")}
          error={errorKey === "fleet-failure-luggage" ? t("fleet-failure-luggage", { min: 0, max: 16 }) : undefined}
          data-testid={`vehicle-class-luggage-${row.slug}`}
        />
        <Counter
          label={t("fleet-class-sort")}
          value={sortOrder}
          min={0}
          max={99}
          onChange={setSortOrder}
          decrementLabel={t("fleet-fewer")}
          incrementLabel={t("fleet-more")}
        />
      </div>
      <Switch
        label={t("fleet-class-active")}
        checked={active}
        onChange={(e) => setActive(e.target.checked)}
        data-testid={`vehicle-class-active-${row.slug}`}
      />
      {errorCopy && errorKey !== "fleet-failure-passengers" && errorKey !== "fleet-failure-luggage" ? (
        <p role="alert" data-testid={`vehicle-class-error-${row.slug}`} style={{ margin: 0, color: "var(--vt-danger)" }}>
          {errorCopy}
        </p>
      ) : null}
      <div>
        <Button onClick={save} disabled={pending} data-testid={`vehicle-class-save-${row.slug}`}>
          {t("fleet-class-save")}
        </Button>
      </div>
    </article>
  );
}

export function VehicleClassPanel({ classes }: { classes: VehicleClassRow[] }) {
  const t = useTranslations("ops");
  return (
    <div data-testid="vehicle-class-panel" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <p
        style={{
          margin: 0,
          maxInlineSize: "78ch",
          fontSize: "var(--vt-body-sm)",
          lineHeight: 1.6,
          color: "var(--vt-text-secondary)",
        }}
      >
        {t("fleet-class-lede")}
      </p>
      {classes.map((row) => (
        <ClassEditor key={row.id} row={row} />
      ))}
    </div>
  );
}
