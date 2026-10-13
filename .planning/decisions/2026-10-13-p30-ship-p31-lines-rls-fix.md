# 2026-10-13 ~23:35 (+04): owner answers in the question form

1. **Phase 30 (PR #80): Ship.** Order: owner runs `docs/runbook/p30-remove-test-classes.sql` himself; controller runs b1–b3 read-only, applies 200000 → 210000 → 220000 verbatim with read-back, squash-merges, deploys both Workers (two-Worker order), owner makes one 4242 payment.
   - Before it: archive tag `archive/p30-test-classes-20261012` (60a50773) holds every row the script deletes; live read-only: the 5 test classes have rows only in retired price books (37 rates, 24 fixed routes, 95 bands, 0 rules), 0 legs/snapshots/vehicles/chauffeurs; 0 published reviews besides rv-1…rv-5. Different-model check of the script: Grok 4.7 (PR #80 comment) plus these live facts.
2. **City/canton extras and distance bands blocked on live: fix now as its own job.** Live `distance_bands` and `rate_version_rules` carry only RESTRICTIVE policies for `vamos_staff` (D-30-03-1), so Pricing cannot save a city-pair extra or a band. Migration number `20261012250000`. Lands after Phase 30.
3. **Phase 31 internal lines signed as written** in `31-HANDOVER.md` §5 "New internal lines" (31-06 nightly refund check mail, 31-04 refund-mail alert, 31-08 W4/W5 en/de/fr/ar). Used verbatim.

## 2026-10-13 ~23:45 (+04)

4. **PR #79 (GA4 + Tag Manager GTM-KPKGT4VH on, adopted wording): Ship after Phase 30 lands.** Before deploy the owner confirms: GA4 Enhanced measurement OFF; container GTM-KPKGT4VH holds no Meta pixel, no GA4/Ads tag, no Custom HTML, no trigger on purchase/page_view. Grok round 2 approve with notes; clean clone a76c049a gate exit=0.

## 2026-10-14 ~00:20 (+04)

5. **Region premiums join the PR #81 fix** (same restrictive-only bug): same migration file `20261012250000` (not live), tests extended.
6. **Phase 32: five more Arabic-letter spellings of "Vamos Taxi" become Latin** (3 e-mails, dashboard Reviews screen, sidebar), same rule as the 44 (D-14a); approved legal lines untouched.
7. **Phase 32: booking notes are translated and stored; no screen until the owner signs a design.**
8. **Phase 32 plans (12) and migration numbers 20261012260000–20261012290000 SIGNED** (~00:25, after seeing the plan list). Execution starts after Phase 30 is live.

## 2026-10-14 ~00:45 (+04): PR #81 re-scoped

9. **Correction:** city/canton extras live in `fixed_routes` and always saved (live book 22 holds 6). The blocked parts were km bands, region % and the Rules list (`rate_version_rules`).
10. **Km bands and region % are deleted completely** (owner: removed on purpose, replaced by city/canton extras, "we will take more look into it"). Item 5 (give region premiums staff access) is withdrawn. PR #81 becomes the removal: Pricing screen parts, price engine, copy in four languages, tests. The old rows (20 bands, 5 premiums in retired books 1–5) are archived on GitHub first, then the owner runs one delete script; tables dropped after that.
11. **Rules list (Pricing › Distance rules: waiting unit, free-wait hours, Mapbox service area): discuss, aim to make it work.** The owner wants it explained and drawn first. Not decided.
12. **Lock check added to PR #81:** the frozen-book trigger also refuses moving a row OUT of a live or retired book, on every pricing table that stays.

## 2026-10-14 ~02:20 (+04): Rules list decided (drawn first, signed)

Live facts read 2026-10-14 01:5x: `rate_version_rules` has 0 rows in every book; the quote never reads it. Quote lock is 1,440 min on book 22 and draft 23 (stored on `rate_versions.quote_lock_minutes`). Waiting included comes from Settings › Booking policy (airport 60 min, city 15 min). `rate_versions.free_wait_minutes` is empty on book 22. The service-area polygon sits in Settings and the quote already enforces it.

13. **Rules box becomes one box: "Price stays valid for 24 hours"** (edits `quote_lock_minutes`). Waiting unit, Free-wait hours and Service area leave the Pricing screen, and so does the hidden `city_pair` write. `rate_version_rules` is dropped in PR #81 part B, after its archive tag. No price changes, nothing public changes. Part of PR #81; pictures for his signature before code.
14. **Extra waiting after the included time: not charged, not now.** Waiting stays free; late cases handled by hand.
15. **Service area: keep as is, no map screen.** Changing the shape is a reviewed database change on request.
