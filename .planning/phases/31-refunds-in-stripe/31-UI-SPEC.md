---
phase: 31
slug: refunds-in-stripe
status: signed
signed: 2026-10-12 19:05 (+04), owner, question form (via the controller)
shadcn_initialized: false
preset: none
created: 2026-10-12
---

# Phase 31 — UI Design Contract (Refunds in Stripe)

> Visual and interaction contract. Source of truth for the decision: `.planning/decisions/2026-10-12-refunds-in-stripe.md`. Locked choices: `31-CONTEXT.md` D-01..D-09. The "after" markup, CSS and copy are in `31-prototype-wip.patch` (not applied to the tree); this spec restates it and fixes the places where the patch is incomplete (see "Deviations from the prototype").
>
> This phase changes four existing surfaces. It adds **no new page, no new component file and no new design token**. Everything composes from the bound Vamos design system.

## Owner answers (signed 2026-10-12 ~19:05 +04)

- Sheets 1, 2 and 3 signed as drawn. Customer wording (cancel sheet line, Refund row, cancellation email line, en/de/fr/ar) signed as written.
- **Q1 = A**: when he refunds in Stripe, the customer gets a Vamos email in their language with the amount Stripe sent back (amount from the Stripe refund event, never computed). Its subject and body are NEW copy, drafted in the plan for his signature; not signed yet.
- **Q2 = A**: "Refund to check" shows until Stripe records a refund or the pickup time has passed. No NO REFUND button.
- The checker's suggestion of a next step for "This booking has no Stripe payment to open." is left out (owner).

## Questions as they were asked

| Q | Question | Recommended (used in the pictures) | Effect on this spec |
|---|----------|------------------------------------|---------------------|
| Q1 | When you refund in Stripe, does the customer get an email from Vamos? A yes (amount Stripe sent back), B Stripe's own receipt, C none | A | No UI in this spec. If A is signed, one new customer email string (en/de/fr/ar) is drafted as an amendment to this file before plan-phase; the old "Refund issued" mail is reused from the webhook. If B or C, nothing is added and the "Refund issued" mail is removed. Option A does not conflict with decision 3: that email states the amount Stripe actually refunded, after the refund has happened, whereas decision 3 forbids an amount in the cancel text before any refund exists. Its copy is drafted at plan time for his signature. |
| Q2 | How long does the dashboard show "Refund to check" after a paid cancel? A until Stripe records a refund or the pickup time has passed, B same plus a NO REFUND button, C no note | A | State table below: note hidden when a refund is recorded or `booking.tripPassed === true`. No button, no new control. If B is signed, a secondary md Button NO REFUND is added under the note (copy to be drafted). If C, the note and its copy are removed. |

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (shadcn not used; the bound Vamos design system is the only source of visual truth) |
| Preset | not applicable |
| Component library | Vamos design system bundle `window.VamosTaxiDesignSystem_245af1` (`design-system/_ds_bundle.js`), tokens `design-system/tokens/*.css`, `laws.css` last |
| Icon library | Vendored Lucide set through the `Icon` component only (new use: `external-link`, already vendored via the Button `iconEnd` prop). No hand-drawn SVG, emoji or arrow character as icon |
| Font | Poppins (UI, body, labels). Qurova is not used on any surface in this phase |

Components used (all existing, none restyled):

| Component | Where | Props |
|-----------|-------|-------|
| `Alert` | Dashboard notes | `tone="info"` for "Refund to check"; `tone="danger"` for "Refund failed" and the no-payment error; `tone="success"` (Refunded) and the dispute Alert are unchanged. `tone="accent"` is forbidden (law 02). `tone="warning"` is not used. |
| `Button` | Dashboard "Which payment?" rows and the Refund failed Alert | `variant="secondary" size="md"` (44 px), `iconEnd="external-link"`, `href`, `target="_blank"`, `rel="noopener noreferrer"`. It is a real link (anchor), not a click handler. |
| `ActionsMenu` item | Booking detail Actions menu (and the console top bar at 390 px) | `{ value:'refund', label:'Refund in Stripe', icon:'external-link' }` |
| Customer pages | `booking-detail.dc.html`, `manage-booking.dc.html` | No component change: text-only edits inside existing `<p>` nodes |

