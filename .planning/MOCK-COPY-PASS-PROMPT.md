# Next-session prompt — copy everything below the line

---

You are picking up **Vamos Taxi V1** at `/Users/koss/Developer/VamosTaxi.eu`, repo
`Loomlyne/VamosTaxi.eu`, branch `main`. The design phase is finished, the planning phase is
finished, the blocker-closing session is finished, and no production code exists yet — that is
correct. `.planning/` holds PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md, research/ and
**twelve ADRs**.

**Your job this session is the mock-copy pass.** Every decision it applies is already made and
recorded — you are executing a work order, not re-deciding it. Do not scaffold Next.js, do not
create `apps/web`, do not install anything.

## Read first, in this order

1. `CLAUDE.md` — product rules. Constraints, not preferences. It wins any conflict with your
   instincts, and when it does, say so out loud.
2. `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` **§I** — the work order. Every edit below is
   cited there as file:line.
3. `.planning/ADR-010`, `ADR-011`, `ADR-012` — each ends with a
   **"What this implies for the mock-copy pass"** section listing its exact edits.
4. `docs/build/OWNER-ANSWERS.md` — the owner's answers of 13 Aug 2026. Authoritative.
5. `docs/build/OPEN-QUESTIONS.md` — all 27 answered; Q4, Q10 and Q25 are the owner's.

**Never touch `archive/`.** It holds two frozen snapshots with older copies of the same
filenames. Scope every search to `app/`, `design-system/`, `assets/`, `docs/`, `.planning/`.

## The one rule that matters most

**Never invent a value.** Not a CHF figure, not a policy number, not a capacity, not an
address, not a company registration, not a date — not even in a test, a seed, a fixture or an
example. Every unknown stays a `data-tok` pill, which renders as a labelled "TBC".

Two of this session's edits *remove* invented values and put pills back. If you find yourself
reaching for a plausible-looking number, stop — that is the failure this pass exists to fix.

## Start here, and do not let it slip

**C27 is a live privacy misdisclosure on four consumer-facing surfaces.** It is the only item
on the board whose cost of waiting is legal rather than schedule. Do it first, in its own
commit, per `ADR-010`.

Vercel is named as a subprocessor while the stack is Cloudflare, and a real processor is
missing. Four sites — `app/pages/privacy.dc.html:233`, `app/pages/cookies.dc.html:223`,
`app/pages/CookieBanner.dc.html:105`, `app/home/CookieBanner.dc.html:105` (the two banner
copies must move in lockstep). `app/vamos-i18n-dict.js` contains zero occurrences of "Vercel",
so the swap needs no dictionary edit and the de/fr/ar surfaces correct themselves.

The Cloudflare **region stays a `data-tok` gap** — ADR-007 leaves edge pinning open with
counsel. On the cookies table change the **Provider cell only**; the cookie name and duration
stay TBC. Add the missing **AeroDataBox** processor row, with its description in de, fr and ar
in the same pass.

## Then the rest of the work order

Group these into reviewable commits, one decision per commit:

- **Decision 13, vehicle lineup** — drop the `first` class, van capacity 7 → 8, and the `first`
  label-map entries in all four languages. `app/home/home.dc.html:747, 748, 772, 831`.
- **Decisions 14 and 15, flags** — `app/home/home.dc.html:505`: `hourlyEnabled` true → false,
  `flightTrackingEnabled` false → true.
- **Decision 15, hourly copy** — `app/home/home.dc.html:753, 763, 781` and the de/fr/ar
  equivalents.
- **Decision 5, PayPal out of V1** — `app/pages/checkout.dc.html:105, 168, 191, 274, 276, 277`.
- **Decision 4, one contact address** — `info@vamostaxi.eu` → `contact@vamostaxi.eu` at
  `app/home/SiteFooter.dc.html:136`, `app/pages/SiteFooter.dc.html:136`,
  `app/pages/contact.dc.html:233`, `app/pages/privacy.dc.html:182` and `:302`,
  `app/pages/imprint.dc.html:200`, `app/vamos-ops-data.js:321`.
