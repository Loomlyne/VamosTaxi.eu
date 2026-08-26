// Structured JSON logger (D-38, PLAT-06) — the trail Phase 7's booking failures need to
// already exist rather than being added after an incident. Every line is one JSON object
// written through `console.log`, so it lands in Cloudflare's Workers Logs / `wrangler tail`
// sink with no extra transport; Logpush (deferred, see docs/build/CLOUDFLARE-RESOURCES.md)
// reads the same stream once a destination is chosen.
//
// Two hard rules, because this logger will carry real booking traffic from Phase 7:
//  1. `LogFields` only accepts scalar values (string/number/boolean/null/undefined) — a
//     whole `Request` or `Headers` object cannot type-check as a field, so a call site that
//     tries to log one gets a compile error instead of leaking it at runtime.
//  2. Any field whose *key* looks credential-shaped is redacted before serialisation, even
//     if its value would otherwise have been a legal scalar — cheap here, unenforceable once
//     call sites multiply across Phases 3-7.

export type LogLevel = "debug" | "info" | "warn" | "error";

/** A field value that can never be a whole object — no `Request`, no `Headers`, no nesting. */
export type ScalarValue = string | number | boolean | null | undefined;

export type LogFields = Record<string, ScalarValue>;

export interface RequestContext {
  /** Correlates every log line emitted for one request/invocation. */
  requestId: string;
  /**
   * The route or handler this line was emitted from — a URL pathname for a `fetch`
   * request, or a synthetic label (`scheduled:0 3 * * *`, `queue:vamos-stripe-events-staging`)
   * for the non-fetch handlers, which have no URL of their own.
   */
  route: string;
  /** Active locale, or `null` for a non-request context (scheduled trigger, queue consumer) where no locale concept applies. */
  locale: string | null;
}

// Matches a field *key* that looks like it holds a credential — checked against the key,
// never the value, so a legitimately-scalar but sensitive-named field is caught even before
// its value is inspected.
const CREDENTIAL_KEY_PATTERN =
  /token|secret|password|authoriz|api[-_]?key|cookie|credential|bearer|jwt|assertion/i;

function redact(fields: LogFields): LogFields {
  const safe: LogFields = {};
  for (const key of Object.keys(fields)) {
    safe[key] = CREDENTIAL_KEY_PATTERN.test(key) ? "[redacted]" : fields[key];
  }
  return safe;
}

/**
 * Emits one structured JSON line. `type` is both the event name and the machine-readable
 * discriminator downstream tooling (Logpush, a future dashboard) filters on — e.g.
 * `"scheduled"`, `"queue"`, `"fetch"`.
 */
export function log(
  level: LogLevel,
  type: string,
  context: RequestContext,
  fields: LogFields = {},
): void {
  const line = {
    timestamp: new Date().toISOString(),
    level,
    type,
    requestId: context.requestId,
    route: context.route,
    locale: context.locale,
    ...redact(fields),
  };
  console.log(JSON.stringify(line));
}

/**
 * Binds a request id, route and locale once so every call below it in the same
 * fetch/scheduled/queue invocation inherits them, instead of re-passing the same three
 * values at every call site (D-38's point — the correlating fields are structural, not
 * something each call site can forget).
 */
export function withRequestContext(context: RequestContext) {
  return (level: LogLevel, type: string, fields: LogFields = {}): void =>
    log(level, type, context, fields);
}