Layout rules (local `[data-*]`, layout only, tokens only, never a class):

- Existing, unchanged and reused: `[data-ops-refund-region]`, `[data-ops-refund-row]`, `[data-ops-refund-label]`, `[data-ops-refund-pay]`, `[data-ops-decide-body]`.
- Retired with the decision box (delete when their last markup goes): `[data-ops-refund-pct]`, `[data-ops-refund-pick]`, `[data-ops-refund-payrow]` (+ its `.vt-check` rules), `[data-ops-refund-full]`, `[data-ops-refund-unit]`.
- New (from the patch, verbatim):
  - `[data-ops-stripe-row]` flex, wrap, `align-items:center`, `justify-content:space-between`, `gap:8px 16px`, `padding:12px 16px`; rows after the first get `border-block-start:1px solid var(--vt-border-subtle)`.
  - `[data-ops-stripe-text]` flex column, `gap:4px`, `min-width:0`, `flex:1 1 180px`.
  - `[data-ops-stripe-k]` `var(--vt-body-md)`, `var(--vt-weight-semibold)`, `var(--vt-text-primary)`.
  - `[data-ops-stripe-v]` `var(--vt-body-sm)`, `var(--vt-text-secondary)`, `unicode-bidi:isolate`.
- Both `OpsDetail.dc.html` rules `--vt-shadow-accent:none` and `.vt-input--focus{box-shadow:none}` stay in place. No glow, no tinted shadow, no yellow anywhere in this phase.

---

## Spacing Scale

Declared values (all from `--vt-space-*`, multiples of 4 except the listed exceptions):

| Token | Value | Usage in this phase |
|-------|-------|---------------------|
| xs | 4px | Gap inside the row's text stack (`[data-ops-stripe-text]`) |
| sm | 8px | Row gap when the button wraps under the text (`[data-ops-stripe-row]` row gap); gap between the label and the list; between list and the new-tab line |
| md | 16px | Row horizontal padding and the column gap between text and button |
| lg | 24px | Not used |
| xl | 32px | Not used |
| 2xl | 48px | Not used |
| 3xl | 64px | Not used |

Exceptions: the new rules (`[data-ops-stripe-*]`) use only the grid above (4, 8, 16) plus `12px` = `--vt-space-3` for the row's vertical padding. The prototype patch and sheet 1 were re-rendered with these values (40/40 frames PASS).

- `12px` row vertical padding = `--vt-space-3`; `12px` region gap and `margin-top:12px` come from the existing `[data-ops-refund-region]`.
- The existing `[data-ops-refund-row]` rule (gap `10px`) is existing code outside this phase's new markup and is untouched. The new list does not use it (it uses `[data-ops-stripe-row]`), so this phase introduces no off-grid value. The Refund failed Alert's single button keeps sitting in the existing `[data-ops-refund-row]`, as shipped.
- Touch targets: Button `md` is 44 px (`--vt-control-h-md`). Row minimum height is therefore 44 + 24 = 68 px. The customer pages add no controls.
- Customer pages keep their existing inline margins (`margin-bottom:20px`, `margin:0 0 12px`). Not touched.

---

## Typography

Sizes in use (4) and weights (2), all existing tokens:

| Role | Size | Weight | Line height | Where |
|------|------|--------|-------------|-------|
| Body | 16px `--vt-body-md` | 400 `--vt-weight-regular` | 1.6 `--vt-body-leading` | Customer cancel line; row title is 16/600 |
| Body small | 14px `--vt-body-sm` | 400 | 1.6 | Row detail (date, CHF), new-tab line (`[data-ops-decide-body]`), Alert body, customer Refund paragraph and account row value |
| Label | 13px `--vt-label-md` | 600 `--vt-label-weight` | 1.6 (inherits) | "Which payment?" label above the list (`[data-ops-refund-label]`, tracking .02em as shipped) |
| Kicker | 11px `--vt-label-sm` | 600 | inherits | Customer "REFUND" uppercase heading, existing (`--vt-label-tracking`, uppercase) |

