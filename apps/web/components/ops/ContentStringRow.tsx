"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@/components/core";
import { Textarea } from "@/components/forms";
import { ContentFlagControls } from "./ContentFlagControls";
import {
  setContentStringFlags,
  updateContentString,
} from "@/app/[locale]/(ops)/ops/content/actions";
import type { ContentStringRow as ContentStringRowData } from "@/lib/ops/content";

function CellValue({
  pendingValue,
  children,
}: {
  pendingValue: boolean;
  children: string;
}) {
  if (pendingValue) {
    return <span data-tok>{children}</span>;
  }
  return <>{children}</>;
}

export function ContentStringRow({ row }: { row: ContentStringRowData }) {
  const t = useTranslations("ops");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [en, setEn] = useState(row.en);
  const [de, setDe] = useState(row.de ?? "");
  const [fr, setFr] = useState(row.fr ?? "");
  const [ar, setAr] = useState(row.ar ?? "");
  const [pendingValue, setPendingValue] = useState(row.pendingValue);
  const [nonTranslatable, setNonTranslatable] = useState(row.nonTranslatable);
  const [noParamReason, setNoParamReason] = useState(row.noParamReason);

  useEffect(() => {
    setEn(row.en);
    setDe(row.de ?? "");
    setFr(row.fr ?? "");
    setAr(row.ar ?? "");
    setPendingValue(row.pendingValue);
    setNonTranslatable(row.nonTranslatable);
    setNoParamReason(row.noParamReason);
    setErrorKey(null);
  }, [row]);

  const nullIfEmpty = (value: string): string | null => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const save = async () => {
    setSaving(true);
    setErrorKey(null);
    const values = {
      en,
      de: nullIfEmpty(de),
      fr: nullIfEmpty(fr),
      ar: nullIfEmpty(ar),
    };
    const written = await updateContentString(row.key, values);
    if (!written.ok) {
      setErrorKey(written.key);
      setSaving(false);
      return;
    }
    const flagged = await setContentStringFlags(row.key, {
      pendingValue,
      nonTranslatable,
      noParamReason,
    });
    if (!flagged.ok) {
      setErrorKey(flagged.key);
      setSaving(false);
      return;
    }
    setSaving(false);
    setEditing(false);
  };

  return (
    <tr data-content-key={row.key} data-editing={editing ? "1" : undefined}>
      <td>
        <span className="ops-content__key vt-dir-keep" dir="ltr">
          {row.key}
        </span>
      </td>
      <td>
        {editing ? (
          <Textarea
            rows={2}
            value={en}
            onChange={(event) => setEn(event.target.value)}
            aria-label={t("content-en")}
          />
        ) : (
          <CellValue pendingValue={pendingValue}>{row.en}</CellValue>
        )}
      </td>
      <td>
        {editing ? (
          <Textarea
            rows={2}
            value={de}
            onChange={(event) => setDe(event.target.value)}
            aria-label={t("content-de")}
          />
        ) : row.de != null ? (
          <CellValue pendingValue={pendingValue}>{row.de}</CellValue>
        ) : (
          "—"
        )}
      </td>
      <td>
        {editing ? (
          <Textarea
            rows={2}
            value={fr}
            onChange={(event) => setFr(event.target.value)}
            aria-label={t("content-fr")}
          />
        ) : row.fr != null ? (
          <CellValue pendingValue={pendingValue}>{row.fr}</CellValue>
        ) : (
          "—"
        )}
      </td>
      <td>
        {editing ? (
          <Textarea
            rows={2}
            value={ar}
            onChange={(event) => setAr(event.target.value)}
            aria-label={t("content-ar")}
          />
        ) : row.ar != null ? (
          <CellValue pendingValue={pendingValue}>{row.ar}</CellValue>
        ) : (
          "—"
        )}
      </td>
      <td>
        {editing ? (
          <div className="ops-content__edit">
            <ContentFlagControls
              pendingValue={pendingValue}
              nonTranslatable={nonTranslatable}
              noParamReason={noParamReason}
              onPendingValue={setPendingValue}
              onNonTranslatable={setNonTranslatable}
              onNoParamReason={setNoParamReason}
              pendingLabel={t("content-pending")}
              pendingHint={t("content-pending-hint")}
              nonTranslatableLabel={t("content-non-translatable")}
              nonTranslatableHint={t("content-non-translatable-hint")}
              noParamLabel={t("content-no-param-reason")}
              noParamHint={t("content-no-param-hint")}
              noParamClear={t("content-no-param-clear")}
              disabled={saving}
            />
            {errorKey ? (
              <p className="ops-content__error" role="alert">
                {t(errorKey)}
              </p>
            ) : null}
            <div className="ops-content__edit-actions">
              <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
                {saving ? t("content-saving") : t("save")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setErrorKey(null);
                  setEn(row.en);
                  setDe(row.de ?? "");
                  setFr(row.fr ?? "");
                  setAr(row.ar ?? "");
                  setPendingValue(row.pendingValue);
                  setNonTranslatable(row.nonTranslatable);
                  setNoParamReason(row.noParamReason);
                }}
              >
                {t("cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="ops-content__chips">
            {row.pendingValue ? (
              <Badge tone="outline">{t("content-pending")}</Badge>
            ) : null}
            {row.nonTranslatable ? (
              <Badge tone="neutral">{t("content-non-translatable")}</Badge>
            ) : null}
            {row.noParamReason != null ? (
              <Badge tone="info">{t("content-no-param-reason")}</Badge>
            ) : null}
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
              {t("edit")}
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}
