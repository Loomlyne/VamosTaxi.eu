# Wording for Google Tag Manager (DRAFT, not adopted)

**Status: DRAFT.** Not adopted by the owner. Drafted by the agent on 2026-10-13 after the owner chose "Add GTM behind consent" (container `GTM-KPKGT4VH`). No lawyer has read it. It is **not on the site**: the code is built and stays off behind `GTM_ON = false` in `app/vamos-google.js` (mirror `GTM_OPEN` in `apps/web/lib/google/flag.ts`, a test pins the two). On adoption the build copies the texts below byte for byte into `app/vamos-meta-texts.js` and `apps/web/i18n/messages/*.json`, adds them to `owner-texts.test.ts`, flips both flags, and `CONSENT_POLICY_VERSION` moves to the ship day (every visitor is asked again). Never reword without his adoption.

## Where Google Tag Manager sits

Under **both** choices: it loads only when the visitor has accepted Analytics **and** Marketing. Analytics alone or Marketing alone never loads it. It does not replace the Google Ads tag (`AW-368142830`) or the GA4 tag (`G-K5MZME44P6`) the site already starts itself; it is an extra container next to them.

## Facts the texts rely on (the build and the owner must make them true)

| Fact | Build must / owner must |
|---|---|
| Nothing is requested from `www.googletagmanager.com` for the container before consent | `app/vamos-google.js` adds `gtm.js?id=GTM-KPKGT4VH` only after `GET /api/consent/state` says Analytics and Marketing are both on (server-decided, same check as GA4 and Ads); built and tested |
| Consent Mode defaults are denied before the container loads | the local `gtag('consent','default', denied)` runs first, then the granted update for the two choices; built and tested |
| No noscript frame | the `<noscript><iframe src=".../ns.html">` snippet Google suggests is never added (it would load with no consent); a test pins it |
| Same pages as GA4 and Ads | the same address list (never a pay link, manage-booking, review, sign-in confirm, reset-password, dashboard or ops); built and tested |
| Withdrawing either choice stops it on that page and it does not come back on that page | a loaded container cannot be unloaded: the loader marks it revoked, sets every consent signal to denied for the rest of that page (so the GA4 and Ads tags on that page stop too), deletes the GA4 and Ads cookies on every domain form, and never adds the container again on that page; the next page load starts only what the remaining choice allows, without Tag Manager; built and tested |
| Google Tag Manager sets no cookie of its own | `gtm.js` sets none; the cookies come from the tags it starts (GA4 `_ga`, `_ga_<id>`; Ads `_gcl_au`, `_gcl_aw`), already listed |
| It "adds no data of its own" | **owner must**: the container in tagmanager.google.com holds only Google tags that obey Consent Mode. Only Google's own tags read Consent Mode; any other tag (a Meta pixel, a heat map, a chat widget, a custom HTML tag) ignores it and would run as soon as the container loads, outside the site's consent logic. Do not add non-Google tags |
| No double counting | **owner must**: no second GA4 configuration tag for `G-K5MZME44P6` and no second Google Ads conversion or remarketing tag for `AW-368142830` in the container; the site already starts both. A duplicate counts every page view and every booking twice |
| No remarketing | **owner must**: no Google Ads remarketing tag in the container while the remarketing wording is not adopted (`ad_personalization` stays denied on the site) |
| Only hosts the policy allows | the site's Content-Security-Policy names Google's script, Ads and GA4 hosts only; a tag that needs any other host is blocked by the browser. Tag Manager's Preview mode (tagassistant.google.com) is not in the policy either; preview runs against a local copy, not the live site |
| A change in the container can make this text untrue | **owner must**: every container change (new tag, new trigger, a published version) is a wording check first |

## 1. Cookie banner: one sentence added after the current banner text (2026-10-09 wording §1, unchanged)

| Language | Text |
|---|---|
| en | If you accept both Analytics and Marketing, Google Tag Manager also loads; it sets no cookie of its own. |
| de | Wenn Sie sowohl Analyse als auch Marketing zustimmen, wird zusätzlich Google Tag Manager geladen; er setzt keine eigenen Cookies. |
| fr | Si vous acceptez à la fois l'analyse et le marketing, Google Tag Manager est aussi chargé ; il ne dépose aucun cookie propre. |
| ar | إذا وافقت على التحليلات والتسويق معًا، يُحمَّل أيضًا Google Tag Manager، ولا يضع ملف تعريف ارتباط خاصًا به. |

## 2. Cookies page: new Google Tag Manager row (Marketing table, after the Google Ads row)