Component text inherited from the kit and not set by this phase: Alert title and body, Button `md` label (uppercase, OPEN IN STRIPE), ActionsMenu item label. They keep the kit's own size and weight; this spec does not override them.

Why 13 and 14 px both appear: they are the kit's existing label (`--vt-label-md`) and body-small (`--vt-body-sm`) pair, already used together by `[data-ops-refund-label]` and `[data-ops-decide-body]` on this page. This phase adds no new size and changes none.

Weights: regular 400 and semibold 600 only. No heading is added. Body never below 13 px. Button label is uppercase by component (OPEN IN STRIPE); everything else is sentence case.

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--vt-bg-page` / `--vt-bg-surface` (white) | Console page, list surface, customer pages |
| Secondary (30%) | Charcoal `#1E1F1F` (`--vt-charcoal-900`) text and `--vt-text-secondary` (charcoal-600) detail text; grey `#DEDEDE` hairline `--vt-border-subtle` | Row title, detail, list border and row dividers |
| Accent (10%) | Yellow `#FDC20B` at full strength | **Not used by anything new.** The only yellow on these screens is the page's existing primary buttons, untouched |
| Info | `--vt-info` / `--vt-info-tint` via `Alert tone="info"` | "Refund to check" only |
| Destructive | `--vt-danger` via `Alert tone="danger"` | "Refund failed" and "This booking has no Stripe payment to open." only. No destructive action exists in this phase |

Accent: existing primary buttons only, untouched by this phase; no new accent use. No tinted yellow, no `--vt-yellow-50..300` or `-600/-700`, no `Alert tone="accent"`, no `Badge tone="warning"`, no glow on hover/focus/press (colour step and `translateY(1px)` only; focus ring `--vt-ring`, which the Button component provides).

"Refund to check" must read as neutral, not urgent: it replaces the red "Refund due" Alert precisely so the owner is not alarmed when the policy gives no money back.

---

## Surfaces and states

### 1. Dashboard booking detail (`app/ops/OpsDetail.dc.html`)

Visual focal point: the booking header and the Actions button stay the focal point of the page. The "Refund to check" note is secondary information (`Alert tone="info"`), never a primary CTA; nothing in this phase adds a filled or yellow button to the page. OPEN IN STRIPE is a secondary Button and appears only in the list and in the Refund failed Alert.

Order of elements in the column, top to bottom (unchanged slots, content changes): dispute Alert, Refund to check note, Which payment? list, Refunded success Alert, Refund failed Alert (+ button), Refund error Alert.

Removed from the page with the decision box (nothing replaces them): percent/CHF input, unit tabs, payment picker with checkboxes, "full refund" line, CONFIRM REFUND, DECLINE REFUND, decline and reject confirm modals, post-trip "Refund requested" Alert with Accept/Reject, "Refund review" info Alert, class/trip credit box ("Difference to refund" with Confirm). `refundFormShown` is `false` and the markup is deleted, not hidden.

**Actions menu item**

| Property | Value |
|----------|-------|
| Label | Refund in Stripe |
| Icon | `external-link` (was `receipt`) |
| Visible when | signed-in role is admin and `booking.paid` is true (a succeeded payment exists). Not shown to other roles, not on unpaid bookings |
| Disabled | until the Stripe links for this booking have arrived (`stripePays.key === refundKey` is false). Never enabled while a fetch is in flight |
| Position | where REFUND was, above Cancel; Cancel stays last with `tone:'danger'` |

**State table**

