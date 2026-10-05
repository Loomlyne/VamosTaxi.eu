# Hand-over: checks and tests (quick 261005-checks-and-tests)

Branch `fix/checks-and-tests`, cut from `origin/main` `328b133c`, merged with later `origin/main` before hand-over (tip in the
controller report). Source: `.planning/audits/2026-10-05-repo-investigation.md` (owner chose "Checks and tests"). Work session:
nothing was committed on `main`, nothing deployed, no GitHub, Cloudflare, Stripe or live-database setting changed. `gh` was used
read-only (`run list`, `run view --log-failed`).

No migration, no product code (`app/**`, `apps/web/app/**`, `apps/web/lib/**` except one `*.local.test.ts`), no deploy command run.
A `fix/**` push starts no workflow (checked: no workflow triggers on it), so pushing this branch costs no Actions minutes.

## Summary

| Item | State |
|---|---|
| U21 unit tests and pgTAP on every push to main | Fixed (workflow change; first real proof is the first push to main) |
| U20 CI red on every push | Workflow fixed; 8 stale specs fixed and re-run green locally; 1 real product bug left as `test.fixme`; WebKit rows skip with a reason |
| U22 database-backed tests | Fixed: `pnpm test:db-lab`; refund-by-hand id fixed; on the merged tree 72 + 4 + 31 passed, lab destroyed |
| S16 audit | undici pinned; `braces` cannot be fixed (no patched release exists), audit-ignored with the reason |
| D3 deploy script | Fixed: refuses without `--env`, only `staging` allowed |
| D4 `.dev.vars.example` | Fixed: every name, no values |
| README | Rewritten: layout, running locally, how the controller deploys (no runnable deploy line) |

## U21 and U20: GitHub Actions (`deploy-staging.yml`, `pr.yml`, `schema.yml`)

Cause. A push to `main` ran the gate, one macOS visual job and the nine Linux e2e shards. `pnpm test:unit` and the pgTAP suite ran
only for pull requests (none are opened) or a `ci/**` push, so never for `main`. The macOS job needs about 25 minutes, is billed 10x,
hit its limit on every push and went red (run `37230443570`), and 8 of the 9 e2e shards failed on stale specs (below).

Change.
- New `unit` job (`pnpm test:unit`) and `database` job (reuses `schema.yml`: reset from zero, pgTAP, seed and types drift, the
  DATA-06 local half, mutation gate, fences). Ubuntu only.
- The `gate` job also runs `pnpm lint`, `check:legal-claims` and `check:numbers` (they lived only in `pr.yml`).
- `visual` (macOS, screenshot diffs) runs only on a hand-started run with the new `visual` box ticked; 45-minute limit; installs
  Chromium and WebKit.
- `deploy` stays hand-started (`workflow_dispatch` only); it needs gate, unit, database and e2e green, and visual green or skipped.
- Time limits on the gate, unit, schema and `pr.yml` visual jobs so a stuck run cannot bill the 6-hour default.
- `paths-ignore` for docs, planning and `*.md` was already there and stays: a docs-only push runs nothing.

Proof. The workflow files parse and the job graph reads as above (checked by reading). **Not verified:** a real run on GitHub. The
first push to `main` after this lands is the proof; if `database` or `unit` fail there, that is a finding about the code, not about
the wiring (both commands run green locally).

Estimated Actions minutes per push to `main` (billed, private repo):

| | Before | After |
|---|---|---|
| gate | about 4 | about 5 |
| macOS visual | about 270 (25 min x 10, hit the limit) | 0 (manual) |
| unit | 0 | about 4 |
| database (schema.yml) | 0 | about 14 |
| e2e Linux (9 shards, 1 run, retries add) | about 109 | about 109 |
| **Total** | **about 383** | **about 132** (about 23 without the e2e shards) |

A docs-, planning- or markdown-only push: 0. At 3,000 minutes a month for the whole account that is about 22 code pushes a month with
the e2e shards, about 130 without them. The e2e shards are now 83 percent of the cost. Open question 1.

### U20: each stale spec (all re-run locally on a port-shifted native stack, `VAMOS_E2E=1`, `--ignore-snapshots`, one worker)

