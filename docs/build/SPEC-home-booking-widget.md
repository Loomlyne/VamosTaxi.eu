# 07 — Home · booking widget: vehicle classes, mode motion, capacity, navigation

**Surface:** `home.dc.html` (and its `#fleet` contract with `checkout.dc.html`)
**Source:** motion-and-correctness review, chat, 4 Aug 2026
**Status:** built 4 Aug 2026

## 1. Vehicle classes are now tokens, not a fourth invented fleet

Home used to ship its own taxonomy (E-Class/S-Class/V-Class/Sprinter) that nothing else in the
product recognised — checkout mapped everything it didn't know to "Business" and silently threw
the real selection away. `VEHICLE_CLASSES` is now the one fixture home, checkout and
confirmation all key off (`economy` / `van`), and every name/capacity/example is a placeholder
token — see `docs/LEGAL-PLACEHOLDER-CHECKLIST.md` §H, which also flags that this pass's default
(Van 7/8) contradicts that file's earlier "confirmed 8/8" note. Not re-resolved here.

The fleet-strip grid (flex + scroll-snap on phone/tablet, `auto-fit` grid on desktop) holds 2–5
classes with no CSS changes if the client adds a third.

## 2. Mode tabs — a real segmented control, not the shared `Tabs` import

The DS `Tabs` component swapped its whole subtree on click, which is why switching one-way ↔
return ↔ hourly used to flicker. It's replaced with a small hand-built tablist: a single
absolutely-positioned charcoal pill whose `left`/`width` are live percentages of the tab index
and count (`transition: left .22s, width .22s` cubic-out) — so it works unchanged whether there
are 2 tabs (hourly off, A15) or 3. Labels never move; only the pill and the text colour animate.

Pickup, "when" and the passenger/luggage row are shared across all three modes and never
remount. Only the third slot changes (destination ↔ hourly's duration counter) — both live
inside the same `data-f="dest"` wrapper, so switching mode animates that one element's height
from its old content's height to its new content's height (200ms-ish FLIP, opacity dip,
4px rise) instead of swapping instantly. The explainer line next to the tabs does a same-place
opacity dip rather than fading out and back in. Reduced motion: pill jumps, field swap is
instant, dip is skipped.

## 3. Capacity → vehicle is now visible, not just enforced

- Crossing a class's passenger/luggage limit desaturates that card's image tile (`filter:
  saturate(.4)`, 200ms) and swaps its price for the vehicle's own limit — "Up to 3 passengers,"
  not "Not available for 4."
- If the **selected** class drops out of capacity, selection moves to the next eligible class by
  itself (smallest capacity that still fits) and says why, inline, where the "choose a class"
  helper text normally sits: "Moved to Van — Economy fits up to 3."
- Tapping an unavailable card's capacity row snaps the passenger/luggage steppers back down to
  what that card fits.
- All of it re-quotes through the existing dust-particle price animation — no second motion
  language was added on top.

## 4. Quote engine: latency ceiling, errors opt-in

- Wait time was uncapped in practice (0.6–1.5× the 1500ms default ≈ up to 2.25s). Now 0.6–1.1× a
  1200ms default, hard-clamped to 1600ms.
- Simulated quote failures (`errorRatePct`) no longer fire by default — they require `?qa=errors`
  in the URL on top of a non-zero tweak value, so a plain demo link never shows one.

## 5. "Change vehicle" returns to a live widget, not a blank one

Checkout's back link is `home.dc.html#fleet`. Home, on mount, checks for that hash and — only
then — hydrates pickup, destination, date/time, party and the selected vehicle from the same
`vamosTrip` record checkout wrote, then scrolls to the vehicle grid (`#fleet`,
`scroll-margin-top`). Outside that hash the widget still opens completely empty, as designed.

## 6. Vehicle card ↔ checkout ↔ voucher morph (View Transitions)

`@view-transition { navigation: auto }` is declared on home, checkout and confirmation, with a
`prefers-reduced-motion` override that collapses the browser's own crossfade to ~0. Shared
`view-transition-name`s: `vehicle-card` (home's picked fleet card → checkout's summary card),
`price-block` (home's price slot → checkout's `PriceSummary` → confirmation's `PriceSummary`),
`route-block` (checkout's `RouteSummary` → confirmation's `RouteSummary`). No JS fallback —
Firefox ignores the rule and gets today's plain navigation, which is the accepted regression.

## 7. Scope flags added this pass

`hourlyEnabled` and `flightTrackingEnabled` (both default **on**) are the switches for A15 and
A14. Turning either off removes that surface end-to-end (tab + fields, or lookup + card + poll)
without deleting the code, so approval can flip a tweak instead of a rebuild.
