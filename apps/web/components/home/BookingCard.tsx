"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, IconButton } from "@/components/core";
import { Input, Counter, DatePicker } from "@/components/forms";
import { Tabs } from "@/components/navigation";
import { PriceSummary } from "@/components/transfer";
import { useBookingDraft, type BookingDraft } from "@/lib/booking-draft";
import { BookingCardMount, type BookingCardMountProps } from "./BookingCardMount";
import "./BookingCard.css";

export type BookingCardProps = BookingCardMountProps & {
  lockedDraft?: BookingDraft;
  defaultOpen?: boolean;
  children?: ReactNode;
};

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

  const [mode, setMode] = useState("one-way");
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
        <Input
          label={tCommon("pickup")}
          value={draft.pickup}
          onChange={(e) => updateDraft({ pickup: e.target.value })}
          placeholder={tHome("airport-address-or-hotel")}
          data-test-field="pickup"
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
        <Input
          label={tCommon("destination")}
          value={draft.destination}
          onChange={(e) => updateDraft({ destination: e.target.value })}
          placeholder={tHome("airport-address-or-hotel")}
          data-test-field="destination"
        />
      </div>
      <div data-f="when">
        <DatePicker
          label={tBooking("date")}
          value={draft.date}
          time={draft.time}
          placeholder={tBooking("date")}
          prevMonthLabel={tBooking("previous-month")}
          nextMonthLabel={tBooking("next-month")}
          onChange={(day) => {
            const now = new Date();
            const mm = String(now.getMonth() + 1).padStart(2, "0");
            updateDraft({
              date: `${now.getFullYear()}-${mm}-${String(day).padStart(2, "0")}`,
            });
          }}
          onTimeChange={(t) => updateDraft({ time: t })}
        />
        <Input
          type="time"
          label={tBooking("time")}
          value={draft.time}
          onChange={(e) => updateDraft({ time: e.target.value })}
          data-test-field="time"
        />
        <Input
          type="date"
          label={tBooking("date")}
          value={draft.date}
          onChange={(e) => updateDraft({ date: e.target.value })}
          data-test-field="date"
          className="vt-bc-sr-date"
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

  const tabs = (
    <Tabs
      variant="segmented"
      aria-label={tHome("one-way")}
      value={mode}
      onChange={setMode}
      items={[
        { value: "one-way", label: tHome("one-way") },
        { value: "return", label: tCommon("return") },
      ]}
    />
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
            {tabs}
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
