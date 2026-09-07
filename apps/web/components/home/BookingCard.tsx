"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Button, Icon, IconButton, type IconName } from "@/components/core";
import { Input, Counter, WhenPicker } from "@/components/forms";
import { PriceSummary } from "@/components/transfer";
import { useBookingDraft, type BookingDraft } from "@/lib/booking-draft";
import { BookingCardMount, type BookingCardMountProps } from "./BookingCardMount";
import "./BookingCard.css";

export type BookingCardProps = BookingCardMountProps & {
  lockedDraft?: BookingDraft;
  defaultOpen?: boolean;
  children?: ReactNode;
};

export function PlaceCombo({
  label,
  value,
  placeholder,
  icon,
  clearLabel,
  testField,
  onChange,
  onClear,
}: {
  label: string;
  value: string;
  placeholder: string;
  icon: IconName;
  clearLabel: string;
  testField: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <>
      <span className="vt-bc-lbl">{label}</span>
      <div data-vtcombo="1" data-on={value.trim() ? "1" : "0"}>
        <span data-combo-tile="1" aria-hidden="true">
          <Icon name={icon} size={16} color="currentColor" />
        </span>
        <input
          type="text"
          role="combobox"
          aria-expanded="false"
          aria-autocomplete="list"
          aria-label={label}
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={placeholder}
          data-test-field={testField}
          onChange={(e) => onChange(e.target.value)}
        />
        {value ? (
          <button
            data-combo-x="1"
            type="button"
            aria-label={clearLabel}
            title={clearLabel}
            onClick={onClear}
          >
            <Icon name="x" size={16} color="currentColor" />
          </button>
        ) : null}
      </div>
    </>
  );
}

