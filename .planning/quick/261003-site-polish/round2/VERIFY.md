# Round 2 verification — quick 261003-site-polish

Verifier, 2026-10-03 21:40 +04. Worktree `.claude/worktrees/site-polish`, HEAD `c8b3bfec`. I read every proposal, its CSS and JS, and the
i18n file. I opened 21 sample pictures. I grepped tokens, laws and the users of every selector the proposals touch. I measured one thing
live, on the served mirror at port 4911 (started by me and killed by PID): the R2-3 root cause. No product file was edited.

## Summary

| # | Comment | Verdict | Blocking |
|---|---|---|---|
| 1 | Address list | PASS with one fix | Arabic sheet pictures show the postcode at the wrong end ("Kloten, Switzerland 8302"). The RTL rule does not reach the sheet. |
| 2 | Tablet card | FAIL until fixed | No file list and no test list. Option B uses `--vt-yellow-600` (renders brown #D19C04 on home). Option A overturns signed decision 26.4 D-01 and does not say so. |
| 3 | Route rows | PASS | None. The root-cause claim is true for home only, not "every page" (details below). |
| 4 | Reviews drift | PASS with notes | None blocking. Option B pictures cover only 1440 and 390. |
| 5 | Remove ClosingCta | PASS | None. |

## 1 · Address list (R2-1)

- PASS: answers the owner's words. The icon now comes from the real Mapbox type (`feature_type`, `poi_category[]`, `maki`), not from guessing on the text, and the list is redesigned. The extras are marked OPTIONAL: Popular group, dropping the re-sort, skeleton/empty states. The owner must decide them; they are not part of his ask.
- PASS: pictures exist for before and after at 1440/1024/768/390, en and ar, plus states. No frames, no sideways overflow.
- FAIL (fix before code): in `R2-1-after-ar-768.png` (the sheet) the sub lines read "Kloten, Switzerland 8302" and "Zürich, Switzerland 8001", so the postcode jumped to the end. The desktop picture `R2-1-after-ar-1440.png` is correct ("8302 Kloten, Switzerland"). `[dir=rtl] [data-sug-sub]{direction:ltr}` does not take effect in the BookingSheet rows. The coder must check it in the sheet. The likely cause is the sheet row's own inline styles or structure.
- PASS: Lucide names `bed`, `train-front` and `map` are real Lucide icons. The path data in proposal.js matches Lucide `bed` and `train-front`. The repo does not have them yet: only `map-pin.svg` is in `assets/icons/`. The coder must vendor the real files verbatim from lucide-icons/lucide (ISC), not the hand-copied paths.
- PASS: laws. No glow, no tint, no gradient, no hex. Every `--vt-*` token used exists.
- NOTE: the kind label and the group head use a hard `font-size:10px`. The group head already uses 10px today. Prefer `var(--vt-label-sm)` (11px), so it is a token and not below the label scale.
- NOTE: i18n. Eight keys plus one pattern, with de/fr/ar, Swiss German. None collides with an existing dict key. "City" and "Place" both translate to German "Ort", so two kinds get the same German label. Suggest City = "Ort" and Place = "Ort von Interesse", or merge the two kinds. The pattern must become a regex literal, as in the dict.
- NOTE: the claim that the desktop list has no `data-vt-no-i18n` is true: `home.dc.html:430` has none, while the sheet (`BookingSheet.dc.html:142/162`) does. The row's `title="{{ s.full }}"` sits outside the protected block, so the runtime may still translate the place name in the tooltip.
- NOTE, feasibility: the file list misses `apps/web/app/api/geo/suggest/route.ts` and `lib/geo/session.test.ts` by name, and `BookingSheetStates.dc.html` (states gallery). The ops screens `PlaceSearch`, `OpsNewTrip` and `OpsTable` call the same `/api/geo/suggest`. The new field is additive, so they are unaffected. BookingSheet has no `app/pages` twin (checked).
- NOTE, cross-job: the 1024 and 768 pictures show the sheet. If the owner picks R2-2 option A, those widths get the desktop dropdown in the card instead. R2-1, R2-2 and R2-5 all edit `app/home/home.dc.html`, so they must run one after another, not in parallel.

## 2 · Tablet booking card (R2-2)

- PASS: answers "redesign #book on tablet 768–1080". There are two options, with A recommended.
- PASS: pictures for before, A and B at 1440, 1081, 1024×1366, 1024×768, 820, 768, 680 and 390, in en and ar, including flight and sheet states. Pictures at 390 and 680 are byte-identical to before for both options, so the phone is unchanged. Pictures at 1440 and 1081 en are identical to the eye; the md5 differences are rendering noise.
- PASS: field order Flight→From→To→When→Travellers holds (`R2-2-optA-ar-1024x768-flight.png`: Flight on top, then From/To, then When/Travellers/CTA). One-way only, 54px fields and CTA, no amounts shown.
- FAIL, signed decision: option A brings the card back at 681–1080. That supersedes 26.4 D-01 (`.planning/phases/26.4-one-form-phone-booking/26.4-CONTEXT.md:21`: "Phone (390) AND tablet (768) get … ONE bar"). The proposal must say so plainly, and the owner must sign the supersede. Option B keeps the decision.
- FAIL, law: `optB.css:16` `[data-tgo]:hover{background:var(--vt-yellow-600)}`. On home, `--vt-yellow-600` computes to #D19C04, a brownish tone (see R2-3 finding). Use `var(--vt-accent-hover)` (yellow-500). Option B also restyles a pill button from scratch (`[data-tgo]` with `all:unset`). Project rule: use the design-system `Button`, not a local copy.
- FAIL, feasibility: there is no list of files or tests. What I found:
  - Option A, `app/home/home.dc.html`. `NARROW()` (l.1158) feeds every `narrow` use: dest-pick (l.1261), resize (l.1362), hash landing (l.1308), the dock (l.1952), flight logic (l.2167), the `#book` id switch (l.2348) and the trust row (l.2395). Also the matchMedia list at l.1376, the bar block at l.291–308, the `#book` rules at ≤1079 (l.211, l.241), and the hero min-height at l.218. `SiteHeader`'s own 1079/1080 switch is independent. `data-only-wide` and `data-upto-wide` have no users.
  - Option A breaks these tests: `tests/unit/home-one-form-264.test.ts:54-55` asserts the literal `(max-width:1080px)` strings. These tablet-width specs must be redone: `tests/visual/home-booking-sheet.spec.ts` (l.128–143 "at 1080px and under the bar replaces the box"), `home-laptop-bar.spec.ts`, `home-phone-hero.spec.ts`, `home-sheet-history-bp2.spec.ts`, `booking-bar-states.spec.ts`, `booking-sheet-states.spec.ts`.
  - Option B: `BookingBar.dc.html` (new `variant="strip"` plus the dock copy), `BookingSheet.dc.html` (two-column layout), `BookingBarStates.dc.html` / `BookingSheetStates.dc.html` (galleries), `home.dc.html`, and the same visual specs.
- PASS: option B claims no new strings. Verified: From, To, When, Pickup address, Drop-off address, Add date and time and See prices all exist in the dict.
- NOTE: in the option B sheet in Arabic, the "Who" heading reads "من", the same word as "From". This string is already live today, but the two-column layout puts the two words side by side.

## 3 · "Where we drive" rows (R2-3)

- PASS: "change the hover completely". A gives a charcoal fill, white text, yellow arrows and a 4px chevron nudge. B gives a full #FDC20B fill with charcoal text. Rest, hover, focus-visible and press states are on one board. Hover applies only under `(hover:hover)`. Reduced motion is honoured.
- PASS: pictures for before (rest and hover), A hover, B hover and states, at all four widths, en and ar.
- PASS: laws. Every colour is a token. Focus uses `--vt-ring` (A) or a 2px charcoal inset (B), with no glow. `--vt-accent-hover` is yellow-500, which is allowed. Text sits on logical properties. The coder touches CSS only, in the byte-identical twins `app/home` and `app/pages/WhereWeDrive.dc.html` (verified identical). No markup, no strings. The `bookClick` interceptor skips `[data-ww-row]` (`home.dc.html:1986`), and a CSS-only change does not affect it.
- NOTE: B makes a full row yellow. That is a large surface for an accent the design system calls "small".
- NOTE, pre-existing bug the proposal says is fine: in Arabic the route arrow points the wrong way at every width, before and after (`R2-3-before-rest-ar-1440.png` and `-768.png` both show "مطار زيورخ → زيورخ", so it points toward the airport). The `[dir=rtl] [data-ww-arrow]{transform:scaleX(-1)}` rule is not taking effect on the arrow; the chevron does mirror. Worth fixing in the same CSS pass.

### R2-3 root-cause claim: true, but on home only

Measured on the served mirror at 1440:

| page | first stylesheets in `<head>` | `--vt-yellow-700` | `--vt-yellow-100` | row hover colour |
|---|---|---|---|---|
| `/app/home/home.html` | styles.css, then fonts, **colors.css**, … | #A67B05 | #FEF3CD | rgb(166,123,5) |
| `/app/pages/about.html` (same WhereWeDrive) | fonts, colors.css, … , styles.css | #2B2D2C | #F6F6F6 | rgb(43,45,44) |

How it happens: `app/support.js` mounts helmet `<link>`s in order and skips any href it has already mounted (`mounted.has(key)`).
- `home.dc.html` is the only public page whose helmet links `styles.css` alone, with laws.css @imported last inside it (l.86).
- The first child component on home links the single token files and then `styles.css`. Its `colors.css` is new, so it is appended *after* the laws, and its `styles.css` is skipped as a duplicate.
- Every other public page links the token files *before* `styles.css` in its own helmet, so the laws stay last.
- The ops files link neither.

So the law-02 alias is dead on the whole home page. Every `a:hover`, every cream tint and every `-600/-700` there renders raw. It is not dead "on every page", as the proposal says. The builder's suggested site-wide fix, "add a `tokens/laws.css` link last in each helmet", would not fix home: child helmets mount later and would still append `colors.css` after it. The working fix is one change in `home.dc.html`'s helmet: link the token files before `styles.css`, as `about.dc.html` does (l.20–26). Any child `colors.css` is then a duplicate and is skipped.

## 4 · Reviews wall drift (R2-4)

- PASS: matches the owner's words. With more reviews the wall drifts slowly by itself. It pauses on `:hover` (and `:focus-within`), and stands still under reduced motion with every review shown. It is plain CSS keyframes on a transform inside a clipped (`overflow:hidden`) wall. There is no scroll library, no scroll handler and no write to `<html>`; the only JS is a matchMedia listener for the column count. Clones are `aria-hidden` and `inert`, and hidden under reduced motion.
- PASS: option A pictures at all four widths, en and ar, three time frames, plus reduced motion and the static 6-review case. Option B pictures cover only 1440 and 390 (NOTE), and the static-6 Arabic picture only 1440.
- NOTE, laws: the edge fade is a `mask-image: linear-gradient(... #000 ...)`. That is an alpha mask and adds no colour, so I read it as not a "decorative gradient". The owner decides; the hard-crop fallback (delete two lines) is offered. Option B uses physical `margin:0 var(--vt-space-5) 0 0` and an RTL override; use `margin-inline-end` instead.
- NOTE: the CSS comment "the wall must not clip a focused link" has no rule under it. A tabbed-to card can sit under the fade or be clipped. Either add `scroll-margin` / un-pause handling, or drop the comment.
- NOTE: `Reviews` is mounted on home, about, contact and faq (`app/pages/*.dc.html`), so the drift appears on all four. The twins `app/home` and `app/pages/Reviews.dc.html` are byte-identical (verified). No existing test reads `data-rv-wall`.
- NOTE: in `R2-4-optA-14-t0-ar-1440.png` the sticky header covers the section heading. This is an artefact of how the picture was taken, not the design.

## 5 · Remove ClosingCta (R2-5)

- PASS: removal only, no redesign. Pictures for before and after at all four widths, en and ar. The FAQ now flows straight into the footer band "Booked ahead, priced up front." with BOOK NOW (`SiteFooter.dc.html` has it).
- PASS: feasibility. `ClosingCta` is imported only at `home.dc.html:597`, with no `app/pages` twin and nothing in apps/web, tests or scripts. Its two strings ("Your driver is waiting.", "Fixed price, booked in under a minute.") exist only in `app/vamos-i18n-dict.js:2434-2435`. They are not in `apps/web/i18n/messages` or `seed.sql`, so there is no seed regeneration. The hero line "Land in Zurich. Your driver is waiting." is a different key and stays.

## Questions for the owner (one decision each)

1. **Address list, kind of place**: may the server send the place type (airport, hotel, station, address, city) with each suggestion, so each icon is right? Recommended: yes. Example: "Baur au Lac" shows a bed and the label HOTEL instead of a pin.
2. **Address list, Popular**: when From is empty and focused, show four ready picks (Zurich Airport, Geneva Airport, Basel Airport, Zurich HB)? Yes or no.
3. **Address list, order**: keep Mapbox's own order, so the airport stays first when you type "zur", instead of today's re-sort by name? Recommended: yes.
4. **Tablet card**: on tablets (768–1080 wide), A = the full booking card on the page, like the laptop, which replaces the "one bar + sheet" you signed in 26.4. B = keep the bar and sheet, with the bar showing From | To | When | SEE PRICES and the sheet in two columns. Recommended by the builder: A.
5. **Route row hover**: A = the row turns charcoal with white text and yellow arrows. B = the row turns full yellow with charcoal text. Recommended: A.
6. **Home colour law fix**: home is the one page where the "no cream, no brown" rule is switched off by a loading-order slip. The fix is one change in the home page's stylesheet order. Any cream or brown on home then becomes white, grey or charcoal, as on About. Fix it? Recommended: yes.
7. **Reviews drift**: A = columns drift slowly upward (recommended), B = one row slides sideways.
8. **Reviews, when**: start drifting above 6 published reviews? On phones, drift too or stay still? Recommended: above 6, and phones drift too (the builder's default).
9. **Reviews edges**: soft fade at the top and bottom edge, or a hard cut? Recommended: soft fade.
