# Hand-over — Actions concurrency (the minutes problem is closed)

**From:** job session `vamostaxi-eu-bb`, branch `ci/trim-actions-minutes`, cut from `origin/main`.

## What happened, in order

1. The repo went private on 2026-10-01, so Actions started billing. The allowance is 3,000
   minutes a month, **shared across all nine private repos**.
2. Five account budgets existed at **$0 with "Stop usage: Yes"**, so every job was hard-blocked
   at zero spend. Jobs "failed" in 3–6 seconds — that is billing, not a broken workflow.
3. Measured cost while private: the `visual` job runs on `macos-latest`, which **bills at 10x**,
   and ran 26 minutes on 09-30 = **260 billed minutes for one push to main**. `e2e-linux` is
   9 jobs × 30-minute cap = up to 270 more. One code push to main cost **400–540 billed minutes**.
4. **The owner made the repo public on 2026-10-02** rather than keep a budget. Public repos get
   unlimited free minutes, so the cost problem is gone. Confirmed: a re-run of `schema.yml` ran
   for more than ten minutes instead of dying in three seconds.

## What this branch now contains

Only the part that is worth keeping when minutes are free — **concurrency**:

- `deploy-staging.yml`: a push-triggered run deploys nothing (the `deploy` job is
  `workflow_dispatch` only), so a superseded one is a duplicate and is now cancelled, per ref.
  The hand-started deploy keeps its old uncancellable group, so T-01-07 still holds.
- `e2e-linux.yml`: a superseded `ci/**` push cancels its nine jobs. Runs called from `pr.yml`
  or before a deploy are never cancelled.

**Dropped on purpose:** the earlier version of this branch also stopped `visual` and `e2e-linux`
running on a push to main, and made them opt-in on a deploy. That was a cost measure only. The
repo is public, so it was removed and main keeps its full coverage.

## For the owner, when he has a moment (no action today)

The repo being public publishes the planning material: **2,670 tracked files**, the live Supabase
project ref in **158** of them, and — the one that matters — the board's
"Known on live, not fixed yet" section and the Phase 20 security audit. That is a current, written
map of where the live site is weak.

Checked and clear: **no credential was ever committed** (only the `sk_live_`/`sk_test_` patterns,
inside the guards that refuse them), no `pull_request_target`, and no secret reachable by a
stranger's pull request. So there is nothing to rotate.

Also: a **self-hosted runner must never be attached to a public repo** — any fork's pull request
could run code on the owner's Mac. That idea is off the table while the repo is public.

## Not verified

Actions could not be exercised against this branch while it was blocked; the files were reviewed
by hand (no YAML parser or `actionlint` on this Mac). Watch the first run after it lands.