| State | Condition | What the page shows |
|-------|-----------|---------------------|
| Default, links loading, or fetch failed | Admin, paid, fetch not back yet, or the request failed (network error, non-ok answer) | Menu item present and **disabled**. Nothing else changes on the page and no message is shown. The next time the detail opens it fetches again |
| One payment | 1 listed payment (see "Which payments are listed") | Menu click calls `window.open(url,'_blank','noopener')` inside the click and returns. No list, no extra UI. The tab opens on that PaymentIntent page |
| Several payments | 2+ listed payments | Menu click sets `stripeListFor`, scrolls to the region (`goRefund`), and shows the "Which payment?" block: label, bordered list (one `[data-ops-stripe-row]` per payment, newest first, from the API), then the new-tab line. Each row: kind label (Trip or Extra fare) in 16/600, detail line `captured date · CHF amount` in 14 secondary, and a secondary md Button OPEN IN STRIPE with `external-link` at the end |
| None | The server answered `ok` with zero payments (every succeeded payment lacking a `pi_` id counts as absent) | Menu click sets the error code `no-stripe-payment`; the existing danger `Alert` (title only) "This booking has no Stripe payment to open." shows in its own `[data-ops-refund-region]` |
| Refund to check | `booking.status === 'cancelled'`, paid, `refund_status` is not `refunded`, no recorded refund, `tripPassed` is not true, and no refund-failed Alert | Neutral `Alert tone="info"`, title "Refund to check", body below. Nothing to press |
| Refund recorded | `refund_status === 'refunded'` or recorded refund above 0 | "Refund to check" disappears. The existing success `Alert` "Refunded" and the refund events in the history stay as they are |
| Refund failed | `refund_status` failed (webhook `refund.failed`) | Danger `Alert` title "Refund failed", body "Stripe could not send the refund. Open the payment in Stripe to try again." One payment: a `[data-ops-refund-row]` with secondary md Button OPEN IN STRIPE (link, new tab). Several payments: no button; the Actions-menu item Refund in Stripe opens the list. "Refund to check" is hidden while this Alert shows |
| Pickup passed | cancelled, paid, no refund, `tripPassed === true` | "Refund to check" is hidden (Q2 A). No other change |
| Dispute | unchanged | Existing danger Alert "Payment disputed" |

**Interaction**

- Which payments are listed: only payments that are not fully refunded (`leftRappen > 0`), newest first. If one remains, REFUND opens it directly; if several remain, the "Which payment?" list shows them. If every payment is already fully refunded, REFUND opens the newest payment so the owner can still look at it (no list, no new string). The API row therefore carries `leftRappen` next to `kind`, `chargedRappen`, `capturedAt`, `url`.
- Links are fetched when the detail opens, admin and paid only: `GET /api/staff/bookings/{id}/stripe-payments` through `VamosOpsApi`, from `syncStripe()` called next to `syncRefund()` on mount and on every update; the tag (`bookingId`) prevents refetching. The response `{ ok:true, data:[{ kind, chargedRappen, leftRappen, capturedAt, url }] }` is stored per booking key; a stale key never renders.
- The tab opens synchronously inside the click (menu item or real link) so no popup blocker triggers. The rows' Buttons are anchors with `target="_blank" rel="noopener noreferrer"`; the menu path uses `window.open(url,'_blank','noopener')`. Never open after an `await`.
- The page never sends a refund and has no refund POST. Nothing on this page is a destructive action, so there is no confirmation dialog.
- Dashboard strings are not translated by an API; the page `T` tables (en/de/fr/ar) hold them and `app/vamos-i18n-dict.js` holds the same strings for the runtime. Both are updated in the same pass; the two copies must be identical.
- The detail text of a row (date, CHF) carries `data-vt-no-i18n` so the runtime leaves it alone.

**Responsive**

| Width | Contract |
|-------|----------|
| 1440 | Console sidebar 236 px + detail column. Alerts full width of the column. List rows: text left, OPEN IN STRIPE right, one line |
| 1024 | Same; the right rail collapses per existing ops rules. Rows stay on one line while the 180 px text basis fits, otherwise the button wraps beneath |
| 768 | Rows wrap (`flex-wrap`): button under the text, full 44 px height, aligned to the inline start. No clipped text |
| 390 | The page's Actions button is folded into the console top bar (`app/vamos-ops-bar.js`, `[data-ops-fold]`); the Refund in Stripe item lives there, disabled until the links arrive, and behaves identically. Rows wrap, text uses `overflow-wrap:anywhere` through `min-width:0`, nothing scrolls sideways. All targets 44 px |

German strings grow about 30 %; "Welche Zahlung?" and "In Stripe öffnen" fit the 180 px text basis and the button wraps rather than truncates.

**RTL (Arabic)**

