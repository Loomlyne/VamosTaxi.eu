"use client";

// apps/web/components/booking/BookingDraftFields.tsx
//
// The ADR-001 acceptance-test surface (01-12-PLAN.md Task 2): a minimal Phase-1
// booking-widget field set — pickup, destination, date, time, passengers, luggage,
// flight number — built from the already-ported form controls. Phase 4/5 build the
// real booking widget on top of the same `apps/web/lib/booking-draft.ts` store this
// component already reads from and writes to; nothing here is throwaway scaffolding.
//
// The one property the whole test depends on (RESEARCH.md Pitfall 6): every field's
// *initial* value comes from `useBookingDraft()` on mount, never from a `useState({...})`
// literal. A literal default looks identical to a store-backed one right up until a
// language switch remounts this component (ADR-001's soft navigation) and silently
// resets it — the exact failure this plan's own must_haves name.
//
// `data-test-field` attributes are the only test-only surface here (never referenced by
// any product logic) — the deterministic hooks `tests/integration/lang-switch.spec.ts`
// needs to fill and re-read each field without depending on translated label text, which
// changes with every language switch this component is built to survive.

import { useTranslations } from "next-intl";
import { Input, Counter } from "@/components/forms";
import { useBookingDraft } from "@/lib/booking-draft";

export function BookingDraftFields() {
  const common = useTranslations("common");
  const booking = useTranslations("booking");
  const account = useTranslations("account");
  const [draft, updateDraft] = useBookingDraft();

  return (
    <div data-test-booking-draft>
      <Input
        label={common("pickup")}
        value={draft.pickup}
        onChange={(e) => updateDraft({ pickup: e.target.value })}
        data-test-field="pickup"
      />
      <Input
        label={common("destination")}
        value={draft.destination}
        onChange={(e) => updateDraft({ destination: e.target.value })}
        data-test-field="destination"
      />
      <Input
        type="date"
        label={booking("date")}
        value={draft.date}
        onChange={(e) => updateDraft({ date: e.target.value })}
        data-test-field="date"
      />
      <Input
        type="time"
        label={booking("time")}
        value={draft.time}
        onChange={(e) => updateDraft({ time: e.target.value })}
        data-test-field="time"
      />
      <Counter
        label={common("passengers")}
        value={draft.passengers}
        min={1}
        max={8}
        onChange={(value) => updateDraft({ passengers: value })}
        decrementLabel={account("one-passenger-fewer")}
        incrementLabel={account("one-passenger-more")}
        data-test-field="passengers"
      />
      <Counter
        label={common("luggage")}
        value={draft.luggage}
        min={0}
        max={8}
        onChange={(value) => updateDraft({ luggage: value })}
        decrementLabel={account("one-bag-fewer")}
        incrementLabel={account("one-bag-more")}
        data-test-field="luggage"
      />
      <Input
        label={common("flight-number")}
        value={draft.flightNumber}
        onChange={(e) => updateDraft({ flightNumber: e.target.value })}
        data-test-field="flight-number"
      />
    </div>
  );
}
