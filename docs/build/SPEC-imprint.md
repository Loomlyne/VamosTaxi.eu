# Imprint / Impressum — `imprint.dc.html`

**Shell:** `SPEC-legal-shell.md` · **Sections:** 9 · **Status:** built 4 Aug 2026
**This is the bilingual proof page** (client answer, 4 Aug): German is the original.

## 1. Why this page carries the DE/EN work

The live imprint exists **only** in German while the rest of the site is English. So German is
not a translation here — it is the source, and English is the addition. Every other page ships
English first with a growth note.

## 2. How bilingualism is built

Both languages live in the same markup, paired at the smallest sensible unit:

```html
<span lang="de">Vertretungsberechtigte Person</span><span lang="en">Authorised representative</span>
```

A `data-lang` attribute on the page root switches them with CSS only:

| State | Behaviour |
|---|---|
| `de` | `[lang="en"]` hidden |
| `en` | `[lang="de"]` hidden |
| `both` | headings stack DE then EN (EN at h3 size, muted); values stack with 6px lead; **nav and breadcrumb stay DE only** so the rail is not doubled |

Consequences that matter: one structure to maintain, both strings directly editable in the
editor, no duplicated section tree, and the DE/EN diff is readable at a glance in `both` mode.

The control is a three-way segmented group in the title band (38px segments inside a pill, yellow
fill on the pressed one, `aria-pressed`). It is page-local on purpose: the site header's own DE
toggle reloads the page and is read on mount, so the two never contradict each other, and
switching language here does not throw away the reader's scroll position.

## 3. Structure

```
01 Angaben gemäss Handelsregister   06 Streitbeilegung
02 Kontakt                          07 Haftungsausschluss
03 Vertretungsberechtigte Person    08 Urheberrecht
04 Mehrwertsteuer                   09 Gestaltung und Umsetzung
05 Aufsichtsbehörde und Bewilligung
```

01–03 are definition lists of verified register data, verbatim: registered firm name *Vamos Taxi*,
legal form GmbH, company number CH-020.4.077.792-7, register office Canton of Zurich, seat
Bleicherstrasse 16, 8953 Dietikon ZH, representative Ben Othman Houssein, owner and managing
director. WhatsApp is included at +41 79 626 70 82 (confirmed).

## 4. Slots — 4 · Tokens — 6

| Slot | Why it is empty |
|---|---|
| UID / MWST (04) | published nowhere. Either the real CHE number with the VAT suffix, or the row comes out because the company is not registered. A wrong UID is worse than none |
| Supervisory authority and licence (05) | passenger transport in the canton is licensed; the authority and the number are a trust signal, and both are absent from the archive |
| Dispute body (06) | shares one answer with terms §12 |
| Disclaimer (07) | must not contradict liability in terms §13 |

Tokens: effective date · version · UID · photography credit · brand agency credit · build agency
credit. The last three come out entirely if nobody wants a credit line.

One decision flag: the site says “Vamos Taxi GmbH” throughout, the register entry reads “Vamos
Taxi” with the legal form held separately. The imprint shows the register version.

## 5. German growth check

The review scaffold on this page **is** the localisation deliverable — every label the legal shell
uses, in both languages, worst case first:

| English | German | Growth |
|---|---|---|
| Terms & conditions | Allgemeine Geschäftsbedingungen | +72% |
| Last updated | Letzte Aktualisierung | +75% |
| Print or save as PDF | Drucken oder als PDF speichern | +50% |
| Privacy policy | Datenschutzerklärung | +43% |
| On this page | Auf dieser Seite | +33% |
| Cookie policy | Cookie-Richtlinie | +31% |
| Imprint | Impressum | +29% |
| Authorised representative | Vertretungsberechtigte Person | +16% |
| Related documents | Verwandte Dokumente | +12% |
| Cancellation & refunds | Storno & Rückerstattung | +5% |

Design consequences, in the three places German actually breaks something:

**1. The rail and the footer legal column wrap; nothing is `nowrap`.** Two lines is what
*Allgemeine Geschäftsbedingungen* needs at 264px and 14px Poppins. Breadcrumbs and the print
button do stay on one line — short in both languages, and a wrapped breadcrumb reads as an error.

**2. The footer splits links per character for its hover roll, so words had to be regrouped.**
Every character is an `inline-block`, and a line can break between any two of them — so
*Stornierung & Rückerstattung* could break mid-word. `splitLinks()` now wraps each word in a
`.ft-w{display:inline-block;white-space:nowrap}` group with its trailing space, putting the break
opportunities between words where they belong.

**3. The site header nav could not fit German at all, and was silently clipping.** It sat in a
`flex-wrap:nowrap` row with `min-width:0; overflow:hidden`, so it absorbed the whole row's
shrinkage: at 925px the nav measured 202px against 411px of content — *Firmenkunden* was entirely
invisible, with no menu to reach it from. English clipped too; German only made it obvious.

Fixed at the cause, not the symptom: the nav is now `flex:0 0 auto` and never shrinks or clips.
Below **1140px** — the width at which the German row stops fitting — it is hidden and a 44px menu
button reveals a panel carrying the three service links plus FAQs, Contact, Sign in and the phone
number. The phone link drops out below 600px and Sign in below 900px, both still in the panel.
Escape closes it, and a resize back above the breakpoint closes it too, so `aria-expanded` never
lies once the panel is `display:none`.

The breakpoint is set for German, not English. Sizing a nav to the shorter language is how this
class of bug gets shipped.
