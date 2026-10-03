---
quick_id: 261003-lxr
slug: test-lab-and-sonnet-tester
branch: feat/test-lab
worktree: .claude/worktrees/test-lab
planner: Opus 5.5 (lead session)
executor: Sonnet 5.5 (gsd-executor)
date: 2026-10-03
---

# Test lab: one command for a local test copy of the site, and a Sonnet tester that follows an Opus brief

## Why

Every job rebuilt the same browser-test setup by hand: a port-shifted Supabase stack, a price book
you can book on, a built Worker whose `worker.js` gets a fetch rewrite to local stand-ins for
Stripe / Mapbox / Turnstile / Resend, free ports, and a Playwright script written from zero (copies
live in `.planning/quick/261001-van-luxury-12/evidence/`, `261002-booking-pages-polish/tools/`,
`261003-audit-voucher-proof/evidence/`). An Opus session spent most of its tokens on that. The owner
(2026-10-03): testing must be cheap, Sonnet runs it, following a clean instruction Opus writes.

Outcome: `scripts/test-lab/lab.sh up <name>` gives a working local site in one command; a small
helper library makes a browser check about 20 lines; a project agent `vamos-tester` (model sonnet)
runs a `TEST-BRIEF.md` and writes `RESULT.md`. Opus only writes the brief and reads the result.

## Files (exact; nothing else changes)

| File | New/changed |
|---|---|
| `scripts/test-lab/lab.sh` | new |
| `scripts/test-lab/seed-live-like.sql` | new |
| `scripts/test-lab/lab-browser.mjs` | new |
| `scripts/test-lab/example-booking.mjs` | new (self-test and model for step scripts) |
| `.claude/agents/vamos-tester.md` | new |
| `.planning/templates/TEST-BRIEF.md` | new |
| `docs/runbook/test-lab.md` | new |
| `.planning/quick/261003-lxr-test-lab-and-sonnet-tester/SUMMARY.md` | new |

Reuse, do not copy or edit: `apps/web/tests/e2e-worker/fakes.mjs` (already stands in for all four
outside services: Stripe sessions/refunds, Turnstile, Mapbox suggest/retrieve/directions, Resend,
plus `/__stats`, `/__sessions`, `/__mails`), `apps/web/tests/e2e-worker/mkcfg.mjs` (mode `p6`
writes `wrangler.e2e.jsonc` and `.dev.vars` with every stand-in key). Read
`apps/web/tests/e2e-worker/p6-run.sh` first: `lab.sh` is its general form (same PID handling,
same port refusal, same fetch-rewrite string with marker `E2E_FETCH_PATCH P6`, so a tree patched by
either one is not patched twice).

## Hard rules for the executor

- Never touch another stack: never use ports 54320-54329, never `supabase stop` / `db reset` a
  workdir you did not create. Before any start/reset, check `<workdir>/supabase` symlinks point
  into the current tree.
- Never kill by port or by pattern. Stop only PIDs the lab recorded, with their child trees
  (`pgrep -P`), exactly like `kill_tree` in `p6-run.sh`.
- A listening port the lab wants is a stop (`FAIL | lab | port N busy`), never taken over.
- Only the build output `apps/web/.open-next/worker.js` is patched, never source.
- No secret is printed. Local stack keys go to files under the lab state dir, mode 600.
- No real price, ever: the seed's rates are 1-3 rappen stand-ins on a local copy, labelled as such.
- Supabase ports stay at or below 65535.
- Long commands: tail output (`| tail -20`); a single tool call must finish inside 10 minutes,
  so `lab.sh up` prints progress and the build step can be skipped when the build is current.
- Commit per task. Run only the tests you touched; the lead runs the full gates once at the end.

## Task 1 — `scripts/test-lab/lab.sh`

