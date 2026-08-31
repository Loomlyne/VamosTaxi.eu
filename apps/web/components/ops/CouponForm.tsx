"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createCoupon, updateCoupon, type CouponActionResult } from "@/app/[locale]/(ops)/ops/coupons/actions";
import { Button } from "@/components/core";
import { Dialog } from "@/components/feedback/Dialog";
import { Counter } from "@/components/forms/Counter";
import { Input } from "@/components/forms/Input";
import { Select } from "@/components/forms/Select";
import { Switch } from "@/components/forms/Switch";
import { Textarea } from "@/components/forms/Textarea";
import type { CouponInput, CouponKind, CouponRow } from "@/lib/ops/coupons";

function dateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function toIsoDate(value: string): string | null {
  if (!value) return null;
  return `${value}T00:00:00.000Z`;
}

export function CouponForm({
  open,
  row,
  onClose,
  onSaved,
}: {
  open: boolean;
  row: CouponRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("ops");
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState(row?.code ?? "");
  const [kind, setKind] = useState<CouponKind>(row?.kind ?? "percent");
  const [percent, setPercent] = useState<string>(row?.percent == null ? "" : String(row.percent));
  const [amountRappen, setAmountRappen] = useState<string>(
    row?.amountRappen == null ? "" : String(row.amountRappen),
  );
  const [validFrom, setValidFrom] = useState(dateInputValue(row?.validFrom ?? null));
  const [validUntil, setValidUntil] = useState(dateInputValue(row?.validUntil ?? null));
  const [globalUnlimited, setGlobalUnlimited] = useState(row?.globalLimit == null);
  const [globalLimit, setGlobalLimit] = useState(row?.globalLimit ?? 0);
  const [perUserUnlimited, setPerUserUnlimited] = useState(row?.perUserLimit == null);
  const [perUserLimit, setPerUserLimit] = useState(row?.perUserLimit ?? 0);
  const [active, setActive] = useState(row?.active ?? true);
  const [note, setNote] = useState(row?.note ?? "");
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const kindOptions = useMemo(
    () => [
      { value: "percent", label: t("coupons-kind-percent") },
      { value: "amount", label: t("coupons-kind-amount") },
    ],
    [t],
  );

  const messageFor = (key: string): string => {
    switch (key) {
      case "coupons-code-required":
        return t("coupons-code-required");
      case "coupons-duplicate":
        return t("coupons-duplicate");
      case "coupons-percent-range":
        return t("coupons-percent-range");
      case "coupons-percent-decimals":
        return t("coupons-percent-decimals");
      case "coupons-rappen-integer":
        return t("coupons-rappen-integer");
      case "coupons-window":
        return t("coupons-window");
      case "coupons-kind-exclusive":
        return t("coupons-kind-exclusive");
      case "coupons-constraint":
        return t("coupons-constraint");
      case "coupons-limit-integer":
        return t("coupons-limit-integer");
      default:
        return t("coupons-error");
    }
  };
  const fieldError = (key: string) => (errorKey === key ? messageFor(key) : undefined);
  const formError =
    errorKey &&
    errorKey !== "coupons-code-required" &&
    errorKey !== "coupons-duplicate" &&
    errorKey !== "coupons-percent-range" &&
    errorKey !== "coupons-percent-decimals" &&
    errorKey !== "coupons-rappen-integer" &&
    errorKey !== "coupons-window"
      ? messageFor(errorKey)
      : undefined;

  const selectKind = (next: CouponKind) => {
    setKind(next);
    if (next === "percent") setAmountRappen("");
    else setPercent("");
  };

  const submit = () => {
    const normalised = code.trim().toUpperCase();
    setCode(normalised);
    const input: CouponInput = {
      code: normalised,
      kind,
      percent: kind === "percent" && percent !== "" ? Number(percent) : null,
      amountRappen: kind === "amount" && amountRappen !== "" ? Number(amountRappen) : null,
      validFrom: toIsoDate(validFrom),
      validUntil: toIsoDate(validUntil),
      globalLimit: globalUnlimited ? null : globalLimit,
      perUserLimit: perUserUnlimited ? null : perUserLimit,
      active,
      note,
    };
    startTransition(async () => {
      setErrorKey(null);
      let result: CouponActionResult;
      if (row) result = await updateCoupon(row.id, input);
      else result = await createCoupon(input);
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
      title={row ? t("coupons-edit") : t("coupons-add")}
      closeLabel={t("coupons-close")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("coupons-cancel")}
          </Button>
          <Button onClick={submit} disabled={pending} data-testid="coupons-save">
            {t("coupons-save")}
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
        <Input
          label={t("coupons-field-code")}
          hint={t("coupons-hint-code")}
          error={fieldError("coupons-code-required") ?? fieldError("coupons-duplicate")}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          autoCapitalize="characters"
          data-testid="coupons-code"
        />
        <Select
          label={t("coupons-field-kind")}
          options={kindOptions}
          value={kind}
          onChange={(e) => selectKind(e.target.value === "amount" ? "amount" : "percent")}
          data-testid="coupons-kind"
        />
        <Input
          label={t("coupons-field-percent")}
          hint={t("coupons-hint-percent")}
          error={fieldError("coupons-percent-range") ?? fieldError("coupons-percent-decimals")}
          type="number"
          inputMode="decimal"
          value={kind === "percent" ? percent : ""}
          disabled={kind !== "percent"}
          onChange={(e) => setPercent(e.target.value)}
          data-testid="coupons-percent"
        />
        <Input
          label={t("coupons-field-amount")}
          hint={t("coupons-hint-amount")}
          error={fieldError("coupons-rappen-integer")}
          type="number"
          inputMode="numeric"
          value={kind === "amount" ? amountRappen : ""}
          disabled={kind !== "amount"}
          onChange={(e) => setAmountRappen(e.target.value)}
          data-testid="coupons-amount"
        />
        <Input
          label={t("coupons-field-valid-from")}
          type="date"
          value={validFrom}
          onChange={(e) => setValidFrom(e.target.value)}
          data-testid="coupons-valid-from"
        />
        <Input
          label={t("coupons-field-valid-until")}
          hint={t("coupons-hint-expires")}
          error={fieldError("coupons-window")}
          type="date"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
          data-testid="coupons-valid-until"
        />
        <div>
          <Counter
            label={t("coupons-field-global-limit")}
            value={globalUnlimited ? 0 : globalLimit}
            min={0}
            max={9999}
            disabled={globalUnlimited}
            onChange={setGlobalLimit}
            decrementLabel={t("coupons-limit-dec")}
            incrementLabel={t("coupons-limit-inc")}
          />
          <Switch
            label={t("coupons-unlimited")}
            checked={globalUnlimited}
            onChange={(e) => setGlobalUnlimited(e.target.checked)}
            data-testid="coupons-global-unlimited"
          />
        </div>
        <div>
          <Counter
            label={t("coupons-field-per-user-limit")}
            value={perUserUnlimited ? 0 : perUserLimit}
            min={0}
            max={9999}
            disabled={perUserUnlimited}
            onChange={setPerUserLimit}
            decrementLabel={t("coupons-limit-dec")}
            incrementLabel={t("coupons-limit-inc")}
          />
          <Switch
            label={t("coupons-unlimited")}
            checked={perUserUnlimited}
            onChange={(e) => setPerUserUnlimited(e.target.checked)}
          />
        </div>
        <Switch
          label={t("coupons-field-active")}
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        <div style={{ gridColumn: "1 / -1" }}>
          <Textarea
            label={t("coupons-field-note")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {formError ? (
          <p
            role="alert"
            data-testid="coupons-form-error"
            style={{ gridColumn: "1 / -1", color: "var(--vt-danger)", margin: 0 }}
          >
            {formError}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
