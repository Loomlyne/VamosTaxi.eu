// apps/web/lib/checkout/settle-errors.ts
//
// 261002 settle safety (P-1): which errors of the Stripe-event settle a retry can cure.
//
// Why: a deadlock (40P01) or a dropped connection after Stripe had captured a difference was
// acknowledged as final, the event was recorded as failed, and the payment was never recorded.
// A database hiccup is now retried; the queue tries up to 8 times (`apps/web/wrangler.jsonc`
// `max_retries`), then the dead-letter queue sends the existing "A Stripe payment event is
// stuck" mail to info@. A permanent error after money was captured is retried the same way
// (PAID_ERROR_RETRY_SECONDS) so that mail always reaches a human.
//
// Pure functions: no database, no Stripe. Map errors AROUND `asSystem`, never inside its
// callback: postgres.js `sql.begin()` rethrows an error that was caught inside it.

/** Postgres SQLSTATE of an error (postgres.js puts it on `code`); undefined when there is none. */
export function sqlStateOf(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string") {
    return (err as { code: string }).code;
  }
  return undefined;
}

/** A real SQLSTATE is five characters, digits and upper-case letters. */
const SQLSTATE_SHAPE = /^[0-9A-Z]{5}$/;

/** Retried after the short delay: another transaction held the lock or won the race, a retry succeeds at once. */
const CONTENTION: readonly string[] = Object.freeze(["40001", "40P01", "55P03"]);

/** Whole SQLSTATE classes that a retry can cure: connection exceptions, insufficient resources, system errors. */
const TRANSIENT_CLASSES: readonly string[] = Object.freeze(["08", "53", "58"]);

/** Single SQLSTATEs that a retry can cure: statement timeout / cancel, server shutdown, cannot connect now. */
const TRANSIENT_CODES: readonly string[] = Object.freeze(["40001", "40P01", "55P03", "57014", "57P01", "57P02", "57P03"]);

/**
 * `transient`: a database hiccup that a retry can cure. That includes any error with no SQLSTATE
 * (a dropped socket, postgres.js CONNECTION_CLOSED / CONNECTION_ENDED / CONNECTION_DESTROYED /
 * CONNECT_TIMEOUT, ECONNRESET, a thrown Error). `permanent`: everything else (P0001, P0002, 23xxx,
 * 22xxx, 42xxx, XX000 …); the same input fails the same way again.
 */
export function settleErrorKind(err: unknown): "transient" | "permanent" {
  const state = sqlStateOf(err);
  if (state === undefined || !SQLSTATE_SHAPE.test(state)) return "transient";
  if (TRANSIENT_CODES.includes(state) || TRANSIENT_CLASSES.includes(state.slice(0, 2))) return "transient";
  return "permanent";
}

/** Seconds before the retry of a transient error: 5 for contention (deadlock, serialization, lock), 60 otherwise. */
export function retryDelaySeconds(err: unknown): number {
  const state = sqlStateOf(err);
  return state !== undefined && CONTENTION.includes(state) ? 5 : 60;
}

/** Seconds before the retry of a permanent error after money was captured: 8 tries span about 40 minutes at most, then the dead-letter queue mails info@. */
export const PAID_ERROR_RETRY_SECONDS = 300;
