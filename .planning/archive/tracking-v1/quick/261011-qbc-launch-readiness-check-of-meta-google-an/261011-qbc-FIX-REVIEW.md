---
phase: 261011-qbc-launch-readiness-check-of-meta-google-an
reviewed: 2026-10-11T15:16:19Z
depth: deep
files_reviewed: 7
files_reviewed_list:
  - app/vamos-google.js
  - apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx
  - apps/web/app/[locale]/checkout/CheckoutPage.tsx
  - apps/web/lib/google/google.test.ts
  - apps/web/lib/meta/initiate-id.ts
  - apps/web/lib/meta/initiate-id.test.ts
  - apps/web/lib/checkout/confirmation-conversion.test.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Quick 261011-qbc: Review of the CR-01 and WR-03 fixes

**Reviewed:** 2026-10-11T15:16:19Z
**Depth:** deep (loader call order traced end to end; page effect, poller and server route read; touched suites run)
**Files Reviewed:** 7 (the six submitted plus `confirmation-conversion.test.ts`, which is also modified in the working tree and is needed for the suite to pass)
**Status:** issues_found (no blocker)

## Summary

CR-01 is fixed correctly. The hand-off is now order-independent and every path into Google still passes the loader's own guards. Traced:

- **Page before loader** (the normal paid-and-returned path): the effect finds no `window.VamosGoogle`, creates `window.VamosGoogleQueue = []` and pushes `{value, transactionId}`. The loader's drain block (`app/vamos-google.js:286-292`) runs synchronously inside the IIFE *before* `start()`, so `loaded` is false and `conversion()` only validates and queues (`:242-244`). `start()` then runs `check()`; the server's consent answer either boots gtag and `flushQueued()` (`:206`) or calls `withdraw()`, which empties `queued` (`:160`). The item is therefore held until server-confirmed Marketing consent and dropped on refusal. Nothing reaches `gtag('event', ...)` before `bootGoogle`.
- **Loader before page**: the effect calls `VamosGoogle.conversion()` directly; behaviour unchanged from before.
- **Twice**: `sendConversion()` writes `localStorage.vamosGoogleConv:<ref>` before the send (`:170-173`), so a second item for the same reference (effect re-run, late push, reload, second tab) is skipped. The poller only changes `liveStatus`/`livePayment` (`ConfirmationClient.tsx:524-525`); `booking.receipt.chargedRappen` and `priceTotalRappen` are fixed at mount, so `conversionValue` goes from `null` to one number at most once and the effect pushes at most twice over a page life. Far under `MAX_QUEUED = 3`, and the key makes extras harmless anyway.
- **Not paid**: unchanged gate in `confirmationConversion` (badge paid/confirmed/assigned, `returnPhase === "booked"` on the return path, `paidAt` within the hour otherwise).
- **Loader runs twice** (helmet scripts run twice on mocks): the second copy hits `if (window.VamosGoogle) return;` at `:30` before the drain block, so it neither re-drains nor replaces the push-proxy. The proxy object has no numeric `length`, so even a hypothetical third copy with `VamosGoogle` cleared would skip it as "no early items". Correct.
- **bfcache**: `pageshow` → `check()` → `bootGoogle()` returns at `if (loaded ...)`; no resend.
- **Plain ES5**: the new block uses `var`, `function`, a `for` loop; no arrow, `let`, `const`, template literal or spread. `typeof URL` guard already existed.
- **Deploy**: `apps/web/public/app/vamos-google.js` is produced by `scripts/sync-dc-mock-to-public.mjs`, which runs in `prebuild` and in `scripts/deploy-worker.mjs:95` before the OpenNext build; the synced copy differs from the source only by the stripped header comment and carries the queue block.

WR-03 is fixed as asked: the id is a UUID kept in `sessionStorage` under a djb2 hash of the selection, so a reload or Back from Stripe re-sends the same `event_id` and Meta de-duplicates within 48 h. The stored value is a random UUID; the key is a 32-bit hash; no address, flight or price text is written. A server repeat of the same id is harmless: `/api/track` forwards it with no uniqueness constraint and always answers 204.

Touched suites pass (117 tests in `google.test.ts`, `initiate-id.test.ts`, `confirmation-conversion.test.ts`); `tsc --noEmit` and eslint on the changed TS files are clean.

Two warnings remain, neither a blocker: the tracking id is written to the browser before any consent choice, and the page-side race is still proven only by a source-text pin rather than a mounted component.

## Warnings

### WR-01 (Medium): The InitiateCheckout id is written to `sessionStorage` before any consent choice

**File:** `apps/web/app/[locale]/checkout/CheckoutPage.tsx:304-315`, `apps/web/lib/meta/initiate-id.ts:45-50`

**Issue:** `trackInitiate` runs on the first eligible class pick regardless of the visitor's cookie choice; `initiateEventId` then writes `vamosInitiateId:<hash> = <uuid>` into `sessionStorage`. The server still refuses to send the event without Marketing consent, so no data leaves, but the browser now stores a tracking-only identifier for a visitor who has not chosen, or who chose Necessary only. The existing `sessionStorage` writes (`booking-draft.ts`, the return stash, the pay-link session) are functional; this one exists only to key a Meta event. The project's own standard for the Google side is stricter: `vamosGoogleConv:<ref>` is written only after the server has confirmed Marketing (`vamos-google.js:170-173`). For EU visitors (ePrivacy) a non-essential terminal-storage write without consent is the thing regulators look at, even if the value is random.

