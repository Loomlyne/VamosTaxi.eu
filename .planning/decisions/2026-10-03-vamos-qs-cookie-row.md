# 2026-10-03 — vamos_qs row on /cookies (owner-approved)

**Decision.** The owner approved this row through the question form on 2026-10-03, with the answer "Approve as written". It was relayed by the control session. It goes in the **Strictly necessary** table of `/cookies`, after `cf_clearance`. Use the wording verbatim; do not reword or add to it.

| Field | Value |
|---|---|
| Name | `vamos_qs` |
| Provider | Vamos Taxi |
| Duration | 24 hours (`Max-Age=86400`, `lib/abuse/vamos-qs.ts`) |

Purpose:
- **EN** Keeps price requests fair between visitors and blocks automated abuse
- **DE** Verteilt Preisanfragen fair auf die Besucher und blockiert automatisierten Missbrauch
- **FR** Répartit équitablement les demandes de prix entre les visiteurs et bloque les abus automatisés
- **AR** يوزّع طلبات الأسعار بإنصاف بين الزوار ويمنع الاستخدام الآلي المسيء

Duration: **DE** 24 Stunden · **FR** 24 heures · **AR** 24 ساعة.

**Why.** `vamos_qs` is the signed visitor cookie that the middleware sets on home and `/checkout` once `VAMOS_QS_SECRET` exists (quick 261003 quote guards live, decision B). It is a strictly necessary security cookie (rate limiting and bot defence), so it needs no consent, but it must be listed.

**Where it lives.**
- `app/pages/cookies.dc.html`: the live page.
- `app/vamos-i18n-dict.js`: its strings.
- `apps/web/app/[locale]/cookies/page.tsx` with `apps/web/i18n/messages/*.json` keys `cookies.qs-cookie-purpose` and `cookies.qs-cookie-duration`: the React twin, which reaches no customer today.
- `packages/db/supabase/seed.sql`: regenerated from those keys.
