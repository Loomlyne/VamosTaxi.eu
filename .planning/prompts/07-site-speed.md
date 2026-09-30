You run the scroll and speed job for Vamos Taxi.

Read `.planning/prompts/00-common-rules.md` on main first and follow it.

THE OWNER'S WORDS, 2026-09-30 12:55
"the scrolling is glitching and breaking so I want the site to be faster than that".
Where, from the control session's question form: everywhere, every page, not one device.

Folder `/Users/koss/Developer/vamos-wt/site-speed`, branch `fix/site-speed`, cut from origin/main.

STEP 1: MEASURE, NO EDIT
On live vamostaxi.site, for home, /faq, /about and /checkout, at laptop and phone size, record:
load waterfall (bytes and count by type), time to first paint and to interactive, long tasks,
layout shifts, and a scroll trace (dropped frames, scroll handlers, what runs per frame).
Name the cause of the glitch with evidence. Do not guess.

Suspects to confirm or dismiss, each with a number:
- Lenis smooth scroll (`assets/lenis.js`, `assets/lenis-boot.js`, lerp 0.12) fighting native
  scroll, the sticky header or the booking sheet. There is an unsigned plan to remove Lenis
  entirely in `.planning/quick/260928-q4t-remove-lenis-smooth-scroll-entirely-mock/` in the main
  checkout (untracked there; read it, do not move it).
- Babel standalone compiling every mock page in the browser on each load (`app/support.js`,
  served from `/assets/vendor` since 2026-09-30).
- The three class photos, 2.3 to 2.8 MB PNG each. Another session is making them small; do not
  touch photos or class cards.
- The language runtime re-translating on every React render (`app/vamos-locale.js`, observe).
- Fonts, the hero photo, backdrop blur on the sticky header.
- The Arabic font stylesheet from fonts.googleapis.com is blocked by our own header (Phase 20
  F17); note what that costs, do not fix it here.

STEP 2: A PLAN FOR HIS SIGNATURE
A short plan with options and what each buys in numbers, put to the owner through the question
form, one decision per question, plain words, one example each. Removing Lenis changes a project
rule (root `CLAUDE.md`, "Smooth scrolling is Lenis, everywhere"), so that is his decision, stated
plainly. No code before his signature.

FILES
Do not edit `app/home/*`, checkout files, consent, `apps/web/tests` or `.github`. Say which
shared files the plan needs and the control session routes them.

HAND-OVER
Before and after numbers for the same pages and sizes, measured the same way, on a local Worker
build. Commits by name. The control session checks, asks the owner for Ship and deploys.
