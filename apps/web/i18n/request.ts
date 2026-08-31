import { notFound } from "next/navigation";
import { getRequestConfig } from "next-intl/server";
import { loadMessagesFromDb as loadRawFromContent } from "../lib/content/messages";
import { routing, type Locale } from "./routing";

type Messages = Record<string, unknown>;

/**
 * The loader seam D-14 names: Phase 6 has swapped this function's body for
 * a `content_strings` query. No call site elsewhere had to move. The JSON
 * kill switch (default until proven) lives in `lib/content/messages.ts`,
 * not here. The `onError`/`getMessageFallback` behaviour further down this
 * file lives in this same module rather than at any call site, so it
 * survives that swap untouched too.
 */
async function loadRawMessages(locale: Locale): Promise<Messages> {
  return loadRawFromContent(locale);
}

/**
 * `$meta` (non-translatable markers, pending-value-pill markers, the
 * parameterisation opt-out list — see scripts/migrate-dictionary.mjs and
 * scripts/check-i18n-coverage.mjs) is build-time bookkeeping for the
 * coverage gate, not a real message namespace. Stripped before the object
 * reaches next-intl so a stray `t('$meta.foo')` can never resolve and no
 * renderer has to know the key exists.
 */
function stripMeta(messages: Messages): Messages {
  if (!("$meta" in messages)) return messages;
  const { $meta: _meta, ...rest } = messages;
  return rest;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * D-17's first half: a key absent from the active locale resolves against
 * English before next-intl ever sees a gap. Deep merge so this works at any
 * nesting depth and a namespace that is only partially translated still
 * falls back leaf-by-leaf rather than namespace-by-namespace. `target`
 * (the requested locale) wins wherever both sides define the same leaf.
 */
function mergeWithEnglishFallback(target: Messages, english: Messages): Messages {
  const merged: Record<string, unknown> = { ...english, ...target };
  for (const key of Object.keys(english)) {
    const englishValue = english[key];
    const targetValue = target[key];
    if (isPlainObject(englishValue) && isPlainObject(targetValue)) {
      merged[key] = mergeWithEnglishFallback(targetValue, englishValue);
    }
  }
  return merged;
}

async function loadMessages(locale: Locale): Promise<Messages> {
  const raw = await loadRawMessages(locale);
  if (locale === routing.defaultLocale) return stripMeta(raw);
  const english = await loadRawMessages(routing.defaultLocale);
  return stripMeta(mergeWithEnglishFallback(raw, english));
}

const isDev = process.env.NODE_ENV !== "production";

/**
 * D-17's second half, runtime half: the build-time gate (scripts/check-
 * i18n-coverage.mjs, Plan 03) is what stops a missing key reaching `main`;
 * this is what stops a visitor ever seeing one if something slips through
 * anyway (a key added to a call site without ever landing in en.json, a
 * typo'd dotted path). `apps/web/lib/logger.ts` (Plan 04) had not landed
 * yet when this task ran, so this emits its own single-line structured
 * JSON in the same shape that logger is documented to use (`route`,
 * `locale`, a level) rather than depending on a module this plan does not
 * own — see the Plan 01-07 SUMMARY for the reconciliation note Plan 04
 * should pick up when it lands.
 */
function logMissingMessage(args: { key: string; namespace?: string; locale: Locale }) {
  const dottedKey = args.namespace ? `${args.namespace}.${args.key}` : args.key;
  const payload = {
    scope: "i18n",
    event: "missing_message",
    level: isDev ? "warn" : "error",
    key: dottedKey,
    locale: args.locale,
  };
  // eslint-disable-next-line no-console -- structured, single-line; see comment above.
  console[isDev ? "warn" : "error"](`[i18n] ${JSON.stringify(payload)}`);
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;

  // T-01-02 (Tampering): the `[locale]` route param is matched against the
  // fixed four-locale list before it is ever used to build a path or a
  // dictionary key. An unrecognised segment 404s here rather than being
  // concatenated into an `import()` specifier or a lookup key.
  const locale = routing.locales.find((supported) => supported === requested);
  if (!locale) {
    notFound();
  }

  return {
    locale,
    messages: await loadMessages(locale),

    // A formatting error (a malformed ICU message, a bad plural category)
    // is loud in development and swallowed to a single structured log line
    // in production — next-intl's own default is `console.error`, which is
    // fine for local dev noise but not the shape D-38's eventual logger
    // will expect once Plan 04 lands.
    onError(error) {
      const payload = { scope: "i18n", event: "intl_error", level: isDev ? "warn" : "error", code: error.code, locale };
      // eslint-disable-next-line no-console -- structured, single-line; mirrors logMissingMessage above.
      console[isDev ? "warn" : "error"](`[i18n] ${JSON.stringify(payload)}`);
    },

    // A key missing everywhere (not just in the active locale — English
    // fallback already ran in loadMessages above) renders empty, never the
    // raw dotted key path: T-01-10, upgraded from accept to mitigate by
    // this plan. Development additionally gets the loud console warning
    // above, naming the exact key and locale, so the gap is noticed while
    // it is being written rather than in a screenshot later.
    getMessageFallback({ error, key, namespace }) {
      logMissingMessage({ key, namespace, locale });
      void error;
      return "";
    },
  };
});
