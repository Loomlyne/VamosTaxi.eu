# Owner decisions: account notice on /checkout (Phase 26.5)

Given by the owner through the question form in the control session, 2026-09-29 23:58 (+04).
The wording below was drafted by the control session at his request and **approved by him as
written**. It points to the existing Terms and Privacy pages and promises nothing new. It has
not been read by a lawyer.

## Decisions

| # | Decision |
|---|---|
| 1 | The Supabase service-role key goes on Worker `vamos`. He adds it himself in his terminal, at the 26.5 ship, as `SUPABASE_SERVICE_ROLE_KEY`. Done 2026-09-29 23:56: he added it; the control session read the name on the Worker, never the value. Worker version `df365445`, same code as `80d51730`. |
| 2 | The two notice texts below are approved in four languages. |
| 3 | "Create an account" needs a tick box. The button works only when it is ticked. The tick is logged server-side. |
| 4 | With the texts approved, "Create an account" goes live with 26.5 and consent is recorded from the first account. This replaces 26.5 D-10 (no consent recorded while the notice is TBC). |

## Text 1: Create an account (tick box label)

| Language | Text |
|---|---|
| en | By creating an account you accept our Terms and confirm you have read our Privacy notice. |
| de | Mit dem Erstellen eines Kontos akzeptieren Sie unsere AGB und bestätigen, dass Sie unsere Datenschutzerklärung gelesen haben. |
| fr | En créant un compte, vous acceptez nos conditions générales et confirmez avoir lu notre déclaration de confidentialité. |
| ar | بإنشاء حساب، فإنك توافق على الشروط والأحكام وتؤكد أنك قرأت إشعار الخصوصية. |

"Terms" and "Privacy notice" link to the existing pages.

## Text 2: Continue as guest

| Language | Text |
|---|---|
| en | We create an account for this email so you can see your booking later. No password needed. We send you a link to sign in. |
| de | Wir erstellen für diese E-Mail-Adresse ein Konto, damit Sie Ihre Buchung später sehen können. Kein Passwort nötig. Wir senden Ihnen einen Link zum Anmelden. |
| fr | Nous créons un compte pour cette adresse e-mail afin que vous puissiez consulter votre réservation plus tard. Aucun mot de passe requis. Nous vous envoyons un lien pour vous connecter. |
| ar | ننشئ حسابًا لهذا البريد الإلكتروني لتتمكن من عرض حجزك لاحقًا. لا حاجة إلى كلمة مرور. نرسل إليك رابطًا لتسجيل الدخول. |

## Not checked

- Whether the Privacy page already covers customer accounts.
- Whether the guest path (an account made without a tick) needs its own consent record. Text 2
  informs; it does not ask. The 26.5 session puts this to the owner before the build.
