# DRAFT for the owner: wording for Google remarketing (2026-10-11)

**Status: DRAFT, not adopted.** Owner's Ship 2026-10-13 (question form): remarketing is OFF in code (`ad_personalization: denied` on Accept, PR #77) until he adopts this draft; WR-02 is closed by that, and WR-07 (doubleclick in CSP `frame-src`) stays out unless this draft is adopted. Written by the agent at his request: question form, 2026-10-11, "Yes, allow remarketing" (Accept also lets Google use the visit to show Vamos adverts again to past visitors). No lawyer has read it. Nothing here is on the site.

Each change below adds to a text he adopted on 2026-10-09 (`2026-10-09-ad-tracking-wording.md`). Everything not quoted here stays word for word. When he adopts this draft, the build copies each new sentence byte for byte into `app/vamos-meta-texts.js` and `apps/web/i18n/messages/*.json`, and extends `owner-texts.test.ts`. `CONSENT_POLICY_VERSION` moves to the ship day, so every visitor is asked again. If GA4 ships in the same release, one version bump covers both.

## Why the text must change

The live code already sends `ad_personalization: granted` on Accept (review finding WR-02). The adopted texts only say "measure adverts", so the live behaviour goes beyond the words. There are two ways to make the code and the words match again: adopt this draft, or switch remarketing off in code. Until he adopts this, the agent recommends shipping `ad_personalization: denied`.

## Facts the texts rely on (the build must make them true)

| Fact | Build must |
|---|---|
| Accept grants `ad_personalization` and `ad_user_data` for Google, and only on Accept | the same as today; withdraw denies them again |
| Google may set its own cookies on its own domains (doubleclick.net, google.com) for remarketing; we set nothing new on vamostaxi.site | CSP `frame-src` gains `https://td.doubleclick.net` and `https://bid.g.doubleclick.net`; the intercepted cookie list for vamostaxi.site is unchanged |
| No audience is built from name, email or phone | no Enhanced Conversions and no customer list upload |

## 1. Cookie banner: one sentence changes

Old (adopted): "…so we can see which adverts work."
New:

| Language | Text |
|---|---|
| en | …so we can see which adverts work, and Google may show our adverts again to people who visited. |
| de | …damit wir sehen, welche Anzeigen wirken, und Google darf unsere Anzeigen Personen, die die Website besucht haben, erneut zeigen. |
| fr | …afin que nous sachions quelles annonces fonctionnent, et Google peut montrer à nouveau nos annonces aux personnes qui ont visité le site. |
| ar | …لنعرف أي الإعلانات تنجح، ويجوز لـ Google عرض إعلاناتنا مرة أخرى على من زاروا الموقع. |

## 2. Cookies page, Google row: a sentence is added after "…to measure adverts."

| Language | Text |
|---|---|
| en | Google may also use its own cookies, on its own domains, to show our adverts again to people who visited this site. |
| de | Google kann zudem eigene Cookies auf eigenen Domains verwenden, um unsere Anzeigen Personen, die diese Website besucht haben, erneut zu zeigen. |
| fr | Google peut aussi utiliser ses propres cookies, sur ses propres domaines, pour montrer à nouveau nos annonces aux personnes qui ont visité ce site. |
| ar | ويجوز لـ Google أيضًا استخدام ملفات تعريف الارتباط الخاصة بها، على نطاقاتها الخاصة، لعرض إعلاناتنا مرة أخرى على من زاروا هذا الموقع. |

## 3. Privacy page, Google line: the title changes and a sentence is added

Title, old: "Advert measurement, only with your consent." New:

| Language | Text |
|---|---|
| en | **Google Ireland Ltd. Advert measurement and remarketing, only with your consent.** |
| de | **Google Ireland Ltd. Anzeigenmessung und Remarketing, nur mit Ihrer Einwilligung.** |
| fr | **Google Ireland Ltd. Mesure publicitaire et remarketing, uniquement avec votre consentement.** |
| ar | **Google Ireland Ltd. قياس الإعلانات وإعادة الاستهداف، بموافقتك فقط.** |

Added after "…the advert click code those cookies hold.":

| Language | Text |
|---|---|
| en | Google may also use your visit to show you our adverts again on other sites and apps. We do not give Google a list of customers. |
| de | Google kann Ihren Besuch zudem nutzen, um Ihnen unsere Anzeigen auf anderen Websites und in Apps erneut zu zeigen. Wir geben Google keine Kundenliste. |
| fr | Google peut aussi utiliser votre visite pour vous montrer à nouveau nos annonces sur d'autres sites et applications. Nous ne transmettons pas de liste de clients à Google. |
| ar | ويجوز لـ Google أيضًا استخدام زيارتك لعرض إعلاناتنا عليك مرة أخرى في مواقع وتطبيقات أخرى. لا نعطي Google قائمة بالعملاء. |

## 4. Privacy page, processor row (Google)

| Language | Text |
|---|---|
| en | Advert measurement and remarketing, only with your consent · Google Ads |
| de | Anzeigenmessung und Remarketing, nur mit Ihrer Einwilligung · Google Ads |
| fr | Mesure publicitaire et remarketing, uniquement avec votre consentement · Google Ads |
| ar | قياس الإعلانات وإعادة الاستهداف، بموافقتك فقط · Google Ads |

## Not in this draft, on purpose

The review's WR-01 says Meta wants the visitor's IP address and browser details in each server message. The adopted Meta line lists what we send, and those two are not on it. Adding them would mean new words, and for Purchase also storing them with the booking. That waits for proof: the owner's test-code run shows whether Meta actually refuses the events. Only if it does will the agent draft that change.

## Still needed from the owner

1. Read sections 1 to 4. Arabic and French are best read by someone he trusts.
2. Adopt the text (all of it, or with edits he names) through the question form, and agree to the consent version bump (shared with GA4 if they ship together).
3. In Google Ads → Audience manager, turn on the website visitors list for tag AW-368142830. That is his account setting; the agent does not touch it.