- **C20 and C21, invented figures back into pills** — `app/pages/cancellation.dc.html:208`
  ("over 8 seats", "72 hours") and `app/home/HowItWorks.dc.html:196` (the −24 h driver
  assignment) and `:205` (the sixty-minute waiting claim). These are Law 04 breaches; the
  numbers are not confirmed anywhere and must become labelled gaps.
- **C19, the 60-minute waiting claim asserted as marketing fact** — `app/home/home.dc.html:759,
  791` and the de/fr/ar equivalents at `:817, 849, 875`; `app/pages/account.dc.html:255`;
  `app/vamos-i18n-dict.js:180, 314, 316, 1321`; the two surcharge rule strings at
  `app/vamos-ops-data.js:298` and `:299`.
- **ADR-012, dictionary** — delete the 6 identical and 7 dead duplicate entries; set the Arabic
  for `Economy`, `Business` and `Van` to the Latin names; delete the `First` entry.
- **ADR-011, runtime** — make the translation walker skip `[data-tok]` subtrees, one line beside
  the existing checks at `app/vamos-locale.js:216` and `:256`. Use `data-vt-no-i18n`; the
  attribute `data-i18n-skip` named in `CLAUDE.md` does not exist in the runtime (conflict C26).
- **Decision 2, maintainability** — make the hard-coded 24 h free-cancellation string
  settings-driven at `app/pages/checkout.dc.html:172`, `app/home/home.dc.html:769` and the
  other sites §I lists. The 24 h number itself is confirmed, so this is not a Law 04 fix.

## Blocked — do not touch on inference

- **Cash-to-driver** (`checkout.dc.html:106, 169, 192, 275, 287`; `confirmation.dc.html:122,
  132, 154`). It was absent from the owner's accepted payment list, which reads as "out", but it
  is a lifecycle-changing flow and needs one word of confirmation. Leave it and say so.
- **C24** — the five real-looking company values seeded at `app/vamos-ops-data.js:317-321`
  (`Vamos Taxi GmbH`, `Bleicherstrasse 16, 8953 Dietikon ZH`, `CH-020.4.077.792-7`, the phone,
  the email). Only the `info@` → `contact@` line is authorised. The rest await the owner.
- **The Qurova licence.** The owner is buying it separately and will send it later. Do not
  switch the display face, do not vendor a fallback, and do not touch
  `design-system/assets/fonts/`.

## How to work

- **Start through a GSD command** — `/gsd-quick` per commit group. `CLAUDE.md` requires it and
  the previous session established the pattern; `.planning/quick/` holds five worked examples.
- Commit each decision separately with a message explaining what changed and why. Do not
  bundle the work order into one commit.
- **Four languages in the same pass.** Every string you touch exists in en, de, fr and ar
  before you call it done. Swiss German — "ss", never "ß". Check Arabic with `dir="rtl"`.
- **Verify visually.** These are rendered surfaces. `npx serve .` or `python3 -m http.server`,
  then check at 1440, 1024, 768 and 390 px. A previous session shipped a page whose background
  pattern tiled behind body copy and only a render caught it.
- Re-read every cited file:line from the live tree and prefer the tree over this prompt — line
  numbers drift.
- Report honestly. If a cited line has moved or a decision does not apply cleanly, say so with
  the evidence rather than forcing the edit.

## Context you will want

- **The client input pack is with the owner** — `docs/build/CLIENT-INPUT-PACK.md`, 60 items,
  six of them launch-blocking. Do not re-derive it and do not chase its gaps; they come back as
  answers, not as work.
- The **CHF price matrix** gates `pricing_live=true`, which is the launch trigger. Everything
  is built behind that flag with `CHF 000` on screen.
- Timeline is **2–3 weeks to a live public site**, solo with AI assistance.
- The conflicts register stands at **27**. C19, C20, C21 and C27 are the ones this pass closes;
  update their dispositions in `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` as you close them,
  and correct the §D tally so the arithmetic still sums.
- `docs/build/i18n-audit.txt` and `i18n-todo.txt` are **superseded snapshots** and carry dated
  markers saying so. The live measurement is
  `.planning/quick/260819-279-.../i18n-measure.mjs` — the dictionary is complete, and the
  customer-facing translation residual is zero. Do not resurrect a phantom backlog from those
  two files.

Start with C27. Tell me what you find before you move to the rest.
