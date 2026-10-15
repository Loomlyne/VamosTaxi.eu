# Quick Task 261015-6om: hold hours follow the Pricing box - Context

**Gathered:** 2026-10-15 (work session, worktree `quick/hold-hours-follow-pricing`)
**Status:** Ready for planning. Decisions D1–D3 are PROPOSED, pending the owner's signature through the controller (T3 thread 0fbbf0c1). No code before he signs.
**Signed job:** decision item 17, `.planning/decisions/2026-10-13-p30-ship-p31-lines-rls-fix.md`.

<domain>
## Task Boundary

Checkout's "This price is held for {hours} hours" must follow the Pricing box "Price stays valid for N hours" (`rate_versions.quote_lock_minutes`, PR #81, squash 6837a10d) instead of the Settings checkout window (`settings_versions.checkout_window_minutes`). Money path: nothing may change an existing booking's price or deadline.

</domain>

<findings>
## What reads what today (code on origin/main 7b911c11; live rows read-only 2026-10-15)

Live: rate book 22 `live` quote_lock_minutes 1440; draft 23 1440; current settings row 18 (`fare-publish-22`) quote_lock_minutes 1440, checkout_window_minutes 1440.

### Writers
- Pricing box → `rate-book/route.ts:957-963` writes the **draft's** `rate_versions.quote_lock_minutes` (not the live book). It becomes live only on Publish.
- Publish → `rate-versions/[id]/publish/route.ts:114,141,176-177`: live book gets `lockMinutes` (draft value, else `QUOTE_LOCK_MINUTES` 1440); the new `settings_versions` row gets `quote_lock_minutes = lockMinutes` but `checkout_window_minutes` **copied from the previous settings row** (`sv.checkout_window_minutes`).
- Settings policy Publish (SQL `policy_draft_publish`, 20261007210000:146-147) copies both from the live settings row. No ops screen edits `checkout_window_minutes`; it has been 1440 since seed / 20260907000001.

### Server clocks (the actual hold)
1. **Quote lock** — `quote_lock_deadline(settings_version_id)` (20260825000005:176) = now() + `settings_versions.quote_lock_minutes` of the quote's settings row. Baked into the signed lock token `exp` and into `price_snapshots.quote_lock_expires_at`. **Already follows the box after Publish.**
2. **Payment window** — `create_quote_snapshot` (20260825000007:76-144) writes `price_snapshots.expires_at = now() + checkout_window_minutes` of the quote's settings row, at the moment Pay is pressed. **Uses `checkout_window_minutes`.**
3. Charge gate `tg_payment_matches_snapshot` (latest 20261012110000:223-233) refuses unless BOTH clocks are open (each widened by `bookings.hold_until`). Hourly cron `checkout_expire_unpaid` cancels on `quote_lock_expires_at`.
   So the effective hold = min(lock from quote time, window from Pay press). With equal lengths the lock always binds (Pay is pressed after the quote). If the box is set above 24 h while the window stays 1440, a customer who presses Pay early is refused after 24 h from that press, before the hours the box promises.
4. **Pay link** — `checkout_set_pay_link` (20261012170000:603) `hold_until = least(token expiry, sent + interval '24 hours')`, a fixed 24 h from sending (signed D-20, 26.1-15). The pay-link email `PayLinkEmail.tsx:40` `LOCK_HOURS = 24` ("This price is held 24 hours. After that the link is dead."). Neither reads either column.
5. **Web Stripe session** — `intent/route.ts:279` `WEB_CHECKOUT_MINUTES = 31` (Stripe floor); its `expiresAt` is the Stripe page only. The route refuses `payment_window_closed` when `checkout_window_minutes` is null (`intent/route.ts:140`), mirroring the raise in `create_quote_snapshot`.

### The sentence
- `checkout.checkoutWindowHours` exists in en/de/fr/ar (`apps/web/i18n/messages/*.json:475`, seed `content_strings` line 671), and `layout.tsx` still loads `checkoutWindowMinutes` into `CheckoutSettings` — **but no component renders it.** The Phase 26.3 rebuild (af93fc8e, 2026-09-29) removed both `<p className="vt-checkout__charge">{t("checkoutWindowHours", { hours })}</p>` lines. The DC mock `app/pages/checkout.dc.html` has no such sentence either. Today the customer sees no hold sentence on checkout; the only "held … hours" copy is the pay-link email (fixed 24).
- `checkout.livePriceChangedLocked` ("…until the {hours} hours end.") is also unused.

</findings>

<decisions>
## Implementation Decisions (PROPOSED — owner signs)

### D1 · One source of truth
The live book's `quote_lock_minutes`, as Publish stamps it on the current `settings_versions` row (the row `quote_lock_deadline` reads). Publish also writes `checkout_window_minutes = lockMinutes`, so the payment window is a mirror of the box and can never cut a hold short. No SQL function changes, **no migration**.
- Fallback when null: unchanged — Publish already uses `QUOTE_LOCK_MINUTES` (1440) when the draft has none; the sentence hides (never invents hours) when the settings row has none or the hours are not whole.
- Existing quotes and bookings keep their old deadline by construction: the lock `exp`, `quote_lock_expires_at` and `expires_at` are baked at quote / Pay time, and `create_quote_snapshot` reads the window from the **quote's own** `settings_version_id`, not the newest row. Publish only INSERTs a new settings row (append-only).
- `checkout_window_minutes` stays (column, DB raise and the intent gate keep working) but has no independent writer any more: Publish mirrors the box; settings policy Publish copies live. Dropping it would need a migration of money-path SQL for no customer gain.
- Rejected alternative: migration making `create_quote_snapshot` read `quote_lock_minutes` (needs `20261012310000`, touches the charge-gate clock; same result).

### D2 · The sentence comes back on checkout (needs a picture + his signature before code)
Render `t("checkoutWindowHours", { hours })` once in the summary rail under the total (and the mobile bar), hours from the current settings row's `quote_lock_minutes` via `checkoutWindowHours()`. Hidden when null. Same line in the DC mock `checkout.dc.html` and `vamos-i18n-dict.js` (pattern for `{hours}`), en/de/fr/ar.
- If he says "do not show it": drop the render work; D1 alone still makes the real hold follow the box.
- Known edge: a customer mid-checkout across a Publish sees the new hours while their lock keeps the old deadline (display only; the old deadline binds).

### D3 · Pay link stays 24 h (out of scope)
The pay-link hold (`sent + 24 hours`, signed D-20) and its email line stay fixed. A separate job if he wants them to follow the box.

### Claude's Discretion
Test names, exact prop rename (`checkoutWindowMinutes` → `priceHoldMinutes` in `CheckoutSettings`), comment wording.

</decisions>

<canonical_refs>
## Canonical References
- `.planning/decisions/2026-10-13-p30-ship-p31-lines-rls-fix.md` items 13, 16, 17
- `apps/web/lib/quote/lock.ts` header (lock length = book's quote_lock_minutes, baked at lock time)
- `packages/db/supabase/migrations/20260928140000_pay_link_hold_24h.sql` (D-20 one clock for pay links)
- Memory: money-path-invariants (real 4242 after deploy is the proof)
</canonical_refs>
</content>
</invoke>
