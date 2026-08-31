"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  createReview,
  updateReview,
  type ReviewActionResult,
} from "@/app/[locale]/(ops)/ops/reviews/actions";
import { Button } from "@/components/core";
import { Dialog } from "@/components/feedback/Dialog";
import { Counter } from "@/components/forms/Counter";
import { Input } from "@/components/forms/Input";
import { Select } from "@/components/forms/Select";
import { Switch } from "@/components/forms/Switch";
import { Textarea } from "@/components/forms/Textarea";
import type { ReviewInput, ReviewRow, ReviewSource } from "@/lib/ops/reviews";
import { OpsPhotoField } from "./OpsPhotoField";
import type { ReviewClassOption } from "./ReviewTable";

export function ReviewForm({
  open,
  row,
  classOptions,
  onClose,
  onSaved,
}: {
  open: boolean;
  row: ReviewRow | null;
  classOptions: ReviewClassOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("ops");
  const [pending, startTransition] = useTransition();
  const locked = row?.locked === true;
  const recordId = row?.id ?? "new";

  const [authorName, setAuthorName] = useState(row?.authorName ?? "");
  const [authorRole, setAuthorRole] = useState(row?.authorRole ?? "");
  const [body, setBody] = useState(row?.body ?? "");
  const [rating, setRating] = useState(row?.rating ?? 5);
  const [source, setSource] = useState<ReviewSource>(row?.source ?? "manual");
  const [sourceUrl, setSourceUrl] = useState(row?.sourceUrl ?? "");
  const [routeLabel, setRouteLabel] = useState(row?.routeLabel ?? "");
  const [vehicleClassId, setVehicleClassId] = useState(row?.vehicleClassId ?? "");
  const [avatarPath, setAvatarPath] = useState<string | null>(row?.avatarPath ?? null);
  const [verified, setVerified] = useState(row?.verified ?? false);
  const [published, setPublished] = useState(row?.published ?? true);
  const [sortOrder, setSortOrder] = useState(row?.sortOrder ?? 0);
  const [externalRef, setExternalRef] = useState(row?.externalRef ?? "");
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const sourceOptions = useMemo(
    () => [
      { value: "manual", label: t("reviews-source-manual") },
      { value: "google", label: "Google" },
      { value: "tripadvisor", label: "Tripadvisor" },
      { value: "trustpilot", label: "Trustpilot" },
    ],
    [t],
  );

  const classSelectOptions = useMemo(
    () => [
      { value: "", label: t("reviews-class-none") },
      ...classOptions.map((item) => ({ value: item.id, label: item.slug })),
    ],
    [classOptions, t],
  );

  const submit = () => {
    const input: ReviewInput = {
      externalRef: externalRef ? externalRef : null,
      source,
      authorName,
      authorRole,
      body,
      rating,
      routeLabel,
      vehicleClassId: vehicleClassId ? vehicleClassId : null,
      avatarPath,
      sourceUrl: sourceUrl ? sourceUrl : null,
      verified,
      published,
      sortOrder,
    };
    startTransition(async () => {
      setErrorKey(null);
      let result: ReviewActionResult;
      if (row) result = await updateReview(row.id, input);
      else result = await createReview(input);
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
      title={row ? t("reviews-edit") : t("reviews-new")}
      closeLabel={t("reviews-close")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("reviews-cancel")}
          </Button>
          <Button onClick={submit} disabled={pending} data-testid="reviews-save">
            {t("reviews-save")}
          </Button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        {locked ? (
          <p
            data-testid="reviews-locked-note"
            style={{ margin: 0, fontSize: "var(--vt-body-sm)", color: "var(--vt-text-muted)" }}
          >
            {t("reviews-locked-note")}
          </p>
        ) : null}

        <OpsPhotoField
          kind="review"
          recordId={recordId}
          value={avatarPath}
          onChange={setAvatarPath}
          fallback={authorName}
        />

        <Input
          label={t("reviews-name")}
          value={authorName}
          onChange={(event) => setAuthorName(event.target.value)}
          disabled={locked}
          readOnly={locked}
          data-testid="reviews-name"
        />
        <Input
          label={t("reviews-role")}
          value={authorRole}
          onChange={(event) => setAuthorRole(event.target.value)}
          placeholder={t("reviews-role-ph")}
          disabled={locked}
          readOnly={locked}
          data-testid="reviews-role"
        />
        <Select
          label={t("reviews-source")}
          value={source}
          options={sourceOptions}
          onChange={(event) => setSource(event.target.value as ReviewSource)}
          disabled={locked}
          data-testid="reviews-source"
        />
        <Counter
          label={t("reviews-rating")}
          value={rating}
          min={0}
          max={5}
          onChange={setRating}
          disabled={locked}
          decrementLabel={t("reviews-rating-dec")}
          incrementLabel={t("reviews-rating-inc")}
          data-testid="reviews-rating"
        />
        <Textarea
          label={t("reviews-body")}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={t("reviews-body-ph")}
          rows={5}
          disabled={locked}
          readOnly={locked}
          data-testid="reviews-body"
        />
        <Input
          label={t("reviews-url")}
          value={sourceUrl}
          onChange={(event) => setSourceUrl(event.target.value)}
          placeholder={t("reviews-url-ph")}
          icon="external-link"
          disabled={locked}
          readOnly={locked}
          data-testid="reviews-url"
        />
        <Input
          label={t("reviews-route")}
          value={routeLabel}
          onChange={(event) => setRouteLabel(event.target.value)}
          data-testid="reviews-route"
        />
        <Select
          label={t("reviews-class")}
          value={vehicleClassId}
          options={classSelectOptions}
          onChange={(event) => setVehicleClassId(event.target.value)}
          data-testid="reviews-class"
        />
        {row ? null : (
          <Input
            label={t("reviews-external-ref")}
            value={externalRef}
            onChange={(event) => setExternalRef(event.target.value)}
            data-testid="reviews-external-ref"
          />
        )}
        <Input
          label={t("reviews-sort-order")}
          type="number"
          value={String(sortOrder)}
          onChange={(event) => setSortOrder(Number(event.target.value))}
          data-testid="reviews-sort-order"
        />
        <Switch
          label={t("reviews-verified")}
          checked={verified}
          onChange={(event) => setVerified(event.target.checked)}
        />
        <Switch
          label={t("reviews-published")}
          checked={published}
          onChange={(event) => setPublished(event.target.checked)}
        />
        {errorKey ? (
          <p
            data-testid="reviews-error"
            style={{ margin: 0, color: "var(--vt-danger)", fontSize: "var(--vt-body-sm)" }}
          >
            {errorKey === "reviews-duplicate"
              ? t("reviews-duplicate")
              : errorKey === "reviews-rating"
                ? t("reviews-rating-error", { min: 0, max: 5 })
                : errorKey === "reviews-locked"
                  ? t("reviews-locked")
                  : t("reviews-error")}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
