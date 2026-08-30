// apps/web/lib/quote/client-contract.ts
//
// 04-UI-SPEC.md §H exists so two plans cannot invent two treatments for the
// same refusal, and a table that lives only in a markdown file is a table
// nobody's compiler reads.
//
// D-46 requires every priced value to render through lib/currency.ts's
// existing formatAmount, unchanged. A second formatter is how CHF 000
// becomes CHF 0.00 in one place. This module carries no formatter;
// currency.ts needs zero edits for this phase.
//
// Assumption fields below (04-UI-SPEC.md Assumptions 1, 7, 8) are this
// agent's calls awaiting an owner ruling — not locked decisions.

import { QUOTE_ERRORS, type QuoteErrorCode } from "./errors";
import type { QuoteResponseBody } from "./respond";

/**
 * Re-export the API's emitted success body. A second declaration of the
 * same shape is a second thing to keep in sync; respond.ts is the only
 * honest source.
 */
export type QuoteResponse = QuoteResponseBody;

/**
 * Reprice emits the same success body as quote (coupon included when
 * present). There is no second response type in respond.ts to drift from.
 */
export type RepriceResponse = QuoteResponseBody;

export type RefusalComponent =
  | "Input"
  | "Alert"
  | "DatePicker"
  | "PriceSummary"
  | "Toast"
  | "Counter"
  | "data-tok";

export type RefusalSlot =
  | "error"
  | "note"
  | "hint"
  | "pill"
  | "toast"
  | "message";

export type RefusalPlacement =
  | "inline"
  | "board-level"
  | "sticky-price-panel"
  | "transient"
  | "near-field";

export type RefusalTone = "danger" | "neutral" | "muted" | "info";

export type Binding = {
  component: RefusalComponent;
  slot: RefusalSlot;
  placement: RefusalPlacement;
  tone: RefusalTone;
  /** Looked up from errors.ts — never retyped. */
  i18n_key: string;
  englishOnPurpose?: true;
  /**
   * 04-UI-SPEC.md assumption number this row encodes. Agent call, not a
   * locked decision — a later owner ruling is visible as a change.
   */
  assumption?: 1 | 3 | 4 | 5 | 7 | 8;
};

