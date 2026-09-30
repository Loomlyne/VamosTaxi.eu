"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/feedback/Alert";
import { Button } from "@/components/core";
import { Counter, Input, WhenPicker } from "@/components/forms";
import { TurnstileWidget } from "@/components/forms/TurnstileWidget";
import { airportByName, validateEditor, type EditorFieldErrors } from "@/lib/checkout/trip-editor-rules";
import { useCheckoutSettings } from "../CheckoutSettings";
import { PlaceCombo, type PlaceRetrieve } from "@/components/forms/PlaceCombo";
import { geoLocale } from "@/lib/checkout/geo-locale";
import type { QuoteRefusal } from "@/lib/checkout/checkout-quote";
import { useQuoteLabel } from "@/lib/checkout/quote-label";
import { joinWhen, splitWhen } from "@/lib/checkout/trip-format";
import {
  BAGS_MAX,
  PAX_MAX,
  PAX_MIN,
  normaliseFlight,
  type Trip,
  type TripField,
  type TripFieldError,
} from "@/lib/checkout/trip-url";

const FIELD_ORDER: TripField[] = ["from", "flight", "to", "when", "travellers"];

/**
 * UI-SPEC S2 inline trip editor: From -> Flight (airport only) -> To -> When ->
 * Travellers, UPDATE PRICES / CANCEL. Opens in place of the trip strip; Escape or
 * CANCEL closes without change. `onSubmit` re-quotes: null means it worked (the parent
 * closes the editor), a refusal keeps the editor open with its message.
 */
