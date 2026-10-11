// WR-03 (launch readiness review 2026-10-11): the InitiateCheckout event id is stable for the same checkout
// selection within the tab, so a reload sends the same id and Meta de-duplicates on event_id. A new selection
// (another class, price or trip) gets a new id. Storage is per tab (sessionStorage), local only; the key is a
// hash so no route text is written. Any storage failure falls back to a fresh id. Nothing is kept until the
// visitor's cached choice for the current policy version says Marketing is on (fix review WR-01, 2026-10-11).

import { CONSENT_POLICY_VERSION } from "@/lib/consent/policy";

const PREFIX = "vamosInitiateId:";

/** Short non-cryptographic hash (djb2) of the selection text. */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export type InitiateSelection = {
  slug: string;
  totalRappen: number;
  fid: string | null;
  tid: string | null;
  from: string | null;
  to: string | null;
  when: string | null;
  pax: number | null;
  bags: number | null;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The event id for this checkout selection: reused from sessionStorage when the same selection was already
 * sent in this tab, else a new one (stored). `storage` null or throwing means a fresh id every time.
 */
export function initiateEventId(sel: InitiateSelection, storage: StorageLike | null, makeId: () => string): string {
  const key =
    PREFIX +
    hash([sel.slug, sel.totalRappen, sel.fid, sel.tid, sel.from, sel.to, sel.when, sel.pax, sel.bags].map((v) => String(v ?? "")).join("|"));
  try {
    const kept = storage?.getItem(key);
    if (kept && UUID_RE.test(kept)) return kept;
  } catch {
    // storage unavailable: fall through to a fresh id
  }
  const id = makeId();
  try {
    storage?.setItem(key, id);
  } catch {
    // not kept: the next load gets its own id
  }
  return id;
}

/**
 * True only when the display cache app/vamos-consent.js writes (localStorage `vamosCookieConsent`) is for the
 * current policy version and has Marketing on. Anything else, unreadable storage included, is false.
 */
export function marketingConsentCached(local: Pick<Storage, "getItem"> | null): boolean {
  try {
    const c = JSON.parse(local?.getItem("vamosCookieConsent") ?? "null") as { v?: unknown; marketing?: unknown } | null;
    return !!c && typeof c === "object" && c.v === CONSENT_POLICY_VERSION && c.marketing === true;
  } catch {
    return false;
  }
}
