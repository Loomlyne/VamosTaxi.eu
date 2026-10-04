# 2026-10-04 — /cookies row for vt_review (owner-approved)

**Decision.** The owner approved this row through the question form on 2026-10-04 16:38 +04, answer "Approve as drafted" (asked by the controller). Strictly necessary table of `/cookies`, same style as the other rows. Use verbatim; do not reword or add to it.


Reviewer F1 moved the review link's token into a new strictly necessary cookie `vt_review` (HttpOnly,
Path=/review, 30 days). /cookies must name it before it ships live, in the same style as the other rows.

| Column | en (draft) | de | fr | ar |
|---|---|---|---|---|
| Name (plain) | Review access | Zugang zur Bewertung | Accès à l’avis | الوصول إلى التقييم |
| Name (technical) | vt_review | vt_review | vt_review | vt_review |
| Purpose | Lets you open the review form from the link in your e-mail without signing in | Damit Sie das Bewertungsformular über den Link in Ihrer E-Mail ohne Anmeldung öffnen können | Vous permet d’ouvrir le formulaire d’avis depuis le lien de votre e-mail sans vous connecter | يتيح لك فتح نموذج التقييم من الرابط في بريدك الإلكتروني دون تسجيل الدخول |
| Provider | Vamos Taxi | Vamos Taxi | Vamos Taxi | Vamos Taxi |
| Duration | 30 days | 30 Tage | 30 jours | 30 يومًا |


**Why.** The review link token moved into the strictly necessary cookie `vt_review` (HttpOnly, Path=/review, 30 days) on `fix/hide-internal-ids`; the cookie notice must name it before it ships.
