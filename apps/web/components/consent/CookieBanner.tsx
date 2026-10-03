"use client";

// Cookie banner ported from app/pages/CookieBanner.dc.html (27-UI-SPEC, D-04, D-09).
// The server is the record: state comes from the state route (GET), every choice goes
// through POST /api/consent with the categories chosen. localStorage is a display cache only.
// Nothing here talks to Meta.

import "./CookieBanner.css";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createNavigation } from "next-intl/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { Button, Icon } from "@/components/core";
import { trapTab } from "@/lib/a11y/focus-trap";
import { Alert } from "@/components/feedback";
import { Switch } from "@/components/forms";
import { TurnstileWidget } from "@/components/forms/TurnstileWidget";
import { loadWebAnalytics } from "@/lib/consent/web-analytics";

const { Link } = createNavigation(routing);

export const CONSENT_RECORDED_EVENT = "vamos:consent-recorded";
const PREFS_EVENT = "vamos:cookie-prefs";
const CACHE_KEY = "vamosCookieConsent";

export type ConsentPostMethod = "accept_all" | "reject_all" | "settings_change";

type Cats = { functional: boolean; analytics: boolean; marketing: boolean };
type Mode = "unknown" | "banner" | "hidden";
type Origin = "card" | "sheet";
type StateReply = { chosen?: boolean; policyVersion?: string; choice?: Partial<Cats> };

/**
 * POSTs one consent choice to /api/consent.
 * @param input chosen method and the three categories; Turnstile token only when marketing is on
 * @returns ok, or the server error code
 */
export async function postConsentRecord(input: {
  method: ConsentPostMethod;
  locale: string;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
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
      functional: input.functional,
      analytics: input.analytics,
      marketing: input.marketing,
      ...(input.turnstileToken ? { turnstileToken: input.turnstileToken } : {}),
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    }),
  });
  const json = (await res.json().catch(() => null)) as { ok?: boolean; code?: string } | null;
  if (res.ok && json?.ok) return { ok: true };
  return { ok: false, code: json?.code ?? "unavailable", status: res.status };
}

/** Cookies-page style button: only opens the preferences sheet, never writes a row (D-10). */
export function CookieSettingsChangeButton({ label }: { label: string }) {
  return (
    <Button
      variant="secondary"
      size="md"
      type="button"
      onClick={() => window.dispatchEvent(new Event(PREFS_EVENT))}
    >
      {label}
    </Button>
  );
}

function writeCache(version: string | null, method: ConsentPostMethod, cats: Cats): void {
  if (!version) return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ v: version, method, ...cats, at: new Date().toISOString() }));
  } catch {
    /* storage unavailable: the server still holds the record */
  }
}

/** Below this width the card can sit over the sticky pay bar (checkout) or the page end. */
function reserveBreakpoint(): number {
  const path = window.location.pathname.replace(/^\/(de|fr|ar)(?=\/|$)/, "");
  return path.startsWith("/checkout") || path.startsWith("/confirmation") ? 1081 : 640;
}

type Row = {
  key: string;
  title: string;
  aria: string;
  body: ReactNode;
  meta?: [string, string];
  always?: boolean;
  checked: boolean;
  set?: (v: boolean) => void;
};

