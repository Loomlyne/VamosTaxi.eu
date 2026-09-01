# Content strings — runtime dictionary and reconciliation

Operational notes for `content_strings`. Host: `dashboard.vamostaxi.site`. No CHF
values live in this table's seed; do not invent any here.

## Editor

The editor is the DC mock `OpsContent` on `dashboard.vamostaxi.site`, hash-routed
as `#pages` (string rows) and `#legal` (legal coverage). Those hashes are the
product. There is no Next `/ops/content` page.

Staff writes go through `PATCH /api/staff/content/:key` (language values) and
`PATCH /api/staff/content/:key/flags` (three independent `$meta` flags). The
public site does **not** read those writes until `CONTENT_SOURCE=db`.

## Which direction is authoritative

The JSON files (`apps/web/i18n/messages/{en,de,fr,ar}.json`) are the **build-time**
authority. `pnpm i18n:check` reads them and blocks a PR on a missing key.

The database table `public.content_strings` is the **runtime** source once
`CONTENT_SOURCE` is `db`. Until that env is flipped, the loader serves the JSON
import. Code default is `json`. Do not set `CONTENT_SOURCE=db` on
`vamos-web-staging` until the owner says so.

Neither is authoritative for both. Editing JSON without regenerating the seed
leaves the table behind. Editing `#pages` / `#legal` without `pnpm i18n:pull`
leaves the repository behind.

## The release-order rule

`pnpm db:push` runs `supabase db push --include-seed`. The seed's
`on conflict (key) do update set` (packages/db/supabase/seed.sql:2511) overwrites
every column of every matching row.

On any environment where `#pages` / `#legal` has been used, **run `pnpm i18n:pull`
and commit the result before `pnpm db:push`**, or the push reverts the console's
edits.

06-10's hazard paragraph, verbatim:

> Seed `on conflict (key) do update` still overwrites console edits on `db:push` / `db:reset`. Coverage view always shows the seed-overwrite notice. Residual-row count after a live seed was **not measured here** (executor must not start Docker/Supabase). Predicate as shipped: rows whose EN still equals the dictionary after a seed-overwrite, with `updated_by` reset.

JSON → SQL: `pnpm db:seed:gen` (then `pnpm db:seed:check`).
SQL → JSON: `pnpm i18n:pull` (then `pnpm i18n:pull --check` in CI).

## The rollback

Three levels, escalating cost.

1. Set `CONTENT_SOURCE=json`. No deploy. Takes effect on the next request. The
   site serves the repository dictionary.
2. If the environment variable cannot be reached, the runtime fallback already
   covers a failed or empty query. Search Logpush for
   `scope=i18n event=content_strings_fallback` (`type=content_strings_fallback`,
   `cause=query_failed` or `cause=empty_result`).
3. If the swap itself must be reverted in code, `loadRawMessages` in
   `apps/web/i18n/request.ts` is one function. Its pre-swap body is
   `(await import(\`./messages/${locale}.json\`)).default`.

## How to tell it is working

```bash
pnpm --filter web exec playwright test tests/integration/content-loader-parity.spec.ts --project=component-1440
pnpm db:seed:check
pnpm i18n:pull --check
pnpm i18n:check
```

The parity spec compares the DB-derived message object to the JSON-derived one
for en, de, fr and ar. A mismatch names the offending keys.

`CONTENT_SOURCE` defaults to `json`. Flip it to `db` only in an environment
where that spec has passed against that environment's `content_strings`.

The cacheable `HYPERDRIVE` binding (`vamos-public-staging`, id
`b53693800b7e4c1c94205774baa73420`) is the public read path. Caching is enabled
on that config (plan 03-07). The hosted cache window (TTL) is unmeasured — do
not assume one. Plan 03-07 is what made the config id real; measuring the window
is still outstanding.
