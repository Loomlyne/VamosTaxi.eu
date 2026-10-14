# Phase 32 hand-over: automatic translator

**Branch:** `phase-32-auto-translate` (worktree `/Users/koss/.t3/worktrees/VamosTaxi.eu/phase-32-auto-translate`),
origin/main `8ef7e82d` merged in (`fb13271e`). Plans 32-01 to 32-12 built and tested locally.
**Nothing applied live, nothing deployed, no queue created, no billed model call made.** Needs a PR,
a review by a different model, and his Ship. Written 2026-10-14 ~12:20 (+04) by plan 32-12 Task 3.

What it does: one Gemma 4 translator on Workers AI (`apps/web/lib/translate/`, never AI Gateway)
fills de/fr/ar gaps in the catalogs on a controller command, translates customer messages for the
support ticket (original underneath), translates his reply into the customer's language for the
mail app, translates a home review on tap from a cache, and fills extra names on Pricing. Content ›
Pages and Content › Legal are gone from the dashboard; Content › Reviews stays.

---

## 1. Migrations by purpose

Four files, numbers supplied by the controller and signed by the owner 2026-10-14 ~00:25
(decisions file `.planning/decisions/2026-10-13-p30-ship-p31-lines-rls-fix.md` item 8). They sort
after Phase 31's `20261012240000` and do not collide with PR #81's `20261012250000` /
`20261012300000`. **Nothing is dropped**: no `drop table`, no `drop column`; `content_strings` and
every column the removed screens wrote stay. Every function is `security definer` with
`set search_path = ''`.

| # | Timestamp / file | What it adds |
|---|---|---|
| 1 | `20261012260000_translations_cache.sql` | Table `public.translations` (context `review` only; source hash + target language + prompt version; `origin` machine/human; RLS). `translation_read` (anon, published-review text only), `system_translation_put_machine` (upsert only where the stored row is machine: a human row always wins; returns the stored row), `system_translation_mark` (rejected/failed only, reason sanitised). Added by 32-05 in the same unshipped file: `system_translation_stale` and `system_translation_stale_source` (vamos_system only; machine rows of an older prompt version, never a human row). Audit trigger `audit_translations`. |
| 2 | `20261012270000_reviews_language.sql` | Column `public.reviews.language` (two letters or null). `review_ref(body)` (first 16 hex of sha256, the public opaque id; no row id goes public), `review_translation_source(ref)` (anon, published reviews only), `system_review_language_source` / `system_review_language_set` (vamos_system). |
| 3 | `20261012280000_support_and_note_translations.sql` | Column `public.support_messages.detected_lang`; tables `support_message_translations` and `booking_note_translations` (enable + force RLS, staff read only, no anon or customer grant). System writers `system_support_translation_source/put/fail`, `system_support_form_message_id`, `system_booking_note_source`, `system_booking_note_translation_put/fail`, and `system_translation_backlog` (kinds support / note / review, limit 1..200) for the nightly sweep. `bookings` is not altered. |
| 4 | `20261012290000_extra_labels_system_fill.sql` | `system_extra_labels_missing` and `system_extra_label_fill`: the nightly fill writes only empty de/fr/ar extra names and never a name he typed (D-02). |