export function CookieBanner({ siteKey }: { siteKey: string | undefined }) {
  const t = useTranslations("cookies");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;

  const [mode, setMode] = useState<Mode>("unknown");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"save" | "check" | null>(null);
  const [cats, setCats] = useState<Cats>({ functional: false, analytics: false, marketing: false });
  const [pending, setPending] = useState<Origin | null>(null);
  const [resetNonce, setResetNonce] = useState(0);

  const versionRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const pendingRef = useRef<{ method: ConsentPostMethod; cats: Cats; key: string } | null>(null);
  const keyRef = useRef<string>("");
  const cardRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const newKey = () => (keyRef.current = crypto.randomUUID());

  // Read the server's answer once. Nothing paints before it; a failed check shows the banner (D-33).
  useEffect(() => {
    let live = true;
    fetch("/api/consent/state", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<StateReply>) : Promise.reject(new Error("state"))))
      .then((j) => {
        if (!live) return;
        versionRef.current = typeof j.policyVersion === "string" ? j.policyVersion : null;
        if (j.chosen && j.choice) {
          if (j.choice.analytics === true) loadWebAnalytics();
          setCats({
            functional: j.choice.functional === true,
            analytics: j.choice.analytics === true,
            marketing: j.choice.marketing === true,
          });
          setMode("hidden");
        } else {
          setMode("banner");
        }
      })
      .catch(() => {
        if (live) setMode("banner");
      });
    return () => {
      live = false;
    };
  }, []);

  // Footer "Cookie preferences": open the sheet on the saved choice. Never writes.
  useEffect(() => {
    function onPrefs() {
      openerRef.current = (document.activeElement as HTMLElement | null) ?? null;
      setError(null);
      setSheetOpen(true);
    }
    function onRecorded() {
      setMode("hidden");
    }
    window.addEventListener(PREFS_EVENT, onPrefs);
    window.addEventListener(CONSENT_RECORDED_EVENT, onRecorded);
    return () => {
      window.removeEventListener(PREFS_EVENT, onPrefs);
      window.removeEventListener(CONSENT_RECORDED_EVENT, onRecorded);
    };
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    const el = openerRef.current;
    openerRef.current = null;
    if (el && typeof el.focus === "function") el.focus();
    // 26.2 audit U06-6: the opener can be gone (a choice on the card unmounts the card's buttons,
    // or the sheet was opened without one). If focus fell to <body>, put it on <main>.
    window.requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && active !== document.body) return;
      const main = document.querySelector<HTMLElement>("main");
      if (!main) return;
      if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
      main.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    if (!sheetOpen) return;
    dialogRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busyRef.current) closeSheet();
      else if (e.key === "Tab") trapTab(e, dialogRef.current); // 26.2 audit U06-6
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen, closeSheet]);

  // Reserve room under the card so it never covers Pay: --vt-ck-reserve on <html>.
  const showCard = mode === "banner";
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!showCard) {
      root.style.removeProperty("--vt-ck-reserve");
      return;
    }
    function measure() {
      const card = cardRef.current;
      const w = window.innerWidth;
      if (!card || w >= reserveBreakpoint()) {
        root.style.removeProperty("--vt-ck-reserve");
        return;
      }
      const inset = w >= 640 ? 32 : 16;
      root.style.setProperty("--vt-ck-reserve", `${Math.ceil(card.offsetHeight) + inset + 16}px`);
    }
    measure();
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    if (ro && cardRef.current) ro.observe(cardRef.current);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
      root.style.removeProperty("--vt-ck-reserve");
    };
  }, [showCard]);

  function setBusyBoth(v: boolean) {
    busyRef.current = v;
    setBusy(v);
  }

  async function doPost(method: ConsentPostMethod, chosen: Cats, token: string | null, key: string) {
    try {
      const result = await postConsentRecord({
        method,
        locale,
        ...chosen,
        ...(token ? { turnstileToken: token } : {}),
        idempotencyKey: key,
      });
      if (result.ok) {
        writeCache(versionRef.current, method, chosen);
        if (chosen.analytics) loadWebAnalytics();
        setCats(chosen);
        setMode("hidden");
        setPending(null);
        setBusyBoth(false);
        window.dispatchEvent(new Event(CONSENT_RECORDED_EVENT));
        closeSheet();
        return;
      }
      setError("save");
    } catch {
      setError("save");
    }
    // Failed: new idempotency key, fresh challenge, controls live again (pressing one is the retry).
    newKey();
    setPending(null);
    setResetNonce((n) => n + 1);
    pendingRef.current = null;
    setBusyBoth(false);
  }

  function submit(method: ConsentPostMethod, chosen: Cats, origin: Origin) {
    if (busyRef.current) return;
    setError(null);
    if (!chosen.marketing) {
      // Refusing or saving without Meta never waits on Turnstile.
      setBusyBoth(true);
      void doPost(method, chosen, null, newKey());
      return;
    }
    if (!siteKey) {
      setError("check");
      return;
    }
    setBusyBoth(true);
    pendingRef.current = { method, cats: chosen, key: newKey() };
    setPending(origin);
  }

  function onToken(token: string | null) {
    const p = pendingRef.current;
    if (!p) return;
    if (token) {
      pendingRef.current = null;
      void doPost(p.method, p.cats, token, p.key);
      return;
    }
    pendingRef.current = null;
    setPending(null);
    setError("check");
    setBusyBoth(false);
  }

  const acceptAll = (origin: Origin) => {
    const all = { functional: true, analytics: true, marketing: true };
    setCats(all);
    submit("accept_all", all, origin);
  };
  const necessaryOnly = () => {
    const none = { functional: false, analytics: false, marketing: false };
    setCats(none);
    submit("reject_all", none, "card");
  };
  const openSheet = () => {
    if (busyRef.current) return;
    openerRef.current = (document.activeElement as HTMLElement | null) ?? null;
    setError(null);
    setSheetOpen(true);
  };

  if (mode === "unknown") return null;

  const alertText = error === "save" ? t("save-failed") : error === "check" ? tCommon("form-challenge-failed") : null;
  const busyStr = busy ? "true" : "false";

  const rows: Row[] = [
    {
      key: "necessary",
      title: t("strictly-necessary"),
      aria: t("strictly-necessary-cookies-always-on"),
      body: t("holds-your-booking-while-you-fill-it-in-processe"),
      meta: [t("sheet-necessary-providers"), t("sheet-necessary-duration")],
      always: true,
      checked: true,
    },
    {
      key: "functional",
      title: t("functional"),
      aria: t("functional-cookies"),
      body: t("remembers-your-language-and-your-last-pickup-add"),
      meta: ["Vamos Taxi", t("sheet-functional-duration")],
      checked: cats.functional,
      set: (v) => setCats((c) => ({ ...c, functional: v })),
    },
    {
      key: "analytics",
      title: t("analytics"),
      aria: t("analytics-cookies"),
      body: t("tells-us-which-step-of-a-booking-people-abandon"),
      meta: [t("sheet-analytics-providers"), t("sheet-not-used")],
      checked: cats.analytics,
      set: (v) => setCats((c) => ({ ...c, analytics: v })),
    },
    {
      key: "marketing",
      title: tCommon("marketing"),
      aria: t("marketing-cookies"),
      body: t.rich("meta-row", {
        b: (chunks) => <strong>{chunks}</strong>,
        code: (chunks) => <code className="vt-dir-keep vt-ck-code">{chunks}</code>,
      }),
      checked: cats.marketing,
      set: (v) => setCats((c) => ({ ...c, marketing: v })),
    },
  ];

  const alert = alertText ? (
    <div className="vt-ck-alert" role="alert">
      <Alert tone="danger" title={alertText} />
    </div>
  ) : null;

  const turnstile = (origin: Origin) =>
    pending === origin ? (
      <div className="vt-ck-turnstile" data-action="consent" data-ck-ts={origin}>
        <TurnstileWidget siteKey={siteKey} action="consent" onToken={onToken} resetNonce={resetNonce} />
      </div>
    ) : null;

  return (
    <>
      {showCard ? (
        <div className="vt-ck-banner" data-ck-banner="1" role="region" aria-label={t("cookie-choices")}>
          <div className="vt-ck-sheet" data-ck-sheet="1" ref={cardRef} aria-busy={busyStr}>
            <p className="vt-ck-kicker">{tCommon("cookies")}</p>
            <h2 className="vt-ck-title">{t("you-choose-what-we-measure")}</h2>
            <p className="vt-ck-body vt-ck-body--first">{t.rich("meta-banner", {})}</p>
            <p className="vt-ck-body vt-ck-body--link">
              <Link href="/cookies" className="vt-ck-link">
                {tCommon("cookie-policy")}
              </Link>
            </p>
            {sheetOpen ? null : alert}
            {sheetOpen ? null : turnstile("card")}
            <div className="vt-ck-acts" data-ck-acts="1">
              <Button variant="primary" size="md" type="button" disabled={busy} onClick={() => acceptAll("card")}>
                {t("accept-all")}
              </Button>
              <Button variant="ghost" size="md" type="button" disabled={busy} onClick={necessaryOnly}>
                {t("necessary-only")}
              </Button>
              <button className="vt-ck-manage" type="button" disabled={busy} onClick={openSheet}>
                {t("manage-preferences")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sheetOpen ? (
        <div
          className="vt-ck-veil"
          data-ck-veil="1"
          onClick={() => {
            if (!busyRef.current) closeSheet();
          }}
        >
          <div
            className="vt-ck-modal vt-ck-sheet"
            data-ck-modal="1"
            data-ck-sheet="1"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ck-title"
            aria-busy={busyStr}
            ref={dialogRef}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="vt-ck-head">
              <div className="vt-ck-head__text">
                <p className="vt-ck-kicker vt-ck-kicker--sheet">{tCommon("cookie-preferences")}</p>
                <h2 id="ck-title" className="vt-ck-sheet-title">
                  {t("choose-your-categories")}
                </h2>
              </div>
              <button className="vt-ck-x" type="button" disabled={busy} onClick={closeSheet} aria-label={tCommon("close")}>
                <Icon name="x" size={18} color="var(--vt-charcoal-900)" />
              </button>
            </div>

            <div className="vt-ck-cats" data-ck-cats="1" data-lenis-prevent="1">
              {rows.map((r) => (
                <div className="vt-ck-row" data-ck-row={r.key} key={r.key}>
                  <div className="vt-ck-row__text">
                    <h3 className="vt-ck-row__title">{r.title}</h3>
                    <p className="vt-ck-row__body">{r.body}</p>
                    {r.meta ? (
                      <div className="vt-ck-rowmeta">
                        <span>{r.meta[0]}</span>
                        <span>{r.meta[1]}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="vt-ck-row__ctl">
                    {r.always ? <span className="vt-ck-always">{t("always-on")}</span> : null}
                    <Switch
                      checked={r.checked}
                      disabled={r.always || busy}
                      aria-label={r.aria}
                      onChange={(e) => r.set?.(e.target.checked)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="vt-ck-foot">
              {alert ? <div className="vt-ck-foot__full">{alert}</div> : null}
              {turnstile("sheet")}
              <Button
                variant="primary"
                size="md"
                type="button"
                disabled={busy}
                onClick={() => submit("settings_change", cats, "sheet")}
              >
                {t("save-choices")}
              </Button>
              <Button variant="ghost" size="md" type="button" disabled={busy} onClick={() => acceptAll("sheet")}>
                {t("accept-all")}
              </Button>
              <p className="vt-ck-foot__note">{t("sheet-footer-note")}</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
