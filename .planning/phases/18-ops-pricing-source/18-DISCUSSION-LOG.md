# Phase 18: OPS Pricing source of truth - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-13
**Phase:** 18-ops-pricing-source
**Areas discussed:** go-live / Publish, unpaid quotes after Publish, this page’s own total, new extras, test unpaid from preview, coupons tab, history, meet & greet / free wait, this work vs first Publish, km bands, fixed-route match, discard draft, fractional km, night across midnight, region % zone, /pricing admin-only, weekend/holiday pickup, lock hours, service area, waiting clock, waiting money, outside service area, coupon code, layout, extra wait pay, UI-SPEC timing, phone, Arabic RTL

---

## When a number goes live

| Topic | Selected |
|--------|----------|
| VAT | Wait for Publish |
| Route Live | Draft until Publish |
| Deletes | Draft until Publish |
| Ops totals before Publish | Same as public (000 / published). Preview on this page is the exception |
| After Publish | Immediate on next quote / checkout / Stripe / ops / new mail |
| Partial Publish | All-or-nothing; exact error |
| Mail of a paid trip | Snapshot at pay |
| 20 km floor / night hours | Fields on this page (floor later **removed** from recipe) |
| Coupons | Move onto this page as a tab under Surcharges |
| Gaps | Block Publish; list exact gaps |
| Weekend / holidays | Fields on this page |
| Currency on this page | CHF only |
| Placeholder banner | Drop it |
| After Publish, next edit | New draft cloned from live |
| Unpublish | No |
| Publish click | Confirm change list + errors, then confirm |
| Fixed vs km | Fixed wins |
| From/To | Mapbox |
| Empty class on a route | Not offered |
| Quote lock | Field, hours |
| Overlay Save | Writes draft immediately |
| Two admins | Last successful Publish wins |
| Region zone | Mapbox; pin inside zone |
| Timezone | Europe/Zurich product law |
| Min vs floor | Start + km; no extra min. First-X-km field **removed** |
| Recipe | Start + (all km × per-km) + bands on top |
| Per-km kilometres | All km |
| Base | Every trip in that class |
| Bands vs per-km | On top |
| New class required | name, start, per-km, max pax |
| History restore | List of past books; re-Publish |
| Holidays | Admin adds dates |
| Weekend days | Fields, default Sat–Sun |
| Discard | Confirm; public stays last published |
| Classes | Add/remove many; hide from public; ops keep |
| Region overlap | Warn, still Publish, highest % |
| Max pax over | Class not offered public |
| Service area | Mapbox; pickup **and** dropoff inside |
| Night window | Start and end fields; may cross midnight |
| Waiting unit | Admin configures (minute / hour / day / anything) |

**Notes:** Owner wants everything configured here; everywhere else takes the call from here. Exact error must name what is not configured.

---

## Unpaid quotes after Publish

| Topic | Selected |
|--------|----------|
| Locked checkout | Keep until expiry |
| Unpaid / pay-link / Stripe session | Keep 24h (lock hours), then auto-cancel whole unpaid trip |
| Home cards no Select | Refuse; quote again |
| Pay before expiry | Old snapshot |
| Webhook after expiry | Do not capture |
| Price-changed mail | Per Publish; old amount only; continue-pay to unpaid page; skip if already paid |
| Expired mail | Second mail; button to home booking box; account shows cancelled + mail |
| Guests | Same two mails |
| Mail copy | Owner supplies English; translate de/fr/ar; do not invent |
| Mail currency | CHF |
| Recipients | Booking contact only |
| Language | Booking locale |
| Ops | Old amount until expiry; cannot override CHF |
| Manual phone booking | Last published book |
| Stripe methods | Any, locked amount until expiry |

---

## This page’s own total / UI

| Topic | Selected |
|--------|----------|
| Preview | Yes; draft book; Mapbox From/To, when, class, pax, extras, coupon |
| Preview location | Sticky rail under VAT / Publish |
| Tabs | Routes · Distance · Surcharges · Coupons · History |
| Publish confirm | Dialog on this page |
| Empty class in preview | CHF 000, not selectable |
| Draft totals | This page only |
| Rules | Table below add-surcharge; surcharge picks a rule |
| Mapbox | Every place field |
| VAT | Sticky rail |
| Layout | New from scratch, same Vamos tokens |
| Breakpoints | Desktop, tablet, mobile — serious |
| UI-SPEC | In this phase, after context |
| Discard | Header next to Publish |
| Preview test unpaid | Yes (see test unpaid) |
| Home/checkout redesign | **Deferred** — numbers only this phase |
| Arabic | RTL (discretion) |
| Phone | Rail scrolls, tables swipe |