export function BookingCard({
  board,
  price,
  status,
  lockedDraft,
  defaultOpen = false,
  children,
}: BookingCardProps) {
  const tHome = useTranslations("home");
  const tCommon = useTranslations("common");
  const tBooking = useTranslations("booking");
  const tAccount = useTranslations("account");
  const locale = useLocale();
  const tAbout = useTranslations("about");

  const [storeDraft, updateStore] = useBookingDraft();
  const [localDraft, setLocalDraft] = useState<BookingDraft | null>(lockedDraft ?? null);
  const draft = localDraft ?? storeDraft;
  const updateDraft = (patch: Partial<BookingDraft>) => {
    if (localDraft) {
      setLocalDraft({ ...localDraft, ...patch });
      return;
    }
    updateStore(patch);
  };

  const [open, setOpen] = useState(defaultOpen);
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const root = sheetRef.current;
    if (!root) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      triggerRef.current?.focus();
    };
  }, [open]);

  const routeLabel =
    draft.pickup || draft.destination
      ? `${draft.pickup || "—"} → ${draft.destination || "—"}`
      : tHome("airport-address-or-hotel");
  const meta = [draft.date, draft.time].filter(Boolean).join(" · ") || tBooking("date");

  const fields = (
    <div data-fields="1">
      <div data-f="flight">
        <Input
          label={tCommon("flight-number")}
          icon="plane"
          size="md"
          value={draft.flightNumber}
          onChange={(e) => updateDraft({ flightNumber: e.target.value })}
          placeholder={tHome("route-or-flight-number")}
          data-test-field="flight-number"
        />
      </div>
      <div data-f="pickup">
        <PlaceCombo
          label={tCommon("pickup")}
          value={draft.pickup}
          placeholder={tHome("airport-address-or-hotel")}
          icon="map-pin"
          clearLabel={tCommon("clear")}
          testField="pickup"
          onChange={(v) => updateDraft({ pickup: v })}
          onClear={() => updateDraft({ pickup: "" })}
        />
      </div>
      <div data-f="swap" data-swap="1">
        <span data-only-narrow="1" aria-hidden="true" className="vt-bc-rule" />
        <span data-swaprot="1">
          <IconButton
            icon="arrow-left-right"
            label={tCommon("change")}
            variant="outline"
            size="md"
            onClick={() =>
              updateDraft({ pickup: draft.destination, destination: draft.pickup })
            }
          />
        </span>
        <span data-only-narrow="1" aria-hidden="true" className="vt-bc-rule" />
      </div>
      <div data-f="dest">
        <PlaceCombo
          label={tCommon("destination")}
          value={draft.destination}
          placeholder={tHome("airport-address-or-hotel")}
          icon="map-pin"
          clearLabel={tCommon("clear")}
          testField="destination"
          onChange={(v) => updateDraft({ destination: v })}
          onClear={() => updateDraft({ destination: "" })}
        />
      </div>
      <div data-f="when">
        <WhenPicker
          label={tAccount("pickup-date-and-time")}
          placeholder={tBooking("select-date-and-time")}
          date={draft.date}
          time={draft.time}
          locale={locale}
          groups={[
            tBooking("morning"),
            tBooking("afternoon"),
            tBooking("evening"),
          ]}
          timeTitle={tCommon("pickup-time")}
          savedLabel={tCommon("saved")}
          clearLabel={tCommon("clear")}
          saveLabel={tCommon("save")}
          prevMonthLabel={tBooking("previous-month")}
          nextMonthLabel={tBooking("next-month")}
          onDateChange={(iso) => updateDraft({ date: iso })}
          onTimeChange={(t) => updateDraft({ time: t })}
          onClear={() => updateDraft({ date: "", time: "" })}
        />
      </div>
      <div data-f="party" data-party="1">
        <Counter
          label={tCommon("passengers")}
          icon="users"
          value={draft.passengers}
          min={1}
          max={8}
          onChange={(value) => updateDraft({ passengers: value })}
          decrementLabel={tAccount("one-passenger-fewer")}
          incrementLabel={tAccount("one-passenger-more")}
          data-test-field="passengers"
        />
        <Counter
          label={tCommon("luggage")}
          icon="luggage"
          value={draft.luggage}
          min={0}
          max={8}
          onChange={(value) => updateDraft({ luggage: value })}
          decrementLabel={tAccount("one-bag-fewer")}
          incrementLabel={tAccount("one-bag-more")}
          data-test-field="luggage"
        />
      </div>
    </div>
  );

  const cta = (
    <Button variant="primary" size="lg" block>
      {tAbout("get-a-price")}
    </Button>
  );

  return (
    <div data-home-book="1">
      <div id="book" data-bookcard="1">
        <div data-upto-wide="1">
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={titleId}
            onClick={() => setOpen(true)}
            data-bc-summary="1"
          >
            <Icon name="search" size={18} color="var(--vt-charcoal-900)" />
            <span className="vt-bc-summary-copy">
              <span className="vt-bc-summary-route">{routeLabel}</span>
              <span className="vt-bc-summary-meta">{meta}</span>
            </span>
            <span aria-hidden="true" className="vt-bc-summary-go">
              <Icon name="arrow-right" size={20} color="var(--vt-charcoal-900)" />
            </span>
          </button>
        </div>

        <div
          data-shell="1"
          data-open={open ? "1" : "0"}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={sheetRef}
            data-sheetbody="1"
            data-lenis-prevent
            role={open ? "dialog" : undefined}
            aria-modal={open ? true : undefined}
            aria-labelledby={titleId}
            tabIndex={open ? -1 : undefined}
          >
            <div data-sheetonly="1">
              <span aria-hidden="true" className="vt-bc-handle" />
              <div className="vt-bc-sheet-head">
                <strong id={titleId}>{tCommon("booking")}</strong>
                <IconButton
                  icon="x"
                  label={tCommon("close")}
                  variant="plain"
                  size="md"
                  onClick={() => setOpen(false)}
                />
              </div>
            </div>
            {fields}
            <div data-sheetonly="cta">{cta}</div>
          </div>
        </div>

        <div data-only-wide="1" className="vt-bc-wide-cta">
          {cta}
        </div>
      </div>

      {children ?? (
        <BookingCardMount
          board={board}
          price={
            price ?? (
              <PriceSummary empty emptyMessage={tCommon("empty")} totalLabel={tCommon("empty")} />
            )
          }
          status={status}
        />
      )}
    </div>
  );
}
