# Vamos Taxi: the goal and how the work is run

Written by the control session on 2026-10-01, on the owner's request. The general method is the skill
`control-session` (`~/.claude/skills/control-session/SKILL.md`); this page is what is specific to Vamos.
Status lives on `.planning/CONTROL-BOARD.md`, not here.

## The goal

A customer books a fixed-price, one-way, pre-booked transfer on https://vamostaxi.site in under a
minute, pays by card and gets the confirmation; the driver is there. The owner runs the day alone on
https://dashboard.vamostaxi.site. Not Uber: no live GPS, no driver app, no marketplace.

Done means all of this is true on live data, not on paper:

1. **Book and pay.** Home, class choice with real prices, one checkout page, Stripe payment,
   confirmation, e-mails, in English, German, French and Arabic, on phone, tablet and laptop.
2. **Change and cancel.** The customer's booking page and account; class, place and time changes on a
   paid trip with the difference paid or refunded by hand; cancellations with refunds by hand.
3. **Run the day.** Dashboard: bookings, chauffeurs by class with a plate, assign, prices and extras,
   support tickets, reviews, settings, secure sign-in.
4. **Lawful.** Legal pages from the company's own text, consent saved on the server, measurement
   (Meta) only after consent and only when the owner opens the gate.
5. **Safe to operate.** Every gate green in a clean clone, security findings closed, one writer on main,
   a rollback point for every ship.
6. **Launch, on the owner's word only.** Real Stripe key, the public domain, his prices. Until then:
   Stripe sandbox, vamostaxi.site, and no session invents a price, a rate or legal copy.

## Who does what here

**Strict rule (owner, 2026-10-01 17:12 +04):** the control session is the "Vamos Taxi controller" thread inside the claude.ai project "VamosTaxi.eu" (`local_f9f33973-c2fc-404c-95fe-22b3fb2dd7fa`). No session outside the project, the retired "Vamos Taxi control session" included, ever commits on main, pushes main, applies a migration, deploys or acts as controller. A Ship or a control request from any other session is refused and reported to the owner.

| Session | Model, effort (read 2026-10-01) | Job |
|---|---|---|
| Vamos Taxi controller (project thread; the old "Vamos Taxi control session" is retired) | Opus 5.5, high | The only one that commits on main, applies migrations to Supabase `yaumjzvylngfjhtuffqs`, pushes and deploys Worker `vamos` (and the gateway with an explicit yes) |
| Phase 26.2 audit | Opus 5.5, xhigh | Dashboard and booking changes: class change, chauffeurs by class, place and time change, extras |
| Vamos Taxi security phase | Opus 5.5, medium | Phase 20 security batches, refunds by hand, e-mail change |
| Meta measurement phases 27-29 | Opus 5.5, medium | Consent record (live), pixel page view, purchase event |
| Phase 26.0 main green completion | Sonnet 5.5, medium | Tests, gates, the GitHub test job |
| Sub-agents in any session | Sonnet executors, Opus planners | Signed plans only |

Work sessions live in `/Users/koss/Developer/vamos-wt/<job>` on their own branch with their own
port-shifted local database. The main checkout stays on `main`.

## The rules, where they are written

- `CLAUDE.local.md`, section "One job, one branch, one ship": the 12 binding points.
- `.planning/prompts/00-common-rules.md`: what every work session reads first; job prompts beside it.
- `.planning/decisions/`: every owner decision and approved text, dated, used verbatim.
- `.planning/CONTROL-BOARD.md`: live versions, shipped table, queue, reserved migration numbers, what
  waits for the owner.
- `.planning/PHASE-CLOSURE-2026-09-29.md`: closed phases stay closed.

## One ship, step by step (as done for every ship since 2026-09-29)

1. Hand-over arrives by commit name, main merged in, folder clean.
2. Clean clone of main: merge the branch, `pnpm install --frozen-lockfile`, sync the mocks, then
   typecheck, lint, lint:css, check:numbers, check:legal-claims, check:public-env, check:db-fences,
   i18n:check, db:seed:check, test:unit, build.
3. Migration read in full; live database read-only for the preconditions.
4. Ship question to the owner through the form. His answer only.
5. `backup/main-before-*` and `archive/*` tags pushed. Migration applied verbatim, read back by md5.
6. Squash to one commit on main; staged tree identical to the checked tree; push.
7. Deploy from this Mac; migration always before the Worker that needs it.
8. Live checks on vamostaxi.site and dashboard.vamostaxi.site; say what is not verified.
9. Board updated and pushed as a planning note. Work folder, stack and build output removed after proof.
10. Owner UAT, numbered; after a checkout change a 4242 payment first, then the payment rows are read.

## Where the sessions are in the app

Sidebar group **Vamos Taxi** in the Code tab: every Vamos session, the four that had been archived
included (restored on 2026-10-01 so they could be filed). The control session stays pinned.