- `dir="rtl"` is set by the runtime on the document; the rules use only logical properties (`border-block-start`, `justify-content:space-between`; no `left`/`right`). In Arabic the kind label sits at the inline start (right) and the button at the inline end (left); the external-link icon follows the label by `iconEnd` semantics.
- The detail value must read date then CHF amount in both directions. The date and the CHF figure are each isolated (use the page's `isolate()` helper per part, as the existing payment picker does at `pickRow`), inside the `data-vt-no-i18n` span with `unicode-bidi:isolate`. "Stripe" and `CHF 0.00` stay Latin in the Arabic strings.
- The signed picture for Arabic is the visual reference (sheet 1, Arabic frames).

### 2. Customer cancel sheet, paid trip (`booking-detail.dc.html`, `manage-booking.dc.html`)

| State | Before | After |
|-------|--------|-------|
| Cancel more than the free window out (`cancelFull`) | "This trip will be cancelled. You get a full refund; our team sends it." | "This trip will be cancelled. Any refund follows the cancellation policy." |
| Cancel inside the window (`cancelOps`) | "This trip will be cancelled. Our team decides the refund and tells you by email." | the same single line |

- One sentence for both windows, rendered in the existing `<p data-refund>` (16 px, charcoal-800, `max-width:56ch`). The two `sc-if` flags stay so the mocks keep both branches; both carry identical text.
- No amount and never the word Stripe, on any width or language.
- The "Move it instead" fork and the cancellation-policy link paragraph stay exactly as they are.
- Responsive: single paragraph, wraps at 390; Arabic and German need no layout change.

### 3. Customer booking view, cancelled paid trip (same two pages; `app/vamos-manage-ticket.js` `refundLine`)

| State | Before | After |
|-------|--------|-------|
| Cancelled, no refund recorded yet | "Full refund · sent by our team" or "Refund under review" | "Refund follows the cancellation policy" (one value, no branch on `refundOwedRappen`) |
| Refund recorded by Stripe | existing "Refunded" line with the refunded amount | unchanged |
| Dead card (`isCancelled`, never rendered while `isCancelled:false`) | "Refund" with "You will get a full refund of the amount you paid. Our team sends it; ..." and the "Refund · waiting on review" variant | Both variants read heading "Refund" and the paragraph "Any refund follows the cancellation policy and goes back to the payment method you used. Your bank may take a few days to show it." Kept in step so the card is correct if it is ever switched on |

Class and trip difference lines (`vamos-manage-ticket.js:280,284`) are owner-approved (2026-10-01), are not a cancel, and stay untouched.

### 4. Cancellation email (`packages/emails`) — copy only

The refund line of `CancellationEmail` uses the long policy sentence from the dead-card row above, in the recipient's language (en/de/fr/ar below). The two current keys `refundPendingOps` and `refundFullCaptured` collapse into one key (the planner names it, suggested `refundPolicy`) in all four `messages/*.json`. Headline, label "Refund", subject and the "No refund for this window." line (`refundNone`) are not part of the signed decision and are not changed here. No layout change.

### Duplicate charge (decision 2)

Unchanged and invisible here: the automatic refund of a second charge on the same booking (`settle.ts` duplicate branch) and its email to the owner stay exactly as they are. This phase adds no screen and no copy for them.

### Out of scope, no UI

The nightly refund check (D-09) sends an internal English email to info@ and has no screen. `RefundFailedEmail` and `OpsMustFixEmail` change copy only ("refund it in Stripe"); they are internal and stay English.

---

## Copywriting Contract

All strings are final for signing. Swiss German uses "ss", never ß. Arabic keeps `Stripe` and `CHF` in Latin. Sentence case, second person for the customer; the dashboard addresses the owner as "you" (formal Sie in German, vous in French, as the existing tables do).

| Element | Copy |
|---------|------|
| Primary CTA (dashboard) | Refund in Stripe (menu item); OPEN IN STRIPE (Button, uppercase by component) |
| Empty state | not applicable: the menu item is absent without a paid booking and the list only exists with 2+ payments. The no-payment case is the error below |
| Error state | "This booking has no Stripe payment to open." (danger Alert; the next step is implied: refund from the Stripe dashboard directly) |
| Destructive confirmation | none in this phase (no destructive action; the dashboard refund-decision modals are removed) |

### Dashboard (also in the page `T` tables en/de/fr/ar and in `app/vamos-i18n-dict.js` `strings`)

| Key (T) | EN | DE | FR | AR |
|---------|----|----|----|----|
| refundInStripe (menu item) | Refund in Stripe | In Stripe rückerstatten | Rembourser dans Stripe | الاسترداد في Stripe |
| openInStripe (Button) | Open in Stripe | In Stripe öffnen | Ouvrir dans Stripe | فتح في Stripe |
| whichPayment (label, existing key) | Which payment? | Welche Zahlung? | Quel paiement ? | أي دفعة؟ |
| payTrip (row kind, existing) | Trip | Fahrt | Trajet | الرحلة |
| payExtra (row kind, existing) | Extra fare | Aufpreis | Supplément | أجرة إضافية |
| stripeNewTab (line under the list) | Stripe opens in a new tab. This page shows the refund once Stripe records it. | Stripe öffnet sich in einem neuen Tab. Diese Seite zeigt die Rückerstattung, sobald Stripe sie erfasst hat. | Stripe s’ouvre dans un nouvel onglet. Cette page affiche le remboursement dès que Stripe l’enregistre. | يُفتح Stripe في علامة تبويب جديدة. تعرض هذه الصفحة الاسترداد بمجرد أن يسجّله Stripe. |
| checkTitle (info Alert title) | Refund to check | Rückerstattung prüfen | Remboursement à vérifier | استرداد للمراجعة |
| checkBody (info Alert body) | Cancelled with a payment on file. If the cancellation policy gives money back, refund it in Stripe. This page shows it once Stripe records it. | Storniert, die Zahlung ist erfasst. Sehen die Stornierungsbedingungen eine Rückerstattung vor, erstatten Sie sie in Stripe. Diese Seite zeigt sie, sobald Stripe sie erfasst hat. | Annulée avec un paiement enregistré. Si la politique d’annulation prévoit un remboursement, faites-le dans Stripe. Cette page l’affiche dès que Stripe l’enregistre. | أُلغي الحجز وعليه دفعة مسجّلة. إذا كانت سياسة الإلغاء تتيح استردادًا، فنفّذه في Stripe. تعرضه هذه الصفحة بمجرد أن يسجّله Stripe. |
| refundFailedTitle (existing, unchanged) | Refund failed | Rückerstattung fehlgeschlagen | Échec du remboursement | فشل الاسترداد |
| failedStripeBody (danger Alert body) | Stripe could not send the refund. Open the payment in Stripe to try again. | Stripe konnte die Rückerstattung nicht senden. Öffnen Sie die Zahlung in Stripe, um es erneut zu versuchen. | Stripe n’a pas pu envoyer le remboursement. Ouvrez le paiement dans Stripe pour réessayer. | تعذّر على Stripe إرسال الاسترداد. افتح الدفعة في Stripe لإعادة المحاولة. |
| noStripePayment (error Alert title) | This booking has no Stripe payment to open. | Diese Buchung hat keine Stripe-Zahlung zum Öffnen. | Cette réservation n’a aucun paiement Stripe à ouvrir. | لا توجد لهذا الحجز دفعة في Stripe لفتحها. |
| classNoteCheaper (note under Edit class) | The class changes when you confirm. Refund the difference in Stripe afterwards. | Die Klasse ändert sich, wenn Sie bestätigen. Erstatten Sie die Differenz danach in Stripe. | La classe change dès votre confirmation. Remboursez ensuite la différence dans Stripe. | تتغيّر الفئة عند تأكيدك. استرد الفرق بعد ذلك في Stripe. |
| tripNoteCheaper (note under Edit trip) | The trip changes when you confirm. Refund the difference in Stripe afterwards. | Die Fahrt ändert sich, wenn Sie bestätigen. Erstatten Sie die Differenz danach in Stripe. | Le trajet change dès votre confirmation. Remboursez ensuite la différence dans Stripe. | تتغيّر الرحلة عند تأكيدك. استرد الفرق بعد ذلك في Stripe. |
| classDoneRefund (confirmation after the change; `{a}` = CHF amount; dict pattern) | Class changed. Difference to refund: {a}. Refund it in Stripe. | Klasse geändert. Zu erstattende Differenz: {a}. Erstatten Sie sie in Stripe. | Classe modifiée. Différence à rembourser : {a}. Remboursez-la dans Stripe. | تم تغيير الفئة. الفرق المطلوب استرداده: {a}. نفّذ الاسترداد في Stripe. |
| tripDoneRefund (same, trip; dict pattern) | Trip changed. Difference to refund: {a}. Refund it in Stripe. | Fahrt geändert. Zu erstattende Differenz: {a}. Erstatten Sie sie in Stripe. | Trajet modifié. Différence à rembourser : {a}. Remboursez-la dans Stripe. | تم تغيير الرحلة. الفرق المطلوب استرداده: {a}. نفّذ الاسترداد في Stripe. |

Placement of the four class/trip rows: `classNoteCheaper` and `tripNoteCheaper` replace the note in the existing class-change and trip-change confirm dialogs ("The class changes when you confirm ..."). `classDoneRefund` and `tripDoneRefund` replace the existing toast shown after a cheaper class or trip change is confirmed. The dashboard still shows the difference amount (the owner's own screen). The customer's owner-approved difference lines (`app/vamos-manage-ticket.js` `CHANGE_CREDIT_LINE`, `TRIP_CREDIT_LINE`, decisions 2026-10-01) stay unchanged.

Dictionary shape: all rows above except the last two are `strings` entries keyed by the English text; the last two are the two `patterns` regex entries tagged "Phase 31" (`{a}` becomes `(.+)` / `$1`). Copy in the page `T` tables must match the dictionary text character for character.

T keys that lose their last use and are deleted in the same pass (no dead copy left behind): `confirmRefund`, `declineRefund`, `declineConfirmTitle`, `declineConfirmBody`, `keepReviewing`, `requestedTitle`, `requestedBody`, `acceptRefund`, `rejectRefund`, `rejectConfirmTitle`, `rejectConfirmBody`, `refundFailedBody` (old), `tryAgain`, `refundTitle`, `refundBody`, `dueLegacyBody`, `classCreditBody`, `tripCreditBody`, `classCreditLine`, `refundFullLine` and the picker/percent/unit strings. The planner confirms each by grep before deleting.

### Customer (also in `app/vamos-i18n-dict.js`; `apps/web/i18n/messages/*.json` for the Next side)

| Where | EN | DE | FR | AR |
|-------|----|----|----|----|
| Cancel sheet line (both windows) | This trip will be cancelled. Any refund follows the cancellation policy. | Diese Fahrt wird storniert. Eine allfällige Rückerstattung richtet sich nach den Stornierungsbedingungen. | Ce trajet sera annulé. Tout remboursement suit la politique d’annulation. | ستُلغى هذه الرحلة. يخضع أي استرداد لسياسة الإلغاء. |
| Account Refund row value (`refundLine`) | Refund follows the cancellation policy | Rückerstattung gemäss Stornierungsbedingungen | Remboursement selon la politique d’annulation | الاسترداد وفق سياسة الإلغاء |
| Dead card paragraph | Any refund follows the cancellation policy and goes back to the payment method you used. Your bank may take a few days to show it. | Eine allfällige Rückerstattung richtet sich nach den Stornierungsbedingungen und geht an das Zahlungsmittel zurück, mit dem Sie bezahlt haben. Ihre Bank braucht vielleicht ein paar Tage, bis sie sichtbar ist. | Tout remboursement suit la politique d’annulation et revient sur le moyen de paiement utilisé. Votre banque peut mettre quelques jours à l’afficher. | يخضع أي استرداد لسياسة الإلغاء ويعود إلى وسيلة الدفع التي استخدمتها. قد يحتاج مصرفك بضعة أيام لإظهاره. |
| Cancellation email refund line (`messages/en|de|fr|ar.json`) | identical to the dead-card paragraph in each language | | | |

Words that must not appear on any customer surface or email in this phase: "Stripe" in the cancel line, the account row and the email; any CHF amount in the cancel line; "our team decides", "our team sends".

Wording notes for the owner's signature: DE uses "gemäss" and "allfällige" (Swiss usage); FR uses "politique d’annulation" as on the existing cancellation page; the AR line mirrors the DE and FR meaning (a refund depends on the policy; no promise).

Law checks on copy: no emoji, no invented price (amounts in pictures are CHF 0.00), no "Stripe" outside the dashboard, no UPPERCASE sentence (only the Button label via component).

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none (shadcn not initialised) | not applicable |
| Third-party | none | not applicable; no registry is declared, so no vetting gate runs |

---

## Deviations from the prototype (the executor must apply these; the pictures are not affected)

1. **Disabled until links arrive.** The patch's menu item has no `disabled`. Set `disabled: true` while the Stripe links for this booking are not back, as stated in the Actions-menu table. A failed fetch does not store a result, so the item stays disabled until the detail is opened again and the fetch succeeds; "This booking has no Stripe payment to open." is shown only when the server answered with zero payments. No new string.
2. **Unreachable code.** In the patch's menu handler the old `goRefund()` / `markRefund()` / post-trip lines sit after an unconditional `return;`. Delete them with `markRefund`, `postRefund`, `postDecision`, `retryRefund`, `refundBusy` and the decision-box helpers.
3. **Several payments + failed refund.** The patch shows OPEN IN STRIPE only when exactly one URL exists. Keep that; with several payments the owner uses the Actions-menu item, which opens the "Which payment?" list. No new element.
4. **Bidi.** Isolate the date and the CHF figure separately (per part) in the row detail, then confirm against the Arabic frame of sheet 1.
5. **`showRefundDue` reads fields that already exist** (`booking.status`, `booking.paid`, `refundStatus`, `refundedBk`, `booking.tripPassed`); no new column and no migration.
6. **Language coverage.** `VamosLocale.coverage(root)` must return an empty list for de, fr and ar on every new element (the harness already asserts it for the sheets). Run it again on the real shell after porting.

---

## Signing

The owner signs the pictures and the copy before any code. Offline renders from the real shells, bare crops on a plain white ground, no frames, demo amounts CHF 0.00 (law 04). Each sheet shows 1440 en, 1440 ar, 390 en, 390 ar. Harness: `.planning/phases/31-refunds-in-stripe/tools/render.mjs`, 40/40 frames PASS with DOM assertions.

| Sheet | File | What it shows |
|-------|------|---------------|
| 1 | `.planning/phases/31-refunds-in-stripe/screens/sheet-1-dashboard-refund.png` (1840 x 2982) | Before: decision box. After: neutral "Refund to check" note. Actions menu before and after. Two-payment "Which payment?" list |
| 2 | `.planning/phases/31-refunds-in-stripe/screens/sheet-2-customer-cancel.png` (1840 x 3357) | Customer cancel sheet: before (early window), before (late window), after (one policy line) |
| 3 | `.planning/phases/31-refunds-in-stripe/screens/sheet-3-customer-account.png` (1840 x 1968) | Customer account Refund row, before and after |

Owner signs: (a) the three sheets, (b) every string in the Copywriting Contract in en, de, fr and ar (the customer lines first: they are the legal-adjacent ones, and he wants drafts to approve), (c) Q1 and Q2. Signed 2026-10-12 ~19:05 (+04) in the question form: (a) the three sheets as drawn, (b) the customer strings as written, (c) Q1 = A, Q2 = A. The Q1 refund email copy is signed separately at plan time.

Verification after build (not part of signing): Chromium run against the local Worker for the single-payment tab open, the several-payment list, the none error, "Refund to check" shown and hidden (refund recorded, pickup passed), and a check at 1440, 1024, 768 and 390 in en and ar, with no sideways scroll at 390.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: FLAG (no next step on "no Stripe payment": left out by the owner)
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: FLAG (existing `[data-ops-refund-row]` gap 10px, untouched; one child, gap never renders)
- [x] Dimension 6 Registry Safety: PASS

**Approval:** gsd-ui-checker VERIFIED 2026-10-12 (revision 1); owner signed 2026-10-12 ~19:05 (+04)
