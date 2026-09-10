"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/core";
import { Input } from "@/components/forms";
import { FLIGHT_NUMBER_RE, formatFlightInput, normaliseFlightNumber } from "@/lib/flight/format";
import "./FlightField.css";

function zurichCivilDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(d);
}

function addCivilDays(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return dt.toISOString().slice(0, 10);
}

function clock(local: string | undefined): string {
  if (!local) return "";
  const t = local.slice(11, 16);
  return /^\d{2}:\d{2}$/.test(t) ? t : "";
}

type FlightDir = "to-airport" | "from-airport" | "neither" | "cancelled" | "departed";

type FlightJson = {
  number?: string;
  landing_local?: string;
  origin_iata?: string;
  dest_iata?: string;
  status?: string;
  dir?: FlightDir;
};

export function FlightField({
  value,
  date,
  onChange,
}: {
  value: string;
  date?: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("quote.flight");
  const locale = useLocale();
  const today = zurichCivilDate();
  const tomorrow = addCivilDays(today, 1);
  const tripDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  const [choice, setChoice] = useState<"today" | "tomorrow" | "trip">(
    tripDate === tomorrow ? "tomorrow" : tripDate === today ? "today" : "trip",
  );
  const [state, setState] = useState<"idle" | "checking" | "ok" | "none" | "err">("idle");
  const [flight, setFlight] = useState<FlightJson | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lookupDate = choice === "tomorrow" ? tomorrow : choice === "today" ? today : tripDate;

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function lookup(num: string, civil: string) {
    const up = normaliseFlightNumber(num);
    if (!up) {
      setState("idle");
      setFlight(null);
      return;
    }
    if (!FLIGHT_NUMBER_RE.test(up)) {
      setState("err");
      setFlight(null);
      return;
    }
    const n = ++seq.current;
    setState("checking");
    void fetch(`/api/flight/${encodeURIComponent(up)}?date=${encodeURIComponent(civil)}&locale=${encodeURIComponent(locale)}`)
      .then((r) => r.json())
      .then((body: unknown) => {
        if (n !== seq.current) return;
        const j = body as { ok?: boolean; flight?: FlightJson };
        if (j?.ok && j.flight) {
          setFlight(j.flight);
          setState("ok");
          onChange(formatFlightInput(j.flight.number || up));
          return;
        }
        setFlight(null);
        setState("none");
      })
      .catch(() => {
        if (n !== seq.current) return;
        setState("idle");
      });
  }

  function typed(raw: string) {
    const next = formatFlightInput(raw);
    onChange(next);
    setConfirmed(false);
    setFlight(null);
    setState("idle");
    if (timer.current) clearTimeout(timer.current);
    if (normaliseFlightNumber(next).length >= 3) {
      timer.current = setTimeout(() => lookup(next, lookupDate), 900);
    }
  }

  function confirm() {
    if (!flight) return;
    onChange(formatFlightInput(flight.number || value));
    setConfirmed(true);
    setState("idle");
  }

  function dismiss() {
    setFlight(null);
    setState("idle");
    setConfirmed(false);
  }

  const dir = flight?.dir;
  const ap = dir === "to-airport" ? flight?.origin_iata : flight?.dest_iata;
  const when = clock(flight?.landing_local);
  const sentence =
    dir === "from-airport"
      ? t("effect.from_airport", { ap: ap || "", t: when })
      : dir === "to-airport"
        ? t("effect.to_airport", { ap: ap || "", t: when })
        : dir === "cancelled"
          ? t("note.cancelled")
          : dir === "departed"
            ? t("note.departed", { ap: ap || "" })
            : t("note.off");
  const ready = state === "ok" && (dir === "from-airport" || dir === "to-airport");
  const noteOnly = state === "ok" && !ready;
  const showCard = state === "checking" || state === "ok" || state === "none" || state === "err";

  return (
    <div className="vt-flight" data-checkout-flight>
      <Input
        label={t("label")}
        icon="plane"
        value={value}
        placeholder={t("placeholder")}
        error={state === "err" ? t("malformed") : undefined}
        onChange={(e) => typed(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (timer.current) clearTimeout(timer.current);
          lookup(value, lookupDate);
        }}
      />
      {showCard && !confirmed ? (
        <div className="vt-flight__card" role="group" aria-label={t("cardTitle")}>
          <div className="vt-flight__head">
            <span className="vt-flight__code">{formatFlightInput(flight?.number || value)}</span>
          </div>
          {state === "checking" ? <p className="vt-flight__copy vt-flight__copy--muted">{t("checking")}</p> : null}
          {state === "none" ? <p className="vt-flight__copy vt-flight__copy--muted">{t("not_found")}</p> : null}
          {ready ? (
            <>
              <p className="vt-flight__copy">{sentence}</p>
              <div className="vt-flight__days" role="radiogroup" aria-label={t("today")}>
                <button
                  type="button"
                  role="radio"
                  className="vt-flight__day"
                  aria-checked={choice === "today"}
                  onClick={() => {
                    setChoice("today");
                    lookup(value, today);
                  }}
                >
                  {t("today")}
                </button>
                <button
                  type="button"
                  role="radio"
                  className="vt-flight__day"
                  aria-checked={choice === "tomorrow"}
                  onClick={() => {
                    setChoice("tomorrow");
                    lookup(value, tomorrow);
                  }}
                >
                  {t("tomorrow")}
                </button>
              </div>
              <div className="vt-flight__actions">
                <Button variant="primary" size="sm" onClick={confirm}>
                  {t("use")}
                </Button>
                <Button variant="ghost" size="sm" onClick={dismiss}>
                  {t("dismiss")}
                </Button>
              </div>
            </>
          ) : null}
          {noteOnly || state === "none" ? (
            <>
              {noteOnly ? <p className="vt-flight__copy vt-flight__copy--muted">{sentence}</p> : null}
              <div className="vt-flight__actions">
                <Button variant="ghost" size="sm" onClick={dismiss}>
                  {t("dismiss")}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      {confirmed && value ? (
        <div className="vt-flight__chip">
          <span className="vt-flight__code">{formatFlightInput(value)}</span>
          <button
            type="button"
            className="vt-flight__remove"
            onClick={() => {
              setConfirmed(false);
              onChange("");
            }}
          >
            {t("dismiss")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