| Spec | Why it was red | Change | Local result |
|---|---|---|---|
| `integration/checkout-hosted` "...voucher -> PAY... Booked at 390" | Since the 26.2 audit fix `eec7951f` a voucher is re-signed through `/api/quote/reprice` with `coupon`; the fixture never stubbed that route, so the real route refused the fixture lock and no voucher applied | stub signs a lock that carries the coupon | 4 passed |
| `visual/checkout-pay-19` "Have an account? Sign in..." | same; the fixture answered every reprice with 409 | the stub signs when `coupon` is present, 409 otherwise | 10 passed |
| `visual/contact` "screenshot contact en" and "channel tiles ... 44px" | The floating contact button (`6a019ac1`) also carries `data-ch`, so `[data-ch]` counts 4 and the 44px test measured the (collapsed) button at 0 px | scope to `#dc-root a[data-ch]` (the three real channel links), wait for them | 53 passed |
| `visual/about` "van photo is the small file" | `9deff568` took the van photo off About | the 1200 px file is asserted on the home Business travel section; About must not load the 3 MB original | 33 passed |
| `visual/legal-cancellation-imprint` "TOC hashes match section ids" | `3cac1fc5` (owner rule 2026-10-03) hides the unfilled `aufsicht` and `haftung` sections and their TOC links | id list drops both, with a comment saying they return in order when the owner supplies the text | 60 passed (whole spec) |
| `visual/legal-cancellation-imprint` "no sideways scroll at 390" | Red on the Linux runner only (it passes on the Mac); not reproducible here. It measured at `load`, while the mock may still be compiling on a slow runner. If the cause is real overflow on Linux fonts (like `/de/terms`), the new message names the element | waits for the first section, then polls with the widest elements named on a miss (same shape as `legal-terms`) | 60 passed (whole spec, after this change) |
| `visual/home` "live sections appear in the mock order" | Sections are separate `dc-import`s that mount in no fixed order, and Reviews renders only while loading or with enough published reviews (the test database has none); `#svc-t4` now belongs to Business travel (`412ac19b`) | wait for each required section; Reviews optional; hourly card checked by title | 41 passed (one load flake in the 1024 German banner dismissal, 4/4 on re-run) |
| `visual/home-sheet-history-bp2` WebKit rows | WebKit is a separate download the Linux jobs do not install ("Executable doesn't exist") | rows `test.skip` with the reason when WebKit is absent; the macOS visual job installs it | not run here (no WebKit locally) |
| `visual/legal-terms` "no sideways scroll at 390" | **Real product bug**, not stale | `test.fixme` with the measurement and a pointer here | 32 passed, 1 fixme |

## Product bugs (reported, not fixed)

### 1. `/de/terms` scrolls sideways on phones (real)

Where: `app/pages/terms.dc.html`, section 10 "Changes & cancellation" (line 307): the primary design-system `Button`
"Cancellation & refund policy" (the German label, "Stornierung & Rückerstattung") is single-line (nowrap pill). In German it is
338 px wide on the Mac and about 17 px wider on the Linux runner, inside a card that is narrower than the phone.

Evidence (`.planning/quick/261005-checks-and-tests/evidence/`):
- `de-terms-360-button-past-edge.png`: at 360 px the yellow button sticks out of its dark card and crosses the red line (the screen
  edge); the page is 379 px wide and scrolls sideways.
- `de-terms-390-button-near-edge.png`: at 390 px on the Mac the button still sticks out of its card but ends just inside the screen
  (red line), so the page fits (390) and the spec passes on the Mac; on the Linux runner the page was 396 px wide at 390 (CI run
  `37230443570`, the 6th failure of the 390 job).

Affects: every phone narrower than about 380 px (iPhone SE, mini sizes) and 390 px phones on fonts that render wider. Four-language
law (CLAUDE.md "Build every surface desktop to mobile"): "nothing may scroll sideways at 390 px" is broken.
Not changed here (product code). A fix is a label that may wrap, or the button at full card width; that is the controller's choice.
When it lands, delete the `test.fixme` line in `legal-terms.spec.ts` (its comment says so).

### 2. "Voucher applied" never shows at 390 in the checkout funnel (not a product bug)

Cause: the spec fixture, not the page. Since `eec7951f` the page re-signs the voucher lock through `/api/quote/reprice`; the fixture's
lock is not signed by the real route, so the real route refused it and "voucher applied" could not appear. With the route stubbed to
sign a lock that carries the coupon, the funnel at 390 shows `[data-co-voucher-applied]` and passes (`checkout-hosted` 4 passed,
`checkout-pay-19` 10 passed); `voucher-lock` and `voucher-badge` unit tests, 15 passed. No picture: there is no defect to show.
**Not verified:** a real voucher through the real route in a browser. That is the lab click-through
(`scripts/test-lab/lab.sh up`, then the checkout browser run); I did not build the Worker for it. Suggest the controller includes one
voucher in the next money-path run.

## U22: database-backed tests

Cause. The 15 `apps/web/**/*.local.test.ts` files and `packages/db/test/local` skip without `VAMOS_LOCAL_DB_PORT`, so the money paths
(refund by hand, settle, class change, trip change, assign, Stripe fee, customer paths) ran by hand only. `refund-by-hand.local.test.ts`
used the fixed Stripe refund id `re_retry` (the column is unique and rows are committed), so a second run on one database failed at the retry step.

