# The 48 SiteHeader picture diffs: before and after, one picture per state

Made 2026-10-02 by the main-green-3 job on `fix/main-green-3` (main `e38026ff` merged). Not rebaselined.

Test: `apps/web/tests/visual/shell.spec.ts`, "SiteHeader signed-in", `${tile} ${lang}`. It screenshots only the
header element (`#root header[data-hd]`, 60 to 82 px tall) with the menu open. Each picture shows BEFORE (the
darwin baseline on main, from August) above AFTER (main's code today).

## Cause, proven
Commit `51b851e3` (2026-09-30, "phone home ... full-page menu", owner-signed, shipped) changed two lines in
`apps/web/components/shell/SiteHeader.css`: the open menu was a drawer on the right that covered the header (white
panel with a round close button inside the header box); it is now a full-width page that starts below the 60 px bar.
So the header box now shows only the charcoal bar. With those two lines put back for one run, all 48 pass
(103 passed, 0 failed); with today's lines, the same 48 fail. Nothing else differs. The earlier "grey 108 instead of
charcoal 51" cause (Reduce transparency, D-06) is pinned and no longer involved.

## The owner's decision, one per state
For each state: **rebaseline** (the new full-page menu is what you signed; the AFTER picture becomes the
baseline) or **bug** (the header should still look like BEFORE when the menu is open).
Within one state and width, en, de and fr are pixel-identical (the menu labels are outside the header box) and
ar is the same picture mirrored right to left. So in practice there are 12 decisions: 4 states x 3 widths, each
seen once left to right (en) and once right to left (ar).

| State | 390 | 768 | 1024 |
|---|---|---|---|
| inverse-open (signed in, menu open) | en de fr ar | en de fr ar | en de fr ar |
| inverse-unconfirmed (e-mail not confirmed, menu open) | en de fr ar | en de fr ar | en de fr ar |
| overlay-open (home's transparent header, menu open) | en de fr ar | en de fr ar | en de fr ar |
| overlay-unconfirmed | en de fr ar | en de fr ar | en de fr ar |

Files: `<state>-<lang>-<width>.png`, for example `inverse-open-en-390.png`, `overlay-unconfirmed-ar-1024.png`.
Share of pixels that differ: 0.84 to 0.85 at 390, 0.47 at 768, 0.36 (inverse) and 0.43 (overlay) at 1024.
1440 is not affected (the laptop header has no drawer).
