"use client";

// apps/web/lib/booking-draft.ts
//
// ADR-001 § Consequences names the condition its whole URL-segment decision stands or
// falls on: "fill the booking widget partially, switch language, and assert every field
// survives... Booking state persists to the URL or session storage rather than living
// in component state alone." This module is that mechanism, not a nice-to-have.
//
// D-15: session storage, not local storage and never the URL — pickup addresses and
// flight numbers are personal data nFADP would rather not see in the address bar,
// browser history or a referrer header. Session-scoped is also the *correct* retention
// for a draft: it survives a soft navigation (a language switch remounts everything
// below the `[locale]` segment — RESEARCH.md Pitfall 6) and a refresh, and it is gone
// once the tab closes, exactly like the mocks' own `localStorage.vamosTrip` was
// per-session in spirit if not in API. Phase 4 extends this same shape with the quote
// it computes; nothing about the shape here is provisional scaffolding.

import { useCallback, useSyncExternalStore } from "react";

export interface BookingDraft {
  pickup: string;
  destination: string;
  date: string;
  time: string;
  returnDate: string;
  returnTime: string;
  passengers: number;
  luggage: number;
  flightNumber: string;
}

export const EMPTY_DRAFT: BookingDraft = {
  pickup: "",
  destination: "",
  date: "",
  time: "",
  returnDate: "",
  returnTime: "",
  passengers: 1,
  luggage: 0,
  flightNumber: "",
};

const STORAGE_KEY = "vamosTrip";

let current: BookingDraft = EMPTY_DRAFT;
let hydrated = false;
const listeners = new Set<() => void>();

function isBookingDraft(value: unknown): value is BookingDraft {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.pickup === "string" &&
    typeof v.destination === "string" &&
    typeof v.date === "string" &&
    typeof v.time === "string" &&
    typeof v.passengers === "number" &&
    typeof v.luggage === "number" &&
    typeof v.flightNumber === "string"
  );
}

/** Reads `sessionStorage` exactly once per session (module load), never on the server —
 *  matching `lib/currency-store.ts`'s own hydrate-once pattern, so both stores fail the
 *  same safe way under private browsing or a full quota. */
function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isBookingDraft(parsed)) {
        current = {
          ...EMPTY_DRAFT,
          ...parsed,
          returnDate: typeof (parsed as BookingDraft).returnDate === "string" ? (parsed as BookingDraft).returnDate : "",
          returnTime: typeof (parsed as BookingDraft).returnTime === "string" ? (parsed as BookingDraft).returnTime : "",
        };
      }
    }
  } catch {
    // Malformed or inaccessible storage — an empty draft is the safe default; never
    // throws into a caller that only wanted to read the current fields.
  }
}

export function readDraft(): BookingDraft {
  hydrate();
  return current;
}

/** Merges `patch` into the current draft and persists the result immediately — never
 *  deferred to unmount, which is the one timing choice this must_have depends on: "two
 *  rapid language switches do not leave the draft partially written; the store reads on
 *  mount and writes on change, not on unmount." A soft navigation unmounts the writing
 *  component without warning, so anything deferred to that moment would be lost with it. */
export function writeDraft(patch: Partial<BookingDraft>): BookingDraft {
  hydrate();
  current = { ...current, ...patch };
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      // Non-fatal (quota, private browsing) — the in-memory draft still holds the
      // value for the rest of this render; only cross-reload persistence is lost.
    }
  }
  for (const listener of listeners) listener();
  return current;
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function getSnapshot(): BookingDraft {
  return readDraft();
}

function getServerSnapshot(): BookingDraft {
  return EMPTY_DRAFT;
}

/**
 * Reads from the store on mount — never from a `useState({...})` literal, which is
 * RESEARCH.md Pitfall 6's exact failure mode: a literal default looks identical to a
 * store-backed one until the moment a soft navigation remounts the component, at which
 * point the literal silently resets and the store-backed value survives. Writes on
 * every change, never on unmount (see `writeDraft`'s own comment).
 */
export function useBookingDraft(): [BookingDraft, (patch: Partial<BookingDraft>) => void] {
  const draft = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const update = useCallback((patch: Partial<BookingDraft>) => {
    writeDraft(patch);
  }, []);
  return [draft, update];
}