**Fix:** Pass a store only when the browser's own consent cache already says Marketing is on; otherwise pass `null` (fresh id, nothing stored). The cache the banner writes is `localStorage.vamosCookieConsent` (`app/vamos-consent.js:31`); read it through the Next consent helper if there is one, else:

```ts
function marketingCached(): boolean {
  try {
    const c = JSON.parse(window.localStorage.getItem("vamosCookieConsent") ?? "null");
    return c?.marketing === true;
  } catch {
    return false;
  }
}
// in trackInitiate
store = marketingCached() ? window.sessionStorage : null;
```

A visitor with no choice keeps the old per-load id (the WR-03 under-count is then limited to people who have not consented, whose event the server drops anyway). Add one test in `initiate-id.test.ts` or a CheckoutPage unit that `store === null` leaves `sessionStorage` untouched.

### WR-02 (Medium): The page-side half of the race is still pinned by source text, not exercised

**File:** `apps/web/lib/checkout/confirmation-conversion.test.ts:69-83`, `apps/web/lib/google/google.test.ts:366-414`

**Issue:** The loader tests are good: `pending()` is 1 before the consent answer and exactly one `gtag('event','conversion')` goes out after it; Marketing off drops it; a late push and a reload are once-only. But the page side (`ConfirmationClient.tsx:576-594`) is covered only by regexes (`VamosGoogle\.conversion\(` once, `q\.push\(item\)` once, dependency array literal). That test would pass if the effect pushed the wrong shape, pushed under a different global name, or never ran (the exact failure class of CR-01). The prior review asked for a mounted test: render `ConfirmationClient` with `initialPhase="confirmed"` and a recent `paidAt`, no `window.VamosGoogle`, then evaluate the loader source into the same window and assert one conversion.

**Fix:** Add `apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.google.test.tsx` (jsdom): mount with a confirmed booking, assert `window.VamosGoogleQueue` is an array with one `{ value, transactionId: ref }` after effects; then `new Function(loaderSource)()` with the `load()` harness from `google.test.ts` (fetch returning Marketing on), `await settle()`, and assert exactly one `gtag('event','conversion', { transaction_id: ref, value })`. Keep the text pin as a secondary guard. Until that exists, the standing launch proof applies: one 4242 payment with Tag Assistant open on the live `/confirmation/<ref>` page.

## Info

### IN-01 (Low): A visitor who first accepts cookies on the confirmation page loses the conversion (pre-existing design)

**File:** `app/vamos-google.js:221-225, 158-167`

`check()` calls `withdraw()` for `chosen === false` (no choice yet), which empties `queued`. A later Accept on the same page fires `vamos:consent-recorded` → `check()` → `bootGoogle()` with an empty queue, and the React effect does not re-run. This was already true before the fix and the header comment documents "a later Accept does not replay it"; the early queue adds no new path. Noted only because the owner should expect this under-count. A fix, if wanted later: keep the item when `chosen === false` (drop only on an explicit Marketing off), guarded by the same seen-key.

### IN-02 (Low): The same selection booked twice in one tab within 48 h sends one InitiateCheckout

**File:** `apps/web/lib/meta/initiate-id.ts:36-38`

The key is slug + total + fid + tid + from + to + when + pax + bags. A customer who pays and immediately starts an identical second booking in the same tab (same time, same route, second car) gets the stored id, and Meta counts one InitiateCheckout for two genuine funnels. `when` makes a different day or time a new key, so "days later" is not affected. If this matters, clear `vamosInitiateId:*` on the confirmation page or fold the quote id into the key. Keys also accumulate per distinct selection for the tab's life (tiny, cleared on tab close).

### IN-03 (Info): `window.VamosGoogleQueue` holds the amount and reference on a page global before the loader runs

**File:** `apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx:588-589`

The array exposes `{ value, transactionId }` to any script on the page until the loader replaces it. The loader's own `VamosGoogle` and `dataLayer` expose the same two facts, and the CSP limits scripts, so nothing new leaks. No action.

### IN-04 (Info): A seventh modified file sits outside the submitted list

**File:** `apps/web/lib/checkout/confirmation-conversion.test.ts:69-73`

The pin test was updated for the new call shape (`VamosGoogle.conversion(` and `q.push(item)`); without it the suite fails against the new TSX. It belongs in the same commit. Reviewed here and found consistent.

## Checks that passed (the questions asked)

1. Twice / unpaid / before consent: no. Once-only key written before the send; `confirmationConversion` gates unpaid; the server consent answer gates the boot; the drained item waits in `queued`.
2. Drain order: drain runs before `start()`/`check()`; `conversion()` queues (not loaded) and `flushQueued()` sends after boot; `withdraw()` drops it.
3. Double loader: early return at `:30` keeps the first copy's proxy and does not re-drain. Effect re-runs: at most one extra push per page; under `MAX_QUEUED`; de-duplicated by key.
4. WR-03: stable id only within one tab for an identical selection; `when` separates new trips; stored value is a UUID, key a hash. Storage-before-consent is WR-01 above.
5. ES5: yes.
6. Tests: the loader race is exercised (pending before settle, one send after); the page side is a text pin (WR-02).

VERDICT: SHIP

---

_Reviewed: 2026-10-11T15:16:19Z_
_Reviewer: Claude (gsd-code-reviewer, Fable 5.1)_
_Depth: deep_
