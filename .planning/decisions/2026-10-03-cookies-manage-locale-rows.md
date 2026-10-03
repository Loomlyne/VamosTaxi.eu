# 2026-10-03 — vt_manage and NEXT_LOCALE rows on /cookies (owner-approved)

**Decision.** The owner approved both rows through the question form on 2026-10-03, with the answer "Approve both as written". They go in the **Strictly necessary** table of `/cookies`, after `vamos_qs`. Use the wording verbatim; do not reword or add to it.

| Name | Provider | Duration | Source of the duration |
|---|---|---|---|
| `vt_manage` | Vamos Taxi | 30 days | `Max-Age` 30 days, `apps/web/app/api/checkout/intent/route.ts:232` |
| `NEXT_LOCALE` | Vamos Taxi | 1 year | `middleware.ts:630`, `dc-mock-urls.ts:141` |

`vt_manage` purpose:
- **EN** Lets you open and change your booking from this browser without signing in
- **DE** Damit Sie Ihre Buchung in diesem Browser ohne Anmeldung öffnen und ändern können
- **FR** Vous permet d'ouvrir et de modifier votre réservation depuis ce navigateur sans vous connecter
- **AR** يتيح لك فتح حجزك وتعديله من هذا المتصفح دون تسجيل الدخول

`NEXT_LOCALE` purpose:
- **EN** Keeps the site in the language you chose
- **DE** Zeigt die Website in der Sprache, die Sie gewählt haben
- **FR** Affiche le site dans la langue que vous avez choisie
- **AR** يُبقي الموقع باللغة التي اخترتها

Duration words (not part of the approved text, plain unit translations): `1 year` already in the dictionary (1 Jahr / 1 an / سنة واحدة); `30 days` added as 30 Tage / 30 jours / 30 يومًا.

**Where it lives.**
- `app/pages/cookies.dc.html`: the live page (two rows after `vamos_qs`).
- `app/vamos-i18n-dict.js`: the two purposes and `30 days`.
- `apps/web/app/[locale]/cookies/page.tsx` (React twin, reaches no customer): NEXT_LOCALE row now shows the approved purpose and "1 year" instead of a pending slot; `vt_manage` row added. Keys in `apps/web/i18n/messages/*.json`: `cookies.language-cookie-purpose` (text replaced), `cookies.locale-cookie-duration`, `cookies.manage-cookie-purpose`, `cookies.manage-cookie-duration`.
- `packages/db/supabase/seed.sql` regenerated; seed test re-pinned to 2710 keys, 100 no-param-reason.
