# Decision: dashboard notice tone and the distance-chip icon

Owner, 2026-10-04 18:40 +0400.

1. "do the toast icon job too in parallel" (chat), after he was offered: the class-change and Accept notices show a
   green check next to every error; errors get a red warning sign like the refund box. Success notices keep the check.
2. Distance chip ("240 km", `app/ops/OpsDetail.dc.html:178`, `Icon name="route"`): question form, answer
   "Download Lucide route (Recommended)". The controller downloaded `icons/route.svg` from
   github.com/lucide-icons/lucide (main, 344 bytes, sha256 fc169fd3…, ISC) and the job vendors the same geometry in
   the format of the other 72 icons as `assets/icons/route.svg`.

Options he was shown for the icon: download Lucide route (chosen), reuse map-pin, reuse navigation, no icon.
Job: `fix/ops-toast-tone` (quick 261004-ops-toast-tone).
