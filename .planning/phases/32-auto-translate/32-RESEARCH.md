# Phase 32: Automatic translator - Research

**Researched:** 2026-10-12
**Domain:** Workers AI (Gemma 4) machine translation under OpenNext on Cloudflare Workers, Postgres cache, Queues
**Confidence:** HIGH for platform facts (live Cloudflare docs read today), MEDIUM for prompt/guard design and latency, cost figures HIGH on price and MEDIUM on volume.

## Recommended approach (read this first)

> **Revision 2026-10-13 (owner answers, see 32-CONTEXT D-05 to D-10).** Drop everything that existed only for him to check text: `staff_translation_list`, `staff_translation_set_human`, `staff_translation_revert_to_machine`, the dashboard list, the "machine" flag in any UI, and the 20 s "Try again / Send in English" dialog (the reply now opens his mail app; on failure it opens with his text as written plus a quiet note). Keep `origin` internally (extras he types keep winning). Add a public **review translate on tap** route: `POST /api/reviews/:id/translate {lang}`, rate-limited, cache-first in `translations` (context `review`), model only on a miss, never at page load. Replies target only en/de/fr/ar; any other customer language → his text goes untranslated (D-08). The migration list loses its staff RPCs and gains nothing new (reviews use `translations`).

1. **Engine wrapper, one module.** `apps/web/lib/i18n/machine/` holds one `translate()` that calls `env.AI.run("@cf/google/gemma-4-26b-a4b-it", …)` with `messages`, `response_format: json_schema`, `temperature` ≈ 0.2, `max_completion_tokens` capped, **`chat_template_kwargs: { enable_thinking: false }`** (thinking is ON by default and billed as output), `signal: AbortSignal.timeout(…)`. One call returns all target languages as JSON. It replaces the m2m100 call in `lib/ops/extra-label-translate.ts` (D-44), whose staff-wins logic (`planExtraLabels`, `machine_langs`) is the model for the rest.
2. **Mask, call, then a guard that decides.** Protected tokens (ICU `{x}`, `$1`, HTML tags, `data-tok` spans, refs `VT-…`, flight numbers, `CHF`/amounts, `ZRH`, class names, `Vamos Taxi`, `Ride with class`) are swapped for opaque placeholders *before* the call and swapped back after. The guard rejects the output and keeps the source when any check fails: placeholders exactly preserved, digits preserved, length ratio in bounds, script matches target, no refusal/preamble, ICU parses with the same arguments. Then the fixed post-process: `ß→ss` (de), Arabic-Indic digits → 0-9 (ar).
3. **Postgres is the source of truth; no KV.** A public-safe `translations` table keyed by `(source_hash, target_lang)` with `origin` (`machine`|`human`), `status`, `prompt_version`. A machine write can never overwrite a human row (the upsert's `where origin = 'machine'`, tested in pgTAP). Customer text (support messages, booking notes) goes in **separate staff-only tables**, never in the shared cache.
4. **Public pages never call the model.** Repo strings (dict, messages, email catalog) are filled **at authoring time** by `pnpm i18n:fill` (Workers AI through `getPlatformProxy`), so the gate stays green and the dict ships as today, with a machine manifest so the dashboard can mark them. Dashboard-typed text reaches the DC pages through `GET /api/i18n/overlay?lang=de`, which is a cached JSON read from Postgres that `vamos-locale.js` merges like `/api/fx`. If the overlay is missing, the page shows the source, never a blank.
5. **Background work runs on a new Queue `vamos-translate-staging` with a DLQ.** Dashboard saves, customer messages and booking notes are enqueued on write and translated within seconds, with backoff retries. The nightly `0 3 * * *` cron re-enqueues anything `pending`/`failed`. His outgoing reply is the one synchronous call: 20 s timeout, and if it fails it is **not** sent in English without him knowing (see Open question 1: the dashboard has no Send today).
6. **Cost at Vamos volume is about 3,300 neurons a month**, against **10,000 free neurons per day** on Workers Paid. Billed amount: **$0.00/month**. At list price it would be about $0.04/month. A one-time fill costs nothing, because the static catalogs have **1 gap in total**.

<user_constraints>
## User Constraints (from owner decisions, question form 2026-10-12)

`32-CONTEXT.md` named in ROADMAP does **not exist** in this worktree (checked 2026-10-12). The decisions below are copied from the orchestrator brief. The lead should write CONTEXT.md before planning.

### Locked Decisions
1. Scope: everything with a language. That covers site text gaps in de/fr/ar, dashboard-typed content (extras, notes, FAQ, any content he edits), emails, customer messages to him, and his replies (his reply goes out in the customer's language).
2. Fully automatic: translations go live at once. The dashboard marks machine text. His correction always wins over the machine and is never overwritten.
3. Engine: Gemma 4 on Workers AI, model `@cf/google/gemma-4-26b-a4b-it` ($0.10/M input, $0.30/M output), called through the Worker AI binding with no outside key.

### Fixed rules
- Legal pages and owner-approved legal wording are never machine-translated.
- These stay untranslated (Latin in Arabic too): amounts, CHF, refs like VT-26-0753, flight numbers, ZRH, the class names Economy Sedan / Economy Van / Luxury Van, "Vamos Taxi" and the tagline "Ride with class".
- Swiss German uses "ss", never "ß". Arabic is RTL, with numbers and codes LTR.
- No vendor or model name appears on any public page.
- Existing human translations are never overwritten. The cache is keyed by source text + language.
- No model call in the request path of a public page view if a cached or queued approach works.

### Claude's Discretion
Everything else: architecture, storage, queueing, prompt, validation, detection.

### Deferred Ideas (OUT OF SCOPE)
None stated.
</user_constraints>

## Project Constraints (from CLAUDE.md)
- Four languages ship in the same pass. `pnpm i18n:check` (part of `gate:local`) blocks any de/fr/ar gap in `apps/web/i18n/messages`. A new message key needs `db:seed:gen` (memory: new-i18n-keys-gates).
- No invented prices. `data-tok` copy stays English (ADR-011). `$meta.pendingValueKeys` and `$meta.nonTranslatableKeys` are excluded from translation.
- Logical properties and `.vt-dir-keep` for LTR runs inside Arabic. `data-vt-no-i18n` / `translate="no"` opt a subtree out.
- Any new dashboard surface (the machine badge, a Translations list, a reply box) goes through design first. UI-SPEC comes before mock code (memory: never-skip-gsd-phase-or-skill). It must follow the design-system laws: no glow, no tinted yellow, 4 languages, 1440/1024/768/390.
- Worker pg client: `fetch_types:false`, so no pg arrays. Use `sql.json` for jsonb. Catch SQL refusals around `asSystem`, not inside (memory).
- No secrets in the repo, RLS on every table, audit trail. Deploy uses `--env staging`. Work happens in a worktree, and Ship needs his word.

## What exists today (verified in repo)

| Fact | Where | Consequence |
|---|---|---|
| `ai: { binding: "AI" }` already declared in `env.staging` and `env.production` | `apps/web/wrangler.jsonc` L90, L304 | No wrangler change is needed for the binding |
| `AI?: Ai` typed (optional so tests and local runs pass) | `apps/web/lib/env.d.ts` L41 | Reuse it. The workers-types `5.20260820.1` already types this model as `ChatCompletionsInput/Output` |
| m2m100 translator for extras with staff-wins + `machine_langs text[]` | `lib/ops/extra-label-translate.ts`, migration `20260930140000_extra_labels.sql`, called **inside** the rate-book save request | Swap the engine to Gemma and move the call to the queue. Keep the planning logic and the tests' `AiLike` stub |
| Static catalogs are complete: dict 1,988 strings + 114 patterns with 0 gaps, messages 2,837 keys with **1** key missing in each of de/fr/ar, email catalog 131 keys with 0 gaps | counted with a vm script, 2026-10-12 | A one-time fill is effectively zero. The value is in new strings and DB text |
| 85 de / 99 fr / 37 ar message values are identical to English | same count | Mostly brand or loanwords. They are human, so never overwritten. Listed for him only |
| Human `ß` left in `de.json` L2111 (`zu groß`) | grep | Existing human string. Report it, don't auto-fix (rule 5). Owner/quick fix |
| Human Arabic writes "Vamos Taxi" as `فاموس تاكسي` 44 times (dict 23, ar.json 21), but 15 ar.json values keep Latin | grep | Conflicts with the "Latin in Arabic" rule. The machine keeps Latin, so the two will differ. Open question 4 |
| Arabic digits: Western 0-9 almost everywhere (3 values use ٠-٩) | grep | Policy: Western digits. Normalise machine output |
| German register is **Sie** (373 values; 2 `du` lines) | grep | Prompt: formal Sie |
| Support is **read-only**. Replies go via `mailto:` / Gmail compose links, with no Send in the dashboard (owner G27, 2026-09-30) | `lib/ops/tickets-write.ts` L4, `tickets-map.ts` L142-170 | "His reply in the customer's language" needs either a Send (re-opens G27) or a translated mail draft. Open question 1 |
| `contact_submissions.locale` (en/de/fr/ar) records the site language at submit. Inbound email has no language | migration `20260828000002`, `20260904182631` | Detection is needed for email and for form text written in another language |
| `bookings.note` free text from the customer | `20260823000010_bookings.sql` L102 | Translate to English for him, on arrival |
| Ops Content screen is "Coming soon". There is no editor for site copy | `app/ops/OpsContent.dc.html` | His corrections need a new dashboard surface (UI-SPEC) |
| `queue()` handler: the DLQ branch, then **every other message is treated as a Stripe event** | `apps/web/worker.ts` L219-260 | A new queue must branch on `batch.queue` **before** the Stripe loop, or translate jobs get parsed as Stripe events |
| Crons `0 * * * *` (hourly health/digest) and `0 3 * * *` (sweeps) | wrangler `env.staging.triggers` | Add the translate sweep to `0 3 * * *`. No new cron needed |
| `/api/fx` pattern: public JSON, `Cache-Control: public, max-age=3600`, in-memory memo, fetched by `vamos-locale.js` and merged, then `emit()` | `apps/web/app/api/fx/route.ts`, `app/vamos-locale.js` L158-170 | Copy it for the overlay |
| Dev: `initOpenNextCloudflareForDev` with `VAMOS_DEV_REMOTE_BINDINGS=0` because "the `AI` binding is always remote" | `apps/web/next.config.ts` L198-215 | Tests and CI must stub AI. A live call in dev is billed |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Model call, masking, guard | API / Backend (Worker: queue consumer, staff routes) | — | Binding exists only in the Worker. Never in a public request path |
| Translation store, human precedence | Database (Postgres via Hyperdrive) | — | SQL enforces "machine never overwrites human". Audit trigger, RLS |
| Public overlay for DC pages | API (cached GET route) | CDN/Cache API | One small JSON per language. The browser merges it |
| Applying translations on pages | Browser (`vamos-locale.js`) | — | Existing runtime keyed by English source. Source shows on any miss |
| Repo string fill (dict/messages/emails) | Dev tooling (local script via `getPlatformProxy`) | Git (committed values + machine manifest) | Keeps `i18n:check` green and public pages static |
| Customer message / note translation | Backend (queue) | Database (staff-only tables) | Private text must stay out of public caches |
| Machine badge, corrections | Dashboard (ops DC pages + staff API) | Database | His edit writes `origin='human'` |

## A. Workers AI binding under @opennextjs/cloudflare

- **Config:** `"ai": { "binding": "AI" }`, and the docs allow only **one AI binding per Worker** [CITED: developers.cloudflare.com/workers/wrangler/configuration/#workers-ai]. Bindings declared at top level are not inherited by named envs. The docs' non-inheritable list names `vars`, `kv_namespaces`, `r2_buckets`, `queues` and others, but does **not** name `ai` explicitly [CITED: same page, "Non-inheritable keys"]. The repo already declares `ai` inside `env.staging` and `env.production` (and its own comment L20-23 says top-level bindings are dropped), so either way it is correct. **No change.** The dashboard gateway Worker (`wrangler.dashboard.jsonc`) reaches `vamos` by service binding, so dashboard API calls run inside `vamos` and see `env.AI` [VERIFIED: repo].
- **Access:** in route handlers, `getCloudflareContext().env.AI` [CITED: opennext.js.org/cloudflare/bindings]. In `worker.ts` `queue()`/`scheduled()`, use the handler's `env` argument (the repo rule D-06/D-24 in worker.ts comments) [VERIFIED: repo].
- **Typing:** `wrangler types --env-interface CloudflareEnv` generates the env interface [CITED: opennext.js.org/cloudflare/bindings]. This repo hand-maintains `lib/env.d.ts` with `AI?: Ai`. Keep that. `Ai` from `@cloudflare/workers-types@5.20260820.1` maps `"@cf/google/gemma-4-26b-a4b-it"` to `ChatCompletionsInput`/`ChatCompletionsOutput`, and `AiOptions` has `signal?: AbortSignal`, `tags?: string[]` (max 5, ≤50 chars), `gateway`, `queueRequest` [VERIFIED: node_modules index.d.ts L11486, L11583-11607].
- **Local dev:** "There is no current local simulation for Workers AI" [CITED: developers.cloudflare.com/workers/development-testing/]. "Using Workers AI always accesses your Cloudflare account … and will incur usage charges even in local development" [CITED: wrangler configuration #workers-ai]. Local inferences "count towards these limits" [CITED: workers-ai/platform/limits]. `initOpenNextCloudflareForDev()` exposes bindings to `next dev`. Remote bindings are stable since wrangler 4.36 (the repo has 4.124.0) [CITED: opennext.js.org/cloudflare/bindings]. Dev cost is negligible (cents), but CI has no token, which is why the repo sets `VAMOS_DEV_REMOTE_BINDINGS=0`.
- **Scripts:** `getPlatformProxy({ environment: "staging", configPath: "apps/web/wrangler.jsonc" })` takes `remoteBindings` (default `true`) [CITED: developers.cloudflare.com/workers/wrangler/api/]. This is how `pnpm i18n:fill` reaches Gemma with no API key in the repo, using his existing wrangler login on the Mac.
- **Tests:** inject an `AiLike = { run(model, input, opts?) }` the way `extra-label-translate.test.ts` already does with `vi.fn`. No test hits the network. One opt-in live smoke script (`pnpm i18n:smoke`, manual) checks the real model on 5 fixed strings.

## B. Gemma 4 call shape (live model page + JSON schemas, 2026-10-12)

| Property | Value | Source |
|---|---|---|
| Task / context | Text Generation, **256,000 tokens** context | [CITED: workers-ai/models/gemma-4-26b-a4b-it] |
| Input | `oneOf`: `prompt` (string) **or** `messages` (system/user/assistant). Use `messages` | sync-input.json |
| Length cap | `max_completion_tokens`; `max_tokens` is **deprecated** | sync-input.json |
| `temperature` | 0–2, **default 1**. Set 0.2 | sync-input.json |
| `response_format` | `{type:"text"}`, `{type:"json_object"}`, `{type:"json_schema", json_schema:{name, schema, strict?}}` | sync-input.json |
| Thinking | `chat_template_kwargs.enable_thinking` **default `true`**. Set `false` | sync-input.json |
| Also | `seed`, `stop`, `top_p`, `tools`, `stream` | sync-input.json |
| Output | OpenAI shape: `choices[0].message.content` (string or null), `.refusal`, `finish_reason` ∈ stop/length/tool_calls/content_filter/function_call; `usage.prompt_tokens/completion_tokens/completion_tokens_details.reasoning_tokens` | sync-output.json |
| Price | $0.100/M input = 9,091 neurons/M; $0.300/M output = 27,273 neurons/M | [CITED: workers-ai/platform/pricing, updated Oct 9 2026] |
| Rate limit | Text Generation **300 requests/min** (the 20 rpm limit applies only to the paid-only list, and Gemma 4 is not on it) | [CITED: workers-ai/platform/limits] |
| Batch | Supported: `env.AI.run(model, {requests:[…]}, {queueRequest:true})` returns `request_id`, which you poll. Payload under 10 MB. No price discount stated | [CITED: workers-ai/features/batch-api/workers-binding] |
| Model facts | MoE 26B total / 4B active; multilingual, "35+ languages out-of-the-box, pre-trained on 140+"; released 2026-04-04 | [CITED: changelog 2026-04-04-gemma-4-26b-a4b-workers-ai] |

**Batch API decision: do not use it.** Volume is tiny and 300 rpm is plenty. Async polling adds a state machine for no saving. The queue consumer with small batches covers bulk.
**`json_schema strict`:** the schema accepts it, but how hard the model is held to it is not documented [ASSUMED]. Always `JSON.parse` + validate, and treat a parse failure as a rejection.
**`finish_reason: "length"`** means truncated output, so reject it. Size `max_completion_tokens` as about `3 × source_tokens × 2 + 64` per target language.

## C. Prompt design and the deterministic guard

**Order per item:** normalise → mask → call → parse → unmask → post-process → guard → store (or keep source).

1. **Mask (code, not prompt).** Replace each protected span with `⟦n⟧`, in this order: HTML tags and `<span data-tok>…</span>` (whole span, so the pill copy stays English), ICU arguments `{name}` and the argument heads of `{n, plural, …}` (keep the branch texts translatable and parse with `@formatjs/icu-messageformat-parser`), dict `$1…$9`, URLs and emails, refs `/VT-\d{2}-\d{4}/` and similar codes, flight numbers `/\b[A-Z0-9]{2}\s?\d{1,4}\b/`, money `CHF 000`/`CHF 1'250.00`, the glossary literals (`Vamos Taxi`, `Ride with class`, `Economy Sedan`, `Economy Van`, `Luxury Van`, `ZRH`, `CHF`, `TWINT`, `Visa`, `Mastercard`, `Apple Pay`, and `$meta.nonTranslatableKeys` values). The model never sees what it could damage.
2. **System prompt (versioned `PROMPT_VERSION = 1`).** "Translate UI/customer-service text for a Swiss airport-transfer company from {src} into {targets}. Keep every ⟦n⟧ token exactly once and unchanged. German: Swiss German, formal 'Sie', use 'ss' never 'ß', Swiss quotes «». French: formal 'vous'. Arabic: Modern Standard Arabic, Western digits 0-9. Keep sentence case, keep length close to the source, no explanations, no added text. Return JSON matching the schema." Add a few-shot pair drawn from the existing dict (for example `Saved on ⟦0⟧` → de/fr/ar from `patterns`), which anchors register and style.
3. **Schema.** `{ "de": string, "fr": string, "ar": string }` (only requested keys, `additionalProperties:false`). Customer inbound uses `{ "lang": string, "en": string }`.
4. **Post-process (code).** de: `ß→ss`, `ẞ→SS`. ar: `[٠-٩]→[0-9]`, `[۰-۹]→[0-9]`. All: trim, collapse doubled spaces, strip wrapping quotes the model added and the source lacks.
5. **Guard. Reject the output and keep the source when any check fails:**
   - Every `⟦n⟧` appears exactly once, and no unknown `⟦…⟧` appears.
   - The multiset of digits equals the source's, after the masked tokens.
   - Length ratio `out/src` is in [0.4, 2.5] (de/fr) or [0.3, 2.5] (ar). Very short sources (≤3 chars) skip the ratio.
   - Script check: ar output has ≥1 Arabic-block letter and no Latin words except glossary. de/fr output is not identical to the source unless the source is ≤2 words (then accept, because the word may be a loan).
   - No refusal or preamble: reject `/^(sure|here is|voici|hier ist|certainly)/i`, `I can't`, markdown fences, `refusal != null`, `finish_reason != "stop"`.
   - ICU messages: `parse(out)` succeeds and the argument names and plural/select keys equal the source's.
   - No `ß` remains (after post-process this is an assertion).
   - Rejected outputs log only `{reason, lang, hash}`, never text (no customer text in logs).
6. **Retry policy for a reject:** one immediate re-ask at `temperature 0` with the failure reason. Then mark the row `rejected` and keep the source. The nightly sweep retries again only when `prompt_version` is bumped.

## D. Cache: Postgres, not KV

**Recommendation: Postgres table as truth, read through a cached overlay route. No new KV namespace.**
Reasons:
- (a) Human-over-machine precedence becomes one SQL `where` plus pgTAP, where KV has no conditional write.
- (b) The audit trigger, RLS and the dashboard list all come with SQL.
- (c) The read path is **not** per-string. The DC page fetches one JSON per language, cached by the browser and the edge, so Hyperdrive vs KV latency is paid about once per minute per colo, not per view.
- (d) No live infra creation step (a KV namespace is an owner step on the live account).
- (e) Volume is hundreds of rows.

KV would only matter at a scale Vamos does not have [reasoned; KV/Hyperdrive latency numbers not measured, ASSUMED].

**Key:** `source_hash = sha256_hex(source_lang + "\n" + normalised_source)` (Web Crypto, NFC, trimmed, inner whitespace collapsed). The row is unique on `(source_hash, target_lang)`. **`prompt_version` is a column, not part of the key.** If it were in the key, a prompt bump would orphan his human corrections. A bump instead re-queues `origin='machine'` rows only.

**`public.translations`** (public-safe contexts only):

| column | type |
|---|---|
| id | bigint identity PK |
| source_hash | text not null |
| source_lang | text not null (en/de/fr/ar) |
| target_lang | text not null (en/de/fr/ar, ≠ source_lang) |
| source_text | text not null (≤ 4000) |
| translated_text | text null |
| origin | text not null check in ('machine','human') |
| status | text not null check in ('pending','done','rejected','failed') |
| context | text not null (e.g. 'dict','messages','email','extra','content','class') |
| prompt_version | integer not null |
| attempts | integer not null default 0 |
| last_error | text null (reason code only) |
| created_at / updated_at | timestamptz |
| updated_by | uuid null (staff, for human rows) |

The unique index is `(source_hash, target_lang)`. The partial index is `(status) where status in ('pending','failed')`. Plus the audit trigger `tg_audit_row`.

**Private, staff-only:** `support_message_translations(message_id uuid FK, target_lang text, body text, origin, status, prompt_version, attempts, updated_at)` plus `support_messages.detected_lang text null`. `booking_note_translations(booking_id uuid FK, target_lang, body, origin, status, …)` plus `bookings.note_lang text null`. Customer text never enters `translations`, because that table feeds a public endpoint.

**Writes (definer RPCs):**
- `system_translation_put_machine(...)` does `on conflict (source_hash,target_lang) do update … where translations.origin = 'machine'`.
- `staff_translation_set_human(hash, lang, text)` is admin-only and sets `origin='human'`.
- `staff_translation_revert_to_machine(...)` is optional, only on his word.
- Domain tables keep their read model: `extra_labels.label_*` + `machine_langs` stay. The queue writes them through `staff_extra_label_upsert`-style system RPCs with the same staff-wins rule.

**Invalidation:** a changed source is a new hash, so a new row is translated. The old row stays (harmless) and is pruned by the nightly sweep when it is unreferenced for more than 90 days and `origin='machine'`. Human rows are never pruned. For extras, an English rename re-translates machine languages only. Human languages are kept and flagged "English changed since your translation" (the dashboard shows it, no overwrite).

**How the DC runtime gets machine strings without a model call:**
- **Repo strings:** written into `app/vamos-i18n-dict.js` / `messages/*.json` / email catalogs by `pnpm i18n:fill` at authoring time. A sidecar manifest records which `(key, lang)` are machine: `app/vamos-i18n-machine.json` for the dict, `$meta.machineKeys` in `en.json` for messages (the `check-i18n-coverage.mjs` `$meta` pattern already exists). The page loads them with zero runtime cost.
- **DB strings and his corrections:** `GET /api/i18n/overlay?lang=de` returns `{ v, strings: { "<English source>": "<text>" }, human: ["<source>", …] }`. It is built from `translations` where context is public, status is `done`, and the target is lang. It sends `Cache-Control: public, max-age=60, stale-while-revalidate=600` and an ETag, reads through the cacheable `HYPERDRIVE` binding, and uses an in-memory memo as `/api/fx` does. `vamos-locale.js` fetches it once when lang ≠ en, merges into `VamosI18n.strings` with **precedence human overlay > human dict > machine overlay > machine dict > source**, then calls `refresh()`. It must skip `main[data-vt-legal]` subtrees, `data-vt-no-i18n`, and `[data-tok]`. A failed fetch leaves the source. "Live at once" therefore means within about 60 s [ASSUMED acceptable; confirm with owner].
- Extras keep coming through `extra_labels_read()` as today.

## E. Background fill: which mechanism for what

Existing: one queue `vamos-stripe-events-staging` with DLQ `-dlq` (consumer `max_retries 8`, `retry_delay 30`); crons `0 * * * *`, `0 3 * * *` [VERIFIED: wrangler.jsonc]. Queues support `msg.retry({ delaySeconds })` with the `attempts` counter for exponential backoff, and `send(…, { delaySeconds })` [CITED: developers.cloudflare.com/queues/configuration/batching-retries/].

| Workload | Mechanism | Why |
|---|---|---|
| (i) Dict/message/email gaps | **Authoring-time `pnpm i18n:fill`** (local script, `getPlatformProxy`, batches of about 25 strings per call), plus the nightly cron that re-enqueues DB rows in `pending`/`failed`/old `prompt_version` | Repo strings ship in git, the gate stays blocking, and no public runtime path is involved |
| (ii) Dashboard content on save | **Queue** (`vamos-translate-staging`, `max_batch_size 5`, `max_batch_timeout 2`, `max_retries 6`, DLQ). The save returns at once and the row shows "Translating…" until done | Retries and DLQ. `ctx.waitUntil` loses work on failure and has no retry |
| (iii) Incoming customer message / booking note | **Queue**, enqueued right after the insert in `ingestInboundEmail`, `/api/contact`, and booking create. One call returns `{lang, en}` | Off the webhook's critical path. Resend inbound must ack fast |
| (iv) His outgoing reply | **Synchronous** call in the staff route, `AbortSignal.timeout(20_000)`, guard applied. On failure the route returns `translate_failed` and the dashboard says so, offering "Try again" or "Send in English". It never silently sends English and never sends a rejected text | He is waiting. The email must carry the translated text before it leaves |

`worker.ts` `queue()`: add `if (batch.queue.startsWith("vamos-translate")) { … return; }` **before** the Stripe loop, and route `vamos-translate-*-dlq` to an ack-and-log branch (do not reuse the Stripe DLQ alert mail, or translate failures email him at night). Message body: `{ kind: 'public'|'support'|'note'|'extra', id|hash, targets: ['de','fr','ar'] }`. **Never put text in the message.** Read it from the row, so customer text does not sit in queue storage.

Queue creation (`wrangler queues create vamos-translate-staging` and `-dlq`) is a live-account step, and deploy needs his Ship word.

## F. Limits and cost

- **Free allocation:** 10,000 neurons/day on Workers Paid, then $0.011 per 1,000 neurons. Resets 00:00 UTC [CITED: workers-ai/platform/pricing].
- **10,000 neurons/day equals** about 1.1M input tokens or about 367k output tokens per day for this model.
- **Rate:** 300 rpm. The consumer runs at `max_concurrency` 1–2, so the limit is never reached.

**One-time fill (counted 2026-10-12):**
- dict 0 gaps; messages 1 key × 3 languages (12 chars); emails 0. Cost about **$0.00**.
- Worst case, if he ever asked to machine-translate everything from scratch: about 186k English chars, roughly 47k tokens [ASSUMED 4 chars/token]. That is ≈160k in + ≈200k out ≈ **$0.08 list, ≈7,000 neurons**, inside one day's free allocation.
- The existing support backlog (live, not read) is under 200 messages at 50/month, ≈ $0.02.

**Monthly run rate** (≈700-token system prompt per call; Arabic output ×1.5 [ASSUMED]):

| Stream | Calls/mo | Input tok | Output tok |
|---|---|---|---|
| Dashboard edits (20 × 3 langs in 1 call) | 20 | 15k | 3k |
| Customer messages → en + detect (50) | 50 | 48k | 15k |
| His replies en → customer lang (50) | 50 | 48k | 23k |
| Booking notes (≈30 of 100 bookings) | 30 | 23k | 2k |
| New site strings (≈100 × 3, batched 25) | 4 | 5k | 8k |
| +25% rejects/retries | — | 35k | 13k |
| **Total** | ≈190 | **≈172k** | **≈63k** |

List price: 0.172 × $0.10 + 0.063 × $0.30 = **≈ $0.04/month**. That is ≈ 1,560 + 1,720 = **≈ 3,300 neurons/month (≈110/day vs 10,000 free/day), so $0.00 billed.**
If `enable_thinking` were left on: about +1,000 reasoning tokens/call, ≈ +190k output tokens ≈ +$0.06 list and +5,200 neurons/month. That is still free, but slower, so turn it off.
Queues: ≈190 messages × 3 ops ≈ 600 ops/month, against 1M included [CITED: queues/platform/pricing].

## G. Failure modes

| Failure | Behaviour |
|---|---|
| Binding missing (tests, local without remote) | `translate()` returns `{ ok:false, reason:'no_binding' }`. Rows stay `pending`. Pages show the source |
| Timeout / 5xx / 429 / capacity | Queue `msg.retry({ delaySeconds: min(30·2^attempts, 3600) })`. After `max_retries` → DLQ, and the row is marked `failed`. The nightly sweep re-enqueues `failed` older than 24 h, up to `attempts < 10` |
| Bad output (guard reject) | One re-ask at temp 0, then `rejected`, and the source is shown. No retry storm |
| Overlay route down | Client keeps the dict. Machine DB strings fall back to the source text. Never blank |
| Customer message translation fails | The dashboard shows the original with a "Not translated yet" state. He can still read and reply |
| Reply translation fails | No email is sent automatically. He chooses "Try again" or "Send in English" (explicit). Sent mail stores the original English plus the sent text |
| Emails | Templates are pre-translated (catalog). Dynamic inserts (extra names, class names) come from already-stored labels, falling back to English. **No model call at email render time** |
| Workers AI deprecates or changes the model | Model id lives in one constant. The `prompt_version` bump re-queues machine rows. The changelog shows Cloudflare deprecates models with notice [CITED: changelog 2026-05-08 planned deprecations] |

## H. Detecting the customer's language

- `@cf/meta/m2m100-1.2b` **does not detect**. `source_lang` "Defaults to 'en' if not specified" [CITED: workers-ai/models/m2m100-1.2b]. The Workers AI catalog shows no language-identification model [VERIFIED: models index grep, 2026-10-12].
- **Recommended:**
  1. A cheap heuristic first: an Arabic-script ratio over 30% means `ar`, with no call needed to decide.
  2. Otherwise the same Gemma call that translates returns `{ "lang": "<ISO 639-1>", "en": "…" }`. If `lang == 'en'`, store it and skip the translation.
  3. Fallback: `contact_submissions.locale`, then `en`.
- Store it in `support_messages.detected_lang` (any ISO 639-1, `^[a-z]{2}$`). The reply target is the latest inbound `detected_lang` when it is in {en,de,fr,ar}. Otherwise see Open question 3 (Italian is a Swiss national language).

## Expected migration files (names only)
1. `<ts>_translations.sql`: table, indexes, RLS on, revokes, audit trigger.
2. `<ts>_translation_rpcs.sql`: `translation_overlay_read(lang)` (anon/checkout grant), `system_translation_put_machine`, `system_translation_claim_pending`, `staff_translation_list`, `staff_translation_set_human`, grants.
3. `<ts>_support_message_language.sql`: `support_messages.detected_lang`, `support_message_translations` + staff RLS + system writer RPC.
4. `<ts>_booking_note_language.sql`: `bookings.note_lang`, `booking_note_translations` + RPCs.
5. `<ts>_extra_labels_machine_source.sql` (optional): `label_source_en` per language to show "English changed since your translation".
6. pgTAP: `translations_human_wins.test.sql`, `translation_overlay_public_only.test.sql`, `support_translation_staff_only.test.sql`.
Timestamps must sort after the newest on main at plan time (`20261012190000` today, and Phase 30 already uses `20261013100000`).

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---|---|---|---|
| ICU message validation | regex over `{…}` | `@formatjs/icu-messageformat-parser` (already transitive via next-intl, 3.5.17 installed; add as direct dep) | Nested plural/select. 28 plural messages exist |
| Hashing | custom hash | `crypto.subtle.digest('SHA-256')` | Built into Workers and Node |
| Retry/backoff/dead letter | `setTimeout` loops, a jobs table poller | Cloudflare Queues `retry({delaySeconds})` + DLQ | Already the repo's Stripe pattern |
| JSON output | prompt-only "reply in JSON" | `response_format: json_schema` + `JSON.parse` + guard | Documented parameter |
| Language detection | n-gram library | Gemma `{lang}` field + Arabic-script heuristic | One call, no new package |
| Translation memory | a second store | the `translations` table | One source of truth |

## Common Pitfalls
1. **Thinking left on.** `enable_thinking` defaults to `true`. That means slower calls, billed reasoning tokens, and possibly reasoning text leaking into `content`. Set it to `false` and assert in a unit test that the input object carries it.
2. **Queue handler fallthrough.** `worker.ts` treats every non-DLQ batch as Stripe. A translate message would be parsed as a Stripe event and retried 8 times into the Stripe DLQ alert mail.
3. **Customer text in a public cache.** If support bodies go into `translations`, the overlay could serve them. Keep the separate staff-only tables, and test that the overlay RPC filters by context.
4. **Overwriting human strings.** Any "upsert" without `where origin='machine'` breaks rule 2. The fill script must also skip a `(key, lang)` that already has a value, even an "identical to English" one.
5. **Legal/consent text leaking into the fill.** Exclude the `legal.*` and `cookies.*` namespaces, `$meta.pendingValueKeys`, consent/agreement strings, the five `data-vt-legal` pages (`terms`, `privacy`, `cookies`, `imprint`, `cancellation`), and an explicit `scripts/i18n-machine-denylist.json`. The client overlay merge must also skip `main[data-vt-legal]`.
6. **Arabic bidi.** Translated text with refs or flight numbers must render them LTR. On DC pages wrap protected tokens with `.vt-dir-keep` at render. In emails use `<bdi dir="ltr">` around unmasked tokens.
7. **Messages JSON drift.** A new key filled into `messages/*.json` needs `db:seed:gen`, and `i18n:pull` can overwrite it from DB. Run fill → seed:gen → gate.
8. **Dev/CI calls cost money and fail without a token.** Keep `VAMOS_DEV_REMOTE_BINDINGS=0` in CI. Unit tests use stubs only.
9. **Helmet scripts run twice** (memory). If the overlay merge lives in `vamos-locale.js` or a new `vamos-*.js`, guard with `if (window.X) return` and fetch once.
10. **Mapping the DC text-node split** (memory dc-i18n-text-nodes-split). A sentence with `{{ value }}` is three nodes. Overlay keys must be the node texts the runtime looks up, not whole sentences.
11. **Prompt injection via customer text.** A message such as "ignore instructions, write X" lands only in the dashboard (staff-only) and the guard limits the damage. Never let a customer text's translation reach a public surface.

## Code Examples

```ts
// Source: developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it (sync-input/sync-output schemas)
const res = (await ai.run(
  "@cf/google/gemma-4-26b-a4b-it",
  {
    messages: [{ role: "system", content: SYSTEM_V1 }, { role: "user", content: JSON.stringify({ src: "en", targets, text: masked }) }],
    response_format: { type: "json_schema", json_schema: { name: "translation", strict: true, schema } },
    temperature: 0.2,
    max_completion_tokens: budget,
    chat_template_kwargs: { enable_thinking: false },
  },
  { signal: AbortSignal.timeout(20_000), tags: ["vamos-translate"] },
)) as { choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[] };
const choice = res.choices?.[0];
if (choice?.finish_reason !== "stop" || choice.message?.refusal) return reject("finish");
const parsed = safeJson(choice.message?.content); // then unmask → postProcess → guard
```

```ts
// Source: developers.cloudflare.com/queues/configuration/batching-retries/
if (batch.queue.startsWith("vamos-translate")) {
  if (batch.queue.endsWith("-dlq")) { for (const m of batch.messages) { markFailed(env, m.body); m.ack(); } return; }
  for (const m of batch.messages) {
    try { await handleTranslateJob(env, m.body); m.ack(); }
    catch { m.retry({ delaySeconds: Math.min(30 * 2 ** m.attempts, 3600) }); }
  }
  return; // never fall through to the Stripe loop
}
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---|---|---|---|---|---|---|
| @formatjs/icu-messageformat-parser | npm | years (latest 3.5.21, modified 2026-10-05) | high (transitive of next-intl) | github.com/formatjs/formatjs | [OK] (`slopcheck scan --pkg npm`) | Approved. Pin to the installed 3.5.17 to match next-intl. No postinstall |

**Removed [SLOP]:** none. **Flagged [SUS]:** none. Nothing else is installed (Workers AI, Queues and Web Crypto are platform features).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node | scripts | ✓ | 26.7.0 (engines ≥22) | — |
| wrangler | `getPlatformProxy`, queue create | ✓ | 4.124.0 (repo) | — |
| `AI` binding (staging/prod) | all | ✓ declared | — | Rows stay pending, source shown |
| Translate queue + DLQ | E (ii)(iii) | ✗ not created | — | Owner step: `wrangler queues create` (live account) |
| Local Supabase stack | pgTAP | existing lab (`pnpm test:db-lab`) | — | — |
| Wrangler login on the Mac | `i18n:fill`, smoke | not checked (would print the account) | — | Owner runs the fill himself |

## Validation Architecture

| Property | Value |
|---|---|
| Framework | Vitest 4.1.11 (`apps/web/vitest.config.ts`), pgTAP via `pnpm test:db-lab` |
| Quick run | `pnpm --filter web exec vitest run lib/i18n/machine` |
| Full suite | `pnpm gate:local` |

| Behaviour | Type | Command / file |
|---|---|---|
| Mask/unmask round-trip incl. ICU, `$1`, data-tok, refs, flights, CHF, glossary | unit (fast-check property) | `lib/i18n/machine/mask.test.ts` ❌ |
| Guard rejects: lost placeholder, digit change, preamble, ß, wrong script, length, `finish_reason` length | unit | `lib/i18n/machine/guard.test.ts` ❌ |
| Call input carries `enable_thinking:false`, json_schema, model id, timeout | unit with `AiLike` stub | `lib/i18n/machine/translate.test.ts` ❌ |
| Machine never overwrites human; overlay public-only; support translations staff-only | pgTAP | `packages/db/supabase/tests/translations_*.test.sql` ❌ |
| `queue()` routes translate batches, never Stripe | unit | `apps/web/worker-translate-queue.test.ts` ❌ |
| Extras on Gemma keep the staff-wins behaviour | unit | update `lib/ops/extra-label-translate.test.ts` ✅ |
| Overlay merge precedence, legal skip, fetch failure leaves the source | vm-run DC logic test | `lib/i18n/overlay-merge.test.ts` ❌ |
| Fill script skips filled/denylisted/legal/pending keys; writes the manifest | unit on fixtures | `scripts/i18n-fill.test.mjs` ❌ |
| Real model on 5 fixed strings | manual smoke | `pnpm i18n:smoke` (owner-run, billed cents) |
| Dashboard badge, reply flow at 4 widths × 4 languages | browser on the local Worker | per memory browser-run-dc-forms-on-worker |

Wave 0: create the files marked ❌. No framework install.

## Security Domain

| ASVS | Applies | Control |
|---|---|---|
| V4 Access control | yes | Definer RPCs; `staff_translation_set_human` admin-only; support/note translations staff RLS; overlay returns public contexts only |
| V5 Input validation | yes | Length caps (4000), zod on staff routes, output guard, ICU parse |
| V7 Logging | yes | Log reason codes and hashes, never message text |
| V6 Crypto | minimal | SHA-256 via Web Crypto for keys (not security-bearing) |

| Threat | STRIDE | Mitigation |
|---|---|---|
| Prompt injection in customer text | Tampering | Masking + guard; output only to the staff dashboard; text never reaches a public page |
| Neuron burn via public input | DoS | No public endpoint triggers a model call. Only staff saves, inbound mail and booking create enqueue, and those are already rate-limited and Turnstile-gated |
| Private text leak through the cache | Info disclosure | Separate staff-only tables; context filter on the overlay RPC; pgTAP |
| Vendor/model name on public pages | Info disclosure | Model id server-side only. The overlay and pages carry no engine name. The dashboard label is "Machine" / "Auto-translated" with no vendor |

## Privacy (Cloudflare terms)

**Verdict: confirmed. Owner point 4 holds. Customer messages may be translated with no new policy line.** Pages fetched raw by the lead on 2026-10-12 and quoted word for word:

1. Workers AI "Data usage", https://developers.cloudflare.com/workers-ai/platform/privacy/ (page shows "Last updated Apr 21, 2026"):
   - "Cloudflare does not use your Customer Content to (1) train any AI models made available on Workers AI or (2) improve any Cloudflare or third-party services, and would not do so unless we received your explicit consent."
   - "Your Customer Content for Workers AI may be stored by Cloudflare if you specifically use a storage service (e.g., R2, KV, DO, Vectorize, etc.) in conjunction with Workers AI."
   - "Cloudflare does not make your Customer Content available to any other Cloudflare customer."
   - "Your inputs (e.g., text prompts, image submissions, audio files, etc.), outputs (e.g., generated text/images, translations, etc.), embeddings, and training data constitute Customer Content."
2. Service-Specific Terms, Developer Platform, "Cloudflare Workers AI; AI Gateway" section, https://www.cloudflare.com/service-specific-terms-developer-platform/ (page shows "Last updated: September 28, 2026"):
   - "Unless otherwise agreed, Cloudflare does not use any Customer Content to train generative AI tools."
   - Also: "You are solely responsible for all Outputs and Actions and acknowledge and agree that Outputs and Actions may not be accurate, error free, or operate as intended." That is why the guard and "his correction wins" exist.

**Consequences, fixed for the plan:**
- Call the `AI` binding directly. **No AI Gateway.** Per https://developers.cloudflare.com/ai-gateway/observability/logging/, "Logs are enabled by default for each gateway" and a log "can include the prompt, response …". That would be storage.
- Do not put customer text in Queue messages (section E already says this): ids only, text read from the row.
- The cache we keep is our own Supabase (Frankfurt), an existing processor. Cloudflare is already a named subprocessor (ADR-010).
- Not published: where Workers AI inference runs. There is no region pinning for Workers AI. This is the same edge-residency point as ADR-007, not a new question.
- Gemma 4 is open weights run by Cloudflare. The page says "Cloudflare neither creates nor trains the AI models made available on Workers AI" and that models "may be subject to open source or other license terms" (Gemma 4 licence: https://ai.google.dev/gemma/docs/gemma_4_license). Nothing found in it restricts translating customer messages. Google's Prohibited Use policy was not read in full; translation of support mail is not a prohibited category on its face.

## Open Questions (need owner word or lead decision)
1. **Reply path vs G27.** The dashboard Support is read-only and he replies through mailto/Gmail. Option A: a "Translate reply" box that produces the customer-language text and opens his mail draft (mailto/Gmail `body=`) prefilled. This keeps G27. The risk is URL length limits for long replies. Option B: an in-dashboard Send through Resend with threading, storing `outbound_staff`. This re-opens G27. Recommendation: ask him. A matches "his reply sent in the customer's language" with the least new surface.
2. **Next (JSON) pages and his corrections.** `CONTENT_SOURCE` is `json`, so a correction stored in DB reaches DC pages through the overlay but reaches Next pages only after `i18n:pull` + deploy. Either accept that, or let the Next message loader also apply the overlay.
3. **Customer writes in a fifth language** (Italian, Spanish). Should the reply go in that language or in English? Recommendation: translate inbound to English always, reply in the customer's language only within en/de/fr/ar, otherwise English. Confirm.
4. **"Vamos Taxi" in Arabic.** 44 human strings say `فاموس تاكسي`, but the rule says Latin. The machine follows the rule, so the result is mixed. Ask whether to change the human strings (a human edit, not the machine).
5. **Reviews** (customer-written, single language). Are they in scope? Recommendation: show the original (a quote), with no machine translation, unless he says so.
6. **"Live at once" = within about 60 s** of the overlay cache. Acceptable?
7. **Model data terms.** Resolved: confirmed from Cloudflare's own pages (Privacy section).

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A1 | `json_schema strict` is honoured well by Gemma 4 on Workers AI | B, C | More guard rejects. Mitigated by parse + guard |
| A2 | ≈4 English chars/token; Arabic output about 1.5× tokens | F | Cost still far under the free tier |
| A3 | Gemma call latency of a few seconds for under 500 output tokens | E(iv) | 20 s timeout; the reply UX shows "Try again" |
| A4 | Overlay Hyperdrive read latency is fine because it is cached and read once per page | D | Add KV later if measured slow |
| A5 | Gemma's de/fr/ar quality is fit for UI and support text with this prompt | C | His corrections win. The smoke set catches regressions |
| A6 | A 60 s overlay TTL meets "live at once" | D | Shorten the TTL or version-bust |

## Sources
### Primary (HIGH)
- https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/ (+ `sync-input.json`, `sync-output.json`, `batch-input.json`): schema, context, features, examples
- https://developers.cloudflare.com/workers-ai/platform/pricing/ (updated 2026-10-09): neurons, free 10k/day, Gemma 4 and m2m100 rates
- https://developers.cloudflare.com/workers-ai/platform/limits/ (updated 2026-09-17): 300 rpm text generation, local counts
- https://developers.cloudflare.com/workers-ai/features/batch-api/ and `/workers-binding/`: `queueRequest`, 10 MB
- https://developers.cloudflare.com/workers-ai/configuration/bindings/: `env.AI.run`
- https://developers.cloudflare.com/workers/wrangler/configuration/: `ai` block, one per Worker, local charges, non-inheritable keys
- https://developers.cloudflare.com/workers/development-testing/: no local AI simulation, remote billing
- https://developers.cloudflare.com/workers/wrangler/api/: `getPlatformProxy` `environment`, `remoteBindings`
- https://developers.cloudflare.com/queues/configuration/batching-retries/ and https://developers.cloudflare.com/queues/platform/pricing/
- https://developers.cloudflare.com/workers-ai/models/m2m100-1.2b/: `source_lang` defaults to en
- https://developers.cloudflare.com/changelog/post/2026-04-04-gemma-4-26b-a4b-workers-ai/ ; https://developers.cloudflare.com/changelog/product/workers-ai/
- https://opennext.js.org/cloudflare/bindings ; https://opennext.js.org/cloudflare/get-started
- Repo: `apps/web/wrangler.jsonc`, `worker.ts`, `lib/env.d.ts`, `lib/ops/extra-label-translate.ts`, `lib/ops/tickets-*.ts`, migrations listed above, `scripts/check-i18n-coverage.mjs`, workers-types `index.d.ts`

## Metadata
- Standard stack: HIGH. The binding already exists, and the schema was read from live JSON.
- Architecture: MEDIUM-HIGH. It follows existing repo patterns (fx route, Stripe queue, D-44).
- Pitfalls: HIGH for the repo-specific ones (queue fallthrough, thinking default), MEDIUM for model behaviour.
- Valid until: 2026-11-12 (pricing and model catalog change monthly).
