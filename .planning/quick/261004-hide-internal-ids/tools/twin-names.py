# One-off: plain cookie names in the React twin + messages (2026-10-04). Run from the repo root.
import json

T = {
    "en": ["Sign-in", "Your cookie choice", "Booking access", "Language", "Fair pricing"],
    "de": ["Anmeldung", "Ihre Cookie-Wahl", "Zugang zur Buchung", "Sprache", "Faire Preise"],
    "fr": ["Connexion au compte", "Votre choix de cookies", "Accès à la réservation", "Langue", "Tarifs équitables"],
    "ar": ["جلسة تسجيل الدخول", "اختيارك لملفات تعريف الارتباط", "الوصول إلى الحجز", "اللغة", "تسعير عادل"],
}
keys = ["name-sign-in", "name-cookie-choice", "name-booking-access", "name-language", "name-fair-pricing"]
for lang, vals in T.items():
    p = f"apps/web/i18n/messages/{lang}.json"
    s = open(p).read()
    lines = [x for x in s.split("\n") if x.strip().startswith('"manage-cookie-duration"')]
    assert len(lines) == 1, (p, len(lines))
    ins = "\n".join(f'    "{k}": {json.dumps(v, ensure_ascii=False)},' for k, v in zip(keys, vals))
    s = s.replace(lines[0], lines[0] + "\n" + ins, 1)
    json.loads(s)
    open(p, "w").write(s)

p = "apps/web/app/[locale]/cookies/page.tsx"
s = open(p).read()
pairs = [
    ("<span data-vt-no-i18n>NEXT_LOCALE</span>", "name-language", "NEXT_LOCALE"),
    ("<span data-vt-no-i18n>sb-…-auth-token</span>", "name-sign-in", "sb-…-auth-token"),
    ("<span data-vt-no-i18n>consent_subject · vamosCookieConsent</span>", "name-cookie-choice", "consent_subject · vamosCookieConsent"),
    ("<span data-vt-no-i18n>vamos_qs</span>", "name-fair-pricing", "vamos_qs"),
    ("<span data-vt-no-i18n>vt_manage</span>", "name-booking-access", "vt_manage"),
]
for old, k, tech in pairs:
    assert s.count(old) == 1, old
    s = s.replace(old, f'<CookieName plain={{tCookies("{k}")}} tech="{tech}" />')
helper = '''
/** A cookie row's name: the plain name first, the technical name small underneath (owner, 2026-10-04). */
function CookieName({ plain, tech }: { plain: string; tech: string }) {
  return (
    <span style={{ display: "block", minWidth: 0 }}>
      <span style={{ display: "block", fontWeight: "var(--vt-weight-semibold)" }}>{plain}</span>
      <span
        data-vt-no-i18n
        className="vt-dir-keep"
        style={{
          display: "block",
          marginBlockStart: "2px",
          fontFamily: "var(--vt-font-mono)",
          fontSize: "var(--vt-body-xs)",
          color: "var(--vt-text-muted)",
          overflowWrap: "anywhere",
        }}
      >
        {tech}
      </span>
    </span>
  );
}
'''
s = s.rstrip() + "\n" + helper
open(p, "w").write(s)
print("ok")