---

## New extras

| Topic | Selected |
|--------|----------|
| New surcharge | Appears on checkout after Publish |
| Apply mode | Automatic or extra chip |
| Delete + Publish | Extra gone from checkout |
| Extra stop | Mapbox place; live re-km; not fixed amount; max field |
| Child / oversized / pet | Amount × qty, live recap |
| Ski with amount | Paid extra |
| Meet & greet / free wait | Two cards, both auto-on, each can turn off |
| Free wait | Airport pickup; field on this page |
| Extra wait at pay | CHF 0; later after ops arrival; owner wants off-session auto debit without confirmation (plan gate) |
| Automatic rules | Never chips; pickup time in Zurich window |

---

## Test unpaid from preview

Admin only. No Stripe. No mails. Typed email. Ops board marked test. Dispatch may assign; not a paid customer trip. Public Needs payment but Pay off. Uses draft. Auto-cancel on lock expiry.

---

## Coupons tab

Old `#coupons` gone. Percent or fixed CHF, dates/cap. All classes. One per booking. Coupon **before** VAT. Wait for Publish. Preview can test code. Case-insensitive, trim. Unpaid lock keeps coupon. Floor CHF 0.00.

---

## vs Phase 11

First public CHF = owner Publish **now**. This work does not block it. New phase after 11. Current page stays fare book until editor ships. `.eu` forgotten. VAT-wait-for-Publish is this phase, not 11.

---

## Claude's Discretion

Open last band; band From inclusive; region overlap highest %; meet back on restores free wait; Arabic RTL; class editor on Distance pane; extra wait clock = ops arrival; extra wait SCA/off-session = plan gate.

---

## Deferred Ideas

- Redesign home / checkout / confirmation layout
- Live Stripe keys
- `vamostaxi.eu`
- Search Console / JSON-LD
- Restore drill on live Zurich
- Invented mail copy

---

# Restart 2026-09-14 (full re-discuss)

> Audit trail only. Decisions are in 18-CONTEXT.md (D-01…D-35). This supersedes the short restart block written earlier the same day.

**Date:** 2026-09-14
**Areas discussed:** draft/Publish, live vs draft page, gaps, History removed, staff access, classes, hide/delete, extras, unpaid, money recipe, bands, fixed routes, cantons, Mapbox, surcharges tab rebuild, wait, VAT, coupon, recap, photos/R2, service area

## Draft / Publish

Save creates draft; typing is not a draft; leave without Save = gone; Publish is the only public flip; after Publish the page shows the live book; one whole-book draft; Draft mark; Discard confirm; Publish confirm with change list; exact conflict + jump-to-fix; failed Publish keeps draft; all-or-nothing; required class fields block Publish; no Preview; no History; VAT waits for Publish; quote lock fixed 24h.

## Public classes / extras / unpaid

Delete + Publish = gone; hide-from-public yes; new class any name after Publish; over max pax not offered; extra gone from checkout; stale Select refused; unpaid keep locked amount 24h then cancel; live UAT is done.

## Money

Start + all-km × per-km + bands on top. Owner: 100 + 14.6×12 = 275.20; 12.3×10 = 123. Cents kept. No region. Band overlap blocks Publish. Open last band ok. Fixed route (place or canton→canton) dominates if it matches; else km. Extra stop re-runs km recipe; max 1 stop. Extras × qty before VAT. Meet included CHF 0. Extra wait not in pay-now. Coupon before VAT. Same math everywhere after Publish. Display FX, charge CHF.

## Surcharges tab

Rebuild: one list, type + config dialog only. No night/weekend/holiday. Checkout extras (incl. ski) are a type. Owner pinned live /pricing: rules table is source; dialog nothing extra.

## Mapbox / cantons

Cantons are fixed-route rows, not a quote fence. Mapbox like Google Maps, show everything. No quote only if From/To cannot be resolved.

## Classes / photos

Add/edit/delete any class. Photo required; upload/edit/delete; R2 not local. Required: photo, name, start, per-km, max pax, max bags.

## Claude's Discretion

Mapbox canton read; band UI; Draft mark tokens; jump-to-gap; i18n; dual DC; first wave = public reads live book; no silent extra-wait debit.

## Deferred

Home/checkout layout redesign; live Stripe; `.eu`; invented mail copy; return trips.

