"use client";

import "./OpsPhotoField.css";
import { useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Avatar, Button, Icon, IconButton } from "@/components/core";
import type { IconName } from "@/components/core";
import { Alert } from "@/components/feedback/Alert";
import { ProgressIndicator } from "@/components/feedback/ProgressIndicator";
import {
  PhotoUploadError,
  assertPhotoUpload,
  photoUrl,
  type PhotoKind,
  type PhotoUploadCode,
} from "@/lib/ops/photos";

export type OpsPhotoFieldProps = {
  kind: PhotoKind;
  recordId: string;
  value: string | null;
  onChange: (key: string | null) => void;
  /** Display name for review/staff initials. Ignored for vehicle/chauffeur glyphs. */
  fallback?: string;
};

type FieldState = "empty" | "choosing" | "uploading" | "present" | "error";

const GLYPH: Record<"vehicle" | "chauffeur", IconName> = {
  vehicle: "car-front",
  chauffeur: "user",
};

const ALT_KEY: Record<PhotoKind, "alt-vehicle" | "alt-chauffeur" | "alt-review" | "alt-staff"> = {
  vehicle: "alt-vehicle",
  chauffeur: "alt-chauffeur",
  review: "alt-review",
  staff: "alt-staff",
};

const ERROR_KEY: Record<PhotoUploadCode, "error-type" | "error-size" | "error-mismatch"> = {
  type_not_allowed: "error-type",
  too_large: "error-size",
  type_mismatch: "error-mismatch",
};

function isGlyphKind(kind: PhotoKind): kind is "vehicle" | "chauffeur" {
  return kind === "vehicle" || kind === "chauffeur";
}

export function OpsPhotoField({
  kind,
  recordId,
  value,
  onChange,
  fallback,
}: OpsPhotoFieldProps) {
  const t = useTranslations("ops.photo");
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [errorCode, setErrorCode] = useState<PhotoUploadCode | "generic" | null>(null);
  const [broken, setBroken] = useState(false);

  const src = photoUrl(value);
  const showPhoto = Boolean(src) && !broken && !busy;
  const fieldState: FieldState = busy
    ? "uploading"
    : errorCode
      ? "error"
      : choosing
        ? "choosing"
        : showPhoto
          ? "present"
          : "empty";

  function openPicker() {
    setErrorCode(null);
    setChoosing(true);
    inputRef.current?.click();
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setChoosing(false);
    if (!file) return;

    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      assertPhotoUpload({ type: file.type, size: file.size, bytes });
    } catch (err) {
      if (err instanceof PhotoUploadError) {
        setErrorCode(err.code);
        return;
      }
      setErrorCode("generic");
      return;
    }

    const body = new FormData();
    body.set("kind", kind);
    body.set("recordId", recordId);
    body.set("file", file);

    setBusy(true);
    setErrorCode(null);
    try {
      const response = await fetch("/api/photos/upload", {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (
          payload?.error === "type_not_allowed" ||
          payload?.error === "too_large" ||
          payload?.error === "type_mismatch"
        ) {
          setErrorCode(payload.error);
        } else {
          setErrorCode("generic");
        }
        return;
      }
      const payload = (await response.json()) as { key?: unknown };
      if (typeof payload.key !== "string" || payload.key.length === 0) {
        setErrorCode("generic");
        return;
      }
      setBroken(false);
      onChange(payload.key);
    } catch {
      setErrorCode("generic");
    } finally {
      setBusy(false);
    }
  }

  function onRemove() {
    setBroken(false);
    setErrorCode(null);
    onChange(null);
  }

  return (
    <div className="ops-photo" data-ops-photo="" data-kind={kind} data-state={fieldState}>
      <div className="ops-photo__well">
        {showPhoto && src ? (
          <Image
            className="ops-photo__img"
            src={src}
            alt={t(ALT_KEY[kind])}
            width={96}
            height={96}
            onError={() => setBroken(true)}
          />
        ) : isGlyphKind(kind) ? (
          <Icon name={GLYPH[kind]} size={40} />
        ) : (
          <Avatar name={fallback} size="lg" shape="circle" />
        )}
        {busy ? (
          <div className="ops-photo__progress">
            <ProgressIndicator tone="charcoal" size="sm" label={t("uploading")} />
          </div>
        ) : null}
        {value && !busy ? (
          <IconButton
            className="ops-photo__remove"
            icon="x"
            label={t("remove")}
            size="md"
            variant="solid"
            onClick={onRemove}
          />
        ) : null}
      </div>
      <input
        ref={inputRef}
        className="ops-photo__file"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={t("add")}
        onChange={onFile}
        onBlur={() => setChoosing(false)}
      />
      <Button type="button" variant="secondary" size="sm" onClick={openPicker} disabled={busy}>
        {value ? t("replace") : t("add")}
      </Button>
      {errorCode ? (
        <Alert tone="danger">
          {errorCode === "generic" ? t("error-generic") : t(ERROR_KEY[errorCode])}
        </Alert>
      ) : null}
    </div>
  );
}
