"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/forms";
import { FLIGHT_NUMBER_RE, formatFlightInput, normaliseFlightNumber } from "@/lib/flight/format";
import "./FlightField.css";

/**
 * The flight number the traveller gives us. Nothing is looked up: no provider, no tracking.
 * The shape check runs once typing pauses, on Enter and on blur, so a half-typed number is
 * never called wrong.
 */
export function FlightField({
  value,
  onChange,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Checkout details re-prices on blur when the flight number changed (D-08b). */
  onBlur?: () => void;
}) {
  const t = useTranslations("quote.flight");
  const [checked, setChecked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function stopTimer() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  function typed(raw: string) {
    const next = formatFlightInput(raw);
    onChange(next);
    setChecked(false);
    stopTimer();
    if (normaliseFlightNumber(next).length >= 3) {
      timer.current = setTimeout(() => setChecked(true), 900);
    }
  }

  const clean = normaliseFlightNumber(value);
  const malformed = checked && clean.length > 0 && !FLIGHT_NUMBER_RE.test(clean);

  return (
    <div className="vt-flight" data-checkout-flight>
      <Input
        label={t("label")}
        icon="plane"
        value={value}
        placeholder={t("placeholder")}
        error={malformed ? t("malformed") : undefined}
        onChange={(e) => typed(e.target.value)}
        onBlur={() => {
          stopTimer();
          setChecked(true);
          onBlur?.();
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          stopTimer();
          setChecked(true);
        }}
      />
    </div>
  );
}
