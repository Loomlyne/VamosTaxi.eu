# COPY DRAFT — awaiting owner approval (2026-10-04)

Status: **DRAFT, applied on branch `fix/hide-internal-ids`, NOT approved.** The controller must not
ship the commit "copy(legal): …" before Koss approves this text through the question form. No lawyer
has read it. The owner's Meta texts (`.planning/decisions/2026-09-30-meta-wording.md`) are not touched.

Why: owner 2026-10-04, "hide all tokens hide all ids … everything is expose". These lines told a
visitor about test mode, vendors we do not use, or engineering plumbing.

## 1. /cookies — Strictly necessary

| Row | Was | Draft en | de | fr | ar |
|---|---|---|---|---|---|
| `sb-…-auth-token` Duration | session / refresh as issued by Supabase Auth | Up to 400 days, or until you sign out | Bis zu 400 Tage oder bis Sie sich abmelden | Jusqu’à 400 jours, ou jusqu’à votre déconnexion | حتى 400 يوم، أو حتى تسجيل خروجك |
| `__stripe_mid · __stripe_sid` Duration | not in use until live payments | 1 year · 30 minutes | 1 Jahr · 30 Minuten | 1 an · 30 minutes | سنة واحدة · 30 دقيقة |
| `cf_clearance` Duration | as set by Cloudflare | 30 minutes | 30 Minuten | 30 minutes | 30 دقيقة |

Facts behind the drafts (check before approving):
- 400 days: `@supabase/ssr` 0.12.5 sets the auth cookie's Max-Age to 400 days (`DEFAULT_COOKIE_OPTIONS`); our `authCookieOptions` sets no other lifetime. Sign-out clears it.
- Stripe: Stripe documents `__stripe_mid` = 1 year, `__stripe_sid` = 30 minutes. Our CSP does not load `js.stripe.com`, so these are set on Stripe's own payment page, not on vamostaxi.site. Owner may prefer to keep the row (it is Stripe's page in the booking flow) or drop it.
- `cf_clearance`: 30 minutes is Cloudflare's default "Challenge Passage". **Not verified** against the zone setting (no Cloudflare dashboard access here). Owner: Cloudflare dashboard → Security → Settings → Challenge Passage; if it is not 30 minutes, the draft must say that value.

## 2. /cookies — Analytics

| Item | Was | Draft en | de | fr | ar |
|---|---|---|---|---|---|
| Lead sentence | Which step of a booking people give up on, and which errors are breaking. Aggregated, and never used to make a decision about you. | Which step of a booking people give up on. Aggregated, and never used to make a decision about you. | Bei welchem Buchungsschritt Menschen abbrechen. Aggregiert, und nie Grundlage einer Entscheidung über Sie. | À quelle étape d’une réservation les gens abandonnent. Agrégé, et jamais utilisé pour prendre une décision vous concernant. | أي خطوة من الحجز يتركها الناس. مجمّعة، ولا تُستخدم أبدًا لاتخاذ قرار بشأنك. |
| Cloudflare row Name | none | No cookie | Kein Cookie | Aucun cookie | لا يوجد ملف تعريف ارتباط |
| Cloudflare row Duration | not used | Nothing is stored in your browser | In Ihrem Browser wird nichts gespeichert | Rien n’est enregistré dans votre navigateur | لا يُخزَّن شيء في متصفحك |
| Sentry row | none · Links an error report… · Sentry · not used | **removed** (Sentry is not in the product: no code, no script) | — | — | — |

## 3. Cookie banner, "Manage preferences" panel (both copies)

| Item | Was | Draft en | de | fr | ar |
|---|---|---|---|---|---|
| Necessary, duration | session / refresh as issued by Supabase Auth | Up to 400 days | Bis zu 400 Tage | Jusqu’à 400 jours | حتى 400 يوم |
| Analytics, text | Tells us which step of a booking people abandon, and reports errors so we can fix them. | Tells us which step of a booking people abandon. | Zeigt uns, bei welchem Schritt eine Buchung abgebrochen wird. | Nous indique à quelle étape une réservation est abandonnée. | يُخبرنا في أي خطوة من الحجز يتوقف الناس. |
| Analytics, provider | Cloudflare Web Analytics (cookieless) · Sentry | Cloudflare Web Analytics (cookieless) (existing approved string) | (existing) | (existing) | (existing) |
| Analytics, duration | not used | No cookie | Kein Cookie | Aucun cookie | لا يوجد ملف تعريف ارتباط |

## 4. /privacy — "Who processes it"

| Item | Was | Draft en | de | fr | ar |
|---|---|---|---|---|---|
| Sub-heading | The platform we are building | Our suppliers | Unsere Dienstleister | Nos prestataires | مزوّدونا |
| Resend line | Confirmation and driver-detail emails · used when transactional mail is on | Confirmation and driver-detail emails | Bestätigungs- und Fahrerdaten-E-Mails | E-mails de confirmation et coordonnées du chauffeur | رسائل التأكيد وبيانات السائق |
| Sentry line | Sentry · Error diagnostics · not in use | **removed** | — | — | — |

## Not changed (owner's own words, kept verbatim)

- The Meta row on /cookies and the Meta line on /privacy: only their rendering on phones was fixed.
- `vt_manage`, `NEXT_LOCALE`, `vamos_qs`, consent rows: owner-approved 2026-10-03, unchanged.

## How to approve

One question per section above, in the question form: "Use this wording on vamostaxi.site/cookies (section 1)? Example: Duration of the sign-in cookie becomes 'Up to 400 days, or until you sign out'." On approval, copy this file to `.planning/decisions/2026-10-04-hide-internal-copy.md` with his answer, then ship.
