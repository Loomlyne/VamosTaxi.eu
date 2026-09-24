"use client";

// Two-button banner: Accept (accept_all + Turnstile) and Dismiss (reject_all, no Turnstile).
// D-05: no fake toggles. Do not port the DC prefs modal.

import "./CookieBanner.css";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createNavigation } from "next-intl/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { Button } from "@/components/core";
import { Alert } from "@/components/feedback";
import { TurnstileWidget } from "@/components/forms/TurnstileWidget";
import { PendingSlot } from "@/components/legal";

const { Link } = createNavigation(routing);

export const CONSENT_RECORDED_EVENT = "vamos:consent-recorded";

export type ConsentPostMethod = "accept_all" | "reject_all" | "settings_change";

export async function postConsentRecord(input: {
  method: ConsentPostMethod;
  locale: string;
  turnstileToken?: string;
  idempotencyKey?: string;
}): Promise<{ ok: true } | { ok: false; code: string; status: number }> {
  const res = await fetch("/api/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      method: input.method,
      locale: input.locale,
      ...(input.turnstileToken ? { turnstileToken: input.turnstileToken } : {}),
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    }),
  });
  const json = (await res.json().catch(() => null)) as { ok?: boolean; code?: string } | null;
  if (res.ok && json?.ok) return { ok: true };
  return { ok: false, code: json?.code ?? "unavailable", status: res.status };
}

function errorCopy(
  code: string,
  tCommon: (key: string) => string,
  tQuote: (key: string) => string,
): string {
  if (code === "rate_limited") return tQuote("error.rate_limited");
  return tCommon("form-challenge-failed");
}

/** Footer `vamos:cookie-prefs` → POST settings_change. Never opens a prefs grid. */
export function CookiePrefsListener() {
  const locale = useLocale();
  useEffect(() => {
    function onPrefs() {
      void postConsentRecord({ method: "settings_change", locale }).then((result) => {
        if (result.ok) window.dispatchEvent(new Event(CONSENT_RECORDED_EVENT));
      });
    }
    window.addEventListener("vamos:cookie-prefs", onPrefs);
    return () => window.removeEventListener("vamos:cookie-prefs", onPrefs);
  }, [locale]);
  return null;
}

export function CookieSettingsChangeButton({ label }: { label: string }) {
  const locale = useLocale() as Locale;
  const t = useTranslations("cookies");
  const tCommon = useTranslations("common");
  const tQuote = useTranslations("quote");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onClick() {
    setError(null);
    setDone(false);
    setBusy(true);
    try {
      const result = await postConsentRecord({ method: "settings_change", locale });
      if (result.ok) {
        window.dispatchEvent(new Event(CONSENT_RECORDED_EVENT));
        setDone(true);
        return;
      }
      setError(result.code);
    } catch {
      setError("unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error ? (
        <div className="vt-ck-alert" role="alert">
          <Alert tone="danger" title={errorCopy(error, tCommon, tQuote)} />
        </div>
      ) : null}
      {done ? (
        <div className="vt-ck-alert" role="status">
          <Alert tone="success" title={t("choice-recorded")} />
        </div>
      ) : null}
      <Button variant="secondary" size="md" type="button" disabled={busy} onClick={() => void onClick()}>
        {label}
      </Button>
    </div>
  );
}

export function CookieBanner({ siteKey }: { siteKey: string | undefined }) {
  const t = useTranslations("cookies");
  const tCommon = useTranslations("common");
  const tQuote = useTranslations("quote");
  const locale = useLocale() as Locale;
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [resetNonce, setResetNonce] = useState(0);

  useEffect(() => {
    function onRecorded() {
      setHidden(true);
    }
    window.addEventListener(CONSENT_RECORDED_EVENT, onRecorded);
    return () => window.removeEventListener(CONSENT_RECORDED_EVENT, onRecorded);
  }, []);

  function resetChallenge() {
    setTurnstileToken(null);
    setResetNonce((n) => n + 1);
    setIdempotencyKey(crypto.randomUUID());
  }

  async function submit(method: "accept_all" | "reject_all") {
    setError(null);
    setBusy(true);
    try {
      const result = await postConsentRecord({
        method,
        locale,
        ...(method === "accept_all"
          ? { turnstileToken: turnstileToken ?? "", idempotencyKey }
          : {}),
      });
      if (result.ok) {
        window.dispatchEvent(new Event(CONSENT_RECORDED_EVENT));
        setHidden(true);
        return;
      }
      setError(result.code);
      if (method === "accept_all") resetChallenge();
    } catch {
      setError("unavailable");
      if (method === "accept_all") resetChallenge();
    } finally {
      setBusy(false);
    }
  }

  if (hidden) return null;

  return (
    <div
      className="vt-ck-banner"
      data-ck-banner="1"
      role="region"
      aria-label={t("cookie-choices")}
    >
      <div className="vt-ck-sheet" data-ck-sheet="1">
        <p className="vt-ck-kicker">{tCommon("cookies")}</p>
        <h2 className="vt-ck-title">{t("necessary-cookies-only")}</h2>
        <div className="vt-ck-meta" data-meta-slot="banner">
          <PendingSlot label="Meta banner line" />
        </div>
        <p className="vt-ck-body">
          {t("banner-body")}{" "}
          <Link href="/cookies" className="vt-ck-link">
            {tCommon("cookie-policy")}
          </Link>
          .
        </p>
        {error ? (
          <div className="vt-ck-alert" role="alert">
            <Alert tone="danger" title={errorCopy(error, tCommon, tQuote)} />
          </div>
        ) : null}
        <div className="vt-ck-turnstile" data-action="consent">
          <TurnstileWidget
            siteKey={siteKey}
            action="consent"
            onToken={setTurnstileToken}
            resetNonce={resetNonce}
          />
        </div>
        <div className="vt-ck-acts" data-ck-acts="1">
          <Button
            variant="primary"
            size="md"
            type="button"
            disabled={busy}
            onClick={() => void submit("accept_all")}
          >
            {t("accept")}
          </Button>
          <Button
            variant="ghost"
            size="md"
            type="button"
            disabled={busy}
            onClick={() => void submit("reject_all")}
          >
            {tCommon("dismiss")}
          </Button>
        </div>
      </div>
    </div>
  );
}
