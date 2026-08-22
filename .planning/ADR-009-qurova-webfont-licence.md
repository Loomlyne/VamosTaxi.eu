# ADR-009 — Buy the Prioritype Web Font licence for Qurova; hold the Phase 1 font-copy gate until it happens

**Status:** Accepted 2026-08-22 (owner authorised the ~$69 Web Font purchase in ADR-014 §7). **Remains open until the purchase lands** — owner confirmed keep it open; do not pick a fallback. Still pending the Prioritype checkout and the two foundry questions (pageview cap, perpetual vs annual). Production redistribution of Qurova waits.
**Phase:** 1 (Platform Foundation, Design System Port), because Phase 1 is where the vendored
font files get copied into `apps/web/public/brand/` — the moment redistribution begins.

## Context

**No licence file existed for either vendored type family, and the stylesheet pointed at one
that did not exist.** `docs/build/OPEN-QUESTIONS.md` Q4 stated as fact that "the only licence on
file (`design-system/assets/fonts/OFL.txt`) covers Poppins." That premise was false:
`design-system/assets/fonts/OFL.txt` did not exist anywhere in the repository before this pass,
and `design-system/tokens/fonts.css` line 2 comments a reference to that same non-existent
path. A repository-wide search excluding `archive/` returned no LICENSE, OFL or EULA file at
all. This ADR and the licence file it accompanies correct that record.

**Provenance, read directly out of each font file's own `name` table** — not out of a search
result, a marketplace listing, or an assumption from the filenames:

`design-system/assets/fonts/Qurova-{Light,Regular,Medium,SemiBold,Bold}.ttf`:

- Copyright: `©2025 by Prioritype Co.  All Rights Reserved.`
- Trademark: `Qurova trademark of Prioritype Co`
- Designer: `Prio Nurokhim Aji` · DesignerURL: `www.prioritypeco.com`
- Version 1.000, UniqueID ending `;FL720`
- **No `LicenseDesc` (name ID 13) and no `LicenseURL` (name ID 14) entry at all.** The files
  themselves carry no statement of what a licensee may do with them.

`design-system/assets/fonts/Poppins-*.ttf` in the same folder, by contrast:

- `LicenseDesc`: "This Font Software is licensed under the SIL Open Font License, Version
  1.1..."
- `LicenseURL`: `https://scripts.sil.org/OFL`
- Copyright: `Copyright 2020 The Poppins Project Authors
  (https://github.com/itfoundry/Poppins)`, Indian Type Foundry.

Qurova is a commercial retail face with all rights reserved and no bundled licence grant.
Poppins is OFL 1.1, free to embed and redistribute. Serving Qurova from production without a
web licence is unlicensed redistribution of a commercial font, not a licensing grey area.

**Glyph coverage, measured from each file's `cmap` table:**

- Qurova: 225 glyphs, 224 mapped codepoints. German `ä ö ü`, French `é à è ç`, typographic
  quotes and `«»`, digits and `·`/`—` are all present. Latin Extended is covered, so German and
  French are safe in Qurova.
- Poppins: 1059 glyphs, 471 mapped codepoints, with the same Latin Extended coverage.
- **Neither family contains a single Arabic glyph.** See the Arabic paragraph below — this is a
  second, independent finding this ADR surfaces rather than solves.

The vendored Qurova files are the full retail family, not one of the stripped "Qurova DEMO"
builds that circulate on 1001fonts and befonts with far fewer glyphs. What sits in this
repository today is the paid product, licensed for nothing but the design work it was bought
for.

**Where Qurova is wired into the design system:** `design-system/tokens/fonts.css` lines 3–7
declare five `@font-face` weights (300/400/500/600/700); `design-system/tokens/typography.css`
line 7 sets `--vt-font-display:"Qurova","Poppins",system-ui,sans-serif`. `.claude/CLAUDE.md`
records that Phase 1 copies these font files into `apps/web/public/brand/` — that copy step is
the moment redistribution to production begins, and is the gate this ADR closes with.

## Decision

**Recommend the Prioritype Web Font licence, published at $69, and hold the Phase 1 font-copy
step until the owner has bought it or picked the rendered fallback.**

The full nine-tier price list, reproduced exactly as published at
`https://prioritypeco.com/product/qurova-logo-font/` on 19 Aug 2026:

| Tier | Price |
|---|---|
| Standard | $39 |
| **Web Font** | **$69** |
| Epub | $200 |
| Extended (foundry-recommended) | $350 |
| App/Game | $400 |
| Server | $700 |
| Broadcast | $1500 |
| National Corporate | $3000 |
| Worldwide Corporate | $3500 |

Terms, from `https://prioritypeco.com/license/` on the same date: the Web Font License grants
"1 Website", "licensee's web app and website usage only", and `@font-face` embedding, subject to
a monthly pageview cap of **"100,000 Views"**. The Standard License ($39) explicitly excludes
web embedding — "Embedding font files in apps/games/e-pub" is prohibited and `@font-face` is not
covered — so a desktop licence already bought for the design work would not cover the site; "we
may already own one" is not a defence here.

