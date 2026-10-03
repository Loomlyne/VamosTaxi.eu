/**
 * Phase 28 CR-01: delete what Meta's script wrote in this browser. Used by the React cookie banner
 * (checkout, confirmation, pay link) when a saved choice has Marketing off, and when the server says
 * so on load. The mock pages do the same in `app/vamos-meta.js`. Only deletes; never writes a value.
 * No Meta host and no pixel id here (the Phase 26 needle scan reads this folder).
 */

const COOKIE_NAMES = ["_fbp", "_fbc", "_fbleid"] as const;
const STORAGE_KEYS = ["multiFbc", "aemSource"] as const;

/** Every domain form a cookie of this host can have: host-only, then each parent suffix with a dot. */
export function cookieDomainForms(hostname: string): string[] {
  const parts = hostname.split(".");
  const forms = [""];
  for (let i = parts.length - 2; i >= 0; i--) forms.push(`.${parts.slice(i).join(".")}`);
  return forms;
}

/**
 * What the banner does with the server's answer from GET /api/consent/state (review 2, item 1).
 * Marketing on under the current policy: nothing. No choice recorded (`chosen: false`), or a choice with
 * Marketing off: delete what Meta left in this browser, the same rule as the mock loader. The caller
 * runs this only for an answer the server actually gave; an unreachable server deletes nothing.
 */
export function clearMetaUnlessMarketingOn(
  reply: { chosen?: boolean; choice?: { marketing?: boolean } | null },
  clear: () => void = clearMetaBrowserState,
): void {
  if (reply.chosen === true && reply.choice && reply.choice.marketing === true) return;
  clear();
}

/** Ends `_fbp`, `_fbc`, `_fbleid` (every domain form) and removes Meta's two local storage keys. */
export function clearMetaBrowserState(): void {
  if (typeof document === "undefined") return;
  try {
    for (const name of COOKIE_NAMES) {
      for (const domain of cookieDomainForms(window.location.hostname)) {
        document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ""}`;
      }
    }
  } catch {
    // nothing to clear is not an error
  }
  for (const key of STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // storage unavailable
    }
  }
}
