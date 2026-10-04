# COPY DRAFT — sections 1–4 APPROVED, section 5 partly awaiting approval (2026-10-04)

Status: **sections 1–4 approved by Koss, 2026-10-04, "Approve as drafted"** (question form, relayed by the
controller; recorded in `.planning/decisions/2026-10-04-hide-internal-ids-copy.md`). Applied in `d8f25617`.
Section 5: the English plain names in 5a are his; the de/fr/ar and the two Functional names in 5b are
**drafts awaiting his approval**. No lawyer has read any of it. The owner's Meta texts are not touched.

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

## 5. /cookies — plain names (owner 2026-10-04: "Plain names everywhere")

Every row: plain name first, technical name small underneath in the mono face, left to right, never translated.
Same in the React twin (`app/[locale]/cookies/page.tsx`, messages `cookies.name-*`). The banner's
"Manage preferences" panel lists providers, not cookie names, so it is unchanged. The Meta row is unchanged.

### 5a. English names — owner's words; de/fr/ar — draft, awaiting approval

| Technical name | en (owner) | de (draft) | fr (draft) | ar (draft) |
|---|---|---|---|---|
| sb-…-auth-token | Sign-in | Anmeldung | Connexion au compte | جلسة تسجيل الدخول |
| consent_subject · vamosCookieConsent | Your cookie choice | Ihre Cookie-Wahl | Votre choix de cookies | اختيارك لملفات تعريف الارتباط |
| vt_manage | Booking access | Zugang zur Buchung | Accès à la réservation | الوصول إلى الحجز |
| NEXT_LOCALE | Language | Sprache | Langue | اللغة |
| vamos_qs | Fair pricing | Faire Preise | Tarifs équitables | تسعير عادل |
| cf_clearance | Cloudflare check | Cloudflare-Prüfung | Vérification Cloudflare | تحقق Cloudflare |
| __stripe_mid · __stripe_sid | Stripe payment | Stripe-Zahlung | Paiement Stripe | دفع Stripe |

"Language" reuses the site's existing approved translation (Sprache / Langue / اللغة). "Sign-in" is not
"Connexion" / "تسجيل الدخول" in fr/ar because those already translate the "Sign in" button; the runtime needs
each translation to be unique, so the draft says "Connexion au compte" / "جلسة تسجيل الدخول".

### 5b. Functional rows — whole name is a draft, awaiting approval

| Technical name | en (draft) | de | fr | ar |
|---|---|---|---|---|
| vamosLang | Language (this browser) | Sprache (dieser Browser) | Langue (ce navigateur) | اللغة (هذا المتصفح) |
| vamos:recent-places | Recent addresses | Letzte Adressen | Adresses récentes | العناوين الأخيرة |

## How to approve

Sections 1–4: done (approved). Section 5: two questions in the question form — (a) "Use these German, French
and Arabic names for the cookie rows on vamostaxi.site/cookies? Example: Booking access = Zugang zur Buchung."
(b) "Name the two Functional rows 'Language (this browser)' and 'Recent addresses'?" Record the answers in
`.planning/decisions/2026-10-04-hide-internal-ids-copy.md`.