**The binding constraint is the pageview cap on a single website, not the $69 price.** Against a
2–3 week launch and a bound design system whose display face *is* the brand voice, $69 is not a
real trade-off — the cost of the alternative (reworking every display setting across 30+
screens) dwarfs it by orders of magnitude. The risk that actually matters is operational: a
public transfer site running paid acquisition can pass 100,000 monthly views, and the moment it
does, the licence is breached silently, with no warning from the foundry's side. **The published
price list does not say which tier covers web usage above that cap** — naming a specific higher
tier here would be inventing a fact the vendor has not published, so that is a written question
for Prioritype, not an assumption this record makes. The monthly pageview figure needs a named
watcher and a named source before launch; since the analytics decision itself is still open
elsewhere in this project, "watch the pageview count" is a requirement to carry forward, not a
mechanism this ADR can specify yet.

**Licence duration is not stated on the vendor's page.** Whether the Web Font licence is a
one-time perpetual grant or an annual subscription is the second written question to put to
Prioritype before money moves — an annual licence is a recurring obligation someone has to
remember to renew in year two, and guessing wrong in either direction either overstates the cost
or creates a silent future lapse.

**Two written questions for Prioritype, before purchase:**

1. Which licence tier (if any) covers web usage above the 100,000 monthly pageview cap, and at
   what price?
2. Is the Web Font License a perpetual grant or an annual subscription?

**The three real options, with their real costs:**

- **Buy the Web Font licence ($69, pending the two questions above).** Keeps the bound design
  system's display voice exactly as built. The recommended path.
- **Swap the display face.** A visual change across 30+ screens, and therefore the owner's call,
  not an engineering default — see `docs/build/Owner Typeface Review.dc.html` for a rendered,
  side-by-side comparison of the real Vamos strings in Qurova against open-licence candidates, so
  the choice is between rendered options rather than an abstract question.
- **Ship without a licence.** Unlicensed redistribution of a commercial retail font whose files
  any site visitor can download directly off the production site. Not a real option; named here
  only so the record shows it was considered and rejected.

The purchase itself is the owner's to make — it is their money and their brand — but it is not a
design decision engineering should make unilaterally. That is exactly why the rendered fallback
in `docs/build/Owner Typeface Review.dc.html` exists as insurance, not as the expected path.

**Second-order finding: the brand has never had an Arabic display face.** Law 03 in
`.claude/CLAUDE.md` makes Arabic a first-class language, but neither vendored family — not
Qurova, not Poppins — contains a single Arabic glyph. The Arabic surface has therefore never
carried Vamos display type at all; it renders in whatever Arabic face happens to be loaded by
the browser or by the runtime's own fallback. Whatever happens with the Qurova licence, sourcing
an Arabic display face is a separate open item that nobody has raised before this pass. This ADR
states it and does not attempt to solve it here.

**Related data-protection finding, registered as conflict C25:** the mechanism that currently
supplies *any* Arabic type at all — `app/vamos-locale.js` lines 296–301 — injects a `<link>` to
`https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap`
whenever Arabic is selected, and lines 288–289 set `--vt-font-body` and `--vt-font-display` to
include `'Noto Sans Arabic'` ahead of Qurova/Poppins. This is a **data-protection** problem, not
a licensing one — Noto Sans Arabic is itself OFL and free to vendor. The problem is the hotlink:
every Arabic page load discloses the visitor's IP address and user-agent to Google, a party
absent from the privacy page's subprocessor list (Cloudflare, Supabase, Stripe, Resend, Mapbox,
AeroDataBox and Sentry, per Q21), and it fires before any consent interaction. It also
contradicts this repository's own vendoring practice, under which the Lucide icons, both type
families and the Lenis scroll runtime are all vendored locally rather than hotlinked. The remedy
— vendor Noto Sans Arabic (or another OFL Arabic face) into `design-system/assets/fonts/` and
drop the CDN `<link>` — is recorded here and in `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md`'s
§D as C25, and is **not performed in this pass**; it is a code change that belongs in the same
reviewable pass as the other mock edits tracked in that checklist's §I. Disposition: **OPEN**.

## Consequences

**Cost of being wrong, per branch:**

- **Licence bought, traffic later passes the 100,000-view cap.** Cheap to fix if a named party is
  watching the pageview count and catches it early — the fix is buying the next tier or
  negotiating with the foundry. Expensive if the foundry discovers the overage first, since that
  conversation starts from a breach rather than a renewal.
- **Fallback face taken instead of buying the licence.** Every display type setting across the
  mocks changes, and the brand's display voice changes with it. Reversible only by doing the
  swap a second time in the other direction — not catastrophic, but not free, and it is a visual
  identity change the owner has to sign off on twice instead of once.
- **Nothing decided, and Phase 1 copies the font files into the production app anyway.** This is
  the one branch that carries real legal exposure — unlicensed redistribution of a commercial
  retail font, publicly downloadable from the live site — and it is the only branch a
  configuration change cannot undo after the fact, because the exposure exists for every day the
  files sit in production unlicensed.

**Gate:** Phase 1's font-copy step — copying `design-system/assets/fonts/Qurova-*.ttf` into
`apps/web/public/brand/` — must not run until this ADR's status changes from Proposed, either
because the Web Font licence has been bought or because the owner has chosen the rendered
fallback in `docs/build/Owner Typeface Review.dc.html` instead.
