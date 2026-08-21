// apps/web/lib/currency.ts
//
// A minimal, pure, display-only currency-mark formatter — the "currency layer" this
// plan's `PriceSummary` (and, indirectly, `StatTile`) render amounts through, so no
// component ever writes a `CHF`/`EUR`/`USD`/`AED` literal into its own JSX (CLAUDE.md §
// "Prices: never a hard-coded CHF string in logic").
//
// Deliberately narrow (Rule 2 addition, not a Rule 4 architectural build): the marks
// table below is ported from `app/vamos-locale.js`'s `CURS` table (01-PATTERNS.md § this
// file's analog), but this module has no React state, no `onChange` broadcast, and no
// `localStorage` read — that full client-side currency-switch store is D-16 / ADR-004's
// "remains client-only" contract, explicitly Plan 13's scope
// (`apps/web/app/[locale]/providers.tsx`'s own comment: "the client-only currency store
// (Plan 13, D-16)"). Building that store here, three plans early, would be exactly the
// kind of architectural expansion Rule 4 reserves for a decision, not an auto-fix — this
// plan's two components only need a shared place the mark comes from, not a switchable
// one yet.
//
// ADR-004 / Law 04 (`CLAUDE.md` § "A pending value is a labelled gap"): every amount is a
// placeholder until the real CHF matrix lands in Phase 4 (`pricing_live=false`). Passing
// no `amount` (or `null`) is the only value any caller in this codebase should pass today
// — `formatAmount` renders the placeholder figure `000`, never an invented number.

export type CurrencyCode = "CHF" | "EUR" | "USD" | "AED";

interface CurrencyMark {
  sym: string;
  /** The separator between the mark and the figure — CHF/EUR/AED read "CHF 000" with a
   *  space, USD reads "$000" with none, ported verbatim from `vamos-locale.js`'s `CURS`. */
  space: string;
}

export const CURRENCY_MARKS: Record<CurrencyCode, CurrencyMark> = {
  CHF: { sym: "CHF", space: " " },
  EUR: { sym: "€", space: " " },
  USD: { sym: "$", space: "" },
  AED: { sym: "AED", space: " " },
};

/** Swiss thousands-grouping (`1'250.00`), matching the apostrophe format
 *  `vamos-locale.js`'s own `MONEY_RE` already expects. Only exercised once Phase 4 starts
 *  passing a real `amount` — every call in this phase passes `null`/`undefined`. */
function formatFigure(amount: number): string {
  return amount.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** `amount == null` -> the Law 04 placeholder figure (`"000"`), never a real number.
 *  `currency` defaults to `"CHF"`, the one priced currency (ADR-004) — every other code
 *  is presentational only, per that ADR's own decision. */
export function formatAmount(
  amount: number | null | undefined,
  currency: CurrencyCode = "CHF",
): string {
  const mark = CURRENCY_MARKS[currency];
  const figure = amount == null ? "000" : formatFigure(amount);
  return `${mark.sym}${mark.space}${figure}`;
}
