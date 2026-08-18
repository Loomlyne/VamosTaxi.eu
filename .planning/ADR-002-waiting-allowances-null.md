# ADR-002 — Seeding waiting allowances NULL, not 60/15

**Status:** Accepted, 2026-08-19
**Phase:** 2 (the schema seed)

## Context

`app/vamos-ops-data.js:326` seeds `airportWait: '60'` and `:327` seeds `cityWait: '15'` in
the mock `SETTINGS` singleton. `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` §C marks
`{AIRPORT_WAITING}` a marketing claim that was never confirmed, and `{STANDARD_WAITING}` an
archive figure (30 min, not even the mock's 15) — neither is a number anyone has signed off.
`docs/build/OWNER-ANSWERS.md` leaves both blank. The proposed `settings` table backing the
ops Pricing screen has these two fields nullable; when a value is NULL the `data-tok` markup
renders its TBC pill (Law 04, `design-system/tokens/laws.css`) instead of a figure.

## Decision

**Seed NULL. Do not seed 60 and 15.**

A seeded 60/15 makes the `data-tok` TBC pill on the ops settings screen disappear, and an
unconfirmed archive figure silently becomes the answer the moment nobody notices the seed was
never real. That is precisely how the archive's claims became live consumer promises in the
first place — the same failure mode as conflict 1 in §D (the 75/25 refund split quoted as
settled before the owner ever confirmed it), and the one conflict C19 registers for this exact
pair of numbers in the Stream 1 pass. NULL renders the pill, which is Law 04 working exactly
as designed, not a workaround of it: a labelled gap the owner can see and close, rather than a
number nobody chose that quietly starts being read as chosen.

## Consequences

**Good.** The gap stays visible and stays owned. Nobody reading the ops Pricing screen can
mistake the waiting allowance for a confirmed figure, because there is no figure to mistake —
there is a TBC pill, which is legible in review and searchable by anyone auditing what is
still open.

**Cost.** The ops settings screen shows a TBC pill instead of a number until the owner
confirms one, which looks unfinished to anyone who does not already know why — a dispatcher
glancing at Pricing sees a gap, not a working system.

**Cost of being wrong.** If the owner confirms 60 and 15 as the real figures, closing this is
one `settings` UPDATE and the pills vanish across every surface that reads the setting —
minutes of work, no migration. The reverse direction — seeding 60/15 now and it turning out
wrong, or never having been confirmed at all — costs a consumer promise the business never
actually agreed to and may be held to under Swiss consumer protection or the FAQ's own claims.
That asymmetry, cheap to fix one way and expensive the other, is the whole argument for NULL.

**Open — stated here prominently, not buried at the end.** A NULL setting is cosmetic on its
own; it only stops the *ops screen* from asserting the number. Conflict C19 already records
that plain prose elsewhere still asserts 60 minutes as fact, regardless of what the setting
holds: `app/home/home.dc.html:759` and `:791` (en), `:817` and `:849` (de), `:875` (fr),
`app/home/HowItWorks.dc.html:205`, `app/pages/account.dc.html:255`, and four
`app/vamos-i18n-dict.js` entries (`:180`, `:314`, `:316`, `:1321`). This pass adds one finding
to that record: `app/vamos-ops-data.js:298` bakes the airport allowance into the S3 surcharge
rule string (`'First 60 minutes included, then per 15 min'`) and is already registered under
C19 — but `app/vamos-ops-data.js:299`, the matching S4 city-waiting rule string (`'First 15
minutes included, then per 15 min'`), is registered nowhere in §D and should be picked up by
the next reconciliation pass. The setting and every one of these copy sites have to move to
settings-driven strings in the same pass, or the NULL seed means nothing — the promise still
ships in prose no matter what the database says.
