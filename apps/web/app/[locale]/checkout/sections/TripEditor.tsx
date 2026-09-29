"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/feedback/Alert";
import { Button } from "@/components/core";
import { Counter, Input, WhenPicker } from "@/components/forms";
import { PlaceCombo, type PlaceRetrieve } from "@/components/forms/PlaceCombo";
import { geoLocale } from "@/lib/checkout/vamos-trip";
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

const AIRPORT_NAME = /airport|flughafen|a[eéè]roport|مطار/i;

export type EditorFieldErrors = Partial<Record<TripField, "required" | "invalid" | "same">>;

/** Pure: the same gaps the home box reports, in the same order (UI-SPEC S2). */
export function validateEditor(input: {
  from: string;
  fromId: string | null;
  to: string;
  toId: string | null;
  airport: boolean;
  flight: string;
  when: string | null;
  pax: number;
  bags: number;
}): EditorFieldErrors {
  const errors: EditorFieldErrors = {};
  if (!input.from.trim()) errors.from = "required";
  if (input.airport) {
    if (!input.flight.trim()) errors.flight = "required";
    else if (!normaliseFlight(input.flight)) errors.flight = "invalid";
  }
  if (!input.to.trim()) errors.to = "required";
  else if (
    input.from.trim() &&
    ((input.fromId && input.fromId === input.toId) ||
      input.from.trim().toLowerCase() === input.to.trim().toLowerCase())
  ) {
    errors.to = "same";
  }
  if (!input.when) errors.when = "required";
  if (input.pax < PAX_MIN || input.pax > PAX_MAX || input.bags < 0 || input.bags > BAGS_MAX) {
    errors.travellers = "invalid";
  }
  return errors;
}

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
}: {
  trip: Trip;
  locale: string;
  initialErrors: readonly TripFieldError[];
  onSubmit: (next: Trip) => Promise<QuoteRefusal | null>;
  onClose: () => void;
}) {
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
  const [airport, setAirport] = useState(Boolean(trip.flight));
  const [flight, setFlight] = useState(trip.flightDisplay ?? "");
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

  function focusField(field: TripField) {
    const box = rootRef.current?.querySelector<HTMLElement>(`[data-co-field="${field}"]`);
    box?.querySelector<HTMLElement>("input, button")?.focus();
  }

  async function detectAirport(place: PlaceRetrieve) {
    setAirport(AIRPORT_NAME.test(place.text));
    try {
      const res = await fetch(
        `/api/geo/retrieve?mapbox_id=${encodeURIComponent(place.mapbox_id)}` +
          `&session_token=${encodeURIComponent(place.session_token)}` +
          `&locale=${encodeURIComponent(geoLocale(locale))}`,
        { credentials: "same-origin" },
      );
      const json = (await res.json()) as { place?: { isAirport?: boolean } | null };
      if (typeof json.place?.isAirport === "boolean") setAirport(json.place.isAirport);
    } catch {
      // the name test above stays as the hint
    }
  }

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
    const parsedFlight = airport ? normaliseFlight(flight) : null;
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
    setBusy(true);
    const result = await onSubmit(next);
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

  return (
    <div
      className="vt-co__editor"
      data-co-editor
      data-busy={busy ? "true" : "false"}
      ref={rootRef}
      onKeyDown={onKeyDown}
    >
      <fieldset className="vt-co__editor-set" disabled={busy}>
      <div className="vt-co__editor-grid" data-airport={airport ? "true" : "false"}>
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
              void detectAirport(place);
            }}
            onClear={() => {
              setFromShown("");
              setFrom("");
              setFromId(null);
              setAirport(false);
              setFlight("");
            }}
          />
          {fieldMessage("from") ? <p className="vt-co__field-error">{fieldMessage("from")}</p> : null}
        </div>

        {airport ? (
          <div className="vt-co__editor-field" data-co-field="flight" data-co-flight>
            <Input
              label={t("tripFlight")}
              value={flight}
              placeholder={t("tripFlightPlaceholder")}
              hint={t("tripFlightHint")}
              error={fieldMessage("flight") ?? undefined}
              icon="plane-landing"
              size="lg"
              autoComplete="off"
              onChange={(e) => setFlight(e.target.value.toUpperCase().replace(/\s+/g, " "))}
            />
          </div>
        ) : null}

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
        <Alert tone="danger" data-co-editor-error role="alert">
          {refusalText}
        </Alert>
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
