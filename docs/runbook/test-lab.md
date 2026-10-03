# Test lab

A local copy of the site for browser checks: its own Supabase stack (port-shifted), a built Worker (public and dashboard hosts), and local
stand-ins for Stripe, Mapbox, Turnstile and Resend. One command brings it up from the current worktree, so each worktree tests its own code.
It is the general form of `apps/web/tests/e2e-worker/p6-run.sh`. Local only: never live, never a hosted database, no real price (the seed's
amounts are 1-3 rappen stand-ins).

## Commands

Run from any worktree. `<name>` matches `^[a-z0-9-]{1,24}$`.

| Command | What it does |
|---|---|
| `scripts/test-lab/lab.sh up <name> [--rebuild] [--no-dash]` | Makes the stack workdir if missing, starts the stack, seeds it (`seed-live-like.sql`), sets the `vamos_public` / `vamos_edge` passwords and the marker role, makes the dashboard admin, syncs the DC mocks, builds the Worker when needed (prints why), patches `worker.js`, starts the fakes and both Workers. Last line: `up | public ... | dashboard ... | fakes ... | db ... | state ...` |
| `lab.sh status <name>` | Ports, PIDs alive, stack running, two HTTP probes |
| `lab.sh env <name>` | `export` lines for `eval`: `LAB_BASE`, `LAB_DASH`, `LAB_FAKE`, `LAB_DB_CONTAINER`, `LAB_STATE`, `LAB_ADMIN_FILE`, `WEB_DIR`. No keys |
| `lab.sh reseed <name>` | `supabase db reset` on the lab's own stack, then the seed, passwords and admin again. Restart the Workers afterwards: `lab.sh up <name>` |
| `lab.sh down <name>` | Stops the recorded PIDs and their process trees; removes `apps/web/.dev.vars` and `wrangler.e2e.jsonc` only if this lab wrote them. The stack keeps running |
| `lab.sh destroy <name>` | `down`, then `supabase stop --no-backup` on the lab's stack, then deletes the state dir |
| `lab.sh gates [base]` | Cheap gates for the change against `base` (default merge-base with `origin/main`): typecheck, eslint on changed files, `i18n:check`, `check:numbers`, `check:db-fences`, `check:legal-claims`, `vitest related` per package (without `*.local.test.ts`). One `PASS | gate | detail` or `FAIL | gate | first lines` per gate; exit 1 on any FAIL |

The build is the slow part (several minutes). `up` skips it when `apps/web/.open-next/worker.js` is newer than every tracked or untracked file under
`apps/web`, `app` and `packages`. Run a first build in its own tool call if you must stay under 10 minutes per call:
`pnpm --filter web exec opennextjs-cloudflare build 2>&1 | tail -20`, then `lab.sh up`.

## Runtime: Docker or native (no Docker)

`LAB_RUNTIME=auto|docker|native scripts/test-lab/lab.sh up <name>`. `auto` (the default) uses Docker when its daemon
answers, otherwise native. A lab keeps the runtime it was made with; to switch, `destroy` it and make a new one.

- **docker**: the repo's pinned CLI (`pnpm exec supabase`, 2.115.0) starts one container per service.
- **native**: Supabase CLI 2.118+ runs a managed stack as plain processes on macOS arm64 or Linux: no Docker or
  Podman. It needs the CLI on PATH (`brew upgrade supabase`; `SUPABASE_NATIVE_CLI` to point elsewhere), because the
  pinned 2.115 predates it. The lab turns it on in its own copy of `config.toml` (`[experimental] stack = true`) and
  starts it with `--runtime native --eager` (eager: services stay up instead of stopping when idle). SQL runs through
  the stack's own `psql` (`LAB_PSQL`, `LAB_DB_URL` from `lab.sh env`); `db()` in `lab-browser.mjs` follows. The
  sign-in hook goes to `127.0.0.1` instead of Docker's host name. `destroy` stops the stack and deletes only the
  stack folders under `~/.supabase/stacks/` whose recorded project root is the lab's own workdir.
- Checked 2026-10-03 with CLI 2.119.0 while Docker Desktop was down: all migrations, the seed, `db reset` and the full
  pgTAP suite (99 files, 2653 tests) pass natively.

`lab.sh pgtap <name>` runs the whole pgTAP suite on the lab's stack (either runtime). The suite needs a clean database
(it makes its own live price book) and the two login roles without passwords, so it resets the stack, runs, then puts
the lab's seed, role passwords and admin back. Bookings made in the lab before are gone after it.

## Ports and state

State dir `${VAMOS_LAB_HOME:-$HOME/.vamos-scratch}/lab-<name>/`: `lab.env` (ports, container, URLs), `pids`, `sb/supabase/` (stack workdir, symlinks into this tree),
`hook-secret`, `sb.env`, `admin.txt` (all mode 600), `logs/` (`public.log`, `dashboard.log`, `fakes.log`, `build.log`, `supabase-start.log`).

