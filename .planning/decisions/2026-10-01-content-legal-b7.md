# Content and legal answers (B7) — owner, 2026-10-01

Koss answered in the project thread "Read loomlyne/vamostaxi.eu and propose next steps",
2026-10-01 11:19 UTC. His words, then what each one means for the build.

> "Okay, for the reviews, we will change it. … For the wait time, let's change it to 30.
> Even in settings, the Cloudflare web analytics switch is off for declarative cookies. Why do
> I need to switch it off? I need the analytics, so let's make it a cookie. Let's add it in the
> cookie. The wording is in French and Arabic. Do that, and do that also in the live footer.
> Why is it not linked anymore? I don't know. Anyway, you figure out the rest."

1. **Published reviews.** The five published reviews still carry placeholder text. The owner
   replaces them himself (dashboard Reviews) or sends the real texts. Never invented.
2. **City waiting time is 30 minutes**, as /terms section 08 and /cancellation already say.
   Live value: dashboard Settings › City waiting included = 30 (the owner's own step; on
   2026-10-01 the newest settings version `fare-publish-18` still holds 15). The seed carries 30.
3. **Cloudflare Web Analytics stays, under the cookie choice.** It is cookieless and listed on
   /cookies section 05 ("Analytics — off until you allow them") and in /privacy as "only with
   your consent", so the copy already matches. The beacon is loaded by our code only after a
   saved Analytics yes. Cloudflare's automatic injection is switched off by the owner first.
4. **The imprint reads in French and Arabic** (it already did, through the dictionary). The
   "This page exists in English and German. The English text is binding." notice goes; it
   was wrong for those readers and contradicted the page's own line "The German version is the
   binding one". Replaces 26.0 D-05.
5. **The footer links the imprint again**, under Legal. It was dropped by the 2026-09-20 footer
   merge (#45, "Explore/Services/Legal"), not by a decision.
6. **"Figure out the rest"**: the /terms section 03 SMS line and the /about fleet text, fixed on
   2026-09-30 in `fe4e37a0` and never shipped, come in with this job. Van luxury 12 passengers /
   9 cases matches the live `vehicle_classes` row (read 2026-10-01).
7. **The imprint's binding text is German** (owner's choice on the decision card, 2026-10-01
   11:43 UTC). The page's own line "The German version is the binding one" stays in all four
   languages; the 26.0 notice wording "The English text is binding" is retired.