Apply rule (CLAUDE.local.md): each file **verbatim**, in the order above, through the Supabase
connector; read each back (`md5` of the stored body or of each function's `prosrc`) and compare
with the local file; never `db push`. Live versions get the connector's apply timestamp, as with
Phases 30 and 31; record them in CLAUDE.local.md "Taken".

---

## 2. Live steps, in order, all controller-only

None of these were run by this phase.

1. **Apply the four migrations** (section 1), read back. They must be live **before** the deploy:
   the public reviews list now selects `review_ref(body)` and `language`, so new code on the old
   schema breaks the home reviews.
2. **Create the two queues** in the Vamos Cloudflare account: `wrangler queues create
   vamos-translate-staging` and `wrangler queues create vamos-translate-staging-dlq`. Before any
   deploy: `apps/web/wrangler.jsonc` now names a producer and consumers for them, and a deploy fails
   without them. The production twins (`vamos-translate-production`,
   `vamos-translate-production-dlq`) only when a production environment exists.
3. **Catalog fill (billed, cents), on his Mac:** `pnpm i18n:fill --check` first. On 2026-10-14 the
   tree had 0 gaps (32-09); the Task 2 static run re-checks after the Phase 31 merge (see section 6).
   Only if it lists gaps: `pnpm i18n:fill --write --yes-billed`, then `pnpm db:seed:gen`,
   `pnpm i18n:check`, read the diff, commit on the phase branch before the squash merge.
4. **Smoke the real model (billed, cents):** `pnpm i18n:smoke --yes-billed`. Read the 15 outputs:
   all accepted, Swiss "ss", "Vamos Taxi" in Latin, `CHF 000`, `VT-26-0753`, `ZRH`, `LX 318`
   unchanged.
5. **Deploy** from this Mac with `--env staging` only (CLAUDE.local.md; a bare deploy makes a stray
   Worker). Not written here as a command on purpose.
6. **Live checks after the deploy:**
   1. GET `/api/reviews`: each item carries `ref` (16 hex) and `language`, and no `id`.
   2. On vamostaxi.site, a review in another language than the site: tap Translate. Expected: the
      translation appears, no vendor or model name anywhere; Show original brings the original back.
   3. Send a German test message through `/contact`. Expected: within about 60 s the ticket shows it
      translated with the original underneath; reply box, ANSWER BY E-MAIL opens Gmail or the mail
      app with the German text, a blank line, 20 hyphens, a blank line and his text.
   4. The next 03:00 (Zurich) run fills `reviews.language` for the live reviews (or wait a night):
      read the column back.
   5. Queue health: the translate DLQ stays empty after the contact test.

No checkout code changed, so the 4242 payment rule does not apply to this phase on its own; if
the same deploy carries checkout changes from another branch, it does.

---

## 3. Overlap with Phases 30 and 31

Both are on main and live; origin/main is fully merged into this branch (`8930c31c`, `fb13271e`).

| Area | What was resolved | Commit |
|---|---|---|
| `apps/web/worker.ts` 03:00 cron | Order is: Phase 31 refund check first, then the Phase 32 translate sweep, then `return;`. Pinned by `apps/web/lib/translate/sweep.test.ts` ("worker.ts 03:00 cron order") and by the Phase 31 pin in `apps/web/lib/checkout/refund-check.test.ts`, which assumed its block was last and now ends at the next try block. | `8930c31c`, `24916f3e` |
| `apps/web/worker.ts` `queue()` | The translate branch sits before the Stripe `-dlq` branch; Phase 31's queue code is untouched. Branch order pinned by `apps/web/lib/translate/sweep.test.ts` "worker.ts queue() order" (added 12:23; red when the branches are swapped, green restored). | `8930c31c` |
| `apps/web/wrangler.jsonc` | Phase 31 edits the `env.staging` vars block; Phase 32 adds the translate queue producer/consumer blocks. Different hunks, both kept. | `8930c31c` |
| Dictionary and catalogs | `app/vamos-i18n-dict.js` (translator block before `/* Reviews */`, "Translated from" pattern before "Saved on"), `apps/web/i18n/messages/*.json`, `packages/emails/src/messages/*.json` (Latin "Vamos Taxi" in Arabic): both sides kept; `seed.sql` regenerated and `seed_idempotent.test.sql` re-pinned in the merge. | `8930c31c` |
| E-mail catalog | Only the Arabic brand spelling changed (3 lines) plus Phase 31's refund strings from main; snapshot updated in 32-04. | `d89d1a3a`, `8930c31c` |
| Deleted `apps/web/tests/integration/ops-dc-content.spec.ts` (and `content-string-edit.spec.ts`) | Phase 30 is merged, so no modify/delete conflict is left. The last references to the deleted edit spec were removed. | `3b83dba5`, `29a66a2e` |
| `packages/db/database.types.ts` | Merged file matches a native CLI 2.119 regeneration entry for entry (242 = 242). | `evidence/types-compare.log` |

Open branches that still touch the same files (whichever lands second merges main first; main wins
outside its own files):

- `fix/pricing-staff-policies` (PR #81): `app/vamos-i18n-dict.js`, the staff rate-book route
  (Phase 32 changed comments only there, 32-06), `packages/db/database.types.ts`. Its migrations
  `250000`/`300000` interleave by number with Phase 32's; each is applied by its own file, no
  dependency between them.
- `quick/ga4-gtm-consent`: `app/vamos-i18n-dict.js`, `apps/web/i18n/messages/ar.json`,
  `packages/db/supabase/seed.sql` (regenerate with `pnpm db:seed:gen`, never hand-merge).

---

## 4. Kept as approved

- F-01 lines left in Arabic script: **none**. No `legal.*` / `cookies.*` message, decision-file
  text, `$meta.noParamKeys` entry or `data-vt-legal` page string contained the Arabic spelling of
  "Vamos Taxi" (32-04; `strings-signed.test.ts` pins an empty `F01_KEPT` list).
- `ADR-011-data-tok-labels-stay-english.md` still quotes the old Arabic of "Awaiting a confirmed
  value from Vamos Taxi"; it is an ADR outside `.planning/decisions/`, so the dictionary row
  changed and the ADR text was left as written.
- Owner-approved wording, legal pages, `data-tok` copy and decision-cited keys are never sent to
  the model by `i18n:fill` (denylist + run-time scan; `scripts/i18n-fill.test.mjs`).

---

## 5. Not built, by decision

- No Translations page, no line editor, no "Machine" mark, no review or preview step (D-05).
- No overlay route: after D-06 no dashboard-typed public text remains; public text reads the
  catalog / `content_strings`, extras read `extra_labels_read()`.
- No night mail about failed translations: the automation proposal (one-line count when something
  failed) awaits his word.
- Replies are not sent by the dashboard; ANSWER BY E-MAIL opens his mail app (D-07). Customers in
  other languages get his reply as written (D-08).

Booking notes: translated and stored; no screen shows them (UI-SPEC default 10) — awaiting his word to draw one.

(The note translation job from plans 02 and 05 stays built and running.)

---

## 6. Verified, not verified, failed

### Verified (local only)

- 2026-10-14 03:04-03:25: full pgTAP on lab p32 after the four migrations, Files=125, Tests=3765,
  0 `not ok` (32-02); `translations_cache` 60/60 after the 32-05 additions (03:48).
- 2026-10-14 02:48-04:38: every plan's touched unit tests green (counts in each 32-NN-SUMMARY and
  `32-VALIDATION.md`); typecheck exit 0 after each plan.
- 2026-10-14 04:27: public review list through the real `vamos_public` client on lab p32 returns
  `ref` and `language`, no `id`, no 42501 (`evidence/32-08-reviews-local.log`).
- 2026-10-14 04:42: typecheck after the Phase 31 merge, exit 0.
- 2026-10-14 04:56-04:58: `gate:local` without the DB step at `29a66a2e`: 518 test files passed
  (26 skipped), 6606 tests passed (57 skipped), exit 0 (`evidence/gate-local-nodb.log`).
- 2026-10-14 05:01: merged `database.types.ts` = native CLI 2.119 output, 242 = 242 entries.
- 2026-10-14 05:25:57-05:50:47: Chromium on the local Worker build, A 16/0, B 16/0, C 16/0 at
  1440/1024/768/390 x en/de/fr/ar; no sideways scroll, coverage empty, no vendor word, no `ß`;
  0 review translation requests before the first tap; 0 requests to a live host; only the
  reply-translate ready and too-long states stubbed (`evidence/README.md`).
- 2026-10-14 12:17: `node --test scripts/i18n-fill.test.mjs` 5 pass, 0 fail.

Task 2 results, 2026-10-14, head fb13271e (merged with origin/main 8ef7e82d), one lane, logs in `evidence/`:
- `gate-local.log` 12:15:20-12:18:22, exit=0: check:public-env, typecheck, lint:css, lint, i18n:check (2698 keys), check:legal-claims, check:numbers, build, test:unit (scripts 45/0; packages/db 14; emails 360; apps/web 6607 passed, 57 skipped, 518 files), DB tests via `lab.sh dbtests p32 --keep` (packages/db test/local 76; apps/web `.local.test.ts` 11 + 44), all pass.
- `pgtap.log` 12:17:44-12:18:15, exit=0: full suite Files=126, Tests=3833, PASS.
- `static.log` 12:18:19-12:18:22, exit=0: test:scripts, db:seed:check (no drift), check:db-fences, i18n:fill --check (0 gaps), each exit 0.
- Stack lock taken 12:16:33, lab p32 destroyed and lock released 12:18:19.

### Not verified

- Billed `pnpm i18n:fill --write --yes-billed` and `pnpm i18n:smoke --yes-billed`: controller
  steps (cents). The real model's output has never been read; every test uses the stub.
- `pnpm db:types:check`: the pinned 2.115 CLI needs Docker (`postgres-meta`), which Vamos does not
  use. Replaced by the 2.119 entry-for-entry compare above; CI's database job runs it on the PR.
- Queue creation (`vamos-translate-staging`, `-dlq`) on the live account: controller step.
- The four migrations on live: not applied; no live read-back.
- `apps/web/tests/integration/ops-dc-content-loader.spec.ts`: kept and edited in 32-03 (only the
  Pages/Legal lines removed; the public-loader parts stay). It is a Playwright spec
  (component-1440 project) and has not been run. `29a66a2e` removed references to a different,
  deleted spec (`content-string-edit.spec.ts`).
- Phase 31 seed regeneration: the merge regenerated `seed.sql` and re-pinned
  `seed_idempotent.test.sql`; `pnpm db:seed:check` in the Task 2 static run is the check (result
  in the marker above).
- Translation on the live Workers AI binding, the 60 s customer-message path, and the 03:00 sweep
  on live: only after deploy (section 2, step 6).
- Booking notes (verifier W-1): enqueued only by the 03:00 sweep, not at booking create, and
  `booking_legs.note` is not covered. No screen shows notes (UI-SPEC default 10), so a note waits up to
  24 h; a producer at booking create belongs with the screen, when he signs one.

### Failed, then fixed (nothing open from these)

- 2026-10-14 04:41: one red after the Phase 31 merge (refund-check source pin); fixed `24916f3e`.
- 2026-10-14, before 04:56: 3 unit reds from the deleted edit spec's leftover references; fixed `29a66a2e`.
- 2026-10-14, before 05:13: the browser run found that pending and failed customer messages with no
  detected language showed no note; fixed `20ca2fba` + `c92bfe20`, then the full run passed.
- Verifier W-2 (12:40): a review created hidden and published later got no language job until the 03:00
  sweep; the publish switch now sends the ids-only review job (test first, red then green).
- The public sitemap's dashboard `/pages` and `/legal` rows were dropped in `8959fe1e` (32-03 fix).
- Incident: the first 32-12 agent died at about 05:50 (API error) holding the one-stack lock
  `~/.vamos-scratch/stack.lock` and lab p32 from 05:00 until the orchestrator released both at
  12:13; the controller was told. The Task 2 script holds the lock only for its database part, with
  an EXIT trap.

---

## 7. Cleanup

- After his Ship: `lab.sh destroy p32` if the lab still exists (the Task 2 script destroys it after
  its database part), and check `~/.vamos-scratch/stack.lock` is not left behind.
- After the squash merge: remove this worktree and delete the branch locally and on GitHub the same
  day. The evidence logs are gitignored and go with the worktree; `evidence/README.md` is the
  committed record.
- Untracked signing pictures `.planning/phases/32-auto-translate/screens/frames/` and
  `screens/frames-v2/` are not in git: commit them or confirm they can go before the worktree is
  removed (delete nothing that is not on GitHub).
- Remove `apps/web/.next-*` build folders if any are left (memory test-build-folders-hang-gates).
