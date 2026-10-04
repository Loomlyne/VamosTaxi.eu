# Owner decision: hide internal ids — legal copy and plain cookie names (2026-10-04)

Given through the question form (relayed by the Vamos controller), 2026-10-04. No lawyer has read it.

## 1. COPY-DRAFT sections 1–4 — approved

His answer, verbatim option: **"Approve as drafted"** (all four sections, as written).
The approved text is `.planning/quick/261004-hide-internal-ids/COPY-DRAFT.md` sections 1–4, in en/de/fr/ar,
applied in commit `d8f25617` on branch `fix/hide-internal-ids`. Use it verbatim.

Note kept from the draft: `cf_clearance` "30 minutes" is Cloudflare's default Challenge Passage; the live zone
setting was not read. If the zone uses another value, the row and the zone must be made to agree.

## 2. Stripe row stays; plain names everywhere — approved

His answers: the Stripe row stays. **"Plain names everywhere"**: every row on /cookies shows a plain name first
and the technical cookie name small underneath (left to right, never translated).

Approved English plain names (his words):

| Plain name | Technical name |
|---|---|
| Sign-in | sb-…-auth-token |
| Your cookie choice | consent_subject · vamosCookieConsent |
| Booking access | vt_manage |
| Language | NEXT_LOCALE |
| Fair pricing | vamos_qs |
| Cloudflare check | cf_clearance |
| Stripe payment | __stripe_mid · __stripe_sid |

Still a **draft awaiting his approval**: the de/fr/ar of these names and the two Functional names
("Language (this browser)" for vamosLang, "Recent addresses" for vamos:recent-places) — COPY-DRAFT.md §5.

The Meta marketing row keeps his verbatim text (2026-09-30-meta-wording.md); it gets no plain-name cell.

## 3. Sign-in cookie rename — its own job

Not done in this job. A separate job renames the Supabase auth cookie (cost: everyone signed out once).