export const REFUSAL_BINDINGS: Record<QuoteErrorCode, Binding> = {
  untrusted_input: {
    component: "Toast",
    slot: "toast",
    placement: "transient",
    tone: "danger",
    i18n_key: QUOTE_ERRORS.untrusted_input.i18n_key,
  },
  malformed: {
    component: "Input",
    slot: "error",
    placement: "inline",
    tone: "danger",
    i18n_key: QUOTE_ERRORS.malformed.i18n_key,
  },
  mode_not_offered: {
    component: "Toast",
    slot: "toast",
    placement: "transient",
    tone: "danger",
    i18n_key: QUOTE_ERRORS.mode_not_offered.i18n_key,
  },
  place_unresolved: {
    component: "Input",
    slot: "hint",
    placement: "inline",
    tone: "muted",
    i18n_key: QUOTE_ERRORS.place_unresolved.i18n_key,
  },
  same_place: {
    component: "Input",
    slot: "error",
    placement: "inline",
    tone: "danger",
    i18n_key: QUOTE_ERRORS.same_place.i18n_key,
  },
  place_out_of_box: {
    component: "Input",
    slot: "error",
    placement: "inline",
    tone: "danger",
    i18n_key: QUOTE_ERRORS.place_out_of_box.i18n_key,
  },
  out_of_service_area: {
    component: "Alert",
    slot: "message",
    placement: "board-level",
    tone: "danger",
    i18n_key: QUOTE_ERRORS.out_of_service_area.i18n_key,
  },
  service_area_undefined: {
    component: "data-tok",
    slot: "pill",
    placement: "inline",
    tone: "neutral",
    i18n_key: QUOTE_ERRORS.service_area_undefined.i18n_key,
    englishOnPurpose: true,
  },
  min_advance: {
    component: "DatePicker",
    slot: "error",
    placement: "inline",
    tone: "danger",
    i18n_key: QUOTE_ERRORS.min_advance.i18n_key,
  },
  route_unavailable: {
    component: "Alert",
    slot: "message",
    placement: "board-level",
    tone: "danger",
    i18n_key: QUOTE_ERRORS.route_unavailable.i18n_key,
  },
  extras_max_stops: {
    component: "Counter",
    slot: "error",
    placement: "inline",
    tone: "danger",
    i18n_key: QUOTE_ERRORS.extras_max_stops.i18n_key,
  },
  extras_max_child_seats: {
    component: "Counter",
    slot: "error",
    placement: "inline",
    tone: "danger",
    i18n_key: QUOTE_ERRORS.extras_max_child_seats.i18n_key,
  },
  no_settings_version: {
    component: "Toast",
    slot: "toast",
    placement: "transient",
    tone: "danger",
    i18n_key: QUOTE_ERRORS.no_settings_version.i18n_key,
  },
  rate_limited: {
    component: "Toast",
    slot: "toast",
    placement: "transient",
    tone: "danger",
    i18n_key: QUOTE_ERRORS.rate_limited.i18n_key,
    assumption: 8,
  },
  turnstile_required: {
    component: "Toast",
    slot: "toast",
    placement: "transient",
    tone: "neutral",
    i18n_key: QUOTE_ERRORS.turnstile_required.i18n_key,
    assumption: 8,
  },
  retrieve_without_suggest: {
    component: "Toast",
    slot: "toast",
    placement: "transient",
    tone: "danger",
    i18n_key: QUOTE_ERRORS.retrieve_without_suggest.i18n_key,
  },
  temporarily_unavailable: {
    component: "Toast",
    slot: "toast",
    placement: "transient",
    tone: "danger",
    i18n_key: QUOTE_ERRORS.temporarily_unavailable.i18n_key,
    assumption: 8,
  },
  provider_unavailable: {
    component: "Alert",
    slot: "message",
    placement: "near-field",
    tone: "info",
    i18n_key: QUOTE_ERRORS.provider_unavailable.i18n_key,
  },
  not_found: {
    component: "Input",
    slot: "hint",
    placement: "inline",
    tone: "muted",
    i18n_key: QUOTE_ERRORS.not_found.i18n_key,
  },
  quote_not_found: {
    component: "Alert",
    slot: "message",
    placement: "sticky-price-panel",
    tone: "danger",
    i18n_key: QUOTE_ERRORS.quote_not_found.i18n_key,
  },
  quote_expired: {
    component: "Alert",
    slot: "message",
    placement: "sticky-price-panel",
    tone: "danger",
    i18n_key: QUOTE_ERRORS.quote_expired.i18n_key,
  },
  pricing_not_live: {
    component: "PriceSummary",
    slot: "note",
    placement: "sticky-price-panel",
    tone: "muted",
    i18n_key: QUOTE_ERRORS.pricing_not_live.i18n_key,
    assumption: 7,
  },
  price_changed: {
    component: "Alert",
    slot: "message",
    placement: "sticky-price-panel",
    tone: "danger",
    i18n_key: QUOTE_ERRORS.price_changed.i18n_key,
  },
  engine_changed: {
    component: "Alert",
    slot: "message",
    placement: "sticky-price-panel",
    tone: "danger",
    i18n_key: QUOTE_ERRORS.engine_changed.i18n_key,
  },
  coupon_no_longer_valid: {
    component: "Input",
    slot: "error",
    placement: "inline",
    tone: "danger",
    i18n_key: QUOTE_ERRORS.coupon_no_longer_valid.i18n_key,
  },
  partially_priced_class: {
    component: "Toast",
    slot: "toast",
    placement: "transient",
    tone: "danger",
    i18n_key: QUOTE_ERRORS.partially_priced_class.i18n_key,
  },
};

/**
 * ICU params that must wear `.vt-dir-keep` under Arabic: countdown `{time}`,
 * coupon `{code}`, flight times `{t}` / candidate `{time}`, airport codes
 * `{ap}`. Booking references are not in quote.* / price.* this phase.
 *
 * ADR-012: Economy, Business and Van are literals wearing `.vt-dir-keep` in
 * every locale and are already in `$meta.nonTranslatableKeys` — this
 * registry adds nothing for them.
 */
export const DIR_KEEP_PARAMS = ["time", "code", "t", "ap"] as const;

export type DirKeepParam = (typeof DIR_KEEP_PARAMS)[number];

/**
 * Seconds of lock remaining at which the countdown steps to danger tone.
 * 04-UI-SPEC.md Assumption 1 calls the two-minute figure arbitrary — a
 * later owner ruling is one edit, not a search.
 */
export const LOCK_DANGER_THRESHOLD_S = 120;

export type { QuoteErrorCode };
