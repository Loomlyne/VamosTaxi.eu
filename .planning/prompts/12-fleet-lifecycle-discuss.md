# Prompt for a new session: fleet lifecycle (retire a fleet, add a new one, no leftovers)

Paste everything below the line into a new Claude Code session on Opus, opened in `/Users/koss/Developer/VamosTaxi.eu` on `main`. That session is the control session for this job (set the controller line in `CLAUDE.local.md` to it, as the rules say). Everything runs locally.

---

You are the control session for Vamos Taxi (repo `/Users/koss/Developer/VamosTaxi.eu`, live https://vamostaxi.site, Supabase `yaumjzvylngfjhtuffqs`). Read `CLAUDE.md`, `CLAUDE.local.md`, `~/.claude/rules/control-session.md` and `.planning/PHASE-CLOSURE-2026-09-29.md` first. One product, one job. Start with `/gsd-discuss-phase`: stop at discuss, plan and UAT for Koss's signature. Name the GSD skill that fits each step and where a Jev decision fits (or say none does).

## The problem, in Koss's words

"I have new fleets. Each time I delete a fleet and add a new one I get this problem. I want a full fix." He wants a fleet (vehicle class) to be retired and a new one added without ever being blocked, without dead rows piling up, and without touching published price history.

## What we found today (2026-10-11, read-only on the live database)

- Live classes (active): `economy-sedan`, `economy-van`, `luxury-van`. Inactive leftovers: `business`, `economy`, `first`, `van`, `mahaha`. Business is off by his choice until he turns it on.
- A class cannot be deleted. These tables point at `vehicle_classes`: `vehicles`, `distance_rates`, `fixed_routes`, `booking_legs`, `price_snapshots`, `distance_bands` (all `ON DELETE RESTRICT`), and `chauffeurs`, `reviews` (`ON DELETE SET NULL`).
- The five leftovers have 0 bookings, 0 vehicles, 0 chauffeurs, but they sit in the rate book: business 9 distance rates, 6 fixed routes, 25 distance bands, 3 reviews; economy 7, 6, 25, 1 review; first 9, 6, 20; van 10, 6, 25, 1 review; mahaha 2 distance rates. All of it lives inside published rate versions 1 to 16.
- Published price rows are frozen on purpose: triggers `distance_rates_frozen`, `fixed_routes_frozen`, `distance_bands_frozen` (function `tg_pricing_row_frozen`) refuse UPDATE and DELETE. Past price books are the audit trail for what a quote used. Deleting a class would need those triggers disabled. Do not do that, and do not write a script that does.
- `vehicle_classes` already has `active`, `hidden_at`, `hidden_reason`, `sort_order`, `photo_path`, `name`, `slug`. Every row change is audited by `tg_audit_row`.
- The live rate version is 18, labelled "placeholder, not owner-approved". Never publish it, never invent a rate.
- `CLAUDE.local.md` used to say `mahaha goes (hard delete when unreferenced)`. It is referenced by published versions 14 and 15, so that rule cannot be met. The rule needs rewriting once the design is signed.

## What to discuss and decide (one decision per question, question form, plain words, one example, recommended option first)

1. Words. "Delete a fleet" in Koss's mind versus what the system should do. Candidate: **retire** (hidden, never offered, never in new rate versions, kept in history) as the only action, with no hard delete from the UI.
2. Lifecycle states for a class: draft, live, retired. What each state does on the public booking cards, the ops new-trip form, the rate book editor, coupons, chauffeur and vehicle assignment, reviews and reports.
3. Adding a new fleet: what must exist before it can go live (name in en, de, fr, ar, seats, bags, photo in R2, a rate row in a draft rate version, vehicles). A checklist inside ops that blocks "go live" until each item is done, so a class is never shown without a price.
4. New rate versions: copying forward from the previous version must skip retired classes, so dead rows stop growing. The 5 leftovers keep their history and stop being copied.
5. Reviews and chauffeurs that point at a retired class: keep the link (recommended) or allow moving them to a live class.
6. Cleanup of the 5 leftovers already in the database: leave inactive and hidden (recommended), or a signed, archived, one-off removal that Koss runs himself. State the cost of each. Never disable the frozen triggers without his signed word in the question form, an `archive/*` tag of the affected rows on GitHub, and a different-model check.
7. The ops screen: where he retires, hides and adds a fleet today, what is missing, and what the screen must say when a class cannot go live.
8. Rules text: rewrite the vehicle-classes line in `CLAUDE.local.md` and the `mahaha` line to match the signed design.

## Hard limits

- No live-data writes, no migrations applied, no deploy without his Ship. Planning notes may be pushed and must say so.
- Never invent prices, rates or legal copy. Never touch rate version 18's publish button.
- Never hard-delete live rows; never disable the frozen triggers; never write a destructive script for him without the steps above.
- Design before code: pictures of the ops fleet screen and the "go live" checklist, his signature, then a plan, then build in its own worktree and branch from `origin/main`. Sonnet builds, Fable reviews every diff, the local gate runs (`pnpm gate:local`; Actions are blocked by billing, so the local gate counts as green and the PR says so), then one PR and his Ship.
- Money, database and auth work: lead runs Opus. Report three lists: verified, not verified, failed.

## First report

Say you are the control session, confirm `git log -3`, `origin/main` and the live Worker, then list what the ops fleet screen does today (read the code, then read live rows read-only), and put decision 1 to him in the question form.
