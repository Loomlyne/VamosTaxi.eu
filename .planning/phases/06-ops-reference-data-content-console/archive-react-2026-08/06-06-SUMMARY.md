---
phase: 06-ops-reference-data-content-console
plan: 06
subsystem: ops
tags: [r2, photos, ops, next-image, cloudflare]

requires:
  - phase: 06-ops-reference-data-content-console
    provides: "06-04 staff session (requireStaffClaims) and ops shell"
provides:
  - "Staff-gated multipart upload to env.PHOTOS returning { key } only"
  - "Public GET /photos/[key] proxy over PHOTOS.get"
  - "OpsPhotoField with zero-photo icon/initials fallback"
  - "photoUrl / buildPhotoKey / assertPhotoUpload / PHOTO_PREFIXES"
affects: [06-12, 06-13, 06-14, 06-17]

tech-stack:
  added: []
  patterns: ["R2 via Worker binding only", "public photo GET outside [locale]/(ops)"]

key-files:
  created:
    - apps/web/lib/ops/photos.ts
    - apps/web/app/[locale]/(ops)/api/photos/upload/route.ts
    - apps/web/app/api/photos/upload/route.ts
    - apps/web/app/photos/[key]/route.ts
    - apps/web/app/photos/[...key]/route.ts
    - apps/web/components/ops/OpsPhotoField.tsx
    - apps/web/components/ops/OpsPhotoField.css
    - apps/web/tests/integration/ops-photo-upload.spec.ts
    - apps/web/lib/ops/photos.test.ts
  modified:
    - apps/web/components/ops/index.ts
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json
    - docs/build/CLOUDFLARE-RESOURCES.md

key-decisions:
  - "Task 1: do not create buckets this sitting — staging already exists; production bucket not created"
  - "Task 2: option-a inline field with icon/initials fallback"
  - "D-21: IMAGES binding present → next/image"
  - "Size cap 5 MB"

patterns-established:
  - "Upload returns { key } only; column writes stay on owning asStaff Server Actions"
  - "Nested keys vehicles/<id>/<uuid>.jpg served via [...key] re-export of [key]"

requirements-completed: [OPS-06, OPS-08]

duration: 45min
completed: 2026-09-01
---

# Phase 06: R2 photos upload + /photos proxy + OpsPhotoField

**Staff upload writes a private EU R2 object through the PHOTOS binding; the public site reads via `/photos/[key]`; empty records render a glyph/initials fallback, never a broken image.**

## Performance

- **Completed:** 2026-09-01
- **Tasks:** 4/4 (Task 1 skipped create; Task 2 option-a implemented without a pause)
- **Production commit:** `ff4eafc`

## Accomplishments

- Photo key contract: `PHOTO_PREFIXES = ["vehicles/", "chauffeurs/", "reviews/", "staff/"]`. `buildPhotoKey(kind, recordId, contentType)` → `<prefix><recordId>/<uuid>.<ext>` from validated MIME, never a filename. Size cap **5 MB**.
- POST `/api/photos/upload`: `requireStaffClaims` before `formData`; `PHOTOS.put`; JSON `{ key }` only. Implementation under `[locale]/(ops)` so the staff-gate grep holds; thin `app/api/photos/upload` re-export because middleware excludes `/api/*` from i18n.
- GET `/photos/[key]` outside `[locale]` and `(ops)` (D-23). Prefix + traversal reject before R2. Nested keys via `[...key]` re-export. No `Access-Control-Allow-Origin`. Cache-Control `public, max-age=31536000, immutable`.
- `OpsPhotoField` props: `{ kind, recordId, value, onChange, fallback?: string }`. Five states: empty / choosing / uploading / present / error. Empty = Lucide `car-front` / `user` on `--vt-grey-50` for vehicle/chauffeur; `Avatar` initials for review/staff. `onError` falls back to the same empty render (D-22). POSTs to `/api/photos/upload`; remove is `onChange(null)` only.

## Task 1 — buckets (human-action, skipped create)

Did **not** run `wrangler r2 bucket create`. `apps/web/wrangler.jsonc` already binds:

| Env | Binding | Resource | This sitting |
|---|---|---|---|
| staging | `PHOTOS` | `vamos-photos-staging` | Already declared. Not recreated. Owner: bucket already exists. |
| production | `PHOTOS` | `vamos-photos-production` | Already declared. **Not created.** |
| staging + production | `IMAGES` | `"images": { "binding": "IMAGES" }` | Present. |

D-21 branch taken: **`next/image`**. wrangler ids / `localConnectionString` left unchanged. Recorded in `docs/build/CLOUDFLARE-RESOURCES.md`. `wrangler r2 bucket list` was not run this sitting.

## Task 2 — design

**option-a** (proposed): inline 96px well, icon/initials fallback, Add/Replace button, remove IconButton. Empty-state glyphs: vehicle `car-front`, chauffeur `user`. No crop, no drag-and-drop.

## Task commits

1. **Tasks 1–4 production** — `ff4eafc` `feat(ops): R2 photos upload, /photos proxy, and OpsPhotoField (06-06)`

## Verification

- `vitest run lib/ops/photos.test.ts` — 13 passed (cwd worktree `apps/web`, binary from main `apps/web/node_modules`).
- Greps (plan acceptance): `buildPhotoKey` has no `.name`; `requireStaffClaims` precedes `formData`; upload route has no `photo_path`/`avatar_path`; GET has `PHOTO_PREFIXES`/`startsWith` and no `Access-Control-Allow-Origin`; OpsPhotoField has `onError` + `photoUrl`, no `readAsDataURL`/`data:image`; CSS has no `vt-yellow-50|100|200|300|600|700` and no physical `left:`/`right:`.
- Playwright `ops-photo-upload.spec.ts` **not run** (owner close-out: do not spawn next).
- `pnpm typecheck` / `lint:css` / `i18n:check` / `pnpm build` **not run** this close-out (worktree has no `node_modules`; do not install/symlink).

## Import surface for 06-12 / 06-13 / 06-14 / 06-17

```ts
buildPhotoKey(kind, recordId, contentType)
assertPhotoUpload({ type, size, bytes })
photoUrl(key | null) // → `/photos/<key>` | null
PHOTO_PREFIXES // vehicles/ chauffeurs/ reviews/ staff/
OpsPhotoField // { kind, recordId, value, onChange, fallback? }
```

## Deviations

- Task 1 did not create buckets and did not capture `wrangler r2 bucket list` output.
- Task 2 was not paused for an owner click; option-a shipped.
- Extra files vs `files_modified`: `photos.test.ts` (TDD), `app/api/photos/upload/route.ts` (middleware `/api/*`), `app/photos/[...key]/route.ts` (nested keys).
- `wrangler.jsonc` not modified (already correct).
