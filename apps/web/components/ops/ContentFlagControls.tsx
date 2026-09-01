"use client";

import { Button } from "@/components/core";
import { Input, Switch } from "@/components/forms";

export function ContentFlagControls({
  pendingValue,
  nonTranslatable,
  noParamReason,
  onPendingValue,
  onNonTranslatable,
  onNoParamReason,
  pendingLabel,
  pendingHint,
  nonTranslatableLabel,
  nonTranslatableHint,
  noParamLabel,
  noParamHint,
  noParamClear,
  disabled = false,
}: {
  pendingValue: boolean;
  nonTranslatable: boolean;
  noParamReason: string | null;
  onPendingValue: (value: boolean) => void;
  onNonTranslatable: (value: boolean) => void;
  onNoParamReason: (value: string | null) => void;
  pendingLabel: string;
  pendingHint: string;
  nonTranslatableLabel: string;
  nonTranslatableHint: string;
  noParamLabel: string;
  noParamHint: string;
  noParamClear: string;
  disabled?: boolean;
}) {
  return (
    <div className="ops-content__flags" data-content-flags="1">
      <div className="ops-content__flag">
        <Switch
          label={pendingLabel}
          checked={pendingValue}
          disabled={disabled}
          onChange={(event) => onPendingValue(event.target.checked)}
        />
        <p className="ops-content__flag-hint">{pendingHint}</p>
      </div>
      <div className="ops-content__flag">
        <Switch
          label={nonTranslatableLabel}
          checked={nonTranslatable}
          disabled={disabled}
          onChange={(event) => onNonTranslatable(event.target.checked)}
        />
        <p className="ops-content__flag-hint">{nonTranslatableHint}</p>
      </div>
      <div className="ops-content__flag">
        <Input
          label={noParamLabel}
          hint={noParamHint}
          value={noParamReason ?? ""}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value;
            onNoParamReason(next.length > 0 ? next : null);
          }}
        />
        {noParamReason != null ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onNoParamReason(null)}
          >
            {noParamClear}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