Change. `pnpm test:db-lab` = `scripts/test-lab/lab.sh dbtests [name] [--keep]`: makes a stack-only lab (native, no Docker, no Worker, no build),
resets it to the repository seed, sets the role passwords and marker, runs `packages/db test/local` and every web `*.local.test.ts` one file at a time
(each makes its own live price book; `rate_versions_one_live` allows one), and destroys the lab it made. A skipped test counts as FAIL. It finds
a native-capable Supabase CLI even though pnpm puts the pinned 2.115 first on PATH. Documented in `docs/runbook/test-lab.md` ("Database-backed
tests") and in the README. `refund-by-hand.local.test.ts` now uses `re_retry_${tag}` with the run's random tag.

Found when merging `origin/main` (new `lib/db/rest-grants.local.test.ts` from the money job): that file reads the lab's stand-in price book
("seeded with seed-live-like.sql" in its header) and failed 2 tests on a repository-seed database, which has no live book. The command now
applies `seed-live-like.sql` and runs the files that name it first, then every other file (they retire whatever live book they find).
A second finding in the same run: `booking-change.local.test.ts` timed out at vitest's 5 s default on a busy Mac, so the web passes run
with `--testTimeout=60000`.

Proof. Run on the merged tree (this branch plus `origin/main` `5aa3ddd0`): first run FAIL (2, the seed above), second FAIL (1, the 5 s
timeout), third, after both fixes: `PASS | dbtests | packages/db test/local: Tests 72 passed (72) | apps/web .local.test.ts: Tests 4 passed (4)
(seeded files) + Tests 31 passed (31)`, then `PASS | destroy | ... stack (native) and state removed`. About 2.5 minutes. Before the merge the
same command gave 72 + 31 passed.

## S16: dependency audit

- `packages/db/package.json`: `undici` `8.10.0` -> `8.11.2`. The Dependabot alerts read the manifest pin; the lockfile already resolved 8.11.2 through the workspace override.
- `braces`: no release at or above 3.0.4 exists on npm, so a `^3.0.4` override fails to resolve. The advisory (GHSA-vfj7-8cjw-p6xm) is dev-only through stylelint. It is listed under `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml` with the reason written next to it, so `pnpm audit` shows 0 un-ignored. Open question 2.
- `pnpm install --frozen-lockfile` is clean (lockfile unchanged by the pin).

## D3: deploy script

Cause. `pnpm --filter web run deploy` with no `--env` uploaded the empty top-level Worker `vamos-web` next to the live one (2026-10-01):
in `wrangler.jsonc` the top-level config is an empty shell; `env.staging` is the live Worker `vamos`.
Change. `apps/web` `deploy` now runs `scripts/deploy-worker.mjs`, which refuses (exit 2, before the DC sync and the build) unless exactly one
`--env staging` is given (`--env=staging` and `-e staging` also read); anything else, including `production`, a missing, doubled or flag-like value, is refused. It keeps the argument form every live
deploy has used (`opennextjs-cloudflare deploy -- --env staging`). Why not "default to staging": a bare call that quietly deploys the live site is
the wrong default; refusing forces the one explicit word. `scripts/deploy-worker.test.mjs` covers the parser (`pnpm test:scripts`, 37 pass).
The README describes the controller's deploy; it carries no runnable deploy line.

## D4: `apps/web/.dev.vars.example`

30 empty `NAME=` lines grouped by area (secrets, vars, the contact-form names read outside `env.d.ts`), one comment each; the wrangler bindings
as comments (setting them would shadow the binding; `READ_RATE_LIMITER`, added by main's S12, included after the merge); a "Not for this file" section for build-time and test-only names. Names only, no value was
read from `.dev.vars` or any `.env`, nothing copied.

## Checks run (final tree)

| Check | Result |
|---|---|
| `pnpm typecheck` | pass (4 projects) |
| `pnpm lint` | 0 errors, 6 old warnings (unused disable directives, not mine) |
| `pnpm check:numbers` | ok |
| `pnpm test:scripts` | 37 pass (before the last spec edits; no script changed since) |
| `pnpm audit` | 0 un-ignored (braces ignored with the reason) |
| `pnpm test:db-lab` (merged tree) | PASS, 72 + 4 + 31, lab destroyed |
| voucher unit tests (`voucher-lock`, `voucher-badge`) | 15 pass |
| the e2e and visual specs listed above | pass, one worker, own stack (stopped and its data deleted afterwards) |

Not run, on purpose: full `pnpm test:unit`, the build, the macOS visual job, anything on GitHub.

## Cleanup done

My local Supabase stack (`vamos-taxi-cat`) stopped and its data deleted; `apps/web/.next*` and `apps/web/test-results` removed;
`apps/web/next-env.d.ts` and `apps/web/tsconfig.json` (rewritten by `next dev`) reverted; the Playwright cache link I made removed;
the throwaway DB lab destroyed by the command itself. The worktree `apps/web/public/app` and `assets` copies are gitignored.

## Open questions for the controller and the owner

1. The nine Linux e2e shards are now 109 of about 132 billed minutes per code push. Keep them on every push, or make them hand-started like the visual job and run before a ship?
2. `braces` has no patched release. Keep the audit-ignore (dev-only, via stylelint), or replace stylelint's glob dependency?
3. `/de/terms` button: wrap the label, or full card width? (Product decision; the fixme waits for it.)
4. `scripts/test-lab` runs on this Mac with the Homebrew CLI (2.119); the pinned `pnpm exec supabase` is 2.115 and cannot run natively. Bump the pin?
