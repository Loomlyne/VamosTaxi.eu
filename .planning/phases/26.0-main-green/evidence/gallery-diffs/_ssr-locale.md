### ssr-locale (component-1440, `--retries=0`, serial lifted locally so all ran)

1 passed (sitemap has no dev route), 6 failed, 21 skipped (other projects). No screenshots.

Stale spec, owner to rule. Unmarked, unfixed. All six failing tests fetch the home (`/`, `/de`, `/fr`, `/ar`) and expect the React home's server-rendered `<html lang dir>`, translated title and hreflang alternates. The raw response is now the DC mock home (`<html>` with no lang or dir, `<base href="/app/home/">`), so those assertions describe a page that no longer exists.
