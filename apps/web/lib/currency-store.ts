"use client";

// apps/web/lib/currency-store.ts
//
// D-16 / ADR-004: currency is client-only state — never a cookie, never touching the
// server, so it never varies a cache key or a Worker response. The server always
// renders the CHF mark; hydration swaps it client-side. The accepted cost (D-16) is one
// frame of the CHF mark for a non-CHF visitor — traded for cache keys that never vary on
// a purely presentational choice, and for never needing `Vary` on a public page.
//
// Ported from app/vamos-locale.js's `CURS` table + `money()` (01-PATTERNS.md's port
// notes): the CHF/EUR/USD/AED marks and their spacing, and the rule that matters most —
// the formatter swaps the mark and never touches the figure (`CHF 000` stays `000` until
// Phase 4's real matrix lands, per Law 04). `apps/web/lib/currency.ts` (Plan 11) already
// carries that mark table and the pure formatter for components that only ever render
// the CHF placeholder; this module adds the switchable state on top of it rather than
// duplicating the table, so there is exactly one place the four marks are declared.
//
// CLAUDE.md: "no code reads the browser storage keys for language or currency directly"
// — `STORAGE_KEY` is read and written in exactly one place, this module.

import { useCallback, useSyncExternalStore } from "react";
import { CURRENCY_MARKS, DEFAULT_CURRENCY, formatAmount, type CurrencyCode } from "./currency";

export type { CurrencyCode };

/** The four marks (CHF/EUR/USD/AED) and their spacing, re-exported under the name this
 *  plan's artifact list asks for rather than duplicated — see the file header. */
export const CURRENCIES = CURRENCY_MARKS;

const STORAGE_KEY = "vamosCurrency";

let currentCurrency: CurrencyCode = DEFAULT_CURRENCY;
let hydrated = false;
const listeners = new Set<() => void>();

function isValidCurrency(value: string | null): value is CurrencyCode {
  return !!value && value in CURRENCY_MARKS;
}

/** Reads `localStorage` exactly once per session — the client's very first ask for the
 *  current currency — and never on the server (`typeof window` guards every branch that
 *  touches storage). Never runs a second time: the module-scoped `currentCurrency` is the
 *  single source of truth for every read after this. */
function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isValidCurrency(stored)) currentCurrency = stored;
  } catch {
    // Storage can throw (private browsing, a full quota) — CHF is a safe, correct
    // default, and the in-memory value still works for the rest of the session.
  }
}

export function getCurrency(): CurrencyCode {
  hydrate();
  return currentCurrency;
}

export function setCurrency(next: CurrencyCode): void {
  // T-01-33 backstop: never accept a mark outside the four the table declares, even
  // from a caller that bypassed the CurrencyCode type (e.g. a raw string from a test
  // hook or a future settings import).
  if (!(next in CURRENCY_MARKS)) return;
  hydrate();
  if (next === currentCurrency) return;
  currentCurrency = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal — the in-memory value still switches for the rest of this session.
    }
  }
  for (const listener of listeners) listener();
}

export function onCurrencyChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** `amount` stays `null`/`undefined` — the `CHF 000` placeholder Law 04 requires — until
 *  Phase 4's real matrix lands. The mark always follows the *current* stored currency,
 *  never a hardcoded one, which is the whole point of this module existing separately
 *  from `lib/currency.ts`'s stateless formatter. */
export function money(amount?: number | null): string {
  return formatAmount(amount, getCurrency());
}

function subscribe(onStoreChange: () => void): () => void {
  return onCurrencyChange(onStoreChange);
}

function getSnapshot(): CurrencyCode {
  return getCurrency();
}

function getServerSnapshot(): CurrencyCode {
  return DEFAULT_CURRENCY;
}

/** The reactive form: re-renders the calling component whenever the stored currency
 *  changes anywhere on the page, with no `onChange` subscription to wire and release by
 *  hand. `useSyncExternalStore`'s server snapshot is always `DEFAULT_CURRENCY`, matching
 *  what the server actually rendered — the hydration mismatch that would otherwise
 *  flash a stale value never happens; only the value itself may change one frame later. */
export function useCurrency(): {
  currency: CurrencyCode;
  setCurrency: (next: CurrencyCode) => void;
  money: (amount?: number | null) => string;
} {
  const currency = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const set = useCallback((next: CurrencyCode) => setCurrency(next), []);
  const format = useCallback((amount?: number | null) => formatAmount(amount, currency), [currency]);
  return { currency, setCurrency: set, money: format };
}
