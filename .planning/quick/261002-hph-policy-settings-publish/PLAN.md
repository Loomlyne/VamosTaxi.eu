---
quick_id: 261002-hph
slug: policy-settings-publish
status: in-progress
owner_decision: .planning/decisions/2026-10-02-policy-values-draft-then-publish.md
branch: fix/policy-settings-publish
migration: 20261007200000
---

# The four policy boxes become real: Save writes a draft, Publish makes it live

## Why

The dashboard Settings page shows four editable boxes — Minimum advance, Free cancellation,
Airport waiting included, City waiting included — whose change handlers are empty functions
and whose values live in a table the settings API never writes. Typing in them does nothing.
Owner decision of 2026-10-02 (see `owner_decision`): make them save as a draft, with a
separate Publish that makes the draft live, mirroring the price book.

Consequence worth naming: live policy row 15 grants city waiting **15 minutes** while
`/terms` §08 promises **30**. This control is how that gets corrected, by him, not by a
migration with a number in it.

## Files this job owns (no other running job touches them)

- `packages/db/supabase/migrations/20261007200000_policy_draft_publish.sql` (new)
- `apps/web/lib/ops/settings.ts`
- `apps/web/app/[locale]/(ops)/api/staff/settings/route.ts`
- `apps/web/app/[locale]/(ops)/api/staff/settings/policy-publish/route.ts` (new)
- `app/ops/OpsSettings.dc.html`
- `app/vamos-i18n-dict.js` (own keys only)
- tests listed per task

## Tasks

### T1 — Migration `20261007200000_policy_draft_publish.sql`

- `public.settings_policy_draft`: singleton (`id smallint primary key default 1 check (id = 1)`),
  four nullable integer columns, `updated_at`, `updated_by uuid`.
- Seeded from the newest effective `settings_versions` row, so the draft opens showing live.
- RLS on; `revoke all from public, anon, authenticated, vamos_edge, vamos_public`;
  `grant select, update on ... to vamos_staff`. No insert, no delete — it is a singleton.
- `public.policy_publish_draft(p_actor uuid)` SECURITY DEFINER, `set search_path = ''`:
  inserts one `settings_versions` row cloning the newest effective row, overriding only the
  four values from the draft, `slug = 'policy-publish-' || <new id>`, `effective_from = now()`,
  `created_by = p_actor`. Returns the new id. Refuses when the draft equals live (nothing to
  publish) and when any of the four is null. `grant execute ... to vamos_staff`.
- Bounds as column CHECKs so a bad number is 23514, not a silent write:
  min advance 0–10080 min, free cancel 0–720 h, airport waiting 0–1440 min, city waiting 0–1440 min.

### T2 — `settings.ts`: draft type, loader, validation

- Replace the D-27 header with a pointer to the new decision; keep the "everything else on
  that row is still migration-only" half of it.
- `PolicyDraftRow` / `PolicyDraftInput`, `loadPolicyDraft`, `assertPolicyDraftInput`
  (integers only, the bounds above, each failure a `SettingsInputError` with a copy id).
- `policyDraftDiffers(draft, live)` → the Publish button's enabled state and the change list.

### T3 — Routes

- GET `/api/staff/settings`: add `policyDraft`, keep the live values, add `policyDirty`.
- PATCH: parse and write the four draft values alongside the existing `settings` update,
  in the same `asStaff` transaction. Draft only — never `settings_versions`.
- POST `/api/staff/settings/policy-publish`: `withAdmin`, calls `policy_publish_draft`,
  returns the new live values. Maps 23514 / 23001 / 42501 through `mapSqlState`.

### T4 — `OpsSettings.dc.html`

- Real handlers for the four boxes, bound to draft state.
- Each box shows the live value under it when the draft differs ("Live: 15 minutes").
- A Publish button on the policy card, disabled until the draft differs, with a change list
  ("City waiting included: 15 → 30 minutes") and a confirm.
- Hover/press/focus per the four platform laws: no glow, no tinted yellow.
- Mirror the file to `apps/web/public/app/ops/` via `node scripts/sync-dc-mock-to-public.mjs`.

### T5 — Four languages

- Every new string in the page's own `t` blocks for en, de, fr, ar (Swiss German, "ss").
- Any string the runtime translates goes in `app/vamos-i18n-dict.js` under this job's keys only.
- Check the card in German at 1080 px and in Arabic with `dir="rtl"`; numbers get `.vt-dir-keep`.

### T6 — Tests

- `apps/web/lib/ops/settings.test.ts`: validation bounds, diff helper.
- Route tests: PATCH writes the draft and not `settings_versions`; publish is admin-only;
  publish with no change is refused.
- A DB test proving `settings_versions` is still append-only after this migration (UPDATE → 23001).
- `apps/web/tests/integration/ops-dc-settings.spec.ts`: type 30, Save, Publish, read it back.

### T7 — Gates and hand-over

- Touched-area tests first, then the full gate set once.
- `pnpm exec supabase` (2.115.0) then `db:types:check`.
- Re-pin `seed_idempotent.test.sql` only if the seed changed (it should not).
- HANDOVER.md for the control session: what to apply, in what order, what to read back.

## Not in this job

- The legal copy. `/terms` §08 is owner-approved and frozen; the database moves to it, not the
  other way round.
- The other `settings_versions` columns (cancellation tiers, night window, policy doc, service
  area) stay migration-only.
- The label accretion seen on live (`"… draft draft draft draft"` grows by one word per price-book
  publish) — real, but it belongs to the price-book publish route. Noted for the controller.
- `payment_method_type` is never written for a class-change difference payment
  (`20261007140000_class_change_reprice.sql:1148`), so VT-26-0750's difference shows no method.
  Separate job, noted for the controller.
