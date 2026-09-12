"use client";

import "./TurnstileWidget.css";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileWidgetId = string;

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      appearance: "always" | "execute" | "interaction-only";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => TurnstileWidgetId;
  remove: (widgetId: TurnstileWidgetId) => void;
  reset: (widgetId: TurnstileWidgetId) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("no-window"));
  }
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const onReady = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("turnstile-missing"));
    };
    if (existing) {
      if (window.turnstile) {
        resolve(window.turnstile);
        return;
      }
      existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener("error", () => reject(new Error("turnstile-script")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", onReady, { once: true });
    script.addEventListener("error", () => reject(new Error("turnstile-script")), { once: true });
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export type TurnstileWidgetProps = {
  siteKey: string | undefined;
  action: "contact" | "checkout" | "consent";
  onToken: (token: string | null) => void;
  labelKey?: string;
  resetNonce?: number;
};

export function TurnstileWidget({
  siteKey,
  action,
  onToken,
  labelKey,
  resetNonce = 0,
}: TurnstileWidgetProps) {
  void labelKey;
  const tCommon = useTranslations("common");
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<TurnstileWidgetId | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!siteKey) {
      onTokenRef.current(null);
      return;
    }

    let cancelled = false;

    loadTurnstile()
      .then((api) => {
        if (cancelled || !hostRef.current || widgetIdRef.current !== null) return;
        widgetIdRef.current = api.render(hostRef.current, {
          sitekey: siteKey,
          action,
          appearance: "interaction-only",
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => {
        if (!cancelled) onTokenRef.current(null);
      });

    return () => {
      cancelled = true;
      const id = widgetIdRef.current;
      widgetIdRef.current = null;
      if (id && window.turnstile) {
        window.turnstile.remove(id);
      }
    };
  }, [siteKey, action]);

  useEffect(() => {
    if (resetNonce === 0) return;
    const id = widgetIdRef.current;
    if (id && window.turnstile) {
      window.turnstile.reset(id);
      onTokenRef.current(null);
    }
  }, [resetNonce]);

  if (!siteKey) {
    return (
      <div className="vt-turnstile" role="note" data-action={action}>
        <p className="vt-turnstile__note">{tCommon("form-challenge-failed")}</p>
      </div>
    );
  }

  return <div className="vt-turnstile" ref={hostRef} data-action={action} />;
}