Slot `n` in 1..9 (`LAB_SLOT=<n>` to choose; default the first slot whose ports are all free and not held by another lab):

| What | Port |
|---|---|
| Supabase shadow / api / db / studio / smtp / analytics / pooler | 45n20 / 45n21 / 45n22 / 45n23 / 45n24 / 45n27 / 45n29 |
| Supabase edge inspector | 83n3 |
| Worker public / dashboard / fakes | 47n0 / 47n1 / 47n7 |
| Worker inspectors | 97n1, 97n2 |

Slot 1: public `http://localhost:4710`, dashboard `http://dashboard.localhost:4711`, fakes `http://127.0.0.1:4717`, container `supabase_db_vamos-lab-<name>`.
Never 54320-54329 (other sessions' stacks). A busy port is a stop (`FAIL | lab | port N busy`), never taken over. The lab never kills by port or pattern: only the PIDs it recorded.
Two labs of one tree cannot run together (they share `apps/web/.dev.vars` and `wrangler.e2e.jsonc`); `up` says so.

## What the seed gives you

`scripts/test-lab/seed-live-like.sql`: classes Economy / Business / Van luxury (3 / 3 / 12 seats), one live rate version `lab-live` at 1-3 rappen
(fare, airport start, city) labelled "lab stand-in, not a price", surcharges inactive, `public_chf` on, a policy version `lab-policy`, vouchers
`LABFIX` (10 rappen off) and `LABPCT` (20 percent), dashboard admin `lab-admin@vamos.local` (password in `admin.txt`).
A live rate version is immutable: a change to the seed's numbers reaches an existing lab only through `lab.sh reseed`.

## For the lead session (Opus)

1. Write the brief from `.planning/templates/TEST-BRIEF.md` into the job's evidence folder. Numbered steps, each with a checkable expected result.
2. Run it: `Agent(subagent_type: "vamos-tester", model: "sonnet", prompt: "Run the brief at <path>")`.
3. Read the tester's reply (steps, gate lines, verified / not verified / failed), save it as `RESULT.md` in the evidence folder next to its `results.json` and screenshots, and decide. A subagent may not write report files itself.
4. `lab.sh destroy <name>` when the job is done (the tester only runs `down`).

The tester follows `.claude/agents/vamos-tester.md`: it brings the lab up, runs the gates, writes a step script with `scripts/test-lab/lab-browser.mjs`
(model: `example-booking.mjs`), never edits product code and reports BLOCKED instead of improvising.
A green lab is never proof for the live site: after a deploy that touches checkout, one 4242 payment on the live site and a read of `booking_payments` still is.

`example-booking.mjs` is the lab's self-test: `eval "$(scripts/test-lab/lab.sh env <name>)" && node scripts/test-lab/example-booking.mjs` must print S1-S7 PASS.

## Gotchas from earlier jobs

- A Mac sleep kills wrangler. After a sleep: `lab.sh down <name>`, `lab.sh up <name>`.
- Under load a Worker can drop ("Network connection lost", a refused port). `down`, `up`, rerun only the steps that were cut. Several sessions share this Mac.
- The lab runs like live: no `VAMOS_QS_SECRET`, so every visitor is on the bare per-IP quote bucket (live has none, read-only check 2026-10-03).
  A flow that asks for many prices in a minute (home -> /checkout -> voucher -> PAY) can hit 429 there exactly as on live; that is a finding, not a lab fault.
  `LAB_QS_SECRET=1 lab.sh up <name>` adds a local secret only when the change under test also sets it on live. Dashboard quotes: space them about 61 s apart.
  `lab-browser.mjs` gives each page its own `cf-connecting-ip`.
- A quote with no class chosen has no `quote_id`; the lock and the id come with the class.
- An airport pickup needs `distance_rates.airport_start_rappen`; without it the quote answers `partially_priced_class` (500).
- On the phone/tablet sheet an airport pickup requires a flight number before See prices works.
- DC runtime URLs carry `?v=N`; a cached older runtime shows old behaviour: use a fresh browser context (the helpers do).
- `VamosLocale.coverage(node)` returns `{count, strings}`. `VamosLocale` exists on DC mock pages (home, legal), not on `/checkout` (a Next page): check `/checkout` in German by
  the header language menu (`pickLang`) and by text, and run `coverage` on the home booking widget (`#book`). On a whole page it also lists German strings that arrive from the server.
- `/de/checkout` is 308'd to `/checkout`; German comes from the language store (`localStorage.vamosLang`, written only by `open({ lang })`, never read elsewhere).
- `vitest related` cannot see tests that read `.dc.html` mocks or `app/*.js` by file path: the brief names those tests.
- Stripe's hosted page is fake: `checkout.stripe.com` is aborted and the `/api/checkout/intent` answer is read before the page leaves.
- A screenshot taken after PAY is blank: the page leaves for the fake Stripe URL, which the lab blocks. Check PAY by the captured intent answer and `/__sessions`, and take the picture before pressing PAY.
