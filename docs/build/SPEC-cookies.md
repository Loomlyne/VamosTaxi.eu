# Cookie policy — `cookies.dc.html`

**Shell:** `SPEC-legal-shell.md` · **Component:** `CookieBanner.dc.html` · **Sections:** 8
**Status:** built 4 Aug 2026 · consent model **opt-in by category** (client answer, 4 Aug)

## 1. Structure

```
01 What we mean by cookies   05 Analytics
02 Your current choice       06 Marketing
03 Strictly necessary        07 Changing your mind
04 Functional                08 The previous site  (scaffold only)
```

## 2. Live state, not an illustration

`02` reads `localStorage.vamosCookieConsent` and re-reads it every 700ms, so the page and the
banner can never disagree while both are open. It shows four `Badge`s — necessary always
`tone="inverse"`, the other three `success` when on and `neutral` when off — the saved date, and
two buttons: **Change preferences** (dispatches `vamos:cookie-prefs`) and **Reset my choice**
(clears the record and reloads, which is also how a reviewer sees the first-visit banner again).

## 3. Category tables

Four columns — name, purpose, provider, duration — one table per category, each with a
`<caption>` that repeats whether the category can be switched off.

Under 720px each row becomes a card: `thead` hides, `tr` gets the card chrome, and every `td`
becomes a two-column grid whose `::before` prints `data-l` as an 11px uppercase label. No
horizontal scroll, no truncation, no duplicated markup. Print forces the table form back.

Only cookie names that are genuinely knowable today are printed: `__stripe_mid` and
`__stripe_sid`. Everything else is a token — inventing `vt_session` would be inventing a fact
about a platform that is not instrumented yet.

## 4. Consent mechanism

Opt-in. `necessary` is true and locked; `functional`, `analytics` and `marketing` default false
and are only written by an explicit action. Three exits from the banner: **Accept all**,
**Necessary only**, **Manage preferences**. There is no styling asymmetry between accept and
reject — same size, same height, one is `primary` and one is `ghost` because the system allows one
primary per view, not because reject is discouraged.

Marketing ships as a category with nothing in it, deliberately: a category added later looks like
a category that was hidden.

## 5. Decision flags — 3 · Tokens — 21

| Section | Conflict |
|---|---|
| 05 | Vercel Analytics vs PostHog vs the legacy Google Analytics. One row, one tool |
| 05 | **Sentry: analytics or strictly necessary?** It sits in analytics today, so declining analytics also turns off crash reporting. Service integrity argues for necessary; a third party receiving session data argues against. Changes the banner too |
| 08 | The archived site declares GA and third-party advertising cookies with **no banner, no opt-in and no consent record** — “change your browser settings”. This page and the banner close that gap; the section itself is scaffold and comes off before launch |

Open engineering question for the client: is consent logged server-side as well as in the
browser? Affects the `{CONSENT_LOG_RETENTION}` row in the privacy policy.

## 6. Banner geometry

| Width | Banner |
|---|---|
| < 640px | fixed sheet, 16px inset, 24px radius, `--vt-shadow-lg`; body padded 272px so it covers nothing |
| ≥ 640px | 452px card, 32px from the bottom-left corner — clear of the booking widget and of the primary CTA |
| Dialog | `min(680px, 100vw − 32px)`, max height `min(86vh,760px)`, bottom-anchored on mobile, centred on desktop, category list scrolls, footer pinned |

Entrance 320ms `cubic-bezier(.16,1,.3,1)`, veil 200ms fade, both off under reduced motion.
