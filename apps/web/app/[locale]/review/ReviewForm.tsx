"use client";

// Submit review. Thank you. Company, Chauffeur, Overall.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@/components/core";
import { Textarea } from "@/components/forms";
import { Alert } from "@/components/feedback";
import { TurnstileWidget } from "@/components/forms/TurnstileWidget";
import type { Locale } from "@/i18n/routing";

type StarKey = "company" | "chauffeur" | "overall";

export type ReviewFormProps = {
  siteKey: string | undefined;
  locale: Locale;
  token: string;
  bookingRef: string;
};

function StarRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="vt-review-stars__row">
      <span className="vt-review-stars__label">{label}</span>
      <div className="vt-review-stars__btns" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n}`}
            disabled={disabled}
            onClick={() => onChange(n)}
          >
            <Icon
              name="star"
              size={22}
              color={n <= value ? "var(--vt-yellow)" : "var(--vt-grey-300)"}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export function ReviewForm({ siteKey, locale, token, bookingRef }: ReviewFormProps) {
  const t = useTranslations("reviews");
  const [company, setCompany] = useState(0);
  const [chauffeur, setChauffeur] = useState(0);
  const [overall, setOverall] = useState(0);
  const [comment, setComment] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [resetNonce, setResetNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setStar = (key: StarKey, n: number) => {
    if (key === "company") setCompany(n);
    else if (key === "chauffeur") setChauffeur(n);
    else setOverall(n);
  };

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (company < 1 || chauffeur < 1 || overall < 1) {
      setError("invalid-rating");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/reviews/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          token: token || undefined,
          bookingRef: bookingRef || undefined,
          company,
          chauffeur,
          overall,
          comment: comment.trim() || undefined,
          turnstileToken,
          idempotencyKey,
          locale,
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; code?: string } | null;
      if (res.ok && json?.ok) {
        setThanks(true);
        return;
      }
      if (json?.code === "already-reviewed") {
        setThanks(true);
        return;
      }
      setError(json?.code ?? "unknown");
      setTurnstileToken(null);
      setResetNonce((n) => n + 1);
    } catch {
      setError("unknown");
    } finally {
      setBusy(false);
    }
  }

  if (thanks) {
    return (
      <div className="vt-review-thanks" role="status" aria-live="polite">
        <Icon name="circle-check" size={28} color="var(--vt-success)" />
        <h2>{t("thank-you-your-review-is-in")}</h2>
      </div>
    );
  }

  const errorCopy =
    error === "not-reviewable"
      ? t("not-reviewable")
      : error === "not-found"
        ? t("we-could-not-find-this-booking-check-the")
        : error === "invalid-rating"
          ? t("company")
          : error
            ? t("not-reviewable")
            : null;

  return (
    <form className="vt-review-card" noValidate onSubmit={onSubmit}>
      {errorCopy ? (
        <div role="alert">
          <Alert tone="danger" title={errorCopy} />
        </div>
      ) : null}

      <div className="vt-review-stars">
        <StarRow
          label={t("company")}
          value={company}
          onChange={(n) => setStar("company", n)}
          disabled={busy}
        />
        <StarRow
          label={t("chauffeur")}
          value={chauffeur}
          onChange={(n) => setStar("chauffeur", n)}
          disabled={busy}
        />
        <StarRow
          label={t("overall")}
          value={overall}
          onChange={(n) => setStar("overall", n)}
          disabled={busy}
        />
      </div>

      <Textarea
        id="review-comment"
        name="comment"
        label={t("comment-optional")}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        disabled={busy}
        rows={4}
      />

      <TurnstileWidget
        siteKey={siteKey}
        action="contact"
        onToken={setTurnstileToken}
        resetNonce={resetNonce}
      />

      <div className="vt-review-actions">
        <Button variant="primary" size="md" type="submit" disabled={busy}>
          {t("submit-review")}
        </Button>
      </div>
    </form>
  );
}