Bash, `set -u`, zsh-safe when called from zsh. Repo tree = `git rev-parse --show-toplevel` of the
current directory (so each worktree tests its own code). State dir
`${VAMOS_LAB_HOME:-$HOME/.vamos-scratch}/lab-<name>/` holding `lab.env` (ports, container, URLs),
`pids`, `sb/supabase/` (the stack workdir), `hook-secret` (600), `sb.env` (600), `admin.txt` (600),
`logs/`. `<name>` must match `^[a-z0-9-]{1,24}$`.

Ports: slot `n` in 1..9 (`LAB_SLOT`, default: first slot whose ports are all free and whose
state dir is not owned by another lab name). Supabase block `45n20`-`45n29` (shadow 45n20, api
45n21, db 45n22, studio 45n23, inbucket/smtp 45n24, analytics 45n27, pooler 45n29) and inspector
`83n3`; Worker public `47n0`, dashboard `47n1`, fakes `47n7`, inspectors `97n1`, `97n2`.

Subcommands:

1. `up <name> [--rebuild] [--no-dash]`
   - Make the stack workdir if missing: copy `packages/db/supabase/config.toml`, set
     `project_id = "vamos-lab-<name>"`, shift every port above, add
     `"http://localhost:<public>/**"` to `additional_redirect_urls`, append the
     `[auth.hook.send_email]` block of `docs/runbook/auth-worker-e2e.md` step 1 pointing at
     `http://host.docker.internal:<public>/api/auth/email-hook` with a freshly made secret
     (`v1,whsec_` + 32 random bytes base64). Symlink `migrations`, `tests`, `seed.sql`.
   - `pnpm exec supabase start --workdir <sb>` (pinned CLI) if not running; then
     `supabase status -o env` into `sb.env`.
   - First start only (marker table or file): run `seed-live-like.sql` through
     `docker exec -i supabase_db_vamos-lab-<name> psql -U postgres -v ON_ERROR_STOP=1`.
   - Set the passwords `mkcfg.mjs` expects for `vamos_public` / `vamos_edge`, and re-add the
     `vamos_throwaway_test_stack` marker role if the repo's local tests need it (grep for it).
   - Create the dashboard admin once: admin users API with `lab-admin@vamos.local` and a random
     password stored in `admin.txt`, plus the `insert into public.staff (… 'admin' …)` the existing
     e2e files use (grep `insert into public.staff` under `apps/web/tests` and `.planning/quick`).
   - `node scripts/sync-dc-mock-to-public.mjs`; build with
     `pnpm --filter web exec opennextjs-cloudflare build` when `--rebuild` or when
     `apps/web/.open-next/worker.js` is missing or older than the newest commit/working-tree change
     under `apps/web` and `app/`. Print which.
   - Patch `worker.js` with the P6 fetch rewrite (port = fakes port) unless the marker is present
     for the same port; if present for another port, say so and require `--rebuild`.
   - `node apps/web/tests/e2e-worker/mkcfg.mjs apps/web <sb.env> <hook-secret> p6` with
     `SB_API_PORT`/`SB_DB_PORT`.
   - Start fakes (`E2E_FAKE_PORT`), public Worker, dashboard Worker (`--var VAMOS_SURFACE:auto`),
     `--persist-to .wrangler/lab-<name>[-dash]`, logs into `logs/`, PIDs into `pids`.
   - Wait for `/api/auth/session` on both and `/__stats` on fakes (max 120 s), else FAIL with log
     paths and stop what it started.
   - Last line: `up | public http://localhost:47n0 | dashboard http://dashboard.localhost:47n1 | fakes http://127.0.0.1:47n7 | db supabase_db_vamos-lab-<name> | state <dir>`.
2. `status <name>`: ports, which PIDs live, stack running or not.
3. `env <name>`: prints `export` lines (LAB_BASE, LAB_DASH, LAB_FAKE, LAB_DB_CONTAINER,
   LAB_STATE, LAB_ADMIN_FILE, WEB_DIR) for `eval`. No keys.
4. `reseed <name>`: `supabase db reset --workdir <sb>` (own workdir only, after the symlink check),
   then the same seed/passwords/admin steps.
