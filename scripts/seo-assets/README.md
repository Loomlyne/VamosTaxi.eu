# Tab icon and share picture

Generated once, files committed to `apps/web/public/`. No runtime dependency and no CDN.
To rebuild, copy this folder to a scratch folder (nothing is added to the repo's package.json):

    npm init -y && npm i favicons@7.3.1 sharp      # favicons: MIT (itgalaxy/favicons)
    node generate-favicons.mjs                      # writes ./out, copy the files named below
    REPO=<path to the repo> node generate-og-image.mjs   # writes apps/web/public/og-image.jpg

Copied from `out/`: `favicon.ico`, `apple-touch-icon-180x180.png` → `apple-touch-icon.png`,
`android-chrome-192x192.png` → `icon-192.png`, `android-chrome-512x512.png` → `icon-512.png`,
`android-chrome-maskable-512x512.png` → `icon-maskable-512.png`; `icon.svg` is the source here.

Colours are the brand yellow `#FDC20B` and charcoal `#1E1F1F` only. The mark is yellow on a charcoal
square so it reads on a light and on a dark tab; the maskable file keeps the mark inside the safe zone.
The repo's `assets/logo/favicon.svg` uses `#FFC306` and `#1E1E1E`, so it is not used directly.
