// apps/web/lib/consent/choice.ts
//
// Pure mapping from the visitor's choice to the categories written to consent_log.

import type { ConsentMethod } from "./bind";

export type ConsentCategories = {
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
};

/**
 * Map a consent method and request body to the categories to record (D-05).
 * accept_all is all true and reject_all all false, body ignored; settings_change
 * needs three real booleans, anything else is rejected, never defaulted.
 */
export function categoriesForChoice(
  method: ConsentMethod,
  body: Record<string, unknown>,
): { ok: true; categories: ConsentCategories } | { ok: false } {
  if (method === "accept_all") {
    return { ok: true, categories: { functional: true, analytics: true, marketing: true } };
  }
  if (method === "reject_all") {
    return { ok: true, categories: { functional: false, analytics: false, marketing: false } };
  }
  const { functional, analytics, marketing } = body;
  if (
    typeof functional !== "boolean" ||
    typeof analytics !== "boolean" ||
    typeof marketing !== "boolean"
  ) {
    return { ok: false };
  }
  return { ok: true, categories: { functional, analytics, marketing } };
}

/** Turnstile is required whenever the row to be written turns Meta on (D-33). */
export function needsTurnstile(categories: ConsentCategories): boolean {
  return categories.marketing === true;
}