| Language | Text |
|---|---|
| en | **Google Tag Manager** (Google Ireland Ltd). No cookie of its own. Loaded only after you accept both Analytics and Marketing. It starts the Google tags described above, under the choices you made. |
| de | **Google Tag Manager** (Google Ireland Ltd). Kein eigenes Cookie. Wird erst geladen, wenn Sie sowohl Analyse als auch Marketing zustimmen. Er startet die oben beschriebenen Google-Tags gemäss Ihrer Auswahl. |
| fr | **Google Tag Manager** (Google Ireland Ltd). Aucun cookie propre. Chargé uniquement après votre accord pour l'analyse et pour le marketing. Il lance les balises Google décrites ci-dessus, selon vos choix. |
| ar | **Google Tag Manager** (Google Ireland Ltd). لا يضع ملف تعريف ارتباط خاصًا به. لا يُحمَّل إلا بعد موافقتك على التحليلات والتسويق معًا. يُشغّل علامات Google الموضّحة أعلاه وفق اختياراتك. |

## 3. Privacy page: new Google Tag Manager line (after the Google Analytics line)

| Language | Text |
|---|---|
| en | **Google Ireland Ltd. Tag management, only with your consent.** After you accept both Analytics and Marketing, Google Tag Manager loads on this site and starts the Google tags described above, under the choices you made. It adds no data of its own about you, your booking or your messages. Google receives your IP address and browser details when its script loads. Google may process this data outside Switzerland. You can withdraw your consent at any time in Cookie preferences; Google Tag Manager then stops on the page you are on and does not load again until you accept both again. |
| de | **Google Ireland Ltd. Tag-Verwaltung, nur mit Ihrer Einwilligung.** Nach Ihrer Zustimmung zu Analyse und Marketing wird Google Tag Manager auf dieser Website geladen und startet die oben beschriebenen Google-Tags gemäss Ihrer Auswahl. Er fügt keine eigenen Daten über Sie, Ihre Buchung oder Ihre Nachrichten hinzu. Google erhält beim Laden seines Skripts Ihre IP-Adresse und Browserangaben. Google kann diese Daten ausserhalb der Schweiz verarbeiten. Sie können Ihre Einwilligung jederzeit in den Cookie-Einstellungen widerrufen; Google Tag Manager stoppt dann auf der geöffneten Seite und wird erst wieder geladen, wenn Sie beidem erneut zustimmen. |
| fr | **Google Ireland Ltd. Gestion des balises, uniquement avec votre consentement.** Après votre accord pour l'analyse et pour le marketing, Google Tag Manager se charge sur ce site et lance les balises Google décrites ci-dessus, selon vos choix. Il n'ajoute aucune donnée propre sur vous, votre réservation ou vos messages. Google reçoit votre adresse IP et les données de votre navigateur lorsque son script se charge. Google peut traiter ces données hors de Suisse. Vous pouvez retirer votre consentement à tout moment dans les préférences de cookies ; Google Tag Manager s'arrête alors sur la page ouverte et ne se recharge que si vous acceptez à nouveau les deux. |
| ar | **Google Ireland Ltd. إدارة العلامات، بموافقتك فقط.** بعد موافقتك على التحليلات والتسويق معًا، يُحمَّل Google Tag Manager على هذا الموقع ويُشغّل علامات Google الموضّحة أعلاه وفق اختياراتك. لا يضيف أي بيانات خاصة به عنك أو عن حجزك أو رسائلك. تتلقى Google عنوان IP الخاص بك وبيانات متصفحك عند تحميل برنامجها النصي. قد تعالج Google هذه البيانات خارج سويسرا. يمكنك سحب موافقتك في أي وقت من إعدادات ملفات تعريف الارتباط؛ عندها يتوقف Google Tag Manager على الصفحة المفتوحة ولا يُحمَّل مجددًا إلا بعد موافقتك على الأمرين من جديد. |

## 4. Privacy page: processor table row

| Language | Text |
|---|---|
| en | Tag management, only with your consent · Google Tag Manager |
| de | Tag-Verwaltung, nur mit Ihrer Einwilligung · Google Tag Manager |
| fr | Gestion des balises, uniquement avec votre consentement · Google Tag Manager |
| ar | إدارة العلامات، بموافقتك فقط · Google Tag Manager |

Row name: **Google Ireland Ltd** (already listed for Google Ads and Google Analytics; the Tag Manager purpose is added as a third line).

## Still needed from the owner

1. Read, change or adopt this text (one answer: "adopt the GTM wording as written", or the changes).
2. Agree to a consent version bump on the ship day (every visitor is asked again).
3. In tagmanager.google.com, container `GTM-KPKGT4VH`: only Google tags, no second GA4 or Google Ads tag, no remarketing tag, and every published version checked against the facts above.
