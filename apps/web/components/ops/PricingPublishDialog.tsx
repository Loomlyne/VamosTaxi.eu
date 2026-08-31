"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/core";
import { Alert } from "@/components/feedback/Alert";
import { Dialog } from "@/components/feedback/Dialog";
import { publishRateVersion } from "@/app/[locale]/(ops)/ops/pricing/actions";
import type { CompletenessGap } from "@/lib/ops/pricing";
import type { OpsDbFailure } from "@/lib/ops/sqlstate";

export type PricingPublishDialogProps = {
  versionId: number | null;
  inert: boolean;
};

function failureCopy(t: (key: string) => string, failure: OpsDbFailure): string {
  if (failure.kind === "unknown") return t("pricing.failure-unknown");
  return t(failure.key);
}

const actionsStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  justifyContent: "flex-end",
  gap: 8,
};

export function PricingPublishDialog({ versionId, inert }: PricingPublishDialogProps) {
  const t = useTranslations("ops");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<OpsDbFailure | null>(null);
  const [gaps, setGaps] = useState<CompletenessGap[]>([]);

  const disabled = inert || versionId == null || busy;

  async function confirm() {
    if (versionId == null || busy) return;
    setBusy(true);
    const result = await publishRateVersion(versionId);
    setBusy(false);
    if (result.ok) {
      setOpen(false);
      setFailure(null);
      setGaps([]);
      router.refresh();
      return;
    }
    setFailure(result.failure);
    setGaps(result.gaps);
  }

  return (
    <div>
      <Button
        type="button"
        variant="primary"
        disabled={disabled}
        data-ops-publish="1"
        aria-disabled={disabled || undefined}
        title={inert ? t("pricing.publish-inert") : undefined}
        onClick={() => {
          if (disabled) return;
          setFailure(null);
          setGaps([]);
          setOpen(true);
        }}
      >
        {t("pricing.publish")}
      </Button>
      <Dialog
        open={open}
        size="md"
        title={t("pricing.dialog-title")}
        closeLabel={t("pricing.close")}
        onClose={() => setOpen(false)}
        footer={
          <div style={actionsStyle}>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("pricing.dialog-cancel")}
            </Button>
            <Button type="button" variant="primary" disabled={busy} onClick={confirm} data-ops-publish-confirm="1">
              {t("pricing.dialog-confirm")}
            </Button>
          </div>
        }
      >
        <p>{t("pricing.dialog-body")}</p>
        {failure ? (
          <Alert tone="danger" title={t("pricing.incomplete")} data-ops-publish-failure={failure.kind}>
            {failureCopy(t, failure)}
            {gaps.length > 0 ? (
              <p data-ops-blocked-rows="1">{t("pricing.blocked-rows", { names: gaps.map((gap) => gap.name).join(", ") })}</p>
            ) : null}
          </Alert>
        ) : null}
      </Dialog>
    </div>
  );
}