5. `down <name>`: stop the recorded PIDs and trees; remove `apps/web/.dev.vars` and
   `apps/web/wrangler.e2e.jsonc` only if this lab wrote them (compare a hash kept in state).
6. `destroy <name>`: `down`, then `supabase stop --no-backup --workdir <sb>`, then delete the
   state dir. Refuses if the symlinks point into another tree.
7. `gates [base]`: cheap gates for the change against `base` (default
   `$(git merge-base HEAD origin/main)`): `pnpm -s typecheck`; `pnpm exec eslint` on changed
   `.ts/.tsx/.js/.mjs` files; `pnpm -s i18n:check`; `pnpm -s check:numbers`;
   `pnpm -s check:db-fences`; `pnpm -s check:legal-claims`; then `vitest related --run` per
   package for its changed source files (apps/web after `node scripts/sync-dc-mock-to-public.mjs`;
   `*.local.test.ts` excluded: they need a database). One line per gate:
   `PASS | gate | detail` / `FAIL | gate | first lines`. Exit 1 if any FAIL.

Every line the script prints that is a result uses `PASS | … | …`, `FAIL | … | …` or `up | …`.

## Task 2 — `scripts/test-lab/seed-live-like.sql`

Turns the local seed's draft price book into one you can book on, on the lab copy only. Read
`packages/db/supabase/seed.sql`, the migrations for `vehicle_classes`, `rate_versions`,
`distance_rates`, `surcharges`, `settings`, `coupons`, and the memory recipe in
`docs/runbook/test-lab.md` (Task 4) / `apps/web/tests/e2e-worker/checkout-common.mjs`
`ensureFixture`. Required end state:

- The three classes named Economy / Business / Van luxury with live seat counts (3/3/12 per the
  Van luxury 12 job; read them from the migrations, do not guess).
- One rate version `status='live'` with every class priced by `distance_rates` at 1-3 rappen,
  labelled `lab stand-in, not a price`; surcharges inactive; `settings.public_chf = true`.
- Two coupons for voucher checks, codes `LABFIX` (fixed) and `LABPCT` (percent), active, with
  stand-in values, labelled as lab rows.
- A comment header saying: local lab copy only, never live, amounts are stand-ins.
- Idempotent (safe to run twice).

## Task 3 — `scripts/test-lab/lab-browser.mjs` and `example-booking.mjs`

ES module, Playwright from `apps/web` (`createRequire(WEB_DIR + "/package.json")("@playwright/test")`),
reads `lab env` variables. Exports, each with a one-line doc comment:

- `start({ evidenceDir })` → browser; `finish()` writes `results.json`, closes, exits 1 on any FAIL.
- `open({ viewport = 1440 | 1024 | 768 | 390, lang = "en", name })` → `{ page, ctx, shot(label), apiLog, errors }`:
  own `cf-connecting-ip` per context (rate limits), `/api/fx` answered locally, `checkout.stripe.com`
  aborted, `/api/checkout/intent` answer captured before the page leaves, page errors collected,
  language set through `localStorage.vamosLang` before load (never read elsewhere).
- `dismissCookies(page)`; `bookFromHome(s, { from = "Zurich Airport", to = "Zug", day = 10, pax })`
  with the selectors of `.planning/quick/261003-audit-voucher-proof/evidence/voucher-proof.mjs`
  `homeToCheckout`, phone/tablet sheet included (`button[data-bb]` opens `[data-bs]`);
  `chooseClass(s, re)`; `fillTraveller(s, {...})`; `applyVoucher(s, code)`; `pressPay(s)` → the
  captured intent answer; `dashboardSignIn(s)` using `admin.txt`.
- `step(id, title, fn)`: runs one numbered brief step, prints `PASS | <id> | <evidence>` or
  `FAIL | <id> | <error first line>`, screenshot `<id>.png` on FAIL and on PASS when asked;
  a failed step does not stop later independent steps.
