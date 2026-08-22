# Session handoff — Vamos Taxi

Paste the block below as the first message of a new session.

---

Continue the Vamos Taxi V1 build. You are the orchestrator: delegate execution to
subagents, pick the model tier per task, and run independent work in parallel.
Read `.planning/STATE.md`, `.planning/ROADMAP.md` and `CLAUDE.md` first.

## Where things stand

**Phase 1 is complete and verified.** All 14 plans landed with SUMMARYs, the gates
ran, and `01-VERIFICATION.md` records the verdict: **PASS_WITH_GAPS**. Read that
file before anything else — it carries the deviations and the one real gap.

**Phase 2 (Data Schema, RLS & Staff Auth Foundations) is next and needs planning.**
Research for Phases 2–4 is already drafted under `.planning/phases/0{2,3,4}-*/`.

**Branches — read this before any git command.**

| Branch | State |
|---|---|
| `docs/phase-2-4-research` | **Authoritative. Work here.** Everything is on it. |
| `main` | Behind — lacks 01-14 and every fix since. Ahead of `origin/main` by ~17. |
| `feat/phase1-closeout` | Separate worktree at `../VamosTaxi.eu-phase1`. Leave alone. |

Nothing has ever been pushed to `origin`. Do not switch, merge, rebase, reset or
push without asking the owner first — the branch topology is genuinely confusing
and `main` looks authoritative but is not.

## The one real gap: CI/CD has never worked end to end

Not a Phase 2 blocker — it blocks launch (Phase 10/11). Details in
`01-VERIFICATION.md`. In short: exactly one GitHub Actions run exists in the repo's
history and it failed at the visual gate; all 369 screenshot baselines are
`-darwin.png` while runners are `ubuntu-latest`, so the gate cannot pass; the repo
has zero Actions secrets, so the Cloudflare steps would fail anyway; and the
post-deploy smoke steps curl `staging.vamostaxi.eu`, which NXDOMAINs. Every deploy
so far has been manual from the workstation.

One open defect, deliberately not fixed: `tests/integration/lenis.spec.ts:130`
(`prefers-reduced-motion`) fails deterministically. It was probed directly — the
product behaviour is correct in steady state; the provider boots and tears down one
transient Lenis instance and the assertion reads inside that window. It is a test
defect. Logged in `WINDOWS.md`.

## Ground truth the plan files predate

The plans were written before the infrastructure existed. Where a plan contradicts
this list, this list wins — and the deviation gets recorded in the SUMMARY.

1. **Cloudflare account is fresh and project-exclusive**: id
   `e64b47deef83692806ab23279d53633e` (koussayzayeni@gmail.com). Workers Paid is on.
   Nothing from any other account is used or referenced. Note the Cloudflare **MCP
   tool is authenticated to a different, older account** — do not trust it for this
   project's state; use `pnpm exec wrangler` instead.
2. **Staging is `https://vamos-web-staging.koussayzayeni.workers.dev`** and is
   current with HEAD. There is no `vamostaxi.eu` zone on this account. Every plan
   line that curls `https://staging.vamostaxi.eu` is stale. The owner chose to stay
   off the real domain until the Phase 11 cutover, so the live Freshpage site keeps
   serving `vamostaxi.eu` untouched. Do not provision a zone.
3. **Provisioned resources**, per environment:
   - KV `geo-cache-staging` (`48cd800d63e44c03aa1f49be83d39d7a`),
     `geo-cache-production` (`a11bc8c7d13d4eeb9c2dad091e978dcb`)
   - R2 `vamos-photos-staging`, `vamos-photos-production` (EU jurisdiction)
   - Queues `vamos-stripe-events-staging`, `vamos-stripe-events-production`
   - Cron trigger `0 3 * * *` on both environments
   Named environments do **not** inherit top-level bindings in this wrangler
   version — every binding is declared per-environment in `apps/web/wrangler.jsonc`.
4. **Hyperdrive is deliberately absent from `env.staging`.** `wrangler deploy`
   validates the id against the live API as a real UUID, so a placeholder fails the
   deploy outright. Phase 3 adds it once Supabase exists.
5. **Use the repo-pinned wrangler**: `pnpm exec wrangler …` from `apps/web`. Never
   `npx wrangler` or `pnpm dlx wrangler` — both ignore the pinned 4.124.0.
   A deploy needs a fresh `opennextjs-cloudflare build` first, or it fails on a
   missing `.open-next/assets`.
6. **Cloudflare Access and Logpush are deferred by explicit owner decision.** Not a
   gap. The owner said authentication will come via Supabase later instead.
7. **Dev gallery routes are locale-scoped**:
   `apps/web/app/[locale]/dev/components/<category>/`. Several plans write
   `apps/web/app/dev/components/…` without the `[locale]` segment — stale.
8. **Scripts run from the repo root**: `pnpm typecheck`, `pnpm lint:css`,
   `pnpm build`, `pnpm i18n:check`, `pnpm test:visual`, `pnpm check:public-env`.
   There is no `test:visual` in `apps/web/package.json` — it exists only at root.
9. **Locale files**: en/de/fr/ar must stay at content parity. The only legitimate
   asymmetry is `$meta.nonTranslatableKeys`, which lives in `en.json` alone by
   design — a raw key count will show en ahead by a few and that is correct.
   Swiss German uses "ss", never "ß". Arabic is first-class RTL.

## How to work

The four platform laws in `CLAUDE.md` are binding and override any plan text: no
glow ever, no tinted yellow, four languages in the same pass, and a pending value is
a labelled `data-tok` gap with amounts reading `CHF 000`.

Delegate rather than doing it inline. What worked across fourteen plans: one
executor per plan, scoped to that plan's own `files_modified`, committing with
`git add <path>` per file — never `git add -A`, since unrelated research edits live
in this tree. Plans with disjoint file lists run safely in parallel on the same
working tree; plans that share files must run sequentially. Reserve the strongest
model for judgment work (goal verification, design-craft ports like the site shell)
and a mid-tier model for mechanical porting, galleries and baselines.

Three cautions learned the hard way. Session limits killed ten subagents across
three runs — prefer fewer, larger agents over wide fan-outs. Executors that die
between their last task commit and their SUMMARY leave a plan that looks incomplete
but is not, so always check `git log` before re-executing anything. And verify
agent claims independently: the gate caught a stale deployment and a broken CI path
that four SUMMARYs had implicitly reported as working.

## Next steps

1. Plan Phase 2 (`/gsd-plan-phase 02`), drawing on the drafted research in
   `.planning/phases/02-data-schema-rls-staff-auth-foundations/`.
2. Phase 2 needs a Supabase project (eu-central / Frankfurt, per the data-residency
   constraint). None exists yet — that is owner setup, ask before assuming.
3. Ask the owner before pushing anything or merging branches.
