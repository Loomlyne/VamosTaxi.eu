# Privacy policy — `privacy.dc.html`

**Shell:** `SPEC-legal-shell.md` · **Sections:** 10 · **Status:** built 4 Aug 2026, wording pending

## 1. Structure

```
01 Who is responsible     06 How long we keep it
02 What we collect        07 Your rights
03 Why we may use it      08 Cookies & consent
04 Who processes it       09 Making a request
05 Transfers abroad       10 Changes to this policy
```

## 2. The retention / deletion problem

The brief's hardest requirement: Swiss archiving law makes us hold trip records for
`{ARCHIVING_YEARS}` years, which flatly contradicts a naive “delete anytime” promise. Sections 06
and 07 are designed as one spread rather than two distant clauses:

- **06** is a definition list — five retention rows, each with its own reason.
- **07** opens with “Two things are true at once”, then a **paired block**: a white card *You can
  ask us to* beside a charcoal card *We have to keep*. Same width, same rhythm, one grid row —
  neither reads as the small print of the other. Below them, one paragraph states the operating
  rule: what we can delete we delete, what we cannot we name, with the rule and the expiry.
- The charcoal card is the design system's `tone="inverse"` surface. It carries the constraint,
  which is exactly the job charcoal does elsewhere in the system (voucher, summary, trust block).

## 3. The processor table holds both stacks

`04` has two groups: **the platform we are building** (Stripe, Supabase, Vercel, Mapbox, Resend,
Sentry, the analytics token, partner carriers) and **declared on the previous site — confirm or
drop** (PayPal, Twint AG, Google Analytics, AWStats). The second group is scaffold: it disappears
with `showReviewScaffold`. Rows that survive launch need a purpose and a region; rows that do not
get deleted rather than hedged.

## 4. Decision flags — 3

| Section | Conflict |
|---|---|
| 01 | Archived privacy names Badenerstrasse 582, 8048 Zürich as controller; imprint and terms say Bleicherstrasse 16, Dietikon. The register entry wins |
| 04 | Two payment stacks and three candidate analytics tools |
| 09 | Three contact addresses in circulation, one of them a personal gmail. All five pages use `info@vamostaxi.eu` — change once, changes everywhere |

Two archived clauses **cannot** be carried over and are named in the scaffold: Privacy Shield as a
transfer basis (invalid since 2020) and a paragraph about passing addresses to a delivery company
“for delivering the goods”. Neither has a slot, because neither belongs on the page.

## 5. Slots — 2 · Tokens — 15

Slots: statutory references per lawful basis (03) · transfer mechanism per destination (05).

Tokens: effective date · version · DPO or not required · EU representative · Supabase, Vercel,
Resend, Sentry and analytics regions · analytics provider · archiving years · finance retention ·
log retention · consent-log retention · data-request response days.

## 6. Notes

- Applies-to stamp reads **revFADP · GDPR**. The archived policy named GDPR only, which is wrong
  for a Swiss controller since September 2023.
- 02 is grouped by moment — getting a price, booking, paying, browsing, contacting — not by data
  type. It is the order in which a customer meets each field.
- 08 carries a `vamos:cookie-prefs` trigger inline, so consent is changeable from the sentence
  that mentions it.
