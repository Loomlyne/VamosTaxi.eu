// Pay-link recipient page states (26.1-16, D-20/D-21/D-22, UI-SPEC §1).
// Pure: the server decides the state; this only reads the open route's answer.
// Client-safe — no server imports.

import { BOOKING_REFERENCE_RE } from "./booking-status";
import { checkoutSessionIdFromSecret } from "./return-url";

export type PayAlertKey =
  | "pricingNotLive"
  | "quoteExpired"
  | "quoteAlreadyBooked"
  | "paymentWindowClosed"
  | "completeCard"
  | "payCouldNotStart";

export type PayState =
  | { kind: "payable" }
  | { kind: "alreadyPaid"; reference: string }
  | { kind: "raceRefunded"; reference: string }
  | { kind: "expired" }
  | { kind: "alert"; key: PayAlertKey };

/** Mirrors the confirmation page's poll (POLL_INTERVAL_MS / POLL_GIVE_UP_MS). */
export const PAY_LINK_POLL_INTERVAL_MS = 1000;
export const PAY_LINK_POLL_BUDGET_MS = 12_000;

const SESSION_KEY_PREFIX = "vamos.payLink.session.";
const SESSION_KEY_TOKEN_CHARS = 12;

/** Charge-gate codes stay on their Alerts. Unknown opens are not those keys. */
export function chargeGateAlert(code: string | undefined): PayAlertKey | null {
  if (code === "pricing_not_live") return "pricingNotLive";
  if (code === "quote_expired") return "quoteExpired";
  if (code === "quote_already_booked") return "quoteAlreadyBooked";
  return null;
}

function safeReference(value: unknown): string {
  return typeof value === "string" && BOOKING_REFERENCE_RE.test(value) ? value : "";
}

/**
 * Reads the open route's JSON into one recipient state. A refusal code wins
 * over anything else in the body: paid (D-21), refunded duplicate (D-22),
 * expired (D-20). A client secret without a code is payable. Every other
 * refusal keeps its existing alert key.
 */
export function payStateFromOpen(json: unknown): PayState {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const code = typeof body.code === "string" ? body.code : undefined;
  if (code === "pay_link_paid") return { kind: "alreadyPaid", reference: safeReference(body.reference) };
  if (code === "pay_link_refunded_duplicate") {
    return { kind: "raceRefunded", reference: safeReference(body.reference) };
  }
  if (code === "pay_link_expired" || code === "quote_expired") return { kind: "expired" };
  if (!code && typeof body.client_secret === "string" && body.client_secret) return { kind: "payable" };
  return { kind: "alert", key: chargeGateAlert(code) ?? "paymentWindowClosed" };
}

/** The Checkout Session id in front of `_secret_`, or null. */
export function sessionIdFromClientSecret(secret: unknown): string | null {
  if (typeof secret !== "string") return null;
  return checkoutSessionIdFromSecret(secret) || null;
}

/** sessionStorage key for the recipient's own session id: the token's first 12 characters. */
export function payLinkSessionKey(token: string): string {
  const normalized = token.trim().replace(/\s+/g, "");
  return `${SESSION_KEY_PREFIX}${normalized.slice(0, SESSION_KEY_TOKEN_CHARS)}`;
}

/**
 * After the recipient's own payment confirms: paid means their charge is the
 * one that settled (continue to the success path); refunded duplicate means
 * it lost the race (show the race card). Anything else is still settling.
 */
export function payPollStep(state: PayState): "continue" | "raceRefunded" | "wait" {
  if (state.kind === "alreadyPaid") return "continue";
  if (state.kind === "raceRefunded") return "raceRefunded";
  return "wait";
}

/** Splits a translated sentence around a placeholder marker so the value can sit in its own element. */
export function splitAroundMarker(
  text: string,
  marker: string,
): { before: string; after: string } | null {
  const at = text.indexOf(marker);
  if (at < 0) return null;
  return { before: text.slice(0, at), after: text.slice(at + marker.length) };
}