- `db(sql)` read-only helper through `docker exec … psql -At` (select only; refuse other verbs).
- `fakes(path)` → JSON from the fakes server (`/__sessions`, `/__mails`, `/__stats`).
- `coverage(page)` → `VamosLocale.coverage(document.body)` result (`{count, strings}`).

`example-booking.mjs`: the model step script: steps S1 home → /checkout at 1440 (en), S2 Economy
chosen, S3 traveller filled, S4 PAY creates one fake Stripe session whose amount equals the shown
total, S5 same flow at 390, S6 German labels (coverage count 0 on /checkout), S7 `LABFIX` voucher
lowers the total and the fake session amount matches. Under 120 lines.

## Task 4 — the tester agent, the brief template, the runbook

`.claude/agents/vamos-tester.md` frontmatter: `name: vamos-tester`, `description:` (runs a Vamos
TEST-BRIEF exactly and reports; never edits product code), `model: sonnet`,
`tools: Read, Write, Bash, Grep, Glob`. Body, imperative, short:

1. Read only the brief and the files it names. Do not explore the repo.
2. Work in the brief's worktree. Write only inside the brief's evidence folder.
3. `scripts/test-lab/lab.sh up <lab>` (name from the brief), then `eval "$(lab.sh env <lab>)"`.
4. Run exactly the gates the brief lists (`lab.sh gates` unless it says otherwise).
5. Write one step script in the evidence folder using `lab-browser.mjs` (model:
   `example-booking.mjs`); one `step()` per numbered brief step; run it in sections if long.
6. Never change product code, tests or the brief; never weaken an expected result; never retry a
   FAIL more than once (a retry only for a runtime drop: "Network connection lost" / Worker gone,
   after `lab.sh down`/`up`).
7. If the lab cannot come up or a step cannot be run as written, stop and report BLOCKED with the
   exact line, instead of improvising.
8. No live site, no live database, no deploy, no push, no `git` writes other than nothing; no
   browser other than headless Chromium.
9. `lab.sh down <lab>` at the end (`destroy` only if the brief says).
10. Write `RESULT.md` in the evidence folder: header (brief, commit tested, lab, clock time),
    table `step | PASS/FAIL/BLOCKED | evidence (one line) | screenshot`, then three lists
    (verified, not verified, failed). Reply with that file's content only.

`.planning/templates/TEST-BRIEF.md`: front matter (worktree, branch, commit, lab name, evidence
folder) and sections: What changed (one paragraph, files); Gates (default `lab.sh gates`); Setup
beyond the lab (extra SQL for the lab copy only, if any); Steps (numbered table: id, viewport,
language, action in plain words, expected result that can be checked: text, amount equality,
DB row by select, fake Stripe session, screenshot); Out of scope; Stop conditions.

`docs/runbook/test-lab.md`: what the lab is; the commands; ports and state dir; for the lead
session (Opus): write the brief from the template, then
`Agent(subagent_type: "vamos-tester", model: "sonnet", prompt: "Run the brief at <path>")`,
read `RESULT.md` and decide; it is never proof for the live site (a 4242 payment after deploy
still is); the gotchas from earlier jobs (Mac sleep kills wrangler, runtime drops under load,
dashboard quote limit 4 a minute so space dashboard quotes ~61 s, quote with no class has no
`quote_id`, `?v=N` on DC runtime URLs, `VamosLocale.coverage` returns `{count, strings}`).

## Verification (the lead runs this, not the executor)

1. `lab.sh up lxr` from this worktree on a free slot; `status`; `env`.
2. `node scripts/test-lab/example-booking.mjs` → S1-S7 PASS, evidence written.
3. `lab.sh gates` on this branch → all PASS.
4. A real `vamos-tester` run (Sonnet) on a sample brief → `RESULT.md` with every step accounted for.
5. `lab.sh down lxr`, then `destroy lxr`; `docker ps` shows no `vamos-lab-lxr` container; no
   other session's process or stack touched (`lsof` before/after on other known ports).