export function TripEditor({
  trip,
  locale,
  initialErrors,
  onSubmit,
  onClose,
  onDirtyChange,
}: {
  trip: Trip;
  locale: string;
  initialErrors: readonly TripFieldError[];
  onSubmit: (next: Trip, token?: string | null) => Promise<QuoteRefusal | null>;
  onClose: () => void;
  /** True while the fields differ from the applied trip (PAY then says "Update the prices first"). */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const settings = useCheckoutSettings();
  const lastNext = useRef<Trip | null>(null);
  const t = useTranslations("checkout");
  const tCommon = useTranslations("common");
  const tBooking = useTranslations("booking");
  const quoteLabel = useQuoteLabel();
  const rootRef = useRef<HTMLDivElement>(null);
  const initialWhen = splitWhen(trip.when);

  const [fromShown, setFromShown] = useState(trip.from ?? "");
  const [from, setFrom] = useState(trip.from ?? "");
  const [fromId, setFromId] = useState<string | null>(trip.fid);
  const [toShown, setToShown] = useState(trip.to ?? "");
  const [to, setTo] = useState(trip.to ?? "");
  const [toId, setToId] = useState<string | null>(trip.tid);
  const [gs, setGs] = useState<string | null>(trip.gs);
  const [airport, setAirport] = useState(airportByName(trip.from ?? ""));
  const [flight, setFlight] = useState(trip.flightDisplay ?? "");
  const [flightOpen, setFlightOpen] = useState(Boolean(trip.flight));
  const [date, setDate] = useState(initialWhen.date);
  const [time, setTime] = useState(initialWhen.time);
  const [pax, setPax] = useState(trip.pax ?? 1);
  const [bags, setBags] = useState(trip.bags ?? 0);
  const [errors, setErrors] = useState<EditorFieldErrors>(() =>
    Object.fromEntries(initialErrors.map((e) => [e.field, e.reason])),
  );
  const [refusal, setRefusal] = useState<QuoteRefusal | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    rootRef.current?.querySelector<HTMLInputElement>('[data-co-field="from"] input')?.focus();
  }, []);

  // Dirty = anything differs from the applied trip. Read by PAY through the flow.
  const dirty =
    from.trim() !== (trip.from ?? "") ||
    to.trim() !== (trip.to ?? "") ||
    joinWhen(date, time) !== trip.when ||
    pax !== (trip.pax ?? 1) ||
    bags !== (trip.bags ?? 0) ||
    (normaliseFlight(flight)?.flight ?? flight.trim()) !== (trip.flight ?? "");
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  function focusField(field: TripField) {
    const box = rootRef.current?.querySelector<HTMLElement>(`[data-co-field="${field}"]`);
    box?.querySelector<HTMLElement>("input, button")?.focus();
  }

  /** After a pick that makes the pickup an airport, the flight field opens before From: focus goes into it (26.4.2). */
  function focusFlightSoon() {
    window.setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      const inFrom = !!active?.closest('[data-co-field="from"]');
      if (!active || active === document.body || inFrom) focusField("flight");
    }, 80);
  }

  async function detectAirport(place: Pick<PlaceRetrieve, "mapbox_id" | "session_token" | "text">, focusFlight = false) {
    const wasAirport = airport;
    const byName = airportByName(place.text);
    setAirport(byName);
    let now = byName;
    try {
      const res = await fetch(
        `/api/geo/retrieve?mapbox_id=${encodeURIComponent(place.mapbox_id)}` +
          `&session_token=${encodeURIComponent(place.session_token)}` +
          `&locale=${encodeURIComponent(geoLocale(locale))}`,
        { credentials: "same-origin" },
      );
      const json = (await res.json()) as { place?: { isAirport?: boolean } | null };
      if (typeof json.place?.isAirport === "boolean") {
        now = json.place.isAirport;
        setAirport(now);
      }
    } catch {
      // the name test above stays as the hint
    }
    if (focusFlight && now && !wasAirport) focusFlightSoon();
  }

  // Airport status comes from the pickup place only (D-09): settle it on open when the trip has one.
  useEffect(() => {
    if (trip.fid && trip.gs) {
      void detectAirport({ mapbox_id: trip.fid, session_token: trip.gs, text: trip.from ?? "" });
    }
  }, []);

  function fieldMessage(field: TripField): string | null {
    const reason = errors[field];
    if (!reason) return null;
    switch (field) {
      case "from":
        return t("errPickup");
      case "flight":
        return reason === "invalid" ? t("errFlightCheck") : t("errFlight");
      case "to":
        return reason === "same" ? t("errSamePlace") : t("errDropoff");
      case "when":
        return t("errWhen");
      default:
        return null;
    }
  }

  async function submit() {
    if (busy) return;
    const when = joinWhen(date, time);
    const found = validateEditor({ from, fromId, to, toId, airport, flight, when, pax, bags });
    setErrors(found);
    setRefusal(null);
    const first = FIELD_ORDER.find((f) => found[f]);
    if (first) {
      focusField(first);
      return;
    }
    const parsedFlight = flight.trim() ? normaliseFlight(flight) : null;
    const next: Trip = {
      ...trip,
      from: from.trim(),
      fid: fromId,
      to: to.trim(),
      tid: toId,
      gs,
      when,
      pax,
      bags,
      flight: parsedFlight?.flight ?? null,
      flightDisplay: parsedFlight?.display ?? null,
    };
    lastNext.current = next;
    setBusy(true);
    const result = await onSubmit(next);
    setBusy(false);
    if (result) setRefusal(result);
  }

  /** The server asked for a challenge: the widget shows here, where the customer is. */
  async function retryWithToken(token: string | null) {
    if (!token || busy || !lastNext.current) return;
    setBusy(true);
    setRefusal(null);
    const result = await onSubmit(lastNext.current, token);
    setBusy(false);
    if (result) setRefusal(result);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape" && !busy) {
      e.stopPropagation();
      onClose();
    }
  }

  const refusalText = refusal
    ? (refusal.i18nKey ? quoteLabel(refusal.i18nKey, refusal.params ?? undefined) : "") || t("quoteGeneric")
    : "";
  const when = joinWhen(date, time);
  // D-09: an airport pickup needs the flight; any other pickup may add one, and a typed one stays.
  const showFlight = airport || flightOpen || flight.trim() !== "";
  const canAddFlight = !showFlight && from.trim() !== "";

  return (
    <div
      className="vt-co__editor"
      data-co-editor
      data-busy={busy ? "true" : "false"}
      ref={rootRef}
      onKeyDown={onKeyDown}
    >
      <fieldset className="vt-co__editor-set" disabled={busy}>
      <div className="vt-co__editor-grid" data-flight-row={showFlight || canAddFlight ? "true" : "false"}>
        {showFlight ? (
          <div className="vt-co__editor-field" data-co-field="flight" data-co-flight data-co-flight-optional={airport ? "false" : "true"}>
            <Input
              label={
                airport ? (
                  t("tripFlight")
                ) : (
                  <>
                    {t("tripFlight")} <span className="vt-co__optional">{t("tripFlightOptional")}</span>
                  </>
                )
              }
              value={flight}
              placeholder={t("tripFlightPlaceholder")}
              hint={airport ? t("tripFlightHint") : t("tripFlightOptionalHint")}
              error={fieldMessage("flight") ?? undefined}
              icon="plane"
              size="lg"
              autoComplete="off"
              onChange={(e) => setFlight(e.target.value.toUpperCase().replace(/\s+/g, " "))}
            />
          </div>
        ) : canAddFlight ? (
          <div className="vt-co__editor-field" data-co-field="flight" data-co-flight-add>
            <Button variant="ghost" size="md" icon="plane" onClick={() => setFlightOpen(true)}>
              {t("tripFlightAdd")}
            </Button>
          </div>
        ) : null}

        <div className="vt-co__editor-field" data-co-field="from">
          <PlaceCombo
            label={t("tripFrom")}
            value={fromShown}
            placeholder={t("tripPickupPlaceholder")}
            icon="map-pin"
            clearLabel={tCommon("clear")}
            testField="editor-from"
            locale={geoLocale(locale)}
            onChange={(v) => {
              setFromShown(v);
              setFrom(v);
            }}
            onPlace={(place) => {
              if (!place) {
                setFromId(null);
                return;
              }
              setFrom(place.text);
              setFromId(place.mapbox_id);
              setGs(place.session_token);
              setErrors((e) => ({ ...e, from: undefined }));
              void detectAirport(place, true);
            }}
            onClear={() => {
              setFromShown("");
              setFrom("");
              setFromId(null);
              setAirport(false);
            }}
          />
          {fieldMessage("from") ? <p className="vt-co__field-error">{fieldMessage("from")}</p> : null}
        </div>

        <div className="vt-co__editor-field" data-co-field="to">
          <PlaceCombo
            label={t("tripTo")}
            value={toShown}
            placeholder={t("tripDropoffPlaceholder")}
            icon="map-pin"
            clearLabel={tCommon("clear")}
            testField="editor-to"
            locale={geoLocale(locale)}
            onChange={(v) => {
              setToShown(v);
              setTo(v);
            }}
            onPlace={(place) => {
              if (!place) {
                setToId(null);
                return;
              }
              setTo(place.text);
              setToId(place.mapbox_id);
              setGs((g) => g ?? place.session_token);
              setErrors((e) => ({ ...e, to: undefined }));
            }}
            onClear={() => {
              setToShown("");
              setTo("");
              setToId(null);
            }}
          />
          {fieldMessage("to") ? <p className="vt-co__field-error">{fieldMessage("to")}</p> : null}
        </div>

        <div className="vt-co__editor-field" data-co-field="when">
          <WhenPicker
            label={t("tripWhen")}
            placeholder={tBooking("select-date-and-time")}
            date={date}
            time={time}
            locale={locale}
            groups={[tBooking("morning"), tBooking("afternoon"), tBooking("evening")]}
            timeTitle={tCommon("pickup-time")}
            savedLabel={tCommon("saved")}
            clearLabel={tCommon("clear")}
            saveLabel={tCommon("save")}
            prevMonthLabel={tBooking("previous-month")}
            nextMonthLabel={tBooking("next-month")}
            onDateChange={setDate}
            onTimeChange={setTime}
            onClear={() => {
              setDate("");
              setTime("");
            }}
          />
          {fieldMessage("when") && !when ? <p className="vt-co__field-error">{fieldMessage("when")}</p> : null}
        </div>

        <div className="vt-co__editor-field vt-co__editor-party" data-co-field="travellers">
          <Counter
            label={t("passengersLabel")}
            icon="users"
            value={pax}
            min={PAX_MIN}
            max={PAX_MAX}
            onChange={setPax}
            decrementLabel={t("removePassenger")}
            incrementLabel={t("addPassenger")}
          />
          <Counter
            label={t("bagsLabel")}
            icon="luggage"
            value={bags}
            min={0}
            max={BAGS_MAX}
            onChange={setBags}
            decrementLabel={t("removeBag")}
            incrementLabel={t("addBag")}
          />
        </div>
      </div>
      </fieldset>

      {refusal ? (
        <>
          <Alert tone="danger" data-co-editor-error role="alert">
            {refusalText}
          </Alert>
          {refusal.challenge ? (
            <div className="vt-co__challenge" data-co-editor-challenge>
              <TurnstileWidget siteKey={settings.turnstileSiteKey} action="checkout" onToken={retryWithToken} />
            </div>
          ) : null}
        </>
      ) : null}

      <div className="vt-co__editor-actions">
        <Button size="lg" onClick={submit} disabled={busy} aria-busy={busy} data-co-update>
          {busy ? t("updatingPrices") : t("updatePrices")}
        </Button>
        <Button size="md" variant="ghost" onClick={onClose} disabled={busy} data-co-cancel>
          {t("editorCancel")}
        </Button>
      </div>
    </div>
  );
}
