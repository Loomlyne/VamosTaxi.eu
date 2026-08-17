# Prompt for a new session — prepare the Claude Code handoff

Copy-paste everything below the line into a fresh chat in this project.

---

Prepare this project for export to Claude Code. Do not redesign anything — the mocks are final visual spec. Do this:

1. **Read first:** `CLAUDE.md`, `docs/GSD-LAUNCH.md` (build plan), `docs/MISSING-FEATURES.md` (gap audit), `github.md`. The app mocks live in `app/home/`, `app/pages/`, `app/ops/`; the bound design system is `_ds/vamos-taxi-design-system-245af154-0455-4c10-af76-5254642c3786/`.

2. **Invoke the "Handoff to Claude Code" skill** and package the **FULL project — every file, no exclusions** (`app/`, `_ds/`, `assets/`, `docs/`, `CLAUDE.md`, `github.md`, root images, archives). Keep the exact folder structure and relative paths — the pages only work with them intact.

3. **Write `HANDOFF-CLAUDE-CODE.md` at the package root** telling Claude Code:
   - Stack is fixed: Next.js 15 App Router + @opennextjs/cloudflare on Workers, Supabase (eu-central) via Hyperdrive (direct connection string), Stripe, Resend, Mapbox — no Vercel. Follow `GSD-LAUNCH.md` phases in order.
   - The `.dc.html` pages RUN as-is: serve the project root with any static server (`npx serve .` or `python3 -m http.server`) and open `app/home/home.dc.html` / `app/ops/ops.dc.html`. Continue iterating on them as plain HTML+JS. For production, rebuild each as a React route per the GSD plan, pixel-faithful, reusing the design-system CSS verbatim.
   - `ds-upgrade/` and `design_handoff_file_architecture/` are historical snapshots — never edit or copy from them; the live pages are only in `app/`.
   - Hard rules from `CLAUDE.md`: no glow, no tinted yellow, `CHF 000` until the price matrix lands, every `data-tok` stays a labelled TBC pill, four languages (en/de/fr/ar, RTL-safe) in the same pass, 1440/1024/768/390 responsive, Lenis scroll.
   - Priority order: Phase 1–3 scaffold + DB, then home + booking flow, then ops console.

4. Zip it and give me the download.
