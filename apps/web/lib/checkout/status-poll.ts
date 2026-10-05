// apps/web/lib/checkout/status-poll.ts
//
// 261005 review follow-up (S12). The confirmation page polls GET /api/checkout/status/[ref] while it waits
// for the webhook. That route spends one token of READ_RATE_LIMITER (120 per minute per address and route).
// A poll every second is 60 a minute from one tab, so two customers behind one mobile-carrier address could
// use the whole budget, after which the route answers 429 and the page used to read it as "nothing new" and
// keep asking every second. Now: one poll every 2 seconds (30 a minute per tab) and a 429 is honoured, the
// next poll waits for its Retry-After. Client side only; the route and the limiter are unchanged.

/** Between two status polls (S12: was 1000). The first poll is immediate (see ConfirmationClient). */
export const POLL_INTERVAL_MS = 2000;

/** The wait after a 429 that names no usable Retry-After. */
export const POLL_BACKOFF_DEFAULT_MS = 15_000;

/** The longest wait after a 429: the limiter's own window is 60 s, so a longer hint is not followed. */
export const POLL_BACKOFF_MAX_MS = 60_000;

/** Spread added to a back-off so customers behind one address do not all retry in the same instant. */
export const POLL_BACKOFF_JITTER_MS = 2000;

/**
 * The wait before the next poll after a 429. `retryAfter` is the response header: whole seconds.
 * Never shorter than one normal interval, never longer than the limiter's window; absent or unreadable
 * (an HTTP date, a word) is the default.
 */
export function backoffAfterRateLimit(retryAfter: string | null | undefined): number {
  const raw = (retryAfter ?? "").trim();
  if (!/^\d{1,5}$/.test(raw)) return POLL_BACKOFF_DEFAULT_MS;
  const ms = Number(raw) * 1000;
  return Math.min(POLL_BACKOFF_MAX_MS, Math.max(POLL_INTERVAL_MS, ms));
}

/**
 * Milliseconds until the next poll, given how the last one was answered. A 429 backs off by its
 * Retry-After plus up to POLL_BACKOFF_JITTER_MS (`random` is 0..1); anything else is the normal interval.
 */
export function nextPollDelayMs(status: number, retryAfter: string | null | undefined, random: number): number {
  if (status !== 429) return POLL_INTERVAL_MS;
  const jitter = Math.floor(Math.min(1, Math.max(0, random)) * POLL_BACKOFF_JITTER_MS);
  return backoffAfterRateLimit(retryAfter) + jitter;
}
