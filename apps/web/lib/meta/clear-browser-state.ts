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
